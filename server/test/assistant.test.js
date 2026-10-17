'use strict';
// Assistant sécurité (bloc 3) : chaque règle sur des scénarios simulés, aucune action sans confirmation, code exigé
// pour les actions critiques, aucun accès pour un compte d'école, regroupement des notifications, adaptateur LLM.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openTestDb } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');
const { createAdmin, backups, dbSize } = require('../src/plateforme');
const { createSecurity, maskIp, maskAccount } = require('../src/securite');
const { createLlm, redact, scrub } = require('../src/assistant-llm');

const ADMIN_PW = 'admin-fictif-tres-long-2026';
let db, server, base, ids, sec; const sent = [];
const notifier = { adapter: (channel) => ({ name: 'test', simulated: false, async send(m) { sent.push({ channel, ...m }); return { id: 'x' }; } }) };
async function call(token, method, p, body, headers = {}) {
  const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
async function adminLogin() {
  const a = await call(null, 'POST', '/api/admin/login', { email: 'admin@noria.exemple.invalid', password: ADMIN_PW });
  assert.equal(a.status, 200);
  const code = sent.pop().text.match(/code (\d{6})/)[1];
  return (await call(null, 'POST', '/api/admin/login/code', { ticket: a.json.ticket, code })).json.token;
}
const opts = () => ({ backups, dbSize: () => dbSize(db) });
const alerts = (rule) => db.all("SELECT * FROM security_alert WHERE rule = ? AND status = 'ouverte'", rule);
const ev = (o) => sec.record(o);
const BK = fs.mkdtempSync(path.join(os.tmpdir(), 'noria-bk-'));

before(async () => {
  process.env.BACKUP_DIR = BK;
  const old = path.join(BK, 'noria-2026.sql.gz.age'); fs.writeFileSync(old, 'x');
  const t = (Date.now() - 30 * 3600e3) / 1000; fs.utimesSync(old, t, t);
  db = await openTestDb(); ids = await seed(db);
  await createAdmin(db, { email: 'admin@noria.exemple.invalid', name: 'Admin fictif', phone: '+50900000999', password: ADMIN_PW });
  sec = createSecurity({ db, env: { NORIA_TZ: 'America/Port-au-Prince', NODE_TEST_CONTEXT: '1' }, notifier, log: () => {} });
  server = createServer(db, { notifier, rateLimit: { max: 1000 }, security: sec });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { delete process.env.BACKUP_DIR; server.close(); await db.cleanup(); fs.rmSync(BK, { recursive: true, force: true }); });

test('masquage partiel des IP et des comptes dans les preuves', () => {
  assert.equal(maskIp('203.0.113.45'), '203.0.113.x');
  assert.equal(maskIp('::ffff:198.51.100.7'), '198.51.100.x');
  assert.match(maskIp('2001:db8:1:2::5'), /^2001:db8:1:…$/);
  assert.equal(maskAccount('direction@a.exemple.invalid'), 'di***@a.***');
  assert.equal(maskAccount('+50900000101'), '+509****01');
});

test('règle force brute : échecs par IP et par compte (vraies requêtes de connexion)', async () => {
  for (let i = 0; i < 12; i++) await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: 'prof1@a.exemple.invalid', password: `faux-${i}` });
  await sec.analyse(opts());
  const ip = await alerts('force_brute_ip');
  assert.equal(ip.length, 1); assert.equal(ip[0].severity, 'attention');
  assert.match(ip[0].explain_fr, /12 connexions/); assert.match(ip[0].explain_ht, /12 koneksyon/);
  assert.ok(JSON.parse(ip[0].evidence).every((l) => !/127\.0\.0\.1/.test(l)), 'IP masquée dans les preuves');
  assert.deepEqual(JSON.parse(ip[0].actions).map((a) => a.type), ['ip.bloquer']);
  const acc = await alerts('force_brute_compte');
  assert.equal(acc.length, 1); assert.ok(JSON.parse(acc[0].evidence)[0].startsWith('pr***@a.***'));
  assert.ok(JSON.parse(acc[0].actions).some((a) => a.type === 'compte.verrouiller' && a.critical));
  // Les échecs de code (OTP) comptent aussi.
  const before = Number((await db.get("SELECT COUNT(*) AS n FROM security_event WHERE kind = 'otp.fail'")).n);
  await call(null, 'POST', '/api/login', { method: 'code', school: 'ecole-a', identifier: 'prof1@a.exemple.invalid', code: '000000' });
  await sec.flush(); // l'observation n'attend pas la réponse HTTP : on attend l'écriture avant de compter
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM security_event WHERE kind = 'otp.fail'")).n), before + 1);
});

