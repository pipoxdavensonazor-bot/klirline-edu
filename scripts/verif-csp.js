// CSP stricte dans Chrome headless (iPhone SE, Pixel 7, iPad Mini, ordinateur) : aucune violation CSP (événement
// securitypolicyviolation + console), aucune erreur. Connexion direction, enseignant et parent, chaque section du rôle
// visitée, ouverture/fermeture des fenêtres modales, changement de langue (délégation change), poids du premier chargement.
// Usage : (cd server && NORIA_DEMO=1 npm start) ; node scripts/verif-csp.js http://127.0.0.1:3100
// Dépendance (hors dépôt) : puppeteer-core. Captures : /workspace/csp-<appareil>.png
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:3100';
const D = [['iphone-se', 375, 667, 2, true], ['pixel-7', 412, 915, 2.625, true], ['ipad-mini', 768, 1024, 2, true], ['desktop', 1280, 800, 1, false]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--headless=new'] });
  const out = {};
  for (const [name, w, h, dpr, mob] of D) {
    const ctx = await b.createBrowserContext(); const p = await ctx.newPage();
    const errs = [], csp = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) csp.push(t); else if (m.type() === 'error' && !/401/.test(t)) errs.push(t); });
    await p.exposeFunction('__cspViol', (v) => csp.push(v));
    await p.evaluateOnNewDocument(() => document.addEventListener('securitypolicyviolation', (e) => window.__cspViol(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile || ''}:${e.lineNumber}`)));
    const cdp = await p.createCDPSession(); await cdp.send('Network.enable');
    let bytes = 0, reqs = 0; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; reqs++; });
    await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob });
    const resp = await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
    await p.waitForSelector('#loginScreen:not([hidden]) #lgForm');
    const r = { premierChargement: { octets: bytes, requetes: reqs }, cspServie: resp.headers()['content-security-policy'] };
    const roles = {};
    for (const handle of ['direction', 'prof1', 'parent1']) {
      await p.select('#lgSchool', 'ecole-a');
      await p.$eval('#lgId', (e, v) => { e.value = v; }, `${handle}@a.exemple.invalid`);
      await p.$eval('#lgPw', (e) => { e.value = 'demo-fictif-2026'; });
      await p.click('.login-main'); await p.waitForSelector('#userChip', { timeout: 8000 }); await sleep(300);
      if (handle === 'direction') await p.screenshot({ path: `/workspace/csp-${name}.png` });
      const res = await p.evaluate(async () => {
        const S = (ms) => new Promise((z) => setTimeout(z, ms));
        const n = document.querySelectorAll('#nav > button').length; let vues = 0, modales = 0, actions = 0;
        for (let i = 0; i < n; i++) {
          document.querySelectorAll('#nav > button')[i].click(); await S(120); vues++;
          actions += document.querySelectorAll('#view [data-action],#view [data-action-change],#view [data-action-input],#view [data-action-submit]').length;
          const m = [...document.querySelectorAll('#view [data-action$="Modal"]')].find((e) => e.offsetParent !== null);
          if (m) { m.click(); await S(120); const c = document.querySelector('[data-action="vider"],[data-action="retirer"]'); if (c) { c.click(); modales++; } await S(60); }
        }
        const avant = document.getElementById('nav').innerText; const l = document.getElementById('langSel'); l.value = 'ht'; l.dispatchEvent(new Event('change', { bubbles: true })); await S(150);
        const ht = document.getElementById('nav').innerText !== avant; l.value = 'fr'; l.dispatchEvent(new Event('change', { bubbles: true })); await S(150);
        return { vues, modales, actions, langueHT: ht, styleCSSOM: [...document.querySelectorAll('[style]')].map((e) => e.tagName + ' ' + e.getAttribute('style')) };
      });
      roles[handle] = res;
      await cdp.send('Network.clearBrowserCookies'); await p.reload({ waitUntil: 'networkidle0' });
      await p.waitForSelector('#loginScreen:not([hidden]) #lgForm', { timeout: 8000 }).catch(() => {});
    }
    Object.assign(r, { roles, violationsCSP: csp, erreurs: errs });
    out[name] = r; await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  const bad = Object.values(out).some((r) => r.violationsCSP.length || r.erreurs.length);
  await b.close(); process.exit(bad ? 1 : 0);
})();
