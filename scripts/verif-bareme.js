// Barème dans Chrome headless (iPhone SE, Pixel 7, iPad Mini, ordinateur) : l'enseignant crée une évaluation /200,
// passe le barème à une valeur personnalisée tant qu'elle est en brouillon, saisit une note, et la note hors barème est refusée.
// Usage : NORIA_DEMO=1 npm start (dans server/) ; node scripts/verif-bareme.js http://127.0.0.1:3100
// Dépendance (hors dépôt) : puppeteer-core. Captures : /workspace/bareme-<appareil>.png
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:3100';
const D = [['iphone-se', 375, 667, 2, true], ['pixel-7', 412, 915, 2.625, true], ['ipad-mini', 768, 1024, 2, true], ['desktop', 1280, 800, 1, false]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--headless=new'] });
  const out = {};
  for (const [name, w, h, dpr, mob] of D) {
    const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob });
    await p.goto(BASE + '/app', { waitUntil: 'networkidle0' });
    await p.waitForSelector('#loginScreen:not([hidden]) #lgForm');
    await p.select('#lgSchool', 'ecole-a');
    await p.$eval('#lgId', (e) => { e.value = 'prof1@a.exemple.invalid'; });
    await p.$eval('#lgPw', (e) => { e.value = 'demo-fictif-2026'; });
    await p.click('.login-main'); await p.waitForSelector('#userChip', { timeout: 8000 }); await sleep(500);
    await p.evaluate(() => KL.go('academic')); await p.waitForFunction(() => document.querySelector('.sco-new summary'), { timeout: 8000 });
    const def = await p.$eval('#scoNewMaxSel', (e) => e.value);
    await p.evaluate((n) => { const f = document.querySelector('.sco-new form'); f.title.value = `Composition ${n} (fictive)`; const s = f.querySelector('#scoNewMaxSel'); s.value = '200'; NORIA_SCO.maxSel(s); f.requestSubmit(); }, name);
    await p.waitForFunction(() => document.querySelector('#scoEvMaxSel'), { timeout: 8000 });
    const cree = await p.$eval('#scoEvMaxSel', (e) => e.value);
    // Barème personnalisé (/150) en brouillon.
    await p.evaluate(() => { const s = document.querySelector('#scoEvMaxSel'); s.value = 'autre'; NORIA_SCO.maxSel(s); const i = document.querySelector('#scoEvMax'); i.value = '150'; i.form.requestSubmit(); });
    await p.waitForFunction(() => /Barème changé : \/150/.test(document.querySelector('#view').innerText), { timeout: 8000 });
    await p.evaluate(() => { const i = document.querySelector('.sco-in'); i.value = '120'; i.dispatchEvent(new Event('input')); i.scrollIntoView({ block: 'center' }); });
    await p.evaluate(() => { const c = document.querySelector('.sco-maxf').closest('.card'); const hd = document.querySelector('header'); window.scrollTo(0, c.getBoundingClientRect().top + scrollY - (hd ? hd.getBoundingClientRect().height : 0) - 8); });
    await sleep(300);
    await p.screenshot({ path: `/workspace/bareme-${name}.png` });
    out[name] = { defaut: def, cree, personnalise: await p.$eval('#scoEvMax', (e) => e.value), placeholder: await p.$eval('.sco-in', (e) => e.placeholder), erreurs: errs };
    await ctx.close();
  }
  await b.close();
  console.log(JSON.stringify(out, null, 1));
  if (Object.values(out).some((r) => r.erreurs.length || r.defaut !== '100' || r.cree !== '200' || r.personnalise !== '150')) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
