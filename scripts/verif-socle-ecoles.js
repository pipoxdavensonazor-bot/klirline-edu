// Socle multi-écoles dans Chrome headless (iPhone SE, Pixel 7, iPad Mini, ordinateur) : accueil de l'école, profil avec
// logo (réduit dans le navigateur), import Excel (aperçu avec lignes en erreur, puis import validé), choix d'école après
// connexion et sélecteur d'en-tête, sélecteur d'enfants d'un parent (deux écoles), page d'arrivée d'une invitation,
// tableau de bord de l'administration (2FA), en FR et en kreyòl. 0 erreur console et 0 violation CSP attendues.
// Usage : (cd server && NORIA_DEMO=1 NORIA_DB=/tmp/noria-b1.sqlite PORT=3111 node src/index.js > /tmp/noria-b1.log) ;
//         NORIA_ADMIN_PASSWORD=… npm run admin:creer -- --email admin@noria.exemple.invalid --nom "Admin" (même base) ;
//         NODE_PATH=… node scripts/verif-socle-ecoles.js http://127.0.0.1:3111 /tmp/noria-b1.log
// Dépendances (hors dépôt) : puppeteer-core ; pdftoppm (poppler-utils) ; un logo PNG (/tmp/logo-csp.png).
// Sorties : /workspace/bloc1-<sujet>-<appareil>.png, /workspace/modele-import-eleves.xlsx, /workspace/bulletin-entete.pdf
const puppeteer = require('puppeteer-core');
const fs = require('fs'); const { execFileSync } = require('child_process');
const X = require('../server/src/xlsx');
const BASE = process.argv[2] || 'http://127.0.0.1:3111';
const LOG = process.argv[3] || '/tmp/noria-b1.log';
const ADMIN = { email: 'admin@noria.exemple.invalid', password: process.env.NORIA_ADMIN_PASSWORD || 'admin-fictif-tres-long-2026' };
const PW = 'demo-fictif-2026';
const D = [['iphone-se', 375, 667, 2, true], ['pixel-7', 412, 915, 2.625, true], ['ipad-mini', 768, 1024, 2, true], ['ordinateur', 1280, 800, 1, false]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COLS = ['Nom / Non *', 'Prénom / Prenon *', 'Date de naissance (AAAA-MM-JJ) / Dat nesans *', 'Sexe (F ou M) / Sèks *', 'Classe / Klas *', 'Parent (nom complet) / Paran', 'Téléphone du parent / Telefòn paran', 'E-mail du parent / Imèl paran'];
const xlsx = (file, rows) => fs.writeFileSync(file, X.writeXlsx({ columns: COLS.map((t, i) => ({ title: t, required: i < 5 })), rows }));

async function api(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await r.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString()); } catch {}
  return { status: r.status, json, buf };
}
const tok = async (school, who) => (await api('/api/login', { method: 'POST', body: { school, identifier: `${who}@${school.slice(-1)}.exemple.invalid`, password: PW } })).json.token;

