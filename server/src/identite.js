'use strict';
// Identité globale, profil d'école et code élève.
//   person    : une personne, un identifiant de connexion (e-mail), un mot de passe — table globale, hors RLS.
//   app_user  : l'adhésion de cette personne à une école (rôles, téléphone, données de l'école).
// Les fonctions qui lisent plusieurs écoles reçoivent la connexion système (propriétaire des tables) et ne renvoient
// que ce qui concerne la personne connectée.
const { isUnique } = require('./common');

const strip = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'a', 'au', 'aux', 'en', 'lekol', 'ecole']);

// Initiales d'école : 2 à 6 lettres majuscules. Par défaut, première lettre des mots significatifs du nom.
function deriveInitials(name) {
  const words = strip(name).split(/[^A-Za-z0-9]+/).filter(Boolean);
  const sig = words.filter((w) => !STOP.has(w.toLowerCase()));
  let s = (sig.length ? sig : words).map((w) => w[0]).join('').toUpperCase().slice(0, 6);
  if (s.length < 2) s = strip(name).replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) || 'EC';
  return s;
}
const cleanInitials = (v) => strip(v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const schoolInitials = (school) => cleanInitials(school.initials) || deriveInitials(school.name);

// Code élève : initiale du prénom, initiale du nom, date de naissance AAMMJJ, tiret, initiales de l'école.
// Exemple : Ana Fils-Aimé, née le 2012-03-05, Collège Saint-Pierre (CSP) → AF120305-CSP. Collision : -2, -3…
function baseCode(first, last, birth, initials) {
  const ini = (s) => (strip(s).replace(/[^A-Za-z]/g, '')[0] || 'X').toUpperCase();
  const m = String(birth || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m ? `${m[1].slice(2)}${m[2]}${m[3]}` : '000000';
  return `${ini(first)}${ini(last)}${d}-${initials}`;
}
// Réserve un code unique dans le registre global (clé primaire) ; chaque essai est un point de sauvegarde, pour qu'un
// doublon n'annule pas la transaction en cours (PostgreSQL).
async function reserveStudentCode(t, schoolId, base) {
  for (let i = 1; i < 1000; i++) {
    const code = i === 1 ? base : `${base}-${i}`;
    try {
      await t.tx((s) => s.run('INSERT INTO student_code (code, school_id) VALUES (?,?)', code, schoolId));
      return code;
    } catch (e) { if (!isUnique(e)) throw e; }
  }
  throw new Error('code élève : trop de collisions');
}

// Personne d'un compte (crée l'identité si l'adhésion n'en a pas encore : comptes créés avant la migration 009).
async function ensurePerson(sys, user) {
  if (user.person_id) return user.person_id;
  const email = String(user.email || '').toLowerCase();
  let p = await sys.get('SELECT id FROM person WHERE email = ?', email);
  if (!p) p = { id: await sys.insert('INSERT INTO person (email, display_name) VALUES (?,?)', email, user.display_name) };
  await sys.run('UPDATE app_user SET person_id = ? WHERE id = ? AND school_id = ? AND person_id IS NULL', p.id, user.id, user.school_id);
  return p.id;
}
// Rattache toutes les adhésions sans identité (données de démonstration, restauration ancienne).
async function attachPersons(sys) {
  const rows = await sys.all('SELECT id, school_id, email, display_name, person_id FROM app_user WHERE person_id IS NULL ORDER BY id');
  for (const u of rows) await ensurePerson(sys, u);
  return rows.length;
}

// Adhésions actives d'une personne, dans les écoles actives.
function memberships(sys, personId) {
  return sys.all(`SELECT u.id AS user_id, s.id AS school_id, s.slug, s.name, s.initials, s.logo_updated_at,
      (s.logo IS NOT NULL) AS has_logo
    FROM app_user u JOIN school s ON s.id = u.school_id
    WHERE u.person_id = ? AND u.state = 'actif' AND s.status = 'active' ORDER BY s.name, s.id`, personId);
}

// Profil public d'une école (en-têtes, invitations, écran d'accueil). Le logo est servi par /api/ecoles/<slug>/logo.
async function schoolProfile(db, schoolId) {
  const s = await db.get('SELECT id, slug, name, initials, address, email, phone, motto, logo, logo_updated_at, default_lang FROM school WHERE id = ?', schoolId);
  if (!s) return null;
  return { ...s, initials: schoolInitials(s), logo: s.logo ? Buffer.from(s.logo, 'base64') : null };
}

// Logo : JPEG baseline ou progressif, 16 à 512 px, 48 Ko au plus (le navigateur le redimensionne avant l'envoi).
const LOGO_MAX = 48 * 1024;
function jpegSize(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const m = buf[i + 1];
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), components: buf[i + 9] };
    }
    i += 2 + len;
  }
  return null;
}
function checkLogo(b64) {
  const s = String(b64 || '').replace(/^data:image\/jpeg;base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return { error: 'logo : JPEG en base64 attendu' };
  const buf = Buffer.from(s, 'base64');
  if (buf.length > LOGO_MAX) return { error: `logo trop lourd (${Math.ceil(buf.length / 1024)} Ko, 48 Ko au plus)` };
  const dim = jpegSize(buf);
  if (!dim || dim.width < 16 || dim.height < 16 || dim.width > 512 || dim.height > 512 || ![1, 3].includes(dim.components))
    return { error: 'logo : image JPEG de 16 à 512 pixels attendue' };
  return { buf, ...dim };
}

module.exports = { deriveInitials, cleanInitials, schoolInitials, baseCode, reserveStudentCode, ensurePerson, attachPersons, memberships, schoolProfile, checkLogo, jpegSize, LOGO_MAX, strip };
