'use strict';
// Données 100 % fictives. Aucun nom, code ou montant ne correspond à une personne réelle.
const { hashPassword } = require('./auth');
const { attachPersons } = require('./identite');

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
      // Profil d'école fictif (en-têtes PDF, invitations, accueil).
      const s = await ins('INSERT INTO school (slug, name, initials, address, email, phone, motto) VALUES (?,?,?,?,?,?,?)', `ecole-${key.toLowerCase()}`, `École fictive ${key}`,
        `EF${key}`, `${key === 'A' ? '12' : '48'}, rue Fictive, Port-au-Prince (adresse fictive)`, `contact@${key.toLowerCase()}.exemple.invalid`, key === 'A' ? '+50900000199' : '+50900000299',
        key === 'A' ? 'Travail, discipline, réussite' : 'Konesans se richès');
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
        await link('INSERT INTO student_code (code, school_id) VALUES (?,?)', code, s);
        await ins('INSERT INTO enrollment (school_id, student_id, class_id, reason) VALUES (?,?,?,?)', s, id, cls, 'Inscription de démonstration');
        await ins('INSERT INTO finance_entry (school_id, student_id, label, amount_cents) VALUES (?,?,?,?)', s, id, 'Frais fictifs', 100000);
        return id;
      };
      const st1 = await stu(`${key}-001`, 'Ana', u.eleve1, c1);
      const st2 = await stu(`${key}-002`, 'Bèl', null, c2);
      await link('INSERT INTO parent_link (school_id, parent_user_id, student_id, reason) VALUES (?,?,?,?)', s, u.parent1, st1, 'Lien de démonstration');
      await link('INSERT INTO parent_link (school_id, parent_user_id, student_id, reason) VALUES (?,?,?,?)', s, u.parent2, st2, 'Lien de démonstration');
      // Catalogue fictif de la bibliothèque (titres inventés).
      const books = [];
      for (const [ti, au, isbn, n] of [['Contes du lakou (fictif)', 'Auteur fictif 1', null, 3], ['Kreyòl pou timoun (fictif)', 'Otè fiktif 2', '9780306406157', 2], ['Atlas scolaire (fictif)', 'Auteur fictif 3', null, 1]])
        books.push(await ins('INSERT INTO book (school_id, title, author, isbn, copies, created_by) VALUES (?,?,?,?,?,?)', s, ti, au, isbn, n, u.direction));
      ids[key] = { books, school: s, classes: [c1, c2], students: [st1, st2], users: u, terms, subjects: { maths: subj, francais: subjFr, sciences: subjSc } };
    }
    // Identité globale : une personne par compte (migration 009).
    await attachPersons(tx);
  });
  return ids;
}

// Démonstration multi-écoles (NORIA_DEMO=1 et tests) : l'enseignant 1 de A enseigne aussi en B ; le parent 1 de A est
// aussi parent d'un élève de B. Mêmes identités (personne), une adhésion par école.
async function seedMulti(db, ids) {
  await db.tx(async (t) => {
    const B = ids.B.school;
    for (const [handle, role] of [['prof1', 'enseignant'], ['parent1', 'parent']]) {
      const src = await t.get('SELECT person_id, display_name FROM app_user WHERE id = ?', ids.A.users[handle]);
      const id = await t.insert('INSERT INTO app_user (school_id, email, phone, display_name, person_id) VALUES (?,?,?,?,?)',
        B, `${handle}@a.exemple.invalid`, null, src.display_name, src.person_id);
      await t.run('INSERT INTO user_role (school_id, user_id, role) VALUES (?,?,?)', B, id, role);
      ids.B.users[`${handle}A`] = id;
      if (role === 'enseignant') await t.insert('INSERT INTO teacher_assignment (school_id, teacher_user_id, class_id, subject_id) VALUES (?,?,?,?)', B, id, ids.B.classes[1], ids.B.subjects.maths);
      else await t.run('INSERT INTO parent_link (school_id, parent_user_id, student_id, reason) VALUES (?,?,?,?)', B, id, ids.B.students[1], 'Lien de démonstration (multi-écoles)');
    }
  });
  return ids;
}

