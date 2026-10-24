'use strict';
// Lot 2 — Gestion manuelle des élèves par la direction et le secrétariat : création d'un élève (avec sa classe),
// changement de classe motivé, et responsables (tuteurs) de l'élève. Tout passe par l'école de l'utilisateur
// (school_id, RLS en PostgreSQL) et chaque écriture est journalisée avec son motif.
const P = require('./policy');
const { HttpError, forbid, notFound, audit, refuse } = require('./common');
const I = require('./identite');

const RELATIONS = ['mere', 'pere', 'tuteur', 'grand_parent', 'frere_soeur', 'autre'];
const EMAIL = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[a-z]{2,24}$/i;
const clean = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
function text(v, label, min, max) {
  const s = clean(v);
  if (s.length < min || s.length > max) throw new HttpError(400, `${label} : ${min} à ${max} caractères`);
  return s;
}
const opt = (v, label, max) => { const s = clean(v); if (!s) return null; if (s.length > max) throw new HttpError(400, `${label} : ${max} caractères au plus`); return s; };
function birth(v) {
  const s = clean(v); if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + 'T00:00:00Z'))) throw new HttpError(400, 'date de naissance invalide (AAAA-MM-JJ)');
  const y = Number(s.slice(0, 4)); const now = new Date().getUTCFullYear();
  if (y < now - 40 || y > now - 2) throw new HttpError(400, 'date de naissance hors de la plage attendue');
  return s;
}
const reasonOf = (b) => { const r = clean((b || {}).reason); if (r.length < 3 || r.length > 300) throw new HttpError(400, 'motif obligatoire (3 à 300 caractères)'); return r; };
const id = (v) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, 'identifiant invalide'); return x; };

async function classOf(db, u, cid) {
  const c = await db.get('SELECT id, name, archived_at FROM class WHERE id = ? AND school_id = ?', id(cid), u.school_id);
  if (!c) throw new HttpError(400, 'classe inconnue dans cette école');
  if (c.archived_at) throw new HttpError(409, 'classe archivée');
  return c;
}
async function studentOf(db, u, sid) {
  const st = await db.get('SELECT id, code, first_name, last_name, status FROM student WHERE id = ? AND school_id = ?', id(sid), u.school_id);
  if (!st) notFound();
  return st;
}
function phoneOf(v, normalizePhone) {
  const s = clean(v); if (!s) return null;
  const p = normalizePhone ? normalizePhone(s) : s;
  if (!p) throw new HttpError(400, 'téléphone invalide');
  return p;
}
function guardianFields(b, normalizePhone, partial = false) {
  const o = {};
  if (!partial || b.name !== undefined) o.name = text(b.name, 'nom du responsable', 2, 80);
  if (!partial || b.relation !== undefined) { if (!RELATIONS.includes(b.relation)) throw new HttpError(400, 'lien de parenté inconnu'); o.relation = b.relation; }
  if (!partial || b.phone !== undefined) o.phone = phoneOf(b.phone, normalizePhone);
  if (!partial || b.email !== undefined) { const e = clean(b.email).toLowerCase(); if (e && !EMAIL.test(e)) throw new HttpError(400, 'e-mail invalide'); o.email = e || null; }
  if (!partial || b.notes !== undefined) o.notes = opt(b.notes, 'remarques', 300);
  if (!partial || b.can_pickup !== undefined) o.can_pickup = b.can_pickup ? 1 : 0;
  if (!partial || b.is_primary !== undefined) o.is_primary = b.is_primary ? 1 : 0;
  return o;
}
// Lecture des responsables : direction/secrétariat, et l'enseignant pour les élèves de ses classes (contact famille).
async function canReadGuardians(db, u, sid) {
  if (P.can.editStudent(u)) return true;
  if (!P.has(u, 'enseignant')) return false;
  const sc = P.studentScope(u, 'st');
  return !!(await db.get(`SELECT st.id FROM student st WHERE st.id = ? AND ${sc.sql}`, id(sid), ...sc.params));
}
const listGuardians = (db, u, sid) => db.all(`SELECT id, student_id, name, relation, phone, email, is_primary, can_pickup, notes, created_at, updated_at
  FROM student_guardian WHERE school_id = ? AND student_id = ? ORDER BY is_primary DESC, id`, u.school_id, sid);

