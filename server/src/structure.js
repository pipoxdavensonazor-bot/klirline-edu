'use strict';
// Structure de l'école (lot 0) : années scolaires (une courante), niveaux par cycle, classes (salle), périodes,
// matières par niveau (coefficient) et affectations des enseignants ; assistant de démarrage idempotent avec un modèle
// haïtien modifiable. Écriture : direction seulement ; lecture complète : direction et secrétariat.
// Toutes les routes passent par db.asSchool (RLS en PostgreSQL) ; chaque écriture est journalisée (audit_log).
const P = require('./policy');
const { HttpError, forbid, notFound, audit, refuse } = require('./common');

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const YEAR = /^(\d{4})-(\d{4})$/;
const LIMITS = { levels: 40, classes: 300, subjects: 800, terms: 6 };

const str = (v, max, what) => {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (!s) throw new HttpError(400, `${what || 'texte'} obligatoire`);
  if (s.length > max) throw new HttpError(400, `${what || 'texte'} : ${max} caractères au plus`);
  if (/[\u0000-\u001f<>]/.test(s)) throw new HttpError(400, `${what || 'texte'} : caractères interdits`);
  return s;
};
const opt = (v, max, what) => (v == null || String(v).trim() === '' ? null : str(v, max, what));
const int = (v, what) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, `${what || 'identifiant'} invalide`); return x; };
const day = (v, what) => { const s = String(v ?? ''); if (!DAY.test(s) || Number.isNaN(Date.parse(s))) throw new HttpError(400, `${what || 'date'} invalide (AAAA-MM-JJ)`); return s; };
const coef = (v) => { const x = Number(String(v ?? 1).replace(',', '.')); if (!Number.isFinite(x) || x <= 0 || x > 20) throw new HttpError(400, 'coefficient entre 0,1 et 20'); return Math.round(x * 100) / 100; };
const yearLabel = (v) => {
  const s = String(v ?? '').trim(); const m = s.match(YEAR);
  if (!m || Number(m[2]) !== Number(m[1]) + 1 || Number(m[1]) < 2000 || Number(m[1]) > 2100) throw new HttpError(400, 'année scolaire : format AAAA-AAAA (ex. 2026-2027)');
  return s;
};
const key = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const now = () => new Date().toISOString();

const canManage = (u) => P.has(u, 'direction');
const canRead = (u) => P.has(u, 'direction', 'secretariat');

// Classes « actives » : non archivées, d'une année non archivée ; s'il existe une année courante, seulement la sienne.
const activeClass = (a = 'c') => `${a}.archived_at IS NULL AND ${a}.school_year_id IN (SELECT y.id FROM school_year y WHERE y.school_id = ${a}.school_id
  AND y.archived_at IS NULL AND (y.is_current = 1 OR NOT EXISTS (SELECT 1 FROM school_year y2 WHERE y2.school_id = ${a}.school_id AND y2.is_current = 1)))`;
// Année de travail : la courante, sinon la plus récente non archivée.
async function workingYear(db, schoolId) {
  return db.get(`SELECT id, label, is_current FROM school_year WHERE school_id = ? AND archived_at IS NULL
    ORDER BY is_current DESC, label DESC LIMIT 1`, schoolId);
}
async function yearOf(db, u, id) {
  if (id == null || id === '') { const y = await workingYear(db, u.school_id); if (!y) throw new HttpError(409, 'créez d’abord une année scolaire'); return y; }
  const y = await db.get('SELECT id, label, is_current, archived_at FROM school_year WHERE id = ? AND school_id = ?', int(id, 'année'), u.school_id);
  if (!y) notFound();
  if (y.archived_at) throw new HttpError(409, 'année archivée : lecture seule');
  return y;
}
async function levelOf(db, u, id) {
  const l = await db.get('SELECT id, name, archived_at FROM level WHERE id = ? AND school_id = ?', int(id, 'niveau'), u.school_id);
  if (!l) notFound();
  if (l.archived_at) throw new HttpError(409, 'niveau archivé');
  return l;
}
async function defaultCampus(db, schoolId) {
  const c = await db.get('SELECT id FROM campus WHERE school_id = ? ORDER BY id LIMIT 1', schoolId);
  if (c) return c.id;
  return db.insert('INSERT INTO campus (school_id, name) VALUES (?,?)', schoolId, 'Campus principal');
}

