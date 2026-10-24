'use strict';
// Bloc 5 : portail public (données, validation, images, routes de proposition et de modération).
//   - Les directions PROPOSENT (statut « en_attente ») un événement, un article, un témoignage ou un lauréat pour LEUR
//     école ; le super-admin publie, refuse (motif), dépublie (motif) ou met à la une. Rien n'est public avant.
//   - Lauréat mineur : nom complet et photo publiés seulement si le consentement de l'école ET celui du parent (nom du
//     parent, date) sont enregistrés ; sinon initiales seules, sans photo.
//   - Texte brut uniquement : balises, scripts, caractères de contrôle et d'inversion retirés à l'entrée ; tout est
//     échappé à l'affichage (portail-pages.js).
//   - Images : redimensionnées et compressées par le navigateur (WebP ou JPEG), vérifiées ici : signature, dimensions,
//     80 Ko au plus (vignette 16 Ko), métadonnées EXIF/XMP/ICC retirées.
//   - Annonces : « Sponsorisé » ou annonce officielle, dates de début et de fin (jour civil d'Haïti), compteur de clics
//     par jour sans adresse IP ni cookie ni traceur tiers.
// Lecture publique : connexion système, contenus publiés d'écoles actives seulement, champs en liste blanche.
const crypto = require('node:crypto');
const P = require('./policy');
const I = require('./identite');
const { HttpError, notFound, audit, refuse } = require('./common');

const KINDS = ['evenement', 'article', 'temoignage', 'laureat'];
const CATEGORIES = ['examens', 'concours', 'culture', 'sport', 'science', 'autre'];
const DEPARTMENTS = ['artibonite', 'centre', 'grand-anse', 'nippes', 'nord', 'nord-est', 'nord-ouest', 'ouest', 'sud', 'sud-est'];
const IMG_MAX = 80 * 1024, THUMB_MAX = 16 * 1024, LOGO_MAX = 16 * 1024;
const PROPOSALS_PER_HOUR = 30;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const iso = () => new Date().toISOString();
const haitiDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: process.env.NORIA_TZ || 'America/Port-au-Prince' });
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const int = (v) => { const x = Number(v); if (!Number.isInteger(x) || x <= 0) throw new HttpError(400, 'identifiant invalide'); return x; };
const bool = (v) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';

// Version des contenus publics : incrémentée à chaque écriture, elle invalide le cache des pages.
let version = 1;
const bump = () => { version++; };
const currentVersion = () => version;

