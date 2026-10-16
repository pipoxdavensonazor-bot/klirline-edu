'use strict';
// Garde-fou CSP stricte : aucun gestionnaire en ligne (on*) ni style en ligne dans le HTML ou les gabarits JS de l'interface,
// et une politique sans 'unsafe-inline'. Échoue dès qu'un onclick="…" ou style="…" réapparaît.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { HTML_CSP } = require('../src/static');

const ROOT = path.join(__dirname, '..', '..');
const files = ['index.html', 'sw.js',
  ...fs.readdirSync(path.join(ROOT, 'src')).filter((f) => /\.(html|js)$/.test(f)).map((f) => 'src/' + f)];

// Attribut on* ou style suivi d'une valeur entre guillemets (éventuellement échappés dans une chaîne JS), ou sans guillemets.
const ON_ATTR = /[\s"'`/]on[a-z]+\s*=\s*\\?["'`]|<[a-z][\w-]*(?:\s+[\w-]+(?:=(?:"[^"]*"|'[^']*'|[^\s"'`=<>]+))?)*\s+on[a-z]+=[^\s"'`=<>]/i;
const STYLE_ATTR = /[\s"'`/]style\s*=\s*\\?["'`]|<[a-z][\w-]*(?:\s+[\w-]+(?:=(?:"[^"]*"|'[^']*'|[^\s"'`=<>]+))?)*\s+style=[^\s"'`=<>]/i;
const JS_STYLE = [/setAttribute\(\s*["'`]style["'`]/, /setAttribute\(\s*["'`]on[a-z]+["'`]/i, /\.style\.cssText\s*=/, /<style[\s>]/i, /<script(?![^>]*\ssrc=)[^>]*>/i, /\bjavascript:/i];

function hits(re, src) {
  return src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => re.test(l)).map(([n, l]) => `${n}: ${l.trim().slice(0, 140)}`);
}

for (const f of files) {
  test(`pas de gestionnaire ni de style en ligne : ${f}`, () => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.deepEqual(hits(ON_ATTR, src), [], `attribut on* en ligne dans ${f}`);
    assert.deepEqual(hits(STYLE_ATTR, src), [], `style en ligne dans ${f}`);
    for (const re of JS_STYLE) assert.deepEqual(hits(re, src), [], `${re} dans ${f}`);
  });
}

test('le détecteur reconnaît bien les formes interdites', () => {
  for (const bad of ['<b onclick="x()">', "`<i onchange='y'>`", '"<a onclick=\\"z\\">"', '<p style="margin:0">', '<p style=color:red>'])
    assert.ok(ON_ATTR.test(bad) || STYLE_ATTR.test(bad), bad);
  for (const ok of ['const online=navigator.onLine;', 'data-action="KL.go"', 'el.style.setProperty("--x","1")', 'data-a0="s:style"'])
    assert.ok(!ON_ATTR.test(ok) && !STYLE_ATTR.test(ok), ok);
});

test('CSP stricte servie avec le HTML', () => {
  const d = Object.fromEntries(HTML_CSP.split(';').map((x) => x.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ')]));
  assert.doesNotMatch(HTML_CSP, /unsafe-inline|unsafe-eval/);
  assert.equal(d['script-src'], "'self'");
  assert.equal(d['style-src'], "'self'");
  assert.equal(d['object-src'], "'none'");
  assert.equal(d['base-uri'], "'none'");
  assert.equal(d['frame-ancestors'], "'none'");
  assert.equal(d['form-action'], "'self'");
});
