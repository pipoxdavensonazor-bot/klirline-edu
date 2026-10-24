'use strict';
// Socle multi-écoles : profil de l'école (en-têtes PDF, invitations, accueil), import des élèves (.xlsx, .csv),
// adhésions d'une même personne à plusieurs écoles (choix et changement d'école active), enfants d'un parent.
// Routes « system » : la connexion système est utilisée, mais seulement pour la personne connectée (ses adhésions) ;
// toute lecture de données d'une école passe ensuite par db.asSchool(école) — RLS en PostgreSQL.
const P = require('./policy');
const { HttpError, forbid, notFound, audit, refuse } = require('./common');
const I = require('./identite');
const { activeClass } = require('./structure');
const X = require('./xlsx');
const auth = require('./auth');

const MAX_FILE = 600 * 1024;
const MAX_ROWS = 2000;
const str = (v, max, label) => {
  const s = String(v ?? '').trim();
  if (s.length > max) throw new HttpError(400, `${label} : ${max} caractères au plus`);
  return s || null;
};
const int = (v) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, 'identifiant invalide'); return x; };
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const DEPARTMENTS = ['artibonite', 'centre', 'grand-anse', 'nippes', 'nord', 'nord-est', 'nord-ouest', 'ouest', 'sud', 'sud-est'];
function publicProfile(s) {
  return { id: s.id, slug: s.slug, name: s.name, initials: s.initials, address: s.address, email: s.email, phone: s.phone, motto: s.motto,
    department: s.department || null, commune: s.commune || null,
    logo: s.logo ? `/api/ecoles/${encodeURIComponent(s.slug)}/logo?v=${encodeURIComponent(s.logo_updated_at || '1')}` : null };
}

/* ---------- Import ---------- */
// Colonnes reconnues (en-têtes FR, HT ou clés techniques ; accents, casse et texte entre parenthèses ignorés).
const COLUMNS = [
  { key: 'last_name', required: true, fr: 'Nom', ht: 'Non', alias: ['nom', 'non', 'nomdefamille', 'lastname', 'siyati'] },
  { key: 'first_name', required: true, fr: 'Prénom', ht: 'Prenon', alias: ['prenom', 'prenon', 'firstname', 'nonbatem'] },
  { key: 'birth_date', required: true, fr: 'Date de naissance (AAAA-MM-JJ)', ht: 'Dat nesans', alias: ['datedenaissance', 'datenaissance', 'naissance', 'datnesans', 'birthdate', 'datedenaissanceaaaammjj'] },
  { key: 'sex', required: true, fr: 'Sexe (F ou M)', ht: 'Sèks', alias: ['sexe', 'seks', 'sex', 'sexefoum'] },
  { key: 'class', required: true, fr: 'Classe', ht: 'Klas', alias: ['classe', 'klas', 'class'] },
  { key: 'parent_name', required: false, fr: 'Parent (nom complet)', ht: 'Paran', alias: ['parent', 'paran', 'nomduparent', 'parentnomcomplet', 'parentnom'] },
  { key: 'parent_phone', required: false, fr: 'Téléphone du parent', ht: 'Telefòn paran', alias: ['telephoneduparent', 'telephoneparent', 'telefonparan', 'parenttelephone', 'telephone', 'telefon'] },
  { key: 'parent_email', required: false, fr: 'E-mail du parent', ht: 'Imèl paran', alias: ['emailduparent', 'emailparent', 'imelparan', 'parentemail', 'email', 'imel', 'courriel'] },
];
const normHead = (h) => I.strip(String(h || '').split('/')[0].replace(/\(.*?\)|\*/g, '')).toLowerCase().replace(/[^a-z0-9]/g, '');

function templateXlsx() {
  return X.writeXlsx({
    sheetName: 'Eleves',
    columns: COLUMNS.map((c) => ({ title: `${c.fr} / ${c.ht}${c.required ? ' *' : ''}`, required: c.required, width: c.key === 'birth_date' ? 30 : 22 })),
    rows: [['Fils-Aimé', 'Ana', '2012-03-05', 'F', '7e A', 'Marie Fils-Aimé', '+509 3700 0000', 'parent@exemple.invalid']],
    notes: [
      'Colonnes en rouge (*) : obligatoires. Kolòn ki an wouj (*) yo obligatwa.',
      'Supprimez la ligne d’exemple avant l’import. Efase liy egzanp lan anvan ou enpòte.',
      'Date : AAAA-MM-JJ ou JJ/MM/AAAA. Sexe : F ou M. Classe : nom exact de la classe dans NORIA.',
      'Le code élève est créé par NORIA (ex. AF120305-CSP). Pa mete kòd elèv la : NORIA kreye l.',
    ],
  });
}