/* ---------- Nettoyage du texte ---------- */
// Texte brut : blocs script/style et commentaires retirés avec leur contenu, puis toute balise, puis tout chevron
// restant ; caractères de contrôle (sauf saut de ligne) et d'inversion bidirectionnelle retirés ; espaces normalisés.
function clean(v, max, label, { required = false, multiline = false, min = 0 } = {}) {
  let s = String(v ?? '').normalize('NFC').replace(/\r\n?/g, '\n');
  s = s.replace(/<\s*(script|style|iframe|object|embed|svg|math|template|noscript)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?(-->|$)/g, ' ').replace(/<\/?[a-z!?/][^>]*(>|$)/gi, ' ').replace(/[<>]/g, ' ')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '');
  s = multiline ? s.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
    : s.replace(/\s+/g, ' ').trim();
  if (!s) { if (required) throw new HttpError(400, `${label} obligatoire`); return null; }
  if (s.length < min) throw new HttpError(400, `${label} : ${min} caractères au moins`);
  if (s.length > max) throw new HttpError(400, `${label} : ${max} caractères au plus`);
  return s;
}
function day(v, label, required = false) {
  const s = String(v ?? '').trim();
  if (!s) { if (required) throw new HttpError(400, `${label} obligatoire`); return null; }
  const d = new Date(`${s}T12:00:00Z`);
  if (!DAY.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new HttpError(400, `${label} invalide (AAAA-MM-JJ)`);
  return s;
}
function httpsUrl(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let u;
  try { u = new URL(s); } catch { throw new HttpError(400, 'lien invalide'); }
  if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.') || s.length > 300 || /[\s<>"'`]/.test(s)) throw new HttpError(400, 'lien : adresse https:// valide attendue (300 caractères au plus)');
  return u.toString();
}
const oneOf = (v, list, label, required = false) => { if (v == null || v === '') { if (required) throw new HttpError(400, `${label} obligatoire`); return null; } if (!list.includes(v)) throw new HttpError(400, `${label} invalide`); return v; };

/* ---------- Images ---------- */
// JPEG : segments APP1 à APP13, APP15 (EXIF, XMP, ICC, IPTC…) et commentaires retirés ; APP0 (JFIF) et APP14 (Adobe) gardés.
function jpegClean(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return null;
    const m = buf[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd9) { out.push(buf.subarray(i, i + 2)); return Buffer.concat(out); }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return null;
    if (m === 0xda) { out.push(buf.subarray(i)); return Buffer.concat(out); } // début des données : copiées telles quelles
    const drop = (m >= 0xe1 && m <= 0xed) || m === 0xef || m === 0xfe;
    if (!drop) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return null;
}
// WebP : seuls les blocs d'image (VP8X, VP8, VP8L, ALPH) sont gardés ; animation refusée ; indicateurs ICC/EXIF/XMP effacés.
function webpClean(buf) {
  if (buf.length < 20 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const size = buf.readUInt32LE(4);
  if (size + 8 > buf.length || size < 12) return null;
  const end = size + 8;
  const keep = [];
  let i = 12, dim = null, vp8x = false;
  while (i + 8 <= end) {
    const tag = buf.toString('ascii', i, i + 4); const len = buf.readUInt32LE(i + 4);
    const next = i + 8 + len + (len & 1);
    if (i + 8 + len > end) return null;
    const data = buf.subarray(i + 8, i + 8 + len);
    if (tag === 'ANIM' || tag === 'ANMF') return { error: 'image animée refusée' };
    if (tag === 'VP8X') {
      if (len < 10) return null;
      if (data[0] & 0x02) return { error: 'image animée refusée' };
      const d = Buffer.from(data); d[0] &= 0x10; // seul l'indicateur de transparence est gardé
      dim = { width: 1 + data.readUIntLE(4, 3), height: 1 + data.readUIntLE(7, 3) }; vp8x = true;
      keep.push([tag, d]);
    } else if (tag === 'VP8 ') {
      if (len < 10 || data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) return null;
      if (!vp8x) dim = { width: data.readUInt16LE(6) & 0x3fff, height: data.readUInt16LE(8) & 0x3fff };
      keep.push([tag, data]);
    } else if (tag === 'VP8L') {
      if (len < 5 || data[0] !== 0x2f) return null;
      const b = data.readUInt32LE(1);
      if (!vp8x) dim = { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
      keep.push([tag, data]);
    } else if (tag === 'ALPH') keep.push([tag, data]);
    i = next;
  }
  if (!dim || !keep.some(([t]) => t === 'VP8 ' || t === 'VP8L')) return null;
  const parts = keep.map(([t, d]) => { const h = Buffer.alloc(8); h.write(t, 0, 'ascii'); h.writeUInt32LE(d.length, 4); return Buffer.concat([h, d, d.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]); });
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(12); head.write('RIFF', 0, 'ascii'); head.writeUInt32LE(body.length + 4, 4); head.write('WEBP', 8, 'ascii');
  return { buf: Buffer.concat([head, body]), ...dim };
}
// Vérifie une image envoyée en base64 (ou en adresse data:) et renvoie { buf, mime, width, height } nettoyée.
function checkImage(input, { max = IMG_MAX, maxDim = 1600, minDim = 16, label = 'image' } = {}) {
  const s = String(input || '').replace(/^data:image\/(jpeg|webp);base64,/, '');
  if (!s || s.length > Math.ceil(max * 1.4) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) throw new HttpError(400, `${label} : JPEG ou WebP en base64 attendu, ${Math.round(max / 1024)} Ko au plus`);
  const raw = Buffer.from(s, 'base64');
  let buf, mime, dim;
  if (raw[0] === 0xff && raw[1] === 0xd8) {
    buf = jpegClean(raw); dim = buf && I.jpegSize(buf); mime = 'image/jpeg';
    if (!buf || !dim || ![1, 3].includes(dim.components)) throw new HttpError(400, `${label} : JPEG illisible`);
  } else if (raw.toString('ascii', 0, 4) === 'RIFF') {
    const w = webpClean(raw);
    if (!w || w.error) throw new HttpError(400, `${label} : ${w && w.error ? w.error : 'WebP illisible'}`);
    buf = w.buf; dim = w; mime = 'image/webp';
  } else throw new HttpError(400, `${label} : seuls JPEG et WebP sont acceptés`);
  if (buf.length > max) throw new HttpError(400, `${label} trop lourde (${Math.ceil(buf.length / 1024)} Ko, ${Math.round(max / 1024)} Ko au plus)`);
  if (dim.width < minDim || dim.height < minDim || dim.width > maxDim || dim.height > maxDim) throw new HttpError(400, `${label} : ${minDim} à ${maxDim} pixels de côté`);
  return { buf, mime, width: dim.width, height: dim.height };
}
// Enregistre une image (et sa vignette) ; owner = { school_id, created_by } ou { created_by_admin }.
async function saveImage(t, img, owner, { thumbRequired = true, logo = false } = {}) {
  if (!img || typeof img !== 'object') throw new HttpError(400, 'image invalide');
  const full = logo ? checkImage(img.data, { max: LOGO_MAX, maxDim: 256, label: 'logo' }) : checkImage(img.data, { label: 'image' });
  const th = img.thumb ? checkImage(img.thumb, { max: THUMB_MAX, maxDim: 480, label: 'vignette' }) : null;
  if (!th && thumbRequired && !logo && full.buf.length > THUMB_MAX) throw new HttpError(400, 'vignette obligatoire (16 Ko au plus)');
  return t.insert(`INSERT INTO portal_image (school_id, mime, data, width, height, bytes, thumb_mime, thumb, thumb_width, thumb_height, thumb_bytes, sha256, created_by, created_by_admin)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, owner.school_id || null, full.mime, full.buf.toString('base64'), full.width, full.height, full.buf.length,
  th ? th.mime : null, th ? th.buf.toString('base64') : null, th ? th.width : null, th ? th.height : null, th ? th.buf.length : null,
  sha256(full.buf), owner.created_by || null, owner.created_by_admin || null);
}

