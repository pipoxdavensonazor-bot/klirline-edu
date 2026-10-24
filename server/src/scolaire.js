'use strict';
// Cœur scolaire : évaluations et notes, moyennes, bulletins vérifiables, annonces et calendrier par audience.
// Toutes les routes passent par db.asSchool (RLS en PostgreSQL) et par les périmètres de policy.js.
const crypto = require('node:crypto');
const P = require('./policy');
const { HttpError, forbid, notFound, audit, refuse, isUnique } = require('./common');
const { reportCardPdf } = require('./pdf');
const { schoolProfile } = require('./identite');
const { workingYear } = require('./structure');

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const AUDIENCES = ['ecole', 'classe', 'parents', 'enseignants'];
// Barème de référence des moyennes : school.grade_scale (/100 par défaut, migration 006).
const DEFAULT_SCALE = 100;
// Barème maximal d'une évaluation : 100, 200, 300 proposés, ou toute valeur positive jusqu'à 1000 (2 décimales au plus).
const MAX_SCORE_LIMIT = 1000;
function maxScore(v) {
  const x = Number(v ?? DEFAULT_SCALE);
  if (!Number.isFinite(x) || x <= 0 || x > MAX_SCORE_LIMIT || Math.round(x * 100) !== x * 100) throw new HttpError(400, `barème invalide (nombre positif, ${MAX_SCORE_LIMIT} au plus)`);
  return x;
}
function coefficient(v) {
  const x = Number(v ?? 1);
  if (!Number.isFinite(x) || x <= 0 || x > 20) throw new HttpError(400, 'coefficient invalide (entre 0 et 20)');
  return x;
}
async function schoolScale(db, schoolId) {
  const r = await db.get('SELECT grade_scale FROM school WHERE id = ?', schoolId);
  return r && r.grade_scale > 0 ? Number(r.grade_scale) : DEFAULT_SCALE;
}
const str = (v, max) => { const s = String(v ?? '').trim(); if (!s || s.length > max) throw new HttpError(400, `texte obligatoire (${max} caractères au plus)`); return s; };
const int = (v) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, 'identifiant invalide'); return x; };

async function classInScope(db, u, classId) {
  const sc = P.classScope(u);
  return db.get(`SELECT c.id, c.name FROM class c WHERE c.id = ? AND ${sc.sql}`, classId, ...sc.params);
}
async function studentVisible(db, u, id) {
  const sc = P.studentScope(u);
  return db.get(`SELECT st.id, st.code, st.first_name, st.last_name FROM student st WHERE st.id = ? AND ${sc.sql}`, Number(id), ...sc.params);
}
// Enseignant : la classe ET la matière doivent figurer dans ses affectations.
async function teaches(db, u, classId, subjectId) {
  return db.get('SELECT 1 AS x FROM teacher_assignment WHERE school_id = ? AND teacher_user_id = ? AND class_id = ? AND (subject_id = ? OR subject_id IS NULL)',
    u.school_id, u.id, classId, subjectId);
}
async function loadEvaluation(db, u, id) {
  const ev = await db.get('SELECT * FROM evaluation WHERE id = ? AND school_id = ?', int(id), u.school_id);
  if (!ev || !(await classInScope(db, u, ev.class_id))) notFound();
  return ev;
}
const familyOnly = (u) => P.has(u, 'parent', 'eleve') && !P.has(u, 'direction', 'secretariat', 'enseignant');

/* ---------- moyennes ---------- */
// Notes publiées seulement, ramenées sur le barème de référence de l'école, pondérées par le coefficient de l'évaluation ; moyenne générale
// pondérée par le coefficient de la matière. Une note absente ou dispensée (score NULL) n'est pas comptée.
async function computeAverages(db, schoolId, studentId, termId) {
  const SCALE = await schoolScale(db, schoolId);
  const rows = await db.all(`SELECT s.id AS subject_id, s.name, s.coefficient AS subject_coef, ev.coefficient, ev.max_score, g.score
    FROM evaluation ev JOIN subject s ON s.id = ev.subject_id AND s.school_id = ev.school_id
    JOIN grade g ON g.evaluation_id = ev.id AND g.school_id = ev.school_id
    WHERE ev.school_id = ? AND ev.term_id = ? AND ev.status = 'publiee' AND g.student_id = ?
    ORDER BY s.name`, schoolId, termId, studentId);
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.subject_id)) by.set(r.subject_id, { name: r.name, coefficient: r.subject_coef, sum: 0, w: 0, count: 0 });
    const s = by.get(r.subject_id);
    if (r.score == null) continue;
    s.sum += (r.score / r.max_score) * SCALE * r.coefficient; s.w += r.coefficient; s.count++;
  }
  const subjects = [...by.values()].map((s) => ({ name: s.name, coefficient: s.coefficient, count: s.count, average: s.w ? Math.round((s.sum / s.w) * 100) / 100 : null }));
  const counted = subjects.filter((s) => s.average != null);
  const tw = counted.reduce((a, s) => a + s.coefficient, 0);
  const general = tw ? Math.round((counted.reduce((a, s) => a + s.average * s.coefficient, 0) / tw) * 100) / 100 : null;
  return { scale: SCALE, subjects, general };
}

