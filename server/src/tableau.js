'use strict';
// Lot 1 : tableau de bord et rapports calculés sur les données réelles de l'école (aucune donnée de démonstration
// après connexion). Chaque bloc respecte les périmètres de policy.js : enseignant = ses classes, parent = ses enfants,
// comptabilité = finances seules, bibliothèque = prêts seuls. Lecture seule ; passe par db.asSchool (RLS).
const P = require('./policy');
const { forbid } = require('./common');
const { activeClass, workingYear } = require('./structure');

const localDay = () => new Date().toLocaleDateString('en-CA', { timeZone: process.env.NORIA_TZ || 'America/Port-au-Prince' });
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const num = (v) => Number(v || 0);
const htg = (c) => Math.round(num(c)) / 100;
const ROLE_ORDER = ['direction', 'secretariat', 'enseignant', 'comptabilite', 'bibliotheque', 'parent', 'eleve'];

// Classes actives du périmètre (direction, secrétariat : toute l'école ; enseignant : ses affectations).
async function scopedClasses(db, u) {
  const sc = P.classScope(u); if (sc === P.NONE) return [];
  return db.all(`SELECT c.id, c.name, c.room, l.name AS level,
    (SELECT COUNT(*) FROM enrollment e WHERE e.class_id = c.id AND e.school_id = c.school_id AND e.status = 'actif') AS students
    FROM class c JOIN level l ON l.id = c.level_id AND l.school_id = c.school_id WHERE ${sc.sql} AND ${activeClass('c')} ORDER BY l.position, c.name`, ...sc.params);
}
const inList = (ids) => (ids.length ? ids.map(() => '?').join(',') : 'NULL');

async function attendanceStats(db, u, classIds, from, to) {
  if (!classIds.length) return { rate: null, records: 0, absences: 0 };
  const r = await db.get(`SELECT COUNT(*) AS n, SUM(CASE WHEN status IN ('present','retard') THEN 1 ELSE 0 END) AS p, SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS a
    FROM attendance WHERE school_id = ? AND day >= ? AND day <= ? AND class_id IN (${inList(classIds)})`, u.school_id, from, to, ...classIds);
  const n = num(r && r.n);
  return { rate: n ? Math.round((num(r.p) / n) * 100) : null, records: n, absences: num(r && r.a) };
}
async function financeTotals(db, u) {
  const rows = await db.all(`SELECT st.id,
    COALESCE((SELECT SUM(f.amount_cents) FROM finance_entry f WHERE f.student_id = st.id AND f.school_id = st.school_id), 0) AS due,
    COALESCE((SELECT SUM(p.amount_cents) FROM payment p WHERE p.student_id = st.id AND p.school_id = st.school_id AND p.cancelled_at IS NULL), 0) AS paid
    FROM student st WHERE st.school_id = ?`, u.school_id);
  const due = rows.reduce((a, r) => a + num(r.due), 0), paid = rows.reduce((a, r) => a + num(r.paid), 0);
  return { due_htg: htg(due), paid_htg: htg(paid), balance_htg: htg(due - paid), unpaid_students: rows.filter((r) => num(r.due) > num(r.paid)).length, fees: rows.filter((r) => num(r.due) > 0).length };
}
async function libraryTotals(db, u, today) {
  const b = await db.get('SELECT COUNT(*) AS n, COALESCE(SUM(copies), 0) AS c FROM book WHERE school_id = ?', u.school_id);
  const l = await db.get(`SELECT COUNT(*) AS n, SUM(CASE WHEN due_on < ? THEN 1 ELSE 0 END) AS late FROM loan WHERE school_id = ? AND returned_on IS NULL`, today, u.school_id);
  return { titles: num(b && b.n), copies: num(b && b.c), open_loans: num(l && l.n), late_loans: num(l && l.late) };
}

