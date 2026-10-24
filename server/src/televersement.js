'use strict';
// Téléversements sans dépendance : lecture d'un corps multipart/form-data borné et vérification du type réel d'un fichier
// par sa signature (octets magiques). Le type annoncé par le navigateur et l'extension ne sont jamais crus seuls.
const { HttpError } = require('./common');

const DOC_MAX = 5 * 1024 * 1024; // 5 Mo par document officiel
const TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

// Signature réelle du contenu : PDF (%PDF-), JPEG (FF D8 FF), PNG (89 50 4E 47 0D 0A 1A 0A). Rend le type MIME ou null.
function sniff(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8) return null;
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

// Nom de fichier affichable et sûr dans un en-tête Content-Disposition : lettres, chiffres, . _ - seulement.
function safeName(name, mime) {
  const ext = TYPES[mime] || 'bin';
  const base = String(name || '').replace(/\.[^.]*$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'document';
  return `${base}.${ext}`;
}

// Vérifie un fichier téléversé : non vide, ≤ max, type réel autorisé et cohérent avec le type annoncé (s'il est donné).
// Rend { mime, filename } ou lève une erreur 400/413 au message neutre (code : vide, taille, type).
function checkFile(file, { max = DOC_MAX, allowed = Object.keys(TYPES) } = {}) {
  if (!file || !file.data || !file.data.length) throw Object.assign(new HttpError(400, 'document manquant'), { code: 'vide' });
  if (file.data.length > max) throw Object.assign(new HttpError(413, 'document trop volumineux'), { code: 'taille' });
  const mime = sniff(file.data);
  if (!mime || !allowed.includes(mime)) throw Object.assign(new HttpError(400, 'type de document refusé'), { code: 'type' });
  const declared = String(file.type || '').toLowerCase().split(';')[0].trim();
  const alias = declared === 'image/jpg' || declared === 'image/pjpeg' ? 'image/jpeg' : declared;
  if (alias && alias !== 'application/octet-stream' && alias !== mime) throw Object.assign(new HttpError(400, 'type de document refusé'), { code: 'type' });
  return { mime, filename: safeName(file.filename, mime) };
}

// Lit le corps en octets, borné à max (413 au-delà, lecture arrêtée).
async function readBody(req, max) {
  const parts = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new HttpError(413, 'trop volumineux');
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}

// multipart/form-data : rend { fields: {nom: valeur}, files: {nom: {filename, type, data}} }. Un seul fichier par champ,
// 30 parties au plus, en-têtes de partie ≤ 1 Ko ; tout écart → 400.
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]{1,70})"|([^\s;]{1,70}))/i.exec(String(contentType || ''));
  if (!m) throw new HttpError(400, 'formulaire invalide');
  const delim = Buffer.from(`--${m[1] || m[2]}`);
  const fields = {}; const files = {};
  let pos = buf.indexOf(delim);
  if (pos < 0) throw new HttpError(400, 'formulaire invalide');
  let count = 0;
  while (true) {
    pos += delim.length;
    if (buf.subarray(pos, pos + 2).toString() === '--') break; // fin
    if (buf.subarray(pos, pos + 2).toString() !== '\r\n') throw new HttpError(400, 'formulaire invalide');
    pos += 2;
    const headEnd = buf.indexOf('\r\n\r\n', pos);
    if (headEnd < 0 || headEnd - pos > 1024) throw new HttpError(400, 'formulaire invalide');
    const head = buf.subarray(pos, headEnd).toString('utf8');
    const next = buf.indexOf(Buffer.concat([Buffer.from('\r\n'), delim]), headEnd + 4);
    if (next < 0) throw new HttpError(400, 'formulaire invalide');
    const body = buf.subarray(headEnd + 4, next);
    if (++count > 30) throw new HttpError(400, 'formulaire invalide');
    const disp = /content-disposition:\s*form-data;([^\r\n]*)/i.exec(head);
    if (!disp) throw new HttpError(400, 'formulaire invalide');
    const name = (/\bname="([^"]{1,60})"/.exec(disp[1]) || [])[1];
    const fn = /\bfilename="([^"]{0,200})"/.exec(disp[1]);
    if (name) {
      if (fn) {
        if (files[name]) throw new HttpError(400, 'un seul fichier par champ');
        const type = (/content-type:\s*([^\r\n]+)/i.exec(head) || [])[1] || '';
        if (body.length) files[name] = { filename: fn[1], type: type.trim(), data: Buffer.from(body) };
      } else if (body.length <= 20000) fields[name] = body.toString('utf8');
      else throw new HttpError(413, 'champ trop long');
    }
    pos = next + 2;
  }
  return { fields, files };
}

module.exports = { sniff, safeName, checkFile, readBody, parseMultipart, DOC_MAX, TYPES };
