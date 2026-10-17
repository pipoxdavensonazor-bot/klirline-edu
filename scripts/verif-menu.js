// Menu de la direction (ordinateur : menu latéral ; Pixel 7 : tiroir « Menu » ouvert) avec les entrées Transferts,
// Portail : propositions et Déclaration au ministère (NORIA_MINISTERE=1). Poids du premier chargement de /app.
// Usage : NODE_PATH=/chemin/vers/node_modules node scripts/verif-menu.js http://127.0.0.1:3140
//   (serveur lancé avec NORIA_DEMO=1 NORIA_MINISTERE=1). Sorties : /workspace/correctif-menu-<appareil>[-ht].png
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:3140';
const D = [['ordinateur', 1280, 800, 1, false, 'fr'], ['pixel-7', 412, 915, 2.625, true, 'fr'], ['pixel-7', 412, 915, 2.625, true, 'ht']];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--headless=new'] });
  const out = {}; let fail = 0;
  try {
    for (const [name, w, h, dpr, mob, L] of D) {
      const key = `${name}${L === 'ht' ? '-ht' : ''}`; const r = out[key] = {}; const errs = [], csp = [];
      const ctx = await b.createBrowserContext(); const p = await ctx.newPage();
      p.on('pageerror', (e) => errs.push(e.message));
      p.on('console', (m) => { const x = m.text(); if (/Content Security Policy|Refused to/i.test(x)) csp.push(x); else if (m.type() === 'error' && !/\b401\b/.test(x)) errs.push(x); });
      await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob });
      const cdp = await p.createCDPSession(); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      let bytes = 0; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
      await p.goto(`${BASE}/app`, { waitUntil: 'networkidle0' }); await cdp.detach();
      r.appPremierChargementKo = Math.round(bytes / 102.4) / 10;
      await p.select('#lgSchool', 'ecole-a');
      await p.$eval('#lgId', (e) => { e.value = 'direction@a.exemple.invalid'; }); await p.$eval('#lgPw', (e) => { e.value = 'demo-fictif-2026'; });
      await p.click('.login-main'); await p.waitForSelector('#userChip', { timeout: 9000 }); await sleep(500);
      await p.evaluate((l) => { const s = document.getElementById('langSel'); if (s.value !== l) { s.value = l; s.dispatchEvent(new Event('change', { bubbles: true })); } }, L); await sleep(500);
      r.menu = await p.evaluate(() => [...document.querySelectorAll('#nav > *')].map((e) => (e.tagName === 'SMALL' ? `[${e.textContent}]` : e.textContent.trim())));
      if (mob) {
        await p.click('.mnv-menu-btn'); await p.waitForSelector('#mnvDrawer:not([hidden])'); await sleep(400);
        r.visibles = await p.evaluate(() => [...document.querySelectorAll('.mnv-item')].filter((e) => { const b = e.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; }).map((e) => e.textContent));
      } else {
        r.visibles = await p.evaluate(() => [...document.querySelectorAll('#nav button')].filter((e) => { const b = e.getBoundingClientRect(); const n = document.getElementById('nav').getBoundingClientRect(); return b.top >= n.top && b.bottom <= Math.min(n.bottom, innerHeight); }).map((e) => e.textContent.trim()));
        // Montre la page Déclaration ouverte depuis le menu.
        await p.click('#nav button[data-nav="declaration"]'); await p.waitForSelector('#declOk, .badbox', { timeout: 9000 }); await sleep(300);
      }
      await p.screenshot({ path: `/workspace/correctif-menu-${key}.png` });
      r.erreurs = errs; r.csp = csp; if (errs.length || csp.length) fail++;
      for (const want of [/Transf/, /Portail : propositions|Pòtay : pwopozisyon/, /Déclaration au ministère|Deklarasyon bay ministè/]) if (!r.visibles.some((x) => want.test(x))) { r.manque = (r.manque || []).concat(String(want)); fail++; }
      await ctx.close();
    }
  } finally { await b.close(); }
  console.log(JSON.stringify(out, null, 1)); process.exit(fail ? 1 : 0);
})();