test('règle pulvérisation (plusieurs comptes) : critique, notification au super-admin sans donnée personnelle', async () => {
  sent.length = 0;
  for (let i = 0; i < 6; i++) await ev({ kind: 'login.fail', ip: '203.0.113.7', account: `cible${i}@a.exemple.invalid`, status: 401, path: '/api/login' });
  await sec.analyse(opts());
  const a = await alerts('pulverisation');
  assert.equal(a.length, 1); assert.equal(a[0].severity, 'critique');
  const msg = sent.find((m) => /CRITIQUE/.test(m.text) && /pulvérisation/i.test(m.text));
  assert.ok(msg, 'SMS critique envoyé'); assert.equal(msg.to, '+50900000999');
  assert.doesNotMatch(msg.text, /203\.0\.113|cible|exemple/);
  assert.match(msg.text, /Aucune action n’a été faite automatiquement/);
});

test('règle nouvelle IP / nouvel appareil pour la direction', async () => {
  const u = await db.get('SELECT person_id FROM app_user WHERE id = ?', ids.A.users.direction);
  await db.run("INSERT INTO security_event (at_ms, kind, ip, account, role, user_id, school_id, ua_hash) VALUES (?, 'login.ok', '198.51.100.20', ?, 'direction', ?, ?, 'ancien')",
    Date.now() - 86400e3, `p:${u.person_id}`, ids.A.users.direction, ids.A.school);
  const r = await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: 'direction@a.exemple.invalid', password: DEMO_PASSWORD }, { 'user-agent': 'Navigateur inconnu 1.0' });
  assert.equal(r.status, 200);
  await sec.analyse(opts());
  const a = await alerts('nouvel_appareil');
  assert.equal(a.length, 1); assert.equal(a[0].severity, 'info');
  assert.match(a[0].explain_fr, /une adresse IP et un appareil/);
  // Un enseignant n'est pas surveillé par cette règle.
  await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: 'prof2@a.exemple.invalid', password: DEMO_PASSWORD }, { 'user-agent': 'Autre' });
  await sec.analyse(opts());
  assert.equal((await alerts('nouvel_appareil')).length, 1);
});

test('règle inter-écoles : 404 répétés sur des fiches d’une autre école', async () => {
  const tok = (await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: 'secretariat@a.exemple.invalid', password: DEMO_PASSWORD })).json.token;
  for (const id of ids.B.students) assert.equal((await call(tok, 'GET', `/api/students/${id}`)).status, 404);
  for (let i = 0; i < 9; i++) await call(tok, 'GET', `/api/students/${900000 + i}`);
  // Un refus RLS simulé compte aussi.
  await ev({ kind: 'rls', ip: '127.0.0.1', user_id: ids.A.users.secretariat, school_id: ids.A.school, status: 404, path: `/api/students/${ids.B.students[0]}/photo` });
  await sec.analyse(opts());
  const a = await alerts('inter_ecoles');
  assert.equal(a.length, 1); assert.match(a[0].explain_fr, /11 refus/); assert.match(a[0].explain_fr, /RLS/);
});

test('règles de pics 4xx et 5xx', async () => {
  for (let i = 0; i < 110; i++) await ev({ kind: 'http', ip: '192.0.2.50', status: 404, path: '/api/inexistant' });
  for (let i = 0; i < 6; i++) await ev({ kind: 'http', ip: '192.0.2.51', status: 500, path: '/api/students' });
  await sec.analyse(opts());
  assert.equal((await alerts('pic_4xx')).length, 1);
  const c = await alerts('pic_5xx'); assert.equal(c.length, 1); assert.equal(c[0].severity, 'attention');
});

test('règle volume anormal : exports, PDF et fiches par compte', async () => {
  for (let i = 0; i < 21; i++) await ev({ kind: 'export', ip: '127.0.0.1', user_id: ids.A.users.compta, school_id: ids.A.school, status: 200, path: '/api/export/finance' });
  for (let i = 0; i < 5; i++) await ev({ kind: 'pdf', ip: '127.0.0.1', user_id: ids.A.users.compta, school_id: ids.A.school, status: 200, path: '/api/x.pdf' });
  await sec.analyse(opts());
  const a = await alerts('volume_anormal');
  assert.equal(a.length, 1, 'seul le volume d’exports dépasse le seuil'); assert.match(a[0].explain_fr, /21 exports/);
  // La consultation réelle d'une fiche est bien observée.
  const tok = (await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: 'direction@a.exemple.invalid', password: DEMO_PASSWORD })).json.token;
  assert.equal((await call(tok, 'GET', `/api/students/${ids.A.students[0]}`)).status, 200);
  await sec.flush();
  assert.ok(await db.get("SELECT id FROM security_event WHERE kind = 'fiche' AND user_id = ?", ids.A.users.direction));
});

