'use strict';
// Lot 3 — codes-barres générés localement (aucun service externe) : Code 128 (jeu B) et QR, rendus en SVG.
const qrcode = require('qrcode-generator');

// Motifs Code 128 (largeurs barre/espace), index 0 à 106 (106 = arrêt, 7 éléments).
const PAT = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 '
  + '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 '
  + '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 '
  + '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 '
  + '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 '
  + '114131 311141 411131 211412 211214 211232 2331112').split(' ');

function code128Modules(text) {
  const s = String(text);
  if (!s || !/^[\x20-\x7e]+$/.test(s) || s.length > 40) throw new Error('Code 128 : 1 à 40 caractères ASCII imprimables');
  const codes = [104]; // START B
  for (const ch of s) codes.push(ch.charCodeAt(0) - 32);
  let sum = 104; for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
  codes.push(sum % 103, 106);
  return codes.map((c) => PAT[c]).join('');
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function code128Svg(text, { height = 60, module = 2, label = true } = {}) {
  const w = code128Modules(text);
  const quiet = 10 * module;
  let x = quiet, rects = '', bar = true;
  for (const d of w) { const n = Number(d) * module; if (bar) rects += `<rect x="${x}" y="0" width="${n}" height="${height}"/>`; x += n; bar = !bar; }
  const W = x + quiet, H = height + (label ? 18 : 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Code 128 ${esc(text)}">`
    + `<rect width="${W}" height="${H}" fill="#fff"/><g fill="#000">${rects}</g>`
    + (label ? `<text x="${W / 2}" y="${H - 3}" font-family="monospace" font-size="14" text-anchor="middle">${esc(text)}</text>` : '') + '</svg>';
}

function qrSvg(data, { cell = 4, margin = 4 } = {}) {
  const q = qrcode(0, 'M'); q.addData(String(data)); q.make();
  const n = q.getModuleCount(), W = (n + margin * 2) * cell;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${(c + margin) * cell} ${(r + margin) * cell}h${cell}v${cell}h-${cell}z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${W}" height="${W}" role="img" aria-label="QR"><rect width="${W}" height="${W}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

module.exports = { code128Modules, code128Svg, qrSvg };
