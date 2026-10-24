'use strict';
// Bloc 8 : ouverture du portail public.
//  1. Inscription des écoles : formulaire public /inscrire-ecole (FR) et /ht/inscrire-ecole (HT), e-mail vérifié par
//     code à usage unique, limite de débit, champ piège anti-robot ; la demande (table school_request) est examinée
//     par le super-admin (onglet « Demandes » de #admin) : acceptée → l'école est créée et la direction invitée par
//     e-mail ; refusée → motif envoyé au demandeur.
//  2. Invitation de la direction d'une école depuis #admin (même jeton « invitation » que les invitations internes).
//  3. Comptes grand public (rôle « public », sans école) : /compte, connexion sans mot de passe par code ; abonnements
//     annonces / événements / lauréats, filtre par département ; envoi groupé aux abonnés à la publication, avec lien
//     de désinscription signé (HMAC) en un clic ; flux RSS /annonces.rss sans compte.
// Pages rendues par le serveur, formulaires HTML classiques (aucun script nécessaire, CSP du portail inchangée).
// Cookie posé SEULEMENT après connexion à « Mon compte » : noria_public, HttpOnly, SameSite=Lax, Secure en production.
const crypto = require('node:crypto');
const auth = require('./auth');
const otp = require('./otp');
const Pt = require('./portail');
const { HttpError } = require('./common');
const Up = require('./televersement');

const COOKIE = 'noria_public';
// Témoin lisible par le script du portail (aucune valeur secrète : « 1 ») : les pages publiques mises en cache affichent
// « Mon compte » et « Se déconnecter » sans lire la session. La session reste dans le cookie HttpOnly ci-dessus.
const MARK = 'noria_pub_in';
const SESSION_DAYS = 30;
const CODE_MIN = 10;
const DEPS = Pt.DEPARTMENTS;
const SUBS = ['annonces', 'evenements', 'actualites', 'laureats'];
const DOC_KINDS = ['autorisation_menfp', 'licence', 'patente', 'autre'];
const KIND_SUB = { annonce: 'annonces', evenement: 'evenements', laureat: 'laureats', article: 'actualites', temoignage: 'actualites' };
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,59}$/;
const MAX_FOLLOW = 50;
const BATCH = 50;
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const EMAIL_RE = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[a-z]{2,24}$/i;

function normalizePhone(v) {
  const s = String(v || '').replace(/[\s.\-()]/g, '');
  if (/^\d{8}$/.test(s)) return `+509${s}`;
  return /^\+?\d{9,15}$/.test(s) ? s.replace(/^(?!\+)/, '+') : null;
}
const str = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
function slugify(name) {
  const s = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');
  return s.length >= 3 ? s : `ecole-${s || crypto.randomBytes(2).toString('hex')}`;
}

