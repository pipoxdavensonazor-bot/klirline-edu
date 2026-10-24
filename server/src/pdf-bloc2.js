'use strict';
// Documents du bloc 2 : badge élève (carte CR80, à l'unité ou en planche A4 de 8 ou 10) et relevé de notes officiel
// (en-tête complet de l'école, notes publiées, moyennes, barème, signature du directeur, sceau, QR de vérification).
const { Page, buildDoc, schoolHeader, jpegSize } = require('./pdf');
const { code128Modules } = require('./codes-barres');

const MM = 72 / 25.4;
const CR80 = [85.6 * MM, 53.98 * MM]; // 242,65 × 153,01 pt
const n2 = (v) => (v == null ? '-' : Number(v).toFixed(2));
const cut = (s, max) => { s = String(s || ''); return s.length > max ? `${s.slice(0, max - 1)}.` : s; };

// Image JPEG ajustée dans une boîte (centrée).
function fit(p, buf, x, y, w, h) {
  const d = buf && jpegSize(buf); if (!d) return false;
  const k = Math.min(w / d.width, h / d.height); const iw = d.width * k, ih = d.height * k;
  p.image(x + (w - iw) / 2, y + (h - ih) / 2, iw, ih, { data: buf, ...d });
  return true;
}

// Code 128 dessiné en rectangles noirs dans la boîte (x, y, w, h) ; module ≤ 1,5 pt, 10 modules de silence de chaque côté.
function barcode(p, text, x, y, w, h) {
  let mods; try { mods = code128Modules(text); } catch { return false; }
  const total = [...mods].reduce((a, d) => a + Number(d), 0) + 20;
  const m = Math.min(1.5, w / total); let cx = x + (w - total * m) / 2 + 10 * m, bar = true;
  p.rect(x, y, w, h, 1);
  for (const d of mods) { const bw = Number(d) * m; if (bar) p.rect(cx, y, bw, h, 0); cx += bw; bar = !bar; }
  return true;
}

// Un badge, coin inférieur gauche en (ox, oy). b : { school:{name, initials, logo}, photo, first_name, last_name,
// class_name, code, year, expires_on, url, status }.
function drawBadge(p, b, ox = 0, oy = 0) {
  const [W, H] = CR80;
  p.rect(ox, oy, W, H, 1);
  // Bandeau : logo (ou initiales) et nom de l'école.
  p.rect(ox, oy + H - 34, W, 34, 0.13);
  if (!fit(p, b.school.logo, ox + 6, oy + H - 31, 28, 28)) {
    p.rect(ox + 6, oy + H - 31, 28, 28, 0.3);
    p.text(ox + 9, oy + H - 21, cut(b.school.initials, 4), { size: 8, bold: true, gray: 1 });
  }
  p.text(ox + 40, oy + H - 15, cut(b.school.name, 38), { size: 8.5, bold: true, gray: 1 });
  p.text(ox + 40, oy + H - 26, `Carte d'élève / Kat elèv  ${b.year}`, { size: 6.5, gray: 0.85 });
  // Photo portrait 3:4 (ou initiales).
  const pw = 51, ph = 68, px = ox + 10, py = oy + 38;
  if (!fit(p, b.photo, px, py, pw, ph)) {
    p.rect(px, py, pw, ph, 0.88);
    p.text(px + 13, py + 28, `${(b.first_name || '?')[0]}${(b.last_name || '?')[0]}`.toUpperCase(), { size: 16, bold: true, gray: 0.45 });
  }
  const tx = ox + 70;
  p.text(tx, oy + 106, cut(String(b.last_name || '').toUpperCase(), 18), { size: 9.5, bold: true });
  p.text(tx, oy + 96, cut(b.first_name, 20), { size: 8.5 });
  p.text(tx, oy + 85, 'Classe / Klas  -  Année / Ane', { size: 5.5, gray: 0.45 }); p.text(tx, oy + 77, cut(`${b.class_name || '-'}  ${b.year}`, 24), { size: 7.5, bold: true });
  p.text(tx, oy + 66, 'Code élève / Kòd elèv', { size: 5.5, gray: 0.45 }); p.text(tx, oy + 58, b.code, { size: 7.5, bold: true });
  // Bloc 7 : adresse e-mail NORIA, seulement quand elle est active.
  if (b.email) p.text(tx, oy + 46, cut(b.email, 30), { size: 5, gray: 0.3 });
  p.qr(ox + W - 68, oy + 38, 62, b.url);
  // Code-barres Code 128 du code élève (comme l'écran « Mon badge »), pleine largeur, zones de silence comprises.
  barcode(p, b.code, ox + 8, oy + 18, W - 16, 17);
  p.line(ox, oy + 15, ox + W, oy + 15, 0.3, 0.8);
  p.text(ox + 8, oy + 6, `Expire le / Ekspire ${b.expires_on}  -  Scanner pour vérifier / Eskane pou verifye`, { size: 5.2, gray: 0.35 });
  if (b.status && b.status !== 'valide') {
    p.rect(ox + 70, oy + 60, 100, 22, 0.15);
    p.text(ox + 78, oy + 67, b.status === 'revoque' ? 'RÉVOQUÉ / REVOKE' : 'EXPIRÉ / EKSPIRE', { size: 9, bold: true, gray: 1 });
  }
}

