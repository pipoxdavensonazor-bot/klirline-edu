'use strict';
// Bulletins au format haïtien (MENFP) : moyennes par période sur l'échelle de l'école (/10 par défaut), points
// (moyenne × coefficient), moyenne générale, rang (ex aequo), mention, décision de fin d'année (admis, admis sous
// condition, redouble, promotion automatique 1re–3e AF), appréciations non chiffrées au préscolaire, PDF imprimable
// de toute la classe avec en-tête de l'école et signatures. S'appuie sur computeAverages (scolaire.js) sans le remplacer.
// Sources et règles incertaines : docs/bulletins-menfp.md. Toutes les règles sont réglables par école.
const P = require('./policy');
const { HttpError, forbid, notFound, audit, refuse } = require('./common');
const { computeAverages } = require('./scolaire');
const { schoolProfile } = require('./identite');
const { Page, buildDoc, schoolHeader } = require('./pdf');

// Défauts « style MENFP ». Ce qui n'est pas fixé par un texte officiel trouvé (seuils, mentions, bande « sous
// condition ») est marqué incertain dans la doc et modifiable par la direction.
const DEFAULT_RULES = Object.freeze({
  echelle: 10,                 // notes et moyennes affichées sur 10 (usage courant au fondamental) — modifiable (10, 20, 100)
  moyenne_passage: 5,          // moyenne annuelle d'admission — INCERTAIN, à confirmer par l'école
  seuil_condition: 4.5,        // [seuil_condition ; moyenne_passage[ → admis sous condition — INCERTAIN
  ponderation_periodes: [],    // vide = toutes les périodes ont le même poids
  mentions: [
    { min: 9, label: 'Excellent' }, { min: 8, label: 'Très bien' }, { min: 7, label: 'Bien' },
    { min: 6, label: 'Assez bien' }, { min: 5, label: 'Passable' }, { min: 0, label: 'Insuffisant' }],
  promotion_automatique: ['1re AF', '2e AF', '3e AF'], // MENFP : promotion automatique obligatoire dès 2025-2026
  rang: true,
  appreciations: ['Acquis', "En voie d'acquisition", 'Non acquis'],
  domaines_prescolaire: ['Langage et communication', 'Éveil mathématique', 'Découverte du monde', 'Motricité', 'Arts et créativité', 'Vie sociale et comportement'],
  signatures: ['Titulaire', 'Direction', 'Parent ou responsable'],
  entete_ministere: true,      // « République d'Haïti — MENFP » en tête du bulletin
});

const num = (v, lo, hi, what) => { const x = Number(v); if (!Number.isFinite(x) || x < lo || x > hi) throw new HttpError(400, `${what} invalide`); return x; };
const txtList = (v, max, len, what) => {
  if (!Array.isArray(v) || v.length > max) throw new HttpError(400, `${what} invalide`);
  return v.map((s) => { const t = String(s ?? '').trim(); if (!t || t.length > len) throw new HttpError(400, `${what} invalide`); return t; });
};
// Valide et complète des règles (champs absents = défaut). Lève 400 sur une valeur incohérente.
function normalizeRules(input) {
  const r = { ...DEFAULT_RULES, ...(input && typeof input === 'object' ? input : {}) };
  const out = {};
  out.echelle = num(r.echelle, 1, 1000, 'échelle');
  out.moyenne_passage = num(r.moyenne_passage, 0, out.echelle, 'moyenne de passage');
  out.seuil_condition = num(r.seuil_condition, 0, out.moyenne_passage, 'seuil « sous condition »');
  if (!Array.isArray(r.ponderation_periodes) || r.ponderation_periodes.length > 12) throw new HttpError(400, 'pondération des périodes invalide');
  out.ponderation_periodes = r.ponderation_periodes.map((w) => num(w, 0, 100, 'poids de période'));
  if (!Array.isArray(r.mentions) || !r.mentions.length || r.mentions.length > 12) throw new HttpError(400, 'mentions invalides');
  out.mentions = r.mentions.map((m) => ({ min: num(m && m.min, 0, out.echelle, 'seuil de mention'), label: txtList([m && m.label], 1, 40, 'mention')[0] }))
    .sort((a, b) => b.min - a.min);
  out.promotion_automatique = txtList(r.promotion_automatique, 30, 60, 'niveaux à promotion automatique');
  out.rang = r.rang !== false;
  out.appreciations = txtList(r.appreciations, 8, 60, 'appréciations');
  if (!out.appreciations.length) throw new HttpError(400, 'appréciations invalides');
  out.domaines_prescolaire = txtList(r.domaines_prescolaire, 15, 80, 'domaines');
  out.signatures = txtList(r.signatures, 4, 40, 'signatures');
  out.entete_ministere = r.entete_ministere !== false;
  return out;
}
async function loadRules(db, schoolId) {
  const row = await db.get('SELECT bulletin_rules FROM school WHERE id = ?', schoolId);
  let saved = null;
  try { saved = row && row.bulletin_rules ? JSON.parse(row.bulletin_rules) : null; } catch { saved = null; }
  try { return normalizeRules(saved); } catch { return normalizeRules(null); }
}

