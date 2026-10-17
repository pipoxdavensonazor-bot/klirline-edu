// Bloc 2 dans Chrome headless (iPhone SE, Pixel 7, iPad Mini, ordinateur) : badges (génération, liste), recherche
// instantanée, fiche élève avec photo (téléversée dans le navigateur), scanner (caméra absente en headless : image du QR
// injectée, décodée par le décodeur JS chargé à la demande ; puis saisie manuelle), vérification d'un badge VALIDE et
// RÉVOQUÉ par la direction, page publique d'un badge, bibliothèque (scan, prêts, prêt direct), relevé de notes (demande
// du parent, signature et sceau téléversés, approbation, portail et notification, page publique : fichier authentique
// puis modifié). FR et kreyòl en alternance selon l'appareil. 0 erreur console et 0 violation CSP attendues.
// Usage : NODE_PATH=/chemin/vers/node_modules node scripts/verif-badges-releves.js [port]
//   Le script prépare une base SQLite fictive (/tmp/noria-b2.sqlite), lance le serveur (NORIA_DEMO=1) et l'arrête.
// Dépendances (hors dépôt) : puppeteer-core, Chrome (/usr/bin/google-chrome).
// Sorties : /workspace/bloc2-<sujet>-<appareil>.png, /workspace/badge-exemple.pdf, /workspace/planche-badges.pdf,
//           /workspace/releve-exemple.pdf, /workspace/bloc2-qr-badge.png (image du QR injectée).
const puppeteer = require('puppeteer-core');
const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const S = path.join(__dirname, '..', 'server');
const { openStore } = require(path.join(S, 'src/store'));
const { seed, seedMulti, DEMO_PASSWORD } = require(path.join(S, 'src/seed'));
const K = require(path.join(S, 'src/cles'));
const { tokenFor } = require(path.join(S, 'src/badges'));
const qrcode = require(path.join(S, 'node_modules/qrcode-generator'));
const PORT = Number(process.argv[2] || 3122); const BASE = `http://127.0.0.1:${PORT}`;
const DB = '/tmp/noria-b2.sqlite';
const FX = (f) => fs.readFileSync(path.join(S, 'test/fixtures', f));
const D = [['iphone-se', 375, 667, 2, true, 'ht'], ['pixel-7', 412, 915, 2.625, true, 'fr'], ['ipad-mini', 768, 1024, 2, true, 'ht'], ['ordinateur', 1280, 800, 1, false, 'fr']];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function prep() {
  for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) fs.rmSync(f, { force: true });
  const db = await openStore(DB); const ids = await seedMulti(db, await seed(db)); const A = ids.A; const s = A.school;
  await db.run("UPDATE school SET name = 'Collège Saint-Pierre (fictif)', initials = 'CSP', motto = 'Lumière, travail, réussite', logo = ?, logo_updated_at = ? WHERE id = ?",
    FX('logo-fictif.jpg').toString('base64'), new Date().toISOString(), s);
  // Codes au format NORIA et classe 7e A complétée (10 élèves fictifs) pour une planche pleine.
  const recode = async (id, code) => { const old = (await db.get('SELECT code FROM student WHERE id = ?', id)).code;
    await db.run('INSERT INTO student_code (code, school_id) VALUES (?,?)', code, s); await db.run('UPDATE student SET code = ? WHERE id = ?', code, id); return old; };
  await recode(A.students[0], 'AF140101-CSP'); await recode(A.students[1], 'BF140101-CSP');
  const names = [['Jean', 'Pierre-Louis'], ['Marie', 'Joseph'], ['Wood', 'Dorvil'], ['Nadège', 'Célestin'], ['Ricardo', 'Saint-Fleur'], ['Fabienne', 'Augustin'], ['Kervens', 'Michel'], ['Sophonie', 'Jean-Baptiste'], ['Daphnée', 'Noël']];
  for (const [i, [fn, ln]] of names.entries()) {
    const code = `${fn[0]}${ln[0]}13${String(i + 1).padStart(2, '0')}0${(i % 9) + 1}-CSP`.toUpperCase();
    const id = await db.insert('INSERT INTO student (school_id, code, first_name, last_name, birth_date) VALUES (?,?,?,?,?)', s, code, fn, `${ln} (fictif)`, `2013-0${(i % 9) + 1}-1${i}`);
    await db.run('INSERT INTO student_code (code, school_id) VALUES (?,?)', code, s);
    await db.insert('INSERT INTO enrollment (school_id, student_id, class_id, reason) VALUES (?,?,?,?)', s, id, A.classes[0], 'démonstration');
    if (i % 3 !== 2) await db.run('INSERT INTO student_photo (school_id, student_id, photo, size, updated_by) VALUES (?,?,?,?,?)', s, id, FX('photo-fictive.jpg').toString('base64'), 2390, A.users.direction);
  }
  // Notes publiées fictives d'Ana (trimestres 1 et 2) et une note en brouillon (jamais reprise).
  const ev = (term, subj, title, max, coef, status) => db.insert(`INSERT INTO evaluation (school_id, class_id, subject_id, term_id, title, day, max_score, coefficient, status, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, s, A.classes[0], subj, term, title, '2026-10-05', max, coef, status, A.users.prof1);
  const gr = async (e, sc) => db.insert('INSERT INTO grade (school_id, evaluation_id, student_id, score, updated_by, recorded_at) VALUES (?,?,?,?,?,?)', s, e, A.students[0], sc, A.users.prof1, '2026-10-06');
  for (const [term, subj, title, max, sc, st] of [[0, 'maths', 'Contrôle 1', 20, 15, 'publiee'], [0, 'maths', 'Contrôle 2', 20, 17, 'publiee'], [0, 'francais', 'Dictée', 10, 7, 'publiee'],
    [0, 'francais', 'Rédaction', 20, 13.5, 'publiee'], [0, 'sciences', 'Exposé', 20, 16, 'publiee'], [0, 'sciences', 'Brouillon', 20, 2, 'brouillon'], [1, 'maths', 'Contrôle T2', 20, 12, 'publiee'], [1, 'francais', 'Dictée T2', 10, 8, 'publiee']])
    await gr(await ev(A.terms[term], A.subjects[subj], title, max, 1, st), sc);
  await db.close();
  return ids;
}

async function api(p, { method = 'GET', body, token } = {}) {
  const r = await fetch(BASE + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await r.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString()); } catch {}
  return { status: r.status, json, buf };
}
const tok = async (who) => (await api('/api/login', { method: 'POST', body: { school: 'ecole-a', identifier: `${who}@a.exemple.invalid`, password: DEMO_PASSWORD } })).json.token;
async function badgeToken(badgeId) {
  const db = await openStore(DB);
  try { const b = await db.get('SELECT school_id, token_nonce FROM badge WHERE id = ?', badgeId); const k = await K.schoolKeys(db, b.school_id); return tokenFor(k.badgeSecret, b.token_nonce); }
  finally { await db.close(); }
}
// Image PNG du QR (comme une photo du badge) : rendu dans Chrome à partir du GIF de qrcode-generator.
function qrGif(text, file) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  fs.writeFileSync(file, Buffer.from(q.createDataURL(8, 32).split(',')[1], 'base64'));
}

(async () => {
  const ids = await prep();
  const srv = spawn(process.execPath, [path.join(S, 'src/index.js')], { env: { ...process.env, NORIA_DB: DB, NORIA_DEMO: '1', PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 50 && !/NORIA \(/.test(log); i++) await sleep(100);
  const out = { appareils: {} }; let fail = 0;
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--headless=new'] });
  try {
    // Préparation par l'API : badges de l'année, un badge révoqué puis réédité (élève Bèl).
    const dirTok = await tok('direction');
    await api('/api/badges/generer', { method: 'POST', token: dirTok, body: {} });
    const list = (await api('/api/badges', { token: dirTok })).json;
    const ana = list.find((x) => x.code === 'AF140101-CSP'); const bel = list.find((x) => x.code === 'BF140101-CSP');
    await api(`/api/badges/${bel.id}/revoquer`, { method: 'POST', token: dirTok, body: { motif: 'Badge perdu (fictif)', reediter: true } });
    const anaTok = await badgeToken(ana.id); const belOld = await badgeToken(bel.id);
    const anaUrl = `${BASE}/#verifier=${anaTok}`;
    qrGif(anaUrl, '/tmp/qr-badge.gif');
    // Exemples PDF (photo fictive pour la moitié de la classe : les autres montrent les initiales).
    { const ph = fs.readFileSync(path.join(__dirname, '..', 'server', 'test', 'fixtures', 'photo-fictive.jpg')).toString('base64');
      for (const b of list.filter((x) => x.class_name === '7e A').slice(0, 6)) await api(`/api/students/${b.student_id}/photo`, { method: 'PUT', token: dirTok, body: { photo: ph } }); }
    fs.writeFileSync('/workspace/badge-exemple.pdf', (await api(`/api/badges/${ana.id}/pdf`, { token: dirTok })).buf);
    fs.writeFileSync('/workspace/planche-badges.pdf', (await api(`/api/badges/planche?class_id=${ids.A.classes[0]}&par=10`, { token: dirTok })).buf);
    fs.writeFileSync('/workspace/planche-badges-8.pdf', (await api(`/api/badges/planche?class_id=${ids.A.classes[0]}&par=8`, { token: dirTok })).buf);

    for (const [di, [name, w, h, dpr, mob, L]] of D.entries()) {
      const ctx = await b.createBrowserContext();
      const p = await ctx.newPage(); const errs = [], csp = [];
      p.on('dialog', (d) => { errs.push(`dialogue inattendu : ${d.message()}`); d.accept(); });
      p.on('pageerror', (e) => errs.push(e.message));
      p.on('console', (m) => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) csp.push(t); else if (m.type() === 'error' && !/\b(401)\b/.test(t)) errs.push(t); });
      p.on('response', (r) => { if (r.status() >= 400 && r.status() !== 401 && !/\/api\/me$/.test(r.url())) errs.push(`${r.status()} ${r.url()}`); });
      await p.exposeFunction('__cspViol', (v) => csp.push(v));
      await p.evaluateOnNewDocument(() => document.addEventListener('securitypolicyviolation', (e) => window.__cspViol(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile || ''}:${e.lineNumber}`)));
      const cdp = await p.createCDPSession(); await cdp.send('Network.enable');
      let bytes = 0, reqs = 0; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; reqs++; });
      await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob });
      await p.goto(BASE + '/app', { waitUntil: 'networkidle0' });
      await p.waitForSelector('#loginScreen:not([hidden]) #lgForm');
      const r = { langue: L, premierChargement: { octets: bytes, ko: Math.round(bytes / 102.4) / 10, requetes: reqs } };
      const until = (fn, arg, ms = 9000) => p.waitForFunction(fn, { timeout: ms }, arg).catch(async (e) => {
        console.error(name, 'attente échouée :', String(fn).slice(0, 160), '\n', await p.evaluate(() => (document.getElementById('toasts') || {}).innerText + ' | ' + document.body.innerText.slice(0, 900)));
        throw e;
      });
      const shot = async (sujet) => { await p.evaluate(() => { document.getElementById('toasts').innerHTML = ''; }); return p.screenshot({ path: `/workspace/bloc2-${sujet}-${name}.png`, fullPage: true }); };
      const setLang = async () => { await p.evaluate((l) => { const s = document.getElementById('langSel'); if (s && s.value !== l) { s.value = l; s.dispatchEvent(new Event('change', { bubbles: true })); } }, L); await sleep(300); };
      const login = async (id) => {
        await p.waitForSelector('#loginScreen:not([hidden]) #lgForm');
        await p.select('#lgSchool', 'ecole-a');
        await p.$eval('#lgId', (e, v) => { e.value = v; }, id); await p.$eval('#lgPw', (e, v) => { e.value = v; }, DEMO_PASSWORD);
        await p.click('.login-main');
        await p.waitForFunction(() => document.getElementById('userChip') || document.querySelector('.eco-pick'), { timeout: 9000 });
        if (await p.$('.eco-pick')) await p.evaluate(() => [...document.querySelectorAll('.eco-pick')].find((x) => /Saint-Pierre/.test(x.innerText)).click());
        await p.waitForSelector('#userChip', { timeout: 9000 }); await sleep(300); await setLang();
      };
      const logout = async () => { await p.$eval('#lgOut', (e) => e.click()); await p.waitForSelector('#loginScreen:not([hidden]) #lgForm', { timeout: 9000 }); };
      const go = async (m) => { await p.evaluate((m) => KL.go(m), m); await sleep(400); };
      const type = async (sel, v) => { await p.$eval(sel, (e) => { e.value = ''; }); await p.type(sel, v); };

      // 1. Direction : badges.
      await login('direction@a.exemple.invalid');
      await go('badges'); await until(() => document.querySelector('#bList .b2-tab'));
      await p.select('#bCls', String(ids.A.classes[0])); await until(() => document.querySelectorAll('#bList tbody tr').length === 10);
      if (di === 0) { await p.click('#bGen'); await until(() => document.getElementById('toasts').innerText.length > 5); }
      r.badges = await p.$$eval('#bList tbody tr', (rs) => rs.length);
      await shot('badges');
      // 2. Recherche instantanée, fiche, photo (téléversée et compressée dans le navigateur).
      await go('scan'); await until(() => document.getElementById('bSearch'));
      await p.type('#bSearch', 'ana'); await until(() => document.querySelector('#bResults .b2-hit'));
      await shot('recherche');
      await p.$eval('#bResults .b2-hit', (e) => e.click()); await until(() => document.getElementById('bFiche'));
      if (di === 0) {
        const inp = await p.$('#bPhoto'); await inp.uploadFile(path.join(S, 'test/fixtures/photo-fictive.jpg'));
        await until(() => document.querySelector('#bFiche img.b2-ph'));
      }
      await until(() => document.querySelector('#bFiche img.b2-ph') && document.querySelector('#bFiche img.b2-ph').naturalWidth > 0);
      r.photoPx = await p.$eval('#bFiche img.b2-ph', (i) => i.naturalWidth);
      await shot('fiche');
      // 3. Vérifier un badge : scanner (pas de caméra en headless) → image du QR injectée → VALIDE.
      await p.click('#bVerifyBtn'); await until(() => document.getElementById('bScan'));
      await until(() => /Caméra indisponible|Kamera a pa disponib|Placez|Mete QR/.test(document.getElementById('bScanMsg').innerText));
      await sleep(400); await shot('scanner');
      r.barcodeDetector = await p.evaluate(() => 'BarcodeDetector' in window);
      const fi = await p.$('#bScanFile'); await fi.uploadFile('/tmp/qr-badge.gif');
      await until(() => document.getElementById('bVerif'), null, 15000);
      r.decodeurJs = await p.evaluate(() => !!window.NORIA_QR);
      r.verifValide = await p.$eval('#bVerif .b2-chip', (e) => e.textContent);
      await until(() => document.querySelector('#bVerif img.b2-ph') && document.querySelector('#bVerif img.b2-ph').naturalWidth > 0);
      await shot('verif-valide');
      // Badge révoqué (perdu) : saisie manuelle du contenu du QR.
      await type('#bCode', `${BASE}/#verifier=${belOld}`);
      await p.evaluate(() => { window.NORIA_BAD._handle('verif', document.getElementById('bCode').value); });
      await until(() => document.querySelector('#bVerif.b2-r-revoque'));
      r.verifRevoque = await p.$eval('#bVerif .b2-chip', (e) => e.textContent);
      await shot('verif-revoque');
      // 4. Relevés (direction) : signature et sceau (une fois), puis demandes.
      await go('releves'); await until(() => document.getElementById('rSigForm'));
      if (di === 0) {
        await type('#rSigName', 'Mme Directrice Fictive');
        await (await p.$('#rSigFile')).uploadFile(path.join(S, 'test/fixtures/signature-fictive.jpg'));
        await (await p.$('#rSealFile')).uploadFile(path.join(S, 'test/fixtures/sceau-fictif.jpg'));
        await p.$eval('#rSigForm', (f) => f.requestSubmit());
        await until(() => document.getElementById('rSigImg'));
      }
      await logout();

      // 5. Parent : demande de relevé.
      await login('parent1@a.exemple.invalid');
      await go('releves'); await until(() => document.getElementById('rForm'));
      await p.select('#rStu', String(ids.A.students[0]));
      if (di % 2 === 1) { await p.select('#rKind', 'annee'); await p.evaluate(() => document.getElementById('rKind').dispatchEvent(new Event('change', { bubbles: true }))); }
      await type('#rWhy', di % 2 ? 'Dossier de bourse (fictif)' : 'Inscription au lycée (fictif)');
      await p.$eval('#rForm', (f) => f.requestSubmit());
      await until(() => document.querySelector('#rList .b2-demande'));
      await shot('releve-demande');
      await logout();

      // 6. Direction : approbation (PDF signé), liste.
      await login('direction@a.exemple.invalid');
      await go('releves'); await until(() => document.querySelector('#rList [data-action="NORIA_BAD.approve"]'));
      await shot('releve-direction');
      await p.click('#rList [data-action="NORIA_BAD.approve"]');
      await until(() => !document.querySelector('#rList [data-action="NORIA_BAD.approve"]') && document.querySelector('#rList .b2-emis'));
      await logout();

      // 7. Parent : relevé déposé dans le portail, notification.
      await login('parent1@a.exemple.invalid');
      await go('releves'); await until(() => document.querySelector('#rNotif .b2-unread') && document.querySelector('#rList [data-action="NORIA_BAD.relPdf"]'));
      await shot('releve-portail');
      await logout();

      // 8. Bibliothèque : scan du badge (image du QR), prêts, prêt direct.
      { const bt = await tok('biblio'); const open = (await api(`/api/loans?student_id=${ids.A.students[0]}`, { token: bt })).json; // limite de 3 prêts : on rend les plus anciens
        for (const l of open.slice(0, Math.max(0, open.length - 1))) await api(`/api/loans/${l.id}/retour`, { method: 'POST', token: bt, body: {} }); }
      await login('biblio@a.exemple.invalid');
      await go('scan'); await until(() => document.getElementById('bScanBtn'));
      r.biblioSansVerif = !(await p.$('#bVerifyBtn'));
      await p.click('#bScanBtn'); await until(() => document.getElementById('bScanFile'));
      await (await p.$('#bScanFile')).uploadFile('/tmp/qr-badge.gif');
      await until(() => document.querySelector('#bFiche #bBook option[value]:not([value=""])'), null, 15000);
      const before = await p.$$eval('#bFiche .b2-loans li', (l) => l.length);
      await p.select('#bBook', await p.$eval('#bBook option:not([value=""])', (o) => o.value));
      await p.$eval('#bLend', (f) => f.requestSubmit());
      await until((n) => document.querySelectorAll('#bFiche .b2-loans li').length === n + 1, before);
      r.pretsApres = before + 1;
      await shot('biblio');
      await logout();

      // 9. Pages publiques : badge (sans photo) et relevé (fichier authentique, puis modifié).
      const pub = await ctx.newPage();
      pub.on('pageerror', (e) => errs.push(e.message));
      pub.on('console', (m) => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) csp.push(t); else if (m.type() === 'error' && !/\b(401)\b/.test(t)) errs.push(t); });
      await pub.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob });
      await pub.goto(`${BASE}/#verifier=${anaTok}`, { waitUntil: 'networkidle0' });
      await pub.evaluate((l) => { const s = document.getElementById('langSel'); if (s) { s.value = l; s.dispatchEvent(new Event('change', { bubbles: true })); } }, L);
      await pub.waitForSelector('#verifRes');
      r.publicBadge = await pub.$eval('#verifRes', (e) => e.textContent);
      r.publicBadgeSansPhoto = !(await pub.$('#loginScreen img.b2-ph'));
      await pub.screenshot({ path: `/workspace/bloc2-public-badge-${name}.png`, fullPage: true });
      const pTok = await tok('parent1');
      const rel = (await api('/api/releves?statut=emis', { token: pTok })).json[0];
      const pdf = (await api(`/api/releves/${rel.id}/pdf`, { token: pTok })).buf;
      if (di === 0) fs.writeFileSync('/workspace/releve-exemple.pdf', pdf);
      fs.writeFileSync('/tmp/releve-ok.pdf', pdf);
      const bad = Buffer.from(pdf); bad[Math.floor(bad.length / 2)] ^= 1; fs.writeFileSync('/tmp/releve-modifie.pdf', bad);
      await pub.goto(`${BASE}/#verifier=${rel.code}`, { waitUntil: 'networkidle0' });
      await pub.reload({ waitUntil: 'networkidle0' });
      await pub.waitForSelector('#vFile');
      await (await pub.$('#vFile')).uploadFile('/tmp/releve-ok.pdf');
      await pub.waitForFunction(() => document.getElementById('vFileRes').textContent.length > 3);
      r.publicReleve = await pub.$eval('#verifRes', (e) => e.textContent); r.fichierIntact = await pub.$eval('#vFileRes', (e) => e.textContent);
      await pub.screenshot({ path: `/workspace/bloc2-public-releve-${name}.png`, fullPage: true });
      await (await pub.$('#vFile')).uploadFile('/tmp/releve-modifie.pdf');
      await pub.waitForFunction(() => document.getElementById('vFileRes').className === 'verif-bad');
      r.fichierModifie = await pub.$eval('#vFileRes', (e) => e.textContent);
      await pub.screenshot({ path: `/workspace/bloc2-public-releve-modifie-${name}.png`, fullPage: true });
      await pub.close();

      r.erreursConsole = errs; r.violationsCsp = csp;
      if (errs.length || csp.length) fail++;
      out.appareils[name] = r;
      await ctx.close();
    }
  } catch (e) { console.error(e); fail++; }
  finally { await b.close(); srv.kill('SIGTERM'); }
  console.log(JSON.stringify(out, null, 1));
  if (/erreur serveur|Error/.test(log)) { console.error('Journal serveur :\n', log); }
  process.exit(fail ? 1 : 0);
})();
