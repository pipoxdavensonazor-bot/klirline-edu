// Bloc 4 dans Chrome headless (iPhone SE, Pixel 7, iPad Mini, ordinateur) : parcours complet entre deux écoles fictives,
// dans les deux sens (A → B puis B → A, en alternance selon l'appareil). École d'origine : signalement (avec texte court)
// et décision de fin d'année ; école d'accueil : vérification (refus sans date de naissance, résultat minimal), demande
// avec consentement du parent (case et nom, ou code envoyé au parent rattaché, lu dans la boîte d'envoi simulée) ;
// origine : demande reçue, approbation signée ; accueil : dossier reçu (notes publiées, relevé avec signature
// d'origine), certificat PDF ; page publique du certificat (fichier authentique puis modifié). FR et kreyòl en alternance.
// 0 erreur console et 0 violation CSP attendues.
// Usage : NODE_PATH=/chemin/vers/node_modules node scripts/verif-transferts.js [port]
//   Base SQLite fictive (/tmp/noria-b4.sqlite), serveur lancé avec NORIA_DEMO=1 puis arrêté.
// Dépendances (hors dépôt) : puppeteer-core, Chrome (/usr/bin/google-chrome).
// Sorties : /workspace/bloc4-<sujet>-<appareil>.png, /workspace/certificat-transfert.pdf.
const puppeteer = require('puppeteer-core');
const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const S = path.join(__dirname, '..', 'server');
const { openStore } = require(path.join(S, 'src/store'));
const { seed, seedMulti, DEMO_PASSWORD } = require(path.join(S, 'src/seed'));
const PORT = Number(process.argv[2] || 3124); const BASE = `http://127.0.0.1:${PORT}`;
const DB = '/tmp/noria-b4.sqlite';
const FX = (f) => fs.readFileSync(path.join(S, 'test/fixtures', f)).toString('base64');
const D = [['iphone-se', 375, 667, 2, true, 'ht'], ['pixel-7', 412, 915, 2.625, true, 'fr'], ['ipad-mini', 768, 1024, 2, true, 'ht'], ['ordinateur', 1280, 800, 1, false, 'fr']];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Élève par appareil : [école d'origine, code, prénom, nom, naissance, consentement]
const PLAN = [['a', 'AF120305-CSP', 'Ana', 'Fictive', '2012-03-05', 'case'], ['b', 'MJ130712-LTF', 'Mackenson', 'Joseph (fictif)', '2013-07-12', 'otp'],
  ['a', 'WD121120-CSP', 'Wood', 'Dorvil (fictif)', '2012-11-20', 'otp'], ['b', 'NC130204-LTF', 'Nadège', 'Célestin (fictive)', '2013-02-04', 'case']];

async function prep() {
  for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) fs.rmSync(f, { force: true });
  const db = await openStore(DB); const ids = await seedMulti(db, await seed(db));
  const now = new Date().toISOString();
  await db.run("UPDATE school SET name = 'Collège Saint-Pierre (fictif)', initials = 'CSP', motto = 'Lumière, travail, réussite', logo = ?, logo_updated_at = ?, signature = ?, signature_name = 'Mme Directrice Fictive', signature_at = ? WHERE id = ?",
    FX('logo-fictif.jpg'), now, FX('signature-fictive.jpg'), now, ids.A.school);
  await db.run("UPDATE school SET name = 'Lycée Toussaint (fictif)', initials = 'LTF', motto = 'Konesans se richès', logo = ?, logo_updated_at = ?, signature = ?, signature_name = 'M. Directeur Fictif', signature_at = ? WHERE id = ?",
    FX('sceau-fictif.jpg'), now, FX('signature-fictive.jpg'), now, ids.B.school);
  const out = [];
  for (const [k, code, fn, ln, birth] of PLAN) {
    const X = ids[k.toUpperCase()]; const s = X.school;
    const id = await db.insert('INSERT INTO student (school_id, code, first_name, last_name, birth_date, sex) VALUES (?,?,?,?,?,?)', s, code, fn, ln, birth, fn.endsWith('a') || fn.endsWith('e') ? 'F' : 'M');
    await db.run('INSERT INTO student_code (code, school_id) VALUES (?,?)', code, s);
    await db.insert('INSERT INTO enrollment (school_id, student_id, class_id, reason) VALUES (?,?,?,?)', s, id, X.classes[0], 'démonstration');
    await db.run('INSERT INTO parent_link (school_id, parent_user_id, student_id, reason) VALUES (?,?,?,?)', s, X.users.parent2, id, 'démonstration');
    const ev = (subj, title, max, status) => db.insert(`INSERT INTO evaluation (school_id, class_id, subject_id, term_id, title, day, max_score, coefficient, status, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, s, X.classes[0], subj, X.terms[0], title, '2026-10-05', max, 1, status, X.users.prof1);
    for (const [subj, title, max, sc, st] of [['maths', 'Contrôle 1', 20, 15, 'publiee'], ['francais', 'Dictée', 10, 7, 'publiee'], ['sciences', 'Exposé', 20, 16, 'publiee'], ['maths', 'Brouillon', 20, 2, 'brouillon']])
      await db.insert('INSERT INTO grade (school_id, evaluation_id, student_id, score, updated_by, recorded_at) VALUES (?,?,?,?,?,?)', s, await ev(X.subjects[subj], title, max, st), id, sc, X.users.prof1, '2026-10-06');
    out.push(id);
  }
  await db.close();
  return { ids, students: out };
}
async function api(p, { method = 'GET', body, token } = {}) {
  const r = await fetch(BASE + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await r.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString()); } catch {}
  return { status: r.status, json, buf };
}
const tok = async (k, who) => (await api('/api/login', { method: 'POST', body: { school: `ecole-${k}`, identifier: `${who}@${k}.exemple.invalid`, password: DEMO_PASSWORD } })).json.token;
async function lastCode() { const db = await openStore(DB); try { const r = await db.get("SELECT body FROM outbox WHERE kind = 'transfert_code' ORDER BY id DESC LIMIT 1"); return (r.body.match(/(\d{6})/) || [])[1]; } finally { await db.close(); } }

(async () => {
  const { ids, students } = await prep();
  const srv = spawn(process.execPath, [path.join(S, 'src/index.js')], { env: { ...process.env, NORIA_DB: DB, NORIA_DEMO: '1', PORT: String(PORT), NORIA_TRANSFERT_MINISTERE: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 50 && !/NORIA \(/.test(log); i++) await sleep(100);
  const out = { appareils: {} }; let fail = 0;
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--headless=new'] });
  try {
    for (const [di, [name, w, h, dpr, mob, L]] of D.entries()) {
      const [o, code, fn, , birth, mode] = PLAN[di]; const acc = o === 'a' ? 'b' : 'a';
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
      const r = { langue: L, sens: `${o.toUpperCase()} → ${acc.toUpperCase()}`, consentement: mode, premierChargement: { octets: bytes, ko: Math.round(bytes / 102.4) / 10, requetes: reqs } };
      const until = (fn, arg, ms = 9000) => p.waitForFunction(fn, { timeout: ms }, arg).catch(async (e) => {
        console.error(name, 'attente échouée :', String(fn).slice(0, 160), '\nerreurs :', errs, csp, '\n', await p.evaluate(() => (document.getElementById('toasts') || {}).innerText + ' | ' + document.body.innerText.slice(0, 900)));
        throw e;
      });
      const shot = async (sujet) => { await p.evaluate(() => { document.getElementById('toasts').innerHTML = ''; }); return p.screenshot({ path: `/workspace/bloc4-${sujet}-${name}.png`, fullPage: true }); };
      const setLang = async () => { await p.evaluate((l) => { const s = document.getElementById('langSel'); if (s && s.value !== l) { s.value = l; s.dispatchEvent(new Event('change', { bubbles: true })); } }, L); await sleep(300); };
      const login = async (k, who) => {
        await p.waitForSelector('#loginScreen:not([hidden]) #lgForm');
        await p.select('#lgSchool', `ecole-${k}`);
        await p.$eval('#lgId', (e, v) => { e.value = v; }, `${who}@${k}.exemple.invalid`); await p.$eval('#lgPw', (e, v) => { e.value = v; }, DEMO_PASSWORD);
        await p.click('.login-main');
        await p.waitForSelector('#userChip', { timeout: 9000 }); await sleep(300); await setLang();
      };
      const logout = async () => { await p.$eval('#lgOut', (e) => e.click()); await p.waitForSelector('#loginScreen:not([hidden]) #lgForm', { timeout: 9000 }); };
      const go = async (m) => { await p.evaluate((m) => KL.go(m), m); await sleep(300); };
      const tab = async (k) => { await p.click(`#trTab-${k}`); await sleep(250); };
      const type = async (sel, v) => { await p.$eval(sel, (e) => { e.value = ''; }); await p.type(sel, v); };

      // 0. Relevé officiel émis par l'origine avant le transfert (demande du parent, approbation par l'API).
      { const pt = await tok(o, 'parent2'); const dt0 = await tok(o, 'direction');
        const rq = await api('/api/releves', { method: 'POST', token: pt, body: { student_id: students[di], term_id: ids[o.toUpperCase()].terms[0], motif: 'Inscription (fictif)' } });
        const ap = await api(`/api/releves/${rq.json.id}/approuver`, { method: 'POST', token: dt0, body: {} });
        if (ap.status !== 200) throw new Error(`relevé : ${ap.status} ${JSON.stringify(ap.json)}`); }
      // 1. École d'origine (direction) : signalement avec texte court, décision de fin d'année.
      await login(o, 'direction');
      await go('transferts'); await until(() => document.getElementById('trSearch'));
      r.moduleCharge = await p.evaluate(() => !!window.NORIA_TRF);
      await tab('signalements'); await until(() => document.getElementById('trFlag'));
      await type('#trFCode', code); await p.select('#trFCat', di % 2 ? 'document_manquant' : 'dette');
      await type('#trFText', di % 2 ? 'Acte de naissance à fournir (fictif)' : 'Frais du 1er trimestre impayés (fictif)');
      await p.$eval('#trFlag', (f) => f.requestSubmit());
      await until((c) => [...document.querySelectorAll('#trBody .tr-req')].some((x) => x.innerText.includes(c)), code);
      await shot('signalement');
      await tab('decisions'); await until(() => document.querySelector('#trDList select'));
      const sid = students[di];
      await p.select(`#trDec${sid}`, 'admis');
      await until(() => document.getElementById('toasts').innerText.length > 2);
      await shot('decisions');
      await logout();

      // 2. École d'accueil (secrétariat) : vérification (date obligatoire), résultat minimal, demande.
      await login(acc, 'secretariat');
      await go('transferts'); await until(() => document.getElementById('trSearch'));
      await type('#trCode', code);
      await p.$eval('#trSearch', (f) => f.requestSubmit());
      await until(() => document.querySelector('#trRes .badbox'));
      r.sansDate = await p.$eval('#trRes .badbox', (e) => e.textContent);
      await p.$eval('#trBirth', (e, v) => { e.value = v; }, birth);
      await p.$eval('#trSearch', (f) => f.requestSubmit());
      await until(() => document.getElementById('trCard'));
      r.resultat = await p.$eval('#trCard', (e) => e.innerText.replace(/\s+/g, ' ').slice(0, 220));
      r.sansNote = !/Contrôle|15\/20|Dictée/.test(r.resultat);
      await shot('verification');
      await p.click('#trAskBtn'); await until(() => document.getElementById('trReq'));
      if (mode === 'case') { await type('#trParent', 'Parent fictif 2'); await p.$eval('#trAgree', (e) => { e.checked = true; }); }
      else { await p.click('#trModeOtp'); await until(() => document.getElementById('trCaseBox').hidden); }
      await p.select('#trCls', await p.$eval('#trCls option:nth-child(2)', (x) => x.value));
      await type('#trWhy', 'Déménagement de la famille (fictif)');
      await shot('demande-formulaire');
      await p.$eval('#trReq', (f) => f.requestSubmit());
      await until(() => document.querySelector('#trBody .tr-req'));
      if (mode === 'otp') {
        await until(() => document.querySelector('#trBody .tr-demande'));
        await shot('demande-code');
        const c = await lastCode(); r.codeParentLu = !!c;
        const inp = await p.$('#trBody .tr-mini input'); await inp.type(c);
        await p.$eval('#trBody .tr-mini', (f) => f.requestSubmit());
      }
      await until(() => document.querySelector('#trBody .tr-consentement'));
      await shot('demande');
      await logout();

      // 3. École d'origine (direction) : demande reçue, approbation signée → copie du dossier.
      await login(o, 'direction');
      await go('transferts'); await tab('recus');
      await until(() => document.querySelector('#trBody [data-action="NORIA_TRF.approve"]'));
      await shot('recue');
      await p.$eval('#trBody [data-action="NORIA_TRF.approve"]', (e) => e.click());
      await until(() => document.querySelector('#trBody .tr-transfere'));
      await shot('approuvee');
      await logout();

      // 4. École d'accueil (direction) : dossier reçu, certificat.
      await login(acc, 'direction');
      await go('transferts'); await tab('envoyes');
      await until(() => document.querySelector('#trBody [data-action="NORIA_TRF.dossier"]'));
      await shot('transfere');
      await p.$eval('#trBody [data-action="NORIA_TRF.dossier"]', (e) => e.click());
      await until(() => document.querySelector('#trDossier .tr-tab'));
      r.notesRecues = await p.$$eval('#trDossier .tr-tab tbody tr', (x) => x.length);
      r.releveSignatureOrigine = await p.$$eval('#trDossier .tr-transfere', (x) => x.map((e) => e.textContent));
      await shot('dossier');
      await logout();
      const dt = await tok(acc, 'direction');
      const tr = (await api('/api/transferts', { token: dt })).json.items.find((x) => x.code_eleve === code);
      const pdf = (await api(`/api/transferts/${tr.id}/certificat`, { token: dt })).buf;
      if (di === 0) fs.writeFileSync('/workspace/certificat-transfert.pdf', pdf);
      fs.writeFileSync('/tmp/certificat-ok.pdf', pdf);
      const bad = Buffer.from(pdf); bad[Math.floor(bad.length / 2)] ^= 1; fs.writeFileSync('/tmp/certificat-modifie.pdf', bad);
      r.certificat = tr.certificat; r.resume = tr.resume;

      // 5. Page publique du certificat.
      const pub = await ctx.newPage();
      pub.on('pageerror', (e) => errs.push(e.message));
      pub.on('console', (m) => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) csp.push(t); else if (m.type() === 'error' && !/\b(401)\b/.test(t)) errs.push(t); });
      await pub.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob });
      await pub.goto(`${BASE}/#verifier=${tr.certificat.replace(/-/g, '')}`, { waitUntil: 'networkidle0' });
      await pub.evaluate((l) => { const s = document.getElementById('langSel'); if (s && s.value !== l) { s.value = l; s.dispatchEvent(new Event('change', { bubbles: true })); } }, L);
      await pub.reload({ waitUntil: 'networkidle0' });
      await pub.waitForSelector('#vFile');
      await (await pub.$('#vFile')).uploadFile('/tmp/certificat-ok.pdf');
      await pub.waitForFunction(() => document.getElementById('vFileRes').textContent.length > 3);
      r.public = await pub.$eval('#verifRes', (e) => e.textContent); r.fichierIntact = await pub.$eval('#vFileRes', (e) => e.textContent);
      await pub.screenshot({ path: `/workspace/bloc4-public-certificat-${name}.png`, fullPage: true });
      await (await pub.$('#vFile')).uploadFile('/tmp/certificat-modifie.pdf');
      await pub.waitForFunction(() => document.getElementById('vFileRes').className === 'verif-bad');
      r.fichierModifie = await pub.$eval('#vFileRes', (e) => e.textContent);
      await pub.close();

      r.erreursConsole = errs; r.violationsCsp = csp;
      if (errs.length || csp.length || !r.sansNote) fail++;
      out.appareils[name] = r;
      await ctx.close();
    }
  } catch (e) { console.error(e); fail++; }
  finally { await b.close(); srv.kill('SIGTERM'); }
  console.log(JSON.stringify(out, null, 1));
  if (/erreur serveur|Error/.test(log)) { console.error('Journal serveur :\n', log); }
  process.exit(fail ? 1 : 0);
})();
