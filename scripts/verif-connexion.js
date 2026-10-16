// Vérifie la connexion au serveur dans Chrome headless (iPhone SE, Pixel 7, iPad Mini, ordinateur) :
// écran de connexion, connexion direction puis parent, rôle imposé par le serveur, navigation complète, 0 erreur,
// poids transféré au premier chargement (cache vide). Usage : NORIA_DEMO=1 npm start (dans server/) ;
// node scripts/verif-connexion.js http://127.0.0.1:3100
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:3100';
const D = [['iphone-se', 375, 667, 2, true], ['pixel-7', 412, 915, 2.625, true], ['ipad-mini', 768, 1024, 2, true], ['desktop', 1280, 800, 1, false]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--headless=new'] });
  const out = {};
  for (const [name, w, h, dpr, mob] of D) {
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    const cdp = await p.createCDPSession(); await cdp.send('Network.enable');
    let bytes = 0, reqs = 0; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; reqs++; });
    await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob });
    await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
    await p.waitForSelector('#loginScreen:not([hidden]) #lgForm');
    const first = { octets: bytes, requetes: reqs };
    await p.screenshot({ path: `/workspace/connexion-${name}-ecran.png` });
    const r = { premierChargement: first, errors: errs };
    const login = async (handle) => {
      await p.select('#lgSchool', 'ecole-a');
      await p.$eval('#lgId', (e, v) => { e.value = v; }, `${handle}@a.exemple.invalid`);
      await p.$eval('#lgPw', (e) => { e.value = 'demo-fictif-2026'; });
      await p.click('.login-main');
      await p.waitForSelector('#userChip', { timeout: 8000 });
      await sleep(300);
    };
    await login('direction');
    r.direction = await p.evaluate(() => ({
      selecteurRoleVisible: getComputedStyle(document.getElementById('roleSel')).display !== 'none',
      puce: document.getElementById('userChip').innerText.replace(/\s+/g, ' '),
      ecranConnexionFerme: document.getElementById('loginScreen').hidden,
      localStorageEleves: (JSON.parse(localStorage.getItem('klirline_school_v1') || '{}').students || []).some((s) => /Fictif/.test(s.lastName)),
    }));
    await p.reload({ waitUntil: 'networkidle0' }); await p.waitForSelector('#userChip');
    r.sessionApresRechargement = await p.evaluate(() => { const l = document.getElementById('loginScreen'); return !l || l.hidden; });
    // Navigation : toutes les sections du rôle
    const mode = await p.evaluate(() => document.documentElement.dataset.navMode);
    const labels = await p.$$eval('#nav > button', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
    let ok = 0; const miss = [];
    for (const lab of labels) {
      const res = await p.evaluate(async (lab, mode) => {
        const S = (ms) => new Promise((r) => setTimeout(r, ms));
        const find = (sel) => [...document.querySelectorAll(sel)].find((e) => e.textContent.replace(/\s+/g, ' ').trim() === lab && e.offsetParent !== null);
        let t = mode === 'desktop' ? find('#nav > button') : find('#mnvBar .mnv-tab');
        if (!t && mode !== 'desktop') { document.querySelector('.mnv-menu-btn').click(); await S(60); t = find('.mnv-item'); }
        if (!t) return 'introuvable';
        t.click(); await S(80);
        const src = [...document.querySelectorAll('#nav > button')].find((e) => e.textContent.replace(/\s+/g, ' ').trim() === lab);
        if (document.documentElement.scrollWidth > innerWidth + 1) return 'défilement horizontal';
        return src && src.classList.contains('on') ? 'ok' : 'non active';
      }, lab, mode);
      if (res === 'ok') ok++; else miss.push(`${lab}: ${res}`);
    }
    r.navigationDirection = `${ok}/${labels.length}`; if (miss.length) r.manques = miss;
    await p.evaluate(() => KL.go('students')); await sleep(200);
    r.elevesAffiches = await p.evaluate(() => [...document.querySelectorAll('#view td, #view h3, #view b')].map((e) => e.textContent).filter((x) => /Fictif[AB]/.test(x)).length);
    await p.screenshot({ path: `/workspace/connexion-${name}.png` });
    // Déconnexion puis parent : rôle imposé
    await p.click('#lgOut'); await p.waitForSelector('#loginScreen:not([hidden]) #lgForm');
    await login('parent1');
    r.parent = await p.evaluate(async () => {
      KL.role('direction');
      const api = await (await fetch('/api/students', { credentials: 'same-origin' })).json();
      return { roleAffiche: document.getElementById('userChip').innerText.split('\n')[1], apiEleves: api.map((s) => s.code) };
    });
    await p.evaluate(() => KL.go('dashboard')); await sleep(200);
    await p.screenshot({ path: `/workspace/connexion-${name}-parent.png` });
    r.errors = errs;
    out[name] = r; await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1)); await b.close();
})();