function badgePdf(b) {
  const p = new Page(); drawBadge(p, b);
  return buildDoc([p], { title: `Badge ${b.code} ${b.year}`, size: CR80 });
}

// Planche A4 : 2 colonnes × 4 (8 badges) ou × 5 (10 badges), traits de coupe.
function badgeSheetPdf(list, per = 10, title = 'Badges') {
  const [W, H] = CR80; const rows = per === 8 ? 4 : 5;
  const mx = (595 - 2 * W) / 2, my = (842 - rows * H) / 2;
  const pages = [];
  for (let i = 0; i < list.length; i += per) {
    const p = new Page();
    list.slice(i, i + per).forEach((b, k) => {
      const col = k % 2, row = Math.floor(k / 2);
      const ox = mx + col * W, oy = 842 - my - (row + 1) * H;
      drawBadge(p, b, ox, oy);
    });
    // Traits de coupe (gris clair).
    for (let r = 0; r <= rows; r++) p.line(mx - 12, my + r * H, 595 - mx + 12, my + r * H, 0.25, 0.75);
    for (let c = 0; c <= 2; c++) p.line(mx + c * W, my - 12, mx + c * W, 842 - my + 12, 0.25, 0.75);
    p.text(mx, 14, `${title}  -  page ${pages.length + 1}`, { size: 7, gray: 0.5 });
    pages.push(p);
  }
  if (!pages.length) pages.push(new Page().text(50, 800, 'Aucun badge valide / Pa gen badj ki valab', { size: 12 }));
  return buildDoc(pages, { title });
}

