// Bloc 6 (prototype) dans Chrome headless (Pixel 7 en kreyòl, ordinateur en français) : portail du ministère
// (connexion par code, vue d'ensemble, fiche école, déclaration reçue), déclaration côté direction (aperçu puis envoi
// signé), PDF de la déclaration, poids du premier chargement de /app et de /ministere. 0 erreur console et 0 violation
// CSP attendues.
// Usage : NODE_PATH=/chemin/vers/node_modules node scripts/verif-ministere.js [port]
//   Base SQLite fictive (/tmp/noria-b6.sqlite), serveur lancé avec NORIA_DEMO=1 NORIA_MINISTERE=1 puis arrêté.
// Dépendances (hors dépôt) : puppeteer-core, Chrome (/usr/bin/google-chrome), pdftoppm (poppler-utils).
// Sorties : /workspace/bloc6-<page>-<appareil>.png, /workspace/declaration-exemple.pdf, résumé JSON sur la sortie standard.
const puppeteer = require('puppeteer-core');
const fs = require('fs'); const path = require('path'); const os = require('os'); const { spawn, execFileSync } = require('child_process');
const S = path.join(__dirname, '..', 'server');
const { openStore } = require(path.join(S, 'src/store'));
const { seed, seedMulti, seedPortal, seedMinistere, DEMO_PASSWORD } = require(path.join(S, 'src/seed'));
const PORT = Number(process.argv[2] || 3136); const BASE = `http://127.0.0.1:${PORT}`;
const DB = '/tmp/noria-b6.sqlite';
// [appareil, largeur, hauteur, densité, mobile, langue, école de la direction, compte du ministère]
const D = [['pixel-7', 412, 915, 2.625, true, 'ht', 'a', 'inspection@ministere.exemple.invalid'],
  ['ordinateur', 1280, 800, 1, false, 'fr', 'b', 'direction-etudes@ministere.exemple.invalid']];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) fs.rmSync(f, { force: true });
  const db = await openStore(DB); const ids = await seedMulti(db, await seed(db)); await seedPortal(db, ids); await seedMinistere(db, ids);
  // Second compte fictif (une demande de code par compte et par minute).
  await db.insert("INSERT INTO ministry_account (email, phone, display_name, title, created_by_admin) VALUES (?,?,?,?,0)",
    'direction-etudes@ministere.exemple.invalid', '+50900000901', 'Direction des études fictive', 'Direction de l’enseignement fondamental');
  const sig = fs.readFileSync(path.join(S, 'test/fixtures/signature-fictive.jpg')).toString('base64');
  await db.run('UPDATE school SET signature = ?, signature_name = ? WHERE id IN (?, ?)', sig, 'Direction fictive', ids.A.school, ids.B.school);
  await db.close();
  let log = '';
  const srv = spawn(process.execPath, ['src/index.js'], { cwd: S, env: { ...process.env, NORIA_DEMO: '1', NORIA_MINISTERE: '1', NORIA_TRANSFERT_MINISTERE: '1', NORIA_DB: DB, PORT: String(PORT), HOST: '127.0.0.1', NORIA_ASSISTANT_INTERVALLE_MIN: '0', DATABASE_URL: '' } });
  srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 50 && !/http:\/\//.test(log); i++) await sleep(200);
  const lastCode = () => { const m = [...log.matchAll(/(?:code|kòd) (\d{6})/g)]; return m.length ? m[m.length - 1][1] : null; };

  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--headless=new'] });
  const report = {}; let fail = 0; const shots = [];
  try {
    for (const [name, w, h, dpr, mob, L, k, account] of D) {
      const r = report[name] = { langue: L };
      const errs = [], csp = [];
      const newPage = async (ctx) => {
        const p = await ctx.newPage();
        p.on('pageerror', (e) => errs.push(e.message));
        p.on('console', (m) => { const x = m.text(); if (/Content Security Policy|Refused to/i.test(x)) csp.push(x); else if (m.type() === 'error' && !/\b401\b/.test(x)) errs.push(x); });
        p.on('response', (res) => { const u = res.url(); if (res.status() >= 400 && !/\/api\/(me|admin\/me|ministere\/me)$/.test(u)) errs.push(`${res.status()} ${u}`); });
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
      const shot = async (p, page) => { await p.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('#toasts > *, .toast').forEach((e) => e.remove()); }); await sleep(250); const f = `/workspace/bloc6-${page}-${name}.png`; await p.screenshot({ path: f, fullPage: true }); shots.push(f); };

      // 1. Direction : poids de /app, connexion, module « Déclaration au ministère », aperçu puis envoi signé.
      const actx = await b.createBrowserContext(); const ap = await newPage(actx);
      r.appPremierChargement = await weigh(ap, `${BASE}/app`);
      await ap.waitForSelector('#loginScreen:not([hidden]) #lgForm');
      await ap.select('#lgSchool', `ecole-${k}`);
      await ap.$eval('#lgId', (e, v) => { e.value = v; }, `direction@${k}.exemple.invalid`); await ap.$eval('#lgPw', (e, v) => { e.value = v; }, DEMO_PASSWORD);
      await ap.click('.login-main'); await ap.waitForSelector('#userChip', { timeout: 9000 }); await sleep(300);
      await ap.evaluate((l) => { const s = document.getElementById('langSel'); if (s && s.value !== l) { s.value = l; s.dispatchEvent(new Event('change', { bubbles: true })); } }, L); await sleep(300);
      r.moduleVisible = await ap.evaluate(() => document.documentElement.dataset.ministere === '1');
      await ap.evaluate(() => KL.go('declaration')); await ap.waitForSelector('#declOk', { timeout: 9000 }); await sleep(300);
      await shot(ap, 'declaration-direction-apercu');
      await ap.click('#declOk'); await ap.click('form[data-action-submit="NORIA_DECL.send"] button[type="submit"]');
      await ap.waitForFunction(() => !document.getElementById('declOk'), { timeout: 9000 }); await sleep(400);
      r.declarationEnvoyee = await ap.evaluate(() => document.querySelector('.badge') && document.querySelector('.badge').textContent);
      await shot(ap, 'declaration-direction');
      await actx.close();

      // 2. Ministère : poids de /ministere, connexion par code (code lu dans le journal du serveur, adaptateur console).
      const mctx = await b.createBrowserContext(); const mp = await newPage(mctx);
      await mp.evaluateOnNewDocument((l) => { try { localStorage.setItem('noria_min_lang', l); } catch (e) {} }, L);
      r.ministerePremierChargement = await weigh(mp, `${BASE}/ministere`);
      await mp.waitForSelector('#mIdent'); await shot(mp, 'connexion-ministere');
      await mp.type('#mIdent', account); const before = lastCode();
      await mp.click('form[data-action-submit="NORIA_MIN.askCode"] button[type="submit"]'); await mp.waitForSelector('#mCode');
      for (let i = 0; i < 30 && lastCode() === before; i++) await sleep(100);
      await mp.type('#mCode', lastCode()); await mp.click('form[data-action-submit="NORIA_MIN.verify"] button[type="submit"]');
      await mp.waitForSelector('.m-nav', { timeout: 9000 }); await mp.waitForFunction(() => !document.querySelector('.m-wait'), { timeout: 9000 }); await sleep(300);
      r.vueEnsemble = await mp.evaluate(() => ({ lang: document.documentElement.lang, lignes: document.querySelectorAll('#minMain tbody tr, #minMain .m-school').length }));
      await shot(mp, 'vue-ensemble');
      const sid = k === 'a' ? ids.A.school : ids.B.school;
      await mp.evaluate((id) => { location.hash = `ecole=${id}`; }, ids.A.school);
      await mp.waitForFunction(() => !document.querySelector('.m-wait') && document.querySelector('#minMain h2'), { timeout: 9000 }); await sleep(300);
      await shot(mp, 'fiche-ecole');
      const list = await mp.evaluate(async () => (await (await fetch('/api/ministere/declarations', { headers: { 'x-noria': '1' } })).json()).declarations);
      const dec = list.find((x) => Number(x.school_id) === Number(sid) || x.ecole_id === sid) || list[0];
      await mp.evaluate((id) => { location.hash = `declaration=${id}`; }, dec.id);
      await mp.waitForFunction(() => !document.querySelector('.m-wait') && document.querySelector('#minMain h2'), { timeout: 9000 }); await sleep(300);
      r.declarationRecue = await mp.evaluate(() => document.querySelector('#minMain').textContent.includes('Ed25519'));
      await shot(mp, 'declaration-ministere');
      // PDF de la déclaration (téléchargé par la session du ministère), rendu en image à la largeur de l'appareil.
      const pdf64 = await mp.evaluate(async (id) => { const r = await fetch(`/api/ministere/declarations/${id}/pdf`); const b = new Uint8Array(await r.arrayBuffer()); let s = ''; for (const c of b) s += String.fromCharCode(c); return btoa(s); }, dec.id);
      const pdfFile = path.join(os.tmpdir(), `noria-b6-${name}.pdf`); fs.writeFileSync(pdfFile, Buffer.from(pdf64, 'base64'));
      if (name === 'ordinateur') { fs.copyFileSync(pdfFile, '/workspace/declaration-exemple.pdf'); r.pdf = '/workspace/declaration-exemple.pdf'; }
      execFileSync('pdftoppm', ['-png', '-r', '110', '-f', '1', '-l', '1', pdfFile, pdfFile.replace(/\.pdf$/, '')]);
      const png = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith(`noria-b6-${name}-`) && f.endsWith('.png')).map((f) => path.join(os.tmpdir(), f))[0];
      const vp = await mctx.newPage(); await vp.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob });
      await vp.setContent(`<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0;background:#525659;padding:12px"><img style="width:100%;max-width:820px;display:block;margin:auto;box-shadow:0 2px 8px #0006" src="data:image/png;base64,${fs.readFileSync(png).toString('base64')}"></body>`);
      await sleep(200); const f = `/workspace/bloc6-declaration-pdf-${name}.png`; await vp.screenshot({ path: f, fullPage: true }); shots.push(f); fs.rmSync(png);
      await mctx.close();
      r.erreursConsole = errs; r.violationsCSP = csp;
      if (errs.length || csp.length) fail++;
    }
  } catch (e) { report.erreur = e.stack; fail++; } finally { await b.close(); srv.kill(); }
  report.captures = shots;
  console.log(JSON.stringify(report, null, 1));
  process.exit(fail ? 1 : 0);
})();