module.exports = (normalizePhone) => ({ routes: [
  // Création manuelle d'un élève (inscription au guichet) : identité, classe, et responsables facultatifs.
  ['POST', /^\/api\/students$/, async (db, req, u, m, ctx) => {
    if (!P.can.editStudent(u)) await refuse(ctx, u, 'student.create', 'student', null, null);
    const b = req.body || {};
    const v = { first_name: text(b.first_name, 'prénom', 1, 60), last_name: text(b.last_name, 'nom', 1, 60), birth_date: birth(b.birth_date),
      sex: b.sex ? (['F', 'M'].includes(b.sex) ? b.sex : (() => { throw new HttpError(400, 'sexe : F ou M'); })()) : null,
      health_notes: opt(b.health_notes, 'santé', 500), family_notes: opt(b.family_notes, 'famille', 500) };
    const cls = await classOf(db, u, b.class_id);
    const guardians = Array.isArray(b.guardians) ? b.guardians.slice(0, 4).map((g) => guardianFields(g || {}, normalizePhone)) : [];
    if (guardians.filter((g) => g.is_primary).length > 1) throw new HttpError(400, 'un seul responsable principal');
    if (guardians.length && !guardians.some((g) => g.is_primary)) guardians[0].is_primary = 1;
    const reason = clean(b.reason) || 'inscription manuelle';
    if (v.birth_date) {
      const dup = await db.get('SELECT id, code FROM student WHERE school_id = ? AND lower(first_name) = lower(?) AND lower(last_name) = lower(?) AND birth_date = ?',
        u.school_id, v.first_name, v.last_name, v.birth_date);
      if (dup && !b.confirm_duplicate) throw Object.assign(new HttpError(409, `doublon probable : élève ${dup.code} (même nom et date de naissance)`), { body: { duplicate: dup } });
    }
    const school = await db.get('SELECT id, name, initials FROM school WHERE id = ?', u.school_id);
    const sid = await db.tx(async (t) => {
      const code = await I.reserveStudentCode(t, u.school_id, I.baseCode(v.first_name, v.last_name, v.birth_date, I.schoolInitials(school)));
      const sid = await t.insert('INSERT INTO student (school_id, code, first_name, last_name, birth_date, sex, health_notes, family_notes) VALUES (?,?,?,?,?,?,?,?)',
        u.school_id, code, v.first_name, v.last_name, v.birth_date, v.sex, v.health_notes, v.family_notes);
      await t.insert('INSERT INTO enrollment (school_id, student_id, class_id, reason) VALUES (?,?,?,?)', u.school_id, sid, cls.id, reason.slice(0, 300));
      for (const g of guardians) await t.insert(`INSERT INTO student_guardian (school_id, student_id, name, relation, phone, email, is_primary, can_pickup, notes) VALUES (?,?,?,?,?,?,?,?,?)`,
        u.school_id, sid, g.name, g.relation, g.phone, g.email, g.is_primary, g.can_pickup, g.notes);
      await audit(t, u, 'student.create', 'student', sid, `${reason.slice(0, 200)} [classe ${cls.name}${guardians.length ? `, ${guardians.length} responsable(s)` : ''}]`);
      return sid;
    });
    const st = await db.get('SELECT id, code, first_name, last_name, birth_date, sex FROM student WHERE id = ?', sid);
    const email = await require('./emails-eleves').autoCreate(db, ctx, u, sid);
    return { ...st, class_id: cls.id, guardians: await listGuardians(db, u, sid), ...(email ? { email } : {}) };
  }],
  // Changement de classe motivé : l'inscription active est déplacée ; l'ancienne classe est gardée dans le journal.
  ['PUT', /^\/api\/students\/(\d+)\/classe$/, async (db, req, u, [sid], ctx) => {
    if (!P.can.editStudent(u)) await refuse(ctx, u, 'student.class', 'student', sid, null);
    const reason = reasonOf(req.body); const st = await studentOf(db, u, sid);
    if (st.status === 'transfere') throw new HttpError(409, 'dossier archivé (élève transféré) : lecture seule');
    const cls = await classOf(db, u, (req.body || {}).class_id);
    const cur = await db.get("SELECT e.id, e.class_id, c.name FROM enrollment e JOIN class c ON c.id = e.class_id AND c.school_id = e.school_id WHERE e.school_id = ? AND e.student_id = ? AND e.status = 'actif' ORDER BY e.id DESC", u.school_id, st.id);
    if (cur && cur.class_id === cls.id) return { id: st.id, class_id: cls.id, changed: false };
    await db.tx(async (t) => {
      if (cur) await t.run('UPDATE enrollment SET class_id = ?, reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', cls.id, reason, cur.id, u.school_id);
      else await t.insert('INSERT INTO enrollment (school_id, student_id, class_id, reason) VALUES (?,?,?,?)', u.school_id, st.id, cls.id, reason);
      await audit(t, u, 'student.class', 'student', st.id, `${reason} [${cur ? cur.name : 'sans classe'} → ${cls.name}]`);
    });
    return { id: st.id, class_id: cls.id, changed: true };
  }],
  ['GET', /^\/api\/students\/(\d+)\/tuteurs$/, async (db, req, u, [sid]) => {
    if (!(await canReadGuardians(db, u, sid))) forbid();
    const st = await studentOf(db, u, sid);
    return listGuardians(db, u, st.id);
  }],
  ['POST', /^\/api\/students\/(\d+)\/tuteurs$/, async (db, req, u, [sid], ctx) => {
    if (!P.can.editStudent(u)) await refuse(ctx, u, 'guardian.create', 'student', sid, null);
    const st = await studentOf(db, u, sid);
    if (st.status === 'transfere') throw new HttpError(409, 'dossier archivé (élève transféré) : lecture seule');
    const g = guardianFields(req.body || {}, normalizePhone);
    const n = Number((await db.get('SELECT COUNT(*) AS n FROM student_guardian WHERE school_id = ? AND student_id = ?', u.school_id, st.id)).n);
    if (n >= 6) throw new HttpError(409, '6 responsables au plus par élève');
    if (!n) g.is_primary = 1;
    const gid = await db.tx(async (t) => {
      if (g.is_primary) await t.run('UPDATE student_guardian SET is_primary = 0, updated_at = CURRENT_TIMESTAMP WHERE school_id = ? AND student_id = ? AND is_primary = 1', u.school_id, st.id);
      const gid = await t.insert(`INSERT INTO student_guardian (school_id, student_id, name, relation, phone, email, is_primary, can_pickup, notes) VALUES (?,?,?,?,?,?,?,?,?)`,
        u.school_id, st.id, g.name, g.relation, g.phone, g.email, g.is_primary, g.can_pickup, g.notes);
      await audit(t, u, 'guardian.create', 'student', st.id, `responsable ${g.relation} ajouté`);
      return gid;
    });
    return (await listGuardians(db, u, st.id)).find((x) => x.id === gid);
  }],
  ['PATCH', /^\/api\/tuteurs\/(\d+)$/, async (db, req, u, [gid], ctx) => {
    if (!P.can.editStudent(u)) await refuse(ctx, u, 'guardian.update', 'guardian', gid, null);
    const cur = await db.get('SELECT * FROM student_guardian WHERE id = ? AND school_id = ?', id(gid), u.school_id);
    if (!cur) notFound();
    const g = guardianFields(req.body || {}, normalizePhone, true);
    const keys = Object.keys(g); if (!keys.length) throw new HttpError(400, 'aucun champ modifiable');
    await db.tx(async (t) => {
      if (g.is_primary) await t.run('UPDATE student_guardian SET is_primary = 0 WHERE school_id = ? AND student_id = ? AND is_primary = 1 AND id <> ?', u.school_id, cur.student_id, cur.id);
      await t.run(`UPDATE student_guardian SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?`, ...keys.map((k) => g[k]), cur.id, u.school_id);
      await audit(t, u, 'guardian.update', 'student', cur.student_id, `responsable ${cur.id} modifié [${keys.join(',')}]`);
    });
    return (await listGuardians(db, u, cur.student_id)).find((x) => x.id === cur.id);
  }],
  ['DELETE', /^\/api\/tuteurs\/(\d+)$/, async (db, req, u, [gid], ctx) => {
    if (!P.can.editStudent(u)) await refuse(ctx, u, 'guardian.delete', 'guardian', gid, null);
    const cur = await db.get('SELECT * FROM student_guardian WHERE id = ? AND school_id = ?', id(gid), u.school_id);
    if (!cur) notFound();
    const reason = reasonOf(req.body);
    await db.tx(async (t) => {
      await t.run('DELETE FROM student_guardian WHERE id = ? AND school_id = ?', cur.id, u.school_id);
      if (cur.is_primary) await t.run('UPDATE student_guardian SET is_primary = 1 WHERE id = (SELECT MIN(id) FROM student_guardian WHERE school_id = ? AND student_id = ?)', u.school_id, cur.student_id);
      await audit(t, u, 'guardian.delete', 'student', cur.student_id, `${reason} [responsable ${cur.relation} retiré]`);
    });
    return { ok: true };
  }],
], RELATIONS });
