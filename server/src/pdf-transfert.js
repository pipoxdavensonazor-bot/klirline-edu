'use strict';
// Certificat de transfert (bloc 4) : en-tête des deux écoles (logo ou initiales, nom, adresse, contact), élève, parcours
// de la demande (consentement du parent, approbation signée de l'école d'origine, étape ministère s'il y a lieu),
// contenu du dossier transmis, signatures des directions, QR de vérification publique.
const { Page, buildDoc, jpegSize } = require('./pdf');

// Date du jour dans le fuseau de l'école (Haïti par défaut), à partir d'un horodatage UTC ou à décalage.
function day(v) {
  let x = String(v || '').trim(); if (!x) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return x;
  x = x.replace(' ', 'T'); if (/[+-]\d\d$/.test(x)) x += ':00'; else if (!/[zZ]|[+-]\d\d:?\d\d$/.test(x)) x += 'Z';
  const d = new Date(x); if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toLocaleDateString('en-CA', { timeZone: process.env.NORIA_TZ || 'America/Port-au-Prince' });
}
const cut = (s, max) => { s = String(s || ''); return s.length > max ? `${s.slice(0, max - 1)}.` : s; };
function fit(p, buf, x, y, w, h) {
  const d = buf && jpegSize(buf); if (!d) return false;
  const k = Math.min(w / d.width, h / d.height); const iw = d.width * k, ih = d.height * k;
  p.image(x + (w - iw) / 2, y + (h - ih) / 2, iw, ih, { data: buf, ...d });
  return true;
}
// Bloc d'école (demi-largeur) : logo 52 pt, nom, adresse, contact.
function schoolBlock(p, s, x, top, role) {
  p.text(x, top, role, { size: 7.5, bold: true, gray: 0.45 });
  if (!fit(p, s.logo, x, top - 60, 52, 52)) {
    p.rect(x, top - 60, 52, 52, 0.15);
    const ini = String(s.initials || '').slice(0, 4);
    p.text(x + 26 - ini.length * 5.6, top - 40, ini, { size: 14, bold: true, gray: 1 });
  }
  const tx = x + 60;
  p.text(tx, top - 18, cut(s.name, 34), { size: 11, bold: true });
  let y = top - 31;
  if (s.address) { p.text(tx, y, cut(s.address, 52), { size: 7, gray: 0.3 }); y -= 10; }
  const c = [s.email, s.phone].filter(Boolean).join(' · ');
  if (c) { p.text(tx, y, cut(c, 52), { size: 7, gray: 0.3 }); y -= 10; }
  if (s.motto) p.text(tx, y, cut(`« ${s.motto} »`, 46), { size: 7.5, gray: 0.45 });
}

