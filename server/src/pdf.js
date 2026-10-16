'use strict';
// Générateur PDF minimal, sans dépendance lourde : une page A4, polices standard Helvetica (WinAnsi, accents français
// et kreyòl), traits, et QR code dessiné en rectangles. Flux compressé : un bulletin pèse quelques kilo-octets.
const zlib = require('node:zlib');
const qrcode = require('qrcode-generator');

// Caractères hors WinAnsi remplacés par un équivalent sûr.
const SUBST = { '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...', '→': '->', ' ': ' ', ' ': ' ' };
const WINANSI_EXTRA = { '€': 0x80, 'Œ': 0x8c, 'œ': 0x9c, 'Ÿ': 0x9f };
function pdfString(s) {
  const out = [];
  for (const ch of String(s)) {
    const c = SUBST[ch] ?? ch;
    for (const d of c) {
      let code = WINANSI_EXTRA[d] ?? d.codePointAt(0);
      if (code > 255) code = 0x3f; // « ? »
      if (code === 0x28 || code === 0x29 || code === 0x5c) out.push(0x5c);
      out.push(code);
    }
  }
  return '(' + Buffer.from(out).toString('latin1') + ')';
}
const n = (v) => (Math.round(v * 100) / 100).toString();

class Page {
  constructor() { this.ops = []; }
  text(x, y, str, { size = 10, bold = false, gray = 0 } = {}) {
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${n(size)} Tf ${n(gray)} g ${n(x)} ${n(y)} Td ${pdfString(str)} Tj ET`);
    return this;
  }
  line(x1, y1, x2, y2, w = 0.5, gray = 0.6) { this.ops.push(`${n(gray)} G ${n(w)} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`); return this; }
  rect(x, y, w, h, gray = 0.95) { this.ops.push(`${n(gray)} g ${n(x)} ${n(y)} ${n(w)} ${n(h)} re f`); return this; }
  // QR code : un rectangle par suite de modules noirs sur une ligne.
  qr(x, y, size, data) {
    const q = qrcode(0, 'M'); q.addData(data); q.make();
    const count = q.getModuleCount(); const quiet = 4; const cell = size / (count + 2 * quiet);
    const parts = ['0 g'];
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (!q.isDark(r, c)) continue;
        let e = c; while (e + 1 < count && q.isDark(r, e + 1)) e++;
        const px = x + (quiet + c) * cell; const py = y + size - (quiet + r + 1) * cell;
        parts.push(`${n(px)} ${n(py)} ${n((e - c + 1) * cell)} ${n(cell)} re`);
        c = e;
      }
    }
    parts.push('f');
    this.ops.push(parts.join('\n'));
    return this;
  }
}

function build(page, { title = 'NORIA' } = {}) {
  const content = zlib.deflateSync(Buffer.from(page.ops.join('\n'), 'latin1'), { level: 9 });
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    null, // flux
    `<< /Title ${pdfString(title)} /Producer (NORIA) >>`,
  ];
  const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = []; let pos = chunks[0].length;
  objs.forEach((o, i) => {
    const head = Buffer.from(`${i + 1} 0 obj\n`, 'latin1');
    const body = o === null
      ? Buffer.concat([Buffer.from(`<< /Length ${content.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'), content, Buffer.from('\nendstream', 'latin1')])
      : Buffer.from(o, 'latin1');
    const tail = Buffer.from('\nendobj\n', 'latin1');
    offsets.push(pos); chunks.push(head, body, tail); pos += head.length + body.length + tail.length;
  });
  const xref = ['xref', `0 ${objs.length + 1}`, '0000000000 65535 f ', ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n `)].join('\n');
  chunks.push(Buffer.from(`${xref}\ntrailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(chunks);
}

// Bulletin : en-tête école, élève, période, tableau des moyennes, moyenne générale, QR de vérification.
function reportCardPdf(snap, verifyUrl) {
  const p = new Page();
  const L = 50, R = 545;
  p.rect(0, 800, 595, 42, 0.07);
  p.text(L, 815, 'NORIA', { size: 16, bold: true, gray: 1 });
  p.text(130, 816, snap.school, { size: 11, gray: 1 });
  p.text(L, 770, 'Bulletin scolaire / Bilten', { size: 18, bold: true });
  p.text(L, 750, `${snap.term} - ${snap.year}`, { size: 11, gray: 0.25 });
  p.text(L, 722, 'Élève / Elèv :', { size: 10, gray: 0.35 }); p.text(140, 722, snap.student, { size: 11, bold: true });
  p.text(L, 706, 'Code :', { size: 10, gray: 0.35 }); p.text(140, 706, snap.studentCode, { size: 10 });
  p.text(L, 690, 'Classe / Klas :', { size: 10, gray: 0.35 }); p.text(140, 690, snap.className || '-', { size: 10 });
  let y = 655;
  p.rect(L, y - 6, R - L, 22, 0.92);
  p.text(L + 8, y, 'Matière / Matyè', { bold: true }); p.text(330, y, 'Coef.', { bold: true });
  p.text(390, y, 'Évaluations', { bold: true }); p.text(480, y, `Moyenne /${snap.scale}`, { bold: true });
  y -= 24;
  for (const s of snap.subjects) {
    p.text(L + 8, y, s.name); p.text(335, y, n(s.coefficient)); p.text(410, y, String(s.count));
    p.text(490, y, s.average == null ? '-' : s.average.toFixed(2), { bold: true });
    p.line(L, y - 7, R, y - 7, 0.4, 0.85); y -= 22;
  }
  y -= 6;
  p.rect(L, y - 8, R - L, 26, 0.88);
  p.text(L + 8, y, 'Moyenne générale / Mwayèn jeneral', { bold: true, size: 11 });
  p.text(490, y, snap.general == null ? '-' : snap.general.toFixed(2), { bold: true, size: 12 });
  y -= 34;
  p.text(L, y, `Calcul : notes publiées seulement, ramenées sur ${snap.scale}, pondérées par le coefficient de l'évaluation,`, { size: 8, gray: 0.35 });
  p.text(L, y - 11, 'puis moyenne générale pondérée par le coefficient de la matière. Notes absentes ou dispensées non comptées.', { size: 8, gray: 0.35 });
  // Vérification
  p.qr(R - 120, 70, 120, verifyUrl);
  p.text(L, 168, 'Vérifier ce bulletin / Verifye bilten sa a', { bold: true, size: 10 });
  p.text(L, 152, 'Scannez le QR code ou ouvrez :', { size: 9, gray: 0.3 });
  p.text(L, 139, verifyUrl.length > 70 ? verifyUrl.slice(0, 70) + '...' : verifyUrl, { size: 8 });
  p.text(L, 124, `Code de vérification : ${snap.code}`, { size: 10, bold: true });
  p.text(L, 106, `Émis le ${snap.issuedAt.slice(0, 10)} par ${snap.issuer}`, { size: 9, gray: 0.3 });
  p.line(L, 60, R, 60, 0.4, 0.8);
  p.text(L, 46, 'Document de démonstration - données fictives. NORIA est un produit de Klirline Inc.', { size: 8, gray: 0.4 });
  return build(p, { title: `Bulletin ${snap.student} - ${snap.term}` });
}

module.exports = { reportCardPdf, pdfString };

// Reçu de paiement : une demi-page A4 utile, numéro séquentiel de l'école, montant en HTG, mode et référence,
// solde après paiement, QR vers la page publique de vérification (la même que les bulletins).
const METHOD_LBL = { especes: 'Espèces / Kach', moncash: 'MonCash', natcash: 'NatCash', virement: 'Virement bancaire / Transfè labank' };
const money = (v) => `${Number(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} HTG`;
function receiptPdf(r, verifyUrl) {
  const p = new Page();
  const L = 50, R = 545;
  p.rect(0, 800, 595, 42, 0.07);
  p.text(L, 815, 'NORIA', { size: 16, bold: true, gray: 1 });
  p.text(130, 816, r.school, { size: 11, gray: 1 });
  p.text(L, 770, 'Reçu de paiement / Resi peman', { size: 18, bold: true });
  p.text(L, 750, `N° ${r.number}`, { size: 12, bold: true, gray: 0.2 });
  if (r.cancelledAt) {
    p.rect(330, 740, 215, 40, 0.15);
    p.text(345, 756, 'ANNULÉ / ANILE', { size: 16, bold: true, gray: 1 });
  }
  const rows = [
    ['Élève / Elèv', `${r.student} (${r.studentCode})`],
    ['Montant / Montan', money(r.amount)],
    ['Mode / Mòd peman', METHOD_LBL[r.method] || r.method],
    ['Référence / Referans', r.reference || '-'],
    ['Date du paiement / Dat peman', r.paidOn],
    ['Objet / Pou kisa', r.label || 'Frais scolaires / Frè lekòl'],
  ];
  let y = 712;
  for (const [k, v] of rows) { p.text(L, y, k, { size: 10, gray: 0.35 }); p.text(230, y, v, { size: 11, bold: k.startsWith('Montant') }); p.line(L, y - 7, R, y - 7, 0.4, 0.88); y -= 24; }
  y -= 8;
  p.rect(L, y - 30, R - L, 46, 0.93);
  p.text(L + 8, y, `Total dû / Total pou peye : ${money(r.due)}`, { size: 10 });
  p.text(L + 8, y - 14, `Total payé / Total peye : ${money(r.paidTotal)}`, { size: 10 });
  p.text(330, y - 7, `Solde / Sa ki rete : ${money(r.balance)}`, { size: 11, bold: true });
  y -= 56;
  if (r.method !== 'especes' && r.providerStatus !== 'confirme') p.text(L, y, 'Référence saisie par l\'école, non vérifiée en ligne / Referans lekòl la antre, li pa verifye sou entènèt.', { size: 8, gray: 0.35 });
  if (r.cancelledAt) p.text(L, y - 14, `Annulé le ${String(r.cancelledAt).slice(0, 10)} : ${r.cancelReason}`, { size: 9, bold: true });
  p.qr(R - 120, 70, 120, verifyUrl);
  p.text(L, 168, 'Vérifier ce reçu / Verifye resi sa a', { bold: true, size: 10 });
  p.text(L, 152, 'Scannez le QR code ou ouvrez :', { size: 9, gray: 0.3 });
  p.text(L, 139, verifyUrl.length > 70 ? verifyUrl.slice(0, 70) + '...' : verifyUrl, { size: 8 });
  p.text(L, 124, `Code de vérification : ${r.code}`, { size: 10, bold: true });
  p.text(L, 106, `Enregistré le ${r.issuedAt.slice(0, 10)} par ${r.issuer}`, { size: 9, gray: 0.3 });
  p.line(L, 60, R, 60, 0.4, 0.8);
  p.text(L, 46, 'Document de démonstration - données fictives. NORIA est un produit de Klirline Inc.', { size: 8, gray: 0.4 });
  return build(p, { title: `Reçu ${r.number} - ${r.student}` });
}

module.exports.receiptPdf = receiptPdf;