const round2 = (x) => Math.round(x * 100) / 100;
function mentionFor(avg, rules) {
  if (avg == null) return null;
  const m = rules.mentions.find((x) => avg >= x.min);
  return m ? m.label : null;
}
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
// Décision de fin d'année. La promotion automatique (1re–3e AF) l'emporte sur la moyenne.
function decisionFor(avg, levelName, rules) {
  if (rules.promotion_automatique.some((l) => norm(l) === norm(levelName))) return { code: 'promotion_automatique', label: 'Admis(e) — promotion automatique' };
  if (avg == null) return { code: 'non_classe', label: 'Non classé(e) — notes insuffisantes' };
  if (avg >= rules.moyenne_passage) return { code: 'admis', label: 'Admis(e) en classe supérieure' };
  if (avg >= rules.seuil_condition) return { code: 'admis_sous_condition', label: 'Admis(e) sous condition' };
  return { code: 'redouble', label: 'Redouble' };
}
// Classement « olympique » : ex aequo au même rang, le suivant saute (1, 2, 2, 4). Les élèves sans moyenne ne sont pas classés.
function rankList(values) {
  const sorted = values.map((v, i) => ({ v, i })).filter((x) => x.v != null).sort((a, b) => b.v - a.v);
  const out = values.map(() => ({ rank: null, exAequo: false }));
  sorted.forEach((x, k) => {
    const rank = k > 0 && sorted[k - 1].v === x.v ? out[sorted[k - 1].i].rank : k + 1;
    out[x.i] = { rank, exAequo: false };
  });
  const counts = {};
  out.forEach((o) => { if (o.rank) counts[o.rank] = (counts[o.rank] || 0) + 1; });
  out.forEach((o) => { if (o.rank && counts[o.rank] > 1) o.exAequo = true; });
  return out;
}
// Moyenne annuelle : moyenne des périodes disponibles, pondérée (poids absent = 1).
function annualAverage(periodAvgs, weights = []) {
  let s = 0, w = 0;
  periodAvgs.forEach((a, i) => { if (a == null) return; const k = weights[i] == null ? 1 : Number(weights[i]); s += a * k; w += k; });
  return w ? round2(s / w) : null;
}
const isPrescolaire = (lv) => /pr[eé]scolaire|kindergarten|maternelle/i.test(`${lv.cycle || ''} ${lv.name || ''}`);