async function dashboard(db, u) {
  const today = localDay(), from30 = addDays(today, -29);
  const out = { role: ROLE_ORDER.find((r) => u.roles.includes(r)) || null, today };
  const y = await workingYear(db, u.school_id);
  if (P.has(u, 'direction', 'secretariat')) {
    const cnt = async (sql, ...p) => num((await db.get(sql, ...p)).n);
    const sid = u.school_id;
    out.structure = {
      year: y ? y.label : null,
      levels: await cnt('SELECT COUNT(*) AS n FROM level WHERE school_id = ? AND archived_at IS NULL', sid),
      classes: await cnt(`SELECT COUNT(*) AS n FROM class c WHERE c.school_id = ? AND ${activeClass('c')}`, sid),
      terms: y ? await cnt('SELECT COUNT(*) AS n FROM term WHERE school_id = ? AND school_year_id = ?', sid, y.id) : 0,
      subjects: y ? await cnt('SELECT COUNT(*) AS n FROM subject WHERE school_id = ? AND school_year_id = ? AND archived_at IS NULL', sid, y.id) : 0,
      teachers: await cnt(`SELECT COUNT(*) AS n FROM user_role r JOIN app_user u ON u.id = r.user_id AND u.school_id = r.school_id WHERE r.school_id = ? AND r.role = 'enseignant' AND u.state = 'actif'`, sid),
      unassigned_teachers: await cnt(`SELECT COUNT(*) AS n FROM user_role r JOIN app_user u ON u.id = r.user_id AND u.school_id = r.school_id WHERE r.school_id = ? AND r.role = 'enseignant' AND u.state = 'actif'
        AND NOT EXISTS (SELECT 1 FROM teacher_assignment ta WHERE ta.teacher_user_id = r.user_id AND ta.school_id = r.school_id)`, sid),
      students: await cnt(`SELECT COUNT(*) AS n FROM student st WHERE st.school_id = ? AND st.status = 'actif'`, sid),
      students_without_class: await cnt(`SELECT COUNT(*) AS n FROM student st WHERE st.school_id = ? AND st.status = 'actif' AND NOT EXISTS (SELECT 1 FROM enrollment e JOIN class c ON c.id = e.class_id AND c.school_id = e.school_id
        WHERE e.student_id = st.id AND e.school_id = st.school_id AND e.status = 'actif' AND ${activeClass('c')})`, sid),
    };
  }
  if (P.can.recordAttendance(u)) {
    const classes = await scopedClasses(db, u);
    const ids = classes.map((c) => c.id);
    const done = ids.length ? await db.all(`SELECT DISTINCT class_id FROM attendance WHERE school_id = ? AND day = ? AND class_id IN (${inList(ids)})`, u.school_id, today, ...ids) : [];
    const doneSet = new Set(done.map((r) => Number(r.class_id)));
    out.attendance = { classes: ids.length, done_today: doneSet.size, ...(await attendanceStats(db, u, ids, from30, today)) };
    out.classes = classes.map((c) => ({ id: c.id, name: c.name, level: c.level, room: c.room, students: num(c.students), done_today: doneSet.has(Number(c.id)) }));
    if (P.has(u, 'enseignant')) out.drafts = num((await db.get(`SELECT COUNT(*) AS n FROM evaluation WHERE school_id = ? AND created_by = ? AND status = 'brouillon'`, u.school_id, u.id)).n);
    if (P.has(u, 'direction')) out.to_publish = num((await db.get(`SELECT COUNT(*) AS n FROM evaluation WHERE school_id = ? AND status = 'soumise'`, u.school_id)).n);
  }
  if (P.has(u, 'direction', 'comptabilite')) out.finance = await financeTotals(db, u);
  if (P.has(u, 'direction', 'bibliotheque')) out.library = await libraryTotals(db, u, today);
  if (P.has(u, 'parent', 'eleve') && !P.has(u, 'direction', 'secretariat', 'enseignant')) {
    const sc = P.studentScope(u);
    const kids = await db.all(`SELECT st.id, st.code, st.first_name, st.last_name, c.name AS class FROM student st
      LEFT JOIN enrollment e ON e.student_id = st.id AND e.school_id = st.school_id AND e.status = 'actif'
      LEFT JOIN class c ON c.id = e.class_id AND c.school_id = e.school_id WHERE ${sc.sql} ORDER BY st.first_name`, ...sc.params);
    out.kids = [];
    for (const k of kids) {
      const a = await db.get(`SELECT SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS a, SUM(CASE WHEN status = 'retard' THEN 1 ELSE 0 END) AS r
        FROM attendance WHERE school_id = ? AND student_id = ? AND day >= ?`, u.school_id, k.id, from30);
      const g = await db.get(`SELECT COUNT(*) AS n FROM grade g JOIN evaluation ev ON ev.id = g.evaluation_id AND ev.school_id = g.school_id
        WHERE g.school_id = ? AND g.student_id = ? AND ev.status = 'publiee'`, u.school_id, k.id);
      const kid = { id: k.id, code: k.code, first_name: k.first_name, last_name: k.last_name, class: k.class || null, absences_30d: num(a && a.a), lates_30d: num(a && a.r), published_grades: num(g && g.n) };
      if (P.has(u, 'parent')) {
        const f = await db.get(`SELECT COALESCE((SELECT SUM(amount_cents) FROM finance_entry WHERE student_id = ? AND school_id = ?), 0) AS due,
          COALESCE((SELECT SUM(amount_cents) FROM payment WHERE student_id = ? AND school_id = ? AND cancelled_at IS NULL), 0) AS paid`, k.id, u.school_id, k.id, u.school_id);
        kid.balance_htg = htg(num(f.due) - num(f.paid));
      }
      out.kids.push(kid);
    }
  }
  return out;
}