/* ---------- modèle haïtien (modifiable dans l'assistant et après) ----------
   Fondamental 9 ans : 1er cycle (1re–4e AF), 2e cycle (5e–6e AF), 3e cycle (7e–9e AF) ; Nouveau secondaire NS1–NS4
   (tronc commun NS1–NS2, séries en NS3–NS4). Préscolaire facultatif. Disciplines : Cadre d'orientation curriculaire et
   programmes du 3e cycle (MENFP, 2022). Coefficients : MENFP au 3e cycle, 1 ailleurs ; chaque école les ajuste. Préscolaire : appréciations, pas de notes. */
const CYCLES = [
  { id: 'prescolaire', fr: 'Préscolaire', ht: 'Prekolè', on: false, levels: ['Préscolaire 1', 'Préscolaire 2', 'Préscolaire 3'] },
  { id: 'fondamental-1', fr: 'Fondamental — 1er cycle', ht: 'Fondamantal — 1ye sik', on: true, levels: ['1re AF', '2e AF', '3e AF', '4e AF'] },
  { id: 'fondamental-2', fr: 'Fondamental — 2e cycle', ht: 'Fondamantal — 2yèm sik', on: true, levels: ['5e AF', '6e AF'] },
  { id: 'fondamental-3', fr: 'Fondamental — 3e cycle', ht: 'Fondamantal — 3yèm sik', on: true, levels: ['7e AF', '8e AF', '9e AF'] },
  { id: 'secondaire', fr: 'Nouveau secondaire', ht: 'Nouvo segondè', on: true, levels: ['NS1', 'NS2', 'NS3', 'NS4'] },
];
const FOND = ['Français', 'Créole', 'Mathématiques', 'Sciences sociales', 'Sciences expérimentales', 'Éducation esthétique et artistique',
  'Initiation à la technologie et aux activités productives', 'Éducation physique et sportive'];
const SUBJECTS = {
  prescolaire: [],
  'fondamental-1': FOND,
  'fondamental-2': FOND,
  'fondamental-3': [...FOND, 'Anglais', 'Espagnol'],
  secondaire: ['Français', 'Créole', 'Mathématiques', 'Physique', 'Chimie', 'Sciences de la vie et de la Terre', 'Histoire et géographie',
    'Sciences économiques et sociales', 'Anglais', 'Espagnol', 'Éducation esthétique et artistique', 'Éducation physique et sportive'],
};
const SUBJECTS_EXTRA = { NS3: ['Philosophie'], NS4: ['Philosophie'] };
// Coefficients indicatifs du 3e cycle : décision du MENFP du 14 juin 2023 (examens de 9e AF, en points : 300 → 3, 200 → 2),
// appliquée par défaut de la 7e à la 9e AF. Ailleurs, aucun barème officiel unique trouvé : coefficient 1 (docs/bulletins-menfp.md).
const COEF_3E_CYCLE = { 'Mathématiques': 3, 'Créole': 3, 'Français': 3, 'Sciences sociales': 3, 'Sciences expérimentales': 3,
  'Anglais': 2, 'Espagnol': 2, 'Éducation esthétique et artistique': 2, 'Éducation physique et sportive': 2,
  'Initiation à la technologie et aux activités productives': 2 };
