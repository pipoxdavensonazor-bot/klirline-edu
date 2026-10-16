'use strict';
const http = require('node:http');
const auth = require('./auth');
const { createSession, loadSession, destroySession } = auth;
const P = require('./policy');
const crypto = require('node:crypto');
const path = require('node:path');
const { createStatic } = require('./static');

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
  return db.prepare(`SELECT u.* FROM app_user u JOIN school s ON s.id = u.school_id
    WHERE s.slug = ? AND ${col} = ? AND u.state = 'actif'`).get(String(school || ''), ident.value);
}
function newToken() { return crypto.randomBytes(32).toString('base64url'); }
function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) throw new HttpError(400, `mot de passe trop court (${MIN_PASSWORD} caractères minimum)`);
}
function outbox(db, schoolId, recipient, kind, body) {
  const channel = String(recipient).includes('@') ? 'email' : 'sms';
  db.prepare('INSERT INTO outbox (school_id, channel, recipient, kind, body) VALUES (?,?,?,?,?)').run(schoolId, channel, recipient, kind, body);
}
function useToken(db, kind, token) {
  const row = db.prepare('SELECT * FROM account_token WHERE token_hash = ? AND kind = ?').get(auth.sha256(String(token || '')), kind);
  if (!row || row.used_at || row.expires_at < new Date().toISOString()) throw new HttpError(400, 'lien invalide ou expiré');
  return row;
}

function audit(db, u, action, recordType, recordId, reason, outcome = 'ok') {
  db.prepare(`INSERT INTO audit_log (school_id, actor_user_id, action, record_type, record_id, reason, outcome)
    VALUES (?,?,?,?,?,?,?)`).run(u.school_id, u.id, action, recordType, recordId == null ? null : String(recordId), reason || null, outcome);
}

class HttpError extends Error { constructor(status, msg, headers) { super(msg); this.status = status; this.headers = headers || {}; } }
const forbid = () => { throw new HttpError(403, 'accès refusé'); };
// Hors périmètre : 404, pour ne pas révéler l'existence du dossier.
const notFound = () => { throw new HttpError(404, 'introuvable'); };

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
  return db.prepare(`SELECT ${cols} FROM student st WHERE st.id = ? AND ${sc.sql}`).get(Number(id), ...sc.params);
}

