'use strict';
// Bloc 7 : adresses e-mail professionnelles des élèves. Désactivées par défaut (404 partout), construction des
// adresses (accents, collisions, préfixe, sous-domaine), création en masse avec aperçu et empreinte, consentement des
// mineurs, vérification de la destination (code et lien), changement de destination, suspension, fin de scolarité,
// règle de transfert, journal en ajout seul, documents, webhook entrant signé, adaptateurs sans réseau (faux fetch),
// règle de l'assistant sécurité, sauvegarde, cloisonnement (PostgreSQL).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { openTestDb, PG } = require('./helpers');
const { createServer } = require('../src/app');
const { seed, seedMulti, DEMO_PASSWORD } = require('../src/seed');
const { createSecurity } = require('../src/securite');
const E = require('../src/emails-eleves');
const F = require('../src/email-fournisseurs');
const B = require('../src/backup');
const { badgePdf, transcriptPdf } = require('../src/pdf-bloc2');
const { render: msg } = require('../src/messages');

const DOM = 'eleve.noria.exemple';
const env = { NORIA_EMAIL_ELEVES: '1', NORIA_EMAIL_DOMAINE: DOM, NORIA_TZ: 'America/Port-au-Prince' };
let db, server, off, base, offBase, ids, sec;
const netCalls = [];
const realFetch = globalThis.fetch;
async function call(token, method, p, body, headers = {}, b = base) {
  const res = await realFetch(b + p, { method, redirect: 'manual', headers: { 'content-type': 'application/json', 'x-noria': '1', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  const buf = Buffer.from(await res.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch {}
  return { status: res.status, json, text: buf.toString('utf8'), headers: res.headers };
}
const tokens = {};
async function tok(k, who) {
  const key = `${k}:${who}`;
  if (!tokens[key]) {
    const r = await call(null, 'POST', '/api/login', { school: `ecole-${k}`, identifier: `${who}@${k}.exemple.invalid`, password: DEMO_PASSWORD });
    assert.equal(r.status, 200, `connexion ${who}`); tokens[key] = r.json.token;
  }
  return tokens[key];
}
const lastMail = (to) => [...F.SIMULE.sent].reverse().find((m) => m.to === to);
const codeOf = (m) => m.text.match(/Code : (\d{6})/)[1];
const linkOf = (m) => m.text.match(/\/email\/verifier\?t=([A-Za-z0-9_-]+)/)[1];
const myAddr = async (k, who) => (await call(await tok(k, who), 'GET', '/api/emails/moi')).json.adresses;

before(async () => {
  db = await openTestDb(); ids = await seedMulti(db, await seed(db));
  // Signature du directeur (exigée pour approuver un transfert à l'origine).
  const sig = fs.readFileSync(path.join(__dirname, 'fixtures', 'signature-fictive.jpg')).toString('base64');
  for (const k of ['A', 'B']) await db.run('UPDATE school SET signature = ?, signature_name = ? WHERE id = ?', sig, `Direction fictive ${k}`, ids[k].school);
  const notifier = { adapter: () => ({ name: 'test', simulated: false, async send() { return { id: 'x' }; } }) };
  sec = createSecurity({ db, env: { NORIA_TZ: env.NORIA_TZ }, notifier, log: () => {} });
  // Aucun appel réseau : tout fetch global pendant les tests est refusé et compté.
  globalThis.fetch = async (u) => { netCalls.push(String(u)); throw new Error('réseau interdit pendant les tests'); };
  server = createServer(db, { notifier, env, security: sec, rateLimit: { max: 1000 }, publicUrl: 'https://noria.exemple.invalid' });
  off = createServer(db, { notifier, env: { NORIA_EMAIL_DOMAINE: DOM }, security: false, rateLimit: { max: 1000 } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); await new Promise((r) => off.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`; offBase = `http://127.0.0.1:${off.address().port}`;
});
after(async () => { globalThis.fetch = realFetch; server.close(); off.close(); await db.cleanup(); assert.deepEqual(netCalls, [], 'aucun appel réseau'); });

test('désactivé par défaut : routes, page de vérification et scripts en 404, rien dans /api/config', async () => {
  const offTok = (await call(null, 'POST', '/api/login', { school: 'ecole-a', identifier: 'direction@a.exemple.invalid', password: DEMO_PASSWORD }, {}, offBase)).json.token;
  for (const p of ['/api/emails', '/api/emails/moi', '/api/emails/apercu']) assert.equal((await call(offTok, p.endsWith('apercu') ? 'POST' : 'GET', p, p.endsWith('apercu') ? { tout: true } : null, {}, offBase)).status, 404, p);
  assert.equal((await call(null, 'POST', '/api/emails/entrant', { to: 'x@y.z' }, {}, offBase)).status, 404);
  assert.equal((await call(null, 'GET', '/email/verifier?t=abc', null, { accept: 'text/html' }, offBase)).status, 404);
  for (const f of ['/src/emails-eleves.js', '/src/mon-email.js', '/src/emails-eleves.css', '/src/email-verif.css']) assert.equal((await call(null, 'GET', f, null, {}, offBase)).status, 404, f);
  assert.equal((await call(null, 'GET', '/api/config', null, {}, offBase)).json.emailsEleves, undefined);
  assert.equal((await call(null, 'GET', '/api/config')).json.emailsEleves, true);
  assert.equal((await call(null, 'GET', '/src/mon-email.js')).status, 200);
});

test('construction : minuscules sans accents, préfixe, sous-domaine, masquage, âge', () => {
  assert.equal(E.slug('ÉLÈVE Kòd 01'), 'eleve-kod-01');
  assert.equal(E.slug('--A__b--'), 'a-b');
  assert.equal(E.localFor('JPD140101-CSL', { prefix: 'lex' }), 'lex.jpd140101-csl');
  assert.equal(E.domainFor({ env: { NORIA_EMAIL_DOMAINE: 'Eleve.Noria.HT' } }, { subdomain: 'csl' }), 'csl.eleve.noria.ht');
  assert.equal(E.domainFor({ env: { NORIA_EMAIL_DOMAINE: 'pas un domaine' } }, null), null);
  assert.equal(E.mask('ana.perso@exemple.invalid'), 'a***o@exemple.invalid');
  assert.equal(E.minorOf('2014-01-01', { env }), 1); assert.equal(E.minorOf('2000-01-01', { env }), 0); assert.equal(E.minorOf(null, { env }), 1);
});

test('création en masse : aperçu, collisions, empreinte, droits', async () => {
  const dA = await tok('a', 'direction'), sA = await tok('a', 'secretariat');
  // Adresse déjà prise ailleurs (autre école) : la proposition reçoit un suffixe.
  const bSt = await db.get('SELECT id, code FROM student WHERE school_id = ? ORDER BY id LIMIT 1', ids.B.school);
  await db.insert("INSERT INTO student_email (school_id, student_id, student_code, address, local_part, status, minor, created_by, created_at, updated_at) VALUES (?,?,?,?,?,'desactivee',1,?,?,?)",
    ids.B.school, bSt.id, bSt.code, `a-002@${DOM}`, 'a-002', ids.B.users.direction, new Date().toISOString(), new Date().toISOString());
  assert.equal((await call(sA, 'POST', '/api/emails/apercu', { tout: true })).status, 403, 'secrétariat : lecture seule');
  assert.equal((await call(dA, 'POST', '/api/emails/apercu', {})).status, 400);
  const p = await call(dA, 'POST', '/api/emails/apercu', { tout: true });
  assert.equal(p.status, 200, p.text);
  const byCode = Object.fromEntries(p.json.propositions.map((x) => [x.code, x]));
  assert.equal(byCode['A-001'].adresse, `a-001@${DOM}`); assert.equal(byCode['A-001'].mineur, true);
  assert.equal(byCode['A-002'].adresse, `a-002-2@${DOM}`); assert.equal(byCode['A-002'].collision, true);
  assert.equal((await call(dA, 'POST', '/api/emails/creer', { tout: true, empreinte: p.json.empreinte })).status, 400, 'confirmation obligatoire');
  assert.equal((await call(dA, 'POST', '/api/emails/creer', { tout: true, empreinte: 'faux', confirmer: true })).status, 409, 'empreinte périmée');
  const c = await call(dA, 'POST', '/api/emails/creer', { tout: true, empreinte: p.json.empreinte, confirmer: true });
  assert.equal(c.status, 200, c.text); assert.equal(c.json.creees, p.json.propositions.length);
  assert.equal((await call(dA, 'POST', '/api/emails/apercu', { tout: true })).json.propositions.length, 0, 'plus rien à créer');
  const list = await call(sA, 'GET', '/api/emails');
  assert.equal(list.status, 200); assert.equal(list.json.ecriture, false);
  assert.ok(list.json.adresses.every((a) => a.statut === 'en_attente'));
  // Domaine absent : création refusée.
  const saved = env.NORIA_EMAIL_DOMAINE; env.NORIA_EMAIL_DOMAINE = '';
  try { assert.equal((await call(dA, 'POST', '/api/emails/apercu', { tout: true })).status, 409); } finally { env.NORIA_EMAIL_DOMAINE = saved; }
  // Réglages : sous-domaine et préfixe validés, direction seulement.
  assert.equal((await call(sA, 'PUT', '/api/emails/reglages', { prefixe: 'lex' })).status, 403);
  assert.equal((await call(dA, 'PUT', '/api/emails/reglages', { sous_domaine: 'x' })).status, 400);
});

test('mineur : destination vérifiée par code, puis accord parental → active ; destination masquée pour la direction', async () => {
  const e1 = await tok('a', 'eleve1'), p1 = await tok('a', 'parent1'), dA = await tok('a', 'direction');
  const [ana] = await myAddr('a', 'eleve1');
  assert.equal(ana.adresse, `a-001@${DOM}`); assert.equal(ana.mineur, true); assert.equal(ana.statut, 'en_attente');
  assert.equal((await call(e1, 'POST', `/api/emails/${ana.id}/destination`, { email: 'pas-une-adresse' })).status, 400);
  assert.equal((await call(e1, 'POST', `/api/emails/${ana.id}/destination`, { email: `x@${DOM}` })).status, 400, 'pas une adresse NORIA');
  const d = await call(e1, 'POST', `/api/emails/${ana.id}/destination`, { email: 'Ana.Perso@exemple.invalid' });
  assert.equal(d.status, 200, d.text); assert.equal(d.json.envoi, 'envoye'); assert.equal(d.json.destination, 'a***o@exemple.invalid');
  const m = lastMail('ana.perso@exemple.invalid'); assert.ok(m, 'code envoyé'); assert.match(m.text, /Kòd/); assert.match(m.text, /https:\/\/noria\.exemple\.invalid\/email\/verifier\?t=/);
  const bad = codeOf(m) === '000000' ? '111111' : '000000';
  assert.equal((await call(e1, 'POST', `/api/emails/${ana.id}/destination/code`, { code: bad })).status, 400);
  const ok = await call(e1, 'POST', `/api/emails/${ana.id}/destination/code`, { code: codeOf(m) });
  assert.equal(ok.status, 200, ok.text); assert.equal(ok.json.statut, 'en_attente', 'mineur sans accord : rien ne transfère');
  assert.equal(F.SIMULE.routes.has(ana.adresse), false);
  // L'élève ne peut pas consentir à la place du parent ; le parent lié, oui.
  assert.equal((await call(e1, 'POST', `/api/emails/${ana.id}/consentement`, { accord: true })).status, 403);
  const c = await call(p1, 'POST', `/api/emails/${ana.id}/consentement`, { accord: true });
  assert.equal(c.status, 200, c.text); assert.equal(c.json.statut, 'active');
  assert.equal(F.SIMULE.routes.get(ana.adresse), 'ana.perso@exemple.invalid');
  const list = await call(dA, 'GET', '/api/emails');
  const row = list.json.adresses.find((a) => a.id === ana.id);
  assert.equal(row.destination.email, 'a***o@exemple.invalid'); assert.ok(!list.text.includes('ana.perso'), 'jamais en clair pour la direction');
  assert.equal(row.fournisseur, 'simule');
});

test('changement de destination par lien (bouton POST), ancienne destination prévenue ; accès refusé aux autres', async () => {
  const p1 = await tok('a', 'parent1'), p2 = await tok('a', 'parent2');
  const [ana] = await myAddr('a', 'parent1');
  assert.equal(ana.peut_consentir, true); assert.equal(ana.destination.email, 'ana.perso@exemple.invalid');
  assert.equal((await call(p2, 'POST', `/api/emails/${ana.id}/destination`, { email: 'intrus@exemple.invalid' })).status, 403, 'parent non lié');
  assert.equal((await call(await tok('b', 'parent1'), 'POST', `/api/emails/${ana.id}/destination`, { email: 'intrus@exemple.invalid' })).status, 404, 'autre école');
  const d = await call(p1, 'POST', `/api/emails/${ana.id}/destination`, { email: 'parent1.perso@exemple.invalid', proprietaire: 'parent' });
  assert.equal(d.status, 200, d.text);
  const token = linkOf(lastMail('parent1.perso@exemple.invalid'));
  const g = await call(null, 'GET', `/email/verifier?t=${token}`, null, { accept: 'text/html' });
  assert.equal(g.status, 200); assert.match(g.text, /<form method="post"/); assert.match(g.headers.get('content-security-policy'), /default-src 'none'/);
  assert.ok(!g.text.includes('<script'), 'aucun script');
  assert.equal(F.SIMULE.routes.get(ana.adresse), 'ana.perso@exemple.invalid', 'un GET (robot de messagerie) ne valide rien');
  const p = await call(null, 'POST', '/email/verifier', `t=${token}`, { 'content-type': 'application/x-www-form-urlencoded' });
  assert.equal(p.status, 200); assert.match(p.text, /Adresse vérifiée/);
  assert.equal(F.SIMULE.routes.get(ana.adresse), 'parent1.perso@exemple.invalid');
  assert.match(lastMail('ana.perso@exemple.invalid').subject, /destination modifiée/, 'ancienne destination prévenue');
  assert.match((await call(null, 'GET', `/email/verifier?t=${token}`, null, { accept: 'text/html' })).text, /déjà vérifiée/);
  assert.equal((await call(null, 'GET', '/email/verifier?t=inconnu-inconnu-inconnu-inconnu', null, { accept: 'text/html' })).status, 410);
  const [after] = await myAddr('a', 'parent1');
  assert.equal(after.destination.proprietaire, 'parent'); assert.equal(after.statut, 'active');
});

test('suspension et reprise (direction seulement), journal complet et en ajout seul, adresse figée', async () => {
  const dA = await tok('a', 'direction'), sA = await tok('a', 'secretariat');
  const [ana] = await myAddr('a', 'eleve1');
  assert.equal((await call(sA, 'POST', `/api/emails/${ana.id}/suspendre`, { motif: 'x' })).status, 403);
  assert.equal((await call(dA, 'POST', `/api/emails/${ana.id}/suspendre`, {})).status, 400, 'motif obligatoire');
  const s = await call(dA, 'POST', `/api/emails/${ana.id}/suspendre`, { motif: 'Signalement fictif' });
  assert.equal(s.json.statut, 'suspendue'); assert.equal(F.SIMULE.routes.has(ana.adresse), false, 'plus de transfert');
  assert.equal(await E.activeAddress(db, { env }, ids.A.school, ana.student_id), null);
  const r = await call(dA, 'POST', `/api/emails/${ana.id}/reprendre`, {});
  assert.equal(r.json.statut, 'active', 'accord et destination conservés'); assert.ok(F.SIMULE.routes.has(ana.adresse));
  const j = await call(sA, 'GET', `/api/emails/${ana.id}/journal`);
  const kinds = j.json.evenements.map((e) => e.kind);
  for (const k of ['creation', 'destination_demandee', 'destination_verifiee', 'consentement', 'activation', 'suspension', 'reprise']) assert.ok(kinds.includes(k), k);
  assert.ok(!j.text.includes('perso@'), 'journal : destinations masquées');
  await assert.rejects(db.run("UPDATE student_email_event SET detail = 'x'"), /ajout seul/);
  await assert.rejects(db.run('DELETE FROM student_email_event'), /ajout seul/);
  await assert.rejects(db.run('DELETE FROM student_email WHERE id = ?', ana.id), /suppression interdite/);
  await assert.rejects(db.run("UPDATE student_email SET address = 'autre@x.y' WHERE id = ?", ana.id), /lecture seule/);
  const audit = await db.all("SELECT action FROM audit_log WHERE action LIKE 'emails.%' AND school_id = ?", ids.A.school);
  assert.ok(audit.some((a) => a.action === 'emails.creer') && audit.some((a) => a.action === 'emails.suspendre'));
});

test('documents officiels : badge, relevé et invitation montrent l’adresse active seulement', async () => {
  const [ana] = await myAddr('a', 'eleve1');
  const addr = await E.activeAddress(db, { env }, ids.A.school, ana.student_id);
  assert.equal(addr, `a-001@${DOM}`);
  assert.equal(await E.activeAddress(db, { env: {} }, ids.A.school, ana.student_id), null, 'fonction désactivée : rien');
  const text = (buf) => { const s = buf.toString('latin1'); const out = []; const re = /stream\r?\n/g; let m;
    while ((m = re.exec(s))) { const end = s.indexOf('endstream', m.index); try { out.push(zlib.inflateSync(Buffer.from(s.slice(m.index + m[0].length, end), 'latin1')).toString('latin1')); } catch {} }
    return out.join('\n'); };
  const school = { name: 'École fictive', initials: 'EF' };
  const badge = badgePdf({ school, first_name: 'Ana', last_name: 'Fictive', class_name: '6e', code: 'A-001', year: '2026-2027', expires_on: '2027-07-31', status: 'valide', url: 'https://x.invalid/#v', email: addr });
  assert.ok(text(badge).includes('a-001@'), 'badge');
  assert.ok(!text(badgePdf({ school, first_name: 'Ana', last_name: 'F', code: 'A-001', year: 'y', expires_on: 'z', url: 'u' })).includes('@'), 'sans adresse');
  const inv = msg('invitation', 'fr', { school: 'École', name: 'Ana', hours: 72, link: 'https://x.invalid/#i', proEmail: addr });
  assert.match(inv.text, /a-001@eleve/); assert.match(msg('invitation', 'ht', { school: 'É', name: 'A', hours: 72, link: 'l', proEmail: addr }).text, /Adrès imel NORIA/);
  assert.doesNotMatch(msg('invitation', 'fr', { school: 'É', name: 'A', hours: 72, link: 'l' }).text, /NORIA :/);
  // Badge réel par l'API : l'adresse active est passée au PDF.
  const dA = await tok('a', 'direction');
  assert.equal((await call(dA, 'POST', '/api/badges/generer', { student_id: ana.student_id })).status, 200);
  const bid = (await db.get("SELECT id FROM badge WHERE school_id = ? AND student_id = ? AND status = 'valide' ORDER BY id DESC LIMIT 1", ids.A.school, ana.student_id)).id;
  const res = await realFetch(`${base}/api/badges/${bid}/pdf`, { headers: { authorization: `Bearer ${dA}` } });
  assert.equal(res.status, 200); assert.ok(text(Buffer.from(await res.arrayBuffer())).includes('a-001@'), 'badge émis par l’API');
  const tr = transcriptPdf({ school, student: 'Ana F', studentCode: 'A-001', scope: 'periode', scopeLabel: 'T1', terms: [{ subjects: [] }], scale: 10, code: 'R-1', verifyUrl: 'u', keyId: 'k', issuedAt: new Date().toISOString(), issuer: 'D', studentEmail: addr });
  assert.ok(text(tr).includes('a-001@'), 'relevé');
});

test('fin de scolarité : délai, annulation, élève retiré programmé automatiquement, désactivation définitive', async () => {
  const dA = await tok('a', 'direction');
  const list = (await call(dA, 'GET', '/api/emails')).json.adresses;
  const bel = list.find((a) => a.code === 'A-002');
  const f = await call(dA, 'POST', `/api/emails/${bel.id}/fin`, { jours: 30 });
  assert.equal(f.status, 200, f.text); assert.ok(f.json.fin_prevue > new Date().toISOString().slice(0, 10));
  assert.equal((await call(dA, 'POST', `/api/emails/${bel.id}/fin`, { jours: 999 })).status, 400);
  assert.equal((await call(dA, 'POST', `/api/emails/${bel.id}/annuler-fin`, {})).json.fin_prevue, null);
  // Élève retiré : la consultation programme la fin (délai par défaut 90 jours).
  await db.run("UPDATE enrollment SET status = 'retire' WHERE school_id = ? AND student_id = ?", ids.A.school, bel.student_id);
  const after = (await call(dA, 'GET', '/api/emails')).json.adresses.find((a) => a.id === bel.id);
  assert.ok(after.fin_prevue, 'fin programmée'); assert.match(after.motif, /retiré/);
  await db.run("UPDATE student_email SET ends_on = '2020-01-01' WHERE id = ?", bel.id);
  const gone = (await call(dA, 'GET', '/api/emails')).json.adresses.find((a) => a.id === bel.id);
  assert.equal(gone.statut, 'desactivee');
  assert.equal((await call(dA, 'POST', `/api/emails/${bel.id}/reprendre`, {})).status, 409);
  await assert.rejects(db.run("UPDATE student_email SET status = 'active' WHERE id = ?", bel.id), /lecture seule/);
  await db.run("UPDATE enrollment SET status = 'actif' WHERE school_id = ? AND student_id = ?", ids.A.school, bel.student_id);
  // Une nouvelle adresse ne réutilise jamais l'ancienne.
  const p = await call(dA, 'POST', '/api/emails/apercu', { tout: true });
  const x = p.json.propositions.find((y) => y.code === 'A-002');
  assert.ok(x && x.adresse !== bel.adresse, 'adresse jamais réattribuée');
});

test('transfert : l’adresse suit l’élève sans préfixe ; avec préfixe, redirection temporaire puis nouvelle adresse', async () => {
  const dA = await tok('a', 'direction'), sA = await tok('a', 'secretariat'), dB = await tok('b', 'direction');
  // École B : adresses sans préfixe.
  const p = await call(dB, 'POST', '/api/emails/apercu', { tout: true });
  assert.equal((await call(dB, 'POST', '/api/emails/creer', { tout: true, empreinte: p.json.empreinte, confirmer: true })).status, 200);
  const transfer = async (code) => {
    const c = await call(sA, 'POST', '/api/transferts', { code, birth_date: '2014-01-01', consentement: { mode: 'case', parent: 'Parent fictif B', accord: true } });
    assert.equal(c.status, 200, c.text);
    const a = await call(dB, 'POST', `/api/transferts/${c.json.id}/approuver`, {});
    assert.equal(a.json.statut, 'transfere', a.text);
  };
  const b2 = await db.get("SELECT * FROM student_email WHERE school_id = ? AND student_code = 'B-002' AND status <> 'desactivee'", ids.B.school);
  await transfer('B-002');
  const moved = await db.get('SELECT * FROM student_email WHERE id = ?', b2.id);
  assert.equal(Number(moved.school_id), Number(ids.A.school), 'adresse partie avec l’élève'); assert.equal(moved.address, `b-002@${DOM}`);
  assert.ok((await call(dA, 'GET', '/api/emails')).json.adresses.some((a) => a.id === b2.id));
  assert.ok(!(await call(dB, 'GET', '/api/emails')).json.adresses.some((a) => a.id === b2.id), 'l’école d’origine ne la voit plus');
  // École A avec préfixe : l'adresse de B-001 reste redirigée, A crée une nouvelle adresse préfixée.
  assert.equal((await call(dA, 'PUT', '/api/emails/reglages', { prefixe: 'lex' })).status, 200);
  const b1 = await db.get("SELECT * FROM student_email WHERE school_id = ? AND student_code = 'B-001' AND status <> 'desactivee'", ids.B.school);
  await transfer('B-001');
  const red = await db.get('SELECT * FROM student_email WHERE id = ?', b1.id);
  assert.equal(red.status, 'redirigee'); assert.equal(Number(red.school_id), Number(ids.B.school)); assert.ok(red.ends_on);
  const pa = await call(dA, 'POST', '/api/emails/apercu', { tout: true });
  const nb1 = pa.json.propositions.find((x) => x.code === 'B-001');
  assert.equal(nb1.adresse, `lex.b-001@${DOM}`);
  assert.equal((await call(dA, 'POST', '/api/emails/creer', { tout: true, empreinte: pa.json.empreinte, confirmer: true })).status, 200);
  await call(dB, 'GET', '/api/emails'); // balayage : lien vers la nouvelle adresse
  const linked = await db.get('SELECT replaced_by FROM student_email WHERE id = ?', b1.id);
  const nid = (await db.get('SELECT id FROM student_email WHERE address = ?', `lex.b-001@${DOM}`)).id;
  assert.equal(Number(linked.replaced_by), Number(nid));
  await call(dA, 'PUT', '/api/emails/reglages', { prefixe: null });
});

test('webhook entrant (Email Worker) : signature HMAC, transfert vers la destination vérifiée ou rejet', async () => {
  const body = JSON.stringify({ to: `a-001@${DOM}` });
  assert.equal((await call(null, 'POST', '/api/emails/entrant', body)).status, 503, 'secret absent');
  env.NORIA_EMAIL_WEBHOOK_SECRET = 'secret-fictif-de-test-assez-long-0123456789';
  try {
    const sign = (b, ts = Math.floor(Date.now() / 1000)) => ({ 'x-noria-timestamp': String(ts), 'x-noria-signature': crypto.createHmac('sha256', env.NORIA_EMAIL_WEBHOOK_SECRET).update(`${ts}.${b}`).digest('hex') });
    assert.equal((await call(null, 'POST', '/api/emails/entrant', body, { 'x-noria-timestamp': String(Math.floor(Date.now() / 1000)), 'x-noria-signature': 'ab'.repeat(32) })).status, 401);
    assert.equal((await call(null, 'POST', '/api/emails/entrant', body, sign(body, Math.floor(Date.now() / 1000) - 3600))).status, 401, 'trop ancien');
    const ok = await call(null, 'POST', '/api/emails/entrant', body, sign(body));
    assert.deepEqual(ok.json, { action: 'forward', to: 'parent1.perso@exemple.invalid' });
    const unk = JSON.stringify({ to: `inconnu@${DOM}` });
    assert.equal((await call(null, 'POST', '/api/emails/entrant', unk, sign(unk))).json.action, 'reject');
    assert.equal(Number((await db.get('SELECT forwarded FROM student_email WHERE address = ?', `a-001@${DOM}`)).forwarded), 1);
  } finally { delete env.NORIA_EMAIL_WEBHOOK_SECRET; }
});

test('adaptateurs : Cloudflare, Forward Email, Mailgun avec un faux fetch (aucun réseau), erreurs sans blocage', async () => {
  const reqs = [];
  const fake = (reply) => async (url, init) => { reqs.push({ url, ...init }); const r = reply(url, init); return { ok: r.status < 400, status: r.status, json: async () => r.body }; };
  const cf = F.routing({ NORIA_EMAIL_FOURNISSEUR: 'cloudflare', NORIA_CF_API_TOKEN: 'jeton-fictif', NORIA_CF_ZONE_ID: 'zone1', NORIA_CF_ACCOUNT_ID: 'acct1' },
    { fetch: fake((u) => (u.includes('/addresses') ? { status: 409, body: { errors: [{ message: 'already exists' }] } } : { status: 200, body: { success: true, result: { id: 'regle-1' } } })) });
  const r = await cf.upsert({ address: `a@${DOM}`, destination: 'dest@exemple.invalid' });
  assert.equal(r.ref, 'regle-1');
  assert.equal(reqs[0].url, 'https://api.cloudflare.com/client/v4/accounts/acct1/email/routing/addresses');
  assert.equal(reqs[1].url, 'https://api.cloudflare.com/client/v4/zones/zone1/email/routing/rules'); assert.equal(reqs[1].method, 'POST');
  assert.equal(reqs[1].headers.authorization, 'Bearer jeton-fictif');
  const rule = JSON.parse(reqs[1].body);
  assert.deepEqual(rule.matchers, [{ type: 'literal', field: 'to', value: `a@${DOM}` }]); assert.deepEqual(rule.actions, [{ type: 'forward', value: ['dest@exemple.invalid'] }]);
  await cf.upsert({ address: `a@${DOM}`, destination: 'autre@exemple.invalid', ref: 'regle-1' });
  assert.equal(reqs.at(-1).method, 'PUT'); assert.match(reqs.at(-1).url, /rules\/regle-1$/);
  await cf.remove({ address: `a@${DOM}`, ref: 'regle-1' }); assert.equal(reqs.at(-1).method, 'DELETE');
  await assert.rejects(F.routing({ NORIA_EMAIL_FOURNISSEUR: 'cloudflare' }, { fetch: fake(() => ({ status: 200, body: {} })) }).upsert({ address: 'a@b.c', destination: 'd@e.f' }), /variable\(s\) manquante\(s\)/);
  reqs.length = 0;
  const fe = F.routing({ NORIA_EMAIL_FOURNISSEUR: 'forwardemail', NORIA_FE_API_TOKEN: 'fe-fictif' }, { fetch: fake(() => ({ status: 200, body: { id: 'alias-9' } })) });
  assert.equal((await fe.upsert({ address: `ana@${DOM}`, destination: 'd@exemple.invalid' })).ref, 'alias-9');
  assert.equal(reqs[0].url, `https://api.forwardemail.net/v1/domains/${DOM}/aliases`);
  assert.equal(reqs[0].headers.authorization, `Basic ${Buffer.from('fe-fictif:').toString('base64')}`);
  assert.deepEqual(JSON.parse(reqs[0].body).recipients, ['d@exemple.invalid']);
  reqs.length = 0;
  const mg = F.outbound({ NORIA_EMAIL_ENVOI: 'mailgun', NORIA_MAILGUN_API_KEY: 'cle-fictive', NORIA_MAILGUN_DOMAIN: 'mg.exemple.invalid', NORIA_MAILGUN_REGION: 'eu' }, { fetch: fake(() => ({ status: 200, body: { id: '<m1>' } })) });
  assert.equal((await mg.send({ from: 'NORIA <no-reply@x.invalid>', to: 'd@exemple.invalid', subject: 'S', text: 'T' })).id, '<m1>');
  assert.equal(reqs[0].url, 'https://api.eu.mailgun.net/v3/mg.exemple.invalid/messages');
  assert.equal(new URLSearchParams(reqs[0].body).get('to'), 'd@exemple.invalid');
  assert.equal(reqs[0].headers.authorization, `Basic ${Buffer.from('api:cle-fictive').toString('base64')}`);
  assert.throws(() => F.routing({ NORIA_EMAIL_FOURNISSEUR: 'inconnu' }), /fournisseur inconnu/);
  // Panne du fournisseur pendant une action : enregistrée (état « echec » + journal), l'action réussit quand même.
  const dA = await tok('a', 'direction');
  const [ana] = await myAddr('a', 'eleve1');
  env.NORIA_EMAIL_FOURNISSEUR = 'cloudflare';
  try {
    const s = await call(dA, 'POST', `/api/emails/${ana.id}/suspendre`, { motif: 'Panne simulée' });
    assert.equal(s.status, 200);
    const r2 = await call(dA, 'POST', `/api/emails/${ana.id}/reprendre`, {});
    assert.equal(r2.status, 200); assert.equal(r2.json.fournisseur, 'echec');
    assert.ok((await call(dA, 'GET', `/api/emails/${ana.id}/journal`)).json.evenements.some((e) => e.kind === 'fournisseur_echec'));
  } finally { delete env.NORIA_EMAIL_FOURNISSEUR; }
  assert.equal((await call(dA, 'POST', `/api/emails/${ana.id}/suspendre`, { motif: 'retour simulé' })).status, 200);
  assert.equal((await call(dA, 'POST', `/api/emails/${ana.id}/reprendre`, {})).json.fournisseur, 'simule');
});

test('limite de demandes de destination et règle « emails_eleves » de l’assistant sécurité', async () => {
  const e1 = await tok('a', 'eleve1');
  const [ana] = await myAddr('a', 'eleve1');
  let last;
  for (let i = 0; i < 6; i++) last = await call(e1, 'POST', `/api/emails/${ana.id}/destination`, { email: `essai${i}@exemple.invalid` });
  assert.equal(last.status, 429, 'cinq demandes par heure au plus');
  for (let i = 0; i < 4; i++) await call(e1, 'POST', `/api/emails/${ana.id}/destination/code`, { code: '999999' });
  await sec.flush(); await sec.analyse({ backups: () => [], dbSize: async () => 0 });
  const al = await db.get("SELECT * FROM security_alert WHERE rule = 'emails_eleves' AND status = 'ouverte'");
  assert.ok(al, 'alerte emails_eleves'); assert.match(al.explain_fr, /changements de destination/); assert.ok(al.explain_ht.length > 20);
});

test('sauvegarde : tables du bloc 7 sauvegardées et restaurées à l’identique', async () => {
  for (const t of ['school_email_settings', 'student_email_dest', 'student_email', 'student_email_event']) assert.ok(B.TABLES.includes(t), t);
  const data = B.fromFile(B.toFile(await B.dump(db)));
  for (const t of ['school_email_settings', 'student_email_dest', 'student_email', 'student_email_event']) assert.ok(data.tables[t].length > 0, `données dans ${t}`);
  const dst = await openTestDb();
  try {
    await B.restore(dst, data);
    const again = (await B.dump(dst)).tables;
    for (const t of ['school_email_settings', 'student_email_dest', 'student_email', 'student_email_event']) assert.deepEqual(again[t], data.tables[t], t);
    await assert.rejects(dst.run("UPDATE student_email_event SET detail = 'x'"), /ajout seul/);
  } finally { await dst.cleanup(); }
});

test('PostgreSQL : cloisonnement par école, aucune suppression, ministère sans accès', { skip: !PG }, async () => {
  const a = await db.asSchool(ids.A.school, (t) => t.all('SELECT school_id FROM student_email'));
  assert.ok(a.length > 0 && a.every((r) => Number(r.school_id) === Number(ids.A.school)));
  const bDest = await db.asSchool(ids.B.school, (t) => t.all('SELECT school_id FROM student_email_dest'));
  assert.ok(bDest.every((r) => Number(r.school_id) === Number(ids.B.school)));
  await assert.rejects(db.asSchool(ids.A.school, (t) => t.run('DELETE FROM student_email_dest')), /permission denied|suppression interdite/);
  await assert.rejects(db.asSchool(ids.A.school, (t) => t.run("UPDATE student_email_event SET detail = 'x'")), /permission denied|ajout seul/);
  await assert.rejects(db.asSchool(ids.A.school, (t) => t.run("INSERT INTO student_email_event (school_id, email_id, student_id, kind, actor) VALUES (?, 1, 1, 'x', 'systeme')", ids.B.school)), /row-level security/);
  await assert.rejects(db.asMinistry(1, (t) => t.all('SELECT * FROM student_email')), /permission denied/);
});
