'use strict';
// Menu de l'application (src/app.js) : chaque module a une section (FR + HT), les modules ajoutés depuis le bloc 1
// figurent dans le menu, « Échanges » (transferts, portail, ministère) reste dans les premières entrées, la déclaration
// n'apparaît qu'avec le portail du ministère, et les rôles sont respectés (portail : direction ; déclaration :
// secrétariat en lecture seule).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'app.js'), 'utf8');
const grab = (name) => { const m = src.match(new RegExp(`const ${name}=(\\{[^;]*\\}|\\[[^;]*\\]);`)); assert.ok(m, name); return JSON.parse(JSON.stringify(vm.runInNewContext(`(${m[1]})`))); };

test('menu : sections FR/HT, modules récents présents, « Échanges » visible tôt, rôles respectés', () => {
  const MODULES = grab('MODULES').map((x) => x[0]), SPACE = grab('SPACE'), SPACE_HT = grab('SPACE_HT'), ROLES = grab('ROLE_MODULES'), RO = grab('READ_ONLY'), LBL = grab('NAV_LBL');
  for (const m of ['ecole', 'importEleves', 'scan', 'badges', 'releves', 'transferts', 'portail', 'declaration', 'accounts', 'settings']) assert.ok(MODULES.includes(m), `${m} dans le menu`);
  for (const m of MODULES) { assert.ok(SPACE[m], `section de ${m}`); assert.ok(SPACE_HT[SPACE[m]], `section ${SPACE[m]} traduite`); }
  // Sections contiguës : aucun titre répété dans le menu.
  const seq = MODULES.map((m) => SPACE[m]).filter((s, i, a) => i === 0 || a[i - 1] !== s);
  assert.equal(new Set(seq).size, seq.length, `sections contiguës : ${seq.join(' > ')}`);
  // Les entrées « Échanges » arrivent dans les 8 premières pour la direction (visibles sans défiler sur 1280×800).
  const dir = MODULES.filter((m) => ROLES.direction.includes(m));
  for (const m of ['transferts', 'portail', 'declaration']) assert.ok(dir.indexOf(m) < 8, `${m} visible sans défiler (position ${dir.indexOf(m)})`);
  // Barre du bas du téléphone (5 premières entrées) inchangée pour la direction.
  assert.deepEqual(dir.slice(0, 5), ['dashboard', 'students', 'classes', 'attendance', 'academic']);
  assert.ok(!ROLES.secretariat.includes('portail'), 'portail : direction seulement');
  assert.ok(ROLES.secretariat.includes('declaration') && RO.secretariat.includes('declaration'), 'déclaration : secrétariat en lecture seule');
  for (const r of ['enseignant', 'comptable', 'bibliothecaire', 'parent', 'eleve']) for (const m of ['transferts', 'portail', 'declaration']) assert.ok(!ROLES[r].includes(m), `${m} interdit à ${r}`);
  assert.match(src, /m==="declaration"\)\s*return[^;]*dataset\.ministere==="1"/, 'déclaration seulement si NORIA_MINISTERE=1');
  assert.deepEqual(Object.keys(LBL.fr).sort(), Object.keys(LBL.ht).sort(), 'libellés du menu FR = HT');
});