/* ---------- Textes ---------- */
const X = {
  fr: {
    register: 'Inscrire mon école', account: 'Mon compte',
    regTitle: 'Inscrire mon école sur NORIA',
    regIntro: 'Remplissez ce formulaire : nous vérifions votre adresse e-mail par un code, puis l’équipe NORIA examine la demande. Si elle est acceptée, la direction reçoit par e-mail une invitation pour ouvrir l’espace de l’école.',
    schoolName: 'Nom de l’école', department: 'Département', choose: 'Choisir…', commune: 'Commune', director: 'Nom du directeur ou de la directrice',
    email: 'Adresse e-mail', phone: 'Téléphone (facultatif)', students: 'Nombre approximatif d’élèves', message: 'Message (facultatif)',
    hp: 'Ne pas remplir ce champ', send: 'Recevoir le code de vérification', required: 'obligatoire',
    codeTitle: 'Vérifiez votre adresse e-mail', codeSent: (e, m) => `Un code à 6 chiffres vient d’être envoyé à ${e}. Il est valable ${m} minutes.`,
    code: 'Code à 6 chiffres', verify: 'Valider', badCode: 'Code invalide ou expiré. Recommencez si besoin.',
    regDone: 'Demande enregistrée', regDoneText: 'Merci ! Votre demande a bien été reçue. L’équipe NORIA vous répondra par e-mail, en général sous quelques jours ouvrables.',
    tooMany: 'Trop de demandes depuis cette connexion. Réessayez dans une heure.', fix: 'Vérifiez les champs signalés :',
    errName: 'nom de l’école (2 à 120 caractères)', errDep: 'département', errCommune: 'commune (2 à 80 caractères)', errDirector: 'nom du directeur (2 à 80 caractères)',
    errEmail: 'adresse e-mail valide', errPhone: 'téléphone valide', errStudents: 'nombre d’élèves (0 à 100 000)',
    restart: 'Recommencer',
    docTitle: 'Document officiel de l’école', docKind: 'Type de document',
    docKinds: { autorisation_menfp: 'Autorisation de fonctionnement du MENFP', licence: 'Licence ou agrément MENFP', patente: 'Patente (DGI)', autre: 'Autre document officiel' },
    docFile: 'Fichier (PDF, JPG ou PNG, 5 Mo au plus)', docHelp: 'Obligatoire. Une photo nette ou un scan suffit. Le document n’est visible que par l’équipe NORIA, pour vérifier l’école ; il n’est jamais publié.',
    errDoc: 'document officiel (PDF, JPG ou PNG)', errDocKind: 'type de document', errDocSize: 'document officiel : 5 Mo au plus', errDocType: 'document officiel : seuls les fichiers PDF, JPG et PNG sont acceptés',
    docAgain: 'Pour votre sécurité, le fichier n’est pas conservé quand le formulaire contient une erreur : choisissez-le de nouveau.',
    accTitle: 'Mon compte NORIA', accIntro: 'Un compte gratuit, sans mot de passe, pour recevoir par e-mail les nouvelles annonces, les événements et les lauréats. Le portail reste consultable sans compte.',
    ident: 'E-mail (ou téléphone)', identHelp: 'Nous envoyons un code de connexion. Par téléphone, l’envoi par SMS n’est pas encore actif.',
    getCode: 'Recevoir un code', codeSentAcc: (m) => `Si l’adresse est valide, un code à 6 chiffres vient d’être envoyé. Il est valable ${m} minutes.`,
    smsNote: 'Envoi par SMS pas encore disponible : utilisez de préférence une adresse e-mail.',
    signedAs: (w) => `Connecté : ${w}`, subsTitle: 'Mes abonnements', subs: { annonces: 'Nouvelles annonces', evenements: 'Nouveaux événements', actualites: 'Actualités des écoles', laureats: 'Nouveaux lauréats' },
    depFilter: 'Seulement pour le département', allDeps: 'Tous les départements', langPref: 'Langue des e-mails', save: 'Enregistrer', saved: 'Préférences enregistrées.',
    logout: 'Se déconnecter', del: 'Supprimer mon compte', delHelp: 'Le compte, les abonnements et les sessions sont effacés immédiatement.', delConfirm: 'Je confirme la suppression',
    deleted: 'Votre compte a été supprimé.', noEmailSubs: 'Les envois se font par e-mail : ajoutez une adresse e-mail en vous connectant avec elle.',
    unsubTitle: 'Désinscription', unsubDone: 'C’est fait : vous ne recevrez plus ces e-mails.', unsubBad: 'Lien de désinscription invalide.',
    privacy: 'Données conservées : votre adresse et vos préférences, rien d’autre. Aucun traceur.',
    boxTitle: 'Vous dirigez une école ?', boxText: 'Inscrivez votre école sur NORIA : élèves, notes, présences et échanges avec les familles, en français et en kreyòl.',
    signup: 'S’inscrire', login: 'Se connecter',
    signupTitle: 'Créer mon compte NORIA', signupIntro: 'Gratuit et sans mot de passe : suivez les annonces, les événements et les actualités des écoles, et recevez-les par e-mail. Un code de vérification vous est envoyé.',
    signupSubs: 'Je veux suivre', loginTitle: 'Se connecter à mon compte', loginIntro: 'Saisissez l’adresse e-mail de votre compte : nous vous envoyons un code de connexion (aucun mot de passe).',
    noAccount: 'Pas encore de compte ?', haveAccount: 'Déjà un compte ?',
    followTitle: 'Écoles suivies', followNone: 'Vous ne suivez aucune école pour le moment.', followFind: 'Trouver des écoles à suivre',
    follow: 'Suivre cette école', unfollow: 'Ne plus suivre', followed: (n) => `Vous suivez désormais ${n}.`, unfollowed: (n) => `Vous ne suivez plus ${n}.`,
    followLogin: (n) => `Connectez-vous ou créez un compte pour suivre ${n}.`, followMax: `Vous suivez déjà ${MAX_FOLLOW} écoles : retirez-en une avant d’en ajouter.`,
    followHelp: 'Vous recevez par e-mail les nouveautés des écoles suivies (en plus de vos abonnements).',
    feedTitle: 'Dernières nouvelles de mes écoles', feedNone: 'Rien de nouveau pour vos écoles suivies.',
  },
  ht: {
    register: 'Enskri lekòl mwen', account: 'Kont mwen',
    regTitle: 'Enskri lekòl mwen sou NORIA',
    regIntro: 'Ranpli fòmilè sa a : n ap verifye adrès imel ou ak yon kòd, apre sa ekip NORIA a ap egzamine demann lan. Si li aksepte, direksyon an ap resevwa yon envitasyon pa imel pou l louvri espas lekòl la.',
    schoolName: 'Non lekòl la', department: 'Depatman', choose: 'Chwazi…', commune: 'Komin', director: 'Non direktè a oswa direktris la',
    email: 'Adrès imel', phone: 'Telefòn (si ou vle)', students: 'Konbyen elèv apeprè', message: 'Mesaj (si ou vle)',
    hp: 'Pa ranpli kaz sa a', send: 'Resevwa kòd verifikasyon an', required: 'obligatwa',
    codeTitle: 'Verifye adrès imel ou', codeSent: (e, m) => `Nou fèk voye yon kòd 6 chif bay ${e}. Li bon pou ${m} minit.`,
    code: 'Kòd 6 chif', verify: 'Valide', badCode: 'Kòd la pa bon oswa li ekspire. Rekòmanse si sa nesesè.',
    regDone: 'Demann lan anrejistre', regDoneText: 'Mèsi ! Nou resevwa demann ou an. Ekip NORIA a ap reponn ou pa imel, anjeneral nan kèk jou travay.',
    tooMany: 'Twòp demann soti nan koneksyon sa a. Eseye ankò nan yon èdtan.', fix: 'Verifye kaz sa yo :',
    errName: 'non lekòl la (2 a 120 karaktè)', errDep: 'depatman', errCommune: 'komin (2 a 80 karaktè)', errDirector: 'non direktè a (2 a 80 karaktè)',
    errEmail: 'yon adrès imel ki bon', errPhone: 'yon telefòn ki bon', errStudents: 'kantite elèv (0 a 100 000)',
    restart: 'Rekòmanse',
    docTitle: 'Dokiman ofisyèl lekòl la', docKind: 'Ki kalite dokiman',
    docKinds: { autorisation_menfp: 'Otorizasyon fonksyònman MENFP', licence: 'Lisans oswa agreman MENFP', patente: 'Patant (DGI)', autre: 'Lòt dokiman ofisyèl' },
    docFile: 'Fichye (PDF, JPG oswa PNG, 5 Mo pou pi plis)', docHelp: 'Obligatwa. Yon foto klè oswa yon eskanè ase. Se sèlman ekip NORIA a ki wè dokiman an, pou verifye lekòl la ; yo pa janm pibliye l.',
    errDoc: 'dokiman ofisyèl (PDF, JPG oswa PNG)', errDocKind: 'kalite dokiman an', errDocSize: 'dokiman ofisyèl : 5 Mo pou pi plis', errDocType: 'dokiman ofisyèl : se sèlman fichye PDF, JPG ak PNG ki aksepte',
    docAgain: 'Pou sekirite w, nou pa kenbe fichye a lè fòmilè a gen yon erè : chwazi l ankò.',
    accTitle: 'Kont NORIA mwen', accIntro: 'Yon kont gratis, san modpas, pou resevwa pa imel nouvo anons yo, evènman yo ak laureya yo. Ou ka toujou gade pòtay la san kont.',
    ident: 'Imel (oswa telefòn)', identHelp: 'N ap voye yon kòd koneksyon. Pa telefòn, SMS poko mache.',
    getCode: 'Resevwa yon kòd', codeSentAcc: (m) => `Si adrès la bon, nou fèk voye yon kòd 6 chif. Li bon pou ${m} minit.`,
    smsNote: 'SMS poko disponib : pito sèvi ak yon adrès imel.',
    signedAs: (w) => `Konekte : ${w}`, subsTitle: 'Abònman mwen', subs: { annonces: 'Nouvo anons', evenements: 'Nouvo evènman', actualites: 'Nouvèl lekòl yo', laureats: 'Nouvo laureya' },
    depFilter: 'Sèlman pou depatman', allDeps: 'Tout depatman yo', langPref: 'Lang imel yo', save: 'Anrejistre', saved: 'Preferans yo anrejistre.',
    logout: 'Dekonekte', del: 'Efase kont mwen', delHelp: 'Kont lan, abònman yo ak sesyon yo efase touswit.', delConfirm: 'Mwen konfime m vle efase l',
    deleted: 'Kont ou efase.', noEmailSubs: 'Se pa imel nou voye mesaj yo : konekte ak yon adrès imel pou w resevwa yo.',
    unsubTitle: 'Dezabònman', unsubDone: 'Fini : ou p ap resevwa imel sa yo ankò.', unsubBad: 'Lyen dezabònman an pa bon.',
    privacy: 'Done nou kenbe : adrès ou ak preferans ou, anyen ankò. Pa gen traseur.',
    boxTitle: 'Ou dirije yon lekòl ?', boxText: 'Enskri lekòl ou sou NORIA : elèv, nòt, prezans ak echanj ak fanmi yo, an franse ak an kreyòl.',
    signup: 'Enskri', login: 'Konekte',
    signupTitle: 'Kreye kont NORIA mwen', signupIntro: 'Gratis e san modpas : swiv anons, evènman ak nouvèl lekòl yo, epi resevwa yo pa imel. N ap voye yon kòd verifikasyon ba ou.',
    signupSubs: 'Mwen vle swiv', loginTitle: 'Konekte nan kont mwen', loginIntro: 'Antre adrès imel kont ou : n ap voye yon kòd koneksyon ba ou (pa gen modpas).',
    noAccount: 'Ou poko gen kont ?', haveAccount: 'Ou gen kont deja ?',
    followTitle: 'Lekòl m ap swiv', followNone: 'Ou poko ap swiv okenn lekòl.', followFind: 'Jwenn lekòl pou swiv',
    follow: 'Swiv lekòl sa a', unfollow: 'Sispann swiv', followed: (n) => `Kounye a w ap swiv ${n}.`, unfollowed: (n) => `Ou pa swiv ${n} ankò.`,
    followLogin: (n) => `Konekte oswa kreye yon kont pou w swiv ${n}.`, followMax: `Ou deja ap swiv ${MAX_FOLLOW} lekòl : retire youn anvan w ajoute.`,
    followHelp: 'W ap resevwa pa imel nouvote lekòl w ap swiv yo (anplis abònman ou yo).',
    feedTitle: 'Dènye nouvèl lekòl mwen yo', feedNone: 'Pa gen anyen nouvo pou lekòl w ap swiv yo.',
  },
};

