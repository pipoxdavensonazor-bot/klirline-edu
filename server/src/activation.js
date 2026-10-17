'use strict';
// Codes d'activation imprimés par l'école (bloc 9) : pour un élève ou un parent qui ne reçoit ni e-mail, ni WhatsApp,
// ni Telegram, la direction ou le secrétariat imprime une liste de codes (un par compte, usage unique, 30 jours par
// défaut, 90 au plus). Saisi avec l'école sur l'écran de connexion (« J'ai un code de mon école »), le code ouvre une
// session ; cocher « Faire confiance à cet appareil » évite d'en redemander pendant 30 jours. Seule une empreinte
// HMAC (poivre NORIA_OTP_SECRET, liée à l'école) est conservée ; un nouveau code annule le précédent du même compte.
// Création et liste passent par la transaction RLS de l'école (rôle noria_app) ; la saisie, avant connexion, par la
// connexion système.
const crypto = require('node:crypto');
const P = require('./policy');
const { HttpError, forbid, notFound, audit, refuse } = require('./common');
const { activeUser } = require('./appareils');

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // sans 0/O, 1/I/L : lisible une fois imprimé
const LEN = 10; // 31^10 ≈ 8·10^14 combinaisons, plus la limite de tentatives
const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;
const MAX_BATCH = 400;
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const pepper = () => process.env.NORIA_OTP_SECRET || '';

function newCode() { let s = ''; for (let i = 0; i < LEN; i++) s += ALPHABET[crypto.randomInt(0, ALPHABET.length)]; return s; }
const pretty = (c) => `${c.slice(0, 4)}-${c.slice(4, 7)}-${c.slice(7)}`;
const normalize = (v) => String(v || '').toUpperCase().replace(/[\s-]/g, '');
const codeHash = (schoolId, code) => crypto.createHmac('sha256', `activation|${pepper()}`).update(`${schoolId}:${code}`).digest('hex');

// Comptes visés : élèves (compte relié à la fiche) ou parents (liens parent), actifs, éventuellement d'une classe.
async function targets(db, u, role, classId, studentIds) {
  const params = [u.school_id];
  let where = 'st.school_id = ?';
  if (classId) { where += " AND st.id IN (SELECT student_id FROM enrollment WHERE school_id = ? AND class_id = ? AND status = 'actif')"; params.push(u.school_id, Number(classId)); }
  if (studentIds && studentIds.length) { where += ` AND st.id IN (${studentIds.map(() => '?').join(',')})`; params.push(...studentIds.map(Number)); }
  const cls = `(SELECT c.name FROM enrollment e JOIN class c ON c.id = e.class_id AND c.school_id = e.school_id
    WHERE e.student_id = st.id AND e.school_id = st.school_id AND e.status = 'actif' ORDER BY e.id DESC LIMIT 1)`;
  const sql = role === 'eleve'
    ? `SELECT au.id AS user_id, au.display_name, st.id AS student_id, st.code AS student_code, st.first_name, st.last_name, ${cls} AS class_name
       FROM student st JOIN app_user au ON au.id = st.user_id AND au.school_id = st.school_id
       JOIN user_role ur ON ur.user_id = au.id AND ur.school_id = au.school_id AND ur.role = 'eleve'
       WHERE ${where} AND au.state = 'actif' ORDER BY class_name, st.last_name, st.first_name`
    : `SELECT au.id AS user_id, au.display_name, st.id AS student_id, st.code AS student_code, st.first_name, st.last_name, ${cls} AS class_name
       FROM student st JOIN parent_link pl ON pl.student_id = st.id AND pl.school_id = st.school_id
       JOIN app_user au ON au.id = pl.parent_user_id AND au.school_id = pl.school_id
       JOIN user_role ur ON ur.user_id = au.id AND ur.school_id = au.school_id AND ur.role = 'parent'
       WHERE ${where} AND au.state = 'actif' ORDER BY class_name, st.last_name, st.first_name, au.display_name`;
  const rows = await db.all(sql, ...params);
  // Un parent de plusieurs enfants : un seul code (le premier enfant sert de repère sur la liste).
  const seen = new Set();
  return rows.filter((r) => (seen.has(r.user_id) ? false : seen.add(r.user_id)));
}

