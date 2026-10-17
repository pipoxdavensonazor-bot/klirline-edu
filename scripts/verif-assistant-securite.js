// Bloc 3 dans Chrome headless (iPhone SE, Pixel 7, iPad Mini, ordinateur) : assistant sécurité du super-admin.
// Scénario simulé : attaque par force brute (connexions échouées sur quatre comptes depuis une même IP) et sauvegarde
// trop vieille (fichier daté de 30 h dans BACKUP_DIR). Puis, sur chaque appareil : connexion super-admin (mot de passe +
// code), analyse manuelle, liste des alertes (score), détail avec preuves et question guidée, action critique confirmée
// avec un nouveau code (verrouillage d'un compte), historique des actions. FR et kreyòl en alternance.
// 0 erreur console et 0 violation CSP attendues ; poids du premier chargement mesuré (page de connexion).
// Usage : NODE_PATH=/chemin/vers/node_modules node scripts/verif-assistant-securite.js [port]
//   Le script prépare une base SQLite fictive (/tmp/noria-b3.sqlite), lance le serveur (NORIA_DEMO=1) et l'arrête.
// Dépendances (hors dépôt) : puppeteer-core, Chrome (/usr/bin/google-chrome). Sorties : /workspace/bloc3-<sujet>-<appareil>.png
const puppeteer = require('puppeteer-core');
const fs = require('fs'); const path = require('path'); const os = require('os'); const { spawn } = require('child_process');
const S = path.join(__dirname, '..', 'server');
const { openStore } = require(path.join(S, 'src/store'));
const { seed, seedMulti } = require(path.join(S, 'src/seed'));
const { createAdmin } = require(path.join(S, 'src/plateforme'));
const PORT = Number(process.argv[2] || 3133); const BASE = `http://127.0.0.1:${PORT}`;
const DB = '/tmp/noria-b3.sqlite'; const BK = fs.mkdtempSync(path.join(os.tmpdir(), 'noria-b3-bk-'));
const ADMIN = { email: 'admin@noria.exemple.invalid', password: 'admin-fictif-tres-long-2026' };
const D = [['iphone-se', 375, 667, 2, true, 'fr', 'prof1'], ['pixel-7', 412, 915, 2.625, true, 'ht', 'prof2'], ['ipad-mini', 768, 1024, 2, true, 'fr', 'secretariat'], ['ordinateur', 1280, 800, 1, false, 'ht', 'compta']];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) fs.rmSync(f, { force: true });
  const db = await openStore(DB); await seedMulti(db, await seed(db));
  await createAdmin(db, { email: ADMIN.email, name: 'Philippe (super-admin fictif)', password: ADMIN.password });
  await db.close();
  const old = path.join(BK, 'noria-2026-10-15.sql.gz.age'); fs.writeFileSync(old, 'sauvegarde fictive');
  const t = (Date.now() - 30 * 3600e3) / 1000; fs.utimesSync(old, t, t);
  let log = '';
  const srv = spawn(process.execPath, ['src/index.js'], { cwd: S, env: { ...process.env, NORIA_DEMO: '1', NORIA_DB: DB, PORT: String(PORT), HOST: '127.0.0.1', BACKUP_DIR: BK, NORIA_ASSISTANT_INTERVALLE_MIN: '0', DATABASE_URL: '' } });
  srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 50 && !/http:\/\//.test(log); i++) await sleep(200);
  const lastCode = () => { const m = [...log.matchAll(/code (\d{6})/g)]; return m.length ? m[m.length - 1][1] : null; };
  // Attaque simulée : 9 échecs sur chacun des quatre comptes, depuis la même adresse.
  for (const [, , , , , , who] of D) for (let i = 0; i < 9; i++)
    await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school: 'ecole-a', identifier: `${who}@a.exemple.invalid`, password: `essai-${i}` }) });

  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--headless=new'] });
  const report = {}; let fail = 0;
  try {
    for (const [name, w, h, dpr, mob, lang, who] of D) {
      const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); const errs = [], csp = [];
      p.on('pageerror', (e) => errs.push(e.message));
      p.on('console', (m) => { const x = m.text(); if (/Content Security Policy|Refused to/i.test(x)) csp.push(x); else if (m.type() === 'error' && !/\b401\b/.test(x)) errs.push(x); });
      await p.exposeFunction('__cspViol', (v) => csp.push(v));
      await p.evaluateOnNewDocument(() => document.addEventListener('securitypolicyviolation', (e) => window.__cspViol(`${e.violatedDirective} ${e.blockedURI}`)));
      const cdp = await p.createCDPSession(); await cdp.send('Network.enable');
      let bytes = 0; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
      await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob });
      await p.goto(BASE + '/app', { waitUntil: 'networkidle0' });
      const first = Math.round(bytes / 102.4) / 10;
      const until = (fn, arg, ms = 10000) => p.waitForFunction(fn, { timeout: ms }, arg);
      const shot = (s) => p.screenshot({ path: `/workspace/bloc3-${s}-${name}.png`, fullPage: true });
      await p.goto(BASE + '/#admin', { waitUntil: 'networkidle0' }); await p.reload({ waitUntil: 'networkidle0' });
      await p.waitForSelector('#admEmail');
      if (lang === 'ht') { await p.evaluate(() => NORIA_ADM.lang('ht')); await p.waitForSelector('#admEmail'); }
      await p.type('#admEmail', ADMIN.email); await p.type('#admPw', ADMIN.password);
      const before = lastCode(); await p.click('.login-main');
      await p.waitForSelector('#admOtp'); for (let i = 0; i < 30 && lastCode() === before; i++) await sleep(100);
      await p.type('#admOtp', lastCode()); await p.click('.login-main');
      await p.waitForSelector('#admDash');
      await p.evaluate(() => NORIA_ADM.tab('assistant'));
      await p.waitForSelector('#secRun'); await p.click('#secRun');
      await until(() => document.querySelectorAll('.sec-alert').length >= 3 && /\d/.test(document.getElementById('secScore').textContent));
      await sleep(300); await shot('alertes');
      // Filtre « critique ».
      await p.select('#secSev', 'critique'); await until(() => [...document.querySelectorAll('.sec-alert .sec-sev')].every((e) => e.classList.contains('sec-critique')));
      const nCrit = await p.$$eval('.sec-alert', (x) => x.length);
      await p.select('#secSev', ''); await sleep(600);
      await until((n) => document.getElementById('secSev').value === '' && document.querySelectorAll('.sec-alert').length > n, nCrit).catch(async (e) => { console.error(await p.evaluate(() => document.getElementById('secApp').innerText.slice(0, 800))); throw e; });
      // Sauvegarde trop vieille : détail + question guidée.
      const backupId = await p.evaluate(() => { const a = [...document.querySelectorAll('.sec-alert')].find((x) => /sauvegarde|sovgad/i.test(x.innerText)); return a && Number(a.dataset.alerte); });
      if (!backupId) throw new Error('alerte de sauvegarde absente');
      await p.evaluate((id) => NORIA_SEC.open(id), backupId); await p.waitForSelector('#secDetail');
      await p.evaluate(() => NORIA_SEC.ask('quoi')); await until(() => document.getElementById('secAnswer').textContent.length > 20);
      await shot('sauvegarde');
      // Force brute sur le compte de cet appareil : détail, action critique, code, confirmation.
      await p.evaluate(() => NORIA_SEC.view('list')); await p.waitForSelector('.sec-alert');
      // Identifiants masqués à l'écran (pr***@a.***) : l'alerte du compte visé est retrouvée dans la base fictive.
      const rdb = await openStore(DB); const row = await rdb.get("SELECT id FROM security_alert WHERE fingerprint = ? AND status = 'ouverte'", `force_brute_compte:${who}@a.exemple.invalid`); await rdb.close();
      const id = row && Number(row.id);
      if (!id) throw new Error(`alerte de force brute (${who}) absente`);
      await p.evaluate((i) => NORIA_SEC.open(i), id); await p.waitForSelector('#secDetail .sec-crit-btn');
      await p.evaluate(() => NORIA_SEC.ask('pourquoi')); await until(() => document.getElementById('secAnswer').textContent.length > 20);
      await shot('force-brute');
      const c0 = lastCode();
      await p.evaluate(() => [...document.querySelectorAll('.sec-crit-btn')].find((x) => /Verrouiller|Fèmen/.test(x.textContent)).click());
      await p.waitForSelector('#secCode'); for (let i = 0; i < 100 && lastCode() === c0; i++) await sleep(100);
      await p.type('#secReason', 'essais suspects depuis une IP inconnue'); await p.type('#secCode', lastCode());
      await shot('confirmation');
      await p.click('#secOk'); await p.waitForSelector('#secDone').catch(async (e) => { console.error('TOAST', await p.evaluate(() => (document.getElementById('toasts') || {}).innerText)); throw e; });
      await shot('action-confirmee');
      await p.evaluate(() => NORIA_SEC.view('history')); await p.waitForSelector('#secHistory');
      await until(() => /Verrouiller|Fèmen/.test(document.getElementById('secHistory').innerText));
      await shot('historique');
      const r = { premierChargementKo: first, alertesCritiques: nCrit, erreurs: errs, csp };
      if (errs.length || csp.length) fail++;
      report[name] = r; await ctx.close();
    }
  } catch (e) { console.error(e); fail++; console.error(log.slice(-2000)); }
  finally { await b.close(); srv.kill('SIGTERM'); fs.rmSync(BK, { recursive: true, force: true }); }
  const db2 = await openStore(DB);
  report.actionsJournal = (await db2.all("SELECT type, target, otp FROM security_action ORDER BY id")).map((x) => `${x.type} ${x.target} otp=${x.otp}`);
  report.verrouilles = Number((await db2.get('SELECT COUNT(*) AS n FROM person WHERE locked_at IS NOT NULL')).n);
  await db2.close();
  console.log(JSON.stringify(report, null, 1));
  process.exit(fail ? 1 : 0);
})();