(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--headless=new'] });
  const out = {}; let fail = 0;
  for (const [di, [name, w, h, dpr, mob]] of D.entries()) {
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage(); const errs = [], csp = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) csp.push(t); else if (m.type() === 'error' && !/\b(401|400)\b/.test(t)) errs.push(t); });
    await p.exposeFunction('__cspViol', (v) => csp.push(v));
    await p.evaluateOnNewDocument(() => document.addEventListener('securitypolicyviolation', (e) => window.__cspViol(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile || ''}:${e.lineNumber}`)));
    const cdp = await p.createCDPSession(); await cdp.send('Network.enable');
    let bytes = 0, reqs = 0; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; reqs++; });
    await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob });
    await p.goto(BASE + '/app', { waitUntil: 'networkidle0' });
    await p.waitForSelector('#loginScreen:not([hidden]) #lgForm');
    const r = { premierChargement: { octets: bytes, ko: Math.round(bytes / 102.4) / 10, requetes: reqs } };
    const until = (fn, arg, ms = 9000) => p.waitForFunction(fn, { timeout: ms }, arg).catch(async (e) => {
      console.error(name, 'attente échouée :', String(fn).slice(0, 140), '\n', await p.evaluate(() => (document.getElementById('toasts') || {}).innerText + ' | ' + document.body.innerText.slice(0, 700)));
      throw e;
    });
    const shot = (sujet) => p.screenshot({ path: `/workspace/bloc1-${sujet}-${name}.png`, fullPage: true });
    const login = async (school, id) => {
      await p.waitForSelector('#loginScreen:not([hidden]) #lgForm');
      await p.select('#lgSchool', school);
      await p.$eval('#lgId', (e, v) => { e.value = v; }, id);
      await p.$eval('#lgPw', (e, v) => { e.value = v; }, PW);
      await p.click('.login-main');
    };
    const ready = async () => { await p.waitForSelector('#userChip', { timeout: 9000 }); await sleep(400); };
    const logout = async () => { await p.click('#lgOut'); await p.waitForSelector('#loginScreen:not([hidden]) #lgForm', { timeout: 9000 }); };
    const go = async (m) => { await p.evaluate((m) => KL.go(m), m); await sleep(500); };
    const tag = name.replace(/[^a-z]/g, '').slice(0, 6);

    // 1. Direction : accueil de l'école (avant profil), profil + logo, en-tête des documents.
    await login('ecole-a', 'direction@a.exemple.invalid'); await ready();
    await until(() => document.querySelector('.eco-banner .eco-name'));
    if (di === 0) {
      await go('ecole'); await until(() => document.getElementById('ecoForm'));
      await p.evaluate(() => { const f = document.getElementById('ecoForm'); f.name.value = 'Collège Saint-Pierre'; f.initials.value = ''; f.address.value = '12, rue Fictive, Jacmel (adresse fictive)';
        f.email.value = 'contact@csp.exemple.invalid'; f.phone.value = '3700 0000'; f.motto.value = 'Lumière, travail, réussite'; });
      const inp = await p.$('#ecoLogo'); await inp.uploadFile('/tmp/logo-csp.png');
      await until(() => document.querySelector('.eco-head-prev img.eco-logo'));
      await p.$eval('#ecoForm', (f) => f.requestSubmit());
      await until(() => /Profil enregistré/.test(document.getElementById('toasts').innerText));
    } else { await go('ecole'); await until(() => document.querySelector('.eco-head-prev img.eco-logo')); }
    r.logoTaille = await p.$eval('.eco-head-prev img.eco-logo', (i) => [i.naturalWidth, i.naturalHeight]);
    await shot('profil-ecole');
    await go('dashboard'); await until(() => document.querySelector('.eco-banner img.eco-logo') && /Collège Saint-Pierre/.test(document.querySelector('.eco-banner').innerText));
    await shot('accueil-ecole');

    // 2. Import : aperçu avec erreurs, puis import validé.
    await go('importEleves'); await until(() => document.getElementById('impForm'));
    if (name === 'ordinateur') {
      const m = await p.evaluate(async () => { const res = await fetch('/api/import/eleves/modele', { credentials: 'same-origin' }); return [...new Uint8Array(await res.arrayBuffer())]; });
      fs.writeFileSync('/workspace/modele-import-eleves.xlsx', Buffer.from(m));
    }
    const dd = String(10 + di).padStart(2, '0');
    xlsx(`/tmp/imp-err-${name}.xlsx`, [[`Fils-Aimé${tag}`, 'Ana', `2012-03-${dd}`, 'F', '7e A', 'Marie Fils-Aimé', '+509 3711 11' + dd, ''],
      ['=HYPERLINK("http://x")', 'Jo', `05/03/2012`, 'M', '7e A', '', '', ''], [`Pierre${tag}`, 'Jean', '2012-02-30', 'X', '9e Z', '', 'abc', 'pas-un-mail'],
      [`Fils-Aimé${tag}`, 'Ana', `${dd}/03/2012`, 'F', '7e B', '', '', '']]);
    await (await p.$('#impFile')).uploadFile(`/tmp/imp-err-${name}.xlsx`);
    await p.$eval('#impForm', (f) => f.requestSubmit());
    await until(() => document.querySelectorAll('.imp-tab tr.imp-bad').length === 3);
    r.apercuErreurs = await p.$$eval('.imp-tab tr.imp-bad', (rs) => rs.length);
    await shot('import-apercu');
    xlsx(`/tmp/imp-ok-${name}.xlsx`, [[`Fils-Aimé${tag}`, 'Ana', `2012-03-${dd}`, 'F', '7e A', 'Marie Fils-Aimé', '+509 3711 11' + dd, ''],
      [`Fils-Aimé${tag}`, 'Rose', `2013-04-${dd}`, 'F', '7e B', 'Marie Fils-Aimé', '+509 3711 11' + dd, ''],
      [`Joseph${tag}`, 'Paul', `2011-01-${dd}`, 'M', '7e A', 'Parent fictif 1 A', '+50900000107', '']]);
    await (await p.$('#impFile')).uploadFile(`/tmp/imp-ok-${name}.xlsx`);
    await p.$eval('#impForm', (f) => f.requestSubmit());
    await until(() => document.getElementById('impGo'));
    await p.click('#impGo');
    await until(() => document.getElementById('impDone'));
    r.codes = await p.$$eval('.imp-codes code', (c) => c.map((x) => x.textContent));
    await shot('import-resultat');
    await go('students'); await until((c) => document.getElementById('view').innerText.includes(c), r.codes[0]);
    await shot('fiche-code');
    await logout();

    // 3. Enseignant de deux écoles : connexion sans école → choix → sélecteur d'en-tête.
    await login('', 'prof1@a.exemple.invalid');
    await until(() => document.querySelectorAll('.eco-pick').length === 2);
    await shot('choix-ecole');
    await p.evaluate(() => [...document.querySelectorAll('.eco-pick')].find((b) => /fictive B/.test(b.innerText)).click());
    await ready(); await until(() => document.getElementById('ecoSel') && /fictive B/.test(document.querySelector('.eco-banner').innerText));
    await shot('entete-ecole-b');
    await p.select('#ecoSel', await p.$eval('#ecoSel', (s) => [...s.options].find((o) => /Saint-Pierre/.test(o.text)).value));
    await until(() => /Saint-Pierre/.test((document.querySelector('.eco-banner') || {}).innerText || ''));
    r.changementEcole = true;
    await logout();

    // 4. Parent : enfants dans deux écoles, sélecteur, bascule.
    await login('', 'parent1@a.exemple.invalid');
    await until(() => document.querySelectorAll('.eco-pick').length === 2);
    await p.evaluate(() => [...document.querySelectorAll('.eco-pick')].find((b) => /Saint-Pierre/.test(b.innerText)).click());
    await ready(); await until(() => document.querySelectorAll('.eco-kid').length >= 3);
    r.enfants = await p.$$eval('.eco-kid .eco-kn b', (x) => x.map((e) => e.textContent));
    await shot('parent-enfants');
    await p.evaluate(() => [...document.querySelectorAll('.eco-kid')].find((b) => /EFB/.test(b.innerText)).click());
    await until(() => /fictive B/.test((document.querySelector('.eco-banner') || {}).innerText || '') && document.querySelector('.eco-kid.on'));
    await shot('parent-enfant-ecole-b');
    // Kreyòl.
    await p.select('#langSel', 'ht'); await sleep(400);
    await until(() => /Pitit mwen yo|Chwazi yon pitit/.test(document.getElementById('view').innerText));
    await shot('kreyol-parent');
    await p.select('#langSel', 'fr'); await sleep(200);
    await logout();

    // 5. Page d'arrivée d'une invitation (logo et nom de l'école qui invite).
    const dir = await tok('ecole-a', 'direction');
    const inv = await api('/api/invitations', { method: 'POST', token: dir, body: { email: `invite-${name}-${Date.now()}@exemple.invalid`, display_name: `Prof invité ${name}`, role: 'enseignant' } });
    await p.goto('about:blank'); await p.goto(BASE + inv.json.link, { waitUntil: 'networkidle0' });
    await until(() => document.querySelector('.eco-inv img.eco-logo') && /Saint-Pierre/.test(document.querySelector('.eco-inv').innerText));
    await shot('invitation');

    // 6. Administration de la plateforme (2FA).
    await p.goto('about:blank'); await p.goto(BASE + '/#admin', { waitUntil: 'networkidle0' });
    await until(() => document.getElementById('admLogin'));
    await p.$eval('#admEmail', (e, v) => { e.value = v; }, ADMIN.email); await p.$eval('#admPw', (e, v) => { e.value = v; }, ADMIN.password);
    await p.$eval('#admLogin', (f) => f.requestSubmit());
    await until(() => document.getElementById('admCode'));
    await sleep(300);
    const code = [...fs.readFileSync(LOG, 'utf8').matchAll(/administration : code (\d{6})/g)].pop()[1];
    await p.$eval('#admOtp', (e, v) => { e.value = v; }, code); await p.$eval('#admCode', (f) => f.requestSubmit());
    await until(() => document.querySelector('.adm-school'));
    await shot('admin-ecoles');
    await p.evaluate(() => NORIA_ADM.tab('etat')); await until(() => document.getElementById('admEtat'));
    await shot('admin-etat');
    await p.evaluate(() => NORIA_ADM.tab('echecs')); await until(() => /Tentatives refusées/.test(document.getElementById('admPanel').innerText));
    await p.evaluate(() => NORIA_ADM.tab('assistant')); await until(() => document.getElementById('admAssistant'));
    await p.evaluate(() => NORIA_ADM.lang('ht')); await until(() => /Asistan sekirite/.test(document.body.innerText));
    await shot('admin-kreyol');
    r.admin = true;

    r.erreursConsole = errs; r.violationsCSP = csp;
    if (errs.length || csp.length) fail++;
    out[name] = r;
    await ctx.close();
  }
  await b.close();

  // Bulletin d'exemple : note publiée puis bulletin émis par le secrétariat, PDF avec l'en-tête de l'école.
  const prof = await tok('ecole-a', 'prof1'), dir = await tok('ecole-a', 'direction'), sec = await tok('ecole-a', 'secretariat');
  out.bulletin = await bulletin(prof, dir, sec);
  console.log(JSON.stringify(out, null, 1));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

async function bulletin(prof, dir, sec) {
  const me = (await api('/api/me', { token: prof })).json;
  const subj = (await api('/api/subjects', { token: prof })).json || [];
  const terms = (await api('/api/terms', { token: prof })).json || [];
  const cls = (await api('/api/classes', { token: prof })).json[0];
  const stu = (await api(`/api/classes/${cls.id}/students`, { token: prof })).json.find((s) => s.code === 'A-001');
  const maths = subj.find((s) => /Math/.test(s.name)), T1 = terms[0];
  const e = await api('/api/evaluations', { method: 'POST', token: prof, body: { class_id: cls.id, subject_id: maths.id, term_id: T1.id, title: 'Interrogation (fictive)', day: '2026-10-05', max_score: 20 } });
  await api('/api/grades/sync', { method: 'POST', token: prof, body: { ops: [{ op_id: `op-b1-${Date.now()}`, base_version: 0, evaluation_id: e.json.id, student_id: stu.id, score: 15 }] } });
  await api(`/api/evaluations/${e.json.id}/soumettre`, { method: 'POST', token: prof });
  await api(`/api/evaluations/${e.json.id}/publier`, { method: 'POST', token: dir });
  const rc = await api('/api/report-cards', { method: 'POST', token: sec, body: { student_id: stu.id, term_id: T1.id } });
  const pdf = await api(`/api/report-cards/${rc.json.id}/pdf`, { token: sec });
  fs.writeFileSync('/workspace/bulletin-entete.pdf', pdf.buf);
  execFileSync('pdftoppm', ['-png', '-r', '90', '-singlefile', '/workspace/bulletin-entete.pdf', '/workspace/bloc1-bulletin-entete-ordinateur']);
  return { statut: pdf.status, octets: pdf.buf.length, ecole: me.school.name };
}
