'use strict';
// Bloc 7 : adresses e-mail professionnelles des élèves — construites, DÉSACTIVÉES par défaut (NORIA_EMAIL_ELEVES=0 :
// pages, scripts et routes renvoient 404, comme le portail du ministère).
//   - Adresse dérivée du code élève (minuscules, sans accents), unique dans toute la plateforme et jamais réattribuée ;
//     sous-domaine et préfixe facultatifs par école. Création en masse par la direction après un aperçu (empreinte).
//   - « Synchronisation » = transfert vers une adresse personnelle VÉRIFIÉE (lien ou code à 6 chiffres) de l'élève, ou
//     d'un parent lié pour un mineur. L'élève ou le parent peut la changer ; l'ancienne destination est prévenue.
//   - Mineur : l'adresse ne transfère rien sans le consentement d'un parent (dans son espace) ou un consentement écrit
//     enregistré par la direction. Les adresses ne sont jamais publiées (portail, annuaire, ministère).
//   - Cycle de vie : suspension (et reprise), transfert (règle ci-dessous), fin de scolarité avec délai, journal.
//   - Règle de transfert : sans sous-domaine ni préfixe des deux côtés, l'adresse suit l'élève (comme son code) ;
//     sinon l'ancienne adresse est « redirigée » NORIA_EMAIL_REDIRECTION_JOURS jours puis désactivée, et l'école
//     d'accueil crée la nouvelle (le lien est gardé dans replaced_by).
const crypto = require('node:crypto');
const P = require('./policy');
const F = require('./email-fournisseurs');
const { HttpError, notFound, audit, refuse } = require('./common');

const enabled = (ctx) => String(envOf(ctx).NORIA_EMAIL_ELEVES || '0') === '1';
const GATED = /^\/api\/emails(\/|$)|^\/email\/verifier\/?$|^\/src\/(emails-eleves|mon-email|email-verif)\.(js|css)$/;
const CURRENT = ['en_attente', 'active', 'suspendue'];
const RESERVED = new Set(['postmaster', 'abuse', 'admin', 'administrateur', 'root', 'noreply', 'no-reply', 'hostmaster', 'webmaster', 'security', 'support', 'contact', 'info', 'direction', 'noria', 'ministere', 'mailer-daemon']);
const DEST_TTL_H = 24, DEST_MAX_ATTEMPTS = 5, DEST_PER_HOUR = 5;
const EMAIL = /^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const DOMAIN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const LABEL = /^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$/;

function envOf(ctx) { return (ctx && ctx.env) || process.env; }
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const int = (v) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, 'identifiant invalide'); return x; };
const haitiDay = (ms = Date.now(), ctx) => new Date(ms).toLocaleDateString('en-CA', { timeZone: envOf(ctx).NORIA_TZ || 'America/Port-au-Prince' });
const days = (ctx, name, def) => { const n = Number(envOf(ctx)[name]); return Number.isInteger(n) && n >= 0 && n <= 3650 ? n : def; };
const delayDays = (ctx) => days(ctx, 'NORIA_EMAIL_DELAI_JOURS', 90);
const redirectDays = (ctx) => days(ctx, 'NORIA_EMAIL_REDIRECTION_JOURS', 90);
const addDays = (ctx, n) => haitiDay(Date.now() + n * 86400e3, ctx);

function baseDomain(ctx) {
  const d = String(envOf(ctx).NORIA_EMAIL_DOMAINE || '').trim().toLowerCase();
  return DOMAIN.test(d) ? d : null;
}
// Partie locale : minuscules, accents retirés, tout autre caractère → tiret, 48 caractères au plus.
function slug(s, max = 48) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
}
function domainFor(ctx, settings) {
  const base = baseDomain(ctx);
  if (!base) return null;
  return settings && settings.subdomain ? `${settings.subdomain}.${base}` : base;
}
// Format de la partie locale (réglage de l'école) : code élève (défaut, stable et unique), prenom.nom, p.nom,
// prenom.nom.annee (année d'inscription). Les homonymes reçoivent -2, -3… lors de la vérification d'unicité.
const FORMATS = ['code', 'prenom.nom', 'p.nom', 'prenom.nom.annee'];
function localFor(code, settings, s) {
  const f = (settings && settings.local_format) || 'code';
  const fn = s ? slug(s.first_name, 20) : '', ln = s ? slug(s.last_name, 24) : '';
  let l;
  if (f === 'code' || !fn || !ln) l = slug(code) || 'eleve';
  else if (f === 'prenom.nom') l = `${fn}.${ln}`;
  else if (f === 'p.nom') l = `${fn[0]}.${ln}`;
  else l = `${fn}.${ln}.${new Date().getFullYear() % 100}`;
  return settings && settings.prefix ? `${settings.prefix}.${l}` : l;
}
// Masque une adresse de destination : « a***s@gmail.com ».
function mask(e) {
  const s = String(e || ''); const i = s.lastIndexOf('@');
  if (i < 1) return s ? '***' : null;
  const l = s.slice(0, i);
  return `${l[0]}${l.length > 2 ? '***' + l[l.length - 1] : '***'}${s.slice(i)}`;
}
function minorOf(birth, ctx) {
  if (!birth || !/^\d{4}-\d{2}-\d{2}/.test(birth)) return 1; // âge inconnu : traité comme mineur (prudence)
  const today = haitiDay(Date.now(), ctx);
  const [y, m, d] = birth.slice(0, 10).split('-').map(Number); const [ty, tm, td] = today.split('-').map(Number);
  const age = ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
  return age < 18 ? 1 : 0;
}

/* ---------- Adaptateurs ---------- */
const adapters = (ctx) => ({
  routing: F.routing(envOf(ctx), { fetch: ctx.emailFetch || globalThis.fetch }),
  outbound: F.outbound(envOf(ctx), { fetch: ctx.emailFetch || globalThis.fetch, notifier: ctx.notifier }),
});
function providerInfo(ctx) {
  const env = envOf(ctx);
  return { routage: String(env.NORIA_EMAIL_FOURNISSEUR || 'simule').toLowerCase(), envoi: String(env.NORIA_EMAIL_ENVOI || 'simule').toLowerCase() };
}
function fromAddress(ctx) {
  const env = envOf(ctx);
  return env.NORIA_EMAIL_EXPEDITEUR || `NORIA <no-reply@${baseDomain(ctx) || 'noria.invalid'}>`;
}
async function sendMail(ctx, to, subject, text) {
  try { await adapters(ctx).outbound.send({ from: fromAddress(ctx), to, subject, text }); return 'envoye'; } catch (e) { console.error(`[e-mails élèves] envoi impossible : ${e.message}`); return 'echec'; }
}

