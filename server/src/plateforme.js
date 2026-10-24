'use strict';
// Administration générale de la plateforme (super-admin) : compte SANS école, créé par le script CLI
// (npm run admin:creer), jamais par l'interface. Connexion en deux étapes obligatoire : mot de passe, puis code à
// 6 chiffres (même mécanisme que la connexion par code : HMAC salé, 10 min, 5 essais). Session séparée (cookie
// noria_admin, 2 h). Ces routes utilisent la connexion système (hors RLS) : elles sont toutes journalisées dans
// platform_audit, en lecture par défaut ; les écritures (créer, suspendre, réactiver une école, traiter une demande d'inscription, inviter une direction) sont toutes journalisées.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const auth = require('./auth');
const otp = require('./otp');
const I = require('./identite');
const { HttpError } = require('./common');

const COOKIE = 'noria_admin';
const SESSION_HOURS = 2;
const CODE_MIN = 10;
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const STARTED = Date.now();

function log(db, admin, action, target, detail, outcome = 'ok', ip = null) {
  return db.run('INSERT INTO platform_audit (admin_id, action, target, detail, outcome, ip) VALUES (?,?,?,?,?,?)',
    admin ? admin.id : null, action, target == null ? null : String(target), detail ? String(detail).slice(0, 500) : null, outcome, ip);
}
async function loadAdmin(db, token) {
  if (!token) return null;
  const a = await db.get(`SELECT a.id, a.email, a.display_name, a.state, s.expires_at FROM platform_session s
    JOIN platform_admin a ON a.id = s.admin_id WHERE s.token_hash = ?`, auth.sha256(token));
  if (!a || a.state !== 'actif' || a.expires_at < iso()) return null;
  return a;
}
const reason = (b) => { const r = String((b && b.reason) || '').trim(); if (r.length < 3 || r.length > 300) throw new HttpError(400, 'motif obligatoire (3 à 300 caractères)'); return r; };

async function dbSize(db) {
  try {
    if (db.kind === 'pg') return Number((await db.get('SELECT pg_database_size(current_database()) AS n')).n);
    const pc = db.raw.pragma('page_count', { simple: true }), ps = db.raw.pragma('page_size', { simple: true });
    return pc * ps;
  } catch { return null; }
}
// Sauvegardes : etat.json (écrit par deploy/sauvegarde/noria-sauvegarde.sh, 0644, sans secret) fait foi ; sinon on
// parcourt le dossier et ses sous-dossiers quotidien/hebdomadaire/mensuel (ceux-ci sont souvent en 0700 root : illisibles).
const BK_FILE = /\.(age|enc|gz|dump|json\.gz)$/;
function backups() {
  const dir = process.env.BACKUP_DIR || process.env.NORIA_BACKUP_DIR;
  if (!dir) return { configure: false };
  try {
    const e = JSON.parse(fs.readFileSync(path.join(dir, 'etat.json'), 'utf8'));
    const d = e && e.derniere;
    if (d && typeof d.name === 'string' && !Number.isNaN(Date.parse(d.at))) {
      return { configure: true, source: 'etat.json', count: Number(e.quotidiennes) || 1, last: { name: d.name.slice(0, 120), size: Number(d.size) || 0, at: new Date(d.at).toISOString() },
        total: null, chiffrement: ['age', 'enc'].includes(e.chiffrement) ? e.chiffrement : null, hors_site: e.hors_site === true };
    }
  } catch { /* pas d'état : parcours du dossier */ }
  try {
    const files = []; let unreadable = 0;
    const scan = (d, depth) => {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, ent.name);
        if (ent.isDirectory() && depth === 0 && /^(quotidien|hebdomadaire|mensuel)$/.test(ent.name)) { try { scan(p, 1); } catch { unreadable++; } }
        else if (ent.isFile() && BK_FILE.test(ent.name) && !ent.name.startsWith('.')) { const st = fs.statSync(p); files.push({ name: ent.name, size: st.size, at: st.mtime.toISOString() }); }
      }
    };
    scan(dir, 0);
    files.sort((a, b) => (a.at < b.at ? 1 : -1));
    if (!files.length && unreadable) return { configure: true, error: 'sous-dossiers de sauvegarde illisibles et etat.json absent' };
    return { configure: true, source: 'dossier', count: files.length, last: files[0] || null, total: files.reduce((a, f) => a + f.size, 0) };
  } catch (e) { return { configure: true, error: 'dossier de sauvegarde illisible' }; }
}

