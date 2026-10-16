'use strict';
// Envoi des SMS et e-mails derrière une interface d'adaptateurs : { name, send({ to, subject, text }) → { id } }.
// Choix par variables d'environnement (voir README) ; « console » (simulé) reste le défaut hors production.
// Aucune dépendance : Twilio, passerelle HTTP et Resend passent par fetch ; SMTP par un petit client node:net/tls.
const net = require('node:net');
const tls = require('node:tls');
const crypto = require('node:crypto');

const TIMEOUT = 10000;
async function postJson(url, { headers = {}, body, form }) {
  const ctl = AbortSignal.timeout(TIMEOUT);
  const res = await fetch(url, {
    method: 'POST', signal: ctl,
    headers: form ? { 'content-type': 'application/x-www-form-urlencoded', ...headers } : { 'content-type': 'application/json', ...headers },
    body: form ? new URLSearchParams(form).toString() : JSON.stringify(body),
  });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* corps non JSON */ }
  if (!res.ok) throw new Error(`HTTP ${res.status}${json && (json.message || json.error) ? ` : ${String(json.message || json.error).slice(0, 200)}` : ''}`);
  return json || {};
}

/* ---------- SMS ---------- */
function consoleAdapter(channel, log = console.log) {
  return { name: 'console', simulated: true, async send(m) { if (!process.env.NODE_TEST_CONTEXT) log(`[envoi simulé ${channel}] → ${m.to}${m.subject ? ` « ${m.subject} »` : ''} : ${m.text}`); return { id: `sim-${crypto.randomBytes(4).toString('hex')}` }; } };
}
function twilioAdapter(env) {
  const sid = need(env, 'TWILIO_ACCOUNT_SID'), token = need(env, 'TWILIO_AUTH_TOKEN');
  const from = env.TWILIO_FROM, service = env.TWILIO_MESSAGING_SERVICE_SID;
  if (!from && !service) throw new Error('TWILIO_FROM ou TWILIO_MESSAGING_SERVICE_SID obligatoire');
  const base = env.TWILIO_API_BASE || 'https://api.twilio.com';
  return {
    name: 'twilio',
    async send(m) {
      const form = { To: m.to, Body: m.text, ...(service ? { MessagingServiceSid: service } : { From: from }) };
      const r = await postJson(`${base}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
        { form, headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` } });
      return { id: r.sid || null };
    },
  };
}
// Passerelle HTTP générique : POST JSON { to, message, sender } vers NORIA_SMS_HTTP_URL, jeton Bearer facultatif.
function httpSmsAdapter(env) {
  const url = need(env, 'NORIA_SMS_HTTP_URL');
  if (!/^https:\/\//.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('NORIA_SMS_HTTP_URL doit être en https');
  return {
    name: 'http',
    async send(m) {
      const r = await postJson(url, { body: { to: m.to, message: m.text, sender: env.NORIA_SMS_SENDER || 'NORIA' },
        headers: env.NORIA_SMS_HTTP_TOKEN ? { authorization: `Bearer ${env.NORIA_SMS_HTTP_TOKEN}` } : {} });
      return { id: r.id || r.message_id || null };
    },
  };
}

/* ---------- E-mail ---------- */
function resendAdapter(env) {
  const key = need(env, 'RESEND_API_KEY'), from = need(env, 'NORIA_EMAIL_FROM');
  const base = env.RESEND_API_BASE || 'https://api.resend.com';
  return {
    name: 'resend',
    async send(m) {
      const r = await postJson(`${base}/emails`, { body: { from, to: [m.to], subject: m.subject, text: m.text }, headers: { authorization: `Bearer ${key}` } });
      return { id: r.id || null };
    },
  };
}
// Client SMTP minimal : EHLO, STARTTLS (port 587) ou TLS direct (465 / NORIA_SMTP_SECURE=1), AUTH PLAIN, un message texte.
function smtpAdapter(env) {
  const host = need(env, 'NORIA_SMTP_HOST'), from = need(env, 'NORIA_EMAIL_FROM');
  const port = Number(env.NORIA_SMTP_PORT || 587);
  const secure = env.NORIA_SMTP_SECURE === '1' || port === 465;
  const starttls = !secure && env.NORIA_SMTP_STARTTLS !== '0';
  const user = env.NORIA_SMTP_USER || '', pass = env.NORIA_SMTP_PASS || '';
  return { name: 'smtp', send: (m) => smtpSend({ host, port, secure, starttls, user, pass, from, insecureTls: env.NORIA_SMTP_TLS_INSECURE === '1' }, m) };
}
function smtpSend(o, m) {
  return new Promise((resolve, reject) => {
    let sock = o.secure ? tls.connect({ host: o.host, port: o.port, servername: o.host, rejectUnauthorized: !o.insecureTls }) : net.connect({ host: o.host, port: o.port });
    let buf = ''; let waiter = null; let done = false;
    const fail = (e) => { if (done) return; done = true; sock.destroy(); reject(e instanceof Error ? e : new Error(String(e))); };
    const timer = setTimeout(() => fail(new Error('SMTP : délai dépassé')), TIMEOUT * 2);
    const onData = (d) => {
      buf += d.toString('utf8');
      const lines = buf.split('\r\n'); const last = lines.length - 2;
      if (last < 0 || !/^\d{3} /.test(lines[last])) return; // réponse multiligne pas terminée
      const reply = buf; buf = '';
      if (waiter) { const w = waiter; waiter = null; w(reply); }
    };
    const attach = (s) => { s.on('data', onData); s.on('error', fail); };
    attach(sock);
    const read = () => new Promise((r) => { waiter = r; });
    const cmd = async (line, ok) => {
      if (line != null) sock.write(line + '\r\n');
      const rep = await read();
      if (!ok.includes(Number(rep.slice(0, 3)))) throw new Error(`SMTP ${rep.slice(0, 3)} après ${line == null ? 'connexion' : line.split(' ')[0]}`);
      return rep;
    };
    const clean = (s) => String(s).replace(/[\r\n]/g, ' ');
    (async () => {
      await cmd(null, [220]);
      let ehlo = await cmd('EHLO noria.local', [250]);
      if (o.starttls && /STARTTLS/i.test(ehlo)) {
        await cmd('STARTTLS', [220]);
        sock.removeListener('data', onData);
        sock = tls.connect({ socket: sock, servername: o.host, rejectUnauthorized: !o.insecureTls }); attach(sock);
        await new Promise((r, j) => { sock.once('secureConnect', r); sock.once('error', j); });
        ehlo = await cmd('EHLO noria.local', [250]);
      }
      if (o.user) await cmd(`AUTH PLAIN ${Buffer.from(`\0${o.user}\0${o.pass}`).toString('base64')}`, [235]);
      const addr = (s) => (String(s).match(/<([^>]+)>/) || [null, String(s)])[1];
      await cmd(`MAIL FROM:<${clean(addr(o.from))}>`, [250]);
      await cmd(`RCPT TO:<${clean(m.to)}>`, [250, 251]);
      await cmd('DATA', [354]);
      const id = `<${crypto.randomBytes(8).toString('hex')}@noria>`;
      const subj = `=?UTF-8?B?${Buffer.from(clean(m.subject || 'NORIA')).toString('base64')}?=`;
      const body = Buffer.from(m.text, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
      const msg = [`From: ${clean(o.from)}`, `To: <${clean(m.to)}>`, `Subject: ${subj}`, `Message-ID: ${id}`, `Date: ${new Date().toUTCString()}`,
        'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', body, '.'].join('\r\n');
      await cmd(msg, [250]);
      sock.write('QUIT\r\n'); done = true; clearTimeout(timer); sock.end();
      resolve({ id });
    })().catch((e) => { clearTimeout(timer); fail(e); });
  });
}

function need(env, k) { const v = env[k]; if (!v) throw new Error(`${k} manquant`); return v; }

const SMS = { console: (env, log) => consoleAdapter('sms', log), twilio: twilioAdapter, http: httpSmsAdapter };
const EMAIL = { console: (env, log) => consoleAdapter('email', log), smtp: smtpAdapter, resend: resendAdapter };

// Crée les deux adaptateurs. Une configuration incomplète fait échouer le démarrage (mieux qu'un envoi perdu).
function createNotifier(env = process.env, { log = console.log } = {}) {
  const sp = (env.NORIA_SMS_PROVIDER || 'console').toLowerCase(), ep = (env.NORIA_EMAIL_PROVIDER || 'console').toLowerCase();
  if (!SMS[sp]) throw new Error(`NORIA_SMS_PROVIDER inconnu : ${sp} (console, twilio, http)`);
  if (!EMAIL[ep]) throw new Error(`NORIA_EMAIL_PROVIDER inconnu : ${ep} (console, smtp, resend)`);
  const sms = SMS[sp](env, log), email = EMAIL[ep](env, log);
  return {
    sms, email,
    simulated: { sms: !!sms.simulated, email: !!email.simulated },
    adapter(channel) { return channel === 'sms' ? sms : email; },
  };
}

module.exports = { createNotifier, smtpSend, consoleAdapter };
