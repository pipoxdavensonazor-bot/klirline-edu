'use strict';
// Bloc 2 : photo de l'élève, badges par année scolaire (QR signé, expiration, révocation, réédition), recherche rapide,
// scan d'un badge (fiche selon le rôle) et vérification d'un badge par la direction.
const crypto = require('node:crypto');
const P = require('./policy');
const { HttpError, forbid, notFound, audit, refuse } = require('./common');
const { jpegSize } = require('./pdf');
const { badgePdf, badgeSheetPdf } = require('./pdf-bloc2');
const { schoolKeys } = require('./cles');
const { publicUrl } = require('./scolaire');
const emailsEleves = require('./emails-eleves');
const CB = require('./codes-barres');

const PHOTO_MAX = 40 * 1024;
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BADGE_RE = /^B[A-Z2-9]{26}$/;
const localDay = () => new Date().toLocaleDateString('en-CA', { timeZone: process.env.NORIA_TZ || 'America/Port-au-Prince' });
const int = (v) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, 'identifiant invalide'); return x; };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const chars = (buf, len) => { let s = ''; for (let i = 0; i < len; i++) s += ALPHA[buf[i] % 32]; return s; };

const staff = (u) => P.has(u, 'direction', 'secretariat');
const canScan = (u) => P.has(u, 'direction', 'secretariat', 'bibliotheque');
// Photo : personnes qui voient le dossier de l'élève, plus la bibliothèque (comparaison au comptoir). Jamais publique.
const photoScope = (u) => (P.has(u, 'bibliotheque') ? { sql: 'st.school_id = ?', params: [u.school_id] } : P.studentScope(u));