// Création d'une école (route POST /api/admin/ecoles et acceptation d'une demande d'inscription, bloc 8), dans la
// transaction de l'appelant ; journalisée.
const DEPS = ['artibonite', 'centre', 'grand-anse', 'nippes', 'nord', 'nord-est', 'nord-ouest', 'ouest', 'sud', 'sud-est'];
async function createSchool(t, a, req, b) {
  const slug = String(b.slug || '').trim().toLowerCase();
  const name = String(b.name || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug)) throw new HttpError(400, 'identifiant (slug) : lettres minuscules, chiffres et tirets');
  if (!name || name.length > 120) throw new HttpError(400, 'nom obligatoire (120 caractères au plus)');
  const initials = I.cleanInitials(b.initials || '') || I.deriveInitials(name);
  // Bloc 6 : département et commune facultatifs (filtres du portail du ministère).
  const department = b.department ? String(b.department) : null;
  if (department && !DEPS.includes(department)) throw new HttpError(400, 'département inconnu');
  const commune = b.commune ? String(b.commune).trim().slice(0, 80) : null;
  if (await t.get('SELECT 1 AS x FROM school WHERE slug = ?', slug)) throw new HttpError(409, 'identifiant (slug) déjà utilisé');
  const sid = await t.insert('INSERT INTO school (slug, name, initials, default_lang, department, commune) VALUES (?,?,?,?,?,?)', slug, name, initials, b.lang === 'ht' ? 'ht' : 'fr', department, commune);
  await t.insert('INSERT INTO campus (school_id, name) VALUES (?,?)', sid, 'Campus principal');
  await log(t, a, 'admin.school.create', sid, `${slug} — ${b.reason}`, 'ok', req.ip);
  return { id: sid, slug, name, initials, department, commune, status: 'active' };
}

