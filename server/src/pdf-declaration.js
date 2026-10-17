'use strict';
// Déclaration annuelle de fin d'année au ministère (bloc 6, prototype) : en-tête de l'école (logo ou initiales),
// effectifs par classe, résultats de fin d'année, personnel, lauréats, signature de la direction et empreinte de la
// signature électronique Ed25519 de l'école. Plusieurs pages si nécessaire (pied de page numéroté).
const { Page, buildDoc, schoolHeader, jpegSize } = require('./pdf');
const { day } = require('./pdf-transfert');

const L = 50, R = 545, BOTTOM = 92;
const cut = (s, max) => { s = String(s ?? ''); return s.length > max ? `${s.slice(0, max - 1)}.` : s; };
const pct = (v) => (v == null ? '-' : `${String(Math.round(v * 1000) / 10).replace('.', ',')} %`);
const ROLES = { direction: 'Direction', secretariat: 'Secrétariat', enseignant: 'Enseignant(e)', comptabilite: 'Comptabilité', bibliotheque: 'Bibliothèque' };
const DEPTS = { artibonite: 'Artibonite', centre: 'Centre', 'grand-anse': "Grand'Anse", nippes: 'Nippes', nord: 'Nord', 'nord-est': 'Nord-Est', 'nord-ouest': 'Nord-Ouest', ouest: 'Ouest', sud: 'Sud', 'sud-est': 'Sud-Est' };

