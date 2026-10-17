'use strict';
// Traductions : chaque clé française a son équivalent kreyòl (HT), sans valeur vide, dans tous les dictionnaires de l'interface.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', '..', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

// Extrait le littéral d'objet qui suit `marker` (accolades équilibrées, chaînes et gabarits ignorés).
function literalAfter(src, marker) {
  const start = src.indexOf(marker); assert.ok(start >= 0, `marqueur absent : ${marker}`);
  let i = src.indexOf('{', start), depth = 0, q = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') q = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return vm.runInNewContext(`(${src.slice(i, j + 1)})`);
  }
  throw new Error('littéral non fermé');
}

// Compare deux arbres : mêmes clés, valeurs HT non vides (une fonction doit rendre un texte non vide).
function compare(fr, ht, where, errors) {
  for (const [k, v] of Object.entries(fr)) {
    const h = ht == null ? undefined : ht[k];
    const at = `${where}.${k}`;
    if (h === undefined) { errors.push(`${at} : clé HT manquante`); continue; }
    if (v && typeof v === 'object') { compare(v, h, at, errors); continue; }
    const val = typeof h === 'function' ? h(2, 'x') : h;
    if (typeof val !== 'string' || !val.trim()) errors.push(`${at} : valeur HT vide`);
  }
}

const DICTS = [
  ['scolaire.js', 'const T={'], ['login.js', 'const T={'], ['gestion.js', 'const T={'],
  ['offline.js', 'const L={'], ['mobile-nav.js', 'const L = {'],
  ['ecoles.js', 'const T={'], ['ecoles-gestion.js', 'const T={'], ['admin.js', 'const T={'], ['badges.js', 'const T={'], ['admin-securite.js', 'const T={'], ['transferts.js', 'const T={'],
  ['portail-ecole.js', 'const T={'], ['admin-portail.js', 'const T={'],
  ['ministere.js', 'const T={'], ['declaration.js', 'const T={'], ['admin-ministere.js', 'const T={'],
  ['emails-eleves.js', 'const T={'], ['mon-email.js', 'const T={'],
];

test('KL_I18N (i18n.js + addons-i18n.js) : chaque clé FR existe en HT', () => {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(read('i18n.js'), ctx); vm.runInContext(read('addons-i18n.js'), ctx);
  const errors = []; compare(ctx.window.KL_I18N.fr, ctx.window.KL_I18N.ht, 'KL_I18N', errors);
  assert.deepStrictEqual(errors, []);
});

test('portail public (server/src/portail-pages.js) : chaque clé FR existe en HT', () => {
  const { T } = require('../src/portail-pages');
  const errors = []; compare(T.fr, T.ht, 'portail-pages', errors);
  assert.deepStrictEqual(errors, []);
});

for (const [file, marker] of DICTS) {
  test(`${file} : chaque clé FR existe en HT, sans valeur vide`, () => {
    const d = literalAfter(read(file), marker);
    assert.ok(d.fr && d.ht, 'dictionnaires fr et ht attendus');
    const errors = []; compare(d.fr, d.ht, file, errors);
    assert.deepStrictEqual(errors, []);
  });
}

test('tours.js : chaque texte FR a son texte HT', () => {
  const src = read('tours.js');
  const pairs = src.match(/\{fr:"[^"]*",ht:"[^"]*"\}/g) || [];
  const frOnly = (src.match(/\{fr:"[^"]*"\}/g) || []).concat(src.match(/ht:""/g) || []);
  assert.ok(pairs.length > 10);
  assert.deepStrictEqual(frOnly, []);
});
