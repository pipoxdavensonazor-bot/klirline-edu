'use strict';
// Données 100 % fictives. Aucun nom, code ou montant ne correspond à une personne réelle.
const { hashPassword } = require('./auth');

const DEMO_PASSWORD = 'demo-fictif-2026';

async function seed(db) {
  const pw = await hashPassword(DEMO_PASSWORD);
  const ids = {};
  let t;
  const ins = (sql, ...p) => t.insert(sql, ...p);
  const link = (sql, ...p) => t.run(sql, ...p);
  await db.tx(async (tx) => {
    t = tx;
    for (const key of ['A', 'B']) {
      const s = await ins('INSERT INTO school (slug, name) VALUES (?,?)', `ecole-${key.toLowerCase()}`, `École fictive ${key}`);
      const campus = await ins('INSERT INTO campus (school_id, name) VALUES (?,?)', s, 'Campus principal (fictif)');
      const year = await ins('INSERT INTO school_year (school_id, label, is_current) VALUES (?,?,1)', s, '2026-2027');
      const level = await ins('INSERT INTO level (school_id, name) VALUES (?,?)', s, '7e année fondamentale');
      const c1 = await ins('INSERT INTO class (school_id, name, school_year_id, level_id, campus_id) VALUES (?,?,?,?,?)', s, '7e A', year, level, campus);
      const c2 = await ins('INSERT INTO class (school_id, name, school_year_id, level_id, campus_id) VALUES (?,?,?,?,?)', s, '7e B', year, level, campus);
      // Trois trimestres fictifs 2026-2027 (dates indicatives).
      const terms = [];
      for (const [i, n, a, b] of [[1, 'Trimestre 1', '2026-09-01', '2026-12-18'], [2, 'Trimestre 2', '2027-01-05', '2027-03-26'], [3, 'Trimestre 3', '2027-04-05', '2027-06-25']])
        terms.push(await ins('INSERT INTO term (school_id, school_year_id, name, position, starts_on, ends_on) VALUES (?,?,?,?,?,?)', s, year, n, i, a, b));
      const subjFr = await ins('INSERT INTO subject (school_id, name, school_year_id, coefficient) VALUES (?,?,?,?)', s, 'Français', year, 2);
      const subjSc = await ins('INSERT INTO subject (school_id, name, school_year_id, coefficient) VALUES (?,?,?,?)', s, 'Sciences expérimentales', year, 1);
      const subj = await ins('INSERT INTO subject (school_id, name, school_year_id, coefficient) VALUES (?,?,?,?)', s, 'Mathématiques', year, 2);
      let tel = key === 'A' ? 50900000100 : 50900000200;
      const user = async (handle, name, roles) => {
        // Numéros fictifs (préfixe 00 inexistant en Haïti).
        const id = await ins('INSERT INTO app_user (school_id, email, phone, display_name, password_hash) VALUES (?,?,?,?,?)',
          s, `${handle}@${key.toLowerCase()}.exemple.invalid`, `+${++tel}`, name, pw);
        for (const r of roles) await link('INSERT INTO user_role (school_id, user_id, role) VALUES (?,?,?)', s, id, r);
        return id;
      };
      const u = {
        direction: await user('direction', `Direction fictive ${key}`, ['direction']),
        secretariat: await user('secretariat', `Secrétariat fictif ${key}`, ['secretariat']),
        prof1: await user('prof1', `Enseignant fictif 1 ${key}`, ['enseignant']),
        prof2: await user('prof2', `Enseignant fictif 2 ${key}`, ['enseignant']),
        compta: await user('compta', `Comptabilité fictive ${key}`, ['comptabilite']),
        biblio: await user('biblio', `Bibliothèque fictive ${key}`, ['bibliotheque']),
        parent1: await user('parent1', `Parent fictif 1 ${key}`, ['parent']),
        parent2: await user('parent2', `Parent fictif 2 ${key}`, ['parent']),
        eleve1: await user('eleve1', `Élève fictif 1 ${key}`, ['eleve']),
      };
      await ins('INSERT INTO teacher_assignment (school_id, teacher_user_id, class_id, subject_id) VALUES (?,?,?,?)', s, u.prof1, c1, subj);
      await ins('INSERT INTO teacher_assignment (school_id, teacher_user_id, class_id, subject_id) VALUES (?,?,?,?)', s, u.prof1, c1, subjFr);
      await ins('INSERT INTO teacher_assignment (school_id, teacher_user_id, class_id, subject_id) VALUES (?,?,?,?)', s, u.prof2, c2, subj);
      const stu = async (code, fn, userId, cls) => {
        const id = await ins(`INSERT INTO student (school_id, user_id, code, first_name, last_name, birth_date, health_notes, family_notes)
          VALUES (?,?,?,?,?,?,?,?)`, s, userId, code, fn, `Fictif${key}`, '2014-01-01', 'Note santé fictive', 'Note famille fictive');
        await ins('INSERT INTO enrollment (school_id, student_id, class_id, reason) VALUES (?,?,?,?)', s, id, cls, 'Inscription de démonstration');
        await ins('INSERT INTO finance_entry (school_id, student_id, label, amount_cents) VALUES (?,?,?,?)', s, id, 'Frais fictifs', 100000);
        return id;
      };
      const st1 = await stu(`${key}-001`, 'Ana', u.eleve1, c1);
      const st2 = await stu(`${key}-002`, 'Bèl', null, c2);
      await link('INSERT INTO parent_link (school_id, parent_user_id, student_id, reason) VALUES (?,?,?,?)', s, u.parent1, st1, 'Lien de démonstration');
      await link('INSERT INTO parent_link (school_id, parent_user_id, student_id, reason) VALUES (?,?,?,?)', s, u.parent2, st2, 'Lien de démonstration');
      ids[key] = { school: s, classes: [c1, c2], students: [st1, st2], users: u, terms, subjects: { maths: subj, francais: subjFr, sciences: subjSc } };
    }
  });
  return ids;
}

module.exports = { seed, DEMO_PASSWORD };
