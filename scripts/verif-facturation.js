// Bulletins MENFP et facturation dans Chrome headless (ordinateur, français) : onglet « Bulletins » de la structure,
// PDF de bulletin, onglet « Facturation » du super-admin, PDF de facture, bandeau et page « Abonnement » d'une école
// en lecture seule. Données fictives. 0 erreur console et 0 violation CSP attendues.
// Usage : NODE_PATH=/chemin/vers/node_modules node scripts/verif-facturation.js [port]
// Dépendances (hors dépôt) : puppeteer-core, Chrome (/usr/bin/google-chrome), pdftoppm (poppler-utils).
// Sorties : /workspace/bulletin-*.png, /workspace/facturation-*.png, résumé JSON sur la sortie standard.
const puppeteer = require('puppeteer-core');
const fs = require('fs'); const path = require('path'); const { spawn, execFileSync } = require('child_process');
const S = path.join(__dirname, '..', 'server');
const { openStore } = require(path.join(S, 'src/store'));
const { seed, seedMulti, DEMO_PASSWORD } = require(path.join(S, 'src/seed'));
const { createAdmin } = require(path.join(S, 'src/plateforme'));
const F = require(path.join(S, 'src/facturation'));
const PORT = Number(process.argv[2] || 3141); const BASE = `http://127.0.0.1:${PORT}`;
const DB = '/tmp/noria-fac.sqlite';
const ADMIN = { email: 'philippe@noria.exemple.invalid', password: 'admin-fictif-tres-long-2026' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) fs.rmSync(f, { force: true });
  const db = await openStore(DB); const ids = await seedMulti(db, await seed(db));
  await createAdmin(db, { email: ADMIN.email, name: 'Philippe (super-admin fictif)', password: ADMIN.password });
  const sa = (await db.get("SELECT id FROM school WHERE slug='ecole-a'")).id, sb = (await db.get("SELECT id FROM school WHERE slug='ecole-b'")).id;
  const p1 = await db.insert("INSERT INTO billing_plan (name, kind, currency, amount_cents) VALUES ('Standard par élève', 'par_eleve', 'HTG', 50000)");
  await db.insert("INSERT INTO billing_plan (name, kind, currency, amount_cents) VALUES ('Forfait petite école', 'forfait', 'USD', 30000)");
  await db.run("INSERT INTO school_billing (school_id, plan_id, grace_days, billing_email) VALUES (?,?,15,'compta@a.exemple.invalid')", sa, p1);
  await db.run('INSERT INTO school_billing (school_id, plan_id, trial_ends_on) VALUES (?,?,?)', sb, p1, F.addDays(F.today(), 21));
  const n = Number((await db.get("SELECT COUNT(DISTINCT student_id) AS n FROM enrollment WHERE school_id=? AND status='actif'", sa)).n);
  const y = F.today().slice(0, 4);
  await db.insert("INSERT INTO billing_invoice (number, school_id, plan_id, label, kind, currency, students, unit_cents, amount_cents, issued_on, due_on, status, paid_on) VALUES (?,?,?,?,?,?,?,?,?,?,?,'payee',?)",
    `NOR-${y}-0001`, sa, p1, 'Abonnement NORIA — Standard par élève — 2025-2026', 'par_eleve', 'HTG', n, 50000, n * 50000, F.addDays(F.today(), -120), F.addDays(F.today(), -90), F.addDays(F.today(), -95));
  const paidId = (await db.get('SELECT id FROM billing_invoice WHERE number = ?', `NOR-${y}-0001`)).id;
  const adm = (await db.get('SELECT id FROM platform_admin LIMIT 1')).id;
  await db.insert("INSERT INTO billing_payment (invoice_id, method, reference, amount_cents, paid_on, recorded_by) VALUES (?, 'moncash', 'MC-48213377', ?, ?, ?)", paidId, n * 50000, F.addDays(F.today(), -95), adm);
  await db.insert("INSERT INTO billing_invoice (number, school_id, plan_id, label, kind, currency, students, unit_cents, amount_cents, issued_on, due_on) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    `NOR-${y}-0002`, sa, p1, 'Abonnement NORIA — Standard par élève — 2026-2027', 'par_eleve', 'HTG', n, 50000, n * 50000, F.addDays(F.today(), -50), F.addDays(F.today(), -20));
  await db.close();
  let log = '';
  const srv = spawn(process.execPath, ['src/index.js'], { cwd: S, env: { ...process.env, NORIA_DEMO: '1', NORIA_DB: DB, PORT: String(PORT), HOST: '127.0.0.1', DATABASE_URL: '' } });
  srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 50 && !/http:\/\//.test(log); i++) await sleep(200);
  const lastCode = () => { const m = [...log.matchAll(/code (\d{6})/g)]; return m.length ? m[m.length - 1][1] : null; };
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--headless=new'] });
  const errs = [], csp = [], shots = [];
  const newPage = async (ctx) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { const x = m.text(); if (/Content Security Policy|Refused to/i.test(x)) csp.push(x); else if (m.type() === 'error' && !/\b(401|423)\b|Failed to load resource/.test(x)) errs.push(x); });
    p.on('response', (res) => { const u = res.url(); if (res.status() >= 400 && !/\/api\/(me|admin\/me)$/.test(u) && !(res.status() === 423 && /\/api\/announcements$/.test(u))) errs.push(`${res.status()} ${u}`); });
    await p.setViewport({ width: 1280, height: 800 });
    return p;
  };
  const shot = async (p, f) => { await sleep(400); await p.screenshot({ path: f, fullPage: true }); shots.push(f); };
  const pdfShot = async (p, url, f) => {
    const b64 = await p.evaluate(async (u) => { const r = await fetch(u, { credentials: 'same-origin', headers: { 'x-noria': '1' } }); const a = new Uint8Array(await r.arrayBuffer()); let s = ''; for (const c of a) s += String.fromCharCode(c); return btoa(s); }, url);
    const tmp = `/tmp/${path.basename(f, '.png')}.pdf`; fs.writeFileSync(tmp, Buffer.from(b64, 'base64'));
    execFileSync('pdftoppm', ['-png', '-r', '90', '-f', '1', '-l', '1', '-singlefile', tmp, f.replace(/\.png$/, '')]); shots.push(f);
  };
  try {
    // 1. Direction de l'école A (en lecture seule) : bandeau, Abonnement, Bulletins.
    const ctx = await b.createBrowserContext(); const p = await newPage(ctx);
    await p.goto(`${BASE}/app`, { waitUntil: 'networkidle0' });
    await p.waitForSelector('#loginScreen:not([hidden]) #lgForm');
    await p.select('#lgSchool', 'ecole-a');
    await p.$eval('#lgId', (e) => { e.value = 'direction@a.exemple.invalid'; }); await p.$eval('#lgPw', (e, v) => { e.value = v; }, DEMO_PASSWORD);
    await p.click('.login-main'); await p.waitForSelector('#userChip', { timeout: 9000 });
    await p.waitForSelector('#aboBanner:not([hidden])', { timeout: 9000 }).catch(() => errs.push('bandeau lecture seule absent'));
    await shot(p, '/workspace/facturation-ecole-bandeau-lecture-seule.png');
    await p.evaluate(() => KL.go('abonnement')); await p.waitForSelector('#ecoView .card', { timeout: 9000 });
    await shot(p, '/workspace/facturation-ecole-abonnement.png');
    const inv = await p.evaluate(async () => (await (await fetch('/api/abonnement', { credentials: 'same-origin' })).json()).invoices[0].id);
    await pdfShot(p, `/api/abonnement/factures/${inv}/pdf`, '/workspace/facturation-facture-pdf.png');
    const blocked = await p.evaluate(async () => (await fetch('/api/announcements', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-noria': '1' }, body: JSON.stringify({ title: 'x', body: 'x', audience: 'ecole' }) })).status);
    await p.evaluate(() => KL.go('classes')); await p.waitForSelector('.str-tabs', { timeout: 9000 });
    await p.evaluate(() => NORIA_STR.tab('bulletins')); await p.waitForSelector('form[data-action-submit="NORIA_BUL.pick"]', { timeout: 9000 });
    await shot(p, '/workspace/bulletin-regles-classe.png');
    await p.evaluate(() => { const f = document.querySelector('form[data-action-submit="NORIA_BUL.pick"]'); NORIA_BUL.pick(f); });
    await sleep(1200); await shot(p, '/workspace/bulletin-resultats-classe.png');
    const cl = await p.evaluate(() => { const f = document.querySelector('form[data-action-submit="NORIA_BUL.pick"]'); return { c: f.cls.value, t: f.term.value }; });
    await pdfShot(p, `/api/bulletins/classes/${cl.c}/pdf?term_id=${encodeURIComponent(cl.t)}`, '/workspace/bulletin-pdf-classe.png');
    // 2. Super-admin : onglet Facturation.
    const actx = await b.createBrowserContext(); const a = await newPage(actx);
    await a.goto(`${BASE}/#admin`, { waitUntil: 'networkidle0' }); await a.reload({ waitUntil: 'networkidle0' });
    await a.waitForSelector('#admEmail'); await a.type('#admEmail', ADMIN.email); await a.type('#admPw', ADMIN.password);
    const before = lastCode(); await a.click('.login-main');
    await a.waitForSelector('#admOtp'); for (let i = 0; i < 30 && lastCode() === before; i++) await sleep(100);
    await a.type('#admOtp', lastCode()); await a.click('.login-main'); await a.waitForSelector('#admDash');
    await a.evaluate(() => NORIA_ADM.tab('facturation')); await a.waitForSelector('.fac', { timeout: 9000 });
    await shot(a, '/workspace/facturation-admin.png');
    console.log(JSON.stringify({ shots, ecritureEnLectureSeule: blocked, erreurs: errs, csp }, null, 1));
    if (errs.length || csp.length || blocked !== 423) process.exitCode = 1;
  } finally { await b.close(); srv.kill(); }
})().catch((e) => { console.error(e); process.exit(1); });