/* ---------- jetons ---------- */
// Jeton = « B » + aléa (20 caractères, 100 bits) + HMAC-SHA256(secret de l'école, aléa) tronqué (6 caractères).
const tokenFor = (secret, nonce) => `B${nonce}${chars(crypto.createHmac('sha256', secret).update(`badge|${nonce}`).digest(), 6)}`;
const newNonce = () => chars(crypto.randomBytes(20), 20);
function tokenSigned(secret, token) {
  if (!BADGE_RE.test(token)) return false;
  const expect = tokenFor(secret, token.slice(1, 21));
  return crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(token));
}
// Valeur scannée ou saisie : URL du QR (…#verifier=B…), jeton seul, ou code élève.
function parseScan(v) {
  const s = String(v || '').trim().slice(0, 300);
  const m = s.match(/[#?&]verifier=([A-Za-z0-9-]{4,40})/);
  const raw = (m ? m[1] : s).toUpperCase().replace(/-/g, '');
  if (BADGE_RE.test(raw)) return { token: raw };
  const code = s.toUpperCase();
  if (/^[A-Z0-9][A-Z0-9-]{1,40}$/.test(code)) return { code };
  return {};
}

function badgeStatus(b, today = localDay()) {
  if (b.status === 'revoque') return 'revoque';
  if (b.status === 'expire' || b.expires_on < today) return 'expire';
  return 'valide';
}
// Fin de l'année scolaire : ends_on, sinon 31 août de la seconde année du libellé (« 2026-2027 » → 2027-08-31).
function yearEnd(y) {
  if (y.ends_on) return y.ends_on;
  const m = String(y.label).match(/(\d{4})\D+(\d{4})/) || String(y.label).match(/(\d{4})/);
  const last = m ? Number(m[2] || m[1]) : new Date().getFullYear();
  return `${last}-08-31`;
}

/* ---------- photo ---------- */
function checkPhoto(b64) {
  const s = String(b64 || '').replace(/^data:image\/jpeg;base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return { error: 'photo : JPEG en base64 attendu' };
  const buf = Buffer.from(s, 'base64');
  if (buf.length > PHOTO_MAX) return { error: `photo trop lourde (${Math.ceil(buf.length / 1024)} Ko, 40 Ko au plus)` };
  const d = jpegSize(buf);
  if (!d || d.width !== d.height || d.width < 96 || d.width > 600 || ![1, 3].includes(d.components)) return { error: 'photo : image JPEG carrée de 96 à 600 pixels attendue' };
  return { buf, ...d };
}
async function photoOf(db, schoolId, studentId) {
  const r = await db.get('SELECT photo FROM student_photo WHERE school_id = ? AND student_id = ?', schoolId, studentId);
  return r ? Buffer.from(r.photo, 'base64') : null;
}
const photoUrl = (st) => (st.has_photo ? `/api/students/${st.id}/photo?v=${encodeURIComponent(String(st.photo_at || '1'))}` : null);

/* ---------- données des badges ---------- */
async function schoolForPdf(db, schoolId) {
  const s = await db.get('SELECT name, initials, logo FROM school WHERE id = ?', schoolId);
  return { name: s.name, initials: s.initials, logo: s.logo ? Buffer.from(s.logo, 'base64') : null };
}
const BADGE_SELECT = `SELECT b.*, st.code, st.first_name, st.last_name, y.label AS year
  FROM badge b JOIN student st ON st.id = b.student_id AND st.school_id = b.school_id
  JOIN school_year y ON y.id = b.school_year_id AND y.school_id = b.school_id`;
async function badgeDocs(db, ctx, req, schoolId, rows) {
  const keys = await schoolKeys(ctx.db, schoolId);
  const school = await schoolForPdf(db, schoolId);
  const base = publicUrl(req, ctx);
  const out = [];
  for (const b of rows) out.push({ school, photo: await photoOf(db, schoolId, b.student_id), first_name: b.first_name, last_name: b.last_name,
    class_name: b.class_name, code: b.code, year: b.year, expires_on: b.expires_on, status: badgeStatus(b),
    url: `${base}/#verifier=${tokenFor(keys.badgeSecret, b.token_nonce)}`, email: await emailsEleves.activeAddress(db, ctx, schoolId, b.student_id) });
  return out;
}
async function createBadge(t, u, keys, st, year, className, replacesId) {
  const nonce = newNonce();
  const token = tokenFor(keys.badgeSecret, nonce);
  return t.insert(`INSERT INTO badge (school_id, student_id, school_year_id, token_hash, token_nonce, class_name, expires_on, issued_by, replaces_id)
    VALUES (?,?,?,?,?,?,?,?,?)`, u.school_id, st.id, year.id, sha(token), nonce, className, yearEnd(year), u.id, replacesId || null);
}

// Badge à partir d'une valeur scannée : jeton signé reconnu, sinon null.
async function badgeByToken(db, sys, schoolId, token) {
  const b = await db.get(`${BADGE_SELECT} WHERE b.token_hash = ? AND b.school_id = ?`, sha(token), schoolId);
  if (!b) return null;
  const keys = await schoolKeys(sys, schoolId);
  return tokenSigned(keys.badgeSecret, token) ? b : null;
}

async function studentCard(db, u, studentId) {
  const st = await db.get(`SELECT st.id, st.code, st.first_name, st.last_name, st.birth_date, c.name AS class_name,
      (SELECT ph.updated_at FROM student_photo ph WHERE ph.school_id = st.school_id AND ph.student_id = st.id) AS photo_at
    FROM student st LEFT JOIN enrollment e ON e.student_id = st.id AND e.school_id = st.school_id AND e.status = 'actif'
    LEFT JOIN class c ON c.id = e.class_id AND c.school_id = e.school_id WHERE st.id = ? AND st.school_id = ?`, studentId, u.school_id);
  if (!st) return null;
  st.has_photo = !!st.photo_at;
  const card = { id: st.id, code: st.code, first_name: st.first_name, last_name: st.last_name, class_name: st.class_name, photo: photoUrl(st) };
  // Fiche selon le rôle : direction et secrétariat (naissance, parents) ; bibliothèque (prêts).
  if (staff(u)) {
    card.birth_date = st.birth_date;
    card.parents = await db.all(`SELECT us.display_name AS name, us.phone FROM parent_link pl JOIN app_user us ON us.id = pl.parent_user_id AND us.school_id = pl.school_id
      WHERE pl.student_id = ? AND pl.school_id = ? ORDER BY us.display_name`, st.id, u.school_id);
  }
  if (P.has(u, 'direction', 'secretariat', 'bibliotheque')) {
    card.loans = await db.all(`SELECT l.id, b.title, l.loaned_on, l.due_on, (l.due_on < ?) AS late FROM loan l JOIN book b ON b.id = l.book_id AND b.school_id = l.school_id
      WHERE l.student_id = ? AND l.school_id = ? AND l.returned_on IS NULL ORDER BY l.due_on`, localDay(), st.id, u.school_id);
    card.loans.forEach((l) => { l.late = !!Number(l.late); });
  }
  const last = await db.get(`${BADGE_SELECT} WHERE b.student_id = ? AND b.school_id = ? ORDER BY b.id DESC LIMIT 1`, st.id, u.school_id);
  card.current_badge = last ? { id: last.id, year: last.year, status: badgeStatus(last), expires_on: last.expires_on } : null;
  return card;
}

const routes = [
  // Photo : téléversement (direction, secrétariat), lecture (personnes autorisées), retrait.
  ['PUT', /^\/api\/students\/(\d+)\/photo$/, async (db, req, u, [id], ctx) => {
    if (!staff(u)) await refuse(ctx, u, 'student.photo', 'student', id, null);
    const st = await db.get('SELECT id, code FROM student WHERE id = ? AND school_id = ?', int(id), u.school_id); if (!st) notFound();
    const ph = checkPhoto(req.body && req.body.photo);
    if (ph.error) throw new HttpError(400, ph.error);
    const at = new Date().toISOString();
    const upd = await db.run('UPDATE student_photo SET photo = ?, size = ?, updated_by = ?, updated_at = ? WHERE school_id = ? AND student_id = ?',
      ph.buf.toString('base64'), ph.buf.length, u.id, at, u.school_id, st.id);
    if (!upd.changes) await db.run('INSERT INTO student_photo (school_id, student_id, photo, size, updated_by, updated_at) VALUES (?,?,?,?,?,?)',
      u.school_id, st.id, ph.buf.toString('base64'), ph.buf.length, u.id, at);
    await audit(db, u, 'student.photo', 'student', st.id, `${ph.width}x${ph.height} ${Math.ceil(ph.buf.length / 1024)} Ko`);
    return { ok: true, photo: photoUrl({ id: st.id, has_photo: true, photo_at: at }), size: ph.buf.length };
  }],
  ['DELETE', /^\/api\/students\/(\d+)\/photo$/, async (db, req, u, [id], ctx) => {
    if (!staff(u)) await refuse(ctx, u, 'student.photo.delete', 'student', id, null);
    const r = await db.run('DELETE FROM student_photo WHERE school_id = ? AND student_id = ?', u.school_id, int(id));
    if (!r.changes) notFound();
    await audit(db, u, 'student.photo.delete', 'student', id, null);
    return { ok: true };
  }],
  ['GET', /^\/api\/students\/(\d+)\/photo$/, async (db, req, u, [id]) => {
    const sc = photoScope(u);
    const st = await db.get(`SELECT st.id FROM student st WHERE st.id = ? AND ${sc.sql}`, int(id), ...sc.params);
    if (!st) notFound();
    const buf = await photoOf(db, u.school_id, st.id); if (!buf) notFound();
    return { __file: buf, type: 'image/jpeg', inline: true, cache: 'private, no-store' };
  }],

  // Années scolaires (choix de l'année des badges et des relevés).
  ['GET', /^\/api\/annees$/, async (db, req, u) => (await db.all('SELECT id, label, is_current, ends_on FROM school_year WHERE school_id = ? ORDER BY label', u.school_id))
    .map((y) => ({ id: y.id, label: y.label, current: !!Number(y.is_current), ends_on: yearEnd(y) }))],

  // Recherche instantanée (nom, prénom, code élève).
  ['GET', /^\/api\/recherche$/, async (db, req, u, _m, ctx) => {
    if (!canScan(u)) await refuse(ctx, u, 'student.search', 'school', u.school_id, null);
    const q = String(req.query.get('q') || '').trim().toLowerCase().slice(0, 60);
    if (q.length < 2) return [];
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const rows = await db.all(`SELECT st.id, st.code, st.first_name, st.last_name, c.name AS class_name,
        (SELECT ph.updated_at FROM student_photo ph WHERE ph.school_id = st.school_id AND ph.student_id = st.id) AS photo_at
      FROM student st LEFT JOIN enrollment e ON e.student_id = st.id AND e.school_id = st.school_id AND e.status = 'actif'
      LEFT JOIN class c ON c.id = e.class_id AND c.school_id = e.school_id
      WHERE st.school_id = ? AND (lower(st.code) LIKE ? ESCAPE '\\' OR lower(st.first_name || ' ' || st.last_name) LIKE ? ESCAPE '\\' OR lower(st.last_name || ' ' || st.first_name) LIKE ? ESCAPE '\\')
      ORDER BY st.last_name, st.first_name LIMIT 20`, u.school_id, like, like, like);
    return rows.map((r) => ({ id: r.id, code: r.code, first_name: r.first_name, last_name: r.last_name, class_name: r.class_name, photo: photoUrl({ ...r, has_photo: !!r.photo_at }) }));
  }],
  // Fiche d'un élève (depuis la recherche), même contenu que le scan.
  ['GET', /^\/api\/fiche\/(\d+)$/, async (db, req, u, [id], ctx) => {
    if (!canScan(u)) await refuse(ctx, u, 'student.card', 'student', id, null);
    const card = await studentCard(db, u, int(id)); if (!card) notFound();
    return card;
  }],
  // Scan d'un badge (ou saisie du code) : fiche selon le rôle, état du badge.
  ['POST', /^\/api\/scan$/, async (db, req, u, _m, ctx) => {
    if (!canScan(u)) await refuse(ctx, u, 'badge.scan', 'school', u.school_id, null);
    const v = parseScan(req.body && req.body.valeur);
    let studentId = null, badge = null;
    if (v.token) { badge = await badgeByToken(db, ctx.db, u.school_id, v.token); if (badge) studentId = badge.student_id; }
    else if (v.code) { const st = await db.get('SELECT id FROM student WHERE school_id = ? AND upper(code) = ?', u.school_id, v.code); if (st) studentId = st.id; }
    if (!studentId) { await audit(db, u, 'badge.scan', 'school', u.school_id, 'inconnu', 'refuse'); return { statut: 'inconnu' }; }
    const card = await studentCard(db, u, studentId);
    await audit(db, u, 'badge.scan', 'student', studentId, badge ? `badge ${badge.id} ${badgeStatus(badge)}` : 'code saisi');
    return { statut: badge ? badgeStatus(badge) : 'code', badge: badge ? { id: badge.id, year: badge.year, expires_on: badge.expires_on, revoked_reason: badge.revoked_reason } : null, eleve: card };
  }],
  // Vérification d'un badge par la direction : VALIDE, EXPIRÉ, RÉVOQUÉ ou INCONNU, avec photo et nom pour comparer.
  ['POST', /^\/api\/badges\/verifier$/, async (db, req, u, _m, ctx) => {
    if (!P.has(u, 'direction')) await refuse(ctx, u, 'badge.verify', 'school', u.school_id, null);
    const v = parseScan(req.body && req.body.valeur);
    const b = v.token ? await badgeByToken(db, ctx.db, u.school_id, v.token) : null;
    if (!b) { await audit(db, u, 'badge.verify', 'school', u.school_id, 'inconnu', 'refuse'); return { statut: 'inconnu' }; }
    const st = await db.get(`SELECT st.id, (SELECT ph.updated_at FROM student_photo ph WHERE ph.school_id = st.school_id AND ph.student_id = st.id) AS photo_at
      FROM student st WHERE st.id = ? AND st.school_id = ?`, b.student_id, u.school_id);
    const statut = badgeStatus(b);
    await audit(db, u, 'badge.verify', 'badge', b.id, statut);
    return { statut, badge: { id: b.id, year: b.year, expires_on: b.expires_on, issued_at: String(b.issued_at).slice(0, 10), revoked_reason: b.revoked_reason, class_name: b.class_name },
      eleve: { id: b.student_id, code: b.code, first_name: b.first_name, last_name: b.last_name, photo: photoUrl({ id: st.id, has_photo: !!st.photo_at, photo_at: st.photo_at }) } };
  }],

  // Badges : génération par année (classe ou élève), liste, PDF à l'unité, planche A4, révocation et réédition.
  ['POST', /^\/api\/badges\/generer$/, async (db, req, u, _m, ctx) => {
    if (!staff(u)) await refuse(ctx, u, 'badge.generate', 'school', u.school_id, null);
    const b = req.body || {};
    const year = b.school_year_id ? await db.get('SELECT * FROM school_year WHERE id = ? AND school_id = ?', int(b.school_year_id), u.school_id)
      : await db.get('SELECT * FROM school_year WHERE school_id = ? AND is_current = 1', u.school_id);
    if (!year) notFound();
    const where = ['c.school_id = ?', 'c.school_year_id = ?', "e.status = 'actif'"]; const params = [u.school_id, year.id];
    if (b.class_id) { where.push('c.id = ?'); params.push(int(b.class_id)); }
    if (b.student_id) { where.push('st.id = ?'); params.push(int(b.student_id)); }
    const list = await db.all(`SELECT st.id, st.code, c.name AS class_name FROM enrollment e JOIN class c ON c.id = e.class_id AND c.school_id = e.school_id
      JOIN student st ON st.id = e.student_id AND st.school_id = e.school_id WHERE ${where.join(' AND ')} ORDER BY c.name, st.last_name, st.first_name`, ...params);
    if ((b.class_id || b.student_id) && !list.length) notFound();
    const keys = await schoolKeys(ctx.db, u.school_id);
    const end = yearEnd(year);
    return db.tx(async (t) => {
      let created = 0, kept = 0, expired = 0;
      for (const st of list) {
        if (await t.get("SELECT id FROM badge WHERE school_id = ? AND student_id = ? AND school_year_id = ? AND status = 'valide'", u.school_id, st.id, year.id)) { kept++; continue; }
        await createBadge(t, u, keys, st, year, st.class_name);
        created++;
        // Les badges des années précédentes deviennent expirés.
        expired += (await t.run("UPDATE badge SET status = 'expire' WHERE school_id = ? AND student_id = ? AND status = 'valide' AND school_year_id <> ? AND expires_on < ?",
          u.school_id, st.id, year.id, end)).changes;
      }
      await audit(t, u, 'badge.generate', 'school_year', year.id, `${year.label} : ${created} créé(s), ${kept} déjà valide(s), ${expired} ancien(s) expiré(s)`);
      return { year: year.label, created, kept, expired };
    });
  }],
  ['GET', /^\/api\/badges$/, async (db, req, u, _m, ctx) => {
    if (!staff(u)) await refuse(ctx, u, 'badge.list', 'school', u.school_id, null);
    const where = ['b.school_id = ?']; const params = [u.school_id];
    if (req.query.get('school_year_id')) { where.push('b.school_year_id = ?'); params.push(int(req.query.get('school_year_id'))); }
    if (req.query.get('student_id')) { where.push('b.student_id = ?'); params.push(int(req.query.get('student_id'))); }
    if (req.query.get('class_id')) {
      where.push(`b.student_id IN (SELECT student_id FROM enrollment WHERE class_id = ? AND school_id = ? AND status = 'actif')`); params.push(int(req.query.get('class_id')), u.school_id);
    }
    const rows = await db.all(`${BADGE_SELECT} WHERE ${where.join(' AND ')} ORDER BY y.label DESC, st.last_name, st.first_name, b.id DESC LIMIT 1000`, ...params);
    const photos = new Set((await db.all('SELECT student_id FROM student_photo WHERE school_id = ?', u.school_id)).map((r) => r.student_id));
    return rows.map((r) => ({ id: r.id, student_id: r.student_id, code: r.code, first_name: r.first_name, last_name: r.last_name, class_name: r.class_name,
      year: r.year, expires_on: r.expires_on, status: badgeStatus(r), revoked_reason: r.revoked_reason, issued_at: String(r.issued_at).slice(0, 10), has_photo: photos.has(r.student_id) }));
  }],
  ['GET', /^\/api\/badges\/(\d+)\/pdf$/, async (db, req, u, [id], ctx) => {
    if (!staff(u)) await refuse(ctx, u, 'badge.pdf', 'badge', id, null);
    const b = await db.get(`${BADGE_SELECT} WHERE b.id = ? AND b.school_id = ?`, int(id), u.school_id); if (!b) notFound();
    if (badgeStatus(b) !== 'valide') throw new HttpError(410, 'badge expiré ou révoqué : rééditez-le');
    const [doc] = await badgeDocs(db, ctx, req, u.school_id, [b]);
    await audit(db, u, 'badge.pdf', 'badge', b.id, null);
    return { __pdf: badgePdf(doc), filename: `badge-${b.code}-${b.year}.pdf` };
  }],
  ['GET', /^\/api\/badges\/planche$/, async (db, req, u, _m, ctx) => {
    if (!staff(u)) await refuse(ctx, u, 'badge.sheet', 'school', u.school_id, null);
    const per = Number(req.query.get('par') || 10); if (![8, 10].includes(per)) throw new HttpError(400, 'par : 8 ou 10');
    const cls = await db.get('SELECT id, name, school_year_id FROM class WHERE id = ? AND school_id = ?', int(req.query.get('class_id')), u.school_id); if (!cls) notFound();
    const rows = await db.all(`${BADGE_SELECT} WHERE b.school_id = ? AND b.school_year_id = ? AND b.status = 'valide' AND b.expires_on >= ?
      AND b.student_id IN (SELECT student_id FROM enrollment WHERE class_id = ? AND school_id = ? AND status = 'actif') ORDER BY st.last_name, st.first_name`,
    u.school_id, cls.school_year_id, localDay(), cls.id, u.school_id);
    const docs = await badgeDocs(db, ctx, req, u.school_id, rows);
    await audit(db, u, 'badge.sheet', 'class', cls.id, `${docs.length} badge(s), planche de ${per}`);
    return { __pdf: badgeSheetPdf(docs, per, `Badges ${cls.name}`), filename: `badges-${cls.name.replace(/[^A-Za-z0-9]+/g, '-')}.pdf` };
  }],
  // Lot 3 : l'élève (et son parent) voit son propre badge valide dans son portail, avec QR de vérification et
  // code-barres Code 128 du code élève, générés localement (aucun service externe).
  ['GET', /^\/api\/badges\/moi$/, async (db, req, u, _m, ctx) => {
    if (!P.has(u, 'eleve', 'parent')) await refuse(ctx, u, 'badge.mine', 'school', u.school_id, 'rôle');
    const sc = P.studentScope(u, 'st');
    const rows = await db.all(`${BADGE_SELECT} WHERE b.school_id = ? AND b.status = 'valide' AND b.expires_on >= ? AND ${sc.sql} ORDER BY st.first_name, b.id DESC`, u.school_id, localDay(), ...sc.params);
    const keys = await schoolKeys(ctx.db, u.school_id);
    const base = publicUrl(req, ctx);
    const seen = new Set(), out = [];
    for (const b of rows) {
      if (seen.has(b.student_id)) continue; seen.add(b.student_id);
      const url = `${base}/#verifier=${tokenFor(keys.badgeSecret, b.token_nonce)}`;
      out.push({ id: b.id, student_id: b.student_id, code: b.code, first_name: b.first_name, last_name: b.last_name, class_name: b.class_name, year: b.year,
        expires_on: b.expires_on, status: badgeStatus(b), qr_svg: CB.qrSvg(url, { cell: 3 }), code128_svg: CB.code128Svg(b.code, { height: 50, module: 2 }),
        email: await emailsEleves.activeAddress(db, ctx, u.school_id, b.student_id) });
    }
    const sans = await db.all(`SELECT st.id, st.code, st.first_name, st.last_name FROM student st WHERE ${sc.sql} ORDER BY st.first_name`, ...sc.params);
    return { badges: out, sans_badge: sans.filter((s) => !seen.has(s.id)).map((s) => ({ student_id: s.id, code: s.code, first_name: s.first_name, last_name: s.last_name,
      code128_svg: CB.code128Svg(s.code, { height: 50, module: 2 }) })) };
  }],
  ['GET', /^\/api\/badges\/moi\/(\d+)\/pdf$/, async (db, req, u, [id], ctx) => {
    if (!P.has(u, 'eleve', 'parent')) await refuse(ctx, u, 'badge.mine.pdf', 'badge', id, 'rôle');
    const sc = P.studentScope(u, 'st');
    const b = await db.get(`${BADGE_SELECT} WHERE b.id = ? AND b.school_id = ? AND ${sc.sql}`, int(id), u.school_id, ...sc.params); if (!b) notFound();
    if (badgeStatus(b) !== 'valide') throw new HttpError(410, 'badge expiré ou révoqué');
    const [doc] = await badgeDocs(db, ctx, req, u.school_id, [b]);
    await audit(db, u, 'badge.mine.pdf', 'badge', b.id, null);
    return { __pdf: badgePdf(doc), filename: `badge-${b.code}-${b.year}.pdf` };
  }],
  ['POST', /^\/api\/badges\/(\d+)\/revoquer$/, async (db, req, u, [id], ctx) => {
    if (!staff(u)) await refuse(ctx, u, 'badge.revoke', 'badge', id, null);
    const reason = String((req.body && req.body.motif) || '').trim();
    if (reason.length < 3 || reason.length > 200) throw new HttpError(400, 'motif obligatoire (3 à 200 caractères)');
    const b = await db.get(`${BADGE_SELECT} WHERE b.id = ? AND b.school_id = ?`, int(id), u.school_id); if (!b) notFound();
    if (b.status === 'revoque') throw new HttpError(409, 'badge déjà révoqué');
    const keys = await schoolKeys(ctx.db, u.school_id);
    return db.tx(async (t) => {
      await t.run("UPDATE badge SET status = 'revoque', revoked_at = ?, revoked_by = ?, revoked_reason = ? WHERE id = ? AND school_id = ?", new Date().toISOString(), u.id, reason, b.id, u.school_id);
      await audit(t, u, 'badge.revoke', 'badge', b.id, reason);
      let reissued = null;
      if (req.body.reediter && badgeStatus(b) === 'valide') {
        const year = await t.get('SELECT * FROM school_year WHERE id = ? AND school_id = ?', b.school_year_id, u.school_id);
        reissued = await createBadge(t, u, keys, { id: b.student_id }, year, b.class_name, b.id);
        await audit(t, u, 'badge.reissue', 'badge', reissued, `remplace le badge ${b.id}`);
      }
      return { ok: true, reissued };
    });
  }],
];

// Page publique d'un QR de badge : école, prénom et initiale du nom, année, statut. Ni photo, ni code, ni classe.
async function verifyBadgePublic(db, token) {
  if (!BADGE_RE.test(token)) return null;
  const b = await db.get(`SELECT b.status, b.expires_on, b.school_id, b.token_nonce, s.name AS school, st.first_name, st.last_name, y.label AS year
    FROM badge b JOIN school s ON s.id = b.school_id JOIN student st ON st.id = b.student_id AND st.school_id = b.school_id
    JOIN school_year y ON y.id = b.school_year_id AND y.school_id = b.school_id WHERE b.token_hash = ?`, sha(token));
  if (!b) return null;
  const keys = await schoolKeys(db, b.school_id);
  if (!tokenSigned(keys.badgeSecret, token)) return null;
  return { authentique: true, type: 'badge', statut: badgeStatus(b), ecole: b.school, eleve: `${b.first_name} ${b.last_name.slice(0, 1)}.`, annee: b.year, expire_le: b.expires_on };
}

module.exports = { routes, verifyBadgePublic, parseScan, badgeStatus, yearEnd, tokenFor, tokenSigned, checkPhoto, PHOTO_MAX, BADGE_RE };