// Portail public de démonstration (NORIA_DEMO=1) : contenus 100 % fictifs, déjà publiés, dates relatives au jour.
// Les contenus « de la plateforme » portent created_by_admin = 0 (aucun compte super-admin en démonstration).
async function seedPortal(db, ids) {
  const day = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const y = new Date().getFullYear();
  const A = ids.A.school, B = ids.B.school;
  await db.tx(async (t) => {
    const item = (o) => { const k = Object.keys(o); return t.insert(`INSERT INTO portal_item (${k.join(', ')}, status, published_at) VALUES (${k.map(() => '?').join(',')}, 'publie', ?)`, ...k.map((x) => o[x]), now); };
    await item({ kind: 'evenement', created_by_admin: 0, category: 'examens', event_date: day(12), event_end: day(15), place: 'Centres d’examen du pays (fictif)', department: null,
      title_fr: 'Examens officiels de 9e année fondamentale (exemple fictif)', title_ht: 'Egzamen ofisyèl 9yèm ane fondamantal (egzanp fiktif)',
      body_fr: 'Calendrier indicatif et entièrement fictif, pour la démonstration du portail.\n\nVérifiez toujours les dates auprès des autorités compétentes.',
      body_ht: 'Kalandriye sa a fiktif nèt, se pou demonstrasyon pòtay la sèlman.\n\nToujou verifye dat yo kote otorite yo.' });
    await item({ kind: 'evenement', school_id: A, created_by: ids.A.users.direction, category: 'culture', event_date: day(5), place: 'Cour de l’École fictive A, Port-au-Prince', department: 'ouest',
      title_fr: 'Journée du créole à l’École fictive A', title_ht: 'Jounen kreyòl nan Lekòl fiktif A', body_fr: 'Contes, chants et poésie présentés par les élèves (événement fictif).', body_ht: 'Kont, chante ak powezi elèv yo ap prezante (evènman fiktif).' });
    await item({ kind: 'evenement', school_id: B, created_by: ids.B.users.direction, category: 'sport', event_date: day(21), place: 'Terrain municipal (fictif), Cap-Haïtien', department: 'nord',
      title_fr: 'Tournoi interscolaire de football (fictif)', title_ht: 'Tounwa foutbòl ant lekòl (fiktif)', body_fr: 'Rencontre amicale entre écoles partenaires.' });
    await item({ kind: 'evenement', created_by_admin: 0, category: 'concours', event_date: day(-20), place: 'En ligne (fictif)',
      title_fr: 'Concours national d’orthographe (édition passée, fictive)', title_ht: 'Konkou nasyonal òtograf (edisyon ki pase, fiktif)' });
    const L = [['Anne-Marie Exemple', 'Excellent', 0, 0, 0, 'ouest', A], ['Jean Fictif', 'Très bien', 1, 1, 1, 'ouest', A], ['Rose Démonstration', 'Bien', 1, 0, 0, 'nord', B], ['Paul Modèle', 'Très bien', 0, 0, 0, 'nord', B]];
    for (const [n, m, minor, cs, cp, dep, sch] of L) {
      await item({ kind: 'laureat', school_id: sch, created_by: sch === A ? ids.A.users.direction : ids.B.users.direction, person_name: n, mention: m, year: y, exam: 'Examens officiels de 9e AF (fictif)', exam_type: 'examen',
        department: dep, school_name: sch === A ? 'École fictive A' : 'École fictive B', minor, consent_school: cs, consent_parent: cp,
        consent_parent_name: cp ? 'Parent fictif' : null, consent_at: cp ? now : null, consent_by: cp ? 'démonstration' : null, featured: 1 });
    }
    await item({ kind: 'laureat', created_by_admin: 0, person_name: 'Claire Imaginaire', mention: 'Lauréate', year: y - 1, exam: 'Concours d’entrée (fictif)', exam_type: 'concours', department: 'sud', minor: 0 });
    await item({ kind: 'temoignage', school_id: A, created_by: ids.A.users.direction, author: 'Direction de l’École fictive A',
      title_fr: 'Les absences signalées le jour même aux parents', title_ht: 'Paran yo konnen absans yo menm jou a',
      body_fr: 'Depuis que les présences sont saisies sur téléphone, les parents sont prévenus le jour même. Témoignage fictif pour la démonstration.',
      body_ht: 'Depi pwofesè yo antre prezans yo sou telefòn, paran yo resevwa nouvèl la menm jou a. Temwayaj fiktif pou demonstrasyon.' });
    await item({ kind: 'article', school_id: B, created_by: ids.B.users.direction, author: 'Équipe pédagogique (fictive)',
      title_fr: 'Une bibliothèque de classe en kreyòl', body_fr: 'Les élèves de 7e ont réuni une trentaine de livres en kreyòl et en français. Article fictif.' });
    await t.insert(`INSERT INTO portal_ad (sponsored, sponsor, title_fr, title_ht, text_fr, text_ht, url, starts_on, ends_on, created_by_admin) VALUES (1,?,?,?,?,?,?,?,?,0)`,
      'Librairie fictive', 'Fournitures scolaires à prix réduit (exemple)', 'Founiti lekòl pi bon mache (egzanp)', 'Encart de démonstration : aucun produit réel.', 'Espas demonstrasyon : pa gen pwodui reyèl.',
      'https://example.org/', day(-3), day(30));
    await t.insert(`INSERT INTO portal_ad (sponsored, title_fr, title_ht, text_fr, starts_on, ends_on, created_by_admin) VALUES (0,?,?,?,?,?,0)`,
      'Inscriptions ouvertes pour les écoles partenaires', 'Enskripsyon louvri pou lekòl patnè yo', 'Les écoles qui souhaitent rejoindre NORIA peuvent écrire à l’équipe (annonce fictive).', day(-1), day(60));
    await t.insert(`INSERT INTO portal_ad (sponsored, sponsor, title_fr, starts_on, ends_on, created_by_admin) VALUES (1,?,?,?,?,0)`, 'Annonceur expiré (fictif)', 'Encart terminé : ne doit pas apparaître', day(-30), day(-2));
    await t.run('UPDATE school SET portal_partner = 1, portal_partner_at = ? WHERE id IN (?,?)', now, A, B);
  });
}

