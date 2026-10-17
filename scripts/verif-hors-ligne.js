// Vérifie le hors-ligne dans Chrome headless (iPhone SE, Pixel 7, iPad Mini, ordinateur) :
// connexion enseignant, appel fait HORS LIGNE (réseau coupé au niveau d'un relais TCP + navigator.onLine=false),
// rechargement hors ligne (interface servie par le service worker, file IndexedDB conservée), retour du réseau,
// synchronisation vérifiée côté serveur, 0 erreur. Mesure les octets réellement transférés (relais TCP).
// Usage : (cd server && NORIA_DEMO=1 npm start) ; node scripts/verif-hors-ligne.js http://127.0.0.1:3100
const net = require('node:net');
const puppeteer = require('puppeteer-core');
const TARGET = new URL(process.argv[2] || 'http://127.0.0.1:3100');
const D = [['iphone-se', 375, 667, 2, true], ['pixel-7', 412, 915, 2.625, true], ['ipad-mini', 768, 1024, 2, true], ['desktop', 1280, 800, 1, false]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PW = 'demo-fictif-2026';

// Relais TCP : compte les octets serveur → navigateur ; « coupé » = connexions refusées.
const relay = { down: 0, up: 0, cut: false, socks: new Set() };
const proxy = net.createServer((c) => {
  if (relay.cut) return c.destroy();
  const s = net.connect(Number(TARGET.port), TARGET.hostname);
  relay.socks.add(c); relay.socks.add(s);
  c.on('data', (b) => { relay.up += b.length; }); s.on('data', (b) => { relay.down += b.length; });
  c.pipe(s); s.pipe(c);
  const end = () => { c.destroy(); s.destroy(); relay.socks.delete(c); relay.socks.delete(s); };
  c.on('error', end); s.on('error', end); c.on('close', end); s.on('close', end);
});
const cut = (on) => { relay.cut = on; if (on) for (const x of relay.socks) x.destroy(); };
const meter = () => { const d = relay.down, u = relay.up; return () => ({ recus: relay.down - d, envoyes: relay.up - u }); };

async function api(path, token, body) {
  const r = await fetch(TARGET.origin + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}

(async () => {
  await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${proxy.address().port}`;
  const dir = (await api('/api/login', null, { school: 'ecole-a', identifier: 'direction@a.exemple.invalid', password: PW })).token;
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--headless=new'] });
  const out = {};
  let n = 0;
  for (const [name, w, h, dpr, mob] of D) {
    const day = new Date(Date.now() - n++ * 86400e3).toLocaleDateString('en-CA');
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push('page: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    // Erreurs du service worker aussi.
    ctx.on('targetcreated', async (tg) => { if (tg.type() === 'service_worker') { const wk = await tg.worker(); if (wk) { wk.on('console', (m) => { if (m.type() === 'error') errs.push('sw: ' + m.text()); }); } } });
    await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob });
    const r = { jour: day };

    // 1. Premier chargement (cache vide) : page + préchargement du service worker.
    let m = meter();
    await p.goto(BASE + '/app', { waitUntil: 'networkidle0' });
    await p.waitForSelector('#lgForm');
    r.premierChargementPage = m();
    await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await sleep(500);
    r.premierChargementAvecCacheSW = m();

    // 2. Connexion enseignant.
    await p.select('#lgSchool', 'ecole-a');
    await p.$eval('#lgId', (e) => { e.value = 'prof1@a.exemple.invalid'; });
    await p.$eval('#lgPw', (e, v) => { e.value = v; }, PW);
    await p.click('.login-main');
    await p.waitForSelector('#offInd');

    // 3. Rechargement en ligne, interface en cache.
    m = meter();
    await p.reload({ waitUntil: 'networkidle0' }); await p.waitForSelector('#offInd');
    r.rechargementEnCache = m();
    r.controleParSW = await p.evaluate(() => !!navigator.serviceWorker.controller);

    // 4. Présences, jour choisi.
    await p.evaluate((d) => { KL.go('attendance'); KL.attD(d); }, day);
    await p.waitForSelector('#attSaveBtn'); await sleep(300);

    // 5. Coupure réseau, appel hors ligne.
    cut(true); await p.setOfflineMode(true); await sleep(200);
    await p.evaluate(() => { const b = [...document.querySelectorAll('tr[data-sid] .attbtn')].find((x) => x.textContent.trim().startsWith('A')); b.click(); });
    await sleep(100);
    await p.click('#attSaveBtn'); await sleep(400);
    r.horsLigne = await p.evaluate(() => ({ indicateur: document.getElementById('offInd').textContent, bandeau: !!document.getElementById('attOffline'), ligne: document.querySelector('tr[data-sid] .att-st').textContent }));
    await p.screenshot({ path: `/workspace/hors-ligne-${name}.png` });

    // 6. Rechargement SANS réseau : interface depuis le service worker, file conservée.
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('#offInd'); await sleep(400);
    await p.evaluate((d) => { KL.go('attendance'); KL.attD(d); }, day); await sleep(400);
    r.apresRechargementHorsLigne = await p.evaluate(() => ({ indicateur: document.getElementById('offInd').textContent, ligne: (document.querySelector('tr[data-sid] .att-st') || {}).textContent, utilisateur: (document.getElementById('userChip') || {}).innerText }));

    // 7. Retour du réseau : synchronisation automatique.
    cut(false); await p.setOfflineMode(false);
    await p.waitForFunction(() => /Synchronisé/.test(document.getElementById('offInd').textContent), { timeout: 15000 });
    await sleep(400);
    r.apresRetourReseau = await p.evaluate(() => ({ indicateur: document.getElementById('offInd').textContent, ligne: (document.querySelector('tr[data-sid] .att-st') || {}).textContent }));
    await p.screenshot({ path: `/workspace/hors-ligne-${name}-synchro.png` });
    const srv = await api(`/api/attendance?class_id=1&day=${day}`, dir);
    r.serveur = srv.map((x) => `${x.student_id}:${x.status} v${x.version}`);

    // 8. Ordinateur : conflit (la direction corrige pendant que l'appareil est hors ligne).
    if (name === 'desktop') {
      cut(true); await p.setOfflineMode(true); await sleep(200);
      await p.evaluate(() => { const b = [...document.querySelectorAll('tr[data-sid] .attbtn')].find((x) => x.textContent.trim().startsWith('R')); b.click(); });
      await p.click('#attSaveBtn'); await sleep(300);
      const sid = srv[0].student_id;
      await api('/api/attendance/sync', dir, { ops: [{ op_id: `dir-${Date.now()}`, class_id: 1, student_id: sid, day, status: 'excuse', base_version: srv[0].version, reason: 'Justificatif reçu (fictif)' }] });
      cut(false); await p.setOfflineMode(false);
      await p.waitForSelector('#attConflicts', { timeout: 15000 }); await sleep(300);
      r.conflit = await p.evaluate(() => ({ indicateur: document.getElementById('offInd').textContent, boite: document.getElementById('attConflicts').innerText.slice(0, 220) }));
      await p.screenshot({ path: `/workspace/hors-ligne-${name}-conflit.png` });
    }
    r.erreurs = errs;
    out[name] = r;
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close(); proxy.close();
})().catch((e) => { console.error(e); process.exit(1); });