/* ---------- E-mails ---------- */
const MAIL = {
  codeDemande: { fr: (c) => ({ subject: `NORIA — code de vérification : ${c}`, text: `Bonjour,\n\nVotre code pour confirmer l’inscription de votre école sur NORIA : ${c}\n\nValable ${CODE_MIN} minutes, une seule fois. Si vous n’avez rien demandé, ignorez ce message.\n\nNORIA` }),
    ht: (c) => ({ subject: `NORIA — kòd verifikasyon : ${c}`, text: `Bonjou,\n\nKòd ou pou konfime enskripsyon lekòl ou sou NORIA : ${c}\n\nLi bon pou ${CODE_MIN} minit, yon sèl fwa. Si se pa ou ki mande l, pa okipe mesaj sa a.\n\nNORIA` }) },
  codeCompte: { fr: (c) => ({ subject: `NORIA — votre code de connexion : ${c}`, sms: `NORIA : votre code est ${c}. Valable ${CODE_MIN} min.`, text: `Bonjour,\n\nVotre code de connexion au portail NORIA : ${c}\n\nValable ${CODE_MIN} minutes, une seule fois. Si vous n’avez rien demandé, ignorez ce message.\n\nNORIA` }),
    ht: (c) => ({ subject: `NORIA — kòd koneksyon ou : ${c}`, sms: `NORIA : kòd ou se ${c}. Li bon pou ${CODE_MIN} min.`, text: `Bonjou,\n\nKòd koneksyon ou sou pòtay NORIA : ${c}\n\nLi bon pou ${CODE_MIN} minit, yon sèl fwa. Si se pa ou ki mande l, pa okipe mesaj sa a.\n\nNORIA` }) },
  recue: { fr: (r) => ({ subject: `NORIA — demande reçue : ${r.school_name}`, text: `Bonjour ${r.director_name},\n\nNous avons bien reçu la demande d’inscription de « ${r.school_name} » (${r.commune}). L’équipe NORIA vous répondra par e-mail.\n\nNORIA` }),
    ht: (r) => ({ subject: `NORIA — nou resevwa demann lan : ${r.school_name}`, text: `Bonjou ${r.director_name},\n\nNou resevwa demann enskripsyon « ${r.school_name} » (${r.commune}). Ekip NORIA a ap reponn ou pa imel.\n\nNORIA` }) },
  refus: { fr: (r, why) => ({ subject: `NORIA — demande d’inscription : ${r.school_name}`, text: `Bonjour ${r.director_name},\n\nNous ne pouvons pas donner suite pour l’instant à la demande d’inscription de « ${r.school_name} ».\n\nMotif : ${why}\n\nVous pouvez déposer une nouvelle demande à tout moment sur le portail NORIA.\n\nNORIA` }),
    ht: (r, why) => ({ subject: `NORIA — demann enskripsyon : ${r.school_name}`, text: `Bonjou ${r.director_name},\n\nPou kounye a nou pa ka aksepte demann enskripsyon « ${r.school_name} ».\n\nRezon : ${why}\n\nOu ka depoze yon lòt demann nenpòt ki lè sou pòtay NORIA a.\n\nNORIA` }) },
  admin: (r, base) => ({ subject: `NORIA — nouvelle demande d’inscription : ${r.school_name}`,
    text: `Nouvelle demande d’inscription (e-mail vérifié) :\n\nÉcole : ${r.school_name}\nDépartement : ${r.department}\nCommune : ${r.commune}\nDirection : ${r.director_name}\nE-mail : ${r.email}\nTéléphone : ${r.phone || '—'}\nEffectif approximatif : ${r.students_approx ?? '—'}\n${r.message ? `Message : ${r.message}\n` : ''}\nÀ examiner dans l’administration : ${base}/app#admin (onglet « Demandes »).\n\nNORIA` }),
  digest: {
    fr: (v) => ({ subject: `NORIA — ${v.label} : ${v.title}`, text: `Bonjour,\n\n${v.label} sur le portail NORIA :\n\n${v.title}\n${v.extra ? `${v.extra}\n` : ''}\n${v.link}\n\n—\nVous recevez ce message car vous êtes abonné(e) sur le portail NORIA.\nSe désinscrire en un clic : ${v.unsub}\nGérer mes abonnements : ${v.account}\n` }),
    ht: (v) => ({ subject: `NORIA — ${v.label} : ${v.title}`, text: `Bonjou,\n\n${v.label} sou pòtay NORIA a :\n\n${v.title}\n${v.extra ? `${v.extra}\n` : ''}\n${v.link}\n\n—\nOu resevwa mesaj sa a paske ou abòne sou pòtay NORIA a.\nDezabòne nan yon sèl klik : ${v.unsub}\nJere abònman mwen : ${v.account}\n` }),
  },
  labels: { fr: { annonce: 'Nouvelle annonce', evenement: 'Nouvel événement', laureat: 'Nouveau lauréat', article: 'Nouvel article', temoignage: 'Nouveau témoignage' }, ht: { annonce: 'Nouvo anons', evenement: 'Nouvo evènman', laureat: 'Nouvo laureya', article: 'Nouvo atik', temoignage: 'Nouvo temwayaj' } },
};
const pickL = (l) => (l === 'ht' ? 'ht' : 'fr');

/* ---------- Envois ---------- */
async function sendMail(ctx, to, m, { channel = 'email' } = {}) {
  try {
    const a = ctx.notifier.adapter(channel);
    await a.send({ to, subject: m.subject, text: channel === 'sms' ? (m.sms || m.text) : m.text, ...(m.headers ? { headers: m.headers } : {}) });
    return true;
  } catch (e) { console.error(`[portail public ${channel}] échec : ${e.message}`); return false; }
}

/* ---------- Codes ---------- */
async function newCode(db, purpose, identifier, payload = null) {
  const ticket = crypto.randomBytes(24).toString('base64url');
  const code = otp.newCode();
  await db.run('UPDATE public_code SET used_at = ? WHERE purpose = ? AND identifier = ? AND used_at IS NULL', iso(), purpose, identifier);
  await db.run('INSERT INTO public_code (purpose, identifier, ticket_hash, code_hash, payload, expires_at, created_at) VALUES (?,?,?,?,?,?,?)',
    purpose, identifier, auth.sha256(ticket), otp.hashCode(code, `pub:${purpose}:${identifier}`), payload, iso(CODE_MIN * 60e3), iso());
  return { ticket, code };
}
// Vérifie un code : 5 essais au plus (comptés avant la comparaison), usage unique. Rend la ligne ou null.
async function checkCode(db, purpose, ticket, code) {
  const row = await db.get('SELECT * FROM public_code WHERE ticket_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?', auth.sha256(String(ticket || '')), purpose, iso());
  const c = String(code || '').replace(/\s/g, '');
  if (!row) { otp.checkCode(c, 0, null); return null; }
  const take = await db.run('UPDATE public_code SET attempts = attempts + 1 WHERE id = ? AND used_at IS NULL AND attempts < ?', row.id, otp.MAX_ATTEMPTS);
  if (!take.changes) return null;
  if (!(/^\d{6}$/.test(c) & otp.checkCode(c, `pub:${purpose}:${row.identifier}`, row.code_hash))) return null;
  if (!(await db.run('UPDATE public_code SET used_at = ? WHERE id = ? AND used_at IS NULL', iso(), row.id)).changes) return null;
  return row;
}

/* ---------- Demande d'inscription ---------- */
function readRequest(b, L) {
  const x = X[L]; const errs = [];
  const o = {
    school_name: str(b.school_name, 120), department: str(b.department, 20), commune: str(b.commune, 80), director_name: str(b.director_name, 80),
    email: str(b.email, 254).toLowerCase(), phone: str(b.phone, 30), students_approx: str(b.students_approx, 7), message: str(b.message, 1000), lang: L,
  };
  if (o.school_name.length < 2) errs.push(x.errName);
  if (!DEPS.includes(o.department)) errs.push(x.errDep);
  if (o.commune.length < 2) errs.push(x.errCommune);
  if (o.director_name.length < 2) errs.push(x.errDirector);
  if (!EMAIL_RE.test(o.email)) errs.push(x.errEmail);
  if (o.phone) { const p = normalizePhone(o.phone); if (!p) errs.push(x.errPhone); else o.phone = p; } else o.phone = null;
  if (o.students_approx !== '') { const n = Number(o.students_approx); if (!Number.isInteger(n) || n < 0 || n > 100000) errs.push(x.errStudents); else o.students_approx = n; } else o.students_approx = null;
  o.message = o.message || null;
  // Document officiel obligatoire : type choisi dans la liste, fichier PDF/JPEG/PNG vérifié par signature, 5 Mo au plus.
  const kind = str(b.doc_kind, 30); let doc = null;
  if (!DOC_KINDS.includes(kind)) errs.push(x.errDocKind);
  try { doc = { ...Up.checkFile(((b.__files || {}).document)), kind, data: b.__files.document.data }; }
  catch (e) { errs.push(e.code === 'taille' ? x.errDocSize : e.code === 'type' ? x.errDocType : x.errDoc); }
  o.doc_kind = kind;
  return { o, errs, doc };
}

/* ---------- Comptes publics ---------- */
async function loadAccount(db, token) {
  if (!token) return null;
  const r = await db.get('SELECT a.* FROM public_session s JOIN public_account a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?', auth.sha256(token), iso());
  return r || null;
}
const sign = (acc, scope) => crypto.createHmac('sha256', `${process.env.NORIA_OTP_SECRET || ''}|${acc.link_key}`).update(`desinscription:${acc.id}:${scope}`).digest('base64url').slice(0, 32);
function unsubLink(base, acc, scope) { return `${base}/desinscription?c=${acc.id}&s=${scope}&t=${sign(acc, scope)}`; }
async function unsubscribe(db, id, scope, t) {
  if (!/^\d{1,9}$/.test(String(id)) || ![...SUBS, 'tout'].includes(scope)) return false;
  const acc = await db.get('SELECT * FROM public_account WHERE id = ?', Number(id));
  if (!acc) return false;
  const a = Buffer.from(sign(acc, scope)); const b = Buffer.from(String(t || ''));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  if (scope === 'tout') {
    await db.run('UPDATE public_account SET sub_annonces = 0, sub_evenements = 0, sub_actualites = 0, sub_laureats = 0 WHERE id = ?', acc.id);
    await db.run('DELETE FROM public_follow WHERE account_id = ?', acc.id);
  }
  else await db.run(`UPDATE public_account SET sub_${scope} = 0 WHERE id = ?`, acc.id);
  return true;
}