// d : payload de la déclaration ; school : profil (logo Buffer, signature Buffer, signature_name) ; sig : { keyId, payloadSha }.
function declarationPdf(d, school, sig) {
  const pages = [];
  let p, y;
  const newPage = (first) => {
    p = new Page(); pages.push(p);
    if (first) { y = schoolHeader(p, school) - 4; return; }
    p.text(L, 806, cut(`${school.name} - Déclaration ${d.annee} (version ${d.version})`, 90), { size: 9, bold: true, gray: 0.3 });
    p.line(L, 798, R, 798, 0.4, 0.8); y = 780;
  };
  const need = (h) => { if (y - h < BOTTOM) newPage(false); };
  const section = (title) => { need(40); y -= 8; p.rect(L, y - 4, R - L, 17, 0.9); p.text(L + 6, y + 1, title, { size: 10, bold: true }); y -= 22; };
  // Tableau : cols [{ t: titre, w: largeur, a: 'r' pour aligner à droite }], rows : tableaux de cellules.
  const table = (cols, rows, opts = {}) => {
    const head = () => {
      let x = L; p.rect(L, y - 3, R - L, 14, 0.96);
      for (const c of cols) { p.text(c.a === 'r' ? x + c.w - 6 - String(c.t).length * 4.1 : x + 4, y + 1, c.t, { size: 7.8, bold: true, gray: 0.3 }); x += c.w; }
      y -= 15;
    };
    need(30); head();
    for (const r of rows) {
      if (y - 13 < BOTTOM) { newPage(false); head(); }
      let x = L; const bold = opts.boldLast && r === rows[rows.length - 1];
      cols.forEach((c, i) => {
        const v = cut(r[i], Math.floor(c.w / 4.6));
        p.text(c.a === 'r' ? x + c.w - 6 - v.length * 4.6 : x + 4, y, v, { size: 8.6, bold });
        x += c.w;
      });
      p.line(L, y - 4, R, y - 4, 0.3, 0.88); y -= 13;
    }
    y -= 4;
  };

  newPage(true);
  p.line(L, y, R, y, 0.6, 0.7); y -= 22;
  p.text(L, y, "Déclaration annuelle de fin d'année", { size: 16, bold: true }); y -= 15;
  p.text(L, y, "Deklarasyon fen ane bay Ministè Edikasyon Nasyonal", { size: 9.5, gray: 0.35 }); y -= 20;
  const loc = [d.ecole.commune, DEPTS[d.ecole.departement] || d.ecole.departement].filter(Boolean).join(', ');
  const kv = [['Année scolaire / Ane lekòl', d.annee], ['Version', String(d.version)], ['Établie le / Fèt le', day(d.genere_le)],
    ['Localisation / Kote', loc || 'non renseignée'], ['Identifiant NORIA', d.ecole.slug]];
  for (const [k, v] of kv) { p.text(L, y, k, { size: 8.5, gray: 0.35 }); p.text(200, y, cut(v, 60), { size: 9.5, bold: true }); y -= 13; }
  y -= 6;
  // Chiffres clés.
  const e = d.effectifs, res = d.resultats;
  const kpis = [[String(e.total), 'Élèves / Elèv'], [`${e.filles} / ${e.garcons}`, 'Filles / garçons'], [String(e.classes.length), 'Classes / Klas'],
    [pct(res.taux_reussite), 'Réussite / Reyisit'], [String(d.personnel.total), 'Personnel / Pèsonèl']];
  const w = (R - L - 4 * 8) / 5;
  kpis.forEach(([v, k], i) => {
    const x = L + i * (w + 8);
    p.rect(x, y - 34, w, 42, 0.95);
    p.text(x + 8, y - 10, v, { size: 14, bold: true }); p.text(x + 8, y - 26, k, { size: 7.5, gray: 0.35 });
  });
  y -= 52;

  section('1. Effectifs par classe / Efektif pa klas');
  table([{ t: 'Classe', w: 150 }, { t: 'Niveau', w: 130 }, { t: 'Filles', w: 60, a: 'r' }, { t: 'Garçons', w: 60, a: 'r' }, { t: 'Non précisé', w: 50, a: 'r' }, { t: 'Total', w: 45, a: 'r' }],
    [...e.classes.map((c) => [c.classe, c.niveau || '-', c.filles, c.garcons, c.non_renseigne, c.total]), ['Total', '', e.filles, e.garcons, e.non_renseigne, e.total]], { boldLast: true });

  section("2. Résultats de fin d'année / Rezilta fen ane");
  table([{ t: 'Classe', w: 150 }, { t: 'Admis', w: 60, a: 'r' }, { t: 'Redoublent', w: 70, a: 'r' }, { t: 'Échec', w: 55, a: 'r' }, { t: 'Sans décision', w: 75, a: 'r' }, { t: 'Taux', w: 85, a: 'r' }],
    [...res.classes.map((c) => [c.classe, c.admis, c.redouble, c.echec, c.sans_decision, pct(c.taux)]), ['Total', res.admis, res.redouble, res.echec, res.sans_decision, pct(res.taux_reussite)]], { boldLast: true });
  need(14); p.text(L, y, 'Taux de réussite = admis / élèves ayant une décision de fin d\'année.', { size: 7.5, gray: 0.4 }); y -= 12;

  section('3. Personnel / Pèsonèl');
  const par = Object.entries(d.personnel.par_role).map(([r, n]) => `${ROLES[r] || r} : ${n}`).join('   ·   ');
  need(14); p.text(L, y, cut(par || 'aucun compte du personnel', 110), { size: 8.6 }); y -= 16;
  table([{ t: 'Nom', w: 250 }, { t: 'Fonction(s)', w: 245 }], d.personnel.liste.map((x) => [x.nom, x.roles.map((r) => ROLES[r] || r).join(', ')]));

  section('4. Lauréats aux examens officiels / Laureya');
  if (d.laureats.length) table([{ t: 'Lauréat(e)', w: 170 }, { t: 'Examen', w: 160 }, { t: 'Année', w: 70 }, { t: 'Mention', w: 95 }], d.laureats.map((x) => [x.nom, x.examen || '-', x.annee || '-', x.mention || '-']));
  else { need(14); p.text(L, y, 'Aucun lauréat déclaré pour cette année.', { size: 8.6, gray: 0.4 }); y -= 14; }
  need(14); p.text(L, y, 'Lauréat mineur sans double accord (école et parent) : initiales seulement.', { size: 7.5, gray: 0.4 }); y -= 12;

  // Signature.
  need(120);
  y -= 10; p.text(L, y, "Certifié exact par la direction de l'école / Direksyon lekòl la sètifye sa egzat", { size: 9, bold: true }); y -= 8;
  const sigImg = school.signature && jpegSize(school.signature);
  if (sigImg) { const k = Math.min(150 / sigImg.width, 50 / sigImg.height); p.image(L, y - 54, sigImg.width * k, sigImg.height * k, { data: school.signature, ...sigImg }); }
  else p.text(L, y - 30, '(signature manuscrite non téléversée)', { size: 8, gray: 0.5 });
  p.line(L, y - 58, L + 190, y - 58, 0.4, 0.5);
  p.text(L, y - 70, cut(d.signataire || school.signature_name || 'La direction', 40), { size: 9, bold: true });
  p.text(300, y - 20, 'Signature électronique de l\'école', { size: 8.5, gray: 0.35 });
  p.text(300, y - 34, `Ed25519, clé ${sig.keyId}`, { size: 9, bold: true });
  p.text(300, y - 47, `Empreinte du dossier (SHA-256) :`, { size: 7.5, gray: 0.35 });
  p.text(300, y - 58, `${String(sig.payloadSha).slice(0, 32)}`, { size: 7.5 });
  p.text(300, y - 68, `${String(sig.payloadSha).slice(32)}`, { size: 7.5 });
  y -= 84;

  pages.forEach((pg, i) => {
    pg.line(L, 70, R, 70, 0.4, 0.8);
    pg.text(L, 56, 'Prototype NORIA - portail du ministère. Données agrégées ; aucune note, donnée de santé ou de famille.', { size: 7.5, gray: 0.4 });
    pg.text(L, 44, 'NORIA est un produit de Klirline Inc.', { size: 7.5, gray: 0.4 });
    pg.text(R - 52, 44, `Page ${i + 1} / ${pages.length}`, { size: 7.5, gray: 0.4 });
  });
  return buildDoc(pages, { title: `Déclaration ${d.annee} - ${d.ecole.nom}` });
}

module.exports = { declarationPdf, DEPTS };
