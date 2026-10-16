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
function findUser(db, school, ident) {
  const col = ident.field === 'phone' ? 'u.phone' : 'u.email';
  return db.get(`SELECT u.* FROM app_user u JOIN school s ON s.id = u.school_id
    WHERE s.slug = ? AND ${col} = ? AND u.state = 'actif'`, String(school || ''), ident.value);
}
function newToken() { return crypto.randomBytes(32).toString('base64url'); }
function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) throw new HttpError(400, `mot de passe trop court (${MIN_PASSWORD} caractères minimum)`);
}
function outbox(db, schoolId, recipient, kind, body) {
  const channel = String(recipient).includes('@') ? 'email' : 'sms';
  return db.run('INSERT INTO outbox (school_id, channel, recipient, kind, body) VALUES (?,?,?,?,?)', schoolId, channel, recipient, kind, body);
}
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
  const cols = P.studentFields(u).map((c) => `st.${c}`).join(', ');
  return db.get(`SELECT ${cols} FROM student st WHERE st.id = ? AND ${sc.sql}`, Number(id), ...sc.params);
}

const routes = [
  ['GET', /^\/api\/config$/, async (db, req, u, _m, ctx) => ({
    // session : évite au navigateur un appel /api/me en 401 quand personne n'est connecté
    demo: ctx.demo, session: Boolean(u), methods: ['password'], prochainement: ['code6'],
    ecoles: ctx.demo ? await db.all('SELECT slug, name FROM school ORDER BY id') : undefined,
  }), { public: true, optionalUser: true }],
  ['POST', /^\/api\/login$/, async (db, req, _u, _m, ctx) => {
    const { school, password, method = 'password' } = req.body || {};
    if (method !== 'password') throw new HttpError(501, 'connexion par code pas encore disponible');
    const ident = parseIdentifier(req.body.identifier ?? req.body.email);
    const keys = [`ip:${req.ip}`, `compte:${String(school || '')}|${ident.value}`];
    const wait = await ctx.limiter.blocked(keys);
    if (wait) throw new HttpError(429, 'trop de tentatives, réessayez plus tard', { 'retry-after': String(Math.ceil(wait / 1000)) });
    const user = await findUser(db, school, ident);
    const stored = user ? user.password_hash : await auth.getDummyHash();
    const ok = await auth.verifyPassword(String(password || ''), stored);
    if (!user || !ok) {
      await ctx.limiter.fail(keys);
      if (user) await audit(db, user, 'login', 'user', user.id, null, 'refuse');
      throw new HttpError(401, 'identifiants invalides');
    }
    await ctx.limiter.reset([keys[1]]);
    await audit(db, user, 'login', 'user', user.id, ident.field, 'ok');
    const token = await createSession(db, user);
    req.setCookie(`${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${8 * 3600}${ctx.secureCookie ? '; Secure' : ''}`);
    return { token };
  }, { public: true }],
  ['POST', /^\/api\/logout$/, async (db, req) => {
    await destroySession(db, req.token);
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
    await outbox(db, u.school_id, mail || tel, 'invitation', `NORIA : activez votre compte : /#invitation=${token} (valable ${INVITE_HOURS} h)`);
    await audit(db, u, 'invitation.create', 'invitation', id, role);
    // Le lien est rendu à la personne qui invite pour qu'elle puisse le copier : l'envoi réel (SMS, e-mail) est simulé.
    return { id, expiresAt: expires, link: `/#invitation=${token}`, channel: mail ? 'email' : 'sms', envoi: 'simulé' };
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
  ['POST', /^\/api\/invitations\/accept$/, async (db, req) => {
    const { token, password } = req.body || {};
    checkPassword(password);
    const inv = await useToken(db, 'invitation', token);
    const hash = await auth.hashPassword(password);
    const userId = await db.tx(async (t) => {
      // Marqué utilisé dans la même transaction : un jeton ne crée qu'un seul compte.
      const mark = await t.run('UPDATE account_token SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL', inv.id);
      if (!mark.changes) throw new HttpError(400, 'lien invalide ou expiré');
      const id = await t.insert('INSERT INTO app_user (school_id, email, phone, display_name, password_hash) VALUES (?,?,?,?,?)',
        inv.school_id, inv.email || `tel${inv.phone}@telephone.invalid`, inv.phone, inv.display_name, hash);
      await t.run('INSERT INTO user_role (school_id, user_id, role) VALUES (?,?,?)', inv.school_id, id, inv.role);
      if (inv.role === 'parent') await t.run('INSERT INTO parent_link (school_id, parent_user_id, student_id, reason) VALUES (?,?,?,?)', inv.school_id, id, inv.student_id, 'invitation acceptée');
      if (inv.role === 'eleve') await t.run('UPDATE student SET user_id = ? WHERE id = ? AND school_id = ? AND user_id IS NULL', id, inv.student_id, inv.school_id);
      await audit(t, { id, school_id: inv.school_id }, 'invitation.accept', 'user', id, inv.role);
      return id;
    });
    return { ok: true, userId };
  }, { public: true }],

  // Récupération : réponse identique que le compte existe ou non ; jeton valable 60 min, déposé dans la boîte d'envoi.
  ['POST', /^\/api\/recovery\/request$/, async (db, req, _u, _m, ctx) => {
    const { school } = req.body || {};
    const ident = parseIdentifier(req.body.identifier);
    const keys = [`ip:${req.ip}`, `recup:${school}|${ident.value}`];
    if (await ctx.limiter.blocked(keys)) throw new HttpError(429, 'trop de demandes, réessayez plus tard');
    await ctx.limiter.fail(keys);
    const user = await findUser(db, school, ident);
    if (user) {
      const token = newToken();
      const expires = new Date(Date.now() + RECOVERY_MINUTES * 60e3).toISOString();
      await db.run('INSERT INTO account_token (school_id, kind, token_hash, user_id, expires_at) VALUES (?,?,?,?,?)',
        user.school_id, 'recuperation', auth.sha256(token), user.id, expires);
      await outbox(db, user.school_id, ident.field === 'phone' ? user.phone : user.email, 'recuperation', `NORIA : nouveau mot de passe : /#recuperation=${token} (valable ${RECOVERY_MINUTES} min)`);
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
    return db.all(`SELECT c.id, c.name, l.name AS level, ca.name AS campus FROM class c
      JOIN level l ON l.id = c.level_id AND l.school_id = c.school_id
      JOIN campus ca ON ca.id = c.campus_id AND ca.school_id = c.school_id
      WHERE ${sc.sql} ORDER BY c.name`, ...sc.params);
  }],
  ['GET', /^\/api\/me$/, async (db, req, u) => {
    const school = await db.get('SELECT slug, name FROM school WHERE id = ?', u.school_id);
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
routes.push(...scolaire.routes, ...scolaire.publicRoutes);

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

function createServer(db, options = {}) {
  const ctx = {
    db,
    limiter: options.limiter || createLimiter({ db, ...(options.rateLimit || {}) }),
    demo: !!options.demo,
    publicUrl: options.publicUrl || process.env.NORIA_PUBLIC_URL || null,
    secureCookie: !!options.secureCookie,
  };
  const serveStatic = options.staticRoot === false ? null : createStatic(options.staticRoot || path.join(__dirname, '..', '..'));
  return http.createServer(async (req, res) => {
    let extra = {};
    const cookies = [];
    req.setCookie = (c) => cookies.push(c);
    const withCookies = (h) => (cookies.length ? { ...h, 'set-cookie': cookies } : h);
    const send = (status, body) => {
      if (body && body.__pdf) {
        res.writeHead(status, withCookies({ ...SECURITY_HEADERS, ...extra, 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${body.filename || 'document.pdf'}"`, 'content-length': body.__pdf.length }));
        return res.end(body.__pdf);
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
      if (!url.pathname.startsWith('/api/') && (req.method === 'GET' || req.method === 'HEAD') && serveStatic) {
        if (serveStatic(req, res, SECURITY_HEADERS)) return;
      }
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 1e6) throw new HttpError(413, 'trop volumineux'); }
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
      req.ip = req.socket.remoteAddress || 'inconnue';
      for (const [method, re, handler, opts = {}] of routes) {
        const m = url.pathname.match(re);
        if (!m || method !== req.method) continue;
        let user = null;
        if (!opts.public) { user = await loadSession(db, req.token); if (!user) throw new HttpError(401, 'connexion requise'); }
        else if (opts.optionalUser && req.token) user = await loadSession(db, req.token);
        // Utilisateur connecté : tout passe par asSchool (en PostgreSQL, rôle noria_app + RLS sur son école).
        const out = opts.public ? await handler(db, req, user, m.slice(1), ctx)
          : await db.asSchool(user.school_id, (t) => handler(t, req, user, m.slice(1), ctx));
        return send(200, out);
      }
      throw new HttpError(404, 'introuvable');
    } catch (e) {
      if (e instanceof HttpError) { extra = e.headers; return send(e.status, { error: e.message }); }
      if (/CHECK constraint|FOREIGN KEY|violates (check|foreign key|not-null) constraint/.test(e.message)) return send(400, { error: 'donnée refusée par la base' });
      if (isUnique(e)) return send(409, { error: 'doublon refusé par la base' });
      if (/row-level security/.test(e.message)) return send(404, { error: 'introuvable' });
      console.error(e);
      send(500, { error: 'erreur serveur' });
    }
  });
}

module.exports = { createServer, createLimiter, csv, SECURITY_HEADERS, normalizePhone, parseIdentifier };
