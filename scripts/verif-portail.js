// Bloc 5 dans Chrome headless (iPhone SE, Pixel 7, iPad Mini, ordinateur) : portail public (accueil, événements, détail,
// lauréats, communauté, annonces) en FR et en kreyòl, sans connexion ; anciens liens /#… renvoyés vers /app ; poids du
// premier chargement du portail et de l'application ; direction : proposition avec image compressée sur l'appareil
// (événement) ou lauréat mineur sans consentement ; super-admin : file de modération puis publication ; contrôle sur le
// portail (image servie, initiales du mineur). 0 erreur console et 0 violation CSP attendues.
// Usage : NODE_PATH=/chemin/vers/node_modules node scripts/verif-portail.js [port]
//   Base SQLite fictive (/tmp/noria-b5.sqlite), serveur lancé avec NORIA_DEMO=1 puis arrêté.
// Dépendances (hors dépôt) : puppeteer-core, Chrome (/usr/bin/google-chrome).
// Sorties : /workspace/bloc5-<page>-<appareil>.png, résumé JSON sur la sortie standard.
const puppeteer = require('puppeteer-core');
const fs = require('fs'); const path = require('path'); const os = require('os'); const { spawn } = require('child_process');
const S = path.join(__dirname, '..', 'server');
const { openStore } = require(path.join(S, 'src/store'));
const { seed, seedMulti, seedPortal, DEMO_PASSWORD } = require(path.join(S, 'src/seed'));
const { createAdmin } = require(path.join(S, 'src/plateforme'));
const PORT = Number(process.argv[2] || 3135); const BASE = `http://127.0.0.1:${PORT}`;
const DB = '/tmp/noria-b5.sqlite';
const ADMIN = { email: 'admin@noria.exemple.invalid', password: 'admin-fictif-tres-long-2026' };
const D = [['iphone-se', 375, 667, 2, true, 'fr'], ['pixel-7', 412, 915, 2.625, true, 'ht'], ['ipad-mini', 768, 1024, 2, true, 'fr'], ['ordinateur', 1280, 800, 1, false, 'ht']];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Photo fictive « lourde » (BMP 1600×1000, dégradé et formes) pour éprouver la compression dans le navigateur.
function bmp(file, w = 1600, h = 1000) {
  const row = Math.ceil((w * 3) / 4) * 4; const size = 54 + row * h; const b = Buffer.alloc(size);
  b.write('BM', 0); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14); b.writeInt32LE(w, 18); b.writeInt32LE(h, 22);
  b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(row * h, 34);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = 54 + y * row + x * 3; const c = ((x - 800) ** 2 + (y - 500) ** 2) < 300 ** 2;
    b[o] = c ? 40 : (x * 255 / w) | 0; b[o + 1] = c ? 160 : (y * 255 / h) | 0; b[o + 2] = c ? 230 : ((x + y) % 64) * 3;
  }
  fs.writeFileSync(file, b);
}