/* ---------- audiences ---------- */
// Annonces et événements visibles : direction et secrétariat voient tout ; sinon « ecole » + l'audience de son rôle.
function audienceScope(u, a = 'a') {
  if (P.has(u, 'direction', 'secretariat')) return { sql: `${a}.school_id = ?`, params: [u.school_id] };
  const parts = [`${a}.audience = 'ecole'`]; const params = [];
  if (P.has(u, 'enseignant')) {
    parts.push(`${a}.audience = 'enseignants'`);
    parts.push(`(${a}.audience = 'classe' AND ${a}.class_id IN (SELECT class_id FROM teacher_assignment WHERE teacher_user_id = ? AND school_id = ?))`);
    params.push(u.id, u.school_id);
  }
  if (P.has(u, 'parent')) {
    parts.push(`${a}.audience = 'parents'`);
    parts.push(`(${a}.audience = 'classe' AND ${a}.class_id IN (SELECT e.class_id FROM enrollment e JOIN parent_link pl ON pl.student_id = e.student_id AND pl.school_id = e.school_id
      WHERE pl.parent_user_id = ? AND e.status = 'actif' AND e.school_id = ?))`);
    params.push(u.id, u.school_id);
  }
  if (P.has(u, 'eleve')) {
    parts.push(`(${a}.audience = 'classe' AND ${a}.class_id IN (SELECT e.class_id FROM enrollment e JOIN student st ON st.id = e.student_id AND st.school_id = e.school_id
      WHERE st.user_id = ? AND e.status = 'actif' AND e.school_id = ?))`);
    params.push(u.id, u.school_id);
  }
  return { sql: `${a}.school_id = ? AND (${parts.join(' OR ')})`, params: [u.school_id, ...params] };
}
// Qui publie : direction et secrétariat pour toutes les audiences ; enseignant pour ses classes seulement.
async function checkAudience(db, u, ctx, body, action) {
  const audience = String(body.audience || '');
  if (!AUDIENCES.includes(audience)) throw new HttpError(400, 'audience inconnue');
  const classId = audience === 'classe' ? int(body.class_id) : null;
  if (P.has(u, 'direction', 'secretariat')) {
    if (classId && !(await classInScope(db, u, classId))) notFound();
  } else if (P.has(u, 'enseignant')) {
    if (audience !== 'classe' || !(await db.get('SELECT 1 AS x FROM teacher_assignment WHERE school_id = ? AND teacher_user_id = ? AND class_id = ?', u.school_id, u.id, classId)))
      await refuse(ctx, u, action, 'audience', classId, audience);
  } else await refuse(ctx, u, action, 'audience', classId, audience);
  return { audience, classId };
}

