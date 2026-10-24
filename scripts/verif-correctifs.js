// Vérification visuelle des 3 correctifs (titulaire, titre de campagne, code-barres des badges) dans Chrome headless.
// Données fictives. Usage : NODE_PATH=/chemin/vers/node_modules node scripts/verif-correctifs.js <avant|apres> [port] [racine]
// « racine » permet de lancer le même scénario sur une autre copie du dépôt (ex. git worktree de la version précédente).
// Dépendances (hors dépôt) : puppeteer-core, Chrome (/usr/bin/google-chrome), pdftoppm. Sorties : /workspace/fix-<phase>-*.png
const puppeteer = require('puppeteer-core');
const fs = require('fs'); const path = require('path'); const { spawn, execFileSync } = require('child_process');
const PHASE = process.argv[2] || 'apres'; const PORT = Number(process.argv[3] || 3151);
const ROOT = path.resolve(process.argv[4] || path.join(__dirname, '..')); const S = path.join(ROOT, 'server');
const { openStore } = require(path.join(S, 'src/store'));
const { seed, seedMulti, DEMO_PASSWORD } = require(path.join(S, 'src/seed'));
const BASE = `http://127.0.0.1:${PORT}`; const DB = `/tmp/noria-fix-${PHASE}.sqlite`; const OUT = (n) => `/workspace/fix-${PHASE}-${n}.png`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) fs.rmSync(f, { force: true });
  const db = await openStore(DB); const ids = await seedMulti(db, await seed(db));
  const sa = (await db.get("SELECT id FROM school WHERE slug='ecole-a'")).id;
  const prof2 = (await db.get("SELECT id FROM app_user WHERE email='prof2@a.exemple.invalid'")).id;
  // prof2 devient titulaire de 7e A (« Toutes les matières ») : aucune matière précise.
  await db.insert('INSERT INTO teacher_assignment (school_id, teacher_user_id, class_id, subject_id) VALUES (?,?,?,NULL)', sa, prof2, ids.A.classes[0]);
  await db.close();
  let log = '';
  const srv = spawn(process.execPath, ['src/index.js'], { cwd: S, env: { ...process.env, NORIA_DEMO: '1', NORIA_DB: DB, PORT: String(PORT), HOST: '127.0.0.1', DATABASE_URL: '' } });
  srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 50 && !/http:\/\//.test(log); i++) await sleep(200);
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--headless=new'] });
  const res = {};
  const login = async (who) => {
    const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1280, height: 800 });
    await p.goto(`${BASE}/app`, { waitUntil: 'networkidle0' }); await p.waitForSelector('#lgForm');
    await p.select('#lgSchool', 'ecole-a');
    await p.$eval('#lgId', (e, v) => { e.value = v; }, `${who}@a.exemple.invalid`); await p.$eval('#lgPw', (e, v) => { e.value = v; }, DEMO_PASSWORD);
    await p.click('.login-main'); await p.waitForSelector('#userChip', { timeout: 9000 }); await sleep(600); return p;
  };
  const shot = async (p, n) => { await sleep(700); await p.screenshot({ path: OUT(n), fullPage: true }); };
  const pdfShot = async (p, url, n) => {
    const b64 = await p.evaluate(async (u) => { const r = await fetch(u, { credentials: 'same-origin', headers: { 'x-noria': '1' } }); const a = new Uint8Array(await r.arrayBuffer()); let s = ''; for (const c of a) s += String.fromCharCode(c); return btoa(s); }, url);
    const tmp = `/tmp/fix-${PHASE}-${n}.pdf`; fs.writeFileSync(tmp, Buffer.from(b64, 'base64'));
    execFileSync('pdftoppm', ['-png', '-r', n === 'badge-carte' ? '200' : '90', '-f', '1', '-l', '1', '-singlefile', tmp, OUT(n).replace(/\.png$/, '')]);
  };
  try {
    // 1. Titulaire : prof2 sur 7e A, formulaire « Nouvelle évaluation ».
    const t = await login('prof2');
    res.matieres = await t.evaluate(async () => (await (await fetch('/api/subjects', { credentials: 'same-origin' })).json()).map((s) => s.name));
    await t.evaluate(() => KL.go('academic')); await sleep(1500);
    await t.evaluate((c) => NORIA_SCO.setCls(c), ids.A.classes[0]); await sleep(1500);
    await t.evaluate(() => { const d = document.querySelector('details.sco-new'); if (d) d.open = true; });
    res.formulaire = await t.evaluate(() => !!document.querySelector('details.sco-new'));
    await shot(t, 'titulaire');
    // 2. Campagne : la direction tape le titre dans le champ, comme sur le terrain.
    const d = await login('direction');
    await d.evaluate(() => KL.go('ext-candidatures')); await d.waitForSelector('#l3Camp', { timeout: 9000 });
    await d.click('#l3Camp input[name="titre"]'); await d.keyboard.press('End'); await d.type('#l3Camp input[name="titre"]', 'Inscriptions 2027-2028');
    await d.evaluate(() => { for (const i of document.querySelectorAll('#l3Camp input[type="date"]')) if (!i.value) { const x = new Date(); if (/clos|ferm|fin|end/i.test(i.name)) x.setDate(x.getDate() + 60); i.value = x.toLocaleDateString('en-CA'); } });
    await d.evaluate(() => NORIA_L3.openCamp()); await sleep(1500);
    await shot(d, 'campagne-ecole');
    res.titre = await d.evaluate(async () => { const r = await (await fetch('/api/candidatures', { credentials: 'same-origin' })).json(); return (r.campagnes.find((c) => c.status === 'ouverte') || {}).title; });
    await d.evaluate(() => KL.go('dashboard')); await shot(d, 'campagne-annonces');
    const pub = await (await b.createBrowserContext()).newPage(); await pub.setViewport({ width: 1280, height: 800 });
    await pub.goto(`${BASE}/ecoles?categorie=inscriptions`, { waitUntil: 'networkidle0' }); await shot(pub, 'campagne-ecoles');
    await pub.goto(`${BASE}/inscription/ecole-a`, { waitUntil: 'networkidle0' }); await shot(pub, 'campagne-formulaire');
    const par = await login('parent1'); await par.evaluate(() => KL.go('dashboard')); await shot(par, 'campagne-parent');
    // 3. Badges : génération pour 7e A, carte seule et planche.
    const g = await d.evaluate(async (c) => (await fetch('/api/badges/generer', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-noria': '1' }, body: JSON.stringify({ class_id: c }) })).status, ids.A.classes[0]);
    const list = await d.evaluate(async () => (await (await fetch('/api/badges', { credentials: 'same-origin' })).json()));
    const first = (Array.isArray(list) ? list : list.badges || list.items || [])[0]; res.badges = { generer: g, id: first && first.id };
    if (first) await pdfShot(d, `/api/badges/${first.id}/pdf`, 'badge-carte');
    await pdfShot(d, `/api/badges/planche?class_id=${ids.A.classes[0]}&par=10`, 'badge-planche');
  } catch (e) { res.erreur = String(e.stack || e); }
  await b.close(); srv.kill(); console.log(JSON.stringify(res, null, 1));
})();