function parseFile(filename, content) {
  const name = String(filename || '').toLowerCase();
  const s = String(content || '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new HttpError(400, 'fichier : contenu base64 attendu');
  const buf = Buffer.from(s, 'base64');
  if (!buf.length) throw new HttpError(400, 'fichier vide');
  if (buf.length > MAX_FILE) throw new HttpError(413, `fichier trop volumineux (${Math.round(MAX_FILE / 1024)} Ko au plus)`);
  try {
    if (name.endsWith('.xlsx')) {
      if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('fichier .xlsx illisible');
      return X.readXlsx(buf);
    }
    if (name.endsWith('.csv')) {
      if (buf.includes(0)) throw new Error('fichier .csv illisible (binaire)');
      return X.readCsv(buf.toString('utf8'));
    }
  } catch (e) { throw new HttpError(400, e.message); }
  throw new HttpError(400, 'format accepté : .xlsx ou .csv');
}

// Formule de tableur : =, +, -, @, tabulation ou retour chariot en tête (ou après des espaces).
const FORMULA = /^[\s]*[=+\-@\t\r]/;
function parseDate(v) {
  const s = String(v || '').trim();
  let y, m, d, x;
  if ((x = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/))) [, y, m, d] = x;
  else if ((x = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [, d, m, y] = x;
  else if (/^\d{4,5}(\.\d+)?$/.test(s)) { // numéro de série Excel (1900)
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400e3);
    [y, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  } else return null;
  y = Number(y); m = Number(m); d = Number(d);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  const nowY = new Date().getUTCFullYear();
  if (y < nowY - 40 || y > nowY) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function parseSex(v) {
  const s = I.strip(String(v || '')).trim().toLowerCase();
  if (['f', 'fi', 'fille', 'feminin', 'femme'].includes(s)) return 'F';
  if (['m', 'g', 'gason', 'garcon', 'masculin', 'homme'].includes(s)) return 'M';
  return null;
}
const dupKey = (r) => [r.first_name, r.last_name, r.birth_date].map((x) => I.strip(x || '').toLowerCase().replace(/[^a-z0-9]/g, '')).join('|');

// Analyse complète, sans rien écrire : lignes, valeurs normalisées, motifs d'erreur.
async function analyse(db, u, rows, normalizePhone) {
  const nonEmpty = rows.filter((r) => r.some((c) => String(c || '').trim()));
  if (!nonEmpty.length) throw new HttpError(400, 'fichier vide');
  const headIdx = rows.indexOf(nonEmpty[0]);
  const head = rows[headIdx].map(normHead);
  const map = {};
  for (const c of COLUMNS) { const i = head.findIndex((h) => h && c.alias.includes(h)); if (i >= 0) map[c.key] = i; }
  const missing = COLUMNS.filter((c) => c.required && map[c.key] == null).map((c) => c.fr);
  if (missing.length) throw new HttpError(400, `colonnes obligatoires absentes : ${missing.join(', ')}`);
  const body = rows.slice(headIdx + 1).map((r, i) => ({ line: headIdx + i + 2, r })).filter(({ r }) => r.some((c) => String(c || '').trim()))
    // Lignes de notes du modèle (une seule cellule remplie, en première colonne, sans les autres champs) : ignorées.
    .filter(({ r }) => !(r.filter((c) => String(c || '').trim()).length === 1 && /obligatoires|obligatwa|efase|supprimez|NORIA/i.test(String(r[0]))));
  if (body.length > MAX_ROWS) throw new HttpError(413, `trop de lignes (${MAX_ROWS} au plus)`);
  const classes = await db.all(`SELECT c.id, c.name FROM class c WHERE c.school_id = ? AND ${activeClass('c')}`, u.school_id); // classes actives (structure.js)
  const classByName = new Map(classes.map((c) => [I.strip(c.name).toLowerCase().replace(/\s+/g, ' ').trim(), c]));
  const existing = new Set((await db.all('SELECT first_name, last_name, birth_date FROM student WHERE school_id = ?', u.school_id)).map(dupKey));
  const seen = new Map();
  const out = [];
  for (const { line, r } of body) {
    const raw = {}; const errors = [];
    for (const c of COLUMNS) raw[c.key] = map[c.key] == null ? '' : String(r[map[c.key]] ?? '').trim();
    const v = {};
    for (const k of ['last_name', 'first_name', 'class', 'parent_name', 'parent_email']) {
      if (raw[k] && FORMULA.test(raw[k])) errors.push({ col: k, fr: 'formule de tableur refusée', ht: 'fòmil tablo pa aksepte' });
      else if (raw[k].length > 100) errors.push({ col: k, fr: '100 caractères au plus', ht: '100 karaktè maksimòm' });
      else if (/[\u0000-\u001f<>]/.test(raw[k])) errors.push({ col: k, fr: 'caractères interdits', ht: 'karaktè ki pa aksepte' });
      else v[k] = raw[k];
    }
    if (!raw.last_name) errors.push({ col: 'last_name', fr: 'nom obligatoire', ht: 'non obligatwa' });
    if (!raw.first_name) errors.push({ col: 'first_name', fr: 'prénom obligatoire', ht: 'prenon obligatwa' });
    v.birth_date = parseDate(raw.birth_date);
    if (!raw.birth_date) errors.push({ col: 'birth_date', fr: 'date de naissance obligatoire', ht: 'dat nesans obligatwa' });
    else if (!v.birth_date) errors.push({ col: 'birth_date', fr: 'date invalide (AAAA-MM-JJ)', ht: 'dat la pa bon (AAAA-MM-JJ)' });
    v.sex = parseSex(raw.sex);
    if (!v.sex) errors.push({ col: 'sex', fr: 'sexe : F ou M', ht: 'sèks : F oswa M' });
    const cls = raw.class && classByName.get(I.strip(raw.class).toLowerCase().replace(/\s+/g, ' ').trim());
    if (!raw.class) errors.push({ col: 'class', fr: 'classe obligatoire', ht: 'klas obligatwa' });
    else if (!cls) errors.push({ col: 'class', fr: 'classe inconnue dans cette école', ht: 'klas sa a pa egziste nan lekòl la' });
    else v.class_id = cls.id;
    if (raw.parent_phone) {
      v.parent_phone = FORMULA.test(raw.parent_phone.replace(/^\s*\+/, '')) ? null : normalizePhone(raw.parent_phone);
      if (!v.parent_phone) errors.push({ col: 'parent_phone', fr: 'téléphone invalide', ht: 'telefòn nan pa bon' });
    }
    if (raw.parent_email && v.parent_email !== undefined) {
      v.parent_email = raw.parent_email.toLowerCase();
      if (!EMAIL.test(v.parent_email)) errors.push({ col: 'parent_email', fr: 'e-mail invalide', ht: 'imèl la pa bon' });
    }
    if (!v.parent_email) v.parent_email = null;
    if (!v.parent_name && (v.parent_phone || v.parent_email)) v.parent_name = `Parent de ${v.first_name || ''}`.trim();
    if (v.first_name && v.last_name && v.birth_date) {
      const k = dupKey(v);
      if (existing.has(k)) errors.push({ col: 'first_name', fr: 'doublon : élève déjà inscrit dans l’école', ht: 'doub : elèv sa a deja enskri' });
      else if (seen.has(k)) errors.push({ col: 'first_name', fr: `doublon : même élève qu’à la ligne ${seen.get(k)}`, ht: `doub : menm elèv ak liy ${seen.get(k)}` });
      else seen.set(k, line);
    }
    out.push({ line, values: raw, clean: v, errors });
  }
  return out;
}

async function importRows(db, u, rows, sys, normalizePhone) {
  const school = await db.get('SELECT id, name, initials FROM school WHERE id = ?', u.school_id);
  const initials = I.schoolInitials(school);
  const invites = [];
  const result = await db.tx(async (t) => {
    const parentByKey = new Map();
    let created = 0, linked = 0, invited = 0;
    const codes = [];
    for (const row of rows) {
      const v = row.clean;
      const code = await I.reserveStudentCode(t, u.school_id, I.baseCode(v.first_name, v.last_name, v.birth_date, initials));
      const sid = await t.insert(`INSERT INTO student (school_id, code, first_name, last_name, birth_date, sex) VALUES (?,?,?,?,?,?)`,
        u.school_id, code, v.first_name, v.last_name, v.birth_date, v.sex);
      await t.insert('INSERT INTO enrollment (school_id, student_id, class_id, reason) VALUES (?,?,?,?)', u.school_id, sid, v.class_id, 'import de la liste des élèves');
      created++; codes.push({ line: row.line, code });
      if (!v.parent_phone && !v.parent_email) continue;
      const key = v.parent_phone || v.parent_email;
      let pid = parentByKey.get(key);
      if (!pid) {
        // 1. Adhésion déjà présente dans cette école (même téléphone ou e-mail).
        const mine = await t.get('SELECT id FROM app_user WHERE school_id = ? AND ((phone IS NOT NULL AND phone = ?) OR email = ?) ORDER BY id LIMIT 1',
          u.school_id, v.parent_phone || '', v.parent_email || '');
        if (mine) pid = mine.id;
        else {
          // 2. Personne connue ailleurs, par téléphone : nouvelle adhésion dans CETTE école, reliée à la même identité.
          //    Seul l'identifiant interne de la personne est lu (fonction dédiée en PostgreSQL) : rien ne sort de l'autre école.
          const person = v.parent_phone ? await personByPhone(t, v.parent_phone) : null;
          const email = v.parent_email || `tel${v.parent_phone}@telephone.invalid`;
          pid = await t.insert(`INSERT INTO app_user (school_id, email, phone, display_name, person_id, state) VALUES (?,?,?,?,?,?)`,
            u.school_id, email, v.parent_phone, v.parent_name, person, person ? 'actif' : 'invite');
          if (person) linked++;
          else invites.push({ userId: pid, email: v.parent_email, phone: v.parent_phone, name: v.parent_name, studentId: sid });
        }
        parentByKey.set(key, pid);
      }
      if (!(await t.get("SELECT 1 AS x FROM user_role WHERE user_id = ? AND role = 'parent'", pid)))
        await t.run('INSERT INTO user_role (school_id, user_id, role) VALUES (?,?,?)', u.school_id, pid, 'parent');
      await t.run('INSERT INTO parent_link (school_id, parent_user_id, student_id, reason) VALUES (?,?,?,?)', u.school_id, pid, sid, 'import de la liste des élèves');
    }
    invited = invites.length;
    await audit(t, u, 'student.import', 'school', u.school_id, `${created} élève(s), ${linked} parent(s) relié(s) par téléphone, ${invited} invitation(s)`);
    return { created, linked, invited, codes };
  });
  return { ...result, invites, school };
}

// PostgreSQL : fonction SECURITY DEFINER (seul l'identifiant sort). SQLite (sans RLS) : même règle en SQL.
async function personByPhone(t, phone) {
  if (t.kind === 'pg') return (await t.get('SELECT noria_person_by_phone(?) AS id', phone)).id || null;
  const r = await t.get(`SELECT CASE WHEN COUNT(DISTINCT person_id) = 1 THEN MIN(person_id) END AS id FROM app_user
    WHERE phone = ? AND state = 'actif' AND person_id IS NOT NULL`, phone);
  return (r && r.id) || null;
}

function createRoutes({ normalizePhone, outbox, linkBase, reqLang, newToken, INVITE_HOURS, setSessionCookie }) {
  const canImport = (u) => P.has(u, 'direction', 'secretariat');
  const routes = [
    // Profil de l'école active (tous les rôles le lisent : écran d'accueil, en-têtes).
    ['GET', /^\/api\/ecole$/, async (db, req, u) => publicProfile(await db.get('SELECT * FROM school WHERE id = ?', u.school_id))],
    ['PUT', /^\/api\/ecole$/, async (db, req, u, _m, ctx) => {
      if (!P.has(u, 'direction')) await refuse(ctx, u, 'school.profile', 'school', u.school_id, null);
      const b = req.body || {};
      const name = str(b.name, 120, 'nom');
      if (!name) throw new HttpError(400, 'nom de l’école obligatoire');
      const initials = I.cleanInitials(b.initials || '') || I.deriveInitials(name);
      if (initials.length < 2) throw new HttpError(400, 'initiales : 2 à 6 lettres');
      const email = str(b.email, 190, 'e-mail');
      if (email && !EMAIL.test(email)) throw new HttpError(400, 'e-mail invalide');
      let phone = str(b.phone, 40, 'téléphone');
      if (phone) { phone = normalizePhone(phone); if (!phone) throw new HttpError(400, 'téléphone invalide'); }
      const fields = { name, initials, address: str(b.address, 240, 'adresse'), email: email && email.toLowerCase(), phone, motto: str(b.motto, 160, 'devise') };
      // Bloc 6 : localisation (filtres du portail du ministère), facultative.
      if (b.department !== undefined) {
        const d = String(b.department || '');
        if (d && !DEPARTMENTS.includes(d)) throw new HttpError(400, 'département inconnu');
        fields.department = d || null;
      }
      if (b.commune !== undefined) fields.commune = str(b.commune, 80, 'commune');
      const changed = Object.keys(fields);
      const sets = changed.map((k) => `${k} = ?`); const vals = changed.map((k) => fields[k]);
      if (b.logo === null || b.logo === '') { sets.push('logo = NULL', 'logo_updated_at = NULL'); changed.push('logo (retiré)'); }
      else if (b.logo !== undefined) {
        const lg = I.checkLogo(b.logo);
        if (lg.error) throw new HttpError(400, lg.error);
        sets.push('logo = ?', 'logo_updated_at = ?'); vals.push(lg.buf.toString('base64'), new Date().toISOString());
        changed.push(`logo ${lg.width}x${lg.height} ${Math.ceil(lg.buf.length / 1024)} Ko`);
      }
      await db.run(`UPDATE school SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...vals, u.school_id);
      await audit(db, u, 'school.profile', 'school', u.school_id, `[champs: ${changed.join(', ')}]`);
      return publicProfile(await db.get('SELECT * FROM school WHERE id = ?', u.school_id));
    }],

    // Import des élèves : modèle, aperçu (rien n'est écrit), validation (tout ou rien).
    ['GET', /^\/api\/import\/eleves\/modele$/, async (db, req, u, _m, ctx) => {
      if (!canImport(u)) await refuse(ctx, u, 'student.import.template', 'school', u.school_id, null);
      return { __file: templateXlsx(), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: 'modele-import-eleves.xlsx' };
    }],
    ['POST', /^\/api\/import\/eleves\/apercu$/, async (db, req, u, _m, ctx) => {
      if (!canImport(u)) await refuse(ctx, u, 'student.import.preview', 'school', u.school_id, null);
      const rows = await analyse(db, u, parseFile(req.body.filename, req.body.content), normalizePhone);
      return { total: rows.length, valid: rows.filter((r) => !r.errors.length).length, invalid: rows.filter((r) => r.errors.length).length,
        columns: COLUMNS.map((c) => ({ key: c.key, fr: c.fr, ht: c.ht, required: c.required })),
        rows: rows.map(({ line, values, errors }) => ({ line, values, errors })) };
    }],
    ['POST', /^\/api\/import\/eleves$/, async (db, req, u, _m, ctx) => {
      if (!canImport(u)) await refuse(ctx, u, 'student.import', 'school', u.school_id, null);
      const rows = await analyse(db, u, parseFile(req.body.filename, req.body.content), normalizePhone);
      const bad = rows.filter((r) => r.errors.length);
      if (bad.length) {
        await audit(db, u, 'student.import', 'school', u.school_id, `${bad.length} ligne(s) en erreur : import refusé`, 'refuse');
        throw new HttpError(400, `${bad.length} ligne(s) en erreur : rien n’a été importé`);
      }
      const r = await importRows(db, u, rows, null, normalizePhone);
      // Invitations des parents sans compte : jeton à usage unique, logo et nom de l'école dans le message.
      const lang = reqLang(req, 'fr');
      for (const inv of r.invites) {
        const token = newToken();
        const expires = new Date(Date.now() + INVITE_HOURS * 3600e3).toISOString();
        await db.insert(`INSERT INTO account_token (school_id, kind, token_hash, user_id, email, phone, display_name, role, student_id, created_by, expires_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`, u.school_id, 'invitation', auth.sha256(token), inv.userId, inv.email, inv.phone, inv.name, 'parent', inv.studentId, u.id, expires);
        await outbox(db, ctx, u.school_id, inv.phone || inv.email, 'invitation', lang,
          { school: r.school.name, initials: I.schoolInitials(r.school), name: inv.name, hours: INVITE_HOURS, link: `${linkBase(req, ctx)}/#invitation=${token}` }, [token]);
      }
      return { created: r.created, linked: r.linked, invited: r.invited, codes: r.codes };
    }],

    // Adhésions de la personne connectée (ses écoles) et changement d'école active.
    ['GET', /^\/api\/me\/ecoles$/, async (sys, req, u) => {
      if (!u.person_id) return [{ school_id: u.school_id, active: true }];
      return (await I.memberships(sys, u.person_id)).map((m) => ({
        school_id: m.school_id, slug: m.slug, name: m.name, initials: I.schoolInitials(m), active: m.school_id === u.school_id,
        logo: m.has_logo ? `/api/ecoles/${encodeURIComponent(m.slug)}/logo?v=${encodeURIComponent(m.logo_updated_at || '1')}` : null,
      }));
    }, { system: true }],
    ['POST', /^\/api\/session\/ecole$/, async (sys, req, u, _m, ctx) => {
      const target = int(req.body && req.body.school_id);
      if (!u.person_id) notFound();
      const m = (await I.memberships(sys, u.person_id)).find((x) => x.school_id === target);
      if (!m) notFound();
      const user = await sys.get('SELECT * FROM app_user WHERE id = ? AND school_id = ?', m.user_id, m.school_id);
      await auth.destroySession(sys, req.token);
      const token = await auth.createSession(sys, user);
      setSessionCookie(req, ctx, token);
      await sys.asSchool(target, (t) => audit(t, user, 'session.school', 'school', target, `depuis l’école ${u.school_id}`));
      await sys.asSchool(u.school_id, (t) => audit(t, u, 'session.school', 'school', target, 'école quittée'));
      return { token, school_id: target };
    }, { system: true }],
    // Enfants d'un parent, dans toutes ses écoles : une transaction RLS par école, limitée à SES liens parent-enfant.
    ['GET', /^\/api\/me\/enfants$/, async (sys, req, u) => {
      const mem = u.person_id ? await I.memberships(sys, u.person_id) : [{ user_id: u.id, school_id: u.school_id }];
      const out = [];
      for (const m of mem) {
        const rows = await sys.asSchool(m.school_id, (t) => t.all(`SELECT st.id, st.code, st.first_name, st.last_name, sc.name AS school, sc.initials AS school_initials
          FROM parent_link pl JOIN student st ON st.id = pl.student_id AND st.school_id = pl.school_id
          JOIN user_role r ON r.user_id = pl.parent_user_id AND r.school_id = pl.school_id AND r.role = 'parent'
          JOIN school sc ON sc.id = st.school_id
          WHERE pl.parent_user_id = ? AND pl.school_id = ? ORDER BY st.first_name, st.last_name`, m.user_id, m.school_id));
        for (const r of rows) out.push({ student_id: r.id, school_id: m.school_id, code: r.code, first_name: r.first_name, last_name: r.last_name,
          school: r.school, school_initials: r.school_initials || I.deriveInitials(r.school), initials: `${(r.first_name || '?')[0]}${(r.last_name || '?')[0]}`.toUpperCase(), active: m.school_id === u.school_id });
      }
      return out;
    }, { system: true }],
  ];

  const publicRoutes = [
    // Logo public (en-têtes, invitations, page d'arrivée). Rien d'autre de l'école n'est exposé ici.
    ['GET', /^\/api\/ecoles\/([a-z0-9-]{1,60})\/logo$/, async (db, req, _u, [slug]) => {
      const s = await db.get("SELECT logo FROM school WHERE slug = ? AND status = 'active'", slug);
      if (!s || !s.logo) notFound();
      return { __file: Buffer.from(s.logo, 'base64'), type: 'image/jpeg', inline: true, cache: 'public, max-age=86400' };
    }, { public: true }],
    // Page d'arrivée d'une invitation : école qui invite (nom, initiales, logo), rôle et nom de la personne invitée.
    ['POST', /^\/api\/invitations\/info$/, async (db, req) => {
      const row = await db.get(`SELECT a.role, a.display_name, a.expires_at, a.used_at, s.slug, s.name, s.initials, s.logo_updated_at, (s.logo IS NOT NULL) AS has_logo
        FROM account_token a JOIN school s ON s.id = a.school_id WHERE a.token_hash = ? AND a.kind = 'invitation' AND s.status = 'active'`, auth.sha256(String((req.body || {}).token || '')));
      if (!row || row.used_at || row.expires_at < new Date().toISOString()) throw new HttpError(400, 'lien invalide ou expiré');
      return { school: { name: row.name, initials: I.schoolInitials(row), logo: row.has_logo ? `/api/ecoles/${row.slug}/logo?v=${encodeURIComponent(row.logo_updated_at || '1')}` : null },
        role: row.role, name: row.display_name };
    }, { public: true }],
  ];
  return { routes, publicRoutes };
}

module.exports = { createRoutes, analyse, parseFile, parseDate, parseSex, templateXlsx, COLUMNS, publicProfile, personByPhone };