test('règle modifications sensibles hors des heures habituelles (heure d’Haïti)', async () => {
  // 07:10 UTC = 03:10 à Port-au-Prince.
  const d = new Date(Date.now() - 3 * 3600e3); d.setUTCHours(7, 10, 0, 0); if (d.getTime() > Date.now()) d.setUTCDate(d.getUTCDate() - 1);
  const at = d.toISOString().replace('T', ' ').slice(0, 19);
  for (let i = 0; i < 3; i++) await db.run("INSERT INTO audit_log (school_id, actor_user_id, action, record_type, record_id, reason, outcome, created_at) VALUES (?,?,?,?,?,?,?,?)",
    ids.B.school, ids.B.users.compta, 'payment.cancel', 'payment', String(100 + i), 'test', 'ok', at);
  await sec.analyse(opts());
  const a = await alerts('modifs_sensibles');
  assert.equal(a.length, 1); assert.equal(a[0].severity, 'attention');
  assert.match(a[0].explain_fr, /3 modifications sensibles/); assert.match(a[0].evidence, /03:10/);
});

test('santé du serveur : sauvegarde de plus de 26 h, latence, disque, mémoire, taille de la base, certificat', async () => {
  await sec.analyse(opts());
  const b = (await alerts('sante')).find((x) => x.fingerprint === 'sante:sauvegarde');
  assert.ok(b); assert.equal(b.severity, 'critique'); assert.match(b.explain_fr, /plus de 26 h/);
  const s2 = createSecurity({ db, env: { NODE_TEST_CONTEXT: '1', NORIA_ASSISTANT_SEUILS: JSON.stringify({ latenceAttentionMs: 0, disqueAttentionPct: 101, memoireAttentionPct: 101, baseMaxMo: 0, certAttentionJours: 99999 }), NORIA_TLS_CERT_FILE: path.join(__dirname, 'fixtures', 'absent.pem') }, log: () => {} });
  const r = await s2.analyse(opts());
  const fps = (await alerts('sante')).map((x) => x.fingerprint);
  for (const k of ['latence', 'memoire', 'taille_base']) assert.ok(fps.includes(`sante:${k}`), k);
  if (typeof fs.statfsSync === 'function') assert.ok(fps.includes('sante:disque'));
  assert.equal(r.mesures.certificat.erreur, 'illisible');
});

test('configuration de production et rapport npm audit (sans lancer npm)', async () => {
  const f = path.join(BK, 'audit.json');
  fs.writeFileSync(f, JSON.stringify({ vulnerabilities: { 'paquet-fictif': { severity: 'critical' } }, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 1 } } }));
  const s3 = createSecurity({ db, env: { NODE_ENV: 'production', NODE_TEST_CONTEXT: '1', NORIA_AUDIT_RAPPORT: f, NORIA_SMS_PROVIDER: 'console' }, secureCookie: false, log: () => {} });
  await s3.analyse(opts());
  const fps = (await alerts('configuration')).map((x) => x.fingerprint);
  for (const k of ['NORIA_CLE_MAITRE', 'NORIA_OTP_SECRET', 'NORIA_BACKUP_AGE_RECIPIENT', 'NORIA_SMS_PROVIDER', 'NORIA_SECURE_COOKIE']) assert.ok(fps.includes(`configuration:${k}`), k);
  const d = await alerts('dependances'); assert.equal(d[0].severity, 'critique'); assert.match(d[0].evidence, /paquet-fictif/);
});

test('un utilisateur d’école n’a jamais accès à l’assistant', async () => {
  const r = await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: 'direction@a.exemple.invalid', password: DEMO_PASSWORD });
  for (const [m, p] of [['GET', '/api/admin/securite'], ['GET', '/api/admin/securite/actions'], ['POST', '/api/admin/securite/analyser'], ['POST', '/api/admin/securite/actions/preparer'], ['POST', '/api/admin/securite/actions/confirmer'], ['GET', '/api/admin/securite/guide']]) {
    assert.equal((await call(r.json.token, m, p, m === 'POST' ? { type: 'ip.bloquer', params: { ip: '203.0.113.9' } } : undefined)).status, 401, p);
    assert.equal((await call(null, m, p, undefined, { cookie: `noria_session=${r.json.token}`, 'x-noria': '1' })).status, 401, `${p} (cookie)`);
  }
});