async function reports(db, u, q) {
  if (!P.has(u, 'direction', 'secretariat', 'enseignant', 'comptabilite', 'bibliotheque')) forbid();
  const today = localDay();
  const y = await workingYear(db, u.school_id);
  const first = y ? await db.get('SELECT MIN(starts_on) AS d FROM term WHERE school_id = ? AND school_year_id = ?', u.school_id, y.id) : null;
  const want = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
  const from = want(q.get('du')) || (first && first.d && first.d <= today ? first.d : addDays(today, -89));
  const to = want(q.get('au')) || today;
  const out = { from, to, year: y ? y.label : null };
  if (P.has(u, 'direction', 'secretariat', 'enseignant')) {
    const classes = await scopedClasses(db, u);
    out.classes = [];
    for (const c of classes) {
      const a = await attendanceStats(db, u, [c.id], from, to);
      const g = await db.get(`SELECT COUNT(*) AS n, SUM(g.score / ev.max_score) AS s FROM grade g JOIN evaluation ev ON ev.id = g.evaluation_id AND ev.school_id = g.school_id
        WHERE g.school_id = ? AND ev.class_id = ? AND ev.status = 'publiee' AND g.score IS NOT NULL`, u.school_id, c.id);
      const n = num(g && g.n);
      out.classes.push({ id: c.id, name: c.name, level: c.level, students: num(c.students), attendance_rate: a.rate, absences: a.absences, attendance_records: a.records,
        published_grades: n, average_pct: n ? Math.round((num(g.s) / n) * 1000) / 10 : null });
    }
  }
  if (P.has(u, 'direction', 'comptabilite')) {
    out.finance = await financeTotals(db, u);
    out.finance.by_method = (await db.all(`SELECT method, COUNT(*) AS n, SUM(amount_cents) AS c FROM payment WHERE school_id = ? AND cancelled_at IS NULL AND paid_on >= ? AND paid_on <= ? GROUP BY method ORDER BY method`, u.school_id, from, to))
      .map((r) => ({ method: r.method, count: num(r.n), amount_htg: htg(r.c) }));
  }
  if (P.has(u, 'direction', 'bibliotheque')) {
    out.library = await libraryTotals(db, u, today);
    out.library.loans_in_period = num((await db.get('SELECT COUNT(*) AS n FROM loan WHERE school_id = ? AND loaned_on >= ? AND loaned_on <= ?', u.school_id, from, to)).n);
  }
  if (P.can.readAudit(u)) {
    out.exports = await db.all(`SELECT a.created_at, a.action, a.record_type, a.outcome, u.display_name AS actor FROM audit_log a
      LEFT JOIN app_user u ON u.id = a.actor_user_id AND u.school_id = a.school_id WHERE a.school_id = ? AND a.action LIKE 'export.%' ORDER BY a.id DESC LIMIT 10`, u.school_id);
  }
  out.can_export = { students: P.can.exportStudents(u), finance: P.can.exportFinance(u) };
  return out;
}

const routes = [
  ['GET', /^\/api\/tableau-de-bord$/, async (db, req, u) => dashboard(db, u)],
  ['GET', /^\/api\/rapports$/, async (db, req, u) => reports(db, u, req.query)],
];

module.exports = { routes, dashboard, reports };