// Tableau de la classe pour une période (termId) ou l'année (termId = 'annuel').
async function classBulletin(db, schoolId, classId, termParam) {
  const cls = await db.get(`SELECT c.id, c.name, c.school_year_id, l.name AS level, l.cycle, y.label AS year FROM class c
    JOIN level l ON l.id = c.level_id AND l.school_id = c.school_id JOIN school_year y ON y.id = c.school_year_id AND y.school_id = c.school_id
    WHERE c.id = ? AND c.school_id = ?`, classId, schoolId);
  if (!cls) notFound();
  const rules = await loadRules(db, schoolId);
  const terms = await db.all('SELECT id, name, position FROM term WHERE school_id = ? AND school_year_id = ? ORDER BY position, id', schoolId, cls.school_year_id);
  const annual = termParam === 'annuel' || termParam == null || termParam === '';
  const term = annual ? null : terms.find((t) => t.id === Number(termParam));
  if (!annual && !term) throw new HttpError(400, 'période inconnue pour cette classe');
  const students = await db.all(`SELECT st.id, st.code, st.first_name, st.last_name FROM enrollment e JOIN student st ON st.id = e.student_id AND st.school_id = e.school_id
    WHERE e.class_id = ? AND e.school_id = ? AND e.status = 'actif' ORDER BY st.last_name, st.first_name`, classId, schoolId);
  const mode = isPrescolaire(cls) ? 'appreciations' : 'notes';
  const base = { class: { id: cls.id, name: cls.name, level: cls.level, year: cls.year }, mode, rules,
    period: annual ? { id: 'annuel', name: 'Bilan annuel' } : { id: term.id, name: term.name }, terms: terms.map((t) => ({ id: t.id, name: t.name })), effectif: students.length };

  if (mode === 'appreciations') {
    const ids = annual ? terms.map((t) => t.id) : [term.id];
    const rows = ids.length ? await db.all(`SELECT student_id, term_id, domain, level, comment FROM bulletin_appreciation WHERE school_id = ? AND term_id IN (${ids.map(() => '?').join(',')})`, schoolId, ...ids) : [];
    return { ...base, students: students.map((s) => ({ id: s.id, code: s.code, name: `${s.last_name} ${s.first_name}`,
      appreciations: rows.filter((r) => r.student_id === s.id).map((r) => ({ term_id: r.term_id, domain: r.domain, level: r.level, comment: r.comment })),
      decision: annual ? { code: 'promotion_automatique', label: 'Admis(e) — passage au niveau suivant (préscolaire, sans note)' } : null })) };
  }

  const E = rules.echelle;
  const out = [];
  for (const s of students) {
    const per = [];
    for (const t of terms) {
      if (!annual && t.id !== term.id) { per.push(null); continue; }
      const a = await computeAverages(db, schoolId, s.id, t.id);
      per.push({ term_id: t.id, scale: a.scale, subjects: a.subjects, general: a.general == null ? null : round2((a.general / a.scale) * E) });
    }
    let subjects, average;
    if (annual) {
      // Matières : moyenne des moyennes de période (pondérées) ; générale : moyenne pondérée des générales de période.
      const by = new Map();
      per.forEach((p, i) => p && p.subjects.forEach((x) => {
        if (!by.has(x.name)) by.set(x.name, { name: x.name, coefficient: x.coefficient, vals: terms.map(() => null) });
        by.get(x.name).vals[i] = x.average == null ? null : (x.average / p.scale) * E;
      }));
      subjects = [...by.values()].map((x) => ({ name: x.name, coefficient: x.coefficient, average: annualAverage(x.vals, rules.ponderation_periodes) }));
      average = annualAverage(per.map((p) => (p ? p.general : null)), rules.ponderation_periodes);
    } else {
      const p = per.find(Boolean);
      subjects = p.subjects.map((x) => ({ name: x.name, coefficient: x.coefficient, average: x.average == null ? null : round2((x.average / p.scale) * E) }));
      average = p.general;
    }
    subjects = subjects.map((x) => ({ ...x, points: x.average == null ? null : round2(x.average * x.coefficient), max: round2(E * x.coefficient) }));
    const counted = subjects.filter((x) => x.average != null);
    out.push({ id: s.id, code: s.code, name: `${s.last_name} ${s.first_name}`, subjects, average,
      total_points: counted.length ? round2(counted.reduce((a, x) => a + x.points, 0)) : null,
      total_max: counted.length ? round2(counted.reduce((a, x) => a + x.max, 0)) : null,
      period_averages: per.map((p, i) => ({ term_id: terms[i].id, name: terms[i].name, average: p ? p.general : null })),
      mention: mentionFor(average, rules), decision: annual ? decisionFor(average, cls.level, rules) : null });
  }
  if (rules.rang) rankList(out.map((x) => x.average)).forEach((r, i) => { out[i].rank = r.rank; out[i].ex_aequo = r.exAequo; });
  const avgs = out.map((x) => x.average).filter((v) => v != null);
  return { ...base, students: out,
    stats: { classes: avgs.length, moyenne_classe: avgs.length ? round2(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null,
      plus_forte: avgs.length ? Math.max(...avgs) : null, plus_faible: avgs.length ? Math.min(...avgs) : null,
      admis: out.filter((x) => x.decision && ['admis', 'promotion_automatique'].includes(x.decision.code)).length } };
}

/* ---------- PDF : un bulletin par élève, toute la classe dans un seul document ---------- */
const f2 = (v) => (v == null ? '-' : Number(v).toFixed(2));
const ord = (r, ex) => (r == null ? '-' : `${r}${r === 1 ? 'er' : 'e'}${ex ? ' ex aequo' : ''}`);
function bulletinPage(data, st, school) {
  const p = new Page();
  const L = 50, R = 545, r = data.rules;
  if (r.entete_ministere) {
    p.text(L, 828, "RÉPUBLIQUE D'HAÏTI — Ministère de l'Éducation Nationale et de la Formation Professionnelle (MENFP)", { size: 7.5, bold: true, gray: 0.3 });
  }
  let y = schoolHeader(p, school) - 22;
  p.text(L, y, `Bulletin scolaire — ${data.period.name}`, { size: 15, bold: true });
  p.text(R - 150, y, `Année ${data.class.year}`, { size: 10, gray: 0.25 });
  y -= 20;
  p.text(L, y, 'Élève :', { size: 10, gray: 0.35 }); p.text(L + 45, y, st.name, { size: 11, bold: true });
  p.text(330, y, 'Code :', { size: 10, gray: 0.35 }); p.text(370, y, st.code || '-', { size: 10 });
  y -= 15;
  p.text(L, y, 'Classe :', { size: 10, gray: 0.35 }); p.text(L + 45, y, `${data.class.name} (${data.class.level})`, { size: 10 });
  p.text(330, y, 'Effectif :', { size: 10, gray: 0.35 }); p.text(380, y, String(data.effectif), { size: 10 });
  y -= 24;
  if (data.mode === 'appreciations') {
    p.rect(L, y - 6, R - L, 20, 0.9);
    p.text(L + 6, y, 'Domaine', { bold: true }); p.text(250, y, 'Appréciation', { bold: true }); p.text(390, y, 'Observation', { bold: true });
    y -= 22;
    const list = st.appreciations.length ? st.appreciations : r.domaines_prescolaire.map((d) => ({ domain: d, level: '', comment: '' }));
    for (const a of list.slice(0, 24)) {
      p.text(L + 6, y, a.domain, { size: 9.5 }); p.text(250, y, a.level || '..............', { size: 9.5, bold: true });
      p.text(390, y, String(a.comment || '').slice(0, 30), { size: 8.5, gray: 0.3 }); p.line(L, y - 6, R, y - 6, 0.4, 0.85); y -= 19;
    }
    y -= 6;
    p.text(L, y, `Échelle d'appréciation : ${r.appreciations.join(' / ')}. Préscolaire : pas de note chiffrée.`, { size: 8, gray: 0.35 });
    y -= 16;
  } else {
    p.rect(L, y - 6, R - L, 20, 0.9);
    p.text(L + 6, y, 'Matière', { bold: true }); p.text(270, y, 'Coef.', { bold: true });
    p.text(320, y, `Note /${r.echelle}`, { bold: true }); p.text(400, y, 'Points', { bold: true }); p.text(470, y, 'Maximum', { bold: true });
    y -= 22;
    for (const s of st.subjects.slice(0, 22)) {
      p.text(L + 6, y, s.name, { size: 9.5 }); p.text(275, y, String(s.coefficient), { size: 9.5 });
      p.text(325, y, f2(s.average), { size: 9.5, bold: true }); p.text(405, y, f2(s.points), { size: 9.5 }); p.text(475, y, f2(s.max), { size: 9.5 });
      p.line(L, y - 6, R, y - 6, 0.4, 0.85); y -= 19;
    }
    p.rect(L, y - 8, R - L, 24, 0.86);
    p.text(L + 6, y, 'Total des points', { bold: true }); p.text(405, y, f2(st.total_points), { bold: true }); p.text(475, y, f2(st.total_max), { bold: true });
    y -= 30;
    p.text(L, y, `Moyenne : ${f2(st.average)} / ${r.echelle}`, { size: 12, bold: true });
    if (r.rang) p.text(250, y, `Rang : ${ord(st.rank, st.ex_aequo)} sur ${data.stats.classes}`, { size: 11, bold: true });
    p.text(420, y, `Mention : ${st.mention || '-'}`, { size: 11, bold: true });
    y -= 16;
    p.text(L, y, `Moyenne de la classe : ${f2(data.stats.moyenne_classe)}  ·  plus forte : ${f2(data.stats.plus_forte)}  ·  plus faible : ${f2(data.stats.plus_faible)}`, { size: 8.5, gray: 0.3 });
    y -= 14;
    if (data.period.id === 'annuel') {
      p.text(L, y, st.period_averages.map((x) => `${x.name} : ${f2(x.average)}`).join('   ·   '), { size: 8.5, gray: 0.3 }); y -= 14;
    }
  }
  if (st.decision) {
    p.rect(L, y - 10, R - L, 26, 0.93);
    p.text(L + 6, y, `Décision de fin d'année : ${st.decision.label}`, { size: 11, bold: true });
    y -= 30;
  }
  // Signatures
  const sig = r.signatures, w = (R - L) / Math.max(1, sig.length);
  sig.forEach((s, i) => { const x = L + i * w; p.text(x, 150, s, { size: 9, bold: true }); p.line(x, 110, x + w - 20, 110, 0.5, 0.4); p.text(x, 98, 'Signature', { size: 7.5, gray: 0.45 }); });
  p.text(L, 130, 'Cachet de l’école', { size: 7.5, gray: 0.5 });
  p.line(L, 70, R, 70, 0.4, 0.8);
  p.text(L, 58, `Règles de l'école : passage ${r.moyenne_passage}/${r.echelle}, sous condition dès ${r.seuil_condition}. Exemplaire imprimé ; le bulletin vérifiable (QR) s'émet élève par élève.`, { size: 7, gray: 0.4 });
  p.text(L, 47, 'NORIA est un produit de Klirline Inc.', { size: 7, gray: 0.5 });
  return p;
}
function classPdf(data, school, onlyStudent) {
  const list = onlyStudent ? data.students.filter((s) => s.id === onlyStudent) : data.students;
  if (!list.length) throw new HttpError(409, 'aucun élève à imprimer');
  return buildDoc(list.map((s) => bulletinPage(data, s, school)), { title: `Bulletins ${data.class.name} - ${data.period.name}` });
}

/* ---------- routes ---------- */
const int = (v) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, 'identifiant invalide'); return x; };
async function classFor(db, u, id) {
  const sc = P.classScope(u);
  const c = await db.get(`SELECT c.id FROM class c WHERE c.id = ? AND ${sc.sql}`, id, ...sc.params);
  if (!c) notFound();
  return c;
}
const routes = [
  ['GET', /^\/api\/bulletins\/regles$/, async (db, _req, u) => {
    if (!P.has(u, 'direction', 'secretariat', 'enseignant')) forbid();
    return { rules: await loadRules(db, u.school_id), defaults: normalizeRules(null), can_edit: P.has(u, 'direction') };
  }],
  ['PUT', /^\/api\/bulletins\/regles$/, async (db, req, u, _m, ctx) => {
    if (!P.has(u, 'direction')) await refuse(ctx, u, 'bulletin.rules', 'school', u.school_id, null);
    const rules = req.body && req.body.reset ? null : normalizeRules(req.body && req.body.rules);
    await db.run('UPDATE school SET bulletin_rules = ? WHERE id = ?', rules ? JSON.stringify(rules) : null, u.school_id);
    await audit(db, u, 'bulletin.rules', 'school', u.school_id, rules ? `passage ${rules.moyenne_passage}/${rules.echelle}` : 'règles par défaut');
    return { rules: await loadRules(db, u.school_id) };
  }],
  ['GET', /^\/api\/bulletins\/classes\/(\d+)$/, async (db, req, u, [id]) => {
    if (!P.has(u, 'direction', 'secretariat', 'enseignant')) forbid();
    await classFor(db, u, int(id));
    return classBulletin(db, u.school_id, int(id), req.query.get('term_id'));
  }],
  ['GET', /^\/api\/bulletins\/classes\/(\d+)\/pdf$/, async (db, req, u, [id], ctx) => {
    if (!P.has(u, 'direction', 'secretariat')) await refuse(ctx, u, 'bulletin.print', 'class', id, null);
    await classFor(db, u, int(id));
    const data = await classBulletin(db, u.school_id, int(id), req.query.get('term_id'));
    const only = req.query.get('student_id') ? int(req.query.get('student_id')) : null;
    const pdf = classPdf(data, await schoolProfile(db, u.school_id), only);
    await audit(db, u, 'bulletin.print', 'class', id, `${data.period.name}${only ? ` élève ${only}` : ''}`);
    return { __pdf: pdf, filename: `bulletins-${data.class.name.replace(/[^\w-]+/g, '_')}-${data.period.id}.pdf` };
  }],
  // Préscolaire : appréciations d'un élève pour une période (direction ou enseignant de la classe).
  ['POST', /^\/api\/bulletins\/appreciations$/, async (db, req, u, _m, ctx) => {
    if (!P.has(u, 'direction', 'enseignant')) await refuse(ctx, u, 'bulletin.appreciation', 'student', req.body && req.body.student_id, null);
    const b = req.body || {};
    const sc = P.classScope(u);
    const st = await db.get(`SELECT e.student_id, c.id AS class_id, l.name, l.cycle FROM enrollment e JOIN class c ON c.id = e.class_id AND c.school_id = e.school_id
      JOIN level l ON l.id = c.level_id AND l.school_id = c.school_id
      WHERE e.student_id = ? AND e.school_id = ? AND e.status = 'actif' AND ${sc.sql}`, int(b.student_id), u.school_id, ...sc.params);
    if (!st) notFound();
    if (!isPrescolaire(st)) throw new HttpError(409, 'appréciations réservées au préscolaire (les autres niveaux ont des notes)');
    const term = await db.get('SELECT id FROM term WHERE id = ? AND school_id = ?', int(b.term_id), u.school_id); if (!term) notFound();
    const rules = await loadRules(db, u.school_id);
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 20) throw new HttpError(400, 'appréciations manquantes');
    const items = b.items.map((it) => {
      const domain = String(it && it.domain || '').trim(); const level = String(it && it.level || '').trim();
      if (!domain || domain.length > 80) throw new HttpError(400, 'domaine invalide');
      if (!rules.appreciations.includes(level)) throw new HttpError(400, `appréciation inconnue : ${level.slice(0, 40)}`);
      const comment = it.comment ? String(it.comment).trim().slice(0, 300) : null;
      return { domain, level, comment };
    });
    await db.tx(async (t) => {
      for (const it of items) {
        const ex = await t.get('SELECT id FROM bulletin_appreciation WHERE school_id = ? AND student_id = ? AND term_id = ? AND domain = ?', u.school_id, st.student_id, term.id, it.domain);
        if (ex) await t.run('UPDATE bulletin_appreciation SET level = ?, comment = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', it.level, it.comment, u.id, ex.id, u.school_id);
        else await t.insert('INSERT INTO bulletin_appreciation (school_id, student_id, term_id, domain, level, comment, updated_by) VALUES (?,?,?,?,?,?,?)', u.school_id, st.student_id, term.id, it.domain, it.level, it.comment, u.id);
      }
      await audit(t, u, 'bulletin.appreciation', 'student', st.student_id, `${items.length} domaine(s), période ${term.id}`);
    });
    return { ok: true, count: items.length };
  }],
];

module.exports = { routes, DEFAULT_RULES, normalizeRules, loadRules, mentionFor, decisionFor, rankList, annualAverage, classBulletin, classPdf, isPrescolaire };
