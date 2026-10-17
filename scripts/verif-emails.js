// Bloc 7 : adresses e-mail des élèves dans un vrai navigateur (CSP stricte, aucune erreur de console).
//   1. Direction : création en masse (aperçu puis validation).
//   2. Parent : accord parental, destination, page publique de vérification (lien reçu), adresse active.
//   3. Élève : son adresse et sa destination.
// Usage : NODE_PATH=/chemin/node_modules node scripts/verif-emails.js http://127.0.0.1:3150 /tmp/serveur.log <appareil>
//   (serveur NORIA_DEMO=1 NORIA_EMAIL_ELEVES=1 NORIA_EMAIL_DOMAINE=eleve.noria.ht, base neuve, journal dans le fichier).
// Sorties : /workspace/bloc7-<page>-<appareil>.png
const fs = require('node:fs');
const puppeteer = require('puppeteer-core');
const [BASE = 'http://127.0.0.1:3150', LOG = '/tmp/noria-bloc7.log', DEV = 'ordinateur'] = process.argv.slice(2);
const DEVICES = { ordinateur: [1280, 800, 1, false], 'pixel-7': [412, 915, 2.625, true] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { appareil: DEV, erreurs: [], csp: [] };
async function page(b) {
  const [w, h, dpr, mob] = DEVICES[DEV];
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage();
  p.on('pageerror', (e) => out.erreurs.push(e.message));
  p.on('console', (m) => { const x = m.text(); if (/Content Security Policy|Refused to/i.test(x)) out.csp.push(x); else if (m.type() === 'error' && !/\b401\b/.test(x)) out.erreurs.push(x); });
  await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob });
  return { p, ctx };
}
async function login(p, who, measure = false) {
  let bytes = 0, cdp = null;
  if (measure) { cdp = await p.createCDPSession(); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }); cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; }); }
  await p.goto(`${BASE}/app`, { waitUntil: 'networkidle0' });
  if (cdp) { await cdp.detach(); out.appPremierChargementKo = Math.round(bytes / 102.4) / 10; }
  await p.select('#lgSchool', 'ecole-a');
  await p.$eval('#lgId', (e, v) => { e.value = v; }, `${who}@a.exemple.invalid`); await p.$eval('#lgPw', (e) => { e.value = 'demo-fictif-2026'; });
  await p.click('.login-main'); await p.waitForSelector('#userChip', { timeout: 9000 }); await sleep(600);
}
async function go(p, mod, sel) {
  const ok = await p.evaluate((m) => { const b = document.querySelector(`#nav button[data-nav="${m}"]`); if (b) b.click(); return !!b; }, mod);
  if (!ok) throw new Error(`entrée de menu absente : ${mod}`);
  await p.waitForSelector(sel, { timeout: 9000 }); await sleep(400);
}
async function shot(p, name) {
  // Capture pleine page : la barre fixe du bas (téléphone) est replacée en fin de page pour ne pas couper le contenu.
  await p.evaluate(() => { document.querySelectorAll('#toasts > *').forEach((e) => e.remove()); scrollTo(0, 0);
    for (const e of document.body.querySelectorAll('*')) { const c = getComputedStyle(e); if (c.position === 'fixed' && c.bottom === '0px' && e.offsetHeight < 120) e.style.position = 'relative'; } });
  await sleep(200);
  await p.screenshot({ path: `/workspace/bloc7-${name}-${DEV}.png`, fullPage: true });
}
const lastLink = () => { const m = [...fs.readFileSync(LOG, 'utf8').matchAll(/\/email\/verifier\?t=([A-Za-z0-9_-]+)/g)]; return m.length ? m[m.length - 1][1] : null; };

(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--headless=new'] });
  try {
    // 1. Direction : création en masse.
    { const { p, ctx } = await page(b);
      await login(p, 'direction', true);
      out.menuDirection = await p.evaluate(() => [...document.querySelectorAll('#nav > *')].map((e) => (e.tagName === 'SMALL' ? `[${e.textContent}]` : e.textContent.trim())));
      await go(p, 'emails', '#emCls');
      await p.evaluate(() => document.querySelector('form[data-action-submit="NORIA_EMAILS.preview"] button').click());
      await p.waitForSelector('#emPrev table', { timeout: 9000 }); await sleep(300);
      out.apercu = await p.$$eval('#emPrev tbody tr', (r) => r.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
      await shot(p, 'creation-masse');
      await p.evaluate(() => document.querySelector('[data-action="NORIA_EMAILS.create"]').click());
      await p.waitForFunction(() => !document.querySelector('#emPrev table') && document.querySelectorAll('code').length > 0, { timeout: 9000 }); await sleep(300);
      out.creees = await p.$$eval('table code', (r) => r.map((x) => x.textContent));
      await shot(p, 'adresses-direction');
      await ctx.close(); }
    // 2. Parent : accord, destination, vérification par lien.
    { const { p, ctx } = await page(b);
      await login(p, 'parent1');
      await go(p, 'monemail', '.em-addr');
      await p.evaluate(() => { const f = document.querySelector('form[data-action-submit="NORIA_MYMAIL.consent"]'); f.querySelector('input[type=checkbox]').checked = true; f.querySelector('button').click(); });
      await p.waitForFunction(() => !document.querySelector('form[data-action-submit="NORIA_MYMAIL.consent"]'), { timeout: 9000 }); await sleep(300);
      await p.$eval('input[id^="emDest"]', (e) => { e.value = 'parent1.perso@exemple.invalid'; });
      await p.evaluate(() => document.querySelector('form[data-action-submit="NORIA_MYMAIL.dest"] button').click());
      await p.waitForSelector('input[id^="emCode"]', { timeout: 9000 }); await sleep(500);
      const t = lastLink(); if (!t) throw new Error('lien de vérification introuvable dans le journal');
      await p.goto(`${BASE}/email/verifier?t=${t}`, { waitUntil: 'networkidle0' });
      await shot(p, 'verification-adresse');
      await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.click('button[type=submit]')]);
      out.verification = await p.$eval('h1', (e) => e.textContent);
      await shot(p, 'verification-confirmee');
      await p.goto(`${BASE}/app`, { waitUntil: 'networkidle0' }); await p.waitForSelector('#userChip', { timeout: 9000 }); await sleep(500);
      await go(p, 'monemail', '.em-addr');
      out.parent = await p.$eval('#ecoView', (e) => e.innerText.replace(/\s+/g, ' ').slice(0, 400));
      await shot(p, 'espace-parent');
      await ctx.close(); }
    // 3. Élève.
    { const { p, ctx } = await page(b);
      await login(p, 'eleve1');
      await go(p, 'monemail', '.em-addr');
      out.eleve = await p.$eval('#ecoView', (e) => e.innerText.replace(/\s+/g, ' ').slice(0, 400));
      await shot(p, 'espace-eleve');
      await ctx.close(); }
  } finally { await b.close(); }
  console.log(JSON.stringify(out, null, 1));
  process.exit(out.erreurs.length || out.csp.length ? 1 : 0);
})();