test('aucune action sans confirmation explicite ; blocage d’IP puis annulation', async () => {
  const t = await adminLogin();
  const n = async () => Number((await db.get('SELECT COUNT(*) AS n FROM ip_block')).n);
  const p = await call(t, 'POST', '/api/admin/securite/actions/preparer', { type: 'ip.bloquer', params: { ip: '203.0.113.7', minutes: 30 } });
  assert.equal(p.status, 200); assert.equal(p.json.critique, false); assert.equal(await n(), 0, 'préparer ne modifie rien');
  assert.equal((await call(t, 'POST', '/api/admin/securite/actions/confirmer', { token: p.json.token })).status, 400);
  assert.equal((await call(t, 'POST', '/api/admin/securite/actions/confirmer', { token: p.json.token, confirmer: 'oui' })).status, 400);
  assert.equal(await n(), 0);
  assert.equal((await call(t, 'POST', '/api/admin/securite/actions/confirmer', { token: 'inconnu', confirmer: true })).status, 400);
  const c = await call(t, 'POST', '/api/admin/securite/actions/confirmer', { token: p.json.token, confirmer: true });
  assert.equal(c.status, 200); assert.equal(await n(), 1);
  assert.equal((await call(t, 'POST', '/api/admin/securite/actions/confirmer', { token: p.json.token, confirmer: true })).status, 400, 'usage unique');
  sec.refreshBlocks(); assert.equal(await sec.isBlocked('203.0.113.7'), true);
  // Sa propre adresse : refusé.
  assert.equal((await call(t, 'POST', '/api/admin/securite/actions/preparer', { type: 'ip.bloquer', params: { ip: '127.0.0.1' } })).status, 400);
  // Journal en ajout seul + historique.
  const h = await call(t, 'GET', '/api/admin/securite/actions');
  assert.equal(h.json[0].type, 'ip.bloquer'); assert.equal(h.json[0].annulable, true); assert.equal(h.json[0].cible, '203.0.113.x');
  await assert.rejects(db.run('UPDATE security_action SET reason = ? WHERE id = ?', 'x', h.json[0].id));
  assert.ok(await db.get("SELECT id FROM platform_audit WHERE action = 'admin.securite.ip.bloquer'"));
  // Annulation (elle-même confirmée).
  const u = await call(t, 'POST', '/api/admin/securite/actions/preparer', { type: 'annuler', params: { action_id: h.json[0].id } });
  assert.equal((await call(t, 'POST', '/api/admin/securite/actions/confirmer', { token: u.json.token, confirmer: true })).status, 200);
  assert.equal(await sec.isBlocked('203.0.113.7'), false);
  const h2 = await call(t, 'GET', '/api/admin/securite/actions');
  assert.equal(h2.json.find((x) => x.id === h.json[0].id).annulee, true);
});

test('une IP bloquée ne peut plus appeler l’API', async () => {
  await db.run('INSERT INTO ip_block (ip, until_at) VALUES (?,?)', '127.0.0.1', new Date(Date.now() + 60e3).toISOString());
  sec.refreshBlocks();
  assert.equal((await call(null, 'GET', '/api/config')).status, 403);
  await db.run('UPDATE ip_block SET lifted_at = ? WHERE ip = ?', new Date().toISOString(), '127.0.0.1');
  sec.refreshBlocks();
  assert.equal((await call(null, 'GET', '/api/config')).status, 200);
});