const ROUTES = [
  // Étape 1 : mot de passe. Réponse identique (ticket factice) que le compte existe ou non ; le code part par SMS
  // (téléphone du compte) ou e-mail.
  ['POST', /^\/api\/admin\/login$/, async (db, req, _a, _m, ctx) => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const keys = [`admin-ip:${req.ip}`, `admin:${email}`];
    const wait = await ctx.limiter.blocked(keys);
    if (wait) throw new HttpError(429, 'trop de tentatives, réessayez plus tard', { 'retry-after': String(Math.ceil(wait / 1000)) });
    const a = await db.get("SELECT * FROM platform_admin WHERE email = ? AND state = 'actif'", email);
    const ok = await auth.verifyPassword(String((req.body || {}).password || ''), a ? a.password_hash : await auth.getDummyHash());
    if (!a || !ok) {
      await ctx.limiter.fail(keys);
      await log(db, a || null, 'admin.login', email.slice(0, 120), 'mot de passe', 'refuse', req.ip);
      throw new HttpError(401, 'identifiants invalides');
    }
    const ticket = crypto.randomBytes(24).toString('base64url');
    const code = otp.newCode();
    await db.run('UPDATE platform_login SET used_at = ? WHERE admin_id = ? AND used_at IS NULL', iso(), a.id);
    await db.run('INSERT INTO platform_login (admin_id, ticket_hash, code_hash, expires_at) VALUES (?,?,?,?)',
      a.id, auth.sha256(ticket), otp.hashCode(code, `admin${a.id}`), iso(CODE_MIN * 60e3));
    const channel = a.phone ? 'sms' : 'email';
    const text = `NORIA administration : code ${code}. Valable ${CODE_MIN} min. Ne le donnez à personne.`;
    try { await ctx.notifier.adapter(channel).send({ to: a.phone || a.email, subject: 'NORIA administration : code de connexion', text }); }
    catch (e) { await log(db, a, 'admin.login.code', a.id, `envoi ${channel} en échec`, 'echec', req.ip); throw new HttpError(503, 'envoi du code impossible'); }
    await log(db, a, 'admin.login.code', a.id, `code envoyé (${channel})`, 'ok', req.ip);
    return { ticket, channel, minutes: CODE_MIN };
  }],
  // Étape 2 : code à 6 chiffres (2FA obligatoire).
  ['POST', /^\/api\/admin\/login\/code$/, async (db, req, _a, _m, ctx) => {
    const { ticket, code } = req.body || {};
    const keys = [`admin-code:${req.ip}`];
    if (await ctx.limiter.blocked(keys)) throw new HttpError(429, 'trop de tentatives, réessayez plus tard');
    const row = await db.get('SELECT * FROM platform_login WHERE ticket_hash = ? AND used_at IS NULL AND expires_at > ?', auth.sha256(String(ticket || '')), iso());
    const bad = async (why) => { await ctx.limiter.fail(keys); await log(db, row ? { id: row.admin_id } : null, 'admin.login', row ? row.admin_id : null, `code ${why}`, 'refuse', req.ip); throw new HttpError(401, 'code invalide ou expiré'); };
    if (!row) { otp.checkCode(String(code || ''), 0, null); return bad('absent ou expiré'); }
    const take = await db.run('UPDATE platform_login SET attempts = attempts + 1 WHERE id = ? AND used_at IS NULL AND attempts < ?', row.id, otp.MAX_ATTEMPTS);
    if (!take.changes) return bad('essais épuisés');
    const c = String(code || '').replace(/\s/g, '');
    if (!(/^\d{6}$/.test(c) & otp.checkCode(c, `admin${row.admin_id}`, row.code_hash))) return bad('erroné');
    if (!(await db.run('UPDATE platform_login SET used_at = ? WHERE id = ? AND used_at IS NULL', iso(), row.id)).changes) return bad('déjà utilisé');
    const token = crypto.randomBytes(32).toString('base64url');
    await db.run('INSERT INTO platform_session (token_hash, admin_id, expires_at) VALUES (?,?,?)', auth.sha256(token), row.admin_id, iso(SESSION_HOURS * 3600e3));
    req.setCookie(`${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${SESSION_HOURS * 3600}${ctx.secureCookie ? '; Secure' : ''}`);
    await log(db, { id: row.admin_id }, 'admin.login', row.admin_id, 'mot de passe + code', 'ok', req.ip);
    if (ctx.sec) await ctx.sec.loginOk(req, { account: `admin:${row.admin_id}`, role: 'superadmin' });
    return { ok: true, token };
  }],
  ['POST', /^\/api\/admin\/logout$/, async (db, req, a) => {
    await db.run('DELETE FROM platform_session WHERE token_hash = ?', auth.sha256(String(req.adminToken || '')));
    req.setCookie(`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0`);
    await log(db, a, 'admin.logout', a.id, null, 'ok', req.ip);
    return { ok: true };
  }, { auth: true }],
  ['GET', /^\/api\/admin\/me$/, async (db, req, a) => ({ id: a.id, email: a.email, name: a.display_name, expiresAt: a.expires_at }), { auth: true, quiet: true }],

  // Lecture : écoles, comptes, journal global, état du serveur, connexions échouées.
  ['GET', /^\/api\/admin\/ecoles$/, async (db) => db.all(`SELECT s.id, s.slug, s.name, s.initials, s.status, s.status_reason, s.created_at,
      (SELECT COUNT(*) FROM student st WHERE st.school_id = s.id) AS students,
      (SELECT COUNT(*) FROM app_user u WHERE u.school_id = s.id AND u.state = 'actif') AS accounts
    FROM school s ORDER BY s.name`), { auth: true }],
  ['GET', /^\/api\/admin\/comptes$/, async (db, req) => {
    const q = `%${String(req.query.get('q') || '').trim().toLowerCase().slice(0, 80)}%`;
    const rows = await db.all(`SELECT p.id, p.email, p.display_name, p.created_at, (p.password_hash IS NOT NULL) AS has_password
      FROM person p WHERE lower(p.email) LIKE ? OR lower(p.display_name) LIKE ? ORDER BY p.id DESC LIMIT 200`, q, q);
    const out = [];
    for (const p of rows) {
      const ms = await db.all('SELECT u.id, u.state, s.name AS school, s.slug FROM app_user u JOIN school s ON s.id = u.school_id WHERE u.person_id = ? ORDER BY s.name', p.id);
      for (const m of ms) m.roles = (await db.all('SELECT role FROM user_role WHERE user_id = ?', m.id)).map((r) => r.role);
      out.push({ ...p, has_password: !!p.has_password, ecoles: ms.map(({ id, ...m }) => m) });
    }
    return out;
  }, { auth: true }],
  ['GET', /^\/api\/admin\/journal$/, async (db) => {
    const plat = await db.all('SELECT id, admin_id, action, target, detail, outcome, ip, created_at FROM platform_audit ORDER BY id DESC LIMIT 150');
    const sch = await db.all(`SELECT a.id, a.school_id, s.slug AS school, a.actor_user_id, a.action, a.record_type, a.record_id, a.reason, a.outcome, a.created_at
      FROM audit_log a JOIN school s ON s.id = a.school_id ORDER BY a.id DESC LIMIT 150`);
    return { plateforme: plat, ecoles: sch };
  }, { auth: true }],
  ['GET', /^\/api\/admin\/etat$/, async (db) => {
    let ok = true; try { await db.get('SELECT 1 AS ok'); } catch { ok = false; }
    const mig = (await db.all('SELECT version FROM schema_migrations ORDER BY version')).map((r) => r.version);
    const n = async (sql, ...p) => Number((await db.get(sql, ...p)).n);
    return {
      healthz: { ok, db: db.kind }, taille_base: await dbSize(db), sauvegardes: backups(), migrations: mig,
      compteurs: { ecoles: await n('SELECT COUNT(*) AS n FROM school'), personnes: await n('SELECT COUNT(*) AS n FROM person'), eleves: await n('SELECT COUNT(*) AS n FROM student'),
        sessions: await n('SELECT COUNT(*) AS n FROM session WHERE expires_at > ?', iso()) },
      serveur: { node: process.version, uptime_s: Math.round((Date.now() - STARTED) / 1000), memoire_mo: Math.round(process.memoryUsage().rss / 1048576) },
    };
  }, { auth: true }],
  ['GET', /^\/api\/admin\/echecs$/, async (db) => {
    const since = iso(-7 * 86400e3);
    const ecoles = await db.all(`SELECT a.created_at, s.slug AS school, a.actor_user_id, a.action, a.reason FROM audit_log a JOIN school s ON s.id = a.school_id
      WHERE a.action = 'login' AND a.outcome = 'refuse' AND a.created_at > ? ORDER BY a.id DESC LIMIT 200`, since.replace('T', ' ').slice(0, 19));
    const admin = await db.all("SELECT created_at, target, detail, ip FROM platform_audit WHERE action = 'admin.login' AND outcome = 'refuse' ORDER BY id DESC LIMIT 100");
    const limiteur = Number((await db.get('SELECT COUNT(*) AS n FROM login_attempt WHERE at_ms > ?', Date.now() - 15 * 60e3)).n);
    return { ecoles, admin, tentatives_15_min: limiteur };
  }, { auth: true }],

  // Écritures (motif obligatoire, journalisées) : créer, suspendre, réactiver une école.
  ['POST', /^\/api\/admin\/ecoles$/, async (db, req, a) => {
    const b = req.body || {}; const why = reason(b);
    return db.tx((t) => createSchool(t, a, req, { ...b, reason: why }));
  }, { auth: true, write: true }],
  ['POST', /^\/api\/admin\/ecoles\/(\d+)\/(suspendre|reactiver)$/, async (db, req, a, [id, op]) => {
    const why = reason(req.body);
    const status = op === 'suspendre' ? 'suspendue' : 'active';
    const r = await db.run('UPDATE school SET status = ?, status_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', status, why, Number(id));
    if (!r.changes) throw new HttpError(404, 'introuvable');
    if (status === 'suspendue') await db.run('DELETE FROM session WHERE school_id = ?', Number(id)); // déconnexion immédiate
    await log(db, a, `admin.school.${op}`, id, why, 'ok', req.ip);
    return { id: Number(id), status };
  }, { auth: true, write: true }],
];
// Assistant sécurité (bloc 3) : mêmes garanties (session super-admin, x-noria, journal).
ROUTES.push(...require('./securite-actions').routes({ log, dbSize, backups }));
// Bloc 4 : étape « autorisation ministère » des transferts (désactivée par défaut).
ROUTES.push(...require('./transferts').adminRoutes({ log }));
// Bloc 5 : modération et publication du portail public, annonces et encarts sponsorisés.
ROUTES.push(...require('./portail').adminRoutes({ log }));
// Bloc 6 : comptes du ministère (création, désactivation) et journal de leurs consultations (404 si NORIA_MINISTERE=0).
ROUTES.push(...require('./ministere').adminRoutes({ log }));
ROUTES.push(...require('./facturation').adminRoutes({ log }));
// Bloc 8 : demandes d'inscription des écoles (accepter, refuser) et invitation de la direction d'une école.
ROUTES.push(...require('./portail-public').adminRoutes({ log, createSchool }));