/* ---------- Envoi groupé aux abonnés ---------- */
// kind : 'annonce' | 'evenement' | 'laureat'. Une seule fois par contenu (public_digest), en lots de 50, en tâche de fond :
// la réponse au super-admin n'attend pas. ctx.digests garde la dernière tâche (tests).
function notifyPublished(db, ctx, kind, id, base) {
  if (!KIND_SUB[kind] || !ctx || !ctx.notifier) return Promise.resolve();
  const job = async () => {
    const pub = Pt.createPublic(db);
    let item = null; let dep = null; let schoolId = null;
    if (kind === 'annonce') {
      const a = await db.get('SELECT * FROM portal_ad WHERE id = ?', Number(id));
      const today = Pt.haitiDay();
      if (!a || !Number(a.active) || a.starts_on > today || a.ends_on < today) return;
      item = { title_fr: a.title_fr, title_ht: a.title_ht, text_fr: a.text_fr, text_ht: a.text_ht, path: '/annonces', sponsored: !!Number(a.sponsored) };
    } else {
      const r = await pub.item([kind], id);
      if (!r) return;
      dep = r.department || null;
      const own = await db.get('SELECT school_id FROM portal_item WHERE id = ?', Number(id));
      schoolId = own && own.school_id ? Number(own.school_id) : null;
      if (kind === 'article' || kind === 'temoignage') {
        const ex = (t) => { const v = String(t || '').replace(/\s+/g, ' ').trim(); return v.length > 200 ? `${v.slice(0, 199)}…` : v; };
        item = { title_fr: r.title_fr, title_ht: r.title_ht, text_fr: [r.school, ex(r.body_fr)].filter(Boolean).join(' — '), text_ht: [r.school, ex(r.body_ht)].filter(Boolean).join(' — '), path: `/communaute/${r.id}` };
      } else item = kind === 'laureat'
        ? { title_fr: `${r.public_name || r.person_name} — ${r.exam} ${r.year}`, title_ht: `${r.public_name || r.person_name} — ${r.exam} ${r.year}`, text_fr: r.school || '', text_ht: r.school || '', path: '/laureats' }
        : { title_fr: r.title_fr, title_ht: r.title_ht, text_fr: `${r.event_date}${r.place ? ` · ${r.place}` : ''}`, text_ht: `${r.event_date}${r.place ? ` · ${r.place}` : ''}`, path: `/evenements/${r.id}` };
    }
    // Encart sponsorisé : jamais envoyé par e-mail (seules les annonces officielles le sont).
    if (item.sponsored) return;
    try { await db.run('INSERT INTO public_digest (kind, ref_id, created_at) VALUES (?,?,?)', kind, Number(id), iso()); }
    catch { return; } // déjà envoyé
    const col = `sub_${KIND_SUB[kind]}`;
    // Abonnés de la catégorie (filtre de département) + comptes qui suivent l'école auteure du contenu.
    const bySub = `(${col} = 1${dep ? ' AND (department IS NULL OR department = ?)' : ''})`;
    const byFollow = schoolId ? ' OR id IN (SELECT account_id FROM public_follow WHERE school_id = ?)' : '';
    const subs = await db.all(`SELECT * FROM public_account WHERE email IS NOT NULL AND (${bySub}${byFollow}) ORDER BY id`, ...(dep ? [dep] : []), ...(schoolId ? [schoolId] : []));
    let ok = 0; let ko = 0;
    for (let i = 0; i < subs.length; i += BATCH) {
      if (i) await new Promise((r) => setTimeout(r, ctx.digestPauseMs ?? 1000));
      await Promise.all(subs.slice(i, i + BATCH).map(async (acc) => {
        const L = pickL(acc.lang);
        const title = item[`title_${L}`] || item[`title_${L === 'fr' ? 'ht' : 'fr'}`] || '';
        const prefix = L === 'ht' ? '/ht' : '';
        // Destinataire au seul titre d'une école suivie : le lien « en un clic » coupe tout (abonnements et écoles suivies).
        const unsub = unsubLink(base, acc, Number(acc[col]) ? KIND_SUB[kind] : 'tout');
        const m = MAIL.digest[L]({ label: MAIL.labels[L][kind], title, extra: item[`text_${L}`] || item[`text_${L === 'fr' ? 'ht' : 'fr'}`] || '', link: `${base}${prefix}${item.path === '/annonces' && prefix ? '/annonces' : item.path}`, unsub, account: `${base}${prefix}/compte` });
        m.headers = { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
        if (await sendMail(ctx, acc.email, m)) ok++; else ko++;
      }));
    }
    await db.run('UPDATE public_digest SET recipients = ?, failures = ? WHERE kind = ? AND ref_id = ?', ok, ko, kind, Number(id));
  };
  const p = (ctx.digests || Promise.resolve()).then(job).catch((e) => console.error(`[portail public] envoi groupé : ${e.message}`));
  ctx.digests = p;
  return p;
}

/* ---------- Invitation de la direction (réutilise le jeton « invitation ») ---------- */
async function inviteDirection(db, ctx, req, schoolId, { email, name, lang }) {
  const A = require('./app'); // chargement différé (dépendance circulaire)
  const I = require('./identite');
  const mail = str(email, 254).toLowerCase(); const nm = str(name, 80);
  if (!EMAIL_RE.test(mail)) throw new HttpError(400, 'e-mail invalide');
  if (nm.length < 2) throw new HttpError(400, 'nom obligatoire');
  const school = await db.get('SELECT id, slug, name, initials, default_lang, status, (logo IS NOT NULL) AS has_logo FROM school WHERE id = ?', Number(schoolId));
  if (!school) throw new HttpError(404, 'école introuvable');
  if (school.status !== 'active') throw new HttpError(409, 'école suspendue');
  if (await db.get('SELECT 1 AS x FROM app_user WHERE school_id = ? AND email = ?', school.id, mail)) throw new HttpError(409, 'un compte existe déjà avec cet identifiant');
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = iso(A.INVITE_HOURS * 3600e3);
  // Une invitation direction encore valable pour la même adresse est remplacée.
  await db.run("UPDATE account_token SET expires_at = ? WHERE school_id = ? AND kind = 'invitation' AND role = 'direction' AND email = ? AND used_at IS NULL AND expires_at > ?", iso(), school.id, mail, iso());
  const id = await db.insert(`INSERT INTO account_token (school_id, kind, token_hash, email, display_name, role, created_by, expires_at) VALUES (?,?,?,?,?,?,?,?)`,
    school.id, 'invitation', auth.sha256(token), mail, nm, 'direction', null, expires);
  const base = A.linkBase(req, ctx);
  const sent = await A.outbox(db, ctx, school.id, mail, 'invitation', pickL(lang || school.default_lang),
    { school: school.name, initials: I.schoolInitials(school), logoUrl: null, name: nm, hours: A.INVITE_HOURS, link: `${base}/app#invitation=${token}` }, [token]);
  return { id, expiresAt: expires, channel: sent.channel, envoi: sent.envoi, link: `/app#invitation=${token}` };
}

/* ---------- Routes d'administration (super-admin) ---------- */
function adminRoutes({ log, createSchool }) {
  const reasonOf = (b, min = 3) => { const r = str((b || {}).reason, 300); if (r.length < min) throw new HttpError(400, 'motif obligatoire (3 à 300 caractères)'); return r; };
  const getReq = async (db, id) => { const r = await db.get('SELECT * FROM school_request WHERE id = ?', Number(id)); if (!r) throw new HttpError(404, 'introuvable'); return r; };
  return [
    ['GET', /^\/api\/admin\/demandes$/, async (db, req) => {
      const st = req.query.get('statut');
      if (st && !['en_attente', 'acceptee', 'refusee'].includes(st)) throw new HttpError(400, 'statut inconnu');
      const rows = await db.all(`SELECT r.*, s.slug AS school_slug FROM school_request r LEFT JOIN school s ON s.id = r.school_id${st ? ' WHERE r.status = ?' : ''}
        ORDER BY CASE WHEN r.status = 'en_attente' THEN 0 ELSE 1 END, r.id DESC LIMIT 300`, ...(st ? [st] : []));
      const docs = rows.length ? await db.all(`SELECT id, request_id, kind, filename, mime, size, created_at FROM school_request_document
        WHERE request_id IN (${rows.map(() => '?').join(',')}) ORDER BY id`, ...rows.map((r) => r.id)) : [];
      return rows.map((r) => ({ ...r, suggested_slug: slugify(r.school_name), documents: docs.filter((d) => d.request_id === r.id) }));
    }, { auth: true }],
    // Document officiel d'une demande : super-admin seulement (route /api/admin/), consultation journalisée. Servi avec le
    // type vérifié au dépôt, nosniff et CSP « default-src 'none' » ; en pièce jointe sauf ?voir=1 (PDF ou image).
    ['GET', /^\/api\/admin\/demandes\/(\d+)\/documents\/(\d+)$/, async (db, req, a, [id, docId]) => {
      const d = await db.get('SELECT * FROM school_request_document WHERE id = ? AND request_id = ?', Number(docId), Number(id));
      if (!d) throw new HttpError(404, 'introuvable');
      const view = req.query.get('voir') === '1';
      await log(db, a, 'admin.demande.document', Number(id), `document ${d.id} (${d.kind}, ${d.mime}, ${d.size} o)${view ? ' — consulté' : ' — téléchargé'}`, 'ok', req.ip);
      return { __file: Buffer.from(d.data, 'base64'), type: d.mime, filename: d.filename, inline: view };
    }, { auth: true }],
    ['POST', /^\/api\/admin\/demandes\/(\d+)\/accepter$/, async (db, req, a, [id], ctx) => {
      const r = await getReq(db, id); const b = req.body || {};
      if (r.status !== 'en_attente') throw new HttpError(409, `demande déjà traitée (${r.status})`);
      const why = str(b.reason, 300) || 'demande d’inscription acceptée';
      let slug = str(b.slug, 60).toLowerCase() || slugify(r.school_name);
      if (!b.slug) { let n = 2; const root = slug; while (await db.get('SELECT 1 AS x FROM school WHERE slug = ?', slug)) slug = `${root.slice(0, 55)}-${n++}`; }
      const school = await db.tx(async (t) => {
        const s = await createSchool(t, a, req, { slug, name: r.school_name, department: r.department, commune: r.commune, lang: r.lang, reason: `demande n° ${r.id} — ${why}` });
        const upd = await t.run("UPDATE school_request SET status = 'acceptee', school_id = ?, decided_by = ?, decided_at = ?, decision_reason = ? WHERE id = ? AND status = 'en_attente'", s.id, a.id, iso(), why, r.id);
        if (!upd.changes) throw new HttpError(409, 'demande déjà traitée');
        await log(t, a, 'admin.demande.accepter', r.id, `école ${s.slug} (n° ${s.id})`, 'ok', req.ip);
        return s;
      });
      const inv = await inviteDirection(db, ctx, req, school.id, { email: r.email, name: r.director_name, lang: r.lang });
      await log(db, a, 'admin.direction.inviter', school.id, `demande n° ${r.id} — invitation ${inv.id} (${inv.channel} ${inv.envoi})`, inv.envoi === 'échec' ? 'echec' : 'ok', req.ip);
      return { id: r.id, status: 'acceptee', school, invitation: { id: inv.id, expiresAt: inv.expiresAt, envoi: inv.envoi, link: inv.link } };
    }, { auth: true, write: true }],
    ['POST', /^\/api\/admin\/demandes\/(\d+)\/refuser$/, async (db, req, a, [id], ctx) => {
      const r = await getReq(db, id); const why = reasonOf(req.body);
      const upd = await db.run("UPDATE school_request SET status = 'refusee', decided_by = ?, decided_at = ?, decision_reason = ? WHERE id = ? AND status = 'en_attente'", a.id, iso(), why, r.id);
      if (!upd.changes) throw new HttpError(409, `demande déjà traitée (${r.status})`);
      const ok = await sendMail(ctx, r.email, MAIL.refus[pickL(r.lang)](r, why));
      await log(db, a, 'admin.demande.refuser', r.id, `${why}${ok ? '' : ' (e-mail en échec)'}`, 'ok', req.ip);
      return { id: r.id, status: 'refusee', envoi: ok ? 'envoyé' : 'échec' };
    }, { auth: true, write: true }],
    ['POST', /^\/api\/admin\/ecoles\/(\d+)\/inviter-direction$/, async (db, req, a, [id], ctx) => {
      const b = req.body || {};
      const inv = await inviteDirection(db, ctx, req, id, { email: b.email, name: b.name, lang: b.lang });
      await log(db, a, 'admin.direction.inviter', Number(id), `invitation ${inv.id} (${inv.channel} ${inv.envoi})`, inv.envoi === 'échec' ? 'echec' : 'ok', req.ip);
      return inv;
    }, { auth: true, write: true }],
  ];
}

/* ---------- Site public (pages et formulaires) ---------- */
function parseCookies(h) {
  const out = {};
  for (const part of String(h || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim(); }
  return out;
}
const PATHS = /^\/(?:ht\/)?(?:inscrire-ecole|compte(?:\/(?:code|verifier|abonnements|supprimer|deconnexion|suivre))?|desinscription)$/;

function createPublicSite(db, { ctx, render, write, baseOf, esc, T }) {
  const limitCode = () => ctx.publicLimit;
  const cookieAttrs = () => `HttpOnly; SameSite=Lax; Path=/${ctx.secureCookie ? '; Secure' : ''}`;
  const field = (name, label, { type = 'text', value = '', req = true, extra = '', help = '' } = {}) =>
    `<label class="fld"><span>${esc(label)}${req ? ' <span class="req" aria-hidden="true">*</span>' : ''}</span><input name="${name}" type="${type}" value="${esc(value)}"${req ? ' required' : ''}${extra}>${help ? `<small class="mut">${esc(help)}</small>` : ''}</label>`;
  const errBox = (L, errs) => (errs && errs.length ? `<div class="alert" role="alert"><p>${esc(X[L].fix)}</p><ul>${errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : '');
  const okBox = (s) => `<div class="okbox" role="status"><p>${esc(s)}</p></div>`;
  const pre = (L) => (L === 'ht' ? '/ht' : '');
  // signedIn : état de l'en-tête (« Mon compte » ou « S'inscrire / Se connecter ») ; null = d'après le cookie de session.
  const page = (req, res, baseHeaders, L, title, body, status = 200, extraHeaders = {}, signedIn = null) => {
    const p = pre(L);
    const html = render({ L, title, body, req, status, canonicalPath: null, signedIn: signedIn ?? !!parseCookies(req.headers.cookie)[COOKIE] });
    write(req, res, baseHeaders, { status, body: html, type: 'text/html; charset=utf-8', cache: 'no-store, private', extra: { 'content-language': L, 'x-robots-tag': 'noindex', ...extraHeaders } });
    return p;
  };

  function regForm(L, v = {}, errs = []) {
    const x = X[L]; const dep = T[L].dep;
    return `<h1>${esc(x.regTitle)}</h1><p>${esc(x.regIntro)}</p>${errBox(L, errs)}
<form class="pf card" method="post" action="${pre(L)}/inscrire-ecole" enctype="multipart/form-data" novalidate><input type="hidden" name="step" value="envoyer">
${field('school_name', x.schoolName, { value: v.school_name, extra: ' maxlength="120" autocomplete="organization"' })}
<label class="fld"><span>${esc(x.department)} <span class="req" aria-hidden="true">*</span></span><select name="department" required><option value="">${esc(x.choose)}</option>${DEPS.map((d) => `<option value="${d}"${v.department === d ? ' selected' : ''}>${esc(dep[d])}</option>`).join('')}</select></label>
${field('commune', x.commune, { value: v.commune, extra: ' maxlength="80"' })}
${field('director_name', x.director, { value: v.director_name, extra: ' maxlength="80" autocomplete="name"' })}
${field('email', x.email, { type: 'email', value: v.email, extra: ' maxlength="254" autocomplete="email" inputmode="email"' })}
${field('phone', x.phone, { type: 'tel', value: v.phone, req: false, extra: ' maxlength="30" autocomplete="tel" inputmode="tel"' })}
${field('students_approx', x.students, { type: 'number', value: v.students_approx ?? '', req: false, extra: ' min="0" max="100000" inputmode="numeric"' })}
<fieldset class="fld pf-doc"><legend>${esc(x.docTitle)} <span class="req" aria-hidden="true">*</span></legend>
<label class="fld"><span>${esc(x.docKind)} <span class="req" aria-hidden="true">*</span></span><select name="doc_kind" required><option value="">${esc(x.choose)}</option>${DOC_KINDS.map((k) => `<option value="${k}"${v.doc_kind === k ? ' selected' : ''}>${esc(x.docKinds[k])}</option>`).join('')}</select></label>
<label class="fld"><span>${esc(x.docFile)} <span class="req" aria-hidden="true">*</span></span><input name="document" type="file" required accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"><small class="mut">${esc(x.docHelp)}</small></label>
${errs.length ? `<p class="small mut">${esc(x.docAgain)}</p>` : ''}</fieldset>
<label class="fld">${esc(x.message)}<textarea name="message" rows="3" maxlength="1000">${esc(v.message || '')}</textarea></label>
<label class="hp" aria-hidden="true">${esc(x.hp)}<input name="site_web" tabindex="-1" autocomplete="off"></label>
<button class="btn" type="submit">${esc(x.send)}</button></form>
<p class="mut">${esc(X[L].privacy)}</p>`;
  }
  const codeForm = (L, action, ticket, intro, err) => `<h1>${esc(X[L].codeTitle)}</h1>${err ? `<div class="alert" role="alert"><p>${esc(err)}</p></div>` : ''}<p>${esc(intro)}</p>
<form class="pf card" method="post" action="${action}" novalidate><input type="hidden" name="step" value="code"><input type="hidden" name="ticket" value="${esc(ticket)}">
${field('code', X[L].code, { extra: ' inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"' })}
<button class="btn" type="submit">${esc(X[L].verify)}</button></form>`;

  // Connexion ou inscription grand public (même parcours sans mot de passe : code par e-mail). mode : 'login' | 'signup'.
  // follow : école à suivre après vérification (slug), reprise depuis « Suivre cette école ».
  function accountLogin(L, err, info, { mode = 'login', follow = null, followName = null } = {}) {
    const x = X[L]; const up = mode === 'signup';
    const subsBox = up ? `<fieldset class="fld"><legend>${esc(x.signupSubs)}</legend>${SUBS.map((k) => `<label class="ck"><input type="checkbox" name="sub_${k}" value="1"${k === 'laureats' ? '' : ' checked'}> ${esc(x.subs[k])}</label>`).join('')}</fieldset>` : '';
    const swap = up ? `<p>${esc(x.haveAccount)} <a href="${pre(L)}/compte${follow ? `?suivre=${esc(follow)}` : ''}">${esc(x.login)}</a></p>`
      : `<p>${esc(x.noAccount)} <a href="${pre(L)}/compte?inscription=1${follow ? `&amp;suivre=${esc(follow)}` : ''}">${esc(x.signup)}</a></p>`;
    return `<h1>${esc(up ? x.signupTitle : x.loginTitle)}</h1><p>${esc(up ? x.signupIntro : x.loginIntro)}</p>${err ? `<div class="alert" role="alert"><p>${esc(err)}</p></div>` : ''}${info ? okBox(info) : ''}
${followName ? `<p class="okbox">${esc(x.followLogin(followName))}</p>` : ''}
<form class="pf card" method="post" action="${pre(L)}/compte/code" novalidate><input type="hidden" name="mode" value="${up ? 'signup' : 'login'}">${follow ? `<input type="hidden" name="suivre" value="${esc(follow)}">` : ''}
${field('identifier', x.ident, { extra: ' maxlength="254" autocomplete="email" inputmode="email"', help: x.identHelp })}
${subsBox}<label class="hp" aria-hidden="true">${esc(x.hp)}<input name="site_web" tabindex="-1" autocomplete="off"></label>
<button class="btn" type="submit">${esc(up ? x.signup : x.getCode)}</button></form>${swap}<p class="mut">${esc(x.privacy)}</p>`;
  }
  async function follows(acc) {
    return db.all('SELECT s.id, s.slug, s.name FROM public_follow f JOIN school s ON s.id = f.school_id WHERE f.account_id = ? AND s.status = \'active\' ORDER BY s.name', acc.id);
  }
  async function accountPage(L, acc, info) {
    const x = X[L]; const dep = T[L].dep;
    const fl = await follows(acc);
    const ids = fl.map((f) => f.id);
    const pub = Pt.createPublic(db);
    const [feed, camps] = await Promise.all([pub.schoolFeed({ schools: ids, per: 5 }), pub.campaigns({ schools: ids, per: 3 })]);
    const chk = (k) => `<label class="ck"><input type="checkbox" name="${k}" value="1"${Number(acc[`sub_${k}`]) ? ' checked' : ''}> ${esc(x.subs[k])}</label>`;
    const feedHtml = [...camps.list.map((c) => `<li><b>${esc(c.school)}</b> · <a href="${pre(L)}/inscription/${esc(c.school_slug)}">${esc(c.title)}</a></li>`),
      ...feed.list.map((r) => `<li><b>${esc(r.school)}</b> · <a href="${pre(L)}/ecoles?categorie=${r.feed}&amp;ecole=${esc(r.school_slug)}">${esc(r.kind === 'laureat' ? `${r.name} — ${r.exam} ${r.year}` : (r[`title_${L}`] || r[`title_${L === 'fr' ? 'ht' : 'fr'}`] || ''))}</a></li>`)].join('');
    const unf = (f) => `<li class="fw"><span>${esc(f.name)}</span><form method="post" action="${pre(L)}/compte/suivre"><input type="hidden" name="ecole" value="${esc(f.slug)}"><input type="hidden" name="action" value="retirer"><button class="btn btn-o btn-s" type="submit">${esc(x.unfollow)}</button></form></li>`;
    return `<h1>${esc(x.accTitle)}</h1><p class="mut">${esc(x.signedAs(acc.email || acc.phone))}</p>${info ? okBox(info) : ''}${acc.email ? '' : `<p class="alert">${esc(x.noEmailSubs)}</p>`}
<section class="pf card" aria-labelledby="s-fw"><h2 id="s-fw">${esc(x.followTitle)}</h2>${fl.length ? `<ul class="fws">${fl.map(unf).join('')}</ul><p class="mut small">${esc(x.followHelp)}</p>` : `<p class="mut">${esc(x.followNone)}</p>`}
<p><a class="more" href="${pre(L)}/ecoles">${esc(x.followFind)} →</a></p></section>
${fl.length ? `<section class="pf card" aria-labelledby="s-fd"><h2 id="s-fd">${esc(x.feedTitle)}</h2>${feedHtml ? `<ul class="feed">${feedHtml}</ul>` : `<p class="mut">${esc(x.feedNone)}</p>`}</section>` : ''}
<form class="pf card" method="post" action="${pre(L)}/compte/abonnements"><h2>${esc(x.subsTitle)}</h2>${SUBS.map(chk).join('')}
<label class="fld">${esc(x.depFilter)}<select name="department"><option value="">${esc(x.allDeps)}</option>${DEPS.map((d) => `<option value="${d}"${acc.department === d ? ' selected' : ''}>${esc(dep[d])}</option>`).join('')}</select></label>
<label class="fld">${esc(x.langPref)}<select name="lang"><option value="fr"${acc.lang === 'fr' ? ' selected' : ''}>Français</option><option value="ht"${acc.lang === 'ht' ? ' selected' : ''}>Kreyòl</option></select></label>
<button class="btn" type="submit">${esc(x.save)}</button></form>
<form class="pf" method="post" action="${pre(L)}/compte/deconnexion"><button class="btn btn-o" type="submit">${esc(x.logout)}</button></form>
<form class="pf card danger" method="post" action="${pre(L)}/compte/supprimer"><h2>${esc(x.del)}</h2><p class="mut">${esc(x.delHelp)}</p>
<label class="ck"><input type="checkbox" name="confirm" value="1" required> ${esc(x.delConfirm)}</label><button class="btn btn-d" type="submit">${esc(x.del)}</button></form>
<p class="mut">${esc(x.privacy)}</p>`;
  }
  const schoolBySlug = (slug) => (SLUG_RE.test(String(slug || '')) ? db.get("SELECT id, slug, name FROM school WHERE slug = ? AND status = 'active'", String(slug)) : Promise.resolve(null));
  async function addFollow(acc, school) {
    if (await db.get('SELECT 1 AS x FROM public_follow WHERE account_id = ? AND school_id = ?', acc.id, school.id)) return true;
    const n = Number((await db.get('SELECT COUNT(*) AS n FROM public_follow WHERE account_id = ?', acc.id)).n);
    if (n >= MAX_FOLLOW) return false;
    await db.run('INSERT INTO public_follow (account_id, school_id, created_at) VALUES (?,?,?)', acc.id, school.id, iso());
    return true;
  }
  const markAttrs = () => `SameSite=Lax; Path=/${ctx.secureCookie ? '; Secure' : ''}`;

  async function readForm(req, name) {
    const ct0 = String(req.headers['content-type'] || '');
    // Inscription d'une école : formulaire multipart avec le document officiel (5 Mo + champs), lu en octets puis découpé.
    if (name === '/inscrire-ecole' && /^multipart\/form-data/i.test(ct0)) {
      const { fields, files } = Up.parseMultipart(await Up.readBody(req, Up.DOC_MAX + 64 * 1024), ct0);
      return { ...fields, __files: files };
    }
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 20000) throw new HttpError(413, 'trop volumineux'); }
    const ct = String(req.headers['content-type'] || '');
    if (ct.includes('application/json')) { try { return JSON.parse(raw || '{}'); } catch { throw new HttpError(400, 'JSON invalide'); } }
    return Object.fromEntries(new URLSearchParams(raw));
  }
  // Refuse un envoi venu d'un autre site. Avec Referrer-Policy: no-referrer, les navigateurs envoient « Origin: null »
  // pour un formulaire du même site : on s'appuie alors sur Sec-Fetch-Site (et, pour un compte, sur SameSite=Lax).
  const sameOrigin = (req) => {
    if (req.headers['sec-fetch-site'] === 'cross-site') return false;
    const o = req.headers.origin;
    if (!o || o === 'null') return true;
    try { return new URL(o).host === req.headers.host; } catch { return false; }
  };
  const redirect = (res, baseHeaders, to, cookies = []) => { res.writeHead(303, { ...baseHeaders, location: to, 'cache-control': 'no-store', ...(cookies.length ? { 'set-cookie': cookies } : {}) }); res.end(); };

  // GET : rend true si servi.
  async function get(req, res, url, baseHeaders) {
    const p = url.pathname;
    if (!PATHS.test(p)) return false;
    const L = p.startsWith('/ht/') ? 'ht' : 'fr'; const name = p.replace(/^\/ht/, '');
    if (name === '/inscrire-ecole') { page(req, res, baseHeaders, L, X[L].regTitle, regForm(L)); return true; }
    if (name === '/compte') {
      const ck = parseCookies(req.headers.cookie);
      const acc = await loadAccount(db, ck[COOKIE]);
      const q = url.searchParams; const x = X[L];
      const fs = q.get('suivi') ? await schoolBySlug(q.get('suivi')) : null;
      const fr = q.get('retire') ? await schoolBySlug(q.get('retire')) : null;
      const info = q.get('ok') === '1' ? x.saved : (q.get('supprime') === '1' ? x.deleted : (fs ? x.followed(fs.name) : (fr ? x.unfollowed(fr.name) : (q.get('max') === '1' ? x.followMax : null))));
      // Témoin périmé (session expirée ou effacée) : retiré pour que l'en-tête affiche de nouveau « Se connecter ».
      const extra = !acc && ck[MARK] ? { 'set-cookie': `${MARK}=; ${markAttrs()}; Max-Age=0` } : {};
      if (acc) { page(req, res, baseHeaders, L, x.account, await accountPage(L, acc, info), 200, {}, true); return true; }
      const want = q.get('suivre') ? await schoolBySlug(q.get('suivre')) : null;
      const mode = q.get('inscription') === '1' ? 'signup' : 'login';
      page(req, res, baseHeaders, L, mode === 'signup' ? x.signupTitle : x.loginTitle, accountLogin(L, null, info, { mode, follow: want && want.slug, followName: want && want.name }), 200, extra, false);
      return true;
    }
    if (name === '/desinscription') {
      const ok = await unsubscribe(db, url.searchParams.get('c'), url.searchParams.get('s'), url.searchParams.get('t'));
      page(req, res, baseHeaders, L, X[L].unsubTitle, `<h1>${esc(X[L].unsubTitle)}</h1>${ok ? okBox(X[L].unsubDone) : `<div class="alert" role="alert"><p>${esc(X[L].unsubBad)}</p></div>`}<p><a class="btn btn-o" href="${pre(L)}/compte">${esc(X[L].account)}</a></p>`, ok ? 200 : 400);
      return true;
    }
    return false;
  }

  // POST : rend true si servi (formulaires HTML ; réponses HTML).
  async function post(req, res, url, baseHeaders, ip) {
    const p = url.pathname;
    if (!PATHS.test(p)) return false;
    const L = p.startsWith('/ht/') ? 'ht' : 'fr'; const name = p.replace(/^\/ht/, ''); const x = X[L];
    if (!sameOrigin(req)) throw new HttpError(403, 'origine refusée');
    const b = await readForm(req, name);
    const lim = limitCode();
    const base = baseOf(req);

    if (name === '/desinscription') { // List-Unsubscribe-Post (désinscription en un clic par le client de messagerie)
      const ok = await unsubscribe(db, url.searchParams.get('c'), url.searchParams.get('s'), url.searchParams.get('t'));
      res.writeHead(ok ? 200 : 400, { ...baseHeaders, 'content-type': 'text/plain; charset=utf-8' }); res.end(ok ? 'ok' : 'lien invalide'); return true;
    }

    if (name === '/inscrire-ecole') {
      if (b.step === 'code') {
        const keys = [`pub-verif:${ip}`];
        if (await lim.blocked(keys)) { page(req, res, baseHeaders, L, x.codeTitle, `<h1>${esc(x.codeTitle)}</h1><div class="alert" role="alert"><p>${esc(x.tooMany)}</p></div>`, 429); return true; }
        const row = await checkCode(db, 'demande', b.ticket, b.code);
        if (!row) { await lim.fail(keys); page(req, res, baseHeaders, L, x.codeTitle, codeForm(L, `${pre(L)}/inscrire-ecole`, b.ticket, '', x.badCode) + `<p><a href="${pre(L)}/inscrire-ecole">${esc(x.restart)}</a></p>`, 400); return true; }
        const o = JSON.parse(row.payload);
        const id = await db.insert(`INSERT INTO school_request (school_name, department, commune, director_name, email, phone, students_approx, message, lang, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`, o.school_name, o.department, o.commune, o.director_name, o.email, o.phone, o.students_approx, o.message, o.lang, iso());
        await db.run('UPDATE school_request_document SET request_id = ?, ticket_hash = NULL WHERE ticket_hash = ? AND request_id IS NULL', id, auth.sha256(String(b.ticket || '')));
        await db.run('INSERT INTO platform_audit (admin_id, action, target, detail, outcome, ip) VALUES (?,?,?,?,?,?)', null, 'public.demande', String(id), `${o.school_name} — ${o.department}`.slice(0, 500), 'ok', ip);
        // Notification aux super-admins actifs et accusé de réception au demandeur (échecs journalisés, jamais bloquants).
        const admins = await db.all("SELECT email FROM platform_admin WHERE state = 'actif' ORDER BY id");
        const m = MAIL.admin({ ...o, id }, base);
        await Promise.all([...admins.map((ad) => sendMail(ctx, ad.email, m)), sendMail(ctx, o.email, MAIL.recue[pickL(o.lang)](o))]);
        page(req, res, baseHeaders, L, x.regDone, `<h1>${esc(x.regDone)}</h1>${okBox(x.regDoneText)}<p><a class="btn btn-o" href="${pre(L) || '/'}">${esc(T[L].home)}</a></p>`);
        return true;
      }
      // Étape 1 : formulaire.
      if (b.site_web) { // champ piège rempli : réponse identique à un envoi réussi, rien n'est enregistré ni envoyé
        page(req, res, baseHeaders, L, x.codeTitle, codeForm(L, `${pre(L)}/inscrire-ecole`, crypto.randomBytes(24).toString('base64url'), x.codeSent(str(b.email, 254), CODE_MIN)));
        return true;
      }
      const { o, errs, doc } = readRequest(b, L);
      if (errs.length) { page(req, res, baseHeaders, L, x.regTitle, regForm(L, o, errs), 400); return true; }
      const keys = [`pub-demande-ip:${ip}`, `pub-demande:${o.email}`];
      if (await lim.blocked(keys)) { page(req, res, baseHeaders, L, x.regTitle, `<h1>${esc(x.regTitle)}</h1><div class="alert" role="alert"><p>${esc(x.tooMany)}</p></div>`, 429); return true; }
      await lim.fail(keys);
      const { ticket, code } = await newCode(db, 'demande', o.email, JSON.stringify(o));
      // Document gardé à part (pas dans le formulaire en attente), rattaché au ticket ; les dépôts jamais vérifiés sont
      // effacés après 24 h.
      await db.run('DELETE FROM school_request_document WHERE request_id IS NULL AND created_at < ?', iso(-24 * 3600e3));
      await db.run(`INSERT INTO school_request_document (ticket_hash, kind, filename, mime, size, sha256, data, created_at) VALUES (?,?,?,?,?,?,?,?)`,
        auth.sha256(ticket), doc.kind, doc.filename, doc.mime, doc.data.length, crypto.createHash('sha256').update(doc.data).digest('hex'), doc.data.toString('base64'), iso());
      await sendMail(ctx, o.email, MAIL.codeDemande[L](code));
      page(req, res, baseHeaders, L, x.codeTitle, codeForm(L, `${pre(L)}/inscrire-ecole`, ticket, x.codeSent(o.email, CODE_MIN)));
      return true;
    }

    if (name === '/compte/code') {
      if (b.site_web) { page(req, res, baseHeaders, L, x.codeTitle, codeForm(L, `${pre(L)}/compte/verifier`, crypto.randomBytes(24).toString('base64url'), x.codeSentAcc(CODE_MIN))); return true; }
      const raw = str(b.identifier, 254);
      const ident = raw.includes('@') ? (EMAIL_RE.test(raw.toLowerCase()) ? raw.toLowerCase() : null) : normalizePhone(raw);
      const mode = b.mode === 'signup' ? 'signup' : 'login';
      const follow = SLUG_RE.test(String(b.suivre || '')) ? String(b.suivre) : null;
      const opts = { mode, follow };
      if (!ident) { page(req, res, baseHeaders, L, x.account, accountLogin(L, raw.includes('@') ? x.errEmail : x.errPhone, null, opts), 400); return true; }
      const keys = [`pub-code-ip:${ip}`, `pub-code:${ident}`];
      if (await lim.blocked(keys)) { page(req, res, baseHeaders, L, x.account, accountLogin(L, x.tooMany, null, opts), 429); return true; }
      await lim.fail(keys);
      const subs = mode === 'signup' ? SUBS.filter((k) => b[`sub_${k}`] === '1' || b[`sub_${k}`] === 'on') : null;
      const { ticket, code } = await newCode(db, 'compte', ident, JSON.stringify({ lang: L, subs, follow }));
      const sms = !ident.includes('@');
      await sendMail(ctx, ident, MAIL.codeCompte[L](code), { channel: sms ? 'sms' : 'email' });
      page(req, res, baseHeaders, L, x.codeTitle, codeForm(L, `${pre(L)}/compte/verifier`, ticket, `${x.codeSentAcc(CODE_MIN)}${sms ? ` ${x.smsNote}` : ''}`));
      return true;
    }
    if (name === '/compte/verifier') {
      const keys = [`pub-verif:${ip}`];
      if (await lim.blocked(keys)) { page(req, res, baseHeaders, L, x.account, accountLogin(L, x.tooMany), 429); return true; }
      const row = await checkCode(db, 'compte', b.ticket, b.code);
      if (!row) { await lim.fail(keys); page(req, res, baseHeaders, L, x.codeTitle, codeForm(L, `${pre(L)}/compte/verifier`, b.ticket, '', x.badCode) + `<p><a href="${pre(L)}/compte">${esc(x.restart)}</a></p>`, 400); return true; }
      const col = row.identifier.includes('@') ? 'email' : 'phone';
      let acc = await db.get(`SELECT * FROM public_account WHERE ${col} = ?`, row.identifier);
      let o = {}; try { o = JSON.parse(row.payload || '{}') || {}; } catch { o = {}; }
      if (!acc) {
        // Inscription : abonnements choisis sur le formulaire (liste blanche SUBS) ; connexion simple : aucun abonnement.
        const sub = (k) => (Array.isArray(o.subs) && o.subs.includes(k) ? 1 : 0);
        const id = await db.insert(`INSERT INTO public_account (${col}, lang, link_key, sub_annonces, sub_evenements, sub_actualites, sub_laureats, created_at) VALUES (?,?,?,?,?,?,?,?)`,
          row.identifier, L, crypto.randomBytes(24).toString('base64url'), sub('annonces'), sub('evenements'), sub('actualites'), sub('laureats'), iso());
        acc = { id };
      }
      const fol = o.follow ? await schoolBySlug(o.follow) : null;
      const followedOk = fol ? await addFollow(acc, fol) : false;
      await db.run('UPDATE public_account SET last_login_at = ? WHERE id = ?', iso(), acc.id);
      await db.run('DELETE FROM public_session WHERE expires_at < ?', iso());
      const token = crypto.randomBytes(32).toString('base64url');
      await db.run('INSERT INTO public_session (token_hash, account_id, expires_at, created_at) VALUES (?,?,?,?)', auth.sha256(token), acc.id, iso(SESSION_DAYS * 86400e3), iso());
      // Un compte public n'ouvre jamais un portail d'école : retour sur « Mon compte », toujours.
      redirect(res, baseHeaders, `${pre(L)}/compte${fol ? (followedOk ? `?suivi=${fol.slug}` : '?max=1') : ''}`, [`${COOKIE}=${token}; ${cookieAttrs()}; Max-Age=${SESSION_DAYS * 86400}`, `${MARK}=1; ${markAttrs()}; Max-Age=${SESSION_DAYS * 86400}`]);
      return true;
    }
    if (name === '/compte/suivre') {
      const school = await schoolBySlug(b.ecole);
      const acc0 = await loadAccount(db, parseCookies(req.headers.cookie)[COOKIE]);
      if (!school) { redirect(res, baseHeaders, `${pre(L)}/ecoles`); return true; }
      if (!acc0) { redirect(res, baseHeaders, `${pre(L)}/compte?suivre=${school.slug}`); return true; }
      if (b.action === 'retirer') {
        await db.run('DELETE FROM public_follow WHERE account_id = ? AND school_id = ?', acc0.id, school.id);
        redirect(res, baseHeaders, `${pre(L)}/compte?retire=${school.slug}`); return true;
      }
      const ok = await addFollow(acc0, school);
      redirect(res, baseHeaders, `${pre(L)}/compte?${ok ? `suivi=${school.slug}` : 'max=1'}`);
      return true;
    }
    // Actions d'un compte connecté (cookie SameSite=Lax : jamais envoyé par un formulaire d'un autre site).
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const acc = await loadAccount(db, token);
    if (!acc) { redirect(res, baseHeaders, `${pre(L)}/compte`); return true; }
    if (name === '/compte/abonnements') {
      const on = (k) => (b[k] === '1' || b[k] === 'on' || b[k] === true ? 1 : 0);
      const dep = DEPS.includes(b.department) ? b.department : null;
      await db.run('UPDATE public_account SET sub_annonces = ?, sub_evenements = ?, sub_actualites = ?, sub_laureats = ?, department = ?, lang = ? WHERE id = ?',
        on('annonces'), on('evenements'), on('actualites'), on('laureats'), dep, b.lang === 'ht' ? 'ht' : (b.lang === 'fr' ? 'fr' : acc.lang), acc.id);
      redirect(res, baseHeaders, `${pre(L)}/compte?ok=1`);
      return true;
    }
    if (name === '/compte/deconnexion') {
      await db.run('DELETE FROM public_session WHERE token_hash = ?', auth.sha256(token));
      redirect(res, baseHeaders, pre(L) || '/', [`${COOKIE}=; ${cookieAttrs()}; Max-Age=0`, `${MARK}=; ${markAttrs()}; Max-Age=0`]);
      return true;
    }
    if (name === '/compte/supprimer') {
      if (!(b.confirm === '1' || b.confirm === 'on')) { redirect(res, baseHeaders, `${pre(L)}/compte`); return true; }
      await db.run('DELETE FROM public_session WHERE account_id = ?', acc.id);
      await db.run('DELETE FROM public_account WHERE id = ?', acc.id);
      redirect(res, baseHeaders, `${pre(L)}/compte?supprime=1`, [`${COOKIE}=; ${cookieAttrs()}; Max-Age=0`, `${MARK}=; ${markAttrs()}; Max-Age=0`]);
      return true;
    }
    return false;
  }

  // Flux RSS des annonces officielles en cours (sans compte). /annonces.rss (FR) et /ht/annonces.rss (HT).
  async function rss(req, res, url, baseHeaders) {
    if (url.pathname !== '/annonces.rss' && url.pathname !== '/ht/annonces.rss') return false;
    const L = url.pathname.startsWith('/ht/') ? 'ht' : 'fr'; const base = baseOf(req); const pfx = pre(L);
    const ads = (await Pt.createPublic(db).ads({ n: 50, sponsored: false }));
    const x = (s) => esc(s);
    const pick = (a, k) => a[`${k}_${L}`] || a[`${k}_${L === 'fr' ? 'ht' : 'fr'}`] || '';
    const items = ads.map((a) => `<item><title>${x(pick(a, 'title'))}</title><link>${x(a.link ? `${base}/p/clic/${a.id}` : `${base}${pfx}/annonces`)}</link><guid isPermaLink="false">noria-annonce-${a.id}</guid><pubDate>${new Date(`${a.starts_on}T12:00:00Z`).toUTCString()}</pubDate><description>${x(pick(a, 'text'))}</description></item>`).join('');
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${x(L === 'ht' ? 'NORIA — Anons' : 'NORIA — Annonces')}</title><link>${x(`${base}${pfx}/annonces`)}</link><description>${x(T[L].desc.annonces)}</description><language>${L}</language>${items}</channel></rss>\n`;
    write(req, res, baseHeaders, { status: 200, body, type: 'application/rss+xml; charset=utf-8', cache: 'public, max-age=600' });
    return true;
  }

  return { get, post, rss, handlesPost: (p) => PATHS.test(p) };
}

module.exports = { MARK, SUBS, createPublicSite, adminRoutes, notifyPublished, inviteDirection, unsubscribe, unsubLink, slugify, X, COOKIE, PATHS };