test('action critique : nouveau code à 6 chiffres exigé (verrouiller un compte), puis déverrouillage', async () => {
  const t = await adminLogin();
  const a = (await alerts('force_brute_compte'))[0];
  const idx = JSON.parse(a.actions).findIndex((x) => x.type === 'compte.verrouiller');
  sent.length = 0;
  const p = await call(t, 'POST', '/api/admin/securite/actions/preparer', { alert_id: a.id, index: idx, reason: 'essais suspects' });
  assert.equal(p.status, 200); assert.equal(p.json.critique, true); assert.equal(p.json.canal, 'sms');
  const code = sent.pop().text.match(/code (\d{6})/)[1];
  const locked = async () => (await db.get("SELECT locked_at FROM person WHERE email = 'prof1@a.exemple.invalid'")).locked_at;
  assert.equal((await call(t, 'POST', '/api/admin/securite/actions/confirmer', { token: p.json.token, confirmer: true })).status, 401, 'sans code');
  assert.equal((await call(t, 'POST', '/api/admin/securite/actions/confirmer', { token: p.json.token, confirmer: true, code: code === '000000' ? '111111' : '000000' })).status, 401, 'code faux');
  assert.equal(await locked(), null);
  const c = await call(t, 'POST', '/api/admin/securite/actions/confirmer', { token: p.json.token, confirmer: true, code });
  assert.equal(c.status, 200, JSON.stringify(c.json)); assert.ok(await locked());
  assert.equal((await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: 'prof1@a.exemple.invalid', password: DEMO_PASSWORD })).status, 401, 'compte verrouillé');
  const row = await db.get("SELECT otp FROM security_action WHERE type = 'compte.verrouiller'"); assert.equal(Number(row.otp), 1);
  const u = await call(t, 'POST', '/api/admin/securite/actions/preparer', { type: 'compte.deverrouiller', params: { account: 'prof1@a.exemple.invalid' } });
  assert.equal(u.json.critique, false);
  assert.equal((await call(t, 'POST', '/api/admin/securite/actions/confirmer', { token: u.json.token, confirmer: true })).status, 200);
  assert.equal(await locked(), null);
  assert.equal((await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: 'prof1@a.exemple.invalid', password: DEMO_PASSWORD })).status, 200);
  // Les autres actions critiques exigent aussi un code.
  for (const [type, params] of [['compte.reinitialiser', { account: 'prof2@a.exemple.invalid' }], ['ecole.deconnecter', { school_id: ids.B.school }], ['ecole.suspendre', { school_id: ids.B.school }]]) {
    const q = await call(t, 'POST', '/api/admin/securite/actions/preparer', { type, params, reason: 'test du code' });
    assert.equal(q.json.critique, true, type);
    assert.equal((await call(t, 'POST', '/api/admin/securite/actions/confirmer', { token: q.json.token, confirmer: true, code: '' })).status, 401, type);
  }
  assert.equal((await db.get('SELECT status FROM school WHERE id = ?', ids.B.school)).status, 'active');
});

test('réinitialisation forcée et déconnexion : effets réels après confirmation', async () => {
  const t = await adminLogin();
  const tok = (await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: 'prof2@a.exemple.invalid', password: DEMO_PASSWORD })).json.token;
  sent.length = 0;
  const p = await call(t, 'POST', '/api/admin/securite/actions/preparer', { type: 'compte.reinitialiser', params: { account: 'prof2@a.exemple.invalid' } });
  const code = sent.pop().text.match(/code (\d{6})/)[1];
  assert.equal((await call(t, 'POST', '/api/admin/securite/actions/confirmer', { token: p.json.token, confirmer: true, code })).status, 200);
  assert.equal((await call(tok, 'GET', '/api/me')).status, 401, 'session fermée');
  assert.equal((await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: 'prof2@a.exemple.invalid', password: DEMO_PASSWORD })).status, 401, 'ancien mot de passe refusé');
});

test('marquer une alerte comme faux positif : confirmée, journalisée, non recréée, annulable', async () => {
  const t = await adminLogin();
  const a = (await alerts('pic_4xx'))[0];
  const p = await call(t, 'POST', '/api/admin/securite/actions/preparer', { type: 'alerte.faux_positif', alert_id: a.id });
  assert.equal((await db.get('SELECT status FROM security_alert WHERE id = ?', a.id)).status, 'ouverte');
  assert.equal((await call(t, 'POST', '/api/admin/securite/actions/confirmer', { token: p.json.token, confirmer: true })).status, 200);
  assert.equal((await db.get('SELECT status FROM security_alert WHERE id = ?', a.id)).status, 'faux_positif');
  await sec.analyse(opts());
  assert.equal((await alerts('pic_4xx')).length, 0, 'pas recréée pendant 7 jours');
  const list = await call(t, 'GET', '/api/admin/securite?statut=faux_positif');
  assert.ok(list.json.alertes.some((x) => x.id === a.id));
  assert.ok(list.json.alertes[0].actions.every((x) => x.params === undefined), 'paramètres réels gardés côté serveur');
});