/* ---------- Lecture et validation d'un contenu ---------- */
// Renvoie les colonnes d'un contenu à partir du corps de la requête. who = { label } (journal du consentement).
function readItem(b, kind, who) {
  if (!KINDS.includes(kind)) throw new HttpError(400, 'type : evenement, article, temoignage ou laureat');
  const o = { kind };
  const titles = () => {
    o.title_fr = clean(b.title_fr, 140, 'titre (français)'); o.title_ht = clean(b.title_ht, 140, 'titre (kreyòl)');
    if (!o.title_fr && !o.title_ht) throw new HttpError(400, 'titre obligatoire (français ou kreyòl)');
  };
  const bodies = (required) => {
    o.body_fr = clean(b.body_fr, 4000, 'texte (français)', { multiline: true }); o.body_ht = clean(b.body_ht, 4000, 'texte (kreyòl)', { multiline: true });
    if (required && !o.body_fr && !o.body_ht) throw new HttpError(400, 'texte obligatoire (français ou kreyòl)');
  };
  if (kind === 'evenement') {
    titles(); bodies(false);
    o.category = oneOf(b.category, CATEGORIES, 'catégorie', true);
    o.event_date = day(b.event_date, 'date', true); o.event_end = day(b.event_end, 'date de fin');
    if (o.event_end && o.event_end < o.event_date) throw new HttpError(400, 'la date de fin précède la date de début');
    if (o.event_end === o.event_date) o.event_end = null;
    o.place = clean(b.place, 120, 'lieu', { required: true });
    o.department = oneOf(b.department, DEPARTMENTS, 'département');
  } else if (kind === 'article' || kind === 'temoignage') {
    titles(); bodies(true);
    o.author = clean(b.author, 80, 'auteur');
  } else {
    o.person_name = clean(b.person_name, 80, 'nom du lauréat', { required: true, min: 2 });
    o.title_fr = null; o.title_ht = null; o.body_fr = null; o.body_ht = null;
    const y = Number(b.year);
    if (!Number.isInteger(y) || y < 1990 || y > new Date().getFullYear() + 1) throw new HttpError(400, 'année invalide');
    o.year = y;
    o.exam = clean(b.exam, 80, 'examen ou concours', { required: true });
    o.exam_type = oneOf(b.exam_type, ['examen', 'concours'], 'type (examen ou concours)', true);
    o.mention = clean(b.mention, 40, 'mention');
    o.department = oneOf(b.department, DEPARTMENTS, 'département');
    o.school_name = clean(b.school_name, 120, 'école');
    // Mineur : réponse explicite exigée (pas de valeur par défaut silencieuse).
    if (b.minor !== true && b.minor !== false && b.minor !== 0 && b.minor !== 1) throw new HttpError(400, 'indiquez si le lauréat est mineur (oui ou non)');
    o.minor = bool(b.minor) ? 1 : 0;
    if (o.minor) {
      o.consent_school = bool(b.consent_school) ? 1 : 0;
      o.consent_parent = bool(b.consent_parent) ? 1 : 0;
      o.consent_parent_name = o.consent_parent ? clean(b.consent_parent_name, 80, 'nom du parent qui consent', { required: true, min: 2 }) : null;
      o.consent_at = o.consent_parent || o.consent_school ? iso() : null;
      o.consent_by = o.consent_at ? String(who.label).slice(0, 120) : null;
    } else Object.assign(o, { consent_school: 0, consent_parent: 0, consent_parent_name: null, consent_at: null, consent_by: null });
  }
  return o;
}
const consented = (r) => !Number(r.minor) || (Number(r.consent_school) === 1 && Number(r.consent_parent) === 1);
// Initiales seules : « Anne-Marie Fils-Aimé » → « A. F. ».
// Initiales : seuls les mots qui commencent par une lettre comptent (pas de chiffre ni de ponctuation) ; un nom composé ne compte qu'une fois (moins d'indices sur un mineur).
const initials = (name) => String(name || '').normalize('NFC').split(/\s+/).filter((w) => /^\p{L}/u.test(w))
  .map((w) => `${[...w][0].toLocaleUpperCase('fr')}.`).join(' ') || '?';

// Champs publics d'un contenu (liste blanche) : jamais d'identifiant d'utilisateur, de consentement détaillé ni de motif.
function publicItem(r) {
  const base = { id: Number(r.id), kind: r.kind, school: r.school_display || null, school_slug: r.school_slug || null, published_at: r.published_at || null };
  if (r.kind === 'laureat') {
    const ok = consented(r);
    return { ...base, name: ok ? r.person_name : initials(r.person_name), masked: !ok, image: ok && r.image_id ? Number(r.image_id) : null,
      year: Number(r.year), exam: r.exam, exam_type: r.exam_type, mention: r.mention || null, department: r.department || null, school: r.school_name || r.school_display || null };
  }
  const out = { ...base, title_fr: r.title_fr, title_ht: r.title_ht, body_fr: r.body_fr, body_ht: r.body_ht, image: r.image_id ? Number(r.image_id) : null };
  if (r.kind === 'evenement') Object.assign(out, { category: r.category, event_date: r.event_date, event_end: r.event_end || null, place: r.place, department: r.department || null });
  else Object.assign(out, { author: r.author || null, school_logo: r.school_logo ? Number(r.school_logo) : null });
  return out;
}

/* ---------- Lecture publique ---------- */
const VISIBLE = "i.status = 'publie' AND (i.school_id IS NULL OR s.status = 'active')";
const FROM = `FROM portal_item i LEFT JOIN school s ON s.id = i.school_id`;
const COLS = `i.*, s.name AS school_display, s.slug AS school_slug, CASE WHEN s.portal_partner = 1 THEN s.portal_logo_id END AS school_logo`;
const ACTIVE_AD = 'a.active = 1 AND a.starts_on <= ? AND a.ends_on >= ?';

// Catégories publiques des « Espaces des écoles », dérivées des types existants (aucune nouvelle donnée à saisir).
const FEED_CATS = ['inscriptions', 'evenements', 'actualites', 'examens', 'laureats', 'autres'];
const FEED_SQL = {
  evenements: "(i.kind = 'evenement' AND i.category IN ('culture','sport','science'))",
  actualites: "i.kind IN ('article','temoignage')",
  examens: "(i.kind = 'evenement' AND i.category IN ('examens','concours'))",
  laureats: "i.kind = 'laureat'",
  autres: "(i.kind = 'evenement' AND (i.category = 'autre' OR i.category IS NULL))",
};
function feedCat(r) {
  if (r.kind === 'laureat') return 'laureats';
  if (r.kind === 'article' || r.kind === 'temoignage') return 'actualites';
  if (['examens', 'concours'].includes(r.category)) return 'examens';
  if (['culture', 'sport', 'science'].includes(r.category)) return 'evenements';
  return 'autres';
}

