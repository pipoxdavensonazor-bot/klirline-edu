'use strict';
// Onglet Élèves : le bouton « Ajouter un élève » reste visible quand la liste est vide (direction, secrétariat),
// ouvre la fiche manuelle (eleves-fiche.js) et, sans classe, explique puis envoie vers la création des classes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', f), 'utf8');

test('élèves : bouton « Ajouter un élève » même sans élève, FR/HT, envoi vers les classes si aucune', () => {
  const app = rd('app.js'), i18n = rd('i18n.js');
  const empty = app.match(/if\(SERVER&&window\.NORIA_TAB&&!S\.students\.length\)\{[^\n]*\n[^\n]*/);
  assert.ok(empty, 'cas liste vide');
  assert.match(empty[0], /data-action="KL\.stuAdd"/, 'bouton dans l’état vide');
  assert.match(empty[0], /\["direction","secretariat"\]\.includes\(S\.role\)/, 'direction et secrétariat seulement');
  assert.match(empty[0], /<div id="stuModal"><\/div>/, 'conteneur de la fiche présent');
  assert.match(app, /KL\.stuAdd=\(\)=>\{[^\n]*\n\s*if\(SERVER&&!S\.classes\.length\)\{ toast\(t\("addNeedClass"\)\);[^\n]*KL\.go\("classes"\)/);
  assert.match(app, /NORIA_ECO\.load\("src\/eleves-fiche\.js"\)/, 'fiche manuelle serveur');
  assert.match(i18n, /addStudent: "Ajouter un élève"/); assert.match(i18n, /addStudent: "Ajoute yon elèv"/);
  assert.equal((i18n.match(/addNeedClass:/g) || []).length, 2, 'message FR + HT');
  const fiche = rd('eleves-fiche.js');
  assert.match(fiche, /capture="user"[^>]*NORIA_ELV\.pickPhoto/, 'photo par caméra dans la fiche');
  assert.match(fiche, /if\(PH\)\{ const p=await putPhoto\(r\.body\.id\)/, 'photo enregistrée après la création');
  assert.match(fiche, /<=60\*1024/, 'compression ≤ 60 Ko');
  assert.match(rd('tableau.js'), /go\("importEleves"/, 'import CSV conservé');
});
