'use strict';
// pt67 : alertes de sécurité hors de l'application — e-mail (NORIA_ALERTES_EMAIL) et Telegram relié par le super-admin,
// envoi immédiat (critique, connexion super-admin depuis un nouvel appareil, export en masse, comptes privilégiés),
// récapitulatif des alertes « attention », plafond horaire, pas de doublon ; état des sauvegardes lu dans etat.json.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openTestDb } = require('./helpers');
const { createServer } = require('../src/app');
const { seed } = require('../src/seed');
const { createAdmin, backups, dbSize } = require('../src/plateforme');
const { createSecurity } = require('../src/securite');

const ADMIN_PW = 'admin-fictif-tres-long-2026';
const ENV = { NODE_TEST_CONTEXT: '1', NORIA_ALERTES_EMAIL: 'alertes@exemple.invalid',
  NORIA_TELEGRAM_BOT_TOKEN: '123456:ABCdefGHIjklMNOpqrSTUvwx-yz', NORIA_TELEGRAM_WEBHOOK_SECRET: 'secret-webhook-fictif-tg', NORIA_TELEGRAM_BOT_USERNAME: 'NoriaFictifBot' };
let db, ids, server, base, sec, clock; const sent = []; const tg = [];
const notifier = { adapter: (channel) => ({ name: 'test', simulated: false, async send(m) { sent.push({ channel, ...m }); return { id: 'x' }; } }) };
const channelFetch = async (url, opts) => { tg.push({ url, body: JSON.parse(opts.body) }); return { ok: true, status: 200, async json() { return { ok: true }; } }; };
async function call(token, method, p, body, headers = {}) {
  const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
async function adminLogin(ua = 'navigateur-fictif-1', ip = '203.0.113.50') {
  const h = { 'user-agent': ua, 'x-forwarded-for': ip };
  const a = await call(null, 'POST', '/api/admin/login', { email: 'admin@noria.exemple.invalid', password: ADMIN_PW }, h);
  assert.equal(a.status, 200);
  const code = sent.filter((m) => /code \d{6}/.test(m.text)).pop().text.match(/code (\d{6})/)[1];
  const r = await call(null, 'POST', '/api/admin/login/code', { ticket: a.json.ticket, code }, h);
  assert.equal(r.status, 200); await sec.settle();
  return r.json.token;
}
const upd = (text, chat = 5151) => ({ update_id: 1, message: { message_id: 1, date: 0, chat: { id: chat, type: 'private' }, from: { id: chat, language_code: 'fr' }, text } });
const hook = (body) => call(null, 'POST', '/api/telegram/webhook', body, { 'x-telegram-bot-api-secret-token': ENV.NORIA_TELEGRAM_WEBHOOK_SECRET });
const opts = () => ({ backups: () => ({ configure: false }), dbSize: () => dbSize(db) });
const tgTexts = () => tg.filter((x) => /sendMessage$/.test(x.url)).map((x) => x.body.text);

before(async () => {
  db = await openTestDb(); ids = await seed(db);
  await createAdmin(db, { email: 'admin@noria.exemple.invalid', name: 'Admin fictif', password: ADMIN_PW });
  clock = { t: Date.now() };
  sec = createSecurity({ db, env: ENV, notifier, channelFetch, now: () => clock.t, log: (m) => { if (process.env.DBG) console.log('LOG', m); } });
  server = createServer(db, { env: ENV, notifier, channelFetch, rateLimit: { max: 1000 }, security: sec, trustProxy: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.cleanup(); });

let token;
test('liaison Telegram du super-admin : lien profond à usage unique, état, message de test sur les deux canaux', async () => {
  token = await adminLogin();
  const st = await call(token, 'GET', '/api/admin/alertes');
  assert.equal(st.status, 200);
  assert.equal(st.json.email, 'alertes@exemple.invalid'); assert.equal(st.json.telegram_actif, true); assert.equal(st.json.relie, false);
  const l = await call(token, 'POST', '/api/admin/alertes/telegram/lien', {});
  assert.equal(l.status, 200);
  const m = l.json.url.match(/^https:\/\/t\.me\/NoriaFictifBot\?start=(adm-[\w-]{32})$/); assert.ok(m, l.json.url);
  assert.equal((await hook(upd(`/start ${m[1]}`))).json.resultat, 'alertes_relie');
  assert.equal((await hook(upd(`/start ${m[1]}`, 999))).json.resultat, 'lien_invalide', 'usage unique');
  const s2 = await call(token, 'GET', '/api/admin/alertes'); assert.equal(s2.json.relie, true);
  // Aucun accès pour un compte d'école ni sans connexion.
  assert.equal((await call(null, 'GET', '/api/admin/alertes')).status, 401);
  tg.length = 0; sent.length = 0;
  const t = await call(token, 'POST', '/api/admin/alertes/test', {});
  assert.equal(t.status, 200); assert.deepEqual(t.json.canaux.sort(), ['email', 'telegram']);
  assert.equal(sent[0].to, 'alertes@exemple.invalid');
  assert.equal(tg[0].body.chat_id, '5151');
  assert.ok(!JSON.stringify(tg).includes('secret-webhook'), 'aucun secret dans les messages');
});

test('connexion super-admin depuis un nouvel appareil : alerte immédiate (sans attendre l’analyse), une seule fois', async () => {
  tg.length = 0;
  clock.t += 60e3; await adminLogin('navigateur-fictif-1', '203.0.113.50'); // même appareil, même IP : rien
  assert.equal(tgTexts().filter((x) => /appareil/.test(x)).length, 0);
  clock.t += 60e3; await adminLogin('autre-appareil-2', '198.51.100.7');
  const dev = () => tgTexts().filter((x) => /appareil/.test(x)); const tx = dev(); assert.equal(tx.length, 1); assert.match(tx[0], /ATTENTION : .*appareil/i);
  await sec.analyse(opts());
  assert.equal(dev().length, 1, 'pas de doublon à l’analyse suivante');
});

test('export en masse : export de toute l’école et plus de 50 exports en 1 h → alerte immédiate', async () => {
  tg.length = 0; sent.length = 0;
  await db.run("INSERT INTO audit_log (school_id, actor_user_id, action, record_type, record_id, reason, created_at) VALUES (?,?,?,?,?,?,?)",
    ids.A.school, ids.A.users.direction, 'export.students', 'school', String(ids.A.school), null, new Date(clock.t).toISOString().replace('T', ' ').slice(0, 19));
  for (let i = 0; i < 51; i++) await sec.record({ kind: 'export', ip: '203.0.113.9', user_id: 77, school_id: ids.A.school, path: '/api/export/students' });
  await sec.analyse(opts());
  const a = await db.all("SELECT severity, fingerprint, notified_at FROM security_alert WHERE rule = 'export_masse'");
  assert.equal(a.length, 2);
  assert.ok(a.find((x) => x.severity === 'critique' && x.fingerprint === 'export_masse:u:77|heure'));
  assert.ok(tgTexts().some((x) => /CRITIQUE : Export en masse/.test(x)));
  assert.ok(a.every((x) => x.notified_at), 'chaque alerte signalée (immédiate ou récapitulatif)');
});

test('comptes privilégiés : nouveau super-admin et changement de rôles → alerte immédiate', async () => {
  tg.length = 0; clock.t += 31 * 60e3;
  await db.run("INSERT INTO platform_audit (admin_id, action, target, detail, outcome, ip, created_at) VALUES (?,?,?,?,?,?,?)", null, 'admin.create', '9', 'script CLI admin:creer', 'ok', null, new Date(clock.t).toISOString().replace('T', ' ').slice(0, 19));
  await db.run("INSERT INTO audit_log (school_id, actor_user_id, action, record_type, record_id, reason, created_at) VALUES (?,?,?,?,?,?,?)",
    ids.A.school, 1, 'user.roles', 'user', '5', 'promotion [rôles: direction]', new Date(clock.t).toISOString().replace('T', ' ').slice(0, 19));
  await sec.analyse(opts());
  const a = await db.all("SELECT severity, explain_fr FROM security_alert WHERE rule = 'comptes_privilegies'");
  assert.equal(a.length, 3, 'admin n° 1 (création du test) et n° 9 et le changement de rôles');
  assert.ok(a.some((x) => /nouveau compte super-admin : admin n° 9/.test(x.explain_fr)));
  assert.ok(a.some((x) => /changement de rôles \(direction\)/.test(x.explain_fr)));
  assert.ok(tgTexts().some((x) => /CRITIQUE : Compte privilégié/.test(x)));
  const n = tgTexts().length; await sec.analyse(opts()); assert.equal(tgTexts().length, n, 'dédoublonné');
});

test('alertes « attention » regroupées dans un récapitulatif (au plus toutes les 30 min) et plafond horaire', async () => {
  tg.length = 0; clock.t += 31 * 60e3;
  for (let i = 0; i < 10; i++) await sec.record({ kind: 'login.fail', ip: '192.0.2.44', account: 'meme@x.invalid' });
  await sec.analyse(opts());
  const t1 = tgTexts(); assert.equal(t1.length, 1); assert.match(t1[0], /récapitulatif/); assert.match(t1[0], /2 alerte\(s\)[\s\S]*Force brute/);
  for (let i = 0; i < 10; i++) await sec.record({ kind: 'login.fail', ip: '192.0.2.45', account: `autre${i}@x.invalid` });
  clock.t += 5 * 60e3; await sec.analyse(opts());
  assert.equal(tgTexts().filter((x) => /récapitulatif/.test(x)).length, 1, 'pas de 2e récapitulatif avant 30 min');
  // Plafond : 2 messages par heure.
  const s3 = createSecurity({ db, env: { ...ENV, NORIA_ALERTES_MAX_HEURE: '2' }, notifier, channelFetch, now: () => clock.t, log: () => {} });
  tg.length = 0;
  for (let k = 0; k < 4; k++) await s3.alertes.deliver('s', `t${k}`);
  assert.equal(tgTexts().length, 2);
});

test('/stop retire aussi la liaison des alertes', async () => {
  assert.equal((await hook(upd('/stop'))).json.resultat, 'arrete');
  assert.equal((await call(token, 'GET', '/api/admin/alertes')).json.relie, false);
});

test('sauvegardes : etat.json fait foi ; sinon sous-dossiers quotidien/hebdomadaire/mensuel', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noria-etat-'));
  const old = process.env.BACKUP_DIR; process.env.BACKUP_DIR = dir;
  try {
    assert.equal(backups().last, null);
    fs.mkdirSync(path.join(dir, 'quotidien')); fs.writeFileSync(path.join(dir, 'quotidien', 'noria-2026-10-24T031500Z.dump.age'), 'x');
    const b = backups(); assert.equal(b.source, 'dossier'); assert.equal(b.last.name, 'noria-2026-10-24T031500Z.dump.age');
    fs.writeFileSync(path.join(dir, 'etat.json'), JSON.stringify({ version: 1, derniere: { name: 'noria-x.dump.age', at: '2026-10-24T03:22:24Z', size: 1234, sha256: 'ab' }, chiffrement: 'age', hors_site: true, quotidiennes: 7 }));
    const e = backups(); assert.equal(e.source, 'etat.json'); assert.equal(e.last.at, '2026-10-24T03:22:24.000Z'); assert.equal(e.chiffrement, 'age'); assert.equal(e.count, 7);
    // L'alerte « clé de chiffrement absente » disparaît quand etat.json confirme le chiffrement.
    const s4 = createSecurity({ db, env: { NODE_ENV: 'production', NODE_TEST_CONTEXT: '1' }, secureCookie: true, now: () => Date.parse('2026-10-24T12:00:00Z'), log: () => {} });
    await s4.analyse({ backups, dbSize: async () => 1 });
    const fps = (await db.all("SELECT fingerprint FROM security_alert WHERE status = 'ouverte'")).map((x) => x.fingerprint);
    assert.ok(!fps.includes('configuration:NORIA_BACKUP_AGE_RECIPIENT'));
  } finally { if (old === undefined) delete process.env.BACKUP_DIR; else process.env.BACKUP_DIR = old; fs.rmSync(dir, { recursive: true, force: true }); }
});