function createPublic(db) {
  const count = async (sql, ...p) => Number((await db.get(`SELECT COUNT(*) AS n ${sql}`, ...p)).n);
  const api = {
    async events({ category = null, past = false, page = 1, per = 12 } = {}) {
      const today = haitiDay();
      const where = `${FROM} WHERE ${VISIBLE} AND i.kind = 'evenement' AND COALESCE(i.event_end, i.event_date) ${past ? '<' : '>='} ?${category ? ' AND i.category = ?' : ''}`;
      const p = [today, ...(category ? [category] : [])];
      const rows = await db.all(`SELECT ${COLS} ${where} ORDER BY i.event_date ${past ? 'DESC' : 'ASC'}, i.id LIMIT ? OFFSET ?`, ...p, per, (page - 1) * per);
      return { list: rows.map(publicItem), total: await count(where, ...p) };
    },
    async latestEvents(n = 3) {
      const up = (await api.events({ per: n })).list;
      if (up.length >= n) return up;
      return up.concat((await api.events({ past: true, per: n - up.length })).list);
    },
    async item(kinds, id) {
      const r = await db.get(`SELECT ${COLS} ${FROM} WHERE ${VISIBLE} AND i.id = ? AND i.kind IN (${kinds.map(() => '?').join(',')})`, Number(id), ...kinds);
      return r ? publicItem(r) : null;
    },
    async laureates({ year = null, type = null, dep = null, page = 1, per = 30 } = {}) {
      const c = []; const p = [];
      if (year) { c.push('i.year = ?'); p.push(year); }
      if (type) { c.push('i.exam_type = ?'); p.push(type); }
      if (dep) { c.push('i.department = ?'); p.push(dep); }
      const where = `${FROM} WHERE ${VISIBLE} AND i.kind = 'laureat'${c.map((x) => ` AND ${x}`).join('')}`;
      const rows = await db.all(`SELECT ${COLS} ${where} ORDER BY i.year DESC, i.exam, i.person_name, i.id LIMIT ? OFFSET ?`, ...p, per, (page - 1) * per);
      return { list: rows.map(publicItem), total: await count(where, ...p) };
    },
    async featured(n = 6) {
      return (await db.all(`SELECT ${COLS} ${FROM} WHERE ${VISIBLE} AND i.kind = 'laureat' AND i.featured = 1 ORDER BY i.year DESC, i.published_at DESC LIMIT ?`, n)).map(publicItem);
    },
    async years() {
      return (await db.all(`SELECT DISTINCT i.year ${FROM} WHERE ${VISIBLE} AND i.kind = 'laureat' ORDER BY i.year DESC`)).map((r) => Number(r.year));
    },
    async community({ page = 1, per = 12 } = {}) {
      const where = `${FROM} WHERE ${VISIBLE} AND i.kind IN ('article','temoignage')`;
      const rows = await db.all(`SELECT ${COLS} ${where} ORDER BY i.featured DESC, i.published_at DESC, i.id DESC LIMIT ? OFFSET ?`, per, (page - 1) * per);
      return { list: rows.map(publicItem), total: await count(where) };
    },
    // Espaces des écoles : contenus publiés PAR LES ÉCOLES (jamais ceux de NORIA), rangés par catégorie publique.
    // cat : null (toutes) ou une clé de FEED_CATS hors « inscriptions » (campagnes, voir campaigns()).
    async schoolFeed({ cat = null, school = null, schools = null, page = 1, per = 12 } = {}) {
      const c = [`${VISIBLE}`, 'i.school_id IS NOT NULL']; const p = [];
      if (cat) c.push(FEED_SQL[cat]); else c.push(`(${Object.values(FEED_SQL).join(' OR ')})`);
      if (school) { c.push('s.slug = ?'); p.push(school); }
      if (schools) { if (!schools.length) return { list: [], total: 0 }; c.push(`i.school_id IN (${schools.map(() => '?').join(',')})`); p.push(...schools.map(Number)); }
      const where = `${FROM} WHERE ${c.join(' AND ')}`;
      const rows = await db.all(`SELECT ${COLS} ${where} ORDER BY COALESCE(i.published_at, i.updated_at) DESC, i.id DESC LIMIT ? OFFSET ?`, ...p, per, (page - 1) * per);
      return { list: rows.map((r) => ({ ...publicItem(r), feed: feedCat(r) })), total: await count(where, ...p) };
    },
    // Campagnes d'inscription ouvertes aujourd'hui (Lot 3), école active seulement.
    async campaigns({ school = null, schools = null, page = 1, per = 12 } = {}) {
      const today = haitiDay(); const p = [today, today]; let extra = '';
      if (school) { extra += ' AND s.slug = ?'; p.push(school); }
      if (schools) { if (!schools.length) return { list: [], total: 0 }; extra += ` AND s.id IN (${schools.map(() => '?').join(',')})`; p.push(...schools.map(Number)); }
      const where = `FROM enrolment_campaign c JOIN school s ON s.id = c.school_id WHERE s.status = 'active' AND c.status = 'ouverte' AND c.opens_on <= ? AND c.closes_on >= ?${extra}`;
      const rows = await db.all(`SELECT c.id, c.title, c.info, c.opens_on, c.closes_on, s.name AS school, s.slug AS school_slug ${where} ORDER BY c.closes_on, s.name LIMIT ? OFFSET ?`, ...p, per, (page - 1) * per);
      return { list: rows.map((r) => ({ id: Number(r.id), feed: 'inscriptions', title: r.title, info: r.info || '', opens_on: r.opens_on, closes_on: r.closes_on, school: r.school, school_slug: r.school_slug })), total: await count(where, ...p) };
    },
    // Écoles qui ont au moins un contenu public ou une campagne ouverte (filtre et « suivre »).
    async feedSchools() {
      const today = haitiDay();
      return db.all(`SELECT s.id, s.slug, s.name FROM school s WHERE s.status = 'active' AND (EXISTS (SELECT 1 FROM portal_item i WHERE i.school_id = s.id AND i.status = 'publie')
        OR EXISTS (SELECT 1 FROM enrolment_campaign c WHERE c.school_id = s.id AND c.status = 'ouverte' AND c.opens_on <= ? AND c.closes_on >= ?)) ORDER BY s.name LIMIT 500`, today, today);
    },
    async ads({ n = 3, sponsored = null } = {}) {
      const today = haitiDay();
      const rows = await db.all(`SELECT a.* FROM portal_ad a WHERE ${ACTIVE_AD}${sponsored == null ? '' : ' AND a.sponsored = ?'} ORDER BY a.sponsored, a.starts_on DESC, a.id DESC LIMIT ?`,
        today, today, ...(sponsored == null ? [] : [sponsored ? 1 : 0]), n);
      return rows.map((a) => ({ id: Number(a.id), sponsored: !!Number(a.sponsored), sponsor: a.sponsor, title_fr: a.title_fr, title_ht: a.title_ht, text_fr: a.text_fr, text_ht: a.text_ht,
        image: a.image_id ? Number(a.image_id) : null, starts_on: a.starts_on, ends_on: a.ends_on, link: !!a.url }));
    },
    async partners() {
      return (await db.all("SELECT name, portal_logo_id FROM school WHERE portal_partner = 1 AND status = 'active' ORDER BY name"))
        .map((s) => ({ name: s.name, logo: s.portal_logo_id ? Number(s.portal_logo_id) : null }));
    },
    async sitemap() {
      return db.all(`SELECT i.id, i.kind, i.updated_at, i.published_at ${FROM} WHERE ${VISIBLE} AND i.kind IN ('evenement','article','temoignage') ORDER BY i.id DESC LIMIT 5000`);
    },
    // Image publique : seulement si elle illustre un contenu publié (lauréat mineur : consentements requis), une annonce
    // en cours ou le logo d'une école partenaire active. Sinon : introuvable.
    async image(id, thumb) {
      const n = Number(id); const today = haitiDay();
      const usedBy = await db.get(`SELECT i.minor, i.consent_school, i.consent_parent, i.kind ${FROM} WHERE ${VISIBLE} AND i.image_id = ? LIMIT 1`, n);
      let ok = usedBy && (usedBy.kind !== 'laureat' || consented(usedBy));
      if (!ok) ok = !!(await db.get(`SELECT 1 AS x FROM portal_ad a WHERE ${ACTIVE_AD} AND a.image_id = ?`, today, today, n));
      if (!ok) ok = !!(await db.get("SELECT 1 AS x FROM school WHERE portal_partner = 1 AND status = 'active' AND portal_logo_id = ?", n));
      if (!ok) return null;
      const im = await db.get('SELECT mime, data, thumb_mime, thumb FROM portal_image WHERE id = ?', n);
      if (!im) return null;
      return thumb && im.thumb ? { buf: Buffer.from(im.thumb, 'base64'), type: im.thumb_mime } : { buf: Buffer.from(im.data, 'base64'), type: im.mime };
    },
  };
  return api;
}