test('interface : score, filtres, détail, analyse manuelle et questions guidées (sans IA externe)', async () => {
  const t = await adminLogin();
  const s = await call(t, 'GET', '/api/admin/securite');
  assert.equal(s.status, 200); assert.ok(s.json.score < 100); assert.equal(s.json.llm, false);
  const crit = await call(t, 'GET', '/api/admin/securite?gravite=critique');
  assert.ok(crit.json.alertes.length && crit.json.alertes.every((x) => x.gravite === 'critique'));
  const an = await call(t, 'POST', '/api/admin/securite/analyser', {});
  assert.equal(an.status, 200); assert.ok(an.json.at);
  const al = crit.json.alertes.find((x) => x.regle === 'pulverisation');
  const d = await call(t, 'GET', `/api/admin/securite/alertes/${al.id}`); assert.ok(d.json.preuves.length);
  const why = await call(t, 'GET', `/api/admin/securite/guide?alerte=${al.id}&q=pourquoi`);
  assert.equal(why.json.source, 'guide'); assert.match(why.json.reponse, /Le seuil est de 5 comptes/);
  const what = await call(t, 'GET', `/api/admin/securite/guide?alerte=${al.id}&q=quoi&lang=ht`);
  assert.match(what.json.reponse, /Kisa pou fè/);
  assert.match((await call(t, 'GET', '/api/admin/securite/guide?q=score')).json.reponse, /100/);
});

test('adaptateur NORIA_ASSISTANT_LLM : désactivé par défaut, jamais de données personnelles', () => {
  assert.equal(createLlm({}), null);
  assert.throws(() => createLlm({ NORIA_ASSISTANT_LLM: 'http', NORIA_ASSISTANT_LLM_URL: 'http://x' }), /https/);
  const r = redact({ rule: 'force_brute_compte', severity: 'critique', hits: 3, status: 'ouverte', evidence: '["eleve1@a.exemple.invalid"]', explain_fr: 'Élève fictif 1', title_fr: 'x' });
  assert.deepEqual(Object.keys(r).sort(), ['gravite', 'occurrences', 'regle', 'statut']);
  assert.doesNotMatch(JSON.stringify(r), /exemple|Élève/);
  assert.equal(scrub('Pourquoi eleve1@a.exemple.invalid depuis 203.0.113.5 au +509 0000 0101 ?'), 'Pourquoi [e-mail] depuis [ip] au [numéro] ?');
});

test('regroupement des notifications : au plus 1 message par règle toutes les 30 minutes', async () => {
  const d2 = await openTestDb(); await seed(d2);
  await createAdmin(d2, { email: 'admin2@noria.exemple.invalid', name: 'Admin', phone: '+50900000998', password: ADMIN_PW });
  const box = []; let clock = Date.now(); let hooks = 0;
  const nf = { adapter: () => ({ async send(m) { box.push(m); return {}; } }) };
  const realFetch = global.fetch;
  global.fetch = async (u) => { if (String(u).startsWith('https://hooks.exemple.invalid')) { hooks++; return { ok: true }; } return realFetch(u); };
  try {
    const s = createSecurity({ db: d2, env: { NODE_TEST_CONTEXT: '1', NORIA_ASSISTANT_WEBHOOK_URL: 'https://hooks.exemple.invalid/slack' }, notifier: nf, now: () => clock, log: () => {} });
    const o = { backups: () => ({ configure: false }), dbSize: async () => 1 };
    const spray = async (ip) => { for (let i = 0; i < 6; i++) await s.record({ kind: 'login.fail', ip, account: `c${i}@x.invalid` }); };
    await spray('203.0.113.1'); await s.analyse(o);
    assert.equal(box.length, 1); assert.equal(hooks, 1);
    clock += 10 * 60e3; await spray('203.0.113.2'); await s.analyse(o);
    assert.equal(box.length, 1, 'regroupé (10 min)'); assert.equal(hooks, 1);
    clock += 10 * 60e3; await spray('203.0.113.3'); await s.analyse(o);
    assert.equal(box.length, 1, 'regroupé (20 min)');
    clock += 11 * 60e3; await spray('203.0.113.4'); await s.analyse(o);
    assert.equal(box.length, 2, 'nouveau message après 30 min'); assert.equal(hooks, 2);
    assert.match(box[1].text, /\+2 alerte\(s\) regroupée\(s\)/);
    assert.equal((await d2.all("SELECT id FROM security_alert WHERE rule = 'pulverisation'")).length, 4, 'chaque alerte reste visible');
  } finally { global.fetch = realFetch; await d2.cleanup(); }
});
