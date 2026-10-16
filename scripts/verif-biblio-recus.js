// Bibliothèque et paiements dans Chrome headless (iPhone SE, Pixel 7, iPad Mini, ordinateur) : la direction ajoute un
// livre et prête un exemplaire, la comptabilité enregistre un paiement MonCash et télécharge le reçu PDF, la direction
// annule un reçu avec motif ; le parent voit le solde, les reçus et les prêts de son enfant (FR puis kreyòl) ; le QR du
// reçu est décodé et la page publique de vérification est ouverte. 0 erreur console et 0 violation CSP attendues.
// Usage : (cd server && NORIA_DEMO=1 npm start) ; node scripts/verif-biblio-recus.js http://127.0.0.1:3100
// Dépendances (hors dépôt) : puppeteer-core, jsqr, pngjs ; pdftoppm (poppler-utils).
// Captures : /workspace/phase5-<sujet>-<appareil>.png ; reçu d'exemple : /workspace/recu-exemple.pdf
const puppeteer = require('puppeteer-core');
const fs = require('fs'); const { execFileSync } = require('child_process');
const jsQR = require('jsqr'); const { PNG } = require('pngjs');
const BASE = process.argv[2] || 'http://127.0.0.1:3100';
const D = [['iphone-se', 375, 667, 2, true], ['pixel-7', 412, 915, 2.625, true], ['ipad-mini', 768, 1024, 2, true], ['ordinateur', 1280, 800, 1, false]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--headless=new'] });
  const out = {}; let fail = 0;
  for (const [name, w, h, dpr, mob] of D) {
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage(); const errs = [], csp = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) csp.push(t); else if (m.type() === 'error' && !/401/.test(t)) errs.push(t); });
    await p.exposeFunction('__cspViol', (v) => csp.push(v));
    await p.evaluateOnNewDocument(() => document.addEventListener('securitypolicyviolation', (e) => window.__cspViol(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile || ''}:${e.lineNumber}`)));
    p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Saisie en double (fictif)' : undefined));
    const cdp = await p.createCDPSession(); await cdp.send('Network.enable');
    let bytes = 0, reqs = 0; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; reqs++; });
    await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob });
    await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
    await p.waitForSelector('#loginScreen:not([hidden]) #lgForm');
    const r = { premierChargement: { octets: bytes, requetes: reqs } };
    const until = (fn, arg, ms = 8000) => p.waitForFunction(fn, { timeout: ms }, arg).catch(async (e) => {
      console.error(name, 'attente échouée :', String(fn).slice(0, 120), '\n', await p.evaluate(() => document.getElementById('toasts').innerText + ' | ' + document.getElementById('view').innerText.slice(0, 600)));
      throw e;
    });
    const login = async (handle) => {
      await p.select('#lgSchool', 'ecole-a');
      await p.$eval('#lgId', (e, v) => { e.value = v; }, `${handle}@a.exemple.invalid`);
      await p.$eval('#lgPw', (e) => { e.value = 'demo-fictif-2026'; });
      await p.click('.login-main'); await p.waitForSelector('#userChip', { timeout: 8000 }); await sleep(400);
    };
    const logout = async () => { await p.click('#lgOut'); await p.waitForSelector('#loginScreen:not([hidden]) #lgForm', { timeout: 8000 }); };
    const go = async (m) => { await p.evaluate((m) => KL.go(m), m); await sleep(500); };
    const shot = (sujet) => p.screenshot({ path: `/workspace/phase5-${sujet}-${name}.png`, fullPage: true });
    const tag = name.toUpperCase();

    // 1. Direction : livre + prêt.
    await login('direction'); await go('library');
    await until(() => document.querySelector('.ges-new form'));
    await p.evaluate((tag) => { const f = document.querySelector('.ges-new form'); f.title.value = `Lekti ${tag} (fictif)`; f.author.value = 'Otè fiktif'; f.isbn.value = '978-0-306-40615-7'; f.copies.value = '2'; f.requestSubmit(); }, tag);
    await until((tag) => document.getElementById('view').innerText.includes(`Lekti ${tag}`), tag);
    await until(() => document.querySelector('form [name=book]') && document.querySelector('form [name=student]'));
    await p.evaluate((tag) => { const f = document.querySelector('form [name=book]').form; const o = [...f.book.options].find((x) => x.text.includes(`Lekti ${tag}`)); f.book.value = o.value; f.requestSubmit(); }, tag);
    await until((tag) => [...document.querySelectorAll('.ges-list li')].some((li) => li.innerText.includes(`Lekti ${tag}`) && li.querySelector('[data-action="NORIA_GES.giveBack"]')), tag);
    r.pretAffiche = true;
    await shot('bibliotheque');
    // Retour du livre : l'exemplaire redevient disponible, le prêt reste dans l'historique (filtre « Tous »).
    await p.evaluate((tag) => [...document.querySelectorAll('.ges-list li')].find((li) => li.innerText.includes(`Lekti ${tag}`) && li.querySelector('[data-action="NORIA_GES.giveBack"]')).querySelector('[data-action="NORIA_GES.giveBack"]').click(), tag);
    await until((tag) => ![...document.querySelectorAll('.ges-list li')].some((li) => li.innerText.includes(`Lekti ${tag}`) && li.querySelector('[data-action="NORIA_GES.giveBack"]')), tag);
    r.retour = true;
    await logout();

    // 2. Comptabilité : paiement MonCash, reçu PDF.
    await login('compta'); await go('finance');
    await until(() => document.getElementById('gesPay'));
    const ref = `MC-${tag}-${Date.now()}`;
    await p.evaluate((ref) => { const f = document.getElementById('gesPay'); f.amount.value = '2500'; f.method.value = 'moncash'; f.method.dispatchEvent(new Event('change', { bubbles: true })); f.ref.value = ref; f.label.value = 'Scolarité T1 (fictif)'; f.requestSubmit(); }, ref);
    await until((ref) => document.getElementById('view').innerText.includes(ref), ref);
    await shot('finances');
    const pid = await p.evaluate((ref) => { const li = [...document.querySelectorAll('.ges-list li')].find((x) => x.innerText.includes(ref)); return Number(li.querySelector('[data-action="NORIA_GES.pdf"]').getAttribute('data-a0').slice(2)); }, ref);
    const pdf = Buffer.from(await p.evaluate(async (id) => { const res = await fetch(`/api/payments/${id}/pdf`); return [...new Uint8Array(await res.arrayBuffer())]; }, pid));
    r.recuOctets = pdf.length;
    const pdfPath = name === 'ordinateur' ? '/workspace/recu-exemple.pdf' : `/tmp/recu-${name}.pdf`;
    fs.writeFileSync(pdfPath, pdf);
    execFileSync('pdftoppm', ['-png', '-r', '110', '-singlefile', pdfPath, `/tmp/recu-${name}`]);
    if (name === 'ordinateur') fs.copyFileSync(`/tmp/recu-${name}.png`, '/workspace/phase5-recu-pdf-ordinateur.png');
    const png = PNG.sync.read(fs.readFileSync(`/tmp/recu-${name}.png`));
    const qr = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    r.qr = qr && qr.data;
    await logout();

    // 3. Direction : annule ce reçu (motif) — il reste listé, marqué annulé. Sauf sur l'ordinateur (reçu d'exemple valide).
    if (name !== 'ordinateur') {
      await login('direction'); await go('finance');
      await until((id) => document.querySelector(`[data-action="NORIA_GES.cancel"][data-a0="n:${id}"]`), pid);
      await p.$eval(`[data-action="NORIA_GES.cancel"][data-a0="n:${pid}"]`, (e) => e.click());
      await until((ref) => [...document.querySelectorAll('.ges-cancel')].some((li) => li.innerText.includes(ref)), ref);
      r.annule = true;
      await logout();
    }

    // 4. Parent : solde, reçus et prêts de l'enfant, puis en kreyòl.
    await login('parent1'); await go('finance');
    await until(() => /Solde/.test(document.getElementById('view').innerText) && document.querySelector('[data-action="NORIA_GES.pdf"]'));
    await shot('parent-finances');
    await go('library');
    await until((tag) => document.getElementById('view').innerText.includes(`Lekti ${tag}`) && /Prêts de mes enfants/.test(document.getElementById('view').innerText), tag);
    await shot('parent-bibliotheque');
    await p.select('#langSel', 'ht'); await sleep(300); await go('finance');
    await until(() => /Sa ki rete pou peye/.test(document.getElementById('view').innerText));
    await shot('kreyol-finances');
    await go('library');
    await until(() => /Liv pitit mwen yo prete/.test(document.getElementById('view').innerText));
    await shot('kreyol-bibliotheque');
    await p.select('#langSel', 'fr'); await sleep(200);
    await logout();

    // 5. Page publique de vérification (QR du reçu).
    if (r.qr) {
      const code = r.qr.split('#verifier=')[1];
      await p.goto('about:blank'); await p.goto(`${BASE}/#verifier=${code}`, { waitUntil: 'networkidle0' });
      await until(() => document.getElementById('verifRes'));
      r.verification = await p.$eval('#verifRes', (e) => e.textContent.trim());
      await shot('verification');
    }
    r.erreursConsole = errs; r.violationsCSP = csp;
    if (errs.length || csp.length || !r.qr || !/authentique|annulé/i.test(r.verification || '')) fail++;
    out[name] = r;
    await ctx.close();
  }
  await b.close();
  console.log(JSON.stringify(out, null, 2));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