/* ---------- Clics sur les annonces ---------- */
// Un clic compté par visiteur, par annonce et par jour : empreinte HMAC (sel quotidien aléatoire, gardé en mémoire)
// de l'adresse et du navigateur, jamais enregistrée en base. Seul un compteur journalier est écrit.
let salt = { day: null, key: null, seen: new Set() };
async function click(db, id, req, ip) {
  const today = haitiDay();
  const a = await db.get(`SELECT a.id, a.url FROM portal_ad a WHERE a.id = ? AND ${ACTIVE_AD}`, Number(id), today, today);
  if (!a || !a.url) return null;
  if (salt.day !== today) salt = { day: today, key: crypto.randomBytes(32), seen: new Set() };
  const fp = crypto.createHmac('sha256', salt.key).update(`${ip}|${req.headers['user-agent'] || ''}|${a.id}`).digest('base64url').slice(0, 22);
  if (!salt.seen.has(fp)) {
    if (salt.seen.size > 100000) salt.seen.clear();
    salt.seen.add(fp);
    await db.run(`INSERT INTO portal_ad_click (ad_id, day, clicks) VALUES (?,?,1)
      ON CONFLICT (ad_id, day) DO UPDATE SET clicks = portal_ad_click.clicks + 1`, a.id, today);
  }
  return a.url;
}

/* ---------- Routes des écoles (direction) ---------- */
const OWN_COLS = `id, kind, status, title_fr, title_ht, body_fr, body_ht, category, event_date, event_end, place, department, author, person_name,
  school_name, year, exam, exam_type, mention, minor, consent_school, consent_parent, consent_parent_name, consent_at, image_id, created_at, updated_at,
  moderated_at, moderation_reason, published_at`;
