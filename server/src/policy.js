'use strict';
// Périmètres imposés par le serveur, traduits en SQL. Chaque requête filtre d'abord school_id = école de la session.

const has = (u, ...roles) => roles.some((r) => u.roles.includes(r));

// Renvoie une clause SQL (et ses paramètres) limitant les élèves visibles pour un « dossier ».
function studentScope(u, alias = 'st') {
  const base = { sql: `${alias}.school_id = ?`, params: [u.school_id] };
  if (has(u, 'direction', 'secretariat')) return base;
  const parts = [];
  const params = [];
  if (has(u, 'enseignant')) {
    parts.push(`${alias}.id IN (SELECT e.student_id FROM enrollment e
      JOIN teacher_assignment ta ON ta.class_id = e.class_id AND ta.school_id = e.school_id
      WHERE e.status = 'actif' AND ta.teacher_user_id = ? AND e.school_id = ?)`);
    params.push(u.id, u.school_id);
  }
  if (has(u, 'parent')) {
    parts.push(`${alias}.id IN (SELECT pl.student_id FROM parent_link pl WHERE pl.parent_user_id = ? AND pl.school_id = ?)`);
    params.push(u.id, u.school_id);
  }
  if (has(u, 'eleve')) { parts.push(`${alias}.user_id = ?`); params.push(u.id); }
  if (!parts.length) return { sql: '0', params: [] };
  return { sql: `${base.sql} AND (${parts.join(' OR ')})`, params: [...base.params, ...params] };
}

// Champs du dossier selon le rôle (l'enseignant n'a que les champs utiles).
function studentFields(u) {
  if (has(u, 'direction', 'secretariat')) return ['id', 'code', 'first_name', 'last_name', 'birth_date', 'health_notes', 'family_notes'];
  if (has(u, 'enseignant')) return ['id', 'code', 'first_name', 'last_name'];
  return ['id', 'code', 'first_name', 'last_name', 'birth_date'];
}

const can = {
  readStudents: (u) => has(u, 'direction', 'secretariat', 'enseignant', 'parent', 'eleve'),
  editStudent: (u) => has(u, 'direction', 'secretariat'),
  readLoanIdentity: (u) => has(u, 'direction', 'secretariat', 'enseignant', 'bibliotheque'),
  readFinance: (u) => has(u, 'direction', 'comptabilite', 'parent'),
  exportStudents: (u) => has(u, 'direction', 'secretariat', 'enseignant'),
  exportFinance: (u) => has(u, 'comptabilite', 'direction'),
  manageRoles: (u) => has(u, 'direction'),
  readAudit: (u) => has(u, 'direction'),
  readClass: (u) => has(u, 'direction', 'secretariat', 'enseignant', 'bibliotheque'),
};

// Périmètre financier : comptabilité et direction = toute l'école ; parent = ses enfants.
function financeScope(u, alias = 'st') {
  if (has(u, 'direction', 'comptabilite')) return { sql: `${alias}.school_id = ?`, params: [u.school_id] };
  if (has(u, 'parent')) return {
    sql: `${alias}.school_id = ? AND ${alias}.id IN (SELECT student_id FROM parent_link WHERE parent_user_id = ? AND school_id = ?)`,
    params: [u.school_id, u.id, u.school_id],
  };
  return { sql: '0', params: [] };
}

function classScope(u, alias = 'c') {
  if (has(u, 'direction', 'secretariat', 'bibliotheque')) return { sql: `${alias}.school_id = ?`, params: [u.school_id] };
  if (has(u, 'enseignant')) return {
    sql: `${alias}.school_id = ? AND ${alias}.id IN (SELECT class_id FROM teacher_assignment WHERE teacher_user_id = ? AND school_id = ?)`,
    params: [u.school_id, u.id, u.school_id],
  };
  return { sql: '0', params: [] };
}

module.exports = { has, can, studentScope, studentFields, financeScope, classScope };