(async () => {
  for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) fs.rmSync(f, { force: true });
  const db = await openStore(DB); const ids = await seedMulti(db, await seed(db)); await seedPortal(db, ids);
  await createAdmin(db, { email: ADMIN.email, name: 'Super-admin fictif', password: ADMIN.password });
  await db.close();
  const PHOTO = path.join(os.tmpdir(), 'noria-b5-photo.bmp'); bmp(PHOTO);
  let log = '';
  const srv = spawn(process.execPath, ['src/index.js'], { cwd: S, env: { ...process.env, NORIA_DEMO: '1', NORIA_DB: DB, PORT: String(PORT), HOST: '127.0.0.1', NORIA_ASSISTANT_INTERVALLE_MIN: '0', DATABASE_URL: '' } });
  srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 50 && !/http:\/\//.test(log); i++) await sleep(200);
  const lastCode = () => { const m = [...log.matchAll(/code (\d{6})/g)]; return m.length ? m[m.length - 1][1] : null; };

  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--headless=new'] });
  const report = {}; let fail = 0;
  try {
    for (const [di, [name, w, h, dpr, mob, L]] of D.entries()) {
      const r = report[name] = { langue: L };
      const errs = [], csp = [];
      const newPage = async (ctx, { app = false, allow = null } = {}) => {
        const p = await ctx.newPage();
        p.on('pageerror', (e) => errs.push(e.message));
        p.on('console', (m) => { const x = m.text(); if (/Content Security Policy|Refused to/i.test(x)) csp.push(x); else if (m.type() === 'error' && !((app || allow) && /\b40[14]\b/.test(x))) errs.push(x); });
        p.on('response', (res) => { const u = res.url(); if (res.status() >= 400 && !(app && /\/api\/(me|admin\/me)$/.test(u)) && !(allow && allow.test(u))) errs.push(`${res.status()} ${u}`); });
        await p.exposeFunction('__cspViol', (v) => csp.push(v));
        await p.evaluateOnNewDocument(() => document.addEventListener('securitypolicyviolation', (e) => window.__cspViol(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile || ''}:${e.lineNumber}`)));
        await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob });
        return p;
      };
      const weigh = async (p, url) => {
        const cdp = await p.createCDPSession(); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        let bytes = 0, n = 0; const list = []; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; n++; });
        cdp.on('Network.responseReceived', (e) => list.push(e.response.url.replace(BASE, '')));
        await p.goto(url, { waitUntil: 'networkidle0' });
        await cdp.detach();
        return { octets: bytes, ko: Math.round(bytes / 102.4) / 10, requetes: n, fichiers: list };
      };
      const pre = L === 'ht' ? '/ht' : '';
      const shot = (p, page) => p.screenshot({ path: `/workspace/bloc5-${page}-${name}.png`, fullPage: true });

      // 1. Portail public, sans connexion : poids du premier chargement de l'accueil, puis chaque page.
      const pctx = await b.createBrowserContext(); const pp = await newPage(pctx);
      r.portailPremierChargement = await weigh(pp, `${BASE}${pre || '/'}`);
      r.cookies = (await pp.cookies()).length;
      r.accueil = await pp.evaluate(() => ({ lang: document.documentElement.lang, h1: document.querySelector('h1').textContent, sponsorise: [...document.querySelectorAll('.tag-sp')].map((e) => e.textContent),
        evenements: document.querySelectorAll('#s-ev ~ .list .ev, .ev').length, laureats: document.querySelectorAll('.la').length, partenaires: document.querySelectorAll('.partners li').length,
        connexion: document.querySelector('.btn-in').getAttribute('href'), og: !!document.querySelector('meta[property="og:image"]') }));
      await shot(pp, 'accueil');
      for (const [page, url] of [['evenements', '/evenements'], ['laureats', '/laureats'], ['communaute', '/communaute'], ['annonces', '/annonces']]) {
        await pp.goto(`${BASE}${pre}${url}`, { waitUntil: 'networkidle0' }); await shot(pp, page);
      }
      // Filtres des lauréats (formulaire GET, sans script).
      await pp.goto(`${BASE}${pre}/laureats`, { waitUntil: 'networkidle0' });
      await pp.select('select[name="departement"]', 'nord'); await Promise.all([pp.waitForNavigation({ waitUntil: 'networkidle0' }), pp.click('.filters button')]);
      r.filtreLaureats = await pp.evaluate(() => ({ url: location.search, n: document.querySelectorAll('.la').length, masques: [...document.querySelectorAll('.la-n')].filter((e) => e.querySelector('.mask')).map((e) => e.textContent.trim()) }));
      // Sélecteur de langue : bascule FR ↔ HT sur la même page.
      await pp.click(`.lang a[hreflang="${L === 'ht' ? 'fr' : 'ht'}"]`); await pp.waitForNetworkIdle();
      r.bascule = await pp.evaluate(() => `${document.documentElement.lang} ${location.pathname}${location.search}`);
      // Anciens liens de l'application : /#verifier=… renvoyé vers /app#verifier=… (code fictif inconnu : 404 attendu de l'API).
      await pp.close(); const fp = await newPage(pctx, { allow: /\/api\/verifier\/CODE-FICTIF/ });
      await fp.goto(`${BASE}/#verifier=CODE-FICTIF-1234`, { waitUntil: 'networkidle0' }); await fp.waitForSelector('#loginScreen, #vBack, .badbox', { timeout: 9000 }).catch(() => {});
      r.renvoiAncienLien = fp.url().replace(BASE, '');
      await pctx.close();

      // 2. Application : poids du premier chargement (page de connexion).
      const actx = await b.createBrowserContext(); const ap = await newPage(actx, { app: true });
      r.appPremierChargement = await weigh(ap, `${BASE}/app`);
      await ap.waitForSelector('#loginScreen:not([hidden]) #lgForm');
      // 3. Direction : proposition (événement avec photo compressée, ou lauréat mineur sans consentement).
      const k = di % 2 ? 'b' : 'a';
      await ap.select('#lgSchool', `ecole-${k}`);
      await ap.$eval('#lgId', (e, v) => { e.value = v; }, `direction@${k}.exemple.invalid`); await ap.$eval('#lgPw', (e, v) => { e.value = v; }, DEMO_PASSWORD);
      await ap.click('.login-main'); await ap.waitForSelector('#userChip', { timeout: 9000 }); await sleep(300);
      await ap.evaluate((l) => { const s = document.getElementById('langSel'); if (s && s.value !== l) { s.value = l; s.dispatchEvent(new Event('change', { bubbles: true })); } }, L); await sleep(300);
      await ap.evaluate(() => KL.go('portail')); await ap.waitForSelector('#ptForm', { timeout: 9000 });
      const title = `Journée portes ouvertes (${name}, fictive)`; const person = `Élève Fictif ${name.replace(/-/g, ' ')}`;
      if (di % 2 === 0) {
        await ap.type('#ptTitleFr', title); await ap.type('#ptTitleHt', `Jounen pòt louvri (${name}, fiktif)`);
        await ap.select('#ptCat', 'culture');
        const d = new Date(Date.now() + (7 + di) * 86400e3).toISOString().slice(0, 10);
        await ap.$eval('#ptDate', (e, v) => { e.value = v; }, d);
        await ap.type('#ptPlace', 'Cour de l’école (fictive)'); await ap.select('#ptDep', 'ouest');
        await ap.type('#ptBodyFr', 'Visite des classes et présentation des projets des élèves.\n\nÉvénement fictif <script>alert(1)</script>.');
        const input = await ap.$('#ptFile'); await input.uploadFile(PHOTO);
        await ap.waitForSelector('#ptPrev img', { timeout: 15000 });
        r.compression = await ap.evaluate(() => document.querySelector('#ptPrev .small').textContent);
      } else {
        await ap.select('#ptKind', 'laureat'); await ap.waitForSelector('#ptPerson');
        await ap.type('#ptPerson', person); await ap.type('#ptExam', 'Examens officiels 9e AF (fictif)'); await ap.type('#ptMention', 'Très bien');
        await ap.click('#ptMinorYes'); await ap.waitForSelector('#ptConsent:not([hidden])'); await ap.click('#ptCSchool');
      }
      await shot(ap, 'direction-proposer');
      await ap.$eval('#ptForm', (f) => f.requestSubmit());
      await ap.waitForSelector('.pt-list .pt-item', { timeout: 9000 });
      r.propositionEnAttente = await ap.evaluate(() => document.querySelector('.pt-list .pt-item').innerText.split('\n').slice(0, 2).join(' | '));
      await ap.evaluate(() => { document.getElementById('toasts').innerHTML = ''; }); await shot(ap, 'direction-propositions');
      // Rien de public avant validation.
      const before = await (await fetch(`${BASE}${di % 2 ? '/laureats' : '/evenements'}`)).text();
      r.publicAvantValidation = before.includes(di % 2 ? 'Fictif' + ' ' + name.replace(/-/g, ' ') : title) || before.includes(name);
      await actx.close();

      // 4. Super-admin : file de modération, publication.
      const sctx = await b.createBrowserContext(); const sp = await newPage(sctx, { app: true });
      await sp.goto(BASE + '/#admin', { waitUntil: 'networkidle0' }); await sp.reload({ waitUntil: 'networkidle0' });
      await sp.waitForSelector('#admEmail');
      if (L === 'ht') { await sp.evaluate(() => NORIA_ADM.lang('ht')); await sp.waitForSelector('#admEmail'); }
      await sp.type('#admEmail', ADMIN.email); await sp.type('#admPw', ADMIN.password);
      const prev = lastCode(); await sp.click('.login-main');
      await sp.waitForSelector('#admOtp'); for (let i = 0; i < 30 && lastCode() === prev; i++) await sleep(100);
      await sp.type('#admOtp', lastCode()); await sp.click('.login-main'); await sp.waitForSelector('#admDash');
      await sp.evaluate(() => NORIA_ADM.tab('portail')); await sp.waitForSelector('#paSt', { timeout: 9000 });
      await sp.waitForFunction(() => document.querySelectorAll('.pt-item').length > 0, { timeout: 9000 });
      await sleep(400); await sp.evaluate(() => { document.getElementById('toasts').innerHTML = ''; }); await shot(sp, 'admin-moderation');
      const itemId = await sp.evaluate((needle) => { const li = [...document.querySelectorAll('.pt-item')].find((x) => x.innerText.includes(needle)); const btn = li && li.querySelector('[data-a1="s:publier"]'); return btn ? Number(btn.getAttribute('data-a0').slice(2)) : null; }, di % 2 ? person : title);
      if (!itemId) throw new Error('proposition absente de la file de modération');
      await sp.evaluate((id) => NORIA_PORT_ADM.act(id, 'publier'), itemId);
      await sp.waitForFunction(() => /\S/.test(document.getElementById('toasts').innerText), { timeout: 9000 });
      // Annonces (écran) pour un appareil sur deux.
      if (di % 2 === 1) { await sp.evaluate(() => NORIA_PORT_ADM.tab('annonces')); await sp.waitForSelector('#paSp'); await sleep(300); await sp.evaluate(() => { document.getElementById('toasts').innerHTML = ''; }); await shot(sp, 'admin-annonces'); }
      await sctx.close();

      // 5. Portail après publication.
      const vctx = await b.createBrowserContext(); const vp = await newPage(vctx);
      if (di % 2 === 0) {
        await vp.goto(`${BASE}${pre}/evenements/${itemId}`, { waitUntil: 'networkidle0' });
        r.apresPublication = await vp.evaluate(() => { const i = document.querySelector('.hero-img'); return { titre: document.querySelector('h1').textContent, image: i ? `${i.naturalWidth}×${i.naturalHeight}` : null, script: document.querySelector('.prose').innerHTML.includes('<script') }; });
        const imgSrc = await vp.evaluate(() => document.querySelector('.hero-img').getAttribute('src'));
        const ir = await fetch(BASE + imgSrc); r.imageServie = { type: ir.headers.get('content-type'), ko: Math.round((await ir.arrayBuffer()).byteLength / 102.4) / 10 };
        await shot(vp, 'evenement');
      } else {
        await vp.goto(`${BASE}${pre}/laureats`, { waitUntil: 'networkidle0' });
        r.apresPublication = await vp.evaluate((p) => ({ nomComplet: document.body.innerText.includes(p), initiales: [...document.querySelectorAll('.la-n')].map((e) => e.textContent.trim()).filter((x) => /^É\. F\./.test(x)) }), person);
        await shot(vp, 'laureats-apres');
      }
      await vctx.close();

      r.erreurs = errs; r.violationsCSP = csp;
      if (errs.length || csp.length || r.publicAvantValidation || (di % 2 === 1 && r.apresPublication.nomComplet) || !/^\/app#verifier=/.test(r.renvoiAncienLien) || r.cookies) fail++;
    }
  } catch (e) { console.error(e); fail++; } finally { await b.close(); srv.kill(); }
  console.log(JSON.stringify(report, null, 1));
  console.log(fail ? `ÉCHEC (${fail})` : 'OK : 4 appareils, 0 erreur console, 0 violation CSP');
  process.exit(fail ? 1 : 0);
})();