/* ---------- Journal ---------- */
async function event(t, e, kind, actor, userId, detail) {
  await t.insert('INSERT INTO student_email_event (school_id, email_id, student_id, kind, actor, user_id, detail, created_at) VALUES (?,?,?,?,?,?,?,?)',
    e.school_id, e.id, e.student_id, kind, actor, userId || null, detail ? String(detail).slice(0, 300) : null, iso());
}
const actorOf = (u) => (P.has(u, 'direction') || P.has(u, 'secretariat') ? 'direction' : P.has(u, 'parent') ? 'parent' : P.has(u, 'eleve') ? 'eleve' : 'direction');
function secRecord(ctx, req, u, detail) {
  if (!ctx.sec) return;
  ctx.sec.record({ kind: 'email_eleve', ip: req && req.ip, ua: req && req.headers && req.headers['user-agent'], school_id: u && u.school_id, user_id: u && u.id, role: u && u.roles && u.roles[0], path: req && req.url, detail });
}

/* ---------- Fournisseur : alignement de la règle de transfert sur l'état ---------- */
async function destOf(t, e) {
  return e.destination_id ? t.get('SELECT * FROM student_email_dest WHERE id = ? AND verified_at IS NOT NULL AND revoked_at IS NULL', e.destination_id) : null;
}
async function sync(t, ctx, e) {
  const fresh = await t.get('SELECT * FROM student_email WHERE id = ?', e.id);
  const d = await destOf(t, fresh);
  const forward = ['active', 'redirigee'].includes(fresh.status) && d;
  const { routing } = adapters(ctx);
  try {
    if (forward) {
      const r = await routing.upsert({ address: fresh.address, destination: d.email, ref: fresh.provider_ref });
      await t.run('UPDATE student_email SET provider_ref = ?, provider_state = ?, provider_error = NULL, updated_at = ? WHERE id = ?', r.ref || fresh.provider_ref, routing.simulated ? 'simule' : 'ok', iso(), fresh.id);
    } else if (fresh.provider_ref) {
      await routing.remove({ address: fresh.address, ref: fresh.provider_ref });
      await t.run("UPDATE student_email SET provider_ref = NULL, provider_state = 'aucun', provider_error = NULL, updated_at = ? WHERE id = ?", iso(), fresh.id);
    }
  } catch (err) {
    await t.run("UPDATE student_email SET provider_state = 'echec', provider_error = ?, updated_at = ? WHERE id = ?", String(err.message).slice(0, 200), iso(), fresh.id);
    await event(t, fresh, 'fournisseur_echec', 'systeme', null, err.message);
  }
}
// Active ou remet en attente selon les conditions : consentement (mineur) ET destination vérifiée.
async function refresh(t, ctx, id, actor = 'systeme', userId = null) {
  const e = await t.get('SELECT * FROM student_email WHERE id = ?', id);
  if (!e) return null;
  if (['en_attente', 'active'].includes(e.status)) {
    const ok = (!e.minor || e.consent_at) && (await destOf(t, e));
    const want = ok ? 'active' : 'en_attente';
    if (want !== e.status) {
      await t.run('UPDATE student_email SET status = ?, updated_at = ? WHERE id = ?', want, iso(), e.id);
      await event(t, e, want === 'active' ? 'activation' : 'mise_en_attente', actor, userId, null);
    }
  }
  await sync(t, ctx, e);
  return t.get('SELECT * FROM student_email WHERE id = ?', id);
}

/* ---------- Balayage : fins programmées et élèves retirés ---------- */
// Appelé à la consultation (pas de tâche planifiée nécessaire) : connexion système, toutes écoles.
async function sweep(sys, ctx) {
  const today = haitiDay(Date.now(), ctx);
  const due = await sys.all("SELECT * FROM student_email WHERE status <> 'desactivee' AND ends_on IS NOT NULL AND ends_on <= ?", today);
  for (const e of due) {
    await sys.tx(async (x) => {
      await x.run("UPDATE student_email SET status = 'desactivee', deactivated_at = ?, updated_at = ? WHERE id = ? AND status <> 'desactivee'", iso(), iso(), e.id);
      await event(x, e, 'desactivation', 'systeme', null, `fin prévue le ${e.ends_on}`);
      await sync(x, ctx, e);
    });
  }
  // Élève retiré (plus aucune inscription active, au moins une « retire ») : fin programmée avec délai.
  const gone = await sys.all(`SELECT e.* FROM student_email e WHERE e.status IN ('en_attente','active','suspendue') AND e.ends_on IS NULL
    AND EXISTS (SELECT 1 FROM enrollment r WHERE r.school_id = e.school_id AND r.student_id = e.student_id AND r.status = 'retire')
    AND NOT EXISTS (SELECT 1 FROM enrollment a WHERE a.school_id = e.school_id AND a.student_id = e.student_id AND a.status = 'actif')`);
  for (const e of gone) {
    const end = addDays(ctx, delayDays(ctx));
    await sys.run('UPDATE student_email SET ends_on = ?, reason = ?, updated_at = ? WHERE id = ?', end, 'Élève retiré : fin de scolarité', iso(), e.id);
    await event(sys, e, 'fin_programmee', 'systeme', null, `élève retiré — désactivation le ${end}`);
  }
  // Adresse « redirigée » après un transfert : lien vers la nouvelle adresse créée par l'école d'accueil.
  await sys.run(`UPDATE student_email SET replaced_by = (SELECT MIN(n.id) FROM student_email n WHERE n.student_code = student_email.student_code
      AND n.school_id <> student_email.school_id AND n.id > student_email.id)
    WHERE status IN ('redirigee','desactivee') AND replaced_by IS NULL AND scoped IN (0,1)
      AND EXISTS (SELECT 1 FROM student_email n WHERE n.student_code = student_email.student_code AND n.school_id <> student_email.school_id AND n.id > student_email.id)`);
  return { desactivees: due.length, programmees: gone.length };
}