function schoolRoutes() {
  const direction = async (ctx, u, action, id) => { if (!P.has(u, 'direction')) await refuse(ctx, u, action, 'portal_item', id, 'réservé à la direction'); };
  return [
    ['GET', /^\/api\/portail\/propositions$/, async (db, req, u, _m, ctx) => {
      await direction(ctx, u, 'portail.lire', null);
      const rows = await db.all(`SELECT ${OWN_COLS} FROM portal_item WHERE school_id = ? ORDER BY id DESC LIMIT 200`, u.school_id);
      const s = await db.get('SELECT portal_partner, portal_partner_at, portal_logo_id FROM school WHERE id = ?', u.school_id);
      return { propositions: rows.map((r) => ({ ...r, minor: !!Number(r.minor), consent_school: !!Number(r.consent_school), consent_parent: !!Number(r.consent_parent), image: !!r.image_id })),
        partenaire: { actif: !!Number(s.portal_partner), depuis: s.portal_partner_at, logo: !!s.portal_logo_id }, limite_heure: PROPOSALS_PER_HOUR };
    }],
    ['POST', /^\/api\/portail\/propositions$/, async (db, req, u, _m, ctx) => {
      await direction(ctx, u, 'portail.proposer', null);
      const b = req.body || {};
      const keys = [`portail:e:${u.school_id}`];
      const wait = ctx.portalLimit ? await ctx.portalLimit.blocked(keys) : 0;
      if (wait) throw new HttpError(429, 'trop de propositions pour cette école, réessayez plus tard', { 'retry-after': String(Math.ceil(wait / 1000)) });
      const school = await db.get('SELECT name FROM school WHERE id = ?', u.school_id);
      const o = readItem(b, b.kind, { label: `direction, compte n° ${u.id}` });
      if (o.kind === 'laureat') o.school_name = school.name; // une école ne propose que SES lauréats
      if (o.kind === 'laureat' && o.minor && o.consent_parent && !o.consent_school) throw new HttpError(400, 'consentement de l’école requis avec celui du parent');
      const imageId = b.image ? await saveImage(db, b.image, { school_id: u.school_id, created_by: u.id }) : null;
      const cols = Object.keys(o);
      const id = await db.insert(`INSERT INTO portal_item (${cols.join(', ')}, school_id, status, image_id, created_by) VALUES (${cols.map(() => '?').join(',')},?,?,?,?)`,
        ...cols.map((k) => o[k]), u.school_id, 'en_attente', imageId, u.id);
      if (ctx.portalLimit) await ctx.portalLimit.fail(keys);
      await audit(db, u, 'portail.proposer', 'portal_item', id, `${o.kind}${o.kind === 'laureat' && o.minor ? ` mineur (consentement école ${o.consent_school ? 'oui' : 'non'}, parent ${o.consent_parent ? 'oui' : 'non'})` : ''}${imageId ? ' avec image' : ''}`);
      return { id, status: 'en_attente' };
    }],
    ['POST', /^\/api\/portail\/propositions\/(\d+)\/retirer$/, async (db, req, u, [id], ctx) => {
      await direction(ctx, u, 'portail.retirer', id);
      const r = await db.run("UPDATE portal_item SET status = 'retire', updated_at = ? WHERE id = ? AND school_id = ? AND status = 'en_attente'", iso(), int(id), u.school_id);
      if (!r.changes) notFound();
      await audit(db, u, 'portail.retirer', 'portal_item', id, null);
      return { id: Number(id), status: 'retire' };
    }],
    ['GET', /^\/api\/portail\/partenaire$/, async (db, req, u, _m, ctx) => {
      await direction(ctx, u, 'portail.lire', null);
      const s = await db.get('SELECT portal_partner, portal_partner_at, portal_logo_id FROM school WHERE id = ?', u.school_id);
      return { actif: !!Number(s.portal_partner), depuis: s.portal_partner_at, logo: !!s.portal_logo_id };
    }],
    // École partenaire : la direction accepte (ou cesse) d'apparaître sur le portail, avec une vignette de logo.
    ['PUT', /^\/api\/portail\/partenaire$/, async (db, req, u, _m, ctx) => {
      await direction(ctx, u, 'portail.partenaire', null);
      const b = req.body || {};
      if (typeof b.actif !== 'boolean') throw new HttpError(400, 'actif : vrai ou faux');
      const logoId = b.logo ? await saveImage(db, { data: b.logo }, { school_id: u.school_id, created_by: u.id }, { logo: true }) : null;
      const sets = ['portal_partner = ?', 'portal_partner_at = ?']; const vals = [b.actif ? 1 : 0, b.actif ? iso() : null];
      if (logoId) { sets.push('portal_logo_id = ?'); vals.push(logoId); }
      if (b.logo === null) sets.push('portal_logo_id = NULL');
      await db.run(`UPDATE school SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...vals, u.school_id);
      await audit(db, u, 'portail.partenaire', 'school', u.school_id, `${b.actif ? 'partenaire du portail' : 'retrait du portail'}${logoId ? ', nouveau logo' : ''}${b.logo === null ? ', logo retiré' : ''}`);
      bump();
      return { actif: b.actif, logo: logoId ? true : undefined };
    }],
  ];
}

/* ---------- Routes du super-admin ---------- */
function readAd(b, prev = {}) {
  const o = {};
  o.sponsored = b.sponsored === undefined ? (prev.sponsored ?? 1) : (bool(b.sponsored) ? 1 : 0);
  o.sponsor = clean(b.sponsor, 80, 'annonceur');
  if (o.sponsored && !o.sponsor) throw new HttpError(400, 'annonceur obligatoire pour un encart sponsorisé');
  o.title_fr = clean(b.title_fr, 140, 'titre (français)'); o.title_ht = clean(b.title_ht, 140, 'titre (kreyòl)');
  if (!o.title_fr && !o.title_ht) throw new HttpError(400, 'titre obligatoire (français ou kreyòl)');
  o.text_fr = clean(b.text_fr, 600, 'texte (français)', { multiline: true }); o.text_ht = clean(b.text_ht, 600, 'texte (kreyòl)', { multiline: true });
  o.url = httpsUrl(b.url);
  o.starts_on = day(b.starts_on, 'date de début', true); o.ends_on = day(b.ends_on, 'date de fin', true);
  if (o.ends_on < o.starts_on) throw new HttpError(400, 'la date de fin précède la date de début');
  return o;
}
const reason = (b, required = true) => {
  const r = clean((b || {}).reason, 300, 'motif');
  if (required && (!r || r.length < 3)) throw new HttpError(400, 'motif obligatoire (3 à 300 caractères)');
  return r;
};
function adminRoutes({ log }) {
  const getItem = async (db, id) => { const r = await db.get('SELECT * FROM portal_item WHERE id = ?', int(id)); if (!r) throw new HttpError(404, 'introuvable'); return r; };
  const LIST = `SELECT i.*, s.name AS school, s.status AS school_status FROM portal_item i LEFT JOIN school s ON s.id = i.school_id`;
  const shape = (r) => ({ ...r, minor: !!Number(r.minor), consent_school: !!Number(r.consent_school), consent_parent: !!Number(r.consent_parent), featured: !!Number(r.featured),
    public_name: r.kind === 'laureat' ? (consented(r) ? r.person_name : initials(r.person_name)) : undefined });
  // Bloc 8 : e-mail groupé aux abonnés du portail à la publication (une fois par contenu, en tâche de fond).
  const notify = (db, req, ctx, kind, id) => { if (ctx && ['evenement', 'laureat', 'annonce', 'article', 'temoignage'].includes(kind)) require('./portail-public').notifyPublished(db, ctx, kind, id, require('./app').linkBase(req, ctx) || 'https://noriaedu.com'); };
  const move = async (db, req, a, id, to, from, why, action, ctx) => {
    const r = await getItem(db, id);
    const now = iso();
    const upd = await db.run(`UPDATE portal_item SET status = ?, moderated_by = ?, moderated_at = ?, moderation_reason = ?, updated_at = ?${to === 'publie' ? ', published_at = ?' : ''}
      WHERE id = ? AND status IN (${from.map(() => '?').join(',')})`, to, a.id, now, why, now, ...(to === 'publie' ? [now] : []), r.id, ...from);
    if (!upd.changes) throw new HttpError(409, `statut actuel « ${r.status} » : action impossible`);
    await log(db, a, `admin.portail.${action}`, r.id, `${r.kind}${r.school_id ? ` école ${r.school_id}` : ''}${why ? ` — ${why}` : ''}`, 'ok', req.ip);
    bump();
    if (to === 'publie') notify(db, req, ctx, r.kind, r.id);
    return { id: r.id, status: to };
  };
  return [
    ['GET', /^\/api\/admin\/portail\/resume$/, async (db) => {
      const today = haitiDay();
      const rows = await db.all('SELECT status, kind, COUNT(*) AS n FROM portal_item GROUP BY status, kind');
      const ads = Number((await db.get(`SELECT COUNT(*) AS n FROM portal_ad a WHERE ${ACTIVE_AD}`, today, today)).n);
      const partners = Number((await db.get("SELECT COUNT(*) AS n FROM school WHERE portal_partner = 1 AND status = 'active'")).n);
      return { compteurs: rows.map((r) => ({ ...r, n: Number(r.n) })), en_attente: rows.filter((r) => r.status === 'en_attente').reduce((s, r) => s + Number(r.n), 0), annonces_en_cours: ads, partenaires: partners };
    }, { auth: true, quiet: true }],
    ['GET', /^\/api\/admin\/portail\/elements$/, async (db, req) => {
      const st = req.query.get('statut'); const k = req.query.get('type');
      const c = []; const p = [];
      if (st) { oneOf(st, ['en_attente', 'publie', 'refuse', 'retire', 'depublie'], 'statut'); c.push('i.status = ?'); p.push(st); }
      if (k) { oneOf(k, KINDS, 'type'); c.push('i.kind = ?'); p.push(k); }
      const rows = await db.all(`${LIST}${c.length ? ` WHERE ${c.join(' AND ')}` : ''} ORDER BY CASE WHEN i.status = 'en_attente' THEN 0 ELSE 1 END, i.id DESC LIMIT 300`, ...p);
      return rows.map(shape);
    }, { auth: true }],
    // Création directe par le super-admin : publiée tout de suite, sauf « brouillon » (reste en attente).
    ['POST', /^\/api\/admin\/portail\/elements$/, async (db, req, a, _m, ctx) => {
      const b = req.body || {};
      const o = readItem(b, b.kind, { label: `super-admin n° ${a.id}` });
      const id = await db.tx(async (t) => {
        const imageId = b.image ? await saveImage(t, b.image, { created_by_admin: a.id }) : null;
        const pubNow = !bool(b.brouillon); const now = iso();
        const cols = Object.keys(o);
        const nid = await t.insert(`INSERT INTO portal_item (${cols.join(', ')}, status, image_id, created_by_admin, featured, moderated_by, moderated_at, published_at)
          VALUES (${cols.map(() => '?').join(',')},?,?,?,?,?,?,?)`, ...cols.map((x) => o[x]), pubNow ? 'publie' : 'en_attente', imageId, a.id, bool(b.featured) ? 1 : 0,
        pubNow ? a.id : null, pubNow ? now : null, pubNow ? now : null);
        await log(t, a, 'admin.portail.creer', nid, `${o.kind}${pubNow ? ' publié' : ' brouillon'}${imageId ? ' avec image' : ''}`, 'ok', req.ip);
        return nid;
      });
      bump();
      if (!bool(b.brouillon)) notify(db, req, ctx, o.kind, id);
      return { id, status: bool(b.brouillon) ? 'en_attente' : 'publie' };
    }, { auth: true, write: true }],
    // Correction par le super-admin (motif obligatoire) : le statut ne change pas.
    ['PUT', /^\/api\/admin\/portail\/elements\/(\d+)$/, async (db, req, a, [id]) => {
      const r = await getItem(db, id); const b = req.body || {};
      const why = reason(b);
      const merged = { ...r, ...b, minor: b.minor === undefined ? !!Number(r.minor) : b.minor };
      if (b.consent_parent === undefined && r.kind === 'laureat') { merged.consent_parent = !!Number(r.consent_parent); merged.consent_school = b.consent_school === undefined ? !!Number(r.consent_school) : b.consent_school; }
      const o = readItem(merged, r.kind, { label: `super-admin n° ${a.id}` });
      if (r.kind === 'laureat' && o.minor && Number(r.consent_parent) && o.consent_parent && b.consent_parent === undefined) { o.consent_at = r.consent_at; o.consent_by = r.consent_by; o.consent_parent_name = r.consent_parent_name; }
      await db.tx(async (t) => {
        const imageId = b.image ? await saveImage(t, b.image, { created_by_admin: a.id }) : (b.image === null ? null : r.image_id);
        const cols = Object.keys(o).filter((k) => k !== 'kind');
        await t.run(`UPDATE portal_item SET ${cols.map((k) => `${k} = ?`).join(', ')}, image_id = ?, updated_at = ? WHERE id = ?`, ...cols.map((k) => o[k]), imageId, iso(), r.id);
        await log(t, a, 'admin.portail.modifier', r.id, `${r.kind} — ${why}`, 'ok', req.ip);
      });
      bump();
      return { id: r.id, status: r.status };
    }, { auth: true, write: true }],
    ['POST', /^\/api\/admin\/portail\/elements\/(\d+)\/publier$/, async (db, req, a, [id], ctx) => move(db, req, a, id, 'publie', ['en_attente', 'depublie', 'refuse'], reason(req.body, false), 'publier', ctx), { auth: true, write: true }],
    ['POST', /^\/api\/admin\/portail\/elements\/(\d+)\/refuser$/, async (db, req, a, [id]) => move(db, req, a, id, 'refuse', ['en_attente'], reason(req.body), 'refuser'), { auth: true, write: true }],
    ['POST', /^\/api\/admin\/portail\/elements\/(\d+)\/depublier$/, async (db, req, a, [id]) => move(db, req, a, id, 'depublie', ['publie'], reason(req.body), 'depublier'), { auth: true, write: true }],
    ['POST', /^\/api\/admin\/portail\/elements\/(\d+)\/une$/, async (db, req, a, [id]) => {
      const r = await getItem(db, id); const on = bool((req.body || {}).featured);
      await db.run('UPDATE portal_item SET featured = ?, updated_at = ? WHERE id = ?', on ? 1 : 0, iso(), r.id);
      await log(db, a, 'admin.portail.une', r.id, on ? 'mis à la une' : 'retiré de la une', 'ok', req.ip);
      bump();
      return { id: r.id, featured: on };
    }, { auth: true, write: true }],
    // Aperçu d'une image (toute image, publiée ou non) pour la modération.
    ['GET', /^\/api\/admin\/portail\/images\/(\d+)(-v)?$/, async (db, req, a, [id, v]) => {
      const im = await db.get('SELECT mime, data, thumb_mime, thumb FROM portal_image WHERE id = ?', int(id));
      if (!im) throw new HttpError(404, 'introuvable');
      return v && im.thumb ? { __file: Buffer.from(im.thumb, 'base64'), type: im.thumb_mime, inline: true, cache: 'private, max-age=600' }
        : { __file: Buffer.from(im.data, 'base64'), type: im.mime, inline: true, cache: 'private, max-age=600' };
    }, { auth: true, quiet: true }],
    ['GET', /^\/api\/admin\/portail\/annonces$/, async (db) => {
      const since = haitiDay(new Date(Date.now() - 29 * 86400e3));
      return db.all(`SELECT a.*, (SELECT COALESCE(SUM(c.clicks), 0) FROM portal_ad_click c WHERE c.ad_id = a.id) AS clics,
        (SELECT COALESCE(SUM(c.clicks), 0) FROM portal_ad_click c WHERE c.ad_id = a.id AND c.day >= ?) AS clics_30j FROM portal_ad a ORDER BY a.id DESC LIMIT 200`, since)
        .then((rows) => rows.map((r) => ({ ...r, sponsored: !!Number(r.sponsored), active: !!Number(r.active), clics: Number(r.clics), clics_30j: Number(r.clics_30j) })));
    }, { auth: true }],
    ['POST', /^\/api\/admin\/portail\/annonces$/, async (db, req, a, _m, ctx) => {
      const b = req.body || {}; const o = readAd(b);
      const id = await db.tx(async (t) => {
        const imageId = b.image ? await saveImage(t, b.image, { created_by_admin: a.id }) : null;
        const cols = Object.keys(o);
        const nid = await t.insert(`INSERT INTO portal_ad (${cols.join(', ')}, image_id, created_by_admin) VALUES (${cols.map(() => '?').join(',')},?,?)`, ...cols.map((k) => o[k]), imageId, a.id);
        await log(t, a, 'admin.portail.annonce.creer', nid, `${o.sponsored ? `sponsorisé (${o.sponsor})` : 'annonce'} du ${o.starts_on} au ${o.ends_on}`, 'ok', req.ip);
        return nid;
      });
      bump();
      if (o.active !== 0) notify(db, req, ctx, 'annonce', id);
      return { id };
    }, { auth: true, write: true }],
    ['PUT', /^\/api\/admin\/portail\/annonces\/(\d+)$/, async (db, req, a, [id]) => {
      const prev = await db.get('SELECT * FROM portal_ad WHERE id = ?', int(id));
      if (!prev) throw new HttpError(404, 'introuvable');
      const b = req.body || {}; const o = readAd({ ...prev, ...b }, prev);
      await db.tx(async (t) => {
        const imageId = b.image ? await saveImage(t, b.image, { created_by_admin: a.id }) : (b.image === null ? null : prev.image_id);
        const cols = Object.keys(o);
        await t.run(`UPDATE portal_ad SET ${cols.map((k) => `${k} = ?`).join(', ')}, image_id = ?, updated_at = ? WHERE id = ?`, ...cols.map((k) => o[k]), imageId, iso(), prev.id);
        await log(t, a, 'admin.portail.annonce.modifier', prev.id, `du ${o.starts_on} au ${o.ends_on}`, 'ok', req.ip);
      });
      bump();
      return { id: prev.id };
    }, { auth: true, write: true }],
    ['POST', /^\/api\/admin\/portail\/annonces\/(\d+)\/(activer|desactiver)$/, async (db, req, a, [id, op], ctx) => {
      const r = await db.run('UPDATE portal_ad SET active = ?, updated_at = ? WHERE id = ?', op === 'activer' ? 1 : 0, iso(), int(id));
      if (!r.changes) throw new HttpError(404, 'introuvable');
      await log(db, a, `admin.portail.annonce.${op}`, id, null, 'ok', req.ip);
      bump();
      if (op === 'activer') notify(db, req, ctx, 'annonce', Number(id));
      return { id: Number(id), active: op === 'activer' };
    }, { auth: true, write: true }],
    ['GET', /^\/api\/admin\/portail\/partenaires$/, async (db) => (await db.all('SELECT id, slug, name, status, portal_partner_at, portal_logo_id FROM school WHERE portal_partner = 1 ORDER BY name'))
      .map((s) => ({ ...s, logo: s.portal_logo_id ? Number(s.portal_logo_id) : null })), { auth: true }],
  ];
}

module.exports = { FEED_CATS, feedCat, schoolRoutes, adminRoutes, createPublic, click, clean, checkImage, jpegClean, webpClean, readItem, publicItem, consented, initials, httpsUrl, haitiDay,
  bump, currentVersion, saveImage, KINDS, CATEGORIES, DEPARTMENTS, IMG_MAX, THUMB_MAX, PROPOSALS_PER_HOUR };
