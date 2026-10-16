// Cœur scolaire dans Chrome headless (iPhone SE, Pixel 7, iPad Mini, ordinateur) :
// enseignant saisit des notes (dont une partie hors ligne, même file idempotente) et soumet → direction publie,
// émet le bulletin, publie des annonces ciblées et invite un compte → le parent voit les notes, le bulletin PDF
// et seulement les annonces qui le concernent. Le QR du PDF est décodé (pdftoppm + jsQR) et la page de
// vérification publique est ouverte. 0 erreur console attendue.
// Usage : NORIA_DEMO=1 npm start (dans server/) ; node scripts/verif-coeur.js http://127.0.0.1:3100
// Dépendances (hors dépôt) : puppeteer-core, jsqr, pngjs ; pdftoppm (poppler-utils).
const puppeteer = require('puppeteer-core');
const fs = require('fs'); const { execFileSync } = require('child_process');
const jsQR = require('jsqr'); const { PNG } = require('pngjs');
const BASE = process.argv[2] || 'http://127.0.0.1:3100';
const D = [['iphone-se', 375, 667, 2, true], ['pixel-7', 412, 915, 2.625, true], ['ipad-mini', 768, 1024, 2, true], ['desktop', 1280, 800, 1, false]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const txt = (p) => p.$eval('#view', (e) => e.innerText);
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--headless=new'] });
  const out = {};
  for (const [name, w, h, dpr, mob] of D) {
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Correction fictive' : undefined));
    const cdp = await p.createCDPSession(); await cdp.send('Network.enable');
    let bytes = 0; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
    await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob });
    await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
    await p.waitForSelector('#loginScreen:not([hidden]) #lgForm');
    const r = { premierChargementOctets: bytes };
    const login = async (handle) => {
      await p.select('#lgSchool', 'ecole-a');
      await p.$eval('#lgId', (e, v) => { e.value = v; }, `${handle}@a.exemple.invalid`);
      await p.$eval('#lgPw', (e) => { e.value = 'demo-fictif-2026'; });
      await p.click('.login-main'); await p.waitForSelector('#userChip', { timeout: 8000 }); await p.waitForSelector('#offInd', { timeout: 8000 }); await sleep(500);
    };
    const logout = async () => { await p.click('#lgOut'); await p.waitForSelector('#loginScreen:not([hidden]) #lgForm', { timeout: 8000 }); };
    const go = async (m) => { await p.evaluate((m) => KL.go(m), m); await sleep(500); };
    const until = (fn, arg, ms = 8000) => p.waitForFunction(fn, { timeout: ms }, arg);
    const tap = (sel) => p.$eval(sel, (e) => e.click()); // clic DOM : pas de décalage si la vue se redessine
    const title = `Contrôle ${name} (fictif)`;

    // 1. Enseignant : crée l'évaluation, saisit (2 notes hors ligne puis le reste en ligne), soumet.
    await login('prof1'); await go('academic');
    await until(() => document.querySelector('.sco-new summary'));
    await p.evaluate((title) => { const f = document.querySelector('.sco-new form'); f.title.value = title; f.max.value = '10'; f.querySelector('details') ; f.requestSubmit(); }, title);
    await until(() => document.querySelectorAll('.sco-in').length > 0);
    const n = await p.$$eval('.sco-in', (x) => x.length);
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await until(() => !navigator.onLine);
    await p.evaluate(() => { [...document.querySelectorAll('.sco-in')].slice(0, 2).forEach((e, i) => { e.value = String(7 + i); e.dispatchEvent(new Event('input')); }); KL && NORIA_SCO.saveGrades(); });
    await until(() => /en attente/.test(document.getElementById('offInd').textContent));
    r.horsLigne = await p.$eval('#offInd', (e) => e.textContent);
    await p.screenshot({ path: `/workspace/coeur-saisie-hors-ligne-${name}.png` });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await until(() => /Synchronisé/.test(document.getElementById('offInd').textContent), null, 15000);
    await sleep(400);
    await p.evaluate(() => { [...document.querySelectorAll('.sco-in')].slice(2).forEach((e, i) => { if (!e.value) { e.value = String(5 + (i % 5)); e.dispatchEvent(new Event('input')); } }); NORIA_SCO.saveGrades(); });
    await until(() => /Synchronisé/.test(document.getElementById('offInd').textContent) && !document.querySelector('.b-pend'), null, 15000);
    await sleep(600);
    await until(() => document.getElementById('scoSubmit')); await tap('#scoSubmit');
    await until((t) => [...document.querySelectorAll('.sco-ev')].some((e) => e.textContent.includes(t) && /Soumise/.test(e.textContent)), title);
    r.enseignant = { notesSaisies: n, soumise: true };
    await p.screenshot({ path: `/workspace/coeur-enseignant-${name}.png` });
    await logout();

    // 2. Direction : publie, émet le bulletin, annonces ciblées, invitation.
    await login('direction'); await go('academic');
    await until((t) => [...document.querySelectorAll('.sco-ev')].some((e) => e.textContent.includes(t)), title);
    await p.evaluate((t) => [...document.querySelectorAll('.sco-ev')].find((e) => e.textContent.includes(t)).click(), title);
    await until(() => document.getElementById('scoPublish')); await tap('#scoPublish');
    await until((t) => [...document.querySelectorAll('.sco-ev')].some((e) => e.textContent.includes(t) && /Publiée/.test(e.textContent)), title);
    await until(() => document.querySelector('[data-issue]')); await tap('[data-issue]');
    await until(() => document.getElementById('scoVerify'));
    const verifyUrl = await p.$eval('#scoVerify', (e) => e.value);
    await p.screenshot({ path: `/workspace/coeur-direction-${name}.png` });
    await go('comms');
    const annonce = async (aud, t) => {
      await p.evaluate((aud, t) => { const f = document.querySelector('#view form'); f.title.value = t; f.body.value = 'Texte fictif.'; f.aud.value = aud; f.requestSubmit(); }, aud, t);
      await until((t) => document.getElementById('view').innerText.includes(t), t);
    };
    await annonce('parents', `Pour les parents ${name}`); await annonce('enseignants', `Pour les enseignants ${name}`);
    await go('accounts');
    await p.evaluate(() => { const f = document.getElementById('invForm'); f.name.value = 'Parent invité (fictif)'; f.phone.value = '+509 0000 0199'; f.role.value = 'parent'; f.student.selectedIndex = 1; f.requestSubmit(); });
    await until(() => document.getElementById('invLink'));
    r.invitation = await p.$eval('#invLink', (e) => e.value.replace(/=.+$/, '=…'));
    await p.screenshot({ path: `/workspace/coeur-comptes-${name}.png` });
    await logout();

    // 3. Parent : voit la note publiée, la moyenne, le bulletin ; seulement les annonces parents/école/classe.
    await login('parent1'); await go('academic');
    await until((t) => document.getElementById('view').innerText.includes(t), title);
    const view = await txt(p);
    r.parent = { voitEvaluation: view.includes(title), moyenne: /Moyenne générale/.test(view) };
    const pdf = await p.evaluate(async () => {
      const list = await (await fetch('/api/report-cards?student_id=' + KL.serverState().students[0].serverId)).json();
      const cur = list.find((x) => !x.revoked_at);
      const buf = new Uint8Array(await (await fetch(`/api/report-cards/${cur.id}/pdf`)).arrayBuffer());
      let s = ''; buf.forEach((x) => { s += String.fromCharCode(x); }); return btoa(s);
    });
    const pdfBuf = Buffer.from(pdf, 'base64'); const pdfPath = `/tmp/bulletin-${name}.pdf`; fs.writeFileSync(pdfPath, pdfBuf);
    if (name === 'desktop') fs.copyFileSync(pdfPath, '/workspace/bulletin-exemple.pdf');
    execFileSync('pdftoppm', ['-r', '150', '-png', '-singlefile', pdfPath, `/tmp/bulletin-${name}`]);
    const png = PNG.sync.read(fs.readFileSync(`/tmp/bulletin-${name}.png`));
    const qr = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    r.bulletin = { octets: pdfBuf.length, qrLu: !!qr, qrEgalLien: !!qr && qr.data.replace(/^https?:\/\/[^/]+/, '') === verifyUrl.replace(/^https?:\/\/[^/]+/, '') };
    await p.screenshot({ path: `/workspace/coeur-parent-${name}.png` });
    await go('comms');
    await until(() => document.querySelector('.sco-ann'));
    const cv = await txt(p);
    r.parent.annonceParents = cv.includes(`Pour les parents ${name}`); r.parent.annonceEnseignantsCachee = !cv.includes('Pour les enseignants');
    await p.screenshot({ path: `/workspace/coeur-annonces-${name}.png` });
    await logout();
    await login('prof1'); await go('comms'); await until(() => document.querySelector('.sco-ann'));
    const tv = await txt(p);
    r.enseignant.annonceEnseignants = tv.includes(`Pour les enseignants ${name}`); r.enseignant.annonceParentsCachee = !tv.includes('Pour les parents');
    await logout();

    // 4. Vérification publique du QR (sans session).
    const pv = await ctx.newPage(); pv.on('pageerror', (e) => errs.push(e.message)); pv.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await pv.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob });
    await pv.goto(BASE + '/' + (qr ? qr.data.replace(/^https?:\/\/[^/]+\/?/, '') : ''), { waitUntil: 'networkidle0' });
    await pv.waitForSelector('#verifRes');
    r.verification = await pv.$eval('#loginScreen', (e) => e.innerText.replace(/\s+/g, ' ').slice(0, 220));
    await pv.screenshot({ path: `/workspace/coeur-verification-${name}.png` });
    r.errors = errs; out[name] = r; await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1)); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