/* ---------- Transfert (appelé dans la transaction de transferts.finalize) ---------- */
async function onTransfer(x, ctx, t, newStudentId) {
  const e = await x.get(`SELECT * FROM student_email WHERE school_id = ? AND student_id = ? AND status IN ('en_attente','active','suspendue')`, t.from_school_id, t.from_student_id);
  if (!e) return null;
  const target = await x.get('SELECT * FROM school_email_settings WHERE school_id = ?', t.to_school_id);
  const targetScoped = !!(target && (target.subdomain || target.prefix));
  const already = await x.get(`SELECT id FROM student_email WHERE school_id = ? AND student_id = ? AND status IN ('en_attente','active','suspendue')`, t.to_school_id, newStudentId);
  if (!e.scoped && !targetScoped && !already) {
    // L'adresse suit l'élève, avec sa destination vérifiée et son consentement.
    await event(x, e, 'transfert_sortant', 'systeme', null, `adresse transférée avec l'élève (transfert n° ${t.id})`);
    await x.run('UPDATE student_email_dest SET school_id = ?, student_id = ? WHERE school_id = ? AND student_id = ?', t.to_school_id, newStudentId, t.from_school_id, t.from_student_id);
    await x.run('UPDATE student_email SET school_id = ?, student_id = ?, updated_at = ? WHERE id = ?', t.to_school_id, newStudentId, iso(), e.id);
    const moved = await x.get('SELECT * FROM student_email WHERE id = ?', e.id);
    await event(x, moved, 'transfert_entrant', 'systeme', null, `adresse reçue avec l'élève (transfert n° ${t.id})`);
    return 'suit';
  }
  const end = addDays(ctx, redirectDays(ctx));
  await x.run("UPDATE student_email SET status = 'redirigee', ends_on = ?, reason = ?, updated_at = ? WHERE id = ?", end, `Élève transféré (transfert n° ${t.id})`, iso(), e.id);
  await event(x, e, 'redirection', 'systeme', null, `transfert n° ${t.id} — transfert maintenu jusqu'au ${end}`);
  await sync(x, ctx, e);
  return 'redirigee';
}

/* ---------- Documents officiels ---------- */
async function activeAddress(db, ctx, schoolId, studentId) {
  if (!enabled(ctx)) return null;
  const e = await db.get("SELECT address FROM student_email WHERE school_id = ? AND student_id = ? AND status = 'active'", schoolId, studentId);
  return e ? e.address : null;
}

/* ---------- Création en masse ---------- */
async function settingsOf(db, schoolId) { return db.get('SELECT * FROM school_email_settings WHERE school_id = ?', schoolId); }
async function eligible(t, u, body) {
  const all = body && (body.tout === true || body.tout === 'true' || body.tout === 1);
  if (!all && !(body && body.class_id)) throw new HttpError(400, 'classe ou école entière obligatoire');
  const params = [u.school_id];
  let sql = `SELECT DISTINCT s.id, s.code, s.first_name, s.last_name, s.birth_date, c.name AS classe FROM student s
    LEFT JOIN enrollment en ON en.school_id = s.school_id AND en.student_id = s.id AND en.status = 'actif'
    LEFT JOIN class c ON c.school_id = en.school_id AND c.id = en.class_id
    WHERE s.school_id = ? AND s.status = 'actif'
      AND NOT EXISTS (SELECT 1 FROM student_email e WHERE e.school_id = s.school_id AND e.student_id = s.id AND e.status IN ('en_attente','active','suspendue'))`;
  if (!all) { sql += ' AND c.id = ?'; params.push(int(body.class_id)); }
  return t.all(`${sql} ORDER BY c.name, s.last_name, s.first_name, s.id`, ...params);
}
async function propose(t, ctx, u, body) {
  const settings = await settingsOf(t, u.school_id);
  const domain = domainFor(ctx, settings);
  if (!domain) throw new HttpError(409, 'domaine non configuré (NORIA_EMAIL_DOMAINE)');
  const rows = await eligible(t, u, body);
  const used = new Set(), seen = new Set();
  const out = [];
  for (const s of rows) {
    if (seen.has(s.id)) continue; seen.add(s.id);
    const base = localFor(s.code, settings, s);
    let local = base, n = 1, collision = false;
    // Unicité : vérifiée dans toute la plateforme (connexion système ; le cloisonnement cache les autres écoles).
    for (;;) {
      const address = `${local}@${domain}`;
      const bare = local.split('.').pop();
      const taken = used.has(address) || RESERVED.has(bare) || RESERVED.has(local) || await ctx.db.get('SELECT 1 AS x FROM student_email WHERE address = ?', address);
      if (!taken) break;
      collision = true; n++; local = `${base}-${n}`;
    }
    const address = `${local}@${domain}`;
    used.add(address);
    out.push({ student_id: s.id, eleve: `${s.first_name} ${s.last_name}`, code: s.code, classe: s.classe || '—', adresse: address, local, mineur: !!minorOf(s.birth_date, ctx), collision });
  }
  const empreinte = sha256(JSON.stringify([domain, out.map((p) => [p.student_id, p.adresse])])).slice(0, 24);
  return { domaine: domain, scoped: !!(settings && (settings.subdomain || settings.prefix)), propositions: out, empreinte };
}