function parseAdminToken(req, parseCookies) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return { token: h.slice(7), cookie: false };
  const c = parseCookies(req.headers.cookie)[COOKIE];
  return { token: c || null, cookie: !!c };
}

async function dispatch(db, req, url, ctx, parseCookies) {
  const { token, cookie } = parseAdminToken(req, parseCookies);
  if (cookie && !['GET', 'HEAD'].includes(req.method) && req.headers['x-noria'] !== '1') throw new HttpError(403, 'en-tête x-noria manquant');
  req.adminToken = token;
  for (const [method, re, handler, opts = {}] of ROUTES) {
    const m = url.pathname.match(re);
    if (!m || method !== req.method) continue;
    let admin = null;
    if (opts.auth) {
      admin = await loadAdmin(db, token);
      if (!admin) throw new HttpError(401, 'connexion administrateur requise');
      req.admin = admin;
    }
    const out = await handler(db, req, admin, m.slice(1), ctx);
    // Toute lecture hors RLS est journalisée (sauf /me, appelé à chaque ouverture) ; les écritures le sont dans la route.
    if (opts.auth && !opts.write && !opts.quiet && method === 'GET') await log(db, admin, 'admin.read', url.pathname.replace('/api/admin/', ''), url.search ? url.search.slice(0, 120) : null, 'ok', req.ip);
    return out;
  }
  throw new HttpError(404, 'introuvable');
}

// Création d'un compte (script CLI seulement).
async function createAdmin(db, { email, name, phone, password }) {
  const mail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new Error('e-mail invalide');
  if (!name) throw new Error('nom obligatoire');
  if (typeof password !== 'string' || password.length < 14) throw new Error('mot de passe : 14 caractères minimum');
  const hash = await auth.hashPassword(password);
  const id = await db.insert('INSERT INTO platform_admin (email, phone, display_name, password_hash) VALUES (?,?,?,?)', mail, phone || null, String(name), hash);
  await log(db, { id }, 'admin.create', id, 'script CLI admin:creer', 'ok', null);
  return id;
}

module.exports = { dispatch, createAdmin, loadAdmin, createSchool, COOKIE, backups, dbSize };