// c : { from, to (profils + logo + signature + signature_name), student, studentCode, birthDate, lastClass, lastYear,
//   requestedAt, consent, originAt, originName, keyId, ministry, transferredAt, summary{classes,decisions,notes,releves},
//   code, verifyUrl, requestSha }
function certificatePdf(c) {
  const p = new Page(); const L = 50, R = 545;
  schoolBlock(p, c.from, L, 806, "ÉCOLE D'ORIGINE / LEKÒL ORIJIN");
  schoolBlock(p, c.to, 305, 806, "ÉCOLE D'ACCUEIL / LEKÒL K AP RESEVWA");
  p.text(R - 34, 818, 'NORIA', { size: 7, bold: true, gray: 0.55 });
  p.line(L, 732, R, 732, 1, 0.2);
  p.text(L, 706, 'Certificat de transfert / Sètifika transfè', { size: 17, bold: true });
  p.text(L, 690, `Dossier scolaire transmis le ${day(c.transferredAt)} / Dosye lekòl la transmèt`, { size: 9.5, gray: 0.3 });
  const kv = (rows, y0) => { let y = y0; for (const [k, v, b] of rows) { p.text(L, y, k, { size: 8.5, gray: 0.35 }); p.text(215, y, cut(v, 62), { size: 9.5, bold: !!b }); y -= 14; } return y; };
  let y = kv([
    ['Élève / Elèv', c.student, true], ['Code élève / Kòd elèv', c.studentCode, true], ['Date de naissance / Dat nesans', c.birthDate || '-'],
    ['Dernière classe / Dènye klas', `${c.lastClass || '-'}${c.lastYear ? ` (${c.lastYear})` : ''}`],
  ], 664);
  y -= 6; p.rect(L, y - 4, R - L, 16, 0.9); p.text(L + 6, y, 'Étapes / Etap yo', { size: 9, bold: true }); y -= 18;
  const consent = c.consent.mode === 'otp' ? `Code à usage unique reçu par le parent rattaché (${c.consent.to || '-'})` : `Case cochée, parent : ${c.consent.parent || '-'}`;
  y = kv([
    ['Demande / Demann', `${day(c.requestedAt)} par ${c.to.name}`],
    ['Consentement du parent / Konsantman', `${consent}, le ${day(c.consent.at)}`],
    ['Approbation origine / Apwobasyon', `${day(c.originAt)} par ${cut(c.originName || 'la direction', 30)} (Ed25519)`],
    ['Ministère / Ministè', c.ministry ? `Approuvé le ${day(c.ministry.at)}${c.ministry.keyId ? ` (Ed25519, clé ${c.ministry.keyId})` : ''}` : 'Étape non requise (désactivée)'],
    ['Transfert / Transfè', `${day(c.transferredAt)} : élève marqué « transféré » à l'origine`],
  ], y);
  y -= 6; p.rect(L, y - 4, R - L, 16, 0.9); p.text(L + 6, y, 'Dossier transmis / Dosye ki transmèt', { size: 9, bold: true }); y -= 18;
  const s = c.summary;
  y = kv([
    ['Identité / Idantite', 'nom, prénom, date de naissance, sexe, code élève'],
    ['Historique des classes / Klas', `${s.classes} inscription(s)`], ['Décisions de fin d\'année', `${s.decisions} décision(s)`],
    ['Notes publiées / Nòt pibliye', `${s.notes} note(s)`], ['Relevés émis / Relve', `${s.releves} relevé(s), avec leur signature d'origine`],
    ['Non transmis / Pa transmèt', 'badges, notes de santé et de famille, signalements'],
  ], y);
  // Signatures des directions.
  const sy = 214;
  p.text(L, sy + 72, "Direction de l'école d'origine", { size: 8.5, gray: 0.35 });
  fit(p, c.from.signature, L, sy + 14, 140, 52); p.line(L, sy + 12, L + 170, sy + 12, 0.4, 0.5);
  p.text(L, sy, cut(c.originName || '', 34), { size: 9, bold: true });
  p.text(305, sy + 72, "Direction de l'école d'accueil", { size: 8.5, gray: 0.35 });
  if (!fit(p, c.to.signature, 305, sy + 14, 140, 52)) p.text(305, sy + 36, '(signature non téléversée)', { size: 8, gray: 0.5 });
  p.line(305, sy + 12, 305 + 170, sy + 12, 0.4, 0.5);
  p.text(305, sy, cut(c.to.signature_name || '', 34), { size: 9, bold: true });
  p.text(L, sy - 16, `Demande signée électroniquement par l'école d'origine (Ed25519, clé ${c.keyId}, empreinte ${String(c.requestSha).slice(0, 16)}...).`, { size: 7.2, gray: 0.3 });
  // Vérification.
  p.qr(R - 112, 66, 112, c.verifyUrl);
  p.text(L, 160, 'Vérifier ce certificat / Verifye sètifika sa a', { bold: true, size: 10 });
  p.text(L, 146, 'Scannez le QR code : la page indique si le certificat est authentique ou modifié.', { size: 8, gray: 0.3 });
  p.text(L, 134, c.verifyUrl.length > 72 ? `${c.verifyUrl.slice(0, 72)}...` : c.verifyUrl, { size: 7.5 });
  p.text(L, 118, `Code de vérification : ${c.code}`, { size: 10, bold: true });
  p.text(L, 102, 'Aucune note ni donnée de santé ne figure sur ce certificat.', { size: 8, gray: 0.3 });
  p.line(L, 58, R, 58, 0.4, 0.8);
  p.text(L, 44, 'Document de démonstration - données fictives. NORIA est un produit de Klirline Inc.', { size: 8, gray: 0.4 });
  return buildDoc([p], { title: `Certificat de transfert ${c.studentCode}` });
}

module.exports = { certificatePdf, day };
