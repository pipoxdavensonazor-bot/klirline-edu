'use strict';
// Fiche élève : toujours un moyen de sortir (Retour en haut, Terminer/Fermer en bas collant, Échap, clic sur le fond),
// en création comme en modification, et retour à la liste des élèves rafraîchie.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', f), 'utf8');

test('fiche élève : Retour, Terminer, Échap et fond ferment la fiche ; FR/HT ; pied collant', () => {
  const f = rd('eleves-fiche.js'), css = rd('styles.css');
  assert.match(f, /<div class="elv-top"><button type="button" class="ghost small" id="elvBack" data-action="NORIA_ELV\.close">/, 'Retour en haut');
  assert.match(f, /id="elvDone" data-action="NORIA_ELV\.close">\$\{esc\(t\("done"\)\)\}/, 'Terminer après enregistrement');
  assert.match(f, /id="elvCancel" data-action="NORIA_ELV\.close"/, 'Fermer en création');
  const foot = f.indexOf('class="elv-foot"'), fs_ = f.indexOf('</fieldset></form>');
  assert.ok(foot > fs_, 'boutons de sortie hors du fieldset (jamais désactivés en lecture seule)');
  assert.ok(f.indexOf('id="elvG"') < foot, 'Terminer sous la liste des responsables');
  assert.match(f, /async function close\(\)\{[^\n]*if\(had\) await refresh\(\); \}/, 'liste rafraîchie');
  assert.match(f, /e\.key==="Escape"&&isOpen\(\)/); assert.match(f, /classList\.contains\("elv-modal"\)\) close\(\)/);
  assert.match(f, /Object\.freeze\(\{open,close,/);
  for (const k of ['back:"← Retour"', 'done:"Terminer"', 'back:"← Retounen"', 'done:"Fini"']) assert.ok(f.includes(k), k);
  assert.match(css, /\.elv-foot\{position:sticky;bottom:0/); assert.match(css, /\.elv-top\{position:sticky;top:0/);
});
