// Connexion par code à 6 chiffres dans Chrome headless (iPhone SE, Pixel 7, iPad Mini, ordinateur) : demande du code
// par téléphone, écran de saisie (FR puis kreyòl), code erroné refusé, bon code accepté, renvoi bloqué pendant 60 s.
// Le code est lu dans la boîte d'envoi simulée (adaptateur console, base SQLite de démonstration).
// Usage : NORIA_DEMO=1 NORIA_DB=/tmp/noria.db npm start (dans server/) ; node scripts/verif-otp.js http://127.0.0.1:3100 /tmp/noria.db
// Dépendance (hors dépôt) : puppeteer-core. Captures : /workspace/otp-<sujet>-<appareil>.png
const puppeteer = require('puppeteer-core');
const Database = require('../server/node_modules/better-sqlite3');
const BASE = process.argv[2] || 'http://127.0.0.1:3100';
const DB = new Database(process.argv[3] || 'server/noria-demo.sqlite', { readonly: true });
const D = [['iphone-se', 375, 667, 2, true, 'prof1'], ['pixel-7', 412, 915, 2.625, true, 'parent1'], ['ipad-mini', 768, 1024, 2, true, 'secretariat'], ['desktop', 1280, 800, 1, false, 'direction']];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastCode = (phone) => { const r = DB.prepare("SELECT body FROM outbox WHERE kind = 'code' AND recipient = ? ORDER BY id DESC LIMIT 1").get(phone); return r && r.body.match(/\b(\d{6})\b/)[1]; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--headless=new'] });
  const out = {};
  for (const [name, w, h, dpr, mob, handle] of D) {
    const phone = DB.prepare("SELECT u.phone FROM app_user u JOIN school s ON s.id = u.school_id WHERE s.slug = 'ecole-a' AND u.email = ?").get(`${handle}@a.exemple.invalid`).phone;
    const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/401/.test(m.text())) errs.push(m.text()); });
    const cdp = await p.createCDPSession(); await cdp.send('Network.enable');
    let bytes = 0; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
    await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob });
    await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
    await p.waitForSelector('#loginScreen:not([hidden]) #lgCode');
    const r = { compte: handle, premierChargementOctets: bytes };
    await p.screenshot({ path: `/workspace/otp-connexion-${name}.png` });
    await p.click('#lgCode'); await p.waitForSelector('#cdForm');
    await p.select('#lgSchool', 'ecole-a');
    await p.type('#cdId', phone.replace('+509', '')); // numéro local à 8 chiffres
    await p.screenshot({ path: `/workspace/otp-demande-${name}.png` });
    await p.click('#cdForm .login-main'); await p.waitForSelector('#otpCode', { timeout: 8000 }); await sleep(300);
    r.renvoiBloque = await p.$eval('#otpResend', (e) => e.disabled && /\d+ s/.test(e.textContent));
    r.autocomplete = await p.$eval('#otpCode', (e) => e.autocomplete);
    await p.screenshot({ path: `/workspace/otp-saisie-${name}.png` });
    const code = lastCode(phone); r.codeRecu = /^\d{6}$/.test(code || '');
    // Code erroné.
    const wrong = code === '000000' ? '111111' : '000000';
    await p.type('#otpCode', wrong);
    await p.waitForFunction(() => document.getElementById('otpErr').textContent.length > 0, { timeout: 8000 });
    r.erreur = await p.$eval('#otpErr', (e) => e.textContent);
    await p.screenshot({ path: `/workspace/otp-erreur-${name}.png` });
    // Kreyòl.
    await p.click('[data-lang="ht"]'); await p.waitForFunction(() => /Antre kòd la/.test(document.getElementById('loginTitle').textContent), { timeout: 5000 });
    r.kreyol = await p.$eval('#loginTitle', (e) => e.textContent);
    await p.screenshot({ path: `/workspace/otp-kreyol-${name}.png` });
    await p.click('[data-lang="fr"]'); await p.waitForSelector('#otpCode'); await sleep(200);
    await p.type('#otpCode', code);
    await p.waitForSelector('#userChip', { timeout: 8000 }); await sleep(600);
    r.connecte = await p.$eval('#userChip', (e) => e.innerText.replace(/\s+/g, ' '));
    await p.screenshot({ path: `/workspace/otp-connecte-${name}.png` });
    r.erreursConsole = errs;
    out[name] = r;
    await ctx.close();
  }
  await b.close();
  console.log(JSON.stringify(out, null, 1));
  if (Object.values(out).some((r) => r.erreursConsole.length || !r.codeRecu || !r.renvoiBloque || !r.connecte)) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
