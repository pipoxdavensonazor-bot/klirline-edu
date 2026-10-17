'use strict';
// Derrière Cloudflare : plages IP versionnées cohérentes, Caddy (mode NORIA_DERRIERE_CLOUDFLARE=1) qui transmet à
// l'application l'adresse réelle (CF-Connecting-IP cru seulement depuis une plage de confiance), et version des
// fichiers de l'interface dans les URL (?v=) pour ne jamais servir une ancienne version depuis un cache.
// Le test Caddy tourne si NORIA_TEST_CADDY désigne le binaire caddy (CI : copié depuis l'image caddy:2-alpine).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const https = require('node:https');
const { spawn, execFileSync } = require('node:child_process');
const { openTestDb } = require('./helpers');
const { createServer } = require('../src/app');
const { createStatic } = require('../src/static');

const ROOT = path.join(__dirname, '..', '..');
const CF = path.join(ROOT, 'deploy', 'cloudflare');
const lignes = (f) => fs.readFileSync(path.join(CF, f), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));

test('plages Cloudflare : listes CIDR valides, plages.caddy généré à partir des mêmes listes', () => {
  const v4 = lignes('ips-v4.txt'); const v6 = lignes('ips-v6.txt');
  assert.ok(v4.length >= 10 && v6.length >= 5);
  for (const p of v4) { const [ip, n] = p.split('/'); assert.equal(net.isIPv4(ip), true, p); assert.ok(+n >= 8 && +n <= 32, p); }
  for (const p of v6) { const [ip, n] = p.split('/'); assert.equal(net.isIPv6(ip), true, p); assert.ok(+n >= 16 && +n <= 128, p); }
  assert.ok(v4.includes('173.245.48.0/20') && v6.includes('2400:cb00::/32'));
  const caddy = lignes('plages.caddy');
  assert.equal(caddy.length, 1);
  assert.deepEqual(caddy[0].split(' '), ['trusted_proxies', 'static', ...v4, ...v6]);
});

test('Caddyfile : modes 0/1 présents, X-Forwarded-For réécrit avec l\'adresse réelle, Let\'s Encrypt par défaut', () => {
  const c = fs.readFileSync(path.join(ROOT, 'deploy', 'Caddyfile'), 'utf8');
  assert.match(c, /import cloudflare\/mode-\{\$NORIA_DERRIERE_CLOUDFLARE:0\}-global\.caddy/);
  assert.match(c, /import cloudflare\/mode-\{\$NORIA_DERRIERE_CLOUDFLARE:0\}-site\.caddy/);
  assert.match(c, /header_up X-Forwarded-For \{client_ip\}/);
  for (const f of ['mode-0-global', 'mode-0-site', 'mode-1-global', 'mode-1-site']) assert.ok(fs.existsSync(path.join(CF, `${f}.caddy`)), f);
  assert.doesNotMatch(lignes('mode-0-global.caddy').join('\n') + lignes('mode-0-site.caddy').join('\n'), /\S/);
  assert.match(lignes('mode-1-global.caddy').join('\n'), /import plages\.caddy[\s\S]*client_ip_headers CF-Connecting-IP/);
  assert.match(lignes('mode-1-site.caddy').join('\n'), /^tls \{\$NORIA_CF_ORIGIN_CERT:[^}]+\} \{\$NORIA_CF_ORIGIN_KEY:[^}]+\}$/);
  const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');
  assert.match(compose, /NORIA_DERRIERE_CLOUDFLARE: \$\{NORIA_DERRIERE_CLOUDFLARE:-0\}/);
  assert.match(compose, /\.\/deploy\/cloudflare:\/etc\/caddy\/cloudflare:ro/);
});

function get(port, { localAddress, headers = {}, pathName = '/api/config' } = {}) {
  return new Promise((resolve, reject) => {
    const r = https.request({ host: '127.0.0.1', servername: 'localhost', port, path: pathName, localAddress, rejectUnauthorized: false,
      headers: { host: 'localhost', ...headers } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    r.on('error', reject); r.end();
  });
}
const libre = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });

test('Caddy mode Cloudflare : l\'application lit CF-Connecting-IP depuis une IP de confiance, l\'ignore sinon', { skip: !process.env.NORIA_TEST_CADDY && 'NORIA_TEST_CADDY non défini (binaire caddy)' }, async () => {
  const db = await openTestDb();
  const app = createServer(db, { staticRoot: false, trustProxy: true });
  const vus = [];
  app.prependListener('request', (req, res) => { if (req.url.startsWith('/api/')) res.on('finish', () => vus.push(req.ip)); });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noria-caddy-'));
  fs.mkdirSync(path.join(dir, 'cloudflare'));
  for (const f of fs.readdirSync(CF).filter((x) => /^mode-.*\.caddy$/.test(x))) fs.copyFileSync(path.join(CF, f), path.join(dir, 'cloudflare', f));
  // Plage de confiance du test : 127.0.0.1 seulement (Cloudflare joué par 127.0.0.1, un client direct par 127.0.0.2).
  fs.writeFileSync(path.join(dir, 'cloudflare', 'plages.caddy'), 'trusted_proxies static 127.0.0.1/32\n');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-keyout', path.join(dir, 'origine.key'), '-out', path.join(dir, 'origine.pem')], { stdio: 'ignore' });
  const [hp, sp] = [await libre(), await libre()];
  // Ports non privilégiés et pas d'API d'administration : seuls ajouts au Caddyfile réel pour le test.
  const cf = fs.readFileSync(path.join(ROOT, 'deploy', 'Caddyfile'), 'utf8')
    .replace('{\n\timport cloudflare/mode-', `{\n\tadmin off\n\thttp_port ${hp}\n\thttps_port ${sp}\n\timport cloudflare/mode-`);
  assert.match(cf, /admin off/);
  fs.writeFileSync(path.join(dir, 'Caddyfile'), cf);
  const caddy = spawn(process.env.NORIA_TEST_CADDY, ['run', '--config', path.join(dir, 'Caddyfile'), '--adapter', 'caddyfile'], {
    env: { ...process.env, HOME: dir, XDG_DATA_HOME: dir, XDG_CONFIG_HOME: dir, NORIA_DOMAIN: 'localhost', NORIA_DERRIERE_CLOUDFLARE: '1',
      NORIA_CF_ORIGIN_CERT: path.join(dir, 'origine.pem'), NORIA_CF_ORIGIN_KEY: path.join(dir, 'origine.key'), NORIA_AMONT: `127.0.0.1:${app.address().port}` },
    stdio: ['ignore', 'pipe', 'pipe'] });
  let journal = ''; caddy.stdout.on('data', (d) => { journal += d; }); caddy.stderr.on('data', (d) => { journal += d; });
  try {
    let pret = false;
    for (let i = 0; i < 100 && !pret; i++) { try { await get(sp, { pathName: '/robots.txt' }); pret = true; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    assert.ok(pret, journal);
    const cfh = { 'cf-connecting-ip': '203.0.113.50', 'x-forwarded-for': '6.6.6.6' };
    vus.length = 0;
    // 1. Depuis une plage de confiance (« Cloudflare ») : adresse réelle du visiteur.
    assert.equal(await get(sp, { localAddress: '127.0.0.1', headers: cfh }), 200);
    // 2. Depuis une IP hors plages (accès direct au serveur) : en-têtes ignorés, adresse de connexion.
    assert.equal(await get(sp, { localAddress: '127.0.0.2', headers: cfh }), 200);
    // 3. Depuis la plage de confiance mais sans CF-Connecting-IP : X-Forwarded-For falsifié ignoré.
    assert.equal(await get(sp, { localAddress: '127.0.0.1', headers: { 'x-forwarded-for': '6.6.6.6' } }), 200);
    assert.deepEqual(vus, ['203.0.113.50', '127.0.0.2', '127.0.0.1'], journal);
  } finally {
    caddy.kill('SIGTERM'); await new Promise((r) => caddy.once('exit', r));
    app.close(); await db.cleanup(); fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('version des fichiers de l\'interface : ?v= dans les pages, immuable pour la version courante seulement', () => {
  const serve = createStatic(ROOT);
  const call = (url) => {
    const out = {}; const res = { writeHead: (s, h) => { out.status = s; out.headers = h; }, end: (b) => { out.body = b ? b.toString() : ''; } };
    assert.equal(serve({ url, method: 'GET', headers: {} }, res, {}), true, url);
    return out;
  };
  const page = call('/app');
  const v = (page.body.match(/<meta name="noria-version" content="([0-9a-f]{10})">/) || [])[1];
  assert.ok(v, 'méta noria-version');
  const refs = [...page.body.matchAll(/(?:href|src)="(src\/[^"]+\.(?:js|css)[^"]*)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 10);
  assert.match(page.body, /src="src\/noria-logo\.png"/); // images : URL inchangée (aussi utilisée par les gabarits JS)
  for (const r of refs) assert.ok(r.endsWith(`?v=${v}`), r);
  assert.match(call('/ministere').body, new RegExp(`src="src/ministere\\.js\\?v=${v}"`));
  assert.equal(call(`/src/app.js?v=${v}`).headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(call('/src/app.js?v=0000000000').headers['cache-control'], 'public, max-age=3600');
  assert.equal(call('/src/app.js').headers['cache-control'], 'public, max-age=3600');
  assert.equal(call('/sw.js').headers['cache-control'], 'no-cache');
  // Le service worker précharge les mêmes URL que la page (revalidation 304, pas de second téléchargement).
  const sw = call('/sw.js').body;
  assert.match(sw, new RegExp(`"/src/app\\.js\\?v=${v}"`));
  assert.match(sw, /"\/src\/icon-192\.png"/);
  // Les chargements à la demande passent par NORIA_U.v (aucune URL src/ en dur sans version).
  for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter((x) => x.endsWith('.js'))) {
    const s = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
    assert.doesNotMatch(s, /\.(?:src|href)\s*=\s*["']src\//, f);
  }
});
