'use strict';
const http = require('node:http');
const auth = require('./auth');
const { createSession, loadSession, destroySession } = auth;
const P = require('./policy');
const crypto = require('node:crypto');
const path = require('node:path');
const { createStatic } = require('./static');
const { HttpError, forbid, notFound, audit, refuse, isUnique } = require('./common');
const scolaire = require('./scolaire');
const { createNotifier } = require('./notify');
const messages = require('./messages');
const otp = require('./otp');
const I = require('./identite');
const ecoles = require('./ecoles');
const plateforme = require('./plateforme');
const { createSecurity } = require('./securite');
const { createPortal } = require('./portail-pages');
const ministere = require('./ministere');
const emailsEleves = require('./emails-eleves');
// Bloc 9 : codes de connexion gratuits (WhatsApp inversé, bot Telegram, appareils de confiance, codes de l'école).
const appareils = require('./appareils');
const whatsapp = require('./whatsapp');
const telegram = require('./telegram');
const activation = require('./activation');
// Lot 0 : structure de l'école (années, niveaux, classes, périodes, matières, affectations) ; lot 1 : tableau de bord et rapports réels.
const structure = require('./structure');
const tableau = require('./tableau');

const COOKIE = 'noria_session';
const ROLES = ['direction', 'secretariat', 'enseignant', 'comptabilite', 'bibliotheque', 'parent', 'eleve'];
const INVITE_HOURS = 72;
const RECOVERY_MINUTES = 60;
const MIN_PASSWORD = 10;

// Identifiant de connexion : une adresse e-mail, ou un numéro de téléphone (chiffres, + facultatif).
function normalizePhone(v) {
  const s = String(v || '').replace(/[\s.\-()]/g, '');
  if (/^\d{8}$/.test(s)) return `+509${s}`; // numéro haïtien local à 8 chiffres
  return /^\+?\d{9,15}$/.test(s) ? s.replace(/^(?!\+)/, '+') : null;
}
function parseIdentifier(v) {
  const s = String(v || '').trim();
  if (s.includes('@')) return { field: 'email', value: s.toLowerCase() };
  const p = normalizePhone(s);
  return p ? { field: 'phone', value: p } : { field: 'email', value: s.toLowerCase() };
}
// Compte (adhésion à une école) correspondant à l'identifiant. Avec une école (slug) : l'adhésion de cette école.
// Sans école : identité globale — par e-mail (personne), ou par téléphone (adhésions de même téléphone, une seule
// personne) ; la première école active est ouverte et `ecoles` indique combien la personne en a (choix ensuite).
async function findUser(db, school, ident) {
  const col = ident.field === 'phone' ? 'u.phone' : 'u.email';
  const sel = `SELECT u.*, p.password_hash AS person_hash FROM app_user u JOIN school s ON s.id = u.school_id LEFT JOIN person p ON p.id = u.person_id`;
  if (school) {
    const u = await db.get(`${sel} WHERE s.slug = ? AND ${col} = ? AND u.state = 'actif' AND s.status = 'active' AND p.locked_at IS NULL`, String(school), ident.value);
    if (u) u.ecoles = u.person_id ? (await I.memberships(db, u.person_id)).length : 1;
    return u;
  }
  const rows = ident.field === 'phone'
    ? await db.all(`${sel} WHERE u.phone = ? AND u.state = 'actif' AND s.status = 'active' AND p.locked_at IS NULL ORDER BY u.school_id`, ident.value)
    : await db.all(`${sel} WHERE (p.email = ? OR (u.person_id IS NULL AND u.email = ?)) AND u.state = 'actif' AND s.status = 'active' AND p.locked_at IS NULL ORDER BY u.school_id`, ident.value, ident.value);
  if (!rows.length) return undefined;
  const persons = new Set(rows.map((r) => r.person_id || `u${r.id}`));
  if (persons.size !== 1) return undefined; // téléphone partagé par plusieurs personnes : préciser l'école
  rows[0].ecoles = rows.length;
  return rows[0];
}
// Mot de passe : celui de la personne s'il existe, sinon celui d'une de ses adhésions (comptes migrés) — le premier
// vérifié devient alors celui de la personne, pour toutes ses écoles.
async function checkUserPassword(db, user, password) {
  if (!user) { await auth.verifyPassword(password, await auth.getDummyHash()); return false; }
  if (user.person_hash) return auth.verifyPassword(password, user.person_hash);
  const hashes = user.person_id
    ? (await db.all('SELECT DISTINCT password_hash FROM app_user WHERE person_id = ? AND password_hash IS NOT NULL', user.person_id)).map((r) => r.password_hash)
    : [user.password_hash];
  for (const h of hashes.length ? hashes : [await auth.getDummyHash()]) {
    if (await auth.verifyPassword(password, h)) {
      if (user.person_id) await db.run('UPDATE person SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND password_hash IS NULL', h, user.person_id);
      return true;
    }
  }
  return false;
}
function newToken() { return crypto.randomBytes(32).toString('base64url'); }
function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) throw new HttpError(400, `mot de passe trop court (${MIN_PASSWORD} caractères minimum)`);
}
// Envoi d'un message (SMS si le destinataire est un numéro, e-mail sinon) par l'adaptateur configuré.
// La boîte d'envoi garde une trace ; le corps n'y est conservé en clair qu'en mode simulé (développement).
// secrets : valeurs à masquer dans la trace (lien, code). Un échec d'envoi est journalisé, jamais levé.
async function outbox(db, ctx, schoolId, recipient, kind, lang, vars, secrets = []) {
  const channel = String(recipient).includes('@') ? 'email' : 'sms';
  const msg = messages.render(kind, lang, vars);
  const text = channel === 'sms' ? msg.sms : msg.text;
  const adapter = ctx.notifier.adapter(channel);
  const stored = adapter.simulated ? text : secrets.reduce((acc, x) => (x ? acc.split(String(x)).join('[masqué]') : acc), text);
  const id = await db.insert('INSERT INTO outbox (school_id, channel, recipient, kind, body, lang, status, provider) VALUES (?,?,?,?,?,?,?,?)',
    schoolId, channel, recipient, kind, stored, messages.pick(lang), adapter.simulated ? 'simule' : 'en_attente', adapter.name);
  try {
    const r = await adapter.send({ to: recipient, subject: msg.subject, text, ...(channel === 'email' && msg.html ? { html: msg.html } : {}) });
    if (!adapter.simulated) await db.run("UPDATE outbox SET status = 'envoye', provider_id = ?, sent_at = ? WHERE id = ?", r.id || null, new Date().toISOString(), id);
    return { channel, envoi: adapter.simulated ? 'simulé' : 'envoyé' };
  } catch (e) {
    console.error(`[envoi ${channel} ${adapter.name}] échec : ${e.message}`);
    await db.run("UPDATE outbox SET status = 'echec', error = ? WHERE id = ?", String(e.message).slice(0, 300), id);
    return { channel, envoi: 'échec' };
  }
}
function linkBase(req, ctx) {
  if (ctx.publicUrl) return ctx.publicUrl.replace(/\/$/, '');
  if (/^[\w.:-]+$/.test(req.headers.host || '')) return `${ctx.secureCookie ? 'https' : 'http'}://${req.headers.host}`;
  return '';
}
const reqLang = (req, fallback) => messages.pick(req.body && req.body.lang ? String(req.body.lang) : fallback);
async function useToken(db, kind, token) {
  const row = await db.get('SELECT * FROM account_token WHERE token_hash = ? AND kind = ?', auth.sha256(String(token || '')), kind);
  if (!row || row.used_at || row.expires_at < new Date().toISOString()) throw new HttpError(400, 'lien invalide ou expiré');
  return row;
}