function createRoutes({ startSession }) {
  const can = (u) => P.has(u, 'direction', 'secretariat');
  const routes = [
    // Génération d'un lot : codes rendus UNE seule fois (liste à imprimer), jamais relisibles ensuite.
    ['POST', /^\/api\/codes-activation$/, async (db, req, u, _m, ctx) => {
      if (!can(u)) await refuse(ctx, u, 'activation.create', 'activation', null, null);
      const { role, class_id: classId, student_ids: studentIds } = req.body || {};
      if (!['eleve', 'parent'].includes(role)) throw new HttpError(400, 'rôle : eleve ou parent');
      if (studentIds != null && (!Array.isArray(studentIds) || studentIds.length > MAX_BATCH || !studentIds.every((x) => Number.isInteger(Number(x)))))
        throw new HttpError(400, 'élèves invalides');
      const days = req.body.days == null ? DEFAULT_DAYS : Number(req.body.days);
      if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) throw new HttpError(400, `validité : 1 à ${MAX_DAYS} jours`);
      if (classId && !(await db.get('SELECT 1 AS x FROM class WHERE id = ? AND school_id = ?', Number(classId), u.school_id))) notFound();
      const list = await targets(db, u, role, classId, studentIds);
      if (!list.length) throw new HttpError(404, role === 'eleve' ? 'aucun compte élève actif pour cette sélection' : 'aucun compte parent actif pour cette sélection');
      if (list.length > MAX_BATCH) throw new HttpError(400, `au plus ${MAX_BATCH} codes par lot : choisissez une classe`);
      const batch = `${iso().slice(0, 10)}-${crypto.randomBytes(3).toString('hex')}`;
      const expires = iso(days * 86400e3);
      const now = iso();
      const out = [];
      for (const r of list) {
        await db.run('UPDATE activation_code SET revoked_at = ? WHERE school_id = ? AND user_id = ? AND used_at IS NULL AND revoked_at IS NULL', now, u.school_id, r.user_id);
        const code = newCode();
        await db.run(`INSERT INTO activation_code (school_id, user_id, student_id, role, batch, code_hash, created_by, created_at, expires_at)
          VALUES (?,?,?,?,?,?,?,?,?)`, u.school_id, r.user_id, r.student_id, role, batch, codeHash(u.school_id, code), u.id, now, expires);
        out.push({ code: pretty(code), name: r.display_name, student: `${r.first_name} ${r.last_name}`, student_code: r.student_code, class: r.class_name || '', role });
      }
      await audit(db, u, 'activation.create', 'activation', batch, `${role} × ${out.length}${classId ? ` (classe ${Number(classId)})` : ''}, ${days} j`);
      const school = await db.get('SELECT slug, name FROM school WHERE id = ?', u.school_id);
      return { batch, expiresAt: expires, school: { slug: school.slug, name: school.name }, codes: out };
    }],
    ['GET', /^\/api\/codes-activation$/, async (db, req, u) => {
      if (!can(u)) forbid();
      return db.all(`SELECT ac.id, ac.batch, ac.role, ac.created_at, ac.expires_at, ac.used_at, ac.revoked_at, au.display_name AS name,
          st.first_name || ' ' || st.last_name AS student, st.code AS student_code, cb.display_name AS created_by
        FROM activation_code ac JOIN app_user au ON au.id = ac.user_id AND au.school_id = ac.school_id
        LEFT JOIN student st ON st.id = ac.student_id AND st.school_id = ac.school_id
        LEFT JOIN app_user cb ON cb.id = ac.created_by AND cb.school_id = ac.school_id
        WHERE ac.school_id = ? ORDER BY ac.id DESC LIMIT 500`, u.school_id);
    }],
    ['POST', /^\/api\/codes-activation\/(\d+)\/annuler$/, async (db, req, u, [id], ctx) => {
      if (!can(u)) await refuse(ctx, u, 'activation.revoke', 'activation', id, null);
      const r = await db.run('UPDATE activation_code SET revoked_at = ? WHERE id = ? AND school_id = ? AND used_at IS NULL AND revoked_at IS NULL', iso(), Number(id), u.school_id);
      if (!r.changes) notFound();
      await audit(db, u, 'activation.revoke', 'activation', id, null);
      return { ok: true };
    }],
  ];
  const publicRoutes = [
    // Saisie du code (école obligatoire) : réponse identique pour un code inconnu, expiré, annulé ou déjà utilisé.
    ['POST', /^\/api\/login\/activation$/, async (db, req, _u, _m, ctx) => {
      const school = String((req.body && req.body.school) || '').trim();
      const code = normalize(req.body && req.body.code);
      const keys = [`activ-ip:${req.ip}`];
      const schoolKey = [`activ-ecole:${school}`];
      const wait = Math.max(await ctx.limiter.blocked(keys), await ctx.activationLimit.blocked(schoolKey));
      if (wait) throw new HttpError(429, 'trop de tentatives, réessayez plus tard', { 'retry-after': String(Math.ceil(wait / 1000)) });
      const bad = async () => { await ctx.limiter.fail(keys); await ctx.activationLimit.fail(schoolKey); throw new HttpError(401, 'code invalide ou expiré'); };
      if (!school || code.length !== LEN || ![...code].every((c) => ALPHABET.includes(c))) return bad();
      const sch = await db.get("SELECT id, slug FROM school WHERE slug = ? AND status = 'active'", school);
      if (!sch) return bad();
      const row = await db.get('SELECT * FROM activation_code WHERE code_hash = ? AND school_id = ?', codeHash(sch.id, code), sch.id);
      if (!row || row.used_at || row.revoked_at || row.expires_at <= iso()) return bad();
      const use = await db.run('UPDATE activation_code SET used_at = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL', iso(), row.id);
      if (!use.changes) return bad();
      const user = await activeUser(db, row.school_id, row.user_id);
      if (!user) return bad();
      await audit(db, user, 'login', 'user', user.id, 'code d’activation de l’école', 'ok');
      req.body = { ...req.body, school: sch.slug, trust: req.body.trust === true };
      return startSession(db, req, ctx, user);
    }, { public: true }],
  ];
  return { routes, publicRoutes };
}

module.exports = { createRoutes, newCode, normalize, pretty, codeHash, ALPHABET, LEN, DEFAULT_DAYS, MAX_DAYS };