/* ---------- notes : envoi groupé idempotent (même file hors ligne que les présences) ---------- */
async function applyGradeOp(t, u, op, opId) {
  const seen = await t.get('SELECT user_id, result FROM sync_op WHERE school_id = ? AND op_id = ?', u.school_id, opId);
  if (seen) { if (seen.user_id !== u.id) throw new HttpError(403, 'op_id déjà utilisé'); return { ...JSON.parse(seen.result), deja: true }; }
  const ev = await t.get('SELECT * FROM evaluation WHERE id = ? AND school_id = ?', Number(op.evaluation_id), u.school_id);
  if (!ev || !(await classInScope(t, u, ev.class_id))) throw new HttpError(404, 'évaluation hors périmètre');
  const studentId = Number(op.student_id);
  if (!(await t.get("SELECT 1 AS x FROM enrollment WHERE school_id = ? AND class_id = ? AND student_id = ? AND status = 'actif'", u.school_id, ev.class_id, studentId)))
    throw new HttpError(404, 'élève absent de cette classe');
  const mention = op.mention == null ? null : String(op.mention);
  if (mention && !['absent', 'dispense'].includes(mention)) throw new HttpError(400, 'mention inconnue');
  const score = mention ? null : Number(op.score);
  // Saisie hors ligne : le client envoie le barème vu à la saisie ; s'il a changé depuis, la note est refusée (à ressaisir).
  if (op.max_score != null && Number(op.max_score) !== Number(ev.max_score)) throw new HttpError(409, `barème modifié depuis la saisie (/${op.max_score} → /${ev.max_score}) : ressaisir la note`);
  if (!mention && (!Number.isFinite(score) || score < 0 || score > ev.max_score)) throw new HttpError(400, `note entre 0 et ${ev.max_score}`);
  const base = Number.isInteger(op.base_version) && op.base_version >= 0 ? op.base_version : null;
  if (base == null) throw new HttpError(400, 'opération invalide');
  const reason = op.reason ? String(op.reason).slice(0, 300) : null;
  const source = op.offline ? 'hors_ligne' : 'en_ligne';
  // Enseignant : ses classes et matières, évaluation encore en brouillon. Direction : toujours, motif si publiée.
  if (P.has(u, 'direction')) {
    if (ev.status === 'publiee' && !reason) throw new HttpError(400, 'motif obligatoire pour modifier une note publiée');
  } else if (P.has(u, 'enseignant')) {
    if (!(await teaches(t, u, ev.class_id, ev.subject_id))) throw new HttpError(403, 'matière non attribuée');
    if (ev.status !== 'brouillon') throw new HttpError(409, 'évaluation déjà soumise : demander la réouverture à la direction');
  } else throw new HttpError(403, 'accès refusé');
  const recordedAt = typeof op.recorded_at === 'string' && op.recorded_at.length <= 40 ? op.recorded_at : new Date().toISOString();
  const cur = await t.get('SELECT * FROM grade WHERE school_id = ? AND evaluation_id = ? AND student_id = ?', u.school_id, ev.id, studentId);
  let res;
  if (!cur) {
    const id = await t.insert('INSERT INTO grade (school_id, evaluation_id, student_id, score, mention, updated_by, recorded_at) VALUES (?,?,?,?,?,?,?)',
      u.school_id, ev.id, studentId, score, mention, u.id, recordedAt);
    await t.run('INSERT INTO grade_history (school_id, grade_id, old_score, new_score, old_mention, new_mention, version, reason, changed_by, source, op_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      u.school_id, id, null, score, null, mention, 1, reason, u.id, source, opId);
    res = { op_id: opId, result: 'applique', score, mention, version: 1 };
  } else if (cur.score === score && cur.mention === mention) {
    res = { op_id: opId, result: 'identique', score, mention, version: cur.version };
  } else if (cur.version !== base) {
    await t.run('INSERT INTO grade_conflict (school_id, op_id, grade_id, user_id, client_score, server_score, base_version, server_version, resolution) VALUES (?,?,?,?,?,?,?,?,?)',
      u.school_id, opId, cur.id, u.id, score, cur.score, base, cur.version, 'valeur du serveur conservée');
    await audit(t, u, 'grade.conflict', 'grade', cur.id, `appareil: ${score ?? mention} (v${base}) / serveur: ${cur.score ?? cur.mention} (v${cur.version})`, 'conflit');
    res = { op_id: opId, result: 'conflit', score: cur.score, mention: cur.mention, version: cur.version, client_score: score };
  } else {
    await t.run('UPDATE grade SET score = ?, mention = ?, version = version + 1, updated_by = ?, recorded_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ? AND version = ?',
      score, mention, u.id, recordedAt, cur.id, u.school_id, cur.version);
    await t.run('INSERT INTO grade_history (school_id, grade_id, old_score, new_score, old_mention, new_mention, version, reason, changed_by, source, op_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      u.school_id, cur.id, cur.score, score, cur.mention, mention, cur.version + 1, reason, u.id, source, opId);
    if (ev.status === 'publiee') await audit(t, u, 'grade.correct', 'grade', cur.id, reason);
    res = { op_id: opId, result: 'applique', score, mention, version: cur.version + 1 };
  }
  await t.run('INSERT INTO sync_op (school_id, op_id, user_id, result) VALUES (?,?,?,?)', u.school_id, opId, u.id, JSON.stringify(res));
  return res;
}
async function syncGrade(db, u, op) {
  const opId = String((op && op.op_id) || '');
  if (!/^[\w-]{8,64}$/.test(opId)) return { op_id: opId, result: 'refuse', error: 'op_id invalide' };
  for (let attempt = 0; ; attempt++) {
    try { return await db.tx((t) => applyGradeOp(t, u, op, opId)); }
    catch (e) {
      if (e instanceof HttpError) return { op_id: opId, result: 'refuse', error: e.message };
      if (attempt === 0 && isUnique(e)) continue;
      throw e;
    }
  }
}

/* ---------- bulletins ---------- */
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O ni 1/I
function verifyCode() { const b = crypto.randomBytes(12); let s = ''; for (const x of b) s += ALPHA[x % 32]; return s; } // 60 bits
const fmtCode = (c) => c.replace(/(.{4})(?=.)/g, '$1-');
function publicUrl(req, ctx) {
  if (ctx.publicUrl) return ctx.publicUrl.replace(/\/$/, '');
  if (ctx.demo && /^[\w.:-]+$/.test(req.headers.host || '')) return `http://${req.headers.host}`;
  throw new HttpError(500, 'NORIA_PUBLIC_URL manquant : adresse publique nécessaire au QR de vérification');
}

const routes = [
  // Périodes de l'année de travail (courante, sinon la plus récente non archivée) : structure.js.
  ['GET', /^\/api\/terms$/, async (db, req, u) => {
    const y = await workingYear(db, u.school_id); if (!y) return [];
    return db.all(`SELECT t.id, t.name, t.position, t.starts_on, t.ends_on, y.label AS year FROM term t
      JOIN school_year y ON y.id = t.school_year_id AND y.school_id = t.school_id WHERE t.school_id = ? AND t.school_year_id = ? ORDER BY t.position`, u.school_id, y.id);
  }],
  ['GET', /^\/api\/subjects$/, async (db, req, u) => {
    // Matières actives de l'année de travail ; level_id : matière propre à un niveau (NULL = toutes les classes).
    const y = await workingYear(db, u.school_id); if (!y) return [];
    if (P.has(u, 'direction', 'secretariat')) return db.all('SELECT id, name, coefficient, level_id FROM subject WHERE school_id = ? AND school_year_id = ? AND archived_at IS NULL ORDER BY name', u.school_id, y.id);
    if (P.has(u, 'enseignant')) return db.all(`SELECT DISTINCT s.id, s.name, s.coefficient, s.level_id, ta.class_id FROM subject s
      JOIN teacher_assignment ta ON ta.subject_id = s.id AND ta.school_id = s.school_id WHERE s.school_id = ? AND s.school_year_id = ? AND s.archived_at IS NULL AND ta.teacher_user_id = ? ORDER BY s.name`, u.school_id, y.id, u.id);
    forbid();
  }],

  // Évaluations
  ['GET', /^\/api\/evaluations$/, async (db, req, u) => {
    if (!P.can.recordAttendance(u)) forbid();
    const classId = int(req.query.get('class_id'));
    if (!(await classInScope(db, u, classId))) notFound();
    const term = req.query.get('term_id');
    return db.all(`SELECT ev.id, ev.class_id, ev.subject_id, s.name AS subject, ev.term_id, ev.title, ev.day, ev.max_score, ev.coefficient, ev.status,
      ev.created_by, ev.submitted_at, ev.published_at, (SELECT COUNT(*) FROM grade g WHERE g.evaluation_id = ev.id AND g.school_id = ev.school_id) AS grades
      FROM evaluation ev JOIN subject s ON s.id = ev.subject_id AND s.school_id = ev.school_id
      WHERE ev.school_id = ? AND ev.class_id = ?${term ? ' AND ev.term_id = ?' : ''} ORDER BY ev.day DESC, ev.id DESC`, u.school_id, classId, ...(term ? [int(term)] : []));
  }],
  ['POST', /^\/api\/evaluations$/, async (db, req, u, _m, ctx) => {
    const b = req.body || {};
    const classId = int(b.class_id), subjectId = int(b.subject_id), termId = int(b.term_id);
    if (P.has(u, 'direction')) { if (!(await classInScope(db, u, classId))) notFound(); }
    else if (!P.has(u, 'enseignant') || !(await teaches(db, u, classId, subjectId))) await refuse(ctx, u, 'evaluation.create', 'class', classId, null);
    const term = await db.get('SELECT id, starts_on, ends_on FROM term WHERE id = ? AND school_id = ?', termId, u.school_id);
    if (!term || !(await db.get('SELECT 1 AS x FROM subject WHERE id = ? AND school_id = ?', subjectId, u.school_id))) notFound();
    const day = String(b.day || '');
    if (!DAY.test(day) || day < term.starts_on || day > term.ends_on) throw new HttpError(400, `date hors de la période (${term.starts_on} → ${term.ends_on})`);
    const max = maxScore(b.max_score), coef = coefficient(b.coefficient);
    const id = await db.insert(`INSERT INTO evaluation (school_id, class_id, subject_id, term_id, title, day, max_score, coefficient, created_by)
      VALUES (?,?,?,?,?,?,?,?,?)`, u.school_id, classId, subjectId, termId, str(b.title, 120), day, max, coef, u.id);
    await audit(db, u, 'evaluation.create', 'evaluation', id, null);
    return { id, status: 'brouillon', max_score: max };
  }],
  // Modifier une évaluation (barème, intitulé, coefficient) : seulement en brouillon. Le nouveau barème ne peut pas
  // être inférieur à une note déjà saisie (sinon 409 : corriger ces notes d'abord).
  ['PATCH', /^\/api\/evaluations\/(\d+)$/, async (db, req, u, [id], ctx) => {
    if (!P.can.recordAttendance(u)) forbid();
    const ev = await loadEvaluation(db, u, id);
    if (!P.has(u, 'direction') && !(P.has(u, 'enseignant') && (await teaches(db, u, ev.class_id, ev.subject_id)))) await refuse(ctx, u, 'evaluation.update', 'evaluation', ev.id, null);
    if (ev.status !== 'brouillon') throw new HttpError(409, 'évaluation soumise ou publiée : barème verrouillé');
    const b = req.body || {};
    const max = b.max_score === undefined ? ev.max_score : maxScore(b.max_score);
    const coef = b.coefficient === undefined ? ev.coefficient : coefficient(b.coefficient);
    const title = b.title === undefined ? ev.title : str(b.title, 120);
    const top = await db.get('SELECT MAX(score) AS m FROM grade WHERE school_id = ? AND evaluation_id = ?', u.school_id, ev.id);
    if (top && top.m != null && top.m > max) throw new HttpError(409, `une note saisie (${top.m}) dépasse le nouveau barème /${max}`);
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const r = await db.run("UPDATE evaluation SET max_score = ?, coefficient = ?, title = ?, updated_at = ? WHERE id = ? AND school_id = ? AND status = 'brouillon'",
      max, coef, title, now, ev.id, u.school_id);
    if (!r.changes) throw new HttpError(409, 'évaluation modifiée entre-temps');
    await audit(db, u, 'evaluation.update', 'evaluation', ev.id, ev.max_score !== max ? `barème /${ev.max_score} → /${max}` : null);
    return { id: ev.id, status: 'brouillon', max_score: max, coefficient: coef, title };
  }],
  ['GET', /^\/api\/evaluations\/(\d+)$/, async (db, req, u, [id]) => {
    if (!P.can.recordAttendance(u)) forbid();
    const ev = await loadEvaluation(db, u, id);
    const grades = await db.all('SELECT student_id, score, mention, version FROM grade WHERE school_id = ? AND evaluation_id = ? ORDER BY student_id', u.school_id, ev.id);
    const students = await db.all(`SELECT st.id, st.code, st.first_name, st.last_name FROM student st JOIN enrollment e ON e.student_id = st.id AND e.school_id = st.school_id
      WHERE e.class_id = ? AND e.status = 'actif' AND st.school_id = ? ORDER BY st.last_name, st.first_name`, ev.class_id, u.school_id);
    return { ...ev, grades, students };
  }],
  ['POST', /^\/api\/evaluations\/(\d+)\/(soumettre|publier|rouvrir)$/, async (db, req, u, [id, action], ctx) => {
    if (!P.can.recordAttendance(u)) forbid();
    const ev = await loadEvaluation(db, u, id);
    const reason = req.body && req.body.reason ? String(req.body.reason).slice(0, 300) : null;
    let to;
    if (action === 'soumettre') {
      // L'enseignant de la matière (ou la direction) soumet son brouillon.
      if (!P.has(u, 'direction') && !(P.has(u, 'enseignant') && (await teaches(db, u, ev.class_id, ev.subject_id)))) await refuse(ctx, u, 'evaluation.submit', 'evaluation', ev.id, null);
      if (ev.status !== 'brouillon') throw new HttpError(409, 'déjà soumise');
      to = 'soumise';
    } else if (action === 'publier') {
      if (!P.has(u, 'direction')) await refuse(ctx, u, 'evaluation.publish', 'evaluation', ev.id, null);
      if (ev.status !== 'soumise') throw new HttpError(409, 'seule une évaluation soumise peut être publiée');
      to = 'publiee';
    } else {
      if (!P.has(u, 'direction')) await refuse(ctx, u, 'evaluation.reopen', 'evaluation', ev.id, null);
      if (ev.status === 'brouillon') throw new HttpError(409, 'déjà en brouillon');
      if (!reason) throw new HttpError(400, 'motif obligatoire');
      to = 'brouillon';
    }
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const sub = to === 'soumise' ? now : ev.submitted_at;
    const pubAt = to === 'publiee' ? now : (to === 'brouillon' ? null : ev.published_at);
    const pubBy = to === 'publiee' ? u.id : (to === 'brouillon' ? null : ev.published_by);
    const r = await db.run('UPDATE evaluation SET status = ?, updated_at = ?, submitted_at = ?, published_at = ?, published_by = ? WHERE id = ? AND school_id = ? AND status = ?',
      to, now, sub, pubAt, pubBy, ev.id, u.school_id, ev.status);
    if (!r.changes) throw new HttpError(409, 'évaluation modifiée entre-temps');
    await audit(db, u, `evaluation.${action}`, 'evaluation', ev.id, reason);
    return { id: ev.id, status: to };
  }],
  ['POST', /^\/api\/grades\/sync$/, async (db, req, u) => {
    if (!P.has(u, 'direction', 'enseignant')) forbid();
    const ops = Array.isArray(req.body && req.body.ops) ? req.body.ops : null;
    if (!ops || ops.length > 500) throw new HttpError(400, 'liste d’opérations invalide (500 au plus)');
    const results = [];
    for (const op of ops) results.push(await syncGrade(db, u, op));
    return { results, serverTime: new Date().toISOString() };
  }],
  ['GET', /^\/api\/grades\/conflicts$/, async (db, req, u) => {
    if (!P.has(u, 'direction', 'enseignant')) forbid();
    const mine = P.has(u, 'direction') ? '' : ' AND user_id = ?';
    return db.all(`SELECT op_id, grade_id, client_score, server_score, base_version, server_version, resolution, created_at FROM grade_conflict
      WHERE school_id = ?${mine} ORDER BY id DESC LIMIT 200`, u.school_id, ...(mine ? [u.id] : []));
  }],
  // Notes d'un élève : familles = évaluations publiées seulement ; personnel = toutes, avec leur statut.
  ['GET', /^\/api\/students\/(\d+)\/grades$/, async (db, req, u, [id]) => {
    if (!P.can.readStudents(u)) forbid();
    const st = await studentVisible(db, u, id); if (!st) notFound();
    const term = req.query.get('term_id');
    const pub = familyOnly(u) ? " AND ev.status = 'publiee'" : '';
    return db.all(`SELECT ev.id AS evaluation_id, ev.title, ev.day, ev.max_score, ev.coefficient, ev.status, ev.term_id, s.name AS subject, g.score, g.mention
      FROM evaluation ev JOIN subject s ON s.id = ev.subject_id AND s.school_id = ev.school_id
      JOIN grade g ON g.evaluation_id = ev.id AND g.school_id = ev.school_id AND g.student_id = ?
      WHERE ev.school_id = ?${pub}${term ? ' AND ev.term_id = ?' : ''} ORDER BY ev.day DESC`, st.id, u.school_id, ...(term ? [int(term)] : []));
  }],
  ['GET', /^\/api\/students\/(\d+)\/averages$/, async (db, req, u, [id]) => {
    if (!P.can.readStudents(u)) forbid();
    const st = await studentVisible(db, u, id); if (!st) notFound();
    return computeAverages(db, u.school_id, st.id, int(req.query.get('term_id')));
  }],

  // Bulletins
  ['POST', /^\/api\/report-cards$/, async (db, req, u, _m, ctx) => {
    if (!P.has(u, 'direction', 'secretariat')) await refuse(ctx, u, 'report_card.issue', 'student', req.body && req.body.student_id, null);
    const st = await studentVisible(db, u, int(req.body.student_id)); if (!st) notFound();
    const term = await db.get(`SELECT t.id, t.name, y.label AS year FROM term t JOIN school_year y ON y.id = t.school_year_id AND y.school_id = t.school_id
      WHERE t.id = ? AND t.school_id = ?`, int(req.body.term_id), u.school_id);
    if (!term) notFound();
    const avg = await computeAverages(db, u.school_id, st.id, term.id);
    if (!avg.subjects.length) throw new HttpError(409, 'aucune note publiée pour cette période');
    const school = await db.get('SELECT name FROM school WHERE id = ?', u.school_id);
    const cls = await db.get(`SELECT c.id, c.name FROM class c JOIN enrollment e ON e.class_id = c.id AND e.school_id = c.school_id
      WHERE e.student_id = ? AND e.school_id = ? AND e.status = 'actif'`, st.id, u.school_id);
    const code = verifyCode();
    const snap = { school: school.name, term: term.name, year: term.year, student: `${st.first_name} ${st.last_name}`, studentCode: st.code,
      className: cls ? cls.name : null, ...avg, code: fmtCode(code), issuedAt: new Date().toISOString(), issuer: u.display_name };
    // Format haïtien (bulletins.js) : rang dans la classe, mention et moyenne sur l'échelle de l'école, figés dans le bulletin.
    if (cls) {
      const cb = await require('./bulletins').classBulletin(db, u.school_id, cls.id, term.id);
      const me = cb.mode === 'notes' && cb.students.find((x) => x.id === st.id);
      if (me) snap.menfp = { echelle: cb.rules.echelle, average: me.average, rank: me.rank ?? null, exAequo: !!me.ex_aequo, classes: cb.stats.classes, mention: me.mention };
    }
    const id = await db.tx(async (t) => {
      // Un nouveau bulletin remplace le précédent pour la même période : l'ancien code est annulé.
      await t.run(`UPDATE report_card SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = 'remplacé par un bulletin plus récent'
        WHERE school_id = ? AND student_id = ? AND term_id = ? AND revoked_at IS NULL`, u.school_id, st.id, term.id);
      const rid = await t.insert('INSERT INTO report_card (school_id, student_id, term_id, code, average, scale, snapshot, issued_by) VALUES (?,?,?,?,?,?,?,?)',
        u.school_id, st.id, term.id, code, avg.general, avg.scale, JSON.stringify(snap), u.id);
      await audit(t, u, 'report_card.issue', 'report_card', rid, `${term.name} ${term.year}`);
      return rid;
    });
    return { id, code: fmtCode(code), verifyUrl: `${publicUrl(req, ctx)}/#verifier=${code}`, average: avg.general, scale: avg.scale };
  }],
  ['GET', /^\/api\/report-cards$/, async (db, req, u) => {
    if (!P.can.readStudents(u)) forbid();
    const st = await studentVisible(db, u, int(req.query.get('student_id'))); if (!st) notFound();
    return db.all(`SELECT r.id, r.term_id, t.name AS term, r.average, r.scale, r.issued_at, r.revoked_at FROM report_card r JOIN term t ON t.id = r.term_id AND t.school_id = r.school_id
      WHERE r.school_id = ? AND r.student_id = ? ORDER BY r.id DESC`, u.school_id, st.id);
  }],
  ['GET', /^\/api\/report-cards\/(\d+)\/pdf$/, async (db, req, u, [id], ctx) => {
    if (!P.can.readStudents(u)) forbid();
    const r = await db.get('SELECT * FROM report_card WHERE id = ? AND school_id = ?', int(id), u.school_id);
    if (!r || !(await studentVisible(db, u, r.student_id))) notFound();
    if (r.revoked_at) throw new HttpError(410, 'bulletin annulé ou remplacé');
    const snap = JSON.parse(r.snapshot);
    await audit(db, u, 'report_card.download', 'report_card', r.id, null);
    return { __pdf: reportCardPdf(snap, `${publicUrl(req, ctx)}/#verifier=${r.code}`, await schoolProfile(db, u.school_id)), filename: `bulletin-${snap.studentCode}-${r.term_id}.pdf` };
  }],
  ['POST', /^\/api\/report-cards\/(\d+)\/annuler$/, async (db, req, u, [id], ctx) => {
    if (!P.has(u, 'direction')) await refuse(ctx, u, 'report_card.revoke', 'report_card', id, null);
    const reason = str(req.body && req.body.reason, 300);
    const r = await db.run('UPDATE report_card SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = ? WHERE id = ? AND school_id = ? AND revoked_at IS NULL', reason, int(id), u.school_id);
    if (!r.changes) notFound();
    await audit(db, u, 'report_card.revoke', 'report_card', id, reason);
    return { ok: true };
  }],

  // Annonces et calendrier
  ['GET', /^\/api\/announcements$/, async (db, req, u) => {
    const sc = audienceScope(u);
    return db.all(`SELECT a.id, a.title, a.body, a.audience, a.class_id, c.name AS class_name, a.created_at, us.display_name AS author
      FROM announcement a LEFT JOIN class c ON c.id = a.class_id AND c.school_id = a.school_id
      JOIN app_user us ON us.id = a.created_by AND us.school_id = a.school_id
      WHERE ${sc.sql} ORDER BY a.id DESC LIMIT 100`, ...sc.params);
  }],
  ['POST', /^\/api\/announcements$/, async (db, req, u, _m, ctx) => {
    const b = req.body || {};
    const { audience, classId } = await checkAudience(db, u, ctx, b, 'announcement.create');
    const id = await db.insert('INSERT INTO announcement (school_id, title, body, audience, class_id, created_by) VALUES (?,?,?,?,?,?)',
      u.school_id, str(b.title, 140), str(b.body, 4000), audience, classId, u.id);
    await audit(db, u, 'announcement.create', 'announcement', id, audience + (classId ? `:${classId}` : ''));
    return { id };
  }],
  ['GET', /^\/api\/events$/, async (db, req, u) => {
    const sc = audienceScope(u, 'ev');
    return db.all(`SELECT ev.id, ev.title, ev.starts_on, ev.ends_on, ev.audience, ev.class_id, c.name AS class_name FROM school_event ev
      LEFT JOIN class c ON c.id = ev.class_id AND c.school_id = ev.school_id WHERE ${sc.sql} ORDER BY ev.starts_on, ev.id LIMIT 200`, ...sc.params);
  }],
  ['POST', /^\/api\/events$/, async (db, req, u, _m, ctx) => {
    const b = req.body || {};
    const { audience, classId } = await checkAudience(db, u, ctx, b, 'event.create');
    const s = String(b.starts_on || ''), e = String(b.ends_on || b.starts_on || '');
    if (!DAY.test(s) || !DAY.test(e) || e < s) throw new HttpError(400, 'dates invalides');
    const id = await db.insert('INSERT INTO school_event (school_id, title, starts_on, ends_on, audience, class_id, created_by) VALUES (?,?,?,?,?,?,?)',
      u.school_id, str(b.title, 140), s, e, audience, classId, u.id);
    await audit(db, u, 'event.create', 'event', id, audience);
    return { id };
  }],
];

// Vérification publique d'un bulletin : école, élève (prénom + initiale), période, date et état. Rien d'autre.
const publicRoutes = [
  ['GET', /^\/api\/verifier\/([A-Za-z0-9-]{1,40})$/, async (db, req, _u, [raw], ctx) => {
    const keys = [`verif:${req.ip}`];
    if (await ctx.limiter.blocked(keys)) throw new HttpError(429, 'trop de vérifications, réessayez plus tard');
    const v = await verifyDocument(db, raw);
    if (v) return v;
    await ctx.limiter.fail(keys); throw new HttpError(404, 'aucun document ne correspond à ce code');
  }, { public: true }],
];

// Vérification d'un document par son code (page publique, et portail du ministère au bloc 6) : badge (« B… »),
// relevé officiel (« R… »), certificat de transfert (« T… »), bulletin ou reçu (12 caractères). null : aucun document.
async function verifyDocument(db, raw) {
  const code = String(raw || '').toUpperCase().replace(/-/g, '');
  if (/^[BRT][A-Z2-9]{12,26}$/.test(code)) {
    return code[0] === 'B' ? require('./badges').verifyBadgePublic(db, code)
      : code[0] === 'T' ? require('./transferts').verifyTransferPublic(db, code) : require('./releves').verifyTranscriptPublic(db, code);
  }
  if (!/^[A-Z2-9]{12}$/.test(code)) return null;
  const r = await db.get(`SELECT r.issued_at, r.revoked_at, r.revoked_reason, s.name AS school, st.first_name, st.last_name, t.name AS term, y.label AS year
    FROM report_card r JOIN school s ON s.id = r.school_id
    JOIN student st ON st.id = r.student_id AND st.school_id = r.school_id
    JOIN term t ON t.id = r.term_id AND t.school_id = r.school_id
    JOIN school_year y ON y.id = t.school_year_id AND y.school_id = t.school_id WHERE r.code = ?`, code);
  // Même code, même page : un reçu de paiement se vérifie comme un bulletin.
  if (!r) return (await require('./gestion').verifyReceipt(db, code)) || null;
  return {
    authentique: true, type: 'bulletin', statut: r.revoked_at ? 'annule' : 'valide', motif: r.revoked_at ? r.revoked_reason : undefined,
    ecole: r.school, eleve: `${r.first_name} ${r.last_name.slice(0, 1)}.`, periode: `${r.term} ${r.year}`, emis_le: String(r.issued_at).slice(0, 10),
  };
}

module.exports = { verifyDocument, routes, publicRoutes, computeAverages, maxScore, DEFAULT_SCALE, audienceScope, verifyCode, fmtCode, publicUrl };
