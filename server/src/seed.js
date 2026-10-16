'use strict';
// Données 100 % fictives. Aucun nom, code ou montant ne correspond à une personne réelle.
const { hashPassword } = require('./auth');

const DEMO_PASSWORD = 'demo-fictif-2026';

async function seed(db) {
  const pw = await hashPassword(DEMO_PASSWORD);
  const ids = {};
  const ins = (sql, ...p) => db.prepare(sql).run(...p).lastInsertRowid;
  db.transaction(() => {
    for (const key of ['A', 'B']) {
      const s = ins('INSERT INTO school (slug, name) VALUES (?,?)', `ecole-${key.toLowerCase()}`, `École fictive ${key}`);
      const campus = ins('INSERT INTO campus (school_id, name) VALUES (?,?)', s, 'Campus principal (fictif)');
      const year = ins('INSERT INTO school_year (school_id, label, is_current) VALUES (?,?,1)', s, '2026-2027');
      const level = ins('INSERT INTO level (school_id, name) VALUES (?,?)', s, '7e année fondamentale');
      const c1 = ins('INSERT INTO class (school_id, name, school_year_id, level_id, campus_id) VALUES (?,?,?,?,?)', s, '7e A', year, level, campus);
      const c2 = ins('INSERT INTO class (school_id, name, school_year_id, level_id, campus_id) VALUES (?,?,?,?,?)', s, '7e B', year, level, campus);
      const subj = ins('INSERT INTO subject (school_id, name, school_year_id, coefficient) VALUES (?,?,?,?)', s, 'Mathématiques', year, 2);
      const user = (handle, name, roles) => {
        const id = ins('INSERT INTO app_user (school_id, email, display_name, password_hash) VALUES (?,?,?,?)',
          s, `${handle}@${key.toLowerCase()}.exemple.invalid`, name, pw);
        for (const r of roles) ins('INSERT INTO user_role (school_id, user_id, role) VALUES (?,?,?)', s, id, r);
        return id;
      };
      const u = {
        direction: user('direction', `Direction fictive ${key}`, ['direction']),
        secretariat: user('secretariat', `Secrétariat fictif ${key}`, ['secretariat']),
        prof1: user('prof1', `Enseignant fictif 1 ${key}`, ['enseignant']),
        prof2: user('prof2', `Enseignant fictif 2 ${key}`, ['enseignant']),
        compta: user('compta', `Comptabilité fictive ${key}`, ['comptabilite']),
        biblio: user('biblio', `Bibliothèque fictive ${key}`, ['bibliotheque']),
        parent1: user('parent1', `Parent fictif 1 ${key}`, ['parent']),
        parent2: user('parent2', `Parent fictif 2 ${key}`, ['parent']),
        eleve1: user('eleve1', `Élève fictif 1 ${key}`, ['eleve']),
      };
      ins('INSERT INTO teacher_assignment (school_id, teacher_user_id, class_id, subject_id) VALUES (?,?,?,?)', s, u.prof1, c1, subj);
      ins('INSERT INTO teacher_assignment (school_id, teacher_user_id, class_id, subject_id) VALUES (?,?,?,?)', s, u.prof2, c2, subj);
      const stu = (code, fn, userId, cls) => {
        const id = ins(`INSERT INTO student (school_id, user_id, code, first_name, last_name, birth_date, health_notes, family_notes)
          VALUES (?,?,?,?,?,?,?,?)`, s, userId, code, fn, `Fictif${key}`, '2014-01-01', 'Note santé fictive', 'Note famille fictive');
        ins('INSERT INTO enrollment (school_id, student_id, class_id, reason) VALUES (?,?,?,?)', s, id, cls, 'Inscription de démonstration');
        ins('INSERT INTO finance_entry (school_id, student_id, label, amount_cents) VALUES (?,?,?,?)', s, id, 'Frais fictifs', 100000);
        return id;
      };
      const st1 = stu(`${key}-001`, 'Ana', u.eleve1, c1);
      const st2 = stu(`${key}-002`, 'Bèl', null, c2);
      ins('INSERT INTO parent_link (school_id, parent_user_id, student_id, reason) VALUES (?,?,?,?)', s, u.parent1, st1, 'Lien de démonstration');
      ins('INSERT INTO parent_link (school_id, parent_user_id, student_id, reason) VALUES (?,?,?,?)', s, u.parent2, st2, 'Lien de démonstration');
      ids[key] = { school: s, classes: [c1, c2], students: [st1, st2], users: u };
    }
  })();
  return ids;
}

module.exports = { seed, DEMO_PASSWORD };