const routes = [
  ['GET', /^\/api\/config$/, (db, req, u, _m, ctx) => ({
    // session : évite au navigateur un appel /api/me en 401 quand personne n'est connecté
    demo: ctx.demo, session: Boolean(u), methods: ['password'], prochainement: ['code6'],
    ecoles: ctx.demo ? db.prepare('SELECT slug, name FROM school ORDER BY id').all() : undefined,
  }), { public: true, optionalUser: true }],
  ['POST', /^\/api\/login$/, async (db, req, _u, _m, ctx) => {
    const { school, password, method = 'password' } = req.body || {};
    if (method !== 'password') throw new HttpError(501, 'connexion par code pas encore disponible');
    const ident = parseIdentifier(req.body.identifier ?? req.body.email);
    const accountKey = `${String(school || '')}|${ident.value}`;
    const wait = ctx.limiter.blocked([`ip:${req.ip}`, `compte:${accountKey}`]);
    if (wait) throw new HttpError(429, 'trop de tentatives, réessayez plus tard', { 'retry-after': String(Math.ceil(wait / 1000)) });
    const user = findUser(db, school, ident);
    const stored = user ? user.password_hash : await auth.getDummyHash();
    const ok = await auth.verifyPassword(String(password || ''), stored);
    if (!user || !ok) {
      ctx.limiter.fail([`ip:${req.ip}`, `compte:${accountKey}`]);
      if (user) audit(db, user, 'login', 'user', user.id, null, 'refuse');
      throw new HttpError(401, 'identifiants invalides');
    }
    ctx.limiter.reset([`compte:${accountKey}`]);
    audit(db, user, 'login', 'user', user.id, ident.field, 'ok');
    const token = createSession(db, user);
    req.setCookie(`${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${8 * 3600}${ctx.secureCookie ? '; Secure' : ''}`);
    return { token };
  }, { public: true }],
  ['POST', /^\/api\/logout$/, (db, req) => {
    destroySession(db, req.token);
    req.setCookie(`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    return { ok: true };
  }],

  // Invitations : un jeton à usage unique, valable 72 h, déposé dans la boîte d'envoi (SMS ou e-mail simulé).
  ['POST', /^\/api\/invitations$/, (db, req, u) => {
    const { email, phone, display_name, role, student_id } = req.body || {};
    if (!ROLES.includes(role)) throw new HttpError(400, 'rôle inconnu');
    // Direction : tous les rôles. Secrétariat : parents et élèves (inscription et lien parent).
    const allowed = P.has(u, 'direction') || (P.has(u, 'secretariat') && ['parent', 'eleve'].includes(role));
    if (!allowed) { audit(db, u, 'invitation.create', 'invitation', null, role, 'refuse'); forbid(); }
    const mail = email ? String(email).trim().toLowerCase() : null;
    const tel = phone ? normalizePhone(phone) : null;
    if (!mail && !tel) throw new HttpError(400, 'e-mail ou téléphone obligatoire');
    if (phone && !tel) throw new HttpError(400, 'téléphone invalide');
    if (!display_name) throw new HttpError(400, 'nom obligatoire');
    let sid = null;
    if (role === 'parent' || role === 'eleve') {
      if (!student_id) throw new HttpError(400, 'élève à rattacher obligatoire');
      const st = db.prepare('SELECT id FROM student WHERE id = ? AND school_id = ?').get(Number(student_id), u.school_id);
      if (!st) notFound();
      sid = st.id;
    }
    const exists = db.prepare('SELECT 1 FROM app_user WHERE school_id = ? AND (email = ? OR (phone IS NOT NULL AND phone = ?))').get(u.school_id, mail || '', tel || '');
    if (exists) throw new HttpError(409, 'un compte existe déjà avec cet identifiant');
    const token = newToken();
    const expires = new Date(Date.now() + INVITE_HOURS * 3600e3).toISOString();
    const r = db.prepare(`INSERT INTO account_token (school_id, kind, token_hash, email, phone, display_name, role, student_id, created_by, expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(u.school_id, 'invitation', auth.sha256(token), mail, tel, String(display_name), role, sid, u.id, expires);
    outbox(db, u.school_id, mail || tel, 'invitation', `NORIA : activez votre compte : /#invitation=${token} (valable ${INVITE_HOURS} h)`);
    audit(db, u, 'invitation.create', 'invitation', r.lastInsertRowid, role);
    return { id: r.lastInsertRowid, expiresAt: expires };
  }],
  ['POST', /^\/api\/invitations\/accept$/, async (db, req) => {
    const { token, password } = req.body || {};
    checkPassword(password);
    const inv = useToken(db, 'invitation', token);
    const hash = await auth.hashPassword(password);
    const userId = db.transaction(() => {
      // Marqué utilisé dans la même transaction : un jeton ne crée qu'un seul compte.
      const mark = db.prepare('UPDATE account_token SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL').run(inv.id);
      if (!mark.changes) throw new HttpError(400, 'lien invalide ou expiré');
      const id = db.prepare('INSERT INTO app_user (school_id, email, phone, display_name, password_hash) VALUES (?,?,?,?,?)')
        .run(inv.school_id, inv.email || `tel${inv.phone}@telephone.invalid`, inv.phone, inv.display_name, hash).lastInsertRowid;
      db.prepare('INSERT INTO user_role (school_id, user_id, role) VALUES (?,?,?)').run(inv.school_id, id, inv.role);
      if (inv.role === 'parent') db.prepare('INSERT INTO parent_link (school_id, parent_user_id, student_id, reason) VALUES (?,?,?,?)').run(inv.school_id, id, inv.student_id, 'invitation acceptée');
      if (inv.role === 'eleve') db.prepare('UPDATE student SET user_id = ? WHERE id = ? AND school_id = ? AND user_id IS NULL').run(id, inv.student_id, inv.school_id);
      audit(db, { id, school_id: inv.school_id }, 'invitation.accept', 'user', id, inv.role);
      return id;
    })();
    return { ok: true, userId };
  }, { public: true }],

  // Récupération : réponse identique que le compte existe ou non ; jeton valable 60 min, déposé dans la boîte d'envoi.
  ['POST', /^\/api\/recovery\/request$/, async (db, req, _u, _m, ctx) => {
    const { school } = req.body || {};
    const ident = parseIdentifier(req.body.identifier);
    const keys = [`ip:${req.ip}`, `recup:${school}|${ident.value}`];
    if (ctx.limiter.blocked(keys)) throw new HttpError(429, 'trop de demandes, réessayez plus tard');
    ctx.limiter.fail(keys);
    const user = findUser(db, school, ident);
    if (user) {
      const token = newToken();
      const expires = new Date(Date.now() + RECOVERY_MINUTES * 60e3).toISOString();
      db.prepare(`INSERT INTO account_token (school_id, kind, token_hash, user_id, expires_at) VALUES (?,?,?,?,?)`)
        .run(user.school_id, 'recuperation', auth.sha256(token), user.id, expires);
      outbox(db, user.school_id, ident.field === 'phone' ? user.phone : user.email, 'recuperation', `NORIA : nouveau mot de passe : /#recuperation=${token} (valable ${RECOVERY_MINUTES} min)`);
      audit(db, user, 'recovery.request', 'user', user.id, ident.field);
    }
    return { ok: true, message: 'Si ce compte existe, un message vient d’être envoyé.' };
  }, { public: true }],
  ['POST', /^\/api\/recovery\/reset$/, async (db, req) => {
    const { token, password } = req.body || {};
    checkPassword(password);
    const row = useToken(db, 'recuperation', token);
    const hash = await auth.hashPassword(password);
    db.transaction(() => {
      const mark = db.prepare('UPDATE account_token SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL').run(row.id);
      if (!mark.changes) throw new HttpError(400, 'lien invalide ou expiré');
      db.prepare('UPDATE app_user SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?').run(hash, row.user_id, row.school_id);
      auth.destroyUserSessions(db, row.user_id);
      audit(db, { id: row.user_id, school_id: row.school_id }, 'recovery.reset', 'user', row.user_id, 'sessions révoquées');
    })();
    return { ok: true };
  }, { public: true }],

  ['GET', /^\/api\/classes$/, (db, req, u) => {
    // Enseignant : ses classes ; parent et élève : les classes des élèves visibles ; direction, secrétariat, bibliothèque : l'école.
    let sc = P.classScope(u);
    if (sc.sql === '0' && P.has(u, 'parent', 'eleve')) {
      const st = P.studentScope(u);
      sc = { sql: `c.school_id = ? AND c.id IN (SELECT e.class_id FROM enrollment e JOIN student st ON st.id = e.student_id AND st.school_id = e.school_id WHERE e.status = 'actif' AND ${st.sql})`, params: [u.school_id, ...st.params] };
    }
    if (sc.sql === '0') forbid();
    return db.prepare(`SELECT c.id, c.name, l.name AS level, ca.name AS campus FROM class c
      JOIN level l ON l.id = c.level_id AND l.school_id = c.school_id
      JOIN campus ca ON ca.id = c.campus_id AND ca.school_id = c.school_id
      WHERE ${sc.sql} ORDER BY c.name`).all(...sc.params);
  }],
  ['GET', /^\/api\/me$/, (db, req, u) => {
    const school = db.prepare('SELECT slug, name FROM school WHERE id = ?').get(u.school_id);
    return { id: u.id, schoolId: u.school_id, school, name: u.display_name, roles: u.roles };
  }],

  ['GET', /^\/api\/students$/, (db, req, u) => {
    if (!P.can.readStudents(u)) forbid();
    const sc = P.studentScope(u);
    const cols = P.studentFields(u).map((c) => `st.${c}`).join(', ');
    return db.prepare(`SELECT ${cols}, e.class_id FROM student st
      LEFT JOIN enrollment e ON e.student_id = st.id AND e.school_id = st.school_id AND e.status = 'actif'
      WHERE ${sc.sql} ORDER BY st.last_name, st.first_name`).all(...sc.params);
  }],
  ['GET', /^\/api\/students\/(\d+)$/, (db, req, u, [id]) => {
    if (!P.can.readStudents(u)) forbid();
    return getStudent(db, u, id) || notFound();
  }],
  ['PATCH', /^\/api\/students\/(\d+)$/, (db, req, u, [id]) => {
    if (!P.can.editStudent(u)) { audit(db, u, 'student.update', 'student', id, null, 'refuse'); forbid(); }
    const { reason, ...fields } = req.body || {};
    if (!reason) throw new HttpError(400, 'motif obligatoire');
    const allowed = ['first_name', 'last_name', 'birth_date', 'health_notes', 'family_notes'];
    const keys = Object.keys(fields).filter((k) => allowed.includes(k));
    if (!keys.length) throw new HttpError(400, 'aucun champ modifiable');
    const sc = P.studentScope(u);
    const r = db.prepare(`UPDATE student AS st SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE st.id = ? AND ${sc.sql}`).run(...keys.map((k) => fields[k]), Number(id), ...sc.params);
    if (!r.changes) notFound();
    audit(db, u, 'student.update', 'student', id, `${reason} [champs: ${keys.join(',')}]`);
    return getStudent(db, u, id);
  }],
  ['GET', /^\/api\/classes\/(\d+)\/students$/, (db, req, u, [id]) => {
    if (!P.can.readClass(u)) forbid();
    const sc = P.classScope(u);
    const cls = db.prepare(`SELECT c.id FROM class c WHERE c.id = ? AND ${sc.sql}`).get(Number(id), ...sc.params);
    if (!cls) notFound();
    return db.prepare(`SELECT st.id, st.code, st.first_name, st.last_name FROM student st
      JOIN enrollment e ON e.student_id = st.id AND e.school_id = st.school_id
      WHERE e.class_id = ? AND e.status = 'actif' AND st.school_id = ?`).all(cls.id, u.school_id);
  }],
  ['GET', /^\/api\/students\/(\d+)\/finance$/, (db, req, u, [id]) => {
    if (!P.can.readFinance(u)) forbid();
    const sc = P.financeScope(u);
    const st = db.prepare(`SELECT st.id FROM student st WHERE st.id = ? AND ${sc.sql}`).get(Number(id), ...sc.params);
    if (!st) notFound();
    return db.prepare('SELECT id, label, amount_cents, currency FROM finance_entry WHERE student_id = ? AND school_id = ?').all(st.id, u.school_id);
  }],
  // Export : mêmes filtres que la lecture ; chaque export (ou refus) est journalisé.
  ['GET', /^\/api\/export\/students$/, (db, req, u) => {
    if (!P.can.exportStudents(u)) { audit(db, u, 'export.students', 'student', null, null, 'refuse'); forbid(); }
    const classId = req.query.get('classId');
    const sc = P.studentScope(u);
    let sql = `SELECT ${P.studentFields(u).map((c) => `st.${c}`).join(', ')} FROM student st WHERE ${sc.sql}`;
    const params = [...sc.params];
    if (classId) {
      const cs = P.classScope(u);
      if (!db.prepare(`SELECT 1 FROM class c WHERE c.id = ? AND ${cs.sql}`).get(Number(classId), ...cs.params)) {
        audit(db, u, 'export.students', 'class', classId, null, 'refuse'); notFound();
      }
      sql += ` AND st.id IN (SELECT student_id FROM enrollment WHERE class_id = ? AND status = 'actif' AND school_id = ?)`;
      params.push(Number(classId), u.school_id);
    }
    const rows = db.prepare(sql + ' ORDER BY st.id').all(...params);
    audit(db, u, 'export.students', classId ? 'class' : 'school', classId || u.school_id, req.query.get('reason'));
    return { __csv: csv(rows, P.studentFields(u)) };
  }],
  ['GET', /^\/api\/export\/finance$/, (db, req, u) => {
    if (!P.can.exportFinance(u)) { audit(db, u, 'export.finance', 'finance', null, null, 'refuse'); forbid(); }
    const rows = db.prepare(`SELECT f.id, st.code, f.label, f.amount_cents, f.currency FROM finance_entry f
      JOIN student st ON st.id = f.student_id AND st.school_id = f.school_id WHERE f.school_id = ?`).all(u.school_id);
    audit(db, u, 'export.finance', 'school', u.school_id, req.query.get('reason'));
    return { __csv: csv(rows, ['id', 'code', 'label', 'amount_cents', 'currency']) };
  }],
  ['PUT', /^\/api\/users\/(\d+)\/roles$/, (db, req, u, [id]) => {
    if (!P.can.manageRoles(u)) { audit(db, u, 'user.roles', 'user', id, null, 'refuse'); forbid(); }
    const { roles, reason } = req.body || {};
    if (!reason || !Array.isArray(roles)) throw new HttpError(400, 'rôles et motif obligatoires');
    const target = db.prepare('SELECT id FROM app_user WHERE id = ? AND school_id = ?').get(Number(id), u.school_id);
    if (!target) notFound();
    db.transaction(() => {
      db.prepare('DELETE FROM user_role WHERE user_id = ? AND school_id = ?').run(target.id, u.school_id);
      for (const r of roles) db.prepare('INSERT INTO user_role (school_id, user_id, role) VALUES (?,?,?)').run(u.school_id, target.id, r);
      audit(db, u, 'user.roles', 'user', id, `${reason} [rôles: ${roles.join(',')}]`);
    })();
    return { id: target.id, roles };
  }],
  ['GET', /^\/api\/audit$/, (db, req, u) => {
    if (!P.can.readAudit(u)) forbid();
    return db.prepare('SELECT * FROM audit_log WHERE school_id = ? ORDER BY id DESC LIMIT 500').all(u.school_id);
  }],
];

// Limiteur en mémoire : N échecs par clé (IP, compte) dans une fenêtre glissante.
// Un seul processus suffit pour la démo ; en production, le stocker en base ou dans Redis.
function createLimiter({ max = 5, windowMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
  const hits = new Map();
  const recent = (k) => (hits.get(k) || []).filter((t) => now() - t < windowMs);
  return {
    blocked(keys) {
      let wait = 0;
      for (const k of keys) { const r = recent(k); hits.set(k, r); if (r.length >= max) wait = Math.max(wait, windowMs - (now() - r[0])); }
      return wait;
    },
    fail(keys) { for (const k of keys) hits.set(k, [...recent(k), now()]); },
    reset(keys) { for (const k of keys) hits.delete(k); },
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
    limiter: options.limiter || createLimiter(options.rateLimit),
    demo: !!options.demo,
    secureCookie: !!options.secureCookie,
  };
  const serveStatic = options.staticRoot === false ? null : createStatic(options.staticRoot || path.join(__dirname, '..', '..'));
  return http.createServer(async (req, res) => {
    let extra = {};
    const cookies = [];
    req.setCookie = (c) => cookies.push(c);
    const withCookies = (h) => (cookies.length ? { ...h, 'set-cookie': cookies } : h);
    const send = (status, body) => {
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
        if (!opts.public) { user = loadSession(db, req.token); if (!user) throw new HttpError(401, 'connexion requise'); }
        else if (opts.optionalUser && req.token) user = loadSession(db, req.token);
        return send(200, await handler(db, req, user, m.slice(1), ctx));
      }
      throw new HttpError(404, 'introuvable');
    } catch (e) {
      if (e instanceof HttpError) { extra = e.headers; return send(e.status, { error: e.message }); }
      if (/CHECK constraint|FOREIGN KEY/.test(e.message)) return send(400, { error: 'donnée refusée par la base' });
      console.error(e);
      send(500, { error: 'erreur serveur' });
    }
  });
}

module.exports = { createServer, createLimiter, csv, SECURITY_HEADERS, normalizePhone, parseIdentifier };
