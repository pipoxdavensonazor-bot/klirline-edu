'use strict';
// Adaptateurs d'envoi : Twilio, passerelle HTTP, Resend (faux serveurs HTTP locaux), SMTP (faux serveur local),
// console par défaut, erreurs de configuration ; invitations et récupération passent par l'adaptateur.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { createNotifier } = require('../src/notify');
const { openTestDb } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');

let fake, fakeBase; const hits = [];
before(async () => {
  fake = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
      hits.push({ method: req.method, url: req.url, headers: req.headers, body: b });
      if (req.url.includes('panne')) { res.writeHead(503, { 'content-type': 'application/json' }); return res.end('{"message":"indisponible"}'); }
      res.writeHead(201, { 'content-type': 'application/json' }); res.end(JSON.stringify({ sid: 'SM123', id: 'em_456' }));
    });
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  fakeBase = `http://127.0.0.1:${fake.address().port}`;
});
after(() => fake.close());

test('console par défaut (simulé)', async () => {
  const logs = []; const n = createNotifier({}, { log: (x) => logs.push(x) });
  assert.equal(n.sms.name, 'console'); assert.equal(n.email.name, 'console');
  assert.deepEqual(n.simulated, { sms: true, email: true });
});

test('configuration : fournisseur inconnu ou variables manquantes → erreur au démarrage', () => {
  assert.throws(() => createNotifier({ NORIA_SMS_PROVIDER: 'pigeon' }), /inconnu/);
  assert.throws(() => createNotifier({ NORIA_SMS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'AC1' }), /TWILIO_AUTH_TOKEN/);
  assert.throws(() => createNotifier({ NORIA_SMS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'x' }), /TWILIO_FROM/);
  assert.throws(() => createNotifier({ NORIA_SMS_PROVIDER: 'http', NORIA_SMS_HTTP_URL: 'http://passerelle.exemple.invalid/sms' }), /https/);
  assert.throws(() => createNotifier({ NORIA_EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k' }), /NORIA_EMAIL_FROM/);
  assert.throws(() => createNotifier({ NORIA_EMAIL_PROVIDER: 'smtp', NORIA_EMAIL_FROM: 'a@b' }), /NORIA_SMTP_HOST/);
});

test('Twilio : POST formulaire, authentification Basic, expéditeur', async () => {
  const n = createNotifier({ NORIA_SMS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'ACfictif', TWILIO_AUTH_TOKEN: 'secret-fictif', TWILIO_FROM: '+15550000000', TWILIO_API_BASE: fakeBase });
  const r = await n.sms.send({ to: '+50900000103', text: 'NORIA : votre code est 123456.' });
  assert.equal(r.id, 'SM123');
  const h = hits.pop();
  assert.equal(h.url, '/2010-04-01/Accounts/ACfictif/Messages.json');
  assert.equal(h.headers.authorization, `Basic ${Buffer.from('ACfictif:secret-fictif').toString('base64')}`);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(h.body)), { To: '+50900000103', Body: 'NORIA : votre code est 123456.', From: '+15550000000' });
});

test('passerelle HTTP générique : JSON, jeton Bearer ; erreur HTTP remontée', async () => {
  const n = createNotifier({ NORIA_SMS_PROVIDER: 'http', NORIA_SMS_HTTP_URL: `${fakeBase}/sms`, NORIA_SMS_HTTP_TOKEN: 'jeton-fictif', NORIA_SMS_SENDER: 'ECOLE' });
  await n.sms.send({ to: '+50900000103', text: 'Bonjou' });
  const h = hits.pop();
  assert.equal(h.headers.authorization, 'Bearer jeton-fictif');
  assert.deepEqual(JSON.parse(h.body), { to: '+50900000103', message: 'Bonjou', sender: 'ECOLE' });
  const ko = createNotifier({ NORIA_SMS_PROVIDER: 'http', NORIA_SMS_HTTP_URL: `${fakeBase}/panne` });
  await assert.rejects(ko.sms.send({ to: '+509', text: 'x' }), /HTTP 503 : indisponible/);
});

test('Resend : JSON, clé API', async () => {
  const n = createNotifier({ NORIA_EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_fictif', NORIA_EMAIL_FROM: 'NORIA <noria@exemple.invalid>', RESEND_API_BASE: fakeBase });
  assert.equal((await n.email.send({ to: 'parent@exemple.invalid', subject: 'Sujet', text: 'Corps' })).id, 'em_456');
  const h = hits.pop();
  assert.equal(h.url, '/emails'); assert.equal(h.headers.authorization, 'Bearer re_fictif');
  assert.deepEqual(JSON.parse(h.body), { from: 'NORIA <noria@exemple.invalid>', to: ['parent@exemple.invalid'], subject: 'Sujet', text: 'Corps' });
});

// Faux serveur SMTP : EHLO, AUTH PLAIN, MAIL, RCPT, DATA ; garde la conversation.
function fakeSmtp() {
  const log = []; let data = null;
  const srv = net.createServer((s) => {
    let buf = ''; let inData = false;
    s.write('220 faux.smtp ESMTP\r\n');
    s.on('data', (d) => {
      buf += d.toString();
      if (inData) { const i = buf.indexOf('\r\n.\r\n'); if (i < 0) return; data = buf.slice(0, i); buf = buf.slice(i + 5); inData = false; s.write('250 OK file d’attente\r\n'); }
      let i; while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2); log.push(line);
        if (/^EHLO/.test(line)) s.write('250-faux.smtp\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n');
        else if (/^AUTH PLAIN/.test(line)) s.write('235 OK\r\n');
        else if (/^(MAIL|RCPT)/.test(line)) s.write('250 OK\r\n');
        else if (line === 'DATA') { s.write('354 suite\r\n'); inData = true; const j = buf.indexOf('\r\n.\r\n'); if (j >= 0) { data = buf.slice(0, j); buf = buf.slice(j + 5); inData = false; s.write('250 OK\r\n'); } }
        else if (line === 'QUIT') { s.end('221 bye\r\n'); }
      }
    });
  });
  return { srv, log, data: () => data };
}

test('SMTP : AUTH PLAIN, enveloppe, sujet et corps UTF-8', async () => {
  const f = fakeSmtp(); await new Promise((r) => f.srv.listen(0, '127.0.0.1', r));
  const n = createNotifier({ NORIA_EMAIL_PROVIDER: 'smtp', NORIA_SMTP_HOST: '127.0.0.1', NORIA_SMTP_PORT: String(f.srv.address().port), NORIA_SMTP_STARTTLS: '0',
    NORIA_SMTP_USER: 'noria', NORIA_SMTP_PASS: 'mdp-fictif', NORIA_EMAIL_FROM: 'NORIA <noria@exemple.invalid>' });
  const r = await n.email.send({ to: 'parent@exemple.invalid', subject: 'Kòd koneksyon', text: 'Bonjou, kòd ou se 123456.' });
  f.srv.close();
  assert.match(r.id, /@noria>$/);
  assert.ok(f.log.includes(`AUTH PLAIN ${Buffer.from('\0noria\0mdp-fictif').toString('base64')}`));
  assert.ok(f.log.includes('MAIL FROM:<noria@exemple.invalid>')); assert.ok(f.log.includes('RCPT TO:<parent@exemple.invalid>'));
  const d = f.data();
  assert.match(d, new RegExp(`Subject: =\\?UTF-8\\?B\\?${Buffer.from('Kòd koneksyon').toString('base64').replace(/[+=]/g, '\\$&')}\\?=`));
  const body = d.split('\r\n\r\n')[1].replace(/\r\n/g, '');
  assert.equal(Buffer.from(body, 'base64').toString('utf8'), 'Bonjou, kòd ou se 123456.');
});

test('invitation et récupération envoyées par l’adaptateur, lien absolu, FR et kreyòl', async () => {
  const db = await openTestDb(); await seed(db); const sent = [];
  const notifier = { adapter: (channel) => ({ name: 'test', simulated: false, async send(m) { sent.push({ channel, ...m }); return { id: 'x' }; } }) };
  const server = createServer(db, { notifier, publicUrl: 'https://noria.exemple.invalid', rateLimit: { max: 1000 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, token) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json() }));
  try {
    const tok = (await post('/api/login', { school: 'ecole-a', identifier: 'direction@a.exemple.invalid', password: DEMO_PASSWORD })).json.token;
    const inv = await post('/api/invitations', { phone: '+50900000777', display_name: 'Prof fictif', role: 'enseignant', lang: 'ht' }, tok);
    assert.equal(inv.status, 200); assert.equal(inv.json.envoi, 'envoyé'); assert.equal(inv.json.channel, 'sms');
    const sms = sent.pop();
    assert.match(sms.text, /^NORIA : École fictive A envite w\. Aktive kont ou \(72 è\) : https:\/\/noria\.exemple\.invalid\/#invitation=[\w-]{40,}$/);
    assert.ok(sms.text.replace(/https:\S+/, '').length <= 100, 'SMS court hors lien');
    const ob = await db.get("SELECT body, status, lang FROM outbox WHERE kind = 'invitation' ORDER BY id DESC LIMIT 1");
    assert.ok(!/#invitation=[\w-]{20}/.test(ob.body)); assert.equal(ob.status, 'envoye'); assert.equal(ob.lang, 'ht');
    await post('/api/invitations', { email: 'nouveau@exemple.invalid', display_name: 'Compta fictive', role: 'comptabilite' }, tok);
    const mail = sent.pop(); assert.equal(mail.channel, 'email'); assert.match(mail.subject, /^Invitation NORIA — École fictive A$/); assert.match(mail.text, /Bonjour Compta fictive/);
    assert.equal((await post('/api/recovery/request', { school: 'ecole-a', identifier: '+50900000103' })).status, 200);
    const rec = sent.pop(); assert.equal(rec.channel, 'sms'); assert.match(rec.text, /^NORIA : nouveau mot de passe \(60 min\) : https:\/\/noria\.exemple\.invalid\/#recuperation=/);
  } finally { server.close(); await db.cleanup(); }
});
