'use strict';
const http = require('node:http');
const { verifyPassword, createSession, loadSession, destroySession } = require('./auth');
const P = require('./policy');

function audit(db, u, action, recordType, recordId, reason, outcome = 'ok') {
  db.prepare(`INSERT INTO audit_log (school_id, actor_user_id, action, record_type, record_id, reason, outcome)
    VALUES (?,?,?,?,?,?,?)`).run(u.school_id, u.id, action, recordType, recordId == null ? null : String(recordId), reason || null, outcome);
}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const forbid = () => { throw new HttpError(403, 'accès refusé'); };
// Hors périmètre : 404, pour ne pas révéler l'existence du dossier.
const notFound = () => { throw new HttpError(404, 'introuvable'); };

function csv(rows, cols) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

function getStudent(db, u, id) {
  const sc = P.studentScope(u);
  const cols = P.studentFields(u).map((c) => `st.${c}`).join(', ');
  return db.prepare(`SELECT ${cols} FROM student st WHERE st.id = ? AND ${sc.sql}`).get(Number(id), ...sc.params);
}

const routes = [
  ['POST', /^\/api\/login$/, (db, req) => {
    const { school, email, password } = req.body || {};
    const user = db.prepare(`SELECT u.* FROM app_user u JOIN school s ON s.id = u.school_id
      WHERE s.slug = ? AND u.email = ? AND u.state = 'actif'`).get(String(school || ''), String(email || '').toLowerCase());
    if (!user || !verifyPassword(String(password || ''), user.password_hash)) throw new HttpError(401, 'identifiants invalides');
    return { token: createSession(db, user) };
  }, { public: true }],
  ['POST', /^\/api\/logout$/, (db, req) => { destroySession(db, req.token); return { ok: true }; }],
  ['GET', /^\/api\/me$/, (db, req, u) => ({ id: u.id, schoolId: u.school_id, name: u.display_name, roles: u.roles })],

  ['GET', /^\/api\/students$/, (db, req, u) => {
    if (!P.can.readStudents(u)) forbid();
    const sc = P.studentScope(u);
    const cols = P.studentFields(u).map((c) => `st.${c}`).join(', ');
    return db.prepare(`SELECT ${cols} FROM student st WHERE ${sc.sql} ORDER BY st.last_name`).all(...sc.params);
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

function createServer(db) {
  return http.createServer(async (req, res) => {
    const send = (status, body) => {
      if (body && body.__csv !== undefined) {
        res.writeHead(status, { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(body.__csv);
      }
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      req.query = url.searchParams;
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 1e6) throw new HttpError(413, 'trop volumineux'); }
      try { req.body = raw ? JSON.parse(raw) : {}; } catch { throw new HttpError(400, 'JSON invalide'); }
      const auth = req.headers.authorization || '';
      req.token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      for (const [method, re, handler, opts = {}] of routes) {
        const m = url.pathname.match(re);
        if (!m || method !== req.method) continue;
        let user = null;
        if (!opts.public) { user = loadSession(db, req.token); if (!user) throw new HttpError(401, 'connexion requise'); }
        return send(200, handler(db, req, user, m.slice(1)));
      }
      throw new HttpError(404, 'introuvable');
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.message });
      if (/CHECK constraint|FOREIGN KEY/.test(e.message)) return send(400, { error: 'donnée refusée par la base' });
      console.error(e);
      send(500, { error: 'erreur serveur' });
    }
  });
}

module.exports = { createServer };