// Portail du ministère (bloc 6, NORIA_DEMO=1 et NORIA_MINISTERE=1) : localisation des écoles, effectifs plus fournis
// (sexe, décisions de fin d'année), cinq écoles fictives de plus dans d'autres départements, déclarations déjà
// envoyées par certaines, et un compte du ministère fictif. Tout est inventé.
const FIRST = { F: ['Ana', 'Bèl', 'Carline', 'Dieula', 'Esther', 'Fabiola', 'Guerline', 'Islande', 'Judith', 'Kettia', 'Lovely', 'Mirlande', 'Nadège', 'Olivia', 'Rose'],
  M: ['Alix', 'Berto', 'Claude', 'Davidson', 'Emmanuel', 'Frantz', 'Guerby', 'Herby', 'Jameson', 'Kervens', 'Lesly', 'Mackenson', 'Ricardo', 'Stevenson', 'Wilner'] };
const LAST = ['Fictif', 'Exemple', 'Modèle', 'Démo', 'Imaginaire', 'Inventé', 'Essai', 'Maquette'];
async function seedMinistere(db, ids) {
  const year = '2026-2027';
  const { sendDeclaration } = require('./ministere');
  const out = { schools: [] };
  // Générateur déterministe (mêmes données à chaque démarrage).
  let seedN = 7; const rnd = () => { seedN = (seedN * 1103515245 + 12345) % 2147483648; return seedN / 2147483648; };
  const decisionOf = (p) => (rnd() < p ? 'admis' : rnd() < 0.7 ? 'redouble' : 'echec');
  await db.tx(async (t) => {
    await t.run('UPDATE school SET department = ?, commune = ? WHERE id = ?', 'ouest', 'Port-au-Prince', ids.A.school);
    await t.run('UPDATE school SET department = ?, commune = ? WHERE id = ?', 'nord', 'Cap-Haïtien', ids.B.school);
    await t.run("UPDATE student SET sex = 'F' WHERE school_id IN (?,?) AND sex IS NULL", ids.A.school, ids.B.school);
    const fill = async (sid, prefix, classes, yearId, director, n, p) => {
      let k = 0;
      for (const cls of classes) {
        for (let i = 0; i < n + Math.floor(rnd() * 6); i++) {
          const sex = rnd() < 0.52 ? 'F' : 'M'; k++;
          const code = `${prefix}-${String(100 + k).padStart(3, '0')}`;
          const stid = await t.insert('INSERT INTO student (school_id, code, first_name, last_name, birth_date, sex) VALUES (?,?,?,?,?,?)', sid, code,
            FIRST[sex][Math.floor(rnd() * FIRST[sex].length)], `${LAST[Math.floor(rnd() * LAST.length)]}`, `20${10 + Math.floor(rnd() * 5)}-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}`, sex);
          await t.run('INSERT INTO student_code (code, school_id) VALUES (?,?)', code, sid);
          await t.insert('INSERT INTO enrollment (school_id, student_id, class_id, reason) VALUES (?,?,?,?)', sid, stid, cls, 'Inscription de démonstration');
          if (rnd() < 0.93) await t.insert('INSERT INTO year_decision (school_id, student_id, school_year_id, decision, decided_by) VALUES (?,?,?,?,?)', sid, stid, yearId, decisionOf(p), director);
        }
      }
    };
    for (const key of ['A', 'B']) {
      const sid = ids[key].school;
      const y = await t.get('SELECT id FROM school_year WHERE school_id = ? AND is_current = 1', sid);
      await fill(sid, `${key}M`, ids[key].classes, y.id, ids[key].users.direction, key === 'A' ? 16 : 12, key === 'A' ? 0.82 : 0.71);
    }
    const EXTRA = [
      ['lycee-fictif-jacmel', 'Lycée fictif de Jacmel', 'LFJ', 'sud-est', 'Jacmel', 'JAC', ['9e A', '9e B', 'NS1'], 18, 0.76],
      ['college-fictif-gonaives', 'Collège fictif des Gonaïves', 'CFG', 'artibonite', 'Gonaïves', 'GON', ['7e A', '8e A', '9e A'], 20, 0.68],
      ['ecole-fictive-hinche', 'École nationale fictive de Hinche', 'ENH', 'centre', 'Hinche', 'HIN', ['1re AF', '2e AF', '3e AF', '4e AF'], 22, 0.88],
      ['institution-fictive-cayes', 'Institution fictive des Cayes', 'IFC', 'sud', 'Les Cayes', 'CAY', ['7e A', '7e B'], 17, 0.79],
      ['ecole-fictive-petionville', 'École fictive de Pétion-Ville', 'EPV', 'ouest', 'Pétion-Ville', 'PEV', ['5e AF', '6e AF'], 21, 0.9],
    ];
    const pw = null;
    for (const [slug, name, ini, dep, com, prefix, classNames, n, p] of EXTRA) {
      const sid = await t.insert('INSERT INTO school (slug, name, initials, address, email, phone, department, commune) VALUES (?,?,?,?,?,?,?,?)', slug, name, ini,
        `Rue fictive, ${com} (adresse fictive)`, `contact@${slug}.exemple.invalid`, null, dep, com);
      const campus = await t.insert('INSERT INTO campus (school_id, name) VALUES (?,?)', sid, 'Campus principal (fictif)');
      const y = await t.insert('INSERT INTO school_year (school_id, label, is_current) VALUES (?,?,1)', sid, year);
      const lv = await t.insert('INSERT INTO level (school_id, name) VALUES (?,?)', sid, 'Fondamental');
      const cls = [];
      for (const c of classNames) cls.push(await t.insert('INSERT INTO class (school_id, name, school_year_id, level_id, campus_id) VALUES (?,?,?,?,?)', sid, c, y, lv, campus));
      const staff = [['direction', `Direction fictive ${ini}`, 'direction'], ['secretariat', `Secrétariat fictif ${ini}`, 'secretariat']];
      for (let i = 1; i <= classNames.length + 1; i++) staff.push([`prof${i}`, `Enseignant fictif ${i} ${ini}`, 'enseignant']);
      let dir = null;
      for (const [h, dn, role] of staff) {
        const uid = await t.insert('INSERT INTO app_user (school_id, email, display_name, password_hash) VALUES (?,?,?,?)', sid, `${h}@${slug}.exemple.invalid`, dn, pw);
        await t.run('INSERT INTO user_role (school_id, user_id, role) VALUES (?,?,?)', sid, uid, role);
        if (role === 'direction') dir = { id: uid, school_id: sid, display_name: dn };
      }
      await fill(sid, prefix, cls, y, dir.id, n, p);
      out.schools.push({ sid, dir, year: { id: y, label: year } });
    }
    await t.insert("INSERT INTO ministry_account (email, phone, display_name, title, created_by_admin) VALUES (?,?,?,?,0)",
      'inspection@ministere.exemple.invalid', '+50900000900', 'Inspection fictive (MENFP)', 'Direction départementale (fictive)');
  });
  // Déclarations déjà envoyées par trois des écoles ajoutées (signées comme une vraie), l'une déjà reçue.
  for (const [i, x] of out.schools.entries()) {
    if (i > 2) break;
    const r = await db.tx((t) => sendDeclaration(t, db, x.dir, x.year));
    if (i === 0) await db.tx(async (t) => {
      const acc = await t.get("SELECT id FROM ministry_account WHERE email = 'inspection@ministere.exemple.invalid'");
      await t.run("UPDATE annual_declaration SET status = 'recue', ministry_by = ?, ministry_at = ?, ministry_note = ? WHERE id = ?", acc.id, new Date().toISOString(), 'Dossier complet, merci.', r.id);
      await t.run("INSERT INTO declaration_event (declaration_id, school_id, kind, actor, ministry_account_id, note) VALUES (?,?,?,?,?,?)", r.id, x.sid, 'accuse', 'ministere', acc.id, 'Dossier complet, merci.');
    });
  }
  return out;
}

module.exports = { seed, seedMulti, seedPortal, seedMinistere, DEMO_PASSWORD };