// Neutralise les formules de tableur (=, +, -, @, tabulation, retour chariot en tête de cellule).
function cell(v) {
  const s = v == null ? '' : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function csv(rows, cols) {
  const esc = (v) => { const s = cell(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

function getStudent(db, u, id) {
  const sc = P.studentScope(u);
  let cols = P.studentFields(u).map((c) => `st.${c}`).join(', ');
  // Direction et secrétariat (fiche modifiable, lot 2) : sexe, statut du dossier et classe active en plus.
  if (P.can.editStudent(u)) cols += `, st.sex, st.status, (SELECT e.class_id FROM enrollment e WHERE e.student_id = st.id AND e.school_id = st.school_id AND e.status = 'actif' ORDER BY e.id DESC LIMIT 1) AS class_id`;
  return db.get(`SELECT ${cols} FROM student st WHERE st.id = ? AND ${sc.sql}`, Number(id), ...sc.params);
}

const routes = [
  ['GET', /^\/api\/config$/, async (db, req, u, _m, ctx) => ({
    // session : évite au navigateur un appel /api/me en 401 quand personne n'est connecté
    demo: ctx.demo, session: Boolean(u), methods: ['password', 'code6'], code: { digits: otp.DIGITS, minutes: otp.TTL_MIN, resendSeconds: otp.RESEND_SECONDS },
    ecoles: ctx.demo ? await db.all('SELECT slug, name FROM school ORDER BY id') : undefined,
    // Bloc 6 : présent seulement quand le portail du ministère est activé (NORIA_MINISTERE=1).
    ministere: ministere.enabled(ctx) || undefined,
    // Bloc 7 : présent seulement quand les adresses e-mail des élèves sont activées (NORIA_EMAIL_ELEVES=1).
    emailsEleves: emailsEleves.enabled(ctx) || undefined,
    // Bloc 9 : canaux gratuits activés (WhatsApp et Telegram seulement s'ils sont configurés) ; SMS seulement si un
    // fournisseur réel est réglé (jamais par défaut) ou en démonstration (envoi simulé).
    canaux: {
      whatsapp: whatsapp.enabled(ctx) || undefined,
      telegram: telegram.enabled(ctx) ? telegram.botName(ctx) : undefined,
      email: true, ecole: true,
      sms: ctx.demo || !ctx.notifier.adapter('sms').simulated || undefined,
    },
    // Appareil de confiance valable : l'interface rouvre la session sans code (POST /api/login/appareil).
    appareil: (!u && Boolean(await appareils.current(db, req))) || undefined,
  }), { public: true, optionalUser: true }],
  ['POST', /^\/api\/login$/, async (db, req, _u, _m, ctx) => {
    const { school, password, method = 'password' } = req.body || {};
    if (method === 'code') return otp.verifyLogin(db, req, ctx, { findUser, parseIdentifier, startSession });
    if (method !== 'password') throw new HttpError(400, 'méthode de connexion inconnue');
    const ident = parseIdentifier(req.body.identifier ?? req.body.email);
    const keys = [`ip:${req.ip}`, `compte:${String(school || '')}|${ident.value}`];
    const wait = await ctx.limiter.blocked(keys);
    if (wait) throw new HttpError(429, 'trop de tentatives, réessayez plus tard', { 'retry-after': String(Math.ceil(wait / 1000)) });
    const user = await findUser(db, school, ident);
    const ok = await checkUserPassword(db, user, String(password || ''));
    if (!user || !ok) {
      await ctx.limiter.fail(keys);
      if (user) await audit(db, user, 'login', 'user', user.id, null, 'refuse');
      throw new HttpError(401, 'identifiants invalides');
    }
    await ctx.limiter.reset([keys[1]]);
    await audit(db, user, 'login', 'user', user.id, ident.field, 'ok');
    return startSession(db, req, ctx, user);
  }, { public: true }],
  // Code de connexion à 6 chiffres envoyé par SMS (téléphone) ou e-mail ; réponse identique que le compte existe ou non.
  ['POST', /^\/api\/login\/code$/, async (db, req, _u, _m, ctx) => otp.request(db, req, ctx, { findUser, parseIdentifier, outbox, reqLang, telegram }), { public: true }],
  ['POST', /^\/api\/logout$/, async (db, req, _u, _m, ctx) => {
    await destroySession(db, req.token);
    await appareils.forgetCurrent(db, req, ctx); // cet appareil cesse d'être de confiance
    req.setCookie(`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    return { ok: true };
  }, { public: true }],

  // Invitations : un jeton à usage unique, valable 72 h, déposé dans la boîte d'envoi (SMS ou e-mail simulé).
  ['POST', /^\/api\/invitations$/, async (db, req, u, _m, ctx) => {
    const { email, phone, display_name, role, student_id } = req.body || {};
    if (!ROLES.includes(role)) throw new HttpError(400, 'rôle inconnu');
    // Direction : tous les rôles. Secrétariat : parents et élèves (inscription et lien parent).
    const allowed = P.has(u, 'direction') || (P.has(u, 'secretariat') && ['parent', 'eleve'].includes(role));
    if (!allowed) await refuse(ctx, u, 'invitation.create', 'invitation', null, role);
    const mail = email ? String(email).trim().toLowerCase() : null;
    const tel = phone ? normalizePhone(phone) : null;
    if (!mail && !tel) throw new HttpError(400, 'e-mail ou téléphone obligatoire');
    if (phone && !tel) throw new HttpError(400, 'téléphone invalide');
    if (!display_name) throw new HttpError(400, 'nom obligatoire');
    let sid = null;
    if (role === 'parent' || role === 'eleve') {
      if (!student_id) throw new HttpError(400, 'élève à rattacher obligatoire');
      const st = await db.get('SELECT id FROM student WHERE id = ? AND school_id = ?', Number(student_id), u.school_id);
      if (!st) notFound();
      sid = st.id;
    }
    const exists = await db.get('SELECT 1 AS x FROM app_user WHERE school_id = ? AND (email = ? OR (phone IS NOT NULL AND phone = ?))', u.school_id, mail || '', tel || '');
    if (exists) throw new HttpError(409, 'un compte existe déjà avec cet identifiant');
    const token = newToken();
    const expires = new Date(Date.now() + INVITE_HOURS * 3600e3).toISOString();
    const id = await db.insert(`INSERT INTO account_token (school_id, kind, token_hash, email, phone, display_name, role, student_id, created_by, expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, u.school_id, 'invitation', auth.sha256(token), mail, tel, String(display_name), role, sid, u.id, expires);
    const school = await db.get('SELECT slug, name, initials, default_lang, logo_updated_at, (logo IS NOT NULL) AS has_logo FROM school WHERE id = ?', u.school_id);
    const link = `${linkBase(req, ctx)}/#invitation=${token}`;
    const logoUrl = school.has_logo && linkBase(req, ctx) ? `${linkBase(req, ctx)}/api/ecoles/${school.slug}/logo` : null;
    const sent = await outbox(db, ctx, u.school_id, mail || tel, 'invitation', reqLang(req, school.default_lang),
      { school: school.name, initials: I.schoolInitials(school), logoUrl, name: String(display_name), hours: INVITE_HOURS, link,
        // Bloc 7 : l'invitation d'un élève rappelle son adresse e-mail NORIA quand elle est active.
        proEmail: role === 'eleve' ? await emailsEleves.activeAddress(db, ctx, u.school_id, sid) : null }, [token]);
    await audit(db, u, 'invitation.create', 'invitation', id, `${role} (${sent.channel} ${sent.envoi})`);
    // Le lien reste rendu à la personne qui invite : elle peut le transmettre elle-même si l'envoi est simulé ou a échoué.
    return { id, expiresAt: expires, link: `/#invitation=${token}`, channel: sent.channel, envoi: sent.envoi };
  }],
  ['GET', /^\/api\/invitations$/, async (db, req, u) => {
    if (!P.has(u, 'direction', 'secretariat')) forbid();
    const roles = P.has(u, 'direction') ? ROLES : ['parent', 'eleve'];
    return db.all(`SELECT a.id, a.email, a.phone, a.display_name, a.role, a.student_id, a.expires_at, a.used_at, a.created_at, us.display_name AS invited_by
      FROM account_token a JOIN app_user us ON us.id = a.created_by AND us.school_id = a.school_id
      WHERE a.school_id = ? AND a.kind = 'invitation' AND a.role IN (${roles.map(() => '?').join(',')}) ORDER BY a.id DESC LIMIT 200`, u.school_id, ...roles);
  }],
  ['POST', /^\/api\/invitations\/(\d+)\/annuler$/, async (db, req, u, [id], ctx) => {
    if (!P.has(u, 'direction', 'secretariat')) await refuse(ctx, u, 'invitation.revoke', 'invitation', id, null);
    const roles = P.has(u, 'direction') ? ROLES : ['parent', 'eleve'];
    // Annuler = rendre le jeton inutilisable (expiré maintenant) ; la ligne reste pour l'historique.
    const r = await db.run(`UPDATE account_token SET expires_at = ? WHERE id = ? AND school_id = ? AND kind = 'invitation' AND used_at IS NULL
      AND role IN (${roles.map(() => '?').join(',')})`, new Date(Date.now() - 1000).toISOString(), Number(id), u.school_id, ...roles);
    if (!r.changes) notFound();
    await audit(db, u, 'invitation.revoke', 'invitation', id, null);
    return { ok: true };
  }],
  // Acceptation : la personne invitée devient membre de l'école. Si elle a déjà un compte NORIA (même e-mail, ou même
  // téléphone dans une autre école), l'adhésion est reliée à son identité et son mot de passe ACTUEL est exigé.
  ['POST', /^\/api\/invitations\/accept$/, async (db, req, _u, _m, ctx) => {
    const { token, password } = req.body || {};
    checkPassword(password);
    const inv = await useToken(db, 'invitation', token);
    const pending = inv.user_id ? await db.get('SELECT * FROM app_user WHERE id = ? AND school_id = ?', inv.user_id, inv.school_id) : null;
    const email = String((pending && pending.email) || inv.email || `tel${inv.phone}@telephone.invalid`).toLowerCase();
    const phone = (pending && pending.phone) || inv.phone;
    let person = await db.get('SELECT id, password_hash FROM person WHERE email = ?', email);
    if (!person && phone) {
      const pid = await ecoles.personByPhone(db, phone);
      if (pid) person = await db.get('SELECT id, password_hash FROM person WHERE id = ?', pid);
    }
    let hash;
    if (person) {
      const probe = { id: 0, person_id: person.id, person_hash: person.password_hash };
      const keys = [`invit:${inv.id}`];
      if (await ctx.limiter.blocked(keys)) throw new HttpError(429, 'trop de tentatives, réessayez plus tard');
      if (!(await checkUserPassword(db, probe, String(password)))) {
        await ctx.limiter.fail(keys);
        throw new HttpError(401, 'compte NORIA existant : saisissez votre mot de passe actuel');
      }
      hash = (await db.get('SELECT password_hash FROM person WHERE id = ?', person.id)).password_hash;
    } else hash = await auth.hashPassword(password);
    const userId = await db.tx(async (t) => {
      // Marqué utilisé dans la même transaction : un jeton ne crée qu'un seul compte.
      const mark = await t.run('UPDATE account_token SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL', inv.id);
      if (!mark.changes) throw new HttpError(400, 'lien invalide ou expiré');
      const personId = person ? person.id : await t.insert('INSERT INTO person (email, display_name, password_hash) VALUES (?,?,?)', email, inv.display_name, hash);
      // Adhésion : celle préparée par l'import, ou celle que la personne a déjà dans cette école, ou une nouvelle.
      const already = await t.get('SELECT id FROM app_user WHERE school_id = ? AND person_id = ?', inv.school_id, personId);
      let id;
      if (pending && (!already || already.id === pending.id)) {
        id = pending.id;
        await t.run("UPDATE app_user SET state = 'actif', person_id = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?", personId, hash, id, inv.school_id);
      } else if (already) {
        id = already.id;
        if (pending) { // l'adhésion préparée par l'import est reportée sur l'adhésion existante
          await t.run('UPDATE parent_link SET parent_user_id = ? WHERE parent_user_id = ? AND school_id = ? AND student_id NOT IN (SELECT student_id FROM parent_link WHERE parent_user_id = ?)', id, pending.id, inv.school_id, id);
          await t.run("UPDATE app_user SET state = 'desactive', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?", pending.id, inv.school_id);
        }
      } else {
        id = await t.insert('INSERT INTO app_user (school_id, email, phone, display_name, password_hash, person_id) VALUES (?,?,?,?,?,?)',
          inv.school_id, email, phone, inv.display_name, hash, personId);
      }
      if (!(await t.get('SELECT 1 AS x FROM user_role WHERE user_id = ? AND role = ?', id, inv.role)))
        await t.run('INSERT INTO user_role (school_id, user_id, role) VALUES (?,?,?)', inv.school_id, id, inv.role);
      if (inv.role === 'parent' && !(await t.get('SELECT 1 AS x FROM parent_link WHERE parent_user_id = ? AND student_id = ?', id, inv.student_id)))
        await t.run('INSERT INTO parent_link (school_id, parent_user_id, student_id, reason) VALUES (?,?,?,?)', inv.school_id, id, inv.student_id, 'invitation acceptée');
      if (inv.role === 'eleve') await t.run('UPDATE student SET user_id = ? WHERE id = ? AND school_id = ? AND user_id IS NULL', id, inv.student_id, inv.school_id);
      await audit(t, { id, school_id: inv.school_id }, 'invitation.accept', 'user', id, `${inv.role}${person ? ' (identité existante reliée)' : ''}`);
      return id;
    });
    return { ok: true, userId, existing: !!person };
  }, { public: true }],

  // Récupération : réponse identique que le compte existe ou non ; jeton valable 60 min, déposé dans la boîte d'envoi.
  ['POST', /^\/api\/recovery\/request$/, async (db, req, _u, _m, ctx) => {
    const { school } = req.body || {};
    const ident = parseIdentifier(req.body.identifier);
    // Clé IP propre à la récupération : une demande de lien ne doit pas consommer les essais de connexion (« ip: »).
    const keys = [`recup-ip:${req.ip}`, `recup:${school}|${ident.value}`];
    if (await ctx.limiter.blocked(keys)) throw new HttpError(429, 'trop de demandes, réessayez plus tard');
    await ctx.limiter.fail(keys);
    const user = await findUser(db, school, ident);
    if (user) {
      const token = newToken();
      const expires = new Date(Date.now() + RECOVERY_MINUTES * 60e3).toISOString();
      await db.run('INSERT INTO account_token (school_id, kind, token_hash, user_id, expires_at) VALUES (?,?,?,?,?)',
        user.school_id, 'recuperation', auth.sha256(token), user.id, expires);
      const school = await db.get('SELECT default_lang FROM school WHERE id = ?', user.school_id);
      await outbox(db, ctx, user.school_id, ident.field === 'phone' ? user.phone : user.email, 'recuperation', reqLang(req, school.default_lang),
        { minutes: RECOVERY_MINUTES, link: `${linkBase(req, ctx)}/#recuperation=${token}` }, [token]);
      await audit(db, user, 'recovery.request', 'user', user.id, ident.field);
    }
    return { ok: true, message: 'Si ce compte existe, un message vient d’être envoyé.' };
  }, { public: true }],
  ['POST', /^\/api\/recovery\/reset$/, async (db, req) => {
    const { token, password } = req.body || {};
    checkPassword(password);
    const row = await useToken(db, 'recuperation', token);
    const hash = await auth.hashPassword(password);
    await db.tx(async (t) => {
      const mark = await t.run('UPDATE account_token SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL', row.id);
      if (!mark.changes) throw new HttpError(400, 'lien invalide ou expiré');
      await t.run('UPDATE app_user SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', hash, row.user_id, row.school_id);
      // Identité globale : le nouveau mot de passe vaut pour toutes les écoles ; toutes les sessions sont fermées.
      const pu = await t.get('SELECT person_id FROM app_user WHERE id = ? AND school_id = ?', row.user_id, row.school_id);
      if (pu && pu.person_id) {
        await t.run('UPDATE person SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', hash, pu.person_id);
        await t.run('UPDATE app_user SET password_hash = ? WHERE person_id = ?', hash, pu.person_id);
        for (const m of await t.all('SELECT id FROM app_user WHERE person_id = ?', pu.person_id)) await auth.destroyUserSessions(t, m.id);
      }
      await auth.destroyUserSessions(t, row.user_id);
      await audit(t, { id: row.user_id, school_id: row.school_id }, 'recovery.reset', 'user', row.user_id, 'sessions révoquées');
    });
    return { ok: true };
  }, { public: true }],

  ['GET', /^\/api\/classes$/, async (db, req, u) => {
    // Enseignant : ses classes ; parent et élève : les classes des élèves visibles ; direction, secrétariat, bibliothèque : l'école.
    let sc = P.classScope(u);
    if (sc === P.NONE && P.has(u, 'parent', 'eleve')) {
      const st = P.studentScope(u);
      sc = { sql: `c.school_id = ? AND c.id IN (SELECT e.class_id FROM enrollment e JOIN student st ON st.id = e.student_id AND st.school_id = e.school_id WHERE e.status = 'actif' AND ${st.sql})`, params: [u.school_id, ...st.params] };
    }
    if (sc === P.NONE) forbid();
    // Classes actives seulement (non archivées, année courante) : structure.js.
    return db.all(`SELECT c.id, c.name, c.room, c.level_id, c.school_year_id, l.name AS level, ca.name AS campus FROM class c
      JOIN level l ON l.id = c.level_id AND l.school_id = c.school_id
      JOIN campus ca ON ca.id = c.campus_id AND ca.school_id = c.school_id
      WHERE ${sc.sql} AND ${structure.activeClass('c')} ORDER BY l.position, c.name`, ...sc.params);
  }],
  ['GET', /^\/api\/me$/, async (db, req, u) => {
    const school = ecoles.publicProfile(await db.get('SELECT * FROM school WHERE id = ?', u.school_id));
    school.initials = school.initials || I.deriveInitials(school.name);
    return { id: u.id, schoolId: u.school_id, school, name: u.display_name, roles: u.roles };
  }],

  ['GET', /^\/api\/students$/, async (db, req, u) => {
    if (!P.can.readStudents(u)) forbid();
    const sc = P.studentScope(u);
    const cols = P.studentFields(u).map((c) => `st.${c}`).join(', ');
    return db.all(`SELECT ${cols}, e.class_id FROM student st
      LEFT JOIN enrollment e ON e.student_id = st.id AND e.school_id = st.school_id AND e.status = 'actif'
      WHERE ${sc.sql} ORDER BY st.last_name, st.first_name`, ...sc.params);
  }],
  ['GET', /^\/api\/students\/(\d+)$/, async (db, req, u, [id]) => {
    if (!P.can.readStudents(u)) forbid();
    return (await getStudent(db, u, id)) || notFound();
  }],
  ['PATCH', /^\/api\/students\/(\d+)$/, async (db, req, u, [id], ctx) => {
    if (!P.can.editStudent(u)) await refuse(ctx, u, 'student.update', 'student', id, null);
    const { reason, ...fields } = req.body || {};
    if (!reason) throw new HttpError(400, 'motif obligatoire');
    const allowed = ['first_name', 'last_name', 'birth_date', 'health_notes', 'family_notes'];
    const keys = Object.keys(fields).filter((k) => allowed.includes(k));
    if (!keys.length) throw new HttpError(400, 'aucun champ modifiable');
    const sc = P.studentScope(u, 'student');
    const arch = await db.get(`SELECT student.status FROM student WHERE student.id = ? AND ${sc.sql}`, Number(id), ...sc.params);
    if (arch && arch.status === 'transfere') throw new HttpError(409, 'dossier archivé (élève transféré) : lecture seule');
    const r = await db.run(`UPDATE student SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE student.id = ? AND ${sc.sql}`, ...keys.map((k) => fields[k]), Number(id), ...sc.params);
    if (!r.changes) notFound();
    await audit(db, u, 'student.update', 'student', id, `${reason} [champs: ${keys.join(',')}]`);
    return getStudent(db, u, id);
  }],
  ['GET', /^\/api\/classes\/(\d+)\/students$/, async (db, req, u, [id]) => {
    if (!P.can.readClass(u)) forbid();
    const sc = P.classScope(u);
    const cls = await db.get(`SELECT c.id FROM class c WHERE c.id = ? AND ${sc.sql}`, Number(id), ...sc.params);
    if (!cls) notFound();
    return db.all(`SELECT st.id, st.code, st.first_name, st.last_name FROM student st
      JOIN enrollment e ON e.student_id = st.id AND e.school_id = st.school_id
      WHERE e.class_id = ? AND e.status = 'actif' AND st.school_id = ?`, cls.id, u.school_id);
  }],
  ['GET', /^\/api\/students\/(\d+)\/finance$/, async (db, req, u, [id]) => {
    if (!P.can.readFinance(u)) forbid();
    const sc = P.financeScope(u);
    const st = await db.get(`SELECT st.id FROM student st WHERE st.id = ? AND ${sc.sql}`, Number(id), ...sc.params);
    if (!st) notFound();
    return db.all('SELECT id, label, amount_cents, currency FROM finance_entry WHERE student_id = ? AND school_id = ?', st.id, u.school_id);
  }],
  // Export : mêmes filtres que la lecture ; chaque export (ou refus) est journalisé.
  ['GET', /^\/api\/export\/students$/, async (db, req, u, _m, ctx) => {
    if (!P.can.exportStudents(u)) await refuse(ctx, u, 'export.students', 'student', null, null);
    const classId = req.query.get('classId');
    const sc = P.studentScope(u);
    let sql = `SELECT ${P.studentFields(u).map((c) => `st.${c}`).join(', ')} FROM student st WHERE ${sc.sql}`;
    const params = [...sc.params];
    if (classId) {
      const cs = P.classScope(u);
      if (!(await db.get(`SELECT 1 AS x FROM class c WHERE c.id = ? AND ${cs.sql}`, Number(classId), ...cs.params))) {
        await ctx.db.asSchool(u.school_id, (t) => audit(t, u, 'export.students', 'class', classId, null, 'refuse'));
        notFound();
      }
      sql += ` AND st.id IN (SELECT student_id FROM enrollment WHERE class_id = ? AND status = 'actif' AND school_id = ?)`;
      params.push(Number(classId), u.school_id);
    }
    const rows = await db.all(sql + ' ORDER BY st.id', ...params);
    await audit(db, u, 'export.students', classId ? 'class' : 'school', classId || u.school_id, req.query.get('reason'));
    return { __csv: csv(rows, P.studentFields(u)) };
  }],
  ['GET', /^\/api\/export\/finance$/, async (db, req, u, _m, ctx) => {
    if (!P.can.exportFinance(u)) await refuse(ctx, u, 'export.finance', 'finance', null, null);
    const rows = await db.all(`SELECT f.id, st.code, f.label, f.amount_cents, f.currency FROM finance_entry f
      JOIN student st ON st.id = f.student_id AND st.school_id = f.school_id WHERE f.school_id = ?`, u.school_id);
    await audit(db, u, 'export.finance', 'school', u.school_id, req.query.get('reason'));
    return { __csv: csv(rows, ['id', 'code', 'label', 'amount_cents', 'currency']) };
  }],
  ['PUT', /^\/api\/users\/(\d+)\/roles$/, async (db, req, u, [id], ctx) => {
    if (!P.can.manageRoles(u)) await refuse(ctx, u, 'user.roles', 'user', id, null);
    const { roles, reason } = req.body || {};
    if (!reason || !Array.isArray(roles)) throw new HttpError(400, 'rôles et motif obligatoires');
    const target = await db.get('SELECT id FROM app_user WHERE id = ? AND school_id = ?', Number(id), u.school_id);
    if (!target) notFound();
    await db.tx(async (t) => {
      await t.run('DELETE FROM user_role WHERE user_id = ? AND school_id = ?', target.id, u.school_id);
      for (const r of roles) await t.run('INSERT INTO user_role (school_id, user_id, role) VALUES (?,?,?)', u.school_id, target.id, r);
      await audit(t, u, 'user.roles', 'user', id, `${reason} [rôles: ${roles.join(',')}]`);
    });
    return { id: target.id, roles };
  }],
  ['GET', /^\/api\/audit$/, async (db, req, u) => {
    if (!P.can.readAudit(u)) forbid();
    return db.all('SELECT * FROM audit_log WHERE school_id = ? ORDER BY id DESC LIMIT 500', u.school_id);
  }],

  // Présences.
  ['GET', /^\/api\/attendance$/, async (db, req, u) => {
    if (!P.can.recordAttendance(u)) forbid();
    const classId = Number(req.query.get('class_id')); const day = String(req.query.get('day') || '');
    if (!DAY.test(day)) throw new HttpError(400, 'jour invalide (AAAA-MM-JJ)');
    const sc = P.classScope(u);
    if (!(await db.get(`SELECT 1 AS x FROM class c WHERE c.id = ? AND ${sc.sql}`, classId, ...sc.params))) notFound();
    return db.all(`SELECT student_id, status, version, recorded_at FROM attendance
      WHERE school_id = ? AND class_id = ? AND day = ? ORDER BY student_id`, u.school_id, classId, day);
  }],
  ['GET', /^\/api\/students\/(\d+)\/attendance$/, async (db, req, u, [id]) => {
    if (!P.can.readStudents(u)) forbid();
    if (!(await getStudent(db, u, id))) notFound();
    return db.all(`SELECT day, status, version FROM attendance WHERE school_id = ? AND student_id = ?
      ORDER BY day DESC LIMIT 60`, u.school_id, Number(id));
  }],
  ['GET', /^\/api\/students\/(\d+)\/attendance\/history$/, async (db, req, u, [id]) => {
    if (!P.can.recordAttendance(u)) forbid();
    const st = P.studentScope(u);
    if (!(await db.get(`SELECT 1 AS x FROM student st WHERE st.id = ? AND ${st.sql}`, Number(id), ...st.params))) notFound();
    return db.all(`SELECT a.day, h.old_status, h.new_status, h.version, h.reason, h.source, h.changed_by, h.client_recorded_at, h.created_at
      FROM attendance_history h JOIN attendance a ON a.id = h.attendance_id AND a.school_id = h.school_id
      WHERE h.school_id = ? AND a.student_id = ? ORDER BY h.id`, u.school_id, Number(id));
  }],
  ['GET', /^\/api\/attendance\/conflicts$/, async (db, req, u) => {
    if (!P.can.recordAttendance(u)) forbid();
    const mine = P.has(u, 'direction', 'secretariat') ? '' : ' AND user_id = ?';
    return db.all(`SELECT op_id, attendance_id, user_id, client_status, server_status, base_version, server_version, client_recorded_at, resolution, created_at
      FROM sync_conflict WHERE school_id = ?${mine} ORDER BY id DESC LIMIT 200`, u.school_id, ...(mine ? [u.id] : []));
  }],
  // Envoi groupé (en ligne ou au retour du réseau). Chaque opération porte une clé d'idempotence op_id et la version
  // vue par l'appareil (base_version). Règle de conflit : si la fiche a changé sur le serveur depuis cette version, la
  // valeur du serveur est conservée, la saisie de l'appareil est journalisée dans sync_conflict et signalée.
  ['POST', /^\/api\/attendance\/sync$/, async (db, req, u) => {
    if (!P.can.recordAttendance(u)) forbid();
    const ops = Array.isArray(req.body && req.body.ops) ? req.body.ops : null;
    if (!ops || ops.length > 500) throw new HttpError(400, 'liste d’opérations invalide (500 au plus)');
    const results = [];
    for (const op of ops) results.push(await syncOne(db, u, op));
    return { results, serverTime: new Date().toISOString() };
  }],
];

// Jour civil de l'école (Haïti par défaut) : sert à la règle « correction le jour même ».
const localDay = () => new Date().toLocaleDateString('en-CA', { timeZone: process.env.NORIA_TZ || 'America/Port-au-Prince' });
routes.push(...scolaire.routes, ...scolaire.publicRoutes, ...require('./gestion').routes);
routes.push(...structure.routes, ...tableau.routes);
function setSessionCookie(req, ctx, token) {
  req.setCookie(`${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${8 * 3600}${ctx.secureCookie ? '; Secure' : ''}`);
}
const eco = ecoles.createRoutes({ normalizePhone, outbox, linkBase, reqLang, newToken, INVITE_HOURS, setSessionCookie });
routes.push(...eco.routes, ...eco.publicRoutes);
// Lot 2 : création manuelle d'un élève, changement de classe, responsables (tuteurs).
routes.push(...require('./eleves-gestion')(normalizePhone).routes);
// Lot 6 : salles de cours (séances, ressources, mains levées, sondages).
routes.push(...require('./salles').routes);
// Bloc 2 : photo, badges, recherche et scan ; relevés de notes officiels signés.
routes.push(...require('./badges').routes);
const rel = require('./releves').createRoutes({ outbox, reqLang });
routes.push(...rel.routes, ...rel.publicRoutes);
// Bloc 4 : vérification d'un élève entre écoles, signalements, décisions de fin d'année, transferts de dossier.
const trf = require('./transferts').createRoutes({ outbox, reqLang });
routes.push(...trf.routes, ...trf.publicRoutes);
// Bloc 5 : propositions des directions pour le portail public (événements, articles, lauréats) et école partenaire.
const portail = require('./portail');
routes.push(...portail.schoolRoutes());
// Bloc 6 : déclaration annuelle au ministère (direction). Routes 404 tant que NORIA_MINISTERE ne vaut pas 1.
routes.push(...ministere.schoolRoutes());
routes.push(...emailsEleves.schoolRoutes(), ...emailsEleves.inboundRoutes());
// Lot 3 : messagerie familles ↔ école, réunions de parents à grande audience, inscriptions en ligne.
routes.push(...require('./messagerie').routes, ...require('./reunions-parents').routes, ...require('./candidatures').routes);
// Diffusion audio des réunions de parents (WHIP → MediaMTX → HLS → R2) : 409/404 tant que NORIA_DIRECT_* manquent.
routes.push(...require('./diffusion').routes, ...require('./diffusion').publicRoutes);
// Bloc 9 : codes de connexion gratuits. WhatsApp et Telegram : routes 404 tant qu'ils ne sont pas configurés.
const dev = appareils.createRoutes({ startSession });
const tg = telegram.createRoutes();
const act = activation.createRoutes({ startSession });
routes.push(...dev.routes, ...dev.publicRoutes, ...whatsapp.createRoutes({ findUser, parseIdentifier, startSession }),
  ...tg.routes, ...tg.publicRoutes, ...act.routes, ...act.publicRoutes);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['present', 'absent', 'retard', 'excuse'];
const TEACHER_DAYS = 7; // un enseignant saisit ou corrige jusqu'à 7 jours en arrière ; direction et secrétariat sans limite

async function syncOne(db, u, op) {
  const opId = String((op && op.op_id) || '');
  if (!/^[\w-]{8,64}$/.test(opId)) return { op_id: opId, result: 'refuse', error: 'op_id invalide' };
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.tx((t) => applyOp(t, u, op, opId));
    } catch (e) {
      if (e instanceof HttpError) return { op_id: opId, result: 'refuse', error: e.message };
      // Deux envois simultanés (même op_id ou même fiche) : on rejoue une fois, l'idempotence fait le reste.
      if (attempt === 0 && isUnique(e)) continue;
      throw e;
    }
  }
}

async function applyOp(t, u, op, opId) {
  const seen = await t.get('SELECT user_id, result FROM sync_op WHERE school_id = ? AND op_id = ?', u.school_id, opId);
  if (seen) {
    if (seen.user_id !== u.id) throw new HttpError(403, 'op_id déjà utilisé');
    return { ...JSON.parse(seen.result), deja: true };
  }
  const classId = Number(op.class_id); const studentId = Number(op.student_id);
  const day = String(op.day || ''); const status = String(op.status || '');
  const base = Number.isInteger(op.base_version) && op.base_version >= 0 ? op.base_version : null;
  const recordedAt = typeof op.recorded_at === 'string' && op.recorded_at.length <= 40 ? op.recorded_at : new Date().toISOString();
  const source = op.offline ? 'hors_ligne' : 'en_ligne';
  const reason = op.reason ? String(op.reason).slice(0, 300) : null;
  if (!DAY.test(day) || !STATUSES.includes(status) || base == null) throw new HttpError(400, 'opération invalide');
  const sc = P.classScope(u);
  if (!(await t.get(`SELECT 1 AS x FROM class c WHERE c.id = ? AND ${sc.sql}`, classId, ...sc.params))) throw new HttpError(404, 'classe hors périmètre');
  if (!(await t.get("SELECT 1 AS x FROM enrollment WHERE school_id = ? AND class_id = ? AND student_id = ? AND status = 'actif'", u.school_id, classId, studentId)))
    throw new HttpError(404, 'élève absent de cette classe');
  if (!P.has(u, 'direction', 'secretariat')) {
    const age = (Date.now() - Date.parse(`${day}T12:00:00Z`)) / 86400e3;
    if (age > TEACHER_DAYS + 0.5 || age < -1) throw new HttpError(403, `saisie limitée aux ${TEACHER_DAYS} derniers jours`);
  }
  const cur = await t.get('SELECT id, status, version, recorded_by, day FROM attendance WHERE school_id = ? AND student_id = ? AND day = ?', u.school_id, studentId, day);
  let res;
  if (!cur) {
    const id = await t.insert(`INSERT INTO attendance (school_id, class_id, student_id, day, status, recorded_by, recorded_at)
      VALUES (?,?,?,?,?,?,?)`, u.school_id, classId, studentId, day, status, u.id, recordedAt);
    await t.run(`INSERT INTO attendance_history (school_id, attendance_id, old_status, new_status, version, reason, changed_by, source, op_id, client_recorded_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, u.school_id, id, null, status, 1, reason, u.id, source, opId, recordedAt);
    res = { op_id: opId, result: 'applique', status, version: 1 };
  } else if (cur.status === status) {
    res = { op_id: opId, result: 'identique', status, version: cur.version };
  } else if (cur.version !== base) {
    await t.run(`INSERT INTO sync_conflict (school_id, op_id, attendance_id, user_id, client_status, server_status, base_version, server_version, client_recorded_at, resolution)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, u.school_id, opId, cur.id, u.id, status, cur.status, base, cur.version, recordedAt, 'valeur du serveur conservée');
    await audit(t, u, 'attendance.conflict', 'attendance', cur.id, `appareil: ${status} (v${base}) / serveur: ${cur.status} (v${cur.version})`, 'conflit');
    res = { op_id: opId, result: 'conflit', status: cur.status, version: cur.version, client_status: status };
  } else {
    // Correction : motif obligatoire, sauf si l'auteur corrige sa propre saisie le jour même.
    const sameDay = cur.recorded_by === u.id && day === localDay();
    if (!reason && !sameDay) throw new HttpError(400, 'motif obligatoire pour corriger une présence');
    await t.run(`UPDATE attendance SET status = ?, version = version + 1, recorded_by = ?, recorded_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND school_id = ? AND version = ?`, status, u.id, recordedAt, cur.id, u.school_id, cur.version);
    await t.run(`INSERT INTO attendance_history (school_id, attendance_id, old_status, new_status, version, reason, changed_by, source, op_id, client_recorded_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, u.school_id, cur.id, cur.status, status, cur.version + 1, reason || 'correction le jour même', u.id, source, opId, recordedAt);
    await audit(t, u, 'attendance.correct', 'attendance', cur.id, reason || 'correction le jour même');
    res = { op_id: opId, result: 'applique', status, version: cur.version + 1 };
  }
  await t.run('INSERT INTO sync_op (school_id, op_id, user_id, result) VALUES (?,?,?,?)', u.school_id, opId, u.id, JSON.stringify(res));
  return res;
}


// Limiteur de tentatives : N échecs par clé (IP, compte) dans une fenêtre glissante. Avec db, il est stocké en base
// (table login_attempt, clés hachées) : il survit au redémarrage et vaut pour tous les processus. Sans db : en mémoire.
function createLimiter({ db = null, max = 5, windowMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
  if (db) {
    const h = (k) => auth.sha256(`limiteur|${k}`);
    return {
      async blocked(keys) {
        let wait = 0;
        for (const k of keys) {
          const r = await db.get('SELECT COUNT(*) AS n, MIN(at_ms) AS first FROM login_attempt WHERE key = ? AND at_ms > ?', h(k), now() - windowMs);
          if (r.n >= max) wait = Math.max(wait, windowMs - (now() - r.first));
        }
        return wait;
      },
      async fail(keys) {
        await db.run('DELETE FROM login_attempt WHERE at_ms <= ?', now() - windowMs);
        for (const k of keys) await db.run('INSERT INTO login_attempt (key, at_ms) VALUES (?,?)', h(k), now());
      },
      async reset(keys) { for (const k of keys) await db.run('DELETE FROM login_attempt WHERE key = ?', h(k)); },
    };
  }
  const hits = new Map();
  const recent = (k) => (hits.get(k) || []).filter((t) => now() - t < windowMs);
  return {
    async blocked(keys) {
      let wait = 0;
      for (const k of keys) { const r = recent(k); hits.set(k, r); if (r.length >= max) wait = Math.max(wait, windowMs - (now() - r[0])); }
      return wait;
    },
    async fail(keys) { for (const k of keys) hits.set(k, [...recent(k), now()]); },
    async reset(keys) { for (const k of keys) hits.delete(k); },
  };
}

const SECURITY_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

function parseCookies(h) {
  const out = {};
  for (const part of String(h || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim(); }
  return out;
}

// choisir : la personne a plusieurs écoles et s'est connectée sans en préciser une → l'interface lui fait choisir.
// trust: true (case « Faire confiance à cet appareil ») : cookie noria_appareil de 30 jours (bloc 9).
function startSession(db, req, ctx, user) {
  return createSession(db, user).then(async (token) => {
    if (ctx.sec) await ctx.sec.loginOk(req, { user }).catch(() => {});
    setSessionCookie(req, ctx, token);
    if (req.body && req.body.trust === true) await appareils.trust(db, req, ctx, user);
    return { token, ecoles: user.ecoles || 1, choisir: !(req.body && req.body.school) && (user.ecoles || 1) > 1 };
  });
}

function clientIp(req, trustProxy) {
  if (trustProxy) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return req.socket.remoteAddress || 'inconnue';
}

// Pages HTML : « no-transform » ajouté au Cache-Control existant (sémantique de cache inchangée) pour que
// Cloudflare ne modifie pas le HTML (injection du script Web Analytics, bloqué par notre CSP, etc.).
function withNoTransform(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return headers;
  const k = Object.keys(headers);
  const ct = k.find((x) => x.toLowerCase() === 'content-type');
  if (!ct || !/^text\/html\b/i.test(String(headers[ct]))) return headers;
  const cc = k.find((x) => x.toLowerCase() === 'cache-control');
  const cur = cc ? String(headers[cc]) : '';
  if (/\bno-transform\b/i.test(cur)) return headers;
  const out = { ...headers }; if (cc) delete out[cc];
  out['cache-control'] = cur ? `${cur}, no-transform` : 'no-transform';
  return out;
}
function createServer(db, options = {}) {
  const ctx = {
    notifier: options.notifier || createNotifier(options.env || process.env),
    db,
    limiter: options.limiter || createLimiter({ db, ...(options.rateLimit || {}) }),
    demo: !!options.demo,
    publicUrl: options.publicUrl || process.env.NORIA_PUBLIC_URL || null,
    secureCookie: !!options.secureCookie,
    // Derrière Caddy (ou un autre mandataire de confiance) : l'adresse du client est la dernière entrée de
    // X-Forwarded-For, ajoutée par le mandataire. Sans trustProxy, l'en-tête est ignoré (il serait falsifiable).
    trustProxy: !!options.trustProxy,
    env: options.env || process.env,
    emailFetch: options.emailFetch || null, // bloc 7 : faux fetch des tests (aucun appel réseau)
    channelFetch: options.channelFetch || null, // bloc 9 : faux fetch des tests (API WhatsApp et Telegram)
    relay: options.relay || null, // relais de diffusion HLS → R2 (src/diffusion-relais.js), absent = diffusion désactivée
  };
  // Bloc 9 : codes d'activation saisis, par école (en plus de la limite par IP) : 50 échecs par 15 min.
  ctx.activationLimit = options.activationLimit || createLimiter({ db, max: 50, windowMs: 15 * 60 * 1000 });
  // Vérification d'un élève entre écoles : limite dédiée par compte et par école (fenêtre de 15 min, comme la connexion).
  ctx.searchLimit = options.searchLimit || {
    user: createLimiter({ db, max: 15, windowMs: 15 * 60 * 1000 }),
    school: createLimiter({ db, max: 40, windowMs: 15 * 60 * 1000 }),
  };
  // Portail public : propositions d'une école limitées par heure (la règle « propositions_masse » de l'assistant alerte avant).
  // Bloc 6 : vérifications de documents par un compte du ministère (codes inconnus limités par compte).
  ctx.ministryVerifyLimit = options.ministryVerifyLimit || createLimiter({ db, max: 30, windowMs: 15 * 60 * 1000 });
  ctx.portalLimit = options.portalLimit || createLimiter({ db, max: portail.PROPOSALS_PER_HOUR, windowMs: 3600e3 });
  // Bloc 8 : formulaires publics (demande d'inscription, code des comptes grand public) : 8 envois par heure et par clé.
  ctx.publicLimit = options.publicLimit || createLimiter({ db, max: 8, windowMs: 3600e3 });
  // Assistant sécurité : observe les connexions, refus et erreurs ; n'agit jamais seul (voir src/securite.js).
  ctx.sec = options.security === false ? null : (options.security || createSecurity({ db, env: options.env || process.env, notifier: ctx.notifier, secureCookie: ctx.secureCookie, publicUrl: ctx.publicUrl, channelFetch: ctx.channelFetch }));
  const serveStatic = options.staticRoot === false ? null : createStatic(options.staticRoot || path.join(__dirname, '..', '..'));
  // Portail public (pages HTML rendues par le serveur, sans connexion) sur / et /ht/… ; l'application est sur /app.
  const portal = options.portal === false ? null : createPortal(db, { ctx, publicUrl: ctx.publicUrl, secureCookie: ctx.secureCookie, root: options.staticRoot || path.join(__dirname, '..', '..') });
  const srv = http.createServer(async (req, res) => {
    { const wh = res.writeHead.bind(res); res.writeHead = (st, a, b) => (typeof a === 'object' && a && b === undefined ? wh(st, withNoTransform(a)) : wh(st, a, withNoTransform(b))); }
    let extra = {};
    const cookies = [];
    req.setCookie = (c) => cookies.push(c);
    const withCookies = (h) => (cookies.length ? { ...h, 'set-cookie': cookies } : h);
    const t0 = Date.now(); let urlSeen = null;
    const send = (status, body) => {
      if (ctx.sec && urlSeen) { try { ctx.sec.observe(req, urlSeen, status, body, Date.now() - t0); } catch { /* jamais bloquant */ } }
      if (body && body.__pdf) {
        res.writeHead(status, withCookies({ ...SECURITY_HEADERS, ...extra, 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${body.filename || 'document.pdf'}"`, 'content-length': body.__pdf.length }));
        return res.end(body.__pdf);
      }
      if (body && body.__file) {
        res.writeHead(status, withCookies({ ...SECURITY_HEADERS, ...extra, ...(body.cache ? { 'cache-control': body.cache } : {}), 'content-type': body.type,
          'content-disposition': body.inline ? 'inline' : `attachment; filename="${body.filename || 'fichier'}"`, 'content-length': body.__file.length }));
        return res.end(body.__file);
      }
      if (body && body.__csv !== undefined) {
        res.writeHead(status, withCookies({ ...SECURITY_HEADERS, ...extra, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="export.csv"' }));
        return res.end(body.__csv);
      }
      res.writeHead(status, withCookies({ ...SECURITY_HEADERS, ...extra, 'content-type': 'application/json; charset=utf-8' }));
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      req.query = url.searchParams;
      if (url.pathname.startsWith('/api/')) urlSeen = url;
      // Bloc 6 (prototype) : portail du ministère désactivé par défaut → ses pages, scripts et routes n'existent pas.
      if (!ministere.enabled(ctx) && ministere.GATED.test(url.pathname)) {
        if (!url.pathname.startsWith('/api/') && portal && /text\/html/.test(req.headers.accept || '')) return portal.notFound(req, res, url, SECURITY_HEADERS);
        throw new HttpError(404, 'introuvable');
      }
      // Bloc 7 : adresses e-mail des élèves désactivées par défaut → pages, scripts et routes inexistants.
      if (!emailsEleves.enabled(ctx) && emailsEleves.GATED.test(url.pathname)) {
        if (!url.pathname.startsWith('/api/') && portal && /text\/html/.test(req.headers.accept || '')) return portal.notFound(req, res, url, SECURITY_HEADERS);
        throw new HttpError(404, 'introuvable');
      }
      // Bloc 9 : WhatsApp inversé et bot Telegram désactivés tant qu'ils ne sont pas configurés → routes inexistantes.
      if ((!whatsapp.enabled(ctx) && whatsapp.GATED.test(url.pathname)) || (!telegram.enabled(ctx) && telegram.GATED.test(url.pathname))) throw new HttpError(404, 'introuvable');
      // Page publique de vérification d'une adresse de destination (formulaire HTML, hors JSON).
      if (url.pathname === '/email/verifier' || url.pathname === '/email/verifier/') return emailsEleves.serveVerify(db, req, res, url, ctx, SECURITY_HEADERS);
      // Sonde de santé (Docker, Caddy, hébergeur) : la base répond-elle ? Aucune donnée, aucun journal.
      if (url.pathname === '/healthz' && (req.method === 'GET' || req.method === 'HEAD')) {
        let ok = true;
        try { await db.get('SELECT 1 AS ok'); } catch { ok = false; }
        res.writeHead(ok ? 200 : 503, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' });
        return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok, db: db.kind }));
      }
      if (!url.pathname.startsWith('/api/') && (req.method === 'GET' || req.method === 'HEAD')) {
        if (portal && await portal.serve(req, res, url, SECURITY_HEADERS, clientIp(req, ctx.trustProxy))) return;
        if (serveStatic && serveStatic(req, res, SECURITY_HEADERS)) return;
        // Adresse inconnue demandée par un navigateur : page 404 du portail plutôt qu'une réponse JSON.
        if (portal && /text\/html/.test(req.headers.accept || '')) return portal.notFound(req, res, url, SECURITY_HEADERS);
      }
      // Bloc 8 : formulaires HTML du portail (inscription d'une école, compte grand public, désinscription).
      if (portal && req.method === 'POST' && portal.handlesPost(url.pathname)) {
        if (ctx.sec && await ctx.sec.isBlocked(clientIp(req, ctx.trustProxy))) throw new HttpError(403, 'adresse temporairement bloquée');
        if (await portal.post(req, res, url, SECURITY_HEADERS, clientIp(req, ctx.trustProxy))) return;
      }
      // Corps lu en octets (signature HMAC des webhooks : bloc 7, WhatsApp du bloc 9), puis décodé en UTF-8 d'un bloc.
      const parts = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 1e6) throw new HttpError(413, 'trop volumineux'); parts.push(chunk); }
      req.rawBuffer = Buffer.concat(parts);
      const raw = req.rawBuffer.toString('utf8');
      req.rawBody = raw;
      try { req.body = raw ? JSON.parse(raw) : {}; } catch { throw new HttpError(400, 'JSON invalide'); }
      const authz = req.headers.authorization || '';
      req.token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
      // Session par cookie HttpOnly (navigateur). Toute requête qui modifie quelque chose avec ce cookie doit porter
      // l'en-tête x-noria : un site tiers ne peut pas l'ajouter sans accord CORS, ce qui bloque la falsification de requête.
      if (!req.token) {
        const c = parseCookies(req.headers.cookie)[COOKIE];
        if (c) {
          req.token = c;
          if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-noria'] !== '1') throw new HttpError(403, 'en-tête x-noria manquant');
        }
      }
      req.ip = clientIp(req, ctx.trustProxy);
      // Adresse bloquée par le super-admin (action confirmée depuis l'assistant sécurité), pour une durée limitée.
      if (ctx.sec && url.pathname.startsWith('/api/') && await ctx.sec.isBlocked(req.ip)) { req.secSkip = true; throw new HttpError(403, 'adresse temporairement bloquée'); }
      // Administration de la plateforme : routes et session séparées (cookie noria_admin), hors école.
      if (url.pathname.startsWith('/api/admin/')) return send(200, await plateforme.dispatch(db, req, url, ctx, parseCookies));
      // Portail du ministère (bloc 6) : session séparée (cookie noria_ministere), rôle noria_ministere en PostgreSQL.
      if (url.pathname.startsWith('/api/ministere/')) return send(200, await ministere.dispatch(db, req, url, ctx, parseCookies));
      for (const [method, re, handler, opts = {}] of routes) {
        const m = url.pathname.match(re);
        if (!m || method !== req.method) continue;
        let user = null;
        if (!opts.public) { user = await loadSession(db, req.token); if (!user) throw new HttpError(401, 'connexion requise'); }
        else if (opts.optionalUser && req.token) user = await loadSession(db, req.token);
        req.user = user;
        // Utilisateur connecté : tout passe par asSchool (en PostgreSQL, rôle noria_app + RLS sur son école).
        // Routes « system » (adhésions de la personne connectée) : connexion système, la lecture des données d'une école
        // y repasse par db.asSchool. Toutes les autres : transaction RLS de l'école active.
        const out = opts.public || opts.system ? await handler(db, req, user, m.slice(1), ctx)
          : await db.asSchool(user.school_id, (t) => handler(t, req, user, m.slice(1), ctx));
        return send(200, out);
      }
      throw new HttpError(404, 'introuvable');
    } catch (e) {
      if (e instanceof HttpError) { extra = e.headers; return send(e.status, { error: e.message }); }
      if (/CHECK constraint|FOREIGN KEY|violates (check|foreign key|not-null) constraint/.test(e.message)) return send(400, { error: 'donnée refusée par la base' });
      if (isUnique(e)) return send(409, { error: 'doublon refusé par la base' });
      if (/row-level security/.test(e.message)) { req.rls = true; return send(404, { error: 'introuvable' }); }
      // Garde-fous de la base (archive d'un élève transféré, transfert clos, signature figée).
      if (/lecture seule|signature figée|suppression interdite/.test(e.message)) return send(409, { error: 'dossier en lecture seule' });
      console.error(e);
      send(500, { error: 'erreur serveur' });
    }
  });
  srv.sec = ctx.sec;
  srv.ctx = ctx;
  return srv;
}

module.exports = { routes, createServer, withNoTransform, clientIp, createLimiter, csv, SECURITY_HEADERS, normalizePhone, parseIdentifier, outbox, linkBase, INVITE_HOURS };