// Création automatique à l'inscription d'un élève (si NORIA_EMAIL_ELEVES=1, domaine configuré et réglage « auto »
// activé). Adresse en attente : elle ne transfère rien tant qu'une destination n'est pas vérifiée (et, pour un
// mineur, tant que le consentement parental n'est pas donné). Ne lève jamais : l'inscription prime.
async function autoCreate(t, ctx, u, studentId) {
  try {
    if (!enabled(ctx)) return null;
    const settings = await settingsOf(t, u.school_id);
    if (!settings || !Number(settings.auto_on_enrol)) return null;
    const domain = domainFor(ctx, settings);
    if (!domain) return null;
    const s = await t.get('SELECT id, code, first_name, last_name, birth_date FROM student WHERE school_id = ? AND id = ?', u.school_id, studentId);
    if (!s || await t.get(`SELECT 1 AS x FROM student_email WHERE school_id = ? AND student_id = ? AND status IN ('en_attente','active','suspendue')`, u.school_id, s.id)) return null;
    const base = localFor(s.code, settings, s);
    let local = base;
    for (let n = 2; n < 500; n++) {
      const bare = local.split('.').pop();
      if (!RESERVED.has(bare) && !RESERVED.has(local) && !(await ctx.db.get('SELECT 1 AS x FROM student_email WHERE address = ?', `${local}@${domain}`))) break;
      local = `${base}-${n}`;
    }
    const address = `${local}@${domain}`, at = iso(), minor = minorOf(s.birth_date, ctx) ? 1 : 0;
    const id = await t.insert(`INSERT INTO student_email (school_id, student_id, student_code, address, local_part, scoped, status, minor, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, u.school_id, s.id, s.code, address, local, settings.subdomain || settings.prefix ? 1 : 0, 'en_attente', minor, u.id, at, at);
    await event(t, { id, school_id: u.school_id, student_id: s.id }, 'creation_auto', 'systeme', u.id, minor ? 'inscription — mineur : consentement parental requis' : 'inscription');
    return address;
  } catch (e) { if (ctx && ctx.log) ctx.log('email auto', e.message); return null; }
}

/* ---------- Présentation ---------- */
async function row(t, e, { full = false } = {}) {
  const d = e.destination_id ? await t.get('SELECT * FROM student_email_dest WHERE id = ?', e.destination_id) : null;
  const pending = await t.get('SELECT * FROM student_email_dest WHERE school_id = ? AND student_id = ? AND verified_at IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1', e.school_id, e.student_id, iso());
  const r = {
    id: e.id, student_id: e.student_id, code: e.student_code, adresse: e.address, statut: e.status, mineur: !!e.minor,
    consentement: e.consent_at ? { le: e.consent_at, mode: e.consent_mode, nom: e.consent_name } : null,
    destination: d && d.verified_at && !d.revoked_at ? { email: full ? d.email : mask(d.email), masque: mask(d.email), proprietaire: d.owner, verifiee_le: d.verified_at } : null,
    verification_en_cours: pending ? { email: mask(pending.email), proprietaire: pending.owner, expire: pending.expires_at } : null,
    fournisseur: e.provider_state, erreur_fournisseur: full ? null : e.provider_error, transferts: Number(e.forwarded || 0),
    fin_prevue: e.ends_on, motif: e.reason, cree_le: e.created_at, desactivee_le: e.deactivated_at,
  };
  return r;
}

/* ---------- Destination : demande et vérification ---------- */
async function canManage(t, u, e) {
  if (P.has(u, 'eleve')) {
    const s = await t.get('SELECT id FROM student WHERE school_id = ? AND id = ? AND user_id = ?', u.school_id, e.student_id, u.id);
    if (s) return 'eleve';
  }
  if (P.has(u, 'parent')) {
    const l = await t.get('SELECT 1 AS x FROM parent_link WHERE school_id = ? AND parent_user_id = ? AND student_id = ?', u.school_id, u.id, e.student_id);
    if (l) return 'parent';
  }
  return null;
}
function verifyText(v) {
  return `Bonjour,\n\nQuelqu'un demande que les messages adressés à ${v.address} (adresse NORIA de ${v.eleve}, ${v.school}) soient transférés vers cette adresse.\n`
    + `Code : ${v.code} (valable ${DEST_TTL_H} h)\nOu confirmez avec ce lien : ${v.link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne sera transféré.\n\n`
    + `---\nBonjou,\n\nYon moun mande pou mesaj ki voye bay ${v.address} (adrès NORIA ${v.eleve}, ${v.school}) vin jwenn adrès sa a.\n`
    + `Kòd : ${v.code} (li bon pou ${DEST_TTL_H} è)\nOswa konfime ak lyen sa a : ${v.link}\n\nSi se pa ou ki fè demann lan, pa okipe mesaj sa a : anyen p ap transfere.\n\nNORIA`;
}
function changedText(v) {
  return `Bonjour,\n\nLes messages adressés à ${v.address} ne sont plus transférés vers cette adresse : une nouvelle destination a été vérifiée le ${v.at.slice(0, 10)}.\n`
    + `Si ce changement vous surprend, prévenez la direction de ${v.school}.\n\n---\nBonjou,\n\nMesaj ki voye bay ${v.address} p ap vin jwenn adrès sa a ankò : yon lòt destinasyon verifye le ${v.at.slice(0, 10)}.\n`
    + `Si chanjman sa a sezi w, avèti direksyon ${v.school}.\n\nNORIA`;
}
async function confirmDest(sys, ctx, dest, how) {
  // Transaction de l'école (RLS en PostgreSQL) pour toute l'opération.
  return sys.asSchool(dest.school_id, async (t) => {
    const e = await t.get(`SELECT * FROM student_email WHERE school_id = ? AND student_id = ? AND status IN ('en_attente','active','suspendue','redirigee') ORDER BY id DESC LIMIT 1`, dest.school_id, dest.student_id);
    if (!e) throw new HttpError(404, 'introuvable');
    const old = await destOf(t, e);
    const at = iso();
    await t.run('UPDATE student_email_dest SET verified_at = ? WHERE id = ?', at, dest.id);
    await t.run('UPDATE student_email_dest SET revoked_at = ? WHERE school_id = ? AND student_id = ? AND id <> ? AND revoked_at IS NULL', at, dest.school_id, dest.student_id, dest.id);
    await t.run('UPDATE student_email SET destination_id = ?, updated_at = ? WHERE id = ?', dest.id, at, e.id);
    await event(t, e, 'destination_verifiee', dest.owner, dest.user_id, `${mask(dest.email)} (${dest.owner}, par ${how})`);
    const school = await t.get('SELECT name FROM school WHERE id = ?', dest.school_id);
    if (old && old.email !== dest.email) await sendMail(ctx, old.email, `NORIA : destination modifiée pour ${e.address}`, changedText({ address: e.address, at, school: school.name }));
    const fresh = await refresh(t, ctx, e.id, dest.owner, dest.user_id);
    return { adresse: fresh.address, statut: fresh.status, destination: mask(dest.email) };
  });
}

/* ---------- Page publique de vérification (lien reçu par e-mail) ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function page(title, body) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} — NORIA</title><link rel="stylesheet" href="/src/email-verif.css"></head>
<body><main class="ev"><p class="ev-brand">NORIA</p>${body}</main></body></html>`;
}
const VERIFY_CSP = "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
async function serveVerify(db, req, res, url, ctx, headers) {
  const out = (status, html) => {
    res.writeHead(status, { ...headers, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': VERIFY_CSP });
    res.end(req.method === 'HEAD' ? undefined : html);
  };
  if (!['GET', 'HEAD', 'POST'].includes(req.method)) return out(405, page('Méthode refusée', '<h1>Méthode refusée</h1>'));
  let token = url.searchParams.get('t') || '';
  if (req.method === 'POST') {
    let raw = '';
    for await (const c of req) { raw += c; if (raw.length > 4096) return out(413, page('Trop volumineux', '<h1>Trop volumineux</h1>')); }
    token = new URLSearchParams(raw).get('t') || '';
  }
  token = String(token).slice(0, 100);
  const invalid = () => out(410, page('Lien invalide', `<h1>Lien invalide ou expiré</h1><p>Demandez un nouveau lien depuis NORIA (espace élève ou parent).</p>
<p lang="ht" class="ev-ht">Lyen an pa bon ankò. Mande yon lòt nan NORIA (espas elèv oswa paran).</p>`));
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return invalid();
  const dest = await db.get('SELECT * FROM student_email_dest WHERE token_hash = ?', sha256(token));
  if (!dest || dest.revoked_at || (!dest.verified_at && (dest.expires_at <= iso() || dest.attempts >= DEST_MAX_ATTEMPTS))) return invalid();
  const e = await db.get(`SELECT address, status FROM student_email WHERE school_id = ? AND student_id = ? AND status <> 'desactivee' ORDER BY id DESC LIMIT 1`, dest.school_id, dest.student_id);
  if (!e) return invalid();
  if (dest.verified_at) return out(200, page('Adresse déjà vérifiée', `<h1>Adresse déjà vérifiée</h1><p><strong>${esc(mask(dest.email))}</strong> reçoit les messages de <strong>${esc(e.address)}</strong>.</p><p lang="ht" class="ev-ht">Adrès sa a deja verifye.</p>`));
  if (req.method !== 'POST') {
    // Confirmation par bouton (POST) : les robots qui ouvrent les liens des e-mails ne valident rien.
    return out(200, page('Confirmer l’adresse', `<h1>Confirmer l’adresse de transfert</h1>
<p>Les messages envoyés à <strong>${esc(e.address)}</strong> seront transférés vers <strong>${esc(mask(dest.email))}</strong>.</p>
<p lang="ht" class="ev-ht">Mesaj ki voye bay <strong>${esc(e.address)}</strong> ap vin jwenn <strong>${esc(mask(dest.email))}</strong>.</p>
<form method="post" action="/email/verifier"><input type="hidden" name="t" value="${esc(token)}"><button type="submit">Confirmer · Konfime</button></form>
<p class="ev-small">Vous n’êtes pas à l’origine de la demande ? Fermez cette page : rien ne sera transféré.<br><span lang="ht">Se pa ou ki mande sa ? Fèmen paj la : anyen p ap transfere.</span></p>`));
  }
  try { await confirmDest(db, ctx, dest, 'lien'); } catch (err) { if (err instanceof HttpError) return invalid(); throw err; }
  return out(200, page('Adresse vérifiée', `<h1>Adresse vérifiée</h1><p>Les messages de <strong>${esc(e.address)}</strong> arriveront désormais sur <strong>${esc(mask(dest.email))}</strong>.</p>
<p lang="ht" class="ev-ht">Adrès la verifye. Mesaj <strong>${esc(e.address)}</strong> ap vin jwenn <strong>${esc(mask(dest.email))}</strong>.</p><p><a href="/app">Retour à NORIA · Retounen nan NORIA</a></p>`));
}

/* ---------- Routes ---------- */
function schoolRoutes() {
  const gate = (ctx) => { if (!enabled(ctx)) throw new HttpError(404, 'introuvable'); };
  const staff = (u) => P.has(u, 'direction', 'secretariat');
  const loadEmail = async (t, u, id) => { const e = await t.get('SELECT * FROM student_email WHERE id = ? AND school_id = ?', int(id), u.school_id); if (!e) notFound(); return e; };
  return [
    // Vue de la direction (écriture) et du secrétariat (lecture) : réglages, classes, adresses.
    ['GET', /^\/api\/emails$/, async (t, req, u, _m, ctx) => {
      gate(ctx);
      if (!staff(u)) await refuse(ctx, u, 'emails.list', 'student_email', null, 'rôle');
      await sweep(ctx.db, ctx);
      const settings = await settingsOf(t, u.school_id);
      const list = await t.all(`SELECT e.*, s.first_name, s.last_name FROM student_email e JOIN student s ON s.school_id = e.school_id AND s.id = e.student_id
        WHERE e.school_id = ? ORDER BY CASE e.status WHEN 'desactivee' THEN 1 ELSE 0 END, s.last_name, s.first_name, e.id`, u.school_id);
      const adresses = [];
      for (const e of list) adresses.push({ ...(await row(t, e)), eleve: `${e.first_name} ${e.last_name}` });
      const classes = await t.all(`SELECT c.id, c.name, COUNT(en.id) AS n FROM class c LEFT JOIN enrollment en ON en.school_id = c.school_id AND en.class_id = c.id AND en.status = 'actif'
        WHERE c.school_id = ? GROUP BY c.id, c.name ORDER BY c.name`, u.school_id);
      const stats = {};
      for (const a of adresses) stats[a.statut] = (stats[a.statut] || 0) + 1;
      return { domaine: domainFor(ctx, settings), domaine_base: baseDomain(ctx), reglages: { sous_domaine: settings ? settings.subdomain : null, prefixe: settings ? settings.prefix : null, format: (settings && settings.local_format) || 'code', auto: !!(settings && Number(settings.auto_on_enrol)) }, formats: FORMATS,
        fournisseur: providerInfo(ctx), simule: providerInfo(ctx).routage === 'simule', delai_jours: delayDays(ctx), redirection_jours: redirectDays(ctx),
        ecriture: P.has(u, 'direction'), classes: classes.map((c) => ({ id: c.id, nom: c.name, eleves: Number(c.n) })), adresses, stats };
    }],
    ['PUT', /^\/api\/emails\/reglages$/, async (t, req, u, _m, ctx) => {
      gate(ctx);
      if (!P.has(u, 'direction')) await refuse(ctx, u, 'emails.reglages', 'school_email_settings', u.school_id, 'rôle');
      const b = req.body || {};
      const sub = b.sous_domaine ? slug(b.sous_domaine, 30) : null, pre = b.prefixe ? slug(b.prefixe, 20) : null;
      if ((sub && (!LABEL.test(sub) || sub.length < 2)) || (pre && (!LABEL.test(pre) || pre.length < 2))) throw new HttpError(400, 'sous-domaine ou préfixe invalide (2 à 30 lettres, chiffres, tirets)');
      const had = await settingsOf(t, u.school_id);
      const fmt = b.format == null ? ((had && had.local_format) || 'code') : String(b.format);
      if (!FORMATS.includes(fmt)) throw new HttpError(400, `format : ${FORMATS.join(', ')}`);
      const auto = b.auto == null ? (had ? Number(had.auto_on_enrol) || 0 : 0) : (b.auto === true || b.auto === 1 || b.auto === '1' ? 1 : 0);
      if (had) await t.run('UPDATE school_email_settings SET subdomain = ?, prefix = ?, local_format = ?, auto_on_enrol = ?, updated_by = ?, updated_at = ? WHERE school_id = ?', sub, pre, fmt, auto, u.id, iso(), u.school_id);
      else await t.run('INSERT INTO school_email_settings (school_id, subdomain, prefix, local_format, auto_on_enrol, updated_by, updated_at) VALUES (?,?,?,?,?,?,?)', u.school_id, sub, pre, fmt, auto, u.id, iso());
      await audit(t, u, 'emails.reglages', 'school_email_settings', u.school_id, `sous-domaine ${sub || '—'}, préfixe ${pre || '—'}, format ${fmt}, auto ${auto ? 'oui' : 'non'} (adresses existantes inchangées)`);
      return { sous_domaine: sub, prefixe: pre, format: fmt, auto: !!auto, domaine: domainFor(ctx, { subdomain: sub }) };
    }],
    ['POST', /^\/api\/emails\/apercu$/, async (t, req, u, _m, ctx) => {
      gate(ctx);
      if (!P.has(u, 'direction')) await refuse(ctx, u, 'emails.apercu', 'student_email', null, 'rôle');
      return propose(t, ctx, u, req.body);
    }],
    ['POST', /^\/api\/emails\/creer$/, async (t, req, u, _m, ctx) => {
      gate(ctx);
      if (!P.has(u, 'direction')) await refuse(ctx, u, 'emails.creer', 'student_email', null, 'rôle');
      const b = req.body || {};
      if (b.confirmer !== true) throw new HttpError(400, 'confirmation obligatoire après l’aperçu');
      const p = await propose(t, ctx, u, b);
      if (!b.empreinte || b.empreinte !== p.empreinte) throw new HttpError(409, 'l’aperçu a changé : relancez l’aperçu avant de valider');
      if (!p.propositions.length) return { creees: 0, adresses: [] };
      const at = iso();
      const out = [];
      for (const x of p.propositions) {
        const id = await t.insert(`INSERT INTO student_email (school_id, student_id, student_code, address, local_part, scoped, status, minor, created_by, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`, u.school_id, x.student_id, x.code, x.adresse, x.local, p.scoped ? 1 : 0, 'en_attente', x.mineur ? 1 : 0, u.id, at, at);
        await event(t, { id, school_id: u.school_id, student_id: x.student_id }, 'creation', 'direction', u.id, x.mineur ? 'mineur : consentement parental requis' : null);
        out.push({ id, adresse: x.adresse });
      }
      await audit(t, u, 'emails.creer', 'student_email', null, `${out.length} adresse(s) — ${b.tout ? 'école entière' : `classe ${b.class_id}`}`);
      secRecord(ctx, req, u, `creation:${out.length}`);
      return { creees: out.length, adresses: out };
    }],
    ['GET', /^\/api\/emails\/(\d+)\/journal$/, async (t, req, u, m, ctx) => {
      gate(ctx);
      if (!staff(u)) await refuse(ctx, u, 'emails.journal', 'student_email', m[0], 'rôle');
      const e = await loadEmail(t, u, m[0]);
      return { adresse: e.address, evenements: await t.all('SELECT kind, actor, detail, created_at FROM student_email_event WHERE email_id = ? AND school_id = ? ORDER BY id', e.id, u.school_id) };
    }],
    ['POST', /^\/api\/emails\/(\d+)\/(suspendre|reprendre|fin|annuler-fin)$/, async (t, req, u, m, ctx) => {
      gate(ctx);
      const action = m[1];
      if (!P.has(u, 'direction')) await refuse(ctx, u, `emails.${action}`, 'student_email', m[0], 'rôle');
      const e = await loadEmail(t, u, m[0]);
      const motif = String((req.body && req.body.motif) || '').trim().slice(0, 200);
      if (e.status === 'desactivee') throw new HttpError(409, 'adresse désactivée : définitive');
      if (action === 'suspendre') {
        if (!motif) throw new HttpError(400, 'motif obligatoire');
        if (!CURRENT.includes(e.status) || e.status === 'suspendue') throw new HttpError(409, 'adresse non suspendable');
        await t.run("UPDATE student_email SET status = 'suspendue', reason = ?, updated_at = ? WHERE id = ?", motif, iso(), e.id);
        await event(t, e, 'suspension', 'direction', u.id, motif);
      } else if (action === 'reprendre') {
        if (e.status !== 'suspendue') throw new HttpError(409, 'adresse non suspendue');
        await t.run("UPDATE student_email SET status = 'en_attente', reason = NULL, updated_at = ? WHERE id = ?", iso(), e.id);
        await event(t, e, 'reprise', 'direction', u.id, motif || null);
      } else if (action === 'fin') {
        const n = req.body && req.body.jours != null ? Number(req.body.jours) : delayDays(ctx);
        if (!Number.isInteger(n) || n < 0 || n > 365) throw new HttpError(400, 'délai invalide (0 à 365 jours)');
        const end = addDays(ctx, n);
        await t.run('UPDATE student_email SET ends_on = ?, reason = ?, updated_at = ? WHERE id = ?', end, motif || 'Fin de scolarité', iso(), e.id);
        await event(t, e, 'fin_programmee', 'direction', u.id, `désactivation le ${end}${motif ? ` — ${motif}` : ''}`);
      } else {
        if (!e.ends_on || e.status === 'redirigee') throw new HttpError(409, 'aucune fin à annuler');
        await t.run('UPDATE student_email SET ends_on = NULL, reason = NULL, updated_at = ? WHERE id = ?', iso(), e.id);
        await event(t, e, 'fin_annulee', 'direction', u.id, motif || null);
      }
      await audit(t, u, `emails.${action}`, 'student_email', e.id, motif || null);
      // Délai nul : désactivation immédiate, dans la même transaction.
      if (action === 'fin' && (await t.get('SELECT ends_on FROM student_email WHERE id = ?', e.id)).ends_on <= haitiDay(Date.now(), ctx)) {
        await t.run("UPDATE student_email SET status = 'desactivee', deactivated_at = ?, updated_at = ? WHERE id = ?", iso(), iso(), e.id);
        await event(t, e, 'desactivation', 'direction', u.id, 'désactivation immédiate');
      }
      const fresh = await refresh(t, ctx, e.id, 'direction', u.id);
      return row(t, fresh);
    }],
    // Consentement parental : par le parent lié (son espace) ou consentement écrit enregistré par la direction.
    ['POST', /^\/api\/emails\/(\d+)\/consentement$/, async (t, req, u, m, ctx) => {
      gate(ctx);
      const e = await loadEmail(t, u, m[0]);
      const b = req.body || {};
      const who = P.has(u, 'direction') ? 'direction' : (await canManage(t, u, e)) === 'parent' ? 'parent' : null;
      if (!who) await refuse(ctx, u, 'emails.consentement', 'student_email', e.id, 'ni direction ni parent lié');
      if (!e.minor) throw new HttpError(409, 'élève majeur : consentement parental inutile');
      if (b.accord === false) {
        await t.run('UPDATE student_email SET consent_at = NULL, consent_mode = NULL, consent_name = NULL, consent_by = NULL, updated_at = ? WHERE id = ?', iso(), e.id);
        await event(t, e, 'consentement_retire', who === 'direction' ? 'direction' : 'parent', u.id, null);
      } else {
        if (b.accord !== true) throw new HttpError(400, 'accord explicite obligatoire');
        const name = who === 'direction' ? String(b.parent || '').trim().slice(0, 120) : u.display_name || null;
        if (who === 'direction' && name.length < 3) throw new HttpError(400, 'nom du parent signataire obligatoire');
        await t.run('UPDATE student_email SET consent_at = ?, consent_mode = ?, consent_name = ?, consent_by = ?, updated_at = ? WHERE id = ?',
          iso(), who === 'direction' ? 'ecrit' : 'parent', name, u.id, iso(), e.id);
        await event(t, e, 'consentement', who === 'direction' ? 'direction' : 'parent', u.id, who === 'direction' ? `consentement écrit de ${name}` : 'consentement donné dans l’espace parent');
      }
      if (who === 'direction') await audit(t, u, 'emails.consentement', 'student_email', e.id, b.accord === false ? 'retiré' : `écrit : ${b.parent}`);
      const fresh = await refresh(t, ctx, e.id, who === 'direction' ? 'direction' : 'parent', u.id);
      return row(t, fresh);
    }],
    // Espace élève / parent : leurs adresses (jamais celles des autres).
    ['GET', /^\/api\/emails\/moi$/, async (t, req, u, _m, ctx) => {
      gate(ctx);
      await sweep(ctx.db, ctx);
      const ids = new Set();
      if (P.has(u, 'eleve')) for (const s of await t.all('SELECT id FROM student WHERE school_id = ? AND user_id = ?', u.school_id, u.id)) ids.add(s.id);
      if (P.has(u, 'parent')) for (const s of await t.all('SELECT student_id AS id FROM parent_link WHERE school_id = ? AND parent_user_id = ?', u.school_id, u.id)) ids.add(s.id);
      const out = [];
      for (const sid of ids) {
        const s = await t.get('SELECT first_name, last_name FROM student WHERE school_id = ? AND id = ?', u.school_id, sid);
        const list = await t.all("SELECT * FROM student_email WHERE school_id = ? AND student_id = ? AND status <> 'desactivee' ORDER BY id DESC", u.school_id, sid);
        for (const e of list) {
          const r = await row(t, e, { full: true });
          const role = await canManage(t, u, e);
          out.push({ ...r, eleve: `${s.first_name} ${s.last_name}`, moi: role, peut_consentir: role === 'parent' && !!e.minor, peut_changer: !!role });
        }
      }
      return { adresses: out };
    }],
    ['POST', /^\/api\/emails\/(\d+)\/destination$/, async (t, req, u, m, ctx) => {
      gate(ctx);
      const e = await loadEmail(t, u, m[0]);
      const role = await canManage(t, u, e);
      if (!role) await refuse(ctx, u, 'emails.destination', 'student_email', e.id, 'ni l’élève ni un parent lié');
      if (e.status === 'desactivee') throw new HttpError(409, 'adresse désactivée');
      const b = req.body || {};
      const email = String(b.email || '').trim().toLowerCase();
      if (!EMAIL.test(email) || email.length > 254) throw new HttpError(400, 'adresse e-mail invalide');
      const base = baseDomain(ctx);
      if (base && (email.endsWith(`@${base}`) || email.endsWith(`.${base}`))) throw new HttpError(400, 'la destination doit être une adresse personnelle, hors NORIA');
      const owner = role === 'parent' && b.proprietaire === 'eleve' ? 'eleve' : role;
      const hour = iso(Date.now() - 3600e3);
      const n = Number((await t.get('SELECT COUNT(*) AS n FROM student_email_dest WHERE school_id = ? AND student_id = ? AND created_at > ?', e.school_id, e.student_id, hour)).n);
      if (n >= DEST_PER_HOUR) throw new HttpError(429, 'trop de demandes : réessayez dans une heure');
      const token = crypto.randomBytes(24).toString('base64url');
      const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
      const at = iso();
      await t.run('UPDATE student_email_dest SET revoked_at = ? WHERE school_id = ? AND student_id = ? AND verified_at IS NULL AND revoked_at IS NULL', at, e.school_id, e.student_id);
      const id = await t.insert(`INSERT INTO student_email_dest (school_id, student_id, email, owner, user_id, token_hash, code_hash, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        e.school_id, e.student_id, email, owner, u.id, sha256(token), codeHash({ token_hash: sha256(token) }, code), iso(Date.now() + DEST_TTL_H * 3600e3), at);
      await event(t, e, 'destination_demandee', role, u.id, `${mask(email)} (${owner})`);
      const s = await t.get('SELECT first_name, last_name FROM student WHERE id = ? AND school_id = ?', e.student_id, e.school_id);
      const school = await t.get('SELECT name FROM school WHERE id = ?', e.school_id);
      const pub = ctx.publicUrl || (req.headers.host ? `http://${req.headers.host}` : '');
      const envoi = await sendMail(ctx, email, `NORIA : confirmez l’adresse de transfert · konfime adrès la`,
        verifyText({ address: e.address, eleve: `${s.first_name} ${s.last_name}`, school: school.name, code, link: `${pub}/email/verifier?t=${token}` }));
      secRecord(ctx, req, u, `destination:${e.id}`);
      return { id, envoi, destination: mask(email), expire: iso(Date.now() + DEST_TTL_H * 3600e3) };
    }],
    ['POST', /^\/api\/emails\/(\d+)\/destination\/code$/, async (t, req, u, m, ctx) => {
      gate(ctx);
      const e = await loadEmail(t, u, m[0]);
      if (!(await canManage(t, u, e))) await refuse(ctx, u, 'emails.destination.code', 'student_email', e.id, 'ni l’élève ni un parent lié');
      const code = String((req.body && req.body.code) || '').replace(/\D/g, '');
      const d = await t.get('SELECT * FROM student_email_dest WHERE school_id = ? AND student_id = ? AND verified_at IS NULL AND revoked_at IS NULL ORDER BY id DESC LIMIT 1', e.school_id, e.student_id);
      if (!d || d.expires_at <= iso() || d.attempts >= DEST_MAX_ATTEMPTS) throw new HttpError(410, 'aucune vérification en cours : demandez un nouveau code');
      const ok = code.length === 6 && await codeMatches(t, d, code);
      if (!ok) {
        await ctx.db.run('UPDATE student_email_dest SET attempts = attempts + 1 WHERE id = ?', d.id);
        secRecord(ctx, req, u, `verif_echec:${e.id}`);
        throw new HttpError(400, `code incorrect (${Math.max(0, DEST_MAX_ATTEMPTS - d.attempts - 1)} essai(s) restant(s))`);
      }
      return confirmDest(ctx.db, ctx, d, 'code');
    }],
  ];
}
// Le code n'est conservé que sous forme d'empreinte, salée par l'empreinte du jeton de la même demande ; comparaison
// à temps constant ; 5 essais au plus, puis il faut redemander un code.
async function codeMatches(t, d, code) {
  const want = Buffer.from(String(d.code_hash), 'utf8');
  const got = Buffer.from(codeHash(d, code), 'utf8');
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
function codeHash(d, code) { return sha256(`${d.token_hash}|${code}`); }

/* ---------- Webhook entrant (Email Worker « catch-all », au-delà de 200 adresses) ---------- */
// Signature : en-têtes x-noria-timestamp (secondes) et x-noria-signature = hex(HMAC-SHA256(secret, `${ts}.${corps}`)).
// Réponse : { action: 'forward', to } ou { action: 'reject' }. Le contenu du message ne passe pas par NORIA.
function inboundRoutes() {
  return [
    ['POST', /^\/api\/emails\/entrant$/, async (db, req, _u, _m, ctx) => {
      if (!enabled(ctx)) throw new HttpError(404, 'introuvable');
      const secret = envOf(ctx).NORIA_EMAIL_WEBHOOK_SECRET;
      if (!secret || String(secret).length < 24) throw new HttpError(503, 'webhook non configuré');
      const ts = Number(req.headers['x-noria-timestamp']); const sig = String(req.headers['x-noria-signature'] || '');
      if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) throw new HttpError(401, 'signature expirée');
      const want = crypto.createHmac('sha256', String(secret)).update(`${ts}.${req.rawBody || ''}`).digest('hex');
      if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) throw new HttpError(401, 'signature invalide');
      const to = String((req.body && req.body.to) || '').trim().toLowerCase();
      const e = await db.get("SELECT * FROM student_email WHERE address = ? AND status IN ('active','redirigee')", to);
      const d = e && await destOf(db, e);
      if (!e || !d) return { action: 'reject', reason: 'adresse inconnue ou inactive' };
      await db.run('UPDATE student_email SET forwarded = forwarded + 1, last_forward_at = ? WHERE id = ?', iso(), e.id);
      return { action: 'forward', to: d.email };
    }, { public: true }],
  ];
}

module.exports = { autoCreate, FORMATS, enabled, GATED, schoolRoutes, inboundRoutes, serveVerify, sweep, onTransfer, activeAddress, slug, mask, localFor, domainFor, baseDomain, minorOf, RESERVED, codeHash, DEST_MAX_ATTEMPTS };