// Relevé officiel. r : { school (profil + logo, seal, signature, signature_name), student, code, birth_date, className,
// scopeLabel, scope, terms:[{name, subjects:[{name, coefficient, notes:[...], average}], general}], annual, scale,
// verifyUrl, keyId, issuedAt, issuer }
function transcriptPdf(r) {
  const p = new Page(); const L = 50, R = 545;
  schoolHeader(p, r.school);
  p.text(L, 712, 'Relevé de notes officiel / Relve nòt ofisyèl', { size: 16, bold: true });
  p.text(L, 695, r.scopeLabel, { size: 11, gray: 0.25 });
  const info = [['Élève / Elèv', r.student], ['Code élève / Kòd elèv', r.studentCode], ['Classe / Klas', r.className || '-'], ['Date de naissance / Dat nesans', r.birthDate || '-']];
  if (r.studentEmail) info.push(['E-mail NORIA / Imèl NORIA', r.studentEmail]); // bloc 7 : adresse active seulement
  let y = 672;
  for (const [k, v] of info) { p.text(L, y, k, { size: 9, gray: 0.35 }); p.text(200, y, v, { size: 10, bold: k.startsWith('Élève') }); y -= 14; }
  y -= 8;
  const row = (cells, xs, opt) => cells.forEach((c, i) => p.text(xs[i], y, c, opt));
  if (r.scope === 'periode') {
    const t = r.terms[0]; const xs = [L + 6, 250, 290, 485];
    p.rect(L, y - 5, R - L, 18, 0.9); row(['Matière / Matyè', 'Coef.', 'Notes publiées / Nòt ki pibliye', `Moy. /${r.scale}`], xs, { bold: true, size: 9 }); y -= 18;
    for (const s of t.subjects) {
      row([cut(s.name, 34), String(s.coefficient), cut(s.notes.join('  ·  ') || '-', 52), n2(s.average)], xs, { size: 9 });
      p.line(L, y - 5, R, y - 5, 0.3, 0.85); y -= 16;
    }
    p.rect(L, y - 7, R - L, 20, 0.86);
    p.text(L + 6, y, 'Moyenne générale / Mwayèn jeneral', { bold: true, size: 10 }); p.text(485, y, n2(t.general), { bold: true, size: 11 }); y -= 24;
  } else {
    const xs = [L + 6, 220]; const tw = (R - 260) / (r.terms.length + 1);
    r.terms.forEach((_t, i) => xs.push(260 + i * tw)); xs.push(260 + r.terms.length * tw);
    p.rect(L, y - 5, R - L, 18, 0.9);
    row(['Matière / Matyè', 'Coef.', ...r.terms.map((t) => cut(t.name, 12)), 'Année / Ane'], xs, { bold: true, size: 8.5 }); y -= 18;
    for (const s of r.annual.subjects) {
      row([cut(s.name, 30), String(s.coefficient), ...s.byTerm.map(n2), n2(s.average)], xs, { size: 9 });
      p.line(L, y - 5, R, y - 5, 0.3, 0.85); y -= 16;
    }
    p.rect(L, y - 7, R - L, 20, 0.86);
    row(['Moyenne générale / Mwayèn jeneral', '', ...r.terms.map((t) => n2(t.general)), n2(r.annual.general)], xs, { bold: true, size: 9 }); y -= 24;
  }
  // Barème.
  p.text(L, y, 'Barème / Echèl nòt', { bold: true, size: 9 });
  p.text(L, y - 12, `Notes publiées seulement, ramenées sur ${r.scale}, pondérées par le coefficient de l'évaluation ; moyenne générale pondérée par le`, { size: 7.5, gray: 0.3 });
  p.text(L, y - 22, `coefficient de la matière. Seuil de réussite : ${n2(r.scale / 2)} / ${r.scale}. Absences et dispenses non comptées.${r.scope === 'annee' ? ' Moyenne annuelle : moyenne des périodes notées.' : ''}`, { size: 7.5, gray: 0.3 });
  // Signature du directeur et sceau.
  const sy = 200;
  p.text(L, sy + 74, 'Le directeur / Direktè a', { size: 9, gray: 0.35 });
  fit(p, r.school.signature, L, sy + 14, 150, 55);
  p.line(L, sy + 12, L + 170, sy + 12, 0.4, 0.5);
  p.text(L, sy, r.school.signature_name || '', { size: 9, bold: true });
  if (!fit(p, r.school.seal, 235, sy + 4, 80, 80)) {
    p.rect(240, sy + 14, 64, 64, 0.92); p.text(252, sy + 42, String(r.school.initials || '').slice(0, 4), { size: 13, bold: true, gray: 0.5 });
  }
  p.text(L, sy - 14, `Signé électroniquement le ${r.issuedAt.slice(0, 10)} (Ed25519, clé ${r.keyId}).`, { size: 7.5, gray: 0.3 });
  // Vérification.
  p.qr(R - 120, 70, 120, r.verifyUrl);
  p.text(L, 160, 'Vérifier ce relevé / Verifye relve sa a', { bold: true, size: 10 });
  p.text(L, 146, 'Scannez le QR code : la page indique si le fichier est authentique ou modifié.', { size: 8, gray: 0.3 });
  p.text(L, 134, r.verifyUrl.length > 72 ? `${r.verifyUrl.slice(0, 72)}...` : r.verifyUrl, { size: 7.5 });
  p.text(L, 118, `Code de vérification : ${r.code}`, { size: 10, bold: true });
  p.text(L, 102, `Émis le ${r.issuedAt.slice(0, 10)} par ${r.issuer}`, { size: 8.5, gray: 0.3 });
  p.line(L, 60, R, 60, 0.4, 0.8);
  p.text(L, 46, 'Document de démonstration - données fictives. NORIA est un produit de Klirline Inc.', { size: 8, gray: 0.4 });
  return buildDoc([p], { title: `Relevé ${r.studentCode} - ${r.scopeLabel}` });
}

module.exports = { barcode, badgePdf, badgeSheetPdf, transcriptPdf, CR80 };