const COEFS = { 'fondamental-3': COEF_3E_CYCLE };
const coefsFor = (cycle, subjects) => Object.fromEntries(subjects.map((n) => [n, (COEFS[cycle] && COEFS[cycle][n]) || 1]));
function defaultYearLabel(d = new Date()) { const y = d.getFullYear(); return d.getMonth() >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`; }
function defaultTerms(label) {
  const [a, b] = label.split('-').map(Number);
  return [
    { name: 'Trimestre 1', starts_on: `${a}-09-01`, ends_on: `${a}-12-19` },
    { name: 'Trimestre 2', starts_on: `${b}-01-05`, ends_on: `${b}-03-27` },
    { name: 'Trimestre 3', starts_on: `${b}-04-06`, ends_on: `${b}-06-30` },
  ];
}
function template(label) {
  let pos = 0;
  return {
    year: label, terms: defaultTerms(label),
    cycles: CYCLES.map((c) => ({ id: c.id, fr: c.fr, ht: c.ht, on: c.on,
      levels: c.levels.map((name) => { const subjects = [...SUBJECTS[c.id], ...(SUBJECTS_EXTRA[name] || [])];
        return { name, position: (pos += 10), subjects, coefficients: coefsFor(c.id, subjects), notation: c.id === 'prescolaire' ? 'appreciations' : 'notes' }; }) })),
    note: 'Modèle indicatif (MENFP) : niveaux, matières et dates sont modifiables ; coefficients MENFP au 3e cycle (décision du 14 juin 2023), 1 ailleurs.',
  };
}

/* ---------- lecture ---------- */
async function readAll(db, u) {
  const sid = u.school_id;
  const years = await db.all('SELECT id, label, is_current, archived_at FROM school_year WHERE school_id = ? ORDER BY label DESC', sid);
  const wy = await workingYear(db, sid);
  const levels = await db.all('SELECT id, name, cycle, position, archived_at FROM level WHERE school_id = ? ORDER BY archived_at IS NOT NULL, position, name', sid);
  const classes = await db.all(`SELECT c.id, c.name, c.room, c.level_id, c.school_year_id, c.campus_id, c.archived_at, l.name AS level,
    (SELECT COUNT(*) FROM enrollment e WHERE e.class_id = c.id AND e.school_id = c.school_id AND e.status = 'actif') AS students
    FROM class c JOIN level l ON l.id = c.level_id AND l.school_id = c.school_id WHERE c.school_id = ? ORDER BY c.archived_at IS NOT NULL, l.position, c.name`, sid);
  const terms = await db.all(`SELECT t.id, t.school_year_id, t.name, t.position, t.starts_on, t.ends_on,
    (SELECT COUNT(*) FROM evaluation ev WHERE ev.term_id = t.id AND ev.school_id = t.school_id) AS evaluations
    FROM term t WHERE t.school_id = ? ORDER BY t.school_year_id, t.position`, sid);
  const subjects = await db.all(`SELECT s.id, s.name, s.coefficient, s.level_id, s.school_year_id, s.archived_at FROM subject s
    WHERE s.school_id = ? ORDER BY s.archived_at IS NOT NULL, s.name`, sid);
  const teachers = await db.all(`SELECT u.id, u.display_name AS name FROM app_user u JOIN user_role r ON r.user_id = u.id AND r.school_id = u.school_id
    WHERE u.school_id = ? AND r.role = 'enseignant' AND u.state = 'actif' ORDER BY u.display_name`, sid);
  const assignments = await db.all(`SELECT ta.id, ta.teacher_user_id, ta.class_id, ta.subject_id FROM teacher_assignment ta WHERE ta.school_id = ? ORDER BY ta.id`, sid);
  const pending = await db.get(`SELECT COUNT(*) AS n FROM account_token WHERE school_id = ? AND kind = 'invitation' AND role = 'enseignant' AND used_at IS NULL AND expires_at > ?`, sid, now());
  return { year: wy || null, years, levels, classes, terms, subjects, teachers, assignments, pending_teacher_invitations: Number(pending ? pending.n : 0), can_manage: canManage(u), can_bulletins: P.has(u, 'direction', 'secretariat') };
}

/* ---------- assistant (idempotent : ce qui existe est réutilisé, jamais modifié) ---------- */
async function wizard(db, u, b) {
  const label = yearLabel(b.year);
  const levels = Array.isArray(b.levels) ? b.levels : [];
  const classes = Array.isArray(b.classes) ? b.classes : [];
  const subjects = Array.isArray(b.subjects) ? b.subjects : [];
  const terms = Array.isArray(b.terms) ? b.terms : [];
  if (levels.length > LIMITS.levels || classes.length > LIMITS.classes || subjects.length > LIMITS.subjects || terms.length > LIMITS.terms) throw new HttpError(413, 'trop d’éléments');
  const created = { years: 0, levels: 0, classes: 0, subjects: 0, terms: 0 }, existing = { years: 0, levels: 0, classes: 0, subjects: 0, terms: 0 };
  const sid = u.school_id;
  // Validation complète avant toute écriture.
  const L = levels.map((l, i) => ({ name: str(l && l.name, 60, 'niveau'), cycle: opt(l && l.cycle, 40, 'cycle'), position: Number.isInteger(l && l.position) ? l.position : (i + 1) * 10 }));
  const T = terms.map((t) => { const x = { name: str(t && t.name, 60, 'période'), starts_on: day(t && t.starts_on, 'début'), ends_on: day(t && t.ends_on, 'fin') }; if (x.ends_on < x.starts_on) throw new HttpError(400, `période « ${x.name} » : fin avant le début`); return x; });
  const C = classes.map((c) => ({ name: str(c && c.name, 60, 'classe'), level: str(c && c.level, 60, 'niveau de la classe'), room: opt(c && c.room, 40, 'salle') }));
  const Sb = subjects.map((s) => ({ name: str(s && s.name, 80, 'matière'), level: s && s.level ? str(s.level, 60, 'niveau de la matière') : null, coefficient: coef(s && s.coefficient) }));
  return db.tx(async (t) => {
    let y = await t.get('SELECT id, label, is_current, archived_at FROM school_year WHERE school_id = ? AND label = ?', sid, label);
    if (y && y.archived_at) throw new HttpError(409, 'cette année est archivée');
    if (!y) {
      const cur = await t.get('SELECT id FROM school_year WHERE school_id = ? AND is_current = 1', sid);
      const id = await t.insert('INSERT INTO school_year (school_id, label, is_current) VALUES (?,?,?)', sid, label, cur ? 0 : 1);
      y = { id, label }; created.years++;
    } else existing.years++;
    if (b.current === true) { await t.run('UPDATE school_year SET is_current = 0 WHERE school_id = ? AND id <> ?', sid, y.id); await t.run('UPDATE school_year SET is_current = 1 WHERE id = ? AND school_id = ?', y.id, sid); }
    // Périodes : réutilisées par nom dans l'année ; positions à la suite.
    const haveT = await t.all('SELECT id, name, position FROM term WHERE school_id = ? AND school_year_id = ?', sid, y.id);
    let pos = haveT.reduce((a, x) => Math.max(a, Number(x.position)), 0);
    for (const x of T) {
      if (haveT.some((h) => key(h.name) === key(x.name))) { existing.terms++; continue; }
      await t.insert('INSERT INTO term (school_id, school_year_id, name, position, starts_on, ends_on) VALUES (?,?,?,?,?,?)', sid, y.id, x.name, ++pos, x.starts_on, x.ends_on);
      haveT.push({ name: x.name }); created.terms++;
    }
    const lvl = new Map((await t.all('SELECT id, name FROM level WHERE school_id = ? AND archived_at IS NULL', sid)).map((l) => [key(l.name), l.id]));
    for (const x of L) {
      if (lvl.has(key(x.name))) { existing.levels++; continue; }
      lvl.set(key(x.name), await t.insert('INSERT INTO level (school_id, name, cycle, position) VALUES (?,?,?,?)', sid, x.name, x.cycle, x.position)); created.levels++;
    }
    const campus = await defaultCampus(t, sid);
    const cls = new Set((await t.all('SELECT name FROM class WHERE school_id = ? AND school_year_id = ? AND archived_at IS NULL', sid, y.id)).map((c) => key(c.name)));
    for (const x of C) {
      const lid = lvl.get(key(x.level)); if (!lid) throw new HttpError(400, `classe « ${x.name} » : niveau inconnu « ${x.level} »`);
      if (cls.has(key(x.name))) { existing.classes++; continue; }
      await t.insert('INSERT INTO class (school_id, name, school_year_id, level_id, campus_id, room) VALUES (?,?,?,?,?,?)', sid, x.name, y.id, lid, campus, x.room);
      cls.add(key(x.name)); created.classes++;
    }
    const subj = new Set((await t.all('SELECT name, level_id FROM subject WHERE school_id = ? AND school_year_id = ? AND archived_at IS NULL', sid, y.id)).map((s) => `${s.level_id || 0}|${key(s.name)}`));
    for (const x of Sb) {
      const lid = x.level ? lvl.get(key(x.level)) : null; if (x.level && !lid) throw new HttpError(400, `matière « ${x.name} » : niveau inconnu « ${x.level} »`);
      const k = `${lid || 0}|${key(x.name)}`;
      if (subj.has(k)) { existing.subjects++; continue; }
      await t.insert('INSERT INTO subject (school_id, name, school_year_id, coefficient, level_id) VALUES (?,?,?,?,?)', sid, x.name, y.id, x.coefficient, lid);
      subj.add(k); created.subjects++;
    }
    await audit(t, u, 'structure.assistant', 'school_year', y.id, `créés ${JSON.stringify(created)}`);
    return { year: { id: y.id, label }, created, existing };
  });
}

const W = (fn) => async (db, req, u, m, ctx) => { if (!canManage(u)) await refuse(ctx, u, 'structure.write', 'school', u.school_id, null); return fn(db, req, u, m, ctx); };

const routes = [
  ['GET', /^\/api\/structure$/, async (db, req, u) => { if (!canRead(u)) forbid(); return readAll(db, u); }],
  ['GET', /^\/api\/structure\/modele$/, async (db, req, u) => {
    if (!canRead(u)) forbid();
    const want = req.query.get('annee');
    return template(want ? yearLabel(want) : defaultYearLabel());
  }],
  ['POST', /^\/api\/structure\/assistant$/, W(async (db, req, u) => wizard(db, u, req.body || {}))],

  // Années scolaires
  ['POST', /^\/api\/structure\/annees$/, W(async (db, req, u) => {
    const b = req.body || {}; const label = yearLabel(b.label);
    const cur = await db.get('SELECT id FROM school_year WHERE school_id = ? AND is_current = 1', u.school_id);
    const makeCurrent = b.current === true || !cur;
    if (makeCurrent && cur) await db.run('UPDATE school_year SET is_current = 0 WHERE school_id = ?', u.school_id);
    const id = await db.insert('INSERT INTO school_year (school_id, label, is_current) VALUES (?,?,?)', u.school_id, label, makeCurrent ? 1 : 0);
    await audit(db, u, 'structure.annee.create', 'school_year', id, label);
    return { id, label, is_current: makeCurrent ? 1 : 0 };
  })],
  ['PATCH', /^\/api\/structure\/annees\/(\d+)$/, W(async (db, req, u, [id]) => {
    const b = req.body || {};
    const y = await db.get('SELECT * FROM school_year WHERE id = ? AND school_id = ?', Number(id), u.school_id); if (!y) notFound();
    if (b.archived === true) {
      if (Number(y.is_current) === 1) throw new HttpError(409, 'l’année courante ne peut pas être archivée : choisissez d’abord une autre année courante');
      await db.run('UPDATE school_year SET archived_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', now(), y.id, u.school_id);
    } else if (b.archived === false) await db.run('UPDATE school_year SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', y.id, u.school_id);
    if (b.label != null) await db.run('UPDATE school_year SET label = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', yearLabel(b.label), y.id, u.school_id);
    if (b.current === true) {
      if (y.archived_at && b.archived !== false) throw new HttpError(409, 'année archivée');
      await db.run('UPDATE school_year SET is_current = 0 WHERE school_id = ? AND id <> ?', u.school_id, y.id);
      await db.run('UPDATE school_year SET is_current = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', y.id, u.school_id);
    }
    await audit(db, u, 'structure.annee.update', 'school_year', y.id, JSON.stringify(b).slice(0, 200));
    return db.get('SELECT id, label, is_current, archived_at FROM school_year WHERE id = ? AND school_id = ?', y.id, u.school_id);
  })],

  // Niveaux
  ['POST', /^\/api\/structure\/niveaux$/, W(async (db, req, u) => {
    const b = req.body || {};
    const last = await db.get('SELECT MAX(position) AS p FROM level WHERE school_id = ?', u.school_id);
    const position = Number.isInteger(b.position) ? b.position : Number(last && last.p || 0) + 10;
    const id = await db.insert('INSERT INTO level (school_id, name, cycle, position) VALUES (?,?,?,?)', u.school_id, str(b.name, 60, 'niveau'), opt(b.cycle, 40, 'cycle'), position);
    await audit(db, u, 'structure.niveau.create', 'level', id, b.name);
    return { id };
  })],
  ['PATCH', /^\/api\/structure\/niveaux\/(\d+)$/, W(async (db, req, u, [id]) => {
    const b = req.body || {};
    const l = await db.get('SELECT * FROM level WHERE id = ? AND school_id = ?', Number(id), u.school_id); if (!l) notFound();
    if (b.archived === true) {
      const used = await db.get(`SELECT COUNT(*) AS n FROM class c WHERE c.level_id = ? AND c.school_id = ? AND c.archived_at IS NULL`, l.id, u.school_id);
      if (Number(used.n)) throw new HttpError(409, 'des classes actives utilisent ce niveau : archivez-les d’abord');
      await db.run('UPDATE level SET archived_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', now(), l.id, u.school_id);
    } else if (b.archived === false) await db.run('UPDATE level SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', l.id, u.school_id);
    if (b.name != null) await db.run('UPDATE level SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', str(b.name, 60, 'niveau'), l.id, u.school_id);
    if (b.cycle !== undefined) await db.run('UPDATE level SET cycle = ? WHERE id = ? AND school_id = ?', opt(b.cycle, 40, 'cycle'), l.id, u.school_id);
    if (Number.isInteger(b.position)) await db.run('UPDATE level SET position = ? WHERE id = ? AND school_id = ?', b.position, l.id, u.school_id);
    await audit(db, u, 'structure.niveau.update', 'level', l.id, JSON.stringify(b).slice(0, 200));
    return db.get('SELECT id, name, cycle, position, archived_at FROM level WHERE id = ? AND school_id = ?', l.id, u.school_id);
  })],

  // Classes
  ['POST', /^\/api\/structure\/classes$/, W(async (db, req, u) => {
    const b = req.body || {};
    const y = await yearOf(db, u, b.school_year_id);
    const l = await levelOf(db, u, b.level_id);
    const id = await db.insert('INSERT INTO class (school_id, name, school_year_id, level_id, campus_id, room) VALUES (?,?,?,?,?,?)',
      u.school_id, str(b.name, 60, 'classe'), y.id, l.id, await defaultCampus(db, u.school_id), opt(b.room, 40, 'salle'));
    await audit(db, u, 'structure.classe.create', 'class', id, `${b.name} (${y.label})`);
    return { id };
  })],
  ['PATCH', /^\/api\/structure\/classes\/(\d+)$/, W(async (db, req, u, [id]) => {
    const b = req.body || {};
    const c = await db.get('SELECT * FROM class WHERE id = ? AND school_id = ?', Number(id), u.school_id); if (!c) notFound();
    if (b.archived === true) {
      const n = await db.get(`SELECT COUNT(*) AS n FROM enrollment WHERE class_id = ? AND school_id = ? AND status = 'actif'`, c.id, u.school_id);
      if (Number(n.n)) throw new HttpError(409, 'des élèves sont inscrits dans cette classe : changez-les d’abord de classe');
      await db.run('UPDATE class SET archived_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', now(), c.id, u.school_id);
    } else if (b.archived === false) await db.run('UPDATE class SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', c.id, u.school_id);
    if (b.name != null) await db.run('UPDATE class SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', str(b.name, 60, 'classe'), c.id, u.school_id);
    if (b.room !== undefined) await db.run('UPDATE class SET room = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', opt(b.room, 40, 'salle'), c.id, u.school_id);
    if (b.level_id != null) { const l = await levelOf(db, u, b.level_id); await db.run('UPDATE class SET level_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', l.id, c.id, u.school_id); }
    await audit(db, u, 'structure.classe.update', 'class', c.id, JSON.stringify(b).slice(0, 200));
    return db.get('SELECT id, name, room, level_id, school_year_id, archived_at FROM class WHERE id = ? AND school_id = ?', c.id, u.school_id);
  })],

  // Périodes
  ['POST', /^\/api\/structure\/periodes$/, W(async (db, req, u) => {
    const b = req.body || {};
    const y = await yearOf(db, u, b.school_year_id);
    const s = day(b.starts_on, 'début'), e = day(b.ends_on, 'fin'); if (e < s) throw new HttpError(400, 'fin avant le début');
    const n = await db.get('SELECT COUNT(*) AS n, MAX(position) AS p FROM term WHERE school_id = ? AND school_year_id = ?', u.school_id, y.id);
    if (Number(n.n) >= LIMITS.terms) throw new HttpError(409, `${LIMITS.terms} périodes au plus par année`);
    const id = await db.insert('INSERT INTO term (school_id, school_year_id, name, position, starts_on, ends_on) VALUES (?,?,?,?,?,?)', u.school_id, y.id, str(b.name, 60, 'période'), Number(n.p || 0) + 1, s, e);
    await audit(db, u, 'structure.periode.create', 'term', id, `${b.name} ${s} → ${e}`);
    return { id };
  })],
  ['PATCH', /^\/api\/structure\/periodes\/(\d+)$/, W(async (db, req, u, [id]) => {
    const b = req.body || {};
    const t = await db.get('SELECT * FROM term WHERE id = ? AND school_id = ?', Number(id), u.school_id); if (!t) notFound();
    const s = b.starts_on != null ? day(b.starts_on, 'début') : t.starts_on, e = b.ends_on != null ? day(b.ends_on, 'fin') : t.ends_on;
    if (e < s) throw new HttpError(400, 'fin avant le début');
    const out = await db.get('SELECT COUNT(*) AS n FROM evaluation WHERE term_id = ? AND school_id = ? AND (day < ? OR day > ?)', t.id, u.school_id, s, e);
    if (Number(out.n)) throw new HttpError(409, 'des évaluations existent hors de ces dates : déplacez-les d’abord');
    await db.run('UPDATE term SET name = ?, starts_on = ?, ends_on = ? WHERE id = ? AND school_id = ?', b.name != null ? str(b.name, 60, 'période') : t.name, s, e, t.id, u.school_id);
    await audit(db, u, 'structure.periode.update', 'term', t.id, `${s} → ${e}`);
    return { id: t.id, starts_on: s, ends_on: e };
  })],
  ['DELETE', /^\/api\/structure\/periodes\/(\d+)$/, W(async (db, req, u, [id]) => {
    const t = await db.get('SELECT * FROM term WHERE id = ? AND school_id = ?', Number(id), u.school_id); if (!t) notFound();
    const used = await db.get('SELECT (SELECT COUNT(*) FROM evaluation WHERE term_id = ? AND school_id = ?) + (SELECT COUNT(*) FROM report_card WHERE term_id = ? AND school_id = ?) AS n', t.id, u.school_id, t.id, u.school_id);
    if (Number(used.n)) throw new HttpError(409, 'période utilisée (évaluations ou bulletins) : modifiez-la plutôt');
    await db.run('DELETE FROM term WHERE id = ? AND school_id = ?', t.id, u.school_id);
    await audit(db, u, 'structure.periode.delete', 'term', t.id, t.name);
    return { ok: true };
  })],

  // Matières
  ['POST', /^\/api\/structure\/matieres$/, W(async (db, req, u) => {
    const b = req.body || {};
    const y = await yearOf(db, u, b.school_year_id);
    const lid = b.level_id == null || b.level_id === '' ? null : (await levelOf(db, u, b.level_id)).id;
    const id = await db.insert('INSERT INTO subject (school_id, name, school_year_id, coefficient, level_id) VALUES (?,?,?,?,?)', u.school_id, str(b.name, 80, 'matière'), y.id, coef(b.coefficient), lid);
    await audit(db, u, 'structure.matiere.create', 'subject', id, b.name);
    return { id };
  })],
  ['PATCH', /^\/api\/structure\/matieres\/(\d+)$/, W(async (db, req, u, [id]) => {
    const b = req.body || {};
    const s = await db.get('SELECT * FROM subject WHERE id = ? AND school_id = ?', Number(id), u.school_id); if (!s) notFound();
    if (b.archived === true) await db.run('UPDATE subject SET archived_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', now(), s.id, u.school_id);
    else if (b.archived === false) await db.run('UPDATE subject SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', s.id, u.school_id);
    if (b.name != null) await db.run('UPDATE subject SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', str(b.name, 80, 'matière'), s.id, u.school_id);
    if (b.coefficient != null) await db.run('UPDATE subject SET coefficient = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', coef(b.coefficient), s.id, u.school_id);
    await audit(db, u, 'structure.matiere.update', 'subject', s.id, JSON.stringify(b).slice(0, 200));
    return db.get('SELECT id, name, coefficient, level_id, archived_at FROM subject WHERE id = ? AND school_id = ?', s.id, u.school_id);
  })],

  // Affectations enseignant ↔ classe (et matière facultative)
  ['POST', /^\/api\/structure\/affectations$/, W(async (db, req, u) => {
    const b = req.body || {};
    const teacher = await db.get(`SELECT u.id FROM app_user u JOIN user_role r ON r.user_id = u.id AND r.school_id = u.school_id
      WHERE u.id = ? AND u.school_id = ? AND r.role = 'enseignant'`, int(b.teacher_user_id, 'enseignant'), u.school_id);
    if (!teacher) notFound();
    const c = await db.get('SELECT id, level_id, school_year_id, archived_at FROM class WHERE id = ? AND school_id = ?', int(b.class_id, 'classe'), u.school_id);
    if (!c) notFound(); if (c.archived_at) throw new HttpError(409, 'classe archivée');
    let subjectId = null;
    if (b.subject_id != null && b.subject_id !== '') {
      const s = await db.get('SELECT id, level_id, school_year_id, archived_at FROM subject WHERE id = ? AND school_id = ?', int(b.subject_id, 'matière'), u.school_id);
      if (!s) notFound();
      if (s.archived_at) throw new HttpError(409, 'matière archivée');
      if (Number(s.school_year_id) !== Number(c.school_year_id) || (s.level_id != null && Number(s.level_id) !== Number(c.level_id))) throw new HttpError(400, 'cette matière n’est pas enseignée dans cette classe (année ou niveau différent)');
      subjectId = s.id;
    }
    const id = await db.insert('INSERT INTO teacher_assignment (school_id, teacher_user_id, class_id, subject_id) VALUES (?,?,?,?)', u.school_id, teacher.id, c.id, subjectId);
    await audit(db, u, 'structure.affectation.create', 'teacher_assignment', id, `enseignant ${teacher.id} → classe ${c.id}${subjectId ? ` / matière ${subjectId}` : ''}`);
    return { id };
  })],
  ['DELETE', /^\/api\/structure\/affectations\/(\d+)$/, W(async (db, req, u, [id]) => {
    const a = await db.get('SELECT * FROM teacher_assignment WHERE id = ? AND school_id = ?', Number(id), u.school_id); if (!a) notFound();
    await db.run('DELETE FROM teacher_assignment WHERE id = ? AND school_id = ?', a.id, u.school_id);
    await audit(db, u, 'structure.affectation.delete', 'teacher_assignment', a.id, `enseignant ${a.teacher_user_id} → classe ${a.class_id}`);
    return { ok: true };
  })],
];

module.exports = { routes, activeClass, workingYear, template, defaultYearLabel, CYCLES, SUBJECTS, COEF_3E_CYCLE };
