'use strict';
// Assistant sécurité du super-admin (bloc 3). Règle absolue : il détecte, explique et propose ; il n'agit jamais seul.
// Toute action passe par une demande (préparer) puis une confirmation explicite (confirmer), avec un nouveau code à
// 6 chiffres pour les actions critiques, et elle est inscrite au journal en ajout seul (security_action + platform_audit).
// Aucune dépendance : job périodique interne (setInterval), lecture os/statfs, certificat par node:crypto/tls.
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tls = require('node:tls');
const auth = require('./auth');
const otp = require('./otp');
const { HttpError } = require('./common');
const { G, QUOI, RISQUE, GENERAL, fill } = require('./securite-guide');
const { createLlm } = require('./assistant-llm');
const { createAlertes } = require('./alertes');

const MIN = 60e3, H = 3600e3;
const DEFAULTS = {
  bruteIpAttention: 10, bruteIpCritique: 30, bruteCompteAttention: 8, bruteCompteCritique: 20, pulverisationComptes: 5, bruteFenetreMin: 15,
  nouvelAppareilJours: 30,
  interEcolesRefus: 10, interEcolesAutres: 3, interFenetreMin: 15,
  pic4xx: 100, pic4xxFacteur: 3, pic5xxAttention: 5, pic5xxCritique: 20, picFenetreMin: 10,
  exportsHeure: 20, pdfHeure: 100, fichesHeure: 200, exportMasseHeure: 50, alertesFenetreMin: 30,
  recherchesEcoleHeure: 30, recherchesEchecsHeure: 10,
  propositionsHeure: 10, propositionsJour: 30,
  emailsCreationsHeure: 300, emailsDestinationsHeure: 10, emailsDestinationAdresseJour: 3, emailsEchecsHeure: 15,
  ministereConsultationsHeure: 150, ministereNominatifHeure: 25, ministereEcolesHeure: 40, ministereMinimum: 30, ministereFacteur: 4,
  sensiblesJour: 10, horsHeuresAttention: 3, heureMatin: 6, heureSoir: 20,
  latenceAttentionMs: 500, latenceCritiqueMs: 2000, disqueAttentionPct: 15, disqueCritiquePct: 5, memoireAttentionPct: 10, memoireCritiquePct: 3,
  baseMaxMo: 2048, sauvegardeMaxHeures: 26, certAttentionJours: 21, certCritiqueJours: 7, rapportAuditMaxJours: 7,
  notificationMin: 30, recapMin: 30, retentionJours: 35, reouvertureTraiteeMin: 60, fauxPositifJours: 7,
};
const SEV = { info: 1, attention: 2, critique: 3 };
const SENSIBLES = /^(evaluation\.rouvrir|payment\.cancel|user\.roles|grade\.correct)$/;
const iso = (ms) => new Date(ms).toISOString();

// Masquage partiel : IPv4 → 203.0.113.x ; IPv6 → trois premiers groupes ; compte → ad***@ex***.
function maskIp(ip) {
  const s = String(ip || '').replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return s.replace(/\.\d+$/, '.x');
  if (s.includes(':')) return s.split(':').slice(0, 3).join(':') + ':…';
  return s ? '…' : '—';
}
function maskAccount(a) {
  const s = String(a || '');
  if (!s) return '—';
  if (/^min:\d+$/.test(s)) return `ministère n° ${s.slice(4)}`; // compte du ministère (bloc 6)
  const pre = s.startsWith('admin:') ? 'admin:' : s.startsWith('min:') ? 'min:' : ''; const v = s.slice(pre.length);
  if (/^u:\d+$/.test(v)) return pre + `compte n° ${v.slice(2)}`;
  if (v.includes('@')) { const [l, d] = v.split('@'); return `${pre}${l.slice(0, 2)}***@${d.slice(0, 2)}***`; }
  if (/^\+?\d+$/.test(v)) return pre + v.slice(0, 4) + '****' + v.slice(-2);
  return pre + v.slice(0, 2) + '***';
}
const haitiHour = (ms, tz) => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz }).format(new Date(ms)));
const haitiTime = (ms, tz) => {
  const o = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${o.year}-${o.month}-${o.day} ${o.hour}:${o.minute}`;
};
const parseDbTime = (s) => {
  let t = String(s || '').trim().replace(' ', 'T');
  if (/[+-]\d\d$/.test(t)) t += ':00';
  return Date.parse(/([zZ]|[+-]\d\d:?\d\d)$/.test(t) ? t : `${t}Z`);
};

function readSeuils(env) {
  let o = {};
  try { o = env.NORIA_ASSISTANT_SEUILS ? JSON.parse(env.NORIA_ASSISTANT_SEUILS) : {}; } catch { console.error('NORIA_ASSISTANT_SEUILS : JSON invalide, seuils par défaut'); }
  const out = { ...DEFAULTS };
  for (const k of Object.keys(o)) if (k in DEFAULTS && Number.isFinite(Number(o[k]))) out[k] = Number(o[k]);
  return out;
}

// Actions : critique = nouveau code à 6 chiffres exigé. undo = annulable.
const ACTIONS = {
  'ip.bloquer': { critical: false, label: { fr: 'Bloquer l’adresse IP', ht: 'Bloke adrès IP a' } },
  'compte.verrouiller': { critical: true, label: { fr: 'Verrouiller le compte', ht: 'Fèmen kont lan' } },
  'compte.deverrouiller': { critical: false, label: { fr: 'Déverrouiller le compte', ht: 'Louvri kont lan' } },
  'compte.deconnecter': { critical: false, label: { fr: 'Forcer la déconnexion du compte', ht: 'Fòse kont lan dekonekte' } },
  'ecole.deconnecter': { critical: true, label: { fr: 'Déconnecter toute l’école', ht: 'Dekonekte tout lekòl la' } },
  'compte.reinitialiser': { critical: true, label: { fr: 'Forcer la réinitialisation du mot de passe', ht: 'Fòse chanjman modpas la' } },
  'ecole.suspendre': { critical: true, label: { fr: 'Suspendre l’école', ht: 'Sispann lekòl la' } },
  'alerte.traiter': { critical: false, label: { fr: 'Marquer comme traitée', ht: 'Make l trete' } },
  'alerte.faux_positif': { critical: false, label: { fr: 'Marquer comme faux positif', ht: 'Make l fo alèt' } },
  'ministere.deconnecter': { critical: false, label: { fr: 'Déconnecter le compte du ministère', ht: 'Dekonekte kont ministè a' } },
  'ministere.desactiver': { critical: true, label: { fr: 'Désactiver le compte du ministère', ht: 'Dezaktive kont ministè a' } },
  annuler: { critical: false, label: { fr: 'Annuler l’action', ht: 'Anile aksyon an' } },
};
const act = (type, params) => ({ type, params, critical: ACTIONS[type].critical, label: ACTIONS[type].label });

function createSecurity({ db, env = process.env, notifier = null, secureCookie = false, publicUrl = null, now = () => Date.now(), log = console.error, alertes = null, channelFetch = null } = {}) {
  const out_ = alertes || createAlertes({ db, env, notifier, fetch: channelFetch, now, log });
  const S = readSeuils(env);
  const TZ = env.NORIA_TZ || 'America/Port-au-Prince';
  const prod = env.NODE_ENV === 'production';
  const llm = createLlm(env);
  const latencies = [];
  let blocks = { at: 0, set: new Map() };
  let lastRun = null, timer = null, running = null;

  /* ---------- Observation (appelée par app.js, jamais bloquante) ---------- */
  const inflight = new Set();
  function record(e) { const p = recordNow(e); inflight.add(p); p.finally(() => inflight.delete(p)); return p; }
  // Attend les événements en cours d'écriture (l'observation ne retarde jamais la réponse HTTP).
  const flush = () => Promise.all([...inflight]);
  async function recordNow(e) {
    try {
      await db.run(`INSERT INTO security_event (at_ms, kind, ip, account, school_id, user_id, role, status, path, ua_hash, detail)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, now(), e.kind, e.ip || null, e.account ? String(e.account).slice(0, 120) : null, e.school_id || null, e.user_id || null,
      e.role || null, e.status || null, e.path ? String(e.path).slice(0, 160) : null, e.ua ? auth.sha256(`ua|${e.ua}`).slice(0, 16) : null, e.detail ? String(e.detail).slice(0, 200) : null);
    } catch (err) { log(`[assistant] événement non enregistré : ${err.message}`); }
  }
  function observe(req, url, status, body, ms) {
    const p = url.pathname;
    if (!p.startsWith('/api/') || req.secSkip) return;
    if (ms != null) { latencies.push(ms); if (latencies.length > 500) latencies.shift(); }
    const b = req.body || {}; const u = req.user || null;
    const base = { ip: req.ip, status, path: p, ua: req.headers['user-agent'] || '', user_id: u ? u.id : null, school_id: u ? u.school_id : null };
    const fail = status === 401 || status === 429;
    if (req.method === 'POST' && fail && p === '/api/login') return record({ ...base, kind: b.method === 'code' ? 'otp.fail' : 'login.fail', account: String(b.identifier ?? b.email ?? '').trim().toLowerCase() || null, detail: b.school ? `école ${String(b.school).slice(0, 60)}` : null });
    if (req.method === 'POST' && fail && p === '/api/admin/login') return record({ ...base, kind: 'login.fail', account: `admin:${String(b.email || '').trim().toLowerCase()}` });
    if (req.method === 'POST' && fail && p === '/api/admin/login/code') return record({ ...base, kind: 'otp.fail', account: 'admin:code' });
    // Portail du ministère (bloc 6) : code faux ou trop de tentatives ; consultations notées par src/ministere.js.
    if (req.method === 'POST' && fail && p === '/api/ministere/login') return record({ ...base, kind: 'otp.fail', account: `min:${String(b.identifier || '').trim().toLowerCase().slice(0, 100)}` });
    if (req.rls) return record({ ...base, kind: 'rls' });
    if (status >= 400) return record({ ...base, kind: 'http' });
    if (status === 200 && u) {
      if (body && body.__pdf) return record({ ...base, kind: 'pdf' });
      if (req.method === 'GET' && p.startsWith('/api/export/')) return record({ ...base, kind: 'export' });
      if (req.method === 'GET' && /^\/api\/students\/\d+$/.test(p)) return record({ ...base, kind: 'fiche' });
      // Vérification d'un élève d'une autre école (bloc 4) : « introuvable » = code ou date de naissance faux.
      if (req.method === 'POST' && p === '/api/transferts/recherche') return record({ ...base, kind: 'recherche', detail: req.secDetail || null });
      // Proposition d'un contenu pour le portail public (bloc 5).
      if (req.method === 'POST' && p === '/api/portail/propositions') return record({ ...base, kind: 'proposition', detail: String((req.body || {}).kind || '').slice(0, 20) || null });
    }
  }
  async function loginOk(req, who) {
    let role = who.role || null;
    if (!role && who.user) {
      const rs = (await db.all('SELECT role FROM user_role WHERE user_id = ? AND school_id = ?', who.user.id, who.user.school_id)).map((r) => r.role);
      role = rs.includes('direction') ? 'direction' : rs[0] || null;
    }
    const account = who.account || (who.user.person_id ? `p:${who.user.person_id}` : `u:${who.user.id}`);
    await record({ kind: 'login.ok', ip: req.ip, ua: req.headers['user-agent'] || '', account, role, user_id: who.user ? who.user.id : null, school_id: who.user ? who.user.school_id : null });
    // Super-admin : vérification immédiate « nouvelle IP / nouvel appareil » (sans attendre l'analyse des 5 min), hors requête.
    if (role === 'superadmin') { const p = exclusive(() => quick([ruleNewDevice])).catch((e) => log(`[assistant] vérification rapide en échec : ${e.message}`)); quickInflight.add(p); p.finally(() => quickInflight.delete(p)); }
  }
  const quickInflight = new Set();
  const settle = async () => { await flush(); await Promise.all([...quickInflight]); };
  let lock = Promise.resolve();
  function exclusive(fn) { const p = lock.then(fn, fn); lock = p.catch(() => {}); return p; }
  async function quick(rules) {
    await flush();
    const cands = []; for (const f of rules) cands.push(...await f());
    return handle(cands.filter((c) => c.immediate));
  }

  /* ---------- Blocage d'IP ---------- */
  async function isBlocked(ip) {
    if (now() - blocks.at > 15e3) {
      const rows = await db.all('SELECT ip, until_at FROM ip_block WHERE lifted_at IS NULL AND until_at > ?', iso(now()));
      blocks = { at: now(), set: new Map(rows.map((r) => [r.ip, r.until_at])) };
    }
    const u = blocks.set.get(String(ip || '').replace(/^::ffff:/, '')) || blocks.set.get(String(ip || ''));
    return !!u && u > iso(now());
  }
  const refreshBlocks = () => { blocks.at = 0; };

  /* ---------- Règles ---------- */
  const T = (rule, v, vht = v) => {
    const g = G[rule];
    return { title: g.titre, explain: { fr: fill(g.expl.fr, v), ht: fill(g.expl.ht, vht) }, reco: { fr: fill(g.reco.fr, v), ht: fill(g.reco.ht, vht) } };
  };
  const evLine = (e) => `${haitiTime(Number(e.at_ms), TZ)} · ${e.kind}${e.status ? ` ${e.status}` : ''} · IP ${maskIp(e.ip)}${e.account ? ` · ${maskAccount(e.account)}` : ''}${e.path ? ` · ${e.path.replace(/\d{2,}/g, '…')}` : ''}`;
  const lastEvents = (where, ...p) => db.all(`SELECT at_ms, kind, ip, account, status, path FROM security_event WHERE ${where} ORDER BY at_ms DESC LIMIT 6`, ...p);
  const ministryActions = (id) => [act('ministere.deconnecter', { ministry_id: id }), act('ministere.desactiver', { ministry_id: id })];
  const accountActions = (target) => [act('compte.deconnecter', target), act('compte.verrouiller', target), act('compte.reinitialiser', target)];

  async function ruleBrute() {
    const out = []; const since = now() - S.bruteFenetreMin * MIN; const min = S.bruteFenetreMin;
    const byIp = await db.all(`SELECT ip, COUNT(*) AS n, COUNT(DISTINCT account) AS a FROM security_event WHERE kind IN ('login.fail','otp.fail') AND at_ms > ? AND ip IS NOT NULL GROUP BY ip`, since);
    for (const r of byIp) {
      const n = Number(r.n), a = Number(r.a);
      const ev = (await lastEvents("kind IN ('login.fail','otp.fail') AND at_ms > ? AND ip = ?", since, r.ip)).map(evLine);
      const acts = [act('ip.bloquer', { ip: r.ip, minutes: 60 })];
      if (a >= S.pulverisationComptes) out.push({ rule: 'pulverisation', key: r.ip, severity: 'critique', vars: { n, comptes: a, min, seuil: S.pulverisationComptes }, evidence: [`IP ${maskIp(r.ip)} : ${n} échecs, ${a} comptes`, ...ev], actions: acts });
      else if (n >= S.bruteIpAttention) out.push({ rule: 'force_brute_ip', key: r.ip, severity: n >= S.bruteIpCritique ? 'critique' : 'attention', vars: { n, min, seuil: S.bruteIpAttention }, evidence: [`IP ${maskIp(r.ip)} : ${n} échecs`, ...ev], actions: acts });
    }
    const byAcc = await db.all(`SELECT account, COUNT(*) AS n, COUNT(DISTINCT ip) AS i FROM security_event WHERE kind IN ('login.fail','otp.fail') AND at_ms > ? AND account IS NOT NULL AND account <> '' GROUP BY account`, since);
    for (const r of byAcc) {
      const n = Number(r.n); if (n < S.bruteCompteAttention) continue;
      const ev = (await lastEvents("kind IN ('login.fail','otp.fail') AND at_ms > ? AND account = ?", since, r.account)).map(evLine);
      const ips = await db.all("SELECT DISTINCT ip FROM security_event WHERE kind IN ('login.fail','otp.fail') AND at_ms > ? AND account = ? LIMIT 3", since, r.account);
      const adminAcc = r.account.startsWith('admin:');
      out.push({ rule: 'force_brute_compte', key: r.account, severity: n >= S.bruteCompteCritique ? 'critique' : 'attention', vars: { n, min, ips: Number(r.i), cible: maskAccount(r.account), seuil: S.bruteCompteAttention },
        evidence: [`${maskAccount(r.account)} : ${n} échecs depuis ${Number(r.i)} adresse(s)`, ...ev],
        actions: [...(adminAcc ? [] : accountActions({ account: r.account })), ...ips.filter((x) => x.ip).map((x) => act('ip.bloquer', { ip: x.ip, minutes: 60 }))] });
    }
    return out;
  }
  async function ruleNewDevice() {
    const out = []; const since = now() - 2 * H; const back = S.nouvelAppareilJours * 24 * H;
    const rows = await db.all(`SELECT id, at_ms, ip, ua_hash, account, role, user_id FROM security_event WHERE kind = 'login.ok' AND role IN ('direction','superadmin','ministere') AND at_ms > ? ORDER BY at_ms`, since);
    for (const r of rows) {
      const t = Number(r.at_ms);
      const prev = await db.get(`SELECT COUNT(*) AS n, SUM(CASE WHEN ip = ? THEN 1 ELSE 0 END) AS sip, SUM(CASE WHEN ua_hash = ? THEN 1 ELSE 0 END) AS sua
        FROM security_event WHERE kind = 'login.ok' AND account = ? AND at_ms < ? AND at_ms > ? AND id < ?`, r.ip, r.ua_hash, r.account, t, t - back, r.id);
      if (!Number(prev.n)) continue; // première connexion connue : rien à comparer
      const newIp = !Number(prev.sip), newUa = !Number(prev.sua);
      if (!newIp && !newUa) continue;
      const quoi = { fr: [newIp && 'une adresse IP', newUa && 'un appareil'].filter(Boolean).join(' et '), ht: [newIp && 'yon adrès IP', newUa && 'yon aparèy'].filter(Boolean).join(' ak ') };
      const role = r.role === 'superadmin' ? 'super-admin' : r.role === 'ministere' ? 'ministère' : 'direction';
      const cible = r.account.startsWith('admin:') ? r.account : maskAccount(r.account);
      const minId = /^min:\d+$/.test(r.account) ? Number(r.account.slice(4)) : null;
      out.push({ rule: 'nouvel_appareil', key: `${r.account}|${r.ip}|${r.ua_hash}`, severity: r.role === 'superadmin' ? 'attention' : 'info', immediate: r.role === 'superadmin', vars: { cible, role, quoi: quoi.fr }, varsHt: { cible, role, quoi: quoi.ht },
        evidence: [`${haitiTime(t, TZ)} · connexion réussie · IP ${maskIp(r.ip)} · appareil ${r.ua_hash || '?'}${newIp ? ' · IP nouvelle' : ''}${newUa ? ' · appareil nouveau' : ''}`, `${Number(prev.n)} connexion(s) connue(s) sur ${S.nouvelAppareilJours} jours`],
        actions: minId ? ministryActions(minId) : r.user_id ? accountActions({ user_id: r.user_id }) : [act('ip.bloquer', { ip: r.ip, minutes: 60 })] });
    }
    return out;
  }
  async function ruleCrossSchool() {
    const out = []; const since = now() - S.interFenetreMin * MIN;
    const rows = await db.all(`SELECT user_id, school_id, SUM(CASE WHEN kind = 'http' THEN 1 ELSE 0 END) AS n, SUM(CASE WHEN kind = 'rls' THEN 1 ELSE 0 END) AS rls
      FROM security_event WHERE ((kind = 'http' AND status IN (403,404)) OR kind = 'rls') AND user_id IS NOT NULL AND at_ms > ? GROUP BY user_id, school_id`, since);
    for (const r of rows) {
      const n = Number(r.n), rls = Number(r.rls);
      const paths = await db.all(`SELECT DISTINCT path FROM security_event WHERE kind IN ('http','rls') AND user_id = ? AND at_ms > ?`, r.user_id, since);
      let autres = 0;
      for (const p of paths) {
        const m = String(p.path || '').match(/^\/api\/students\/(\d+)/);
        if (m) { const s = await db.get('SELECT school_id FROM student WHERE id = ?', Number(m[1])); if (s && Number(s.school_id) !== Number(r.school_id)) autres++; }
      }
      if (n < S.interEcolesRefus && autres < S.interEcolesAutres && !rls) continue;
      const sev = autres >= S.interEcolesAutres || rls >= 3 ? 'critique' : 'attention';
      const cible = `compte n° ${r.user_id} (école ${r.school_id})`;
      out.push({ rule: 'inter_ecoles', key: `u:${r.user_id}`, severity: sev, vars: { n, autres, min: S.interFenetreMin, cible, seuil: S.interEcolesRefus, rls: rls ? ` et ${rls} refus de la base (RLS)` : '' },
        varsHt: { n, autres, min: S.interFenetreMin, cible, seuil: S.interEcolesRefus, rls: rls ? ` ak ${rls} refi baz done (RLS)` : '' },
        evidence: (await lastEvents("kind IN ('http','rls') AND user_id = ? AND at_ms > ?", r.user_id, since)).map(evLine), actions: accountActions({ user_id: Number(r.user_id) }) });
    }
    return out;
  }
  async function ruleSpikes() {
    const out = []; const w = S.picFenetreMin * MIN; const t = now();
    const c = async (lo, hi, a, b) => Number((await db.get("SELECT COUNT(*) AS n FROM security_event WHERE kind IN ('http','rls','login.fail','otp.fail') AND status >= ? AND status < ? AND at_ms > ? AND at_ms <= ?", lo, hi, a, b)).n);
    const top = async (lo, hi) => {
      const ips = await db.all("SELECT ip, COUNT(*) AS n FROM security_event WHERE status >= ? AND status < ? AND at_ms > ? GROUP BY ip ORDER BY n DESC LIMIT 3", lo, hi, t - w);
      const ps = await db.all("SELECT path, COUNT(*) AS n FROM security_event WHERE status >= ? AND status < ? AND at_ms > ? GROUP BY path ORDER BY n DESC LIMIT 3", lo, hi, t - w);
      return { ev: [...ips.map((x) => `IP ${maskIp(x.ip)} : ${x.n}`), ...ps.map((x) => `${String(x.path || '').replace(/\d{2,}/g, '…')} : ${x.n}`)], ips };
    };
    const n4 = await c(400, 500, t - w, t), base4 = (await c(400, 500, t - w - H, t - w)) / (H / w);
    if (n4 >= S.pic4xx && n4 >= S.pic4xxFacteur * Math.max(base4, 1)) {
      const tp = await top(400, 500);
      out.push({ rule: 'pic_4xx', key: '4xx', severity: 'attention', vars: { n: n4, base: Math.round(base4), min: S.picFenetreMin, seuil: S.pic4xx }, evidence: tp.ev,
        actions: tp.ips.filter((x) => x.ip).slice(0, 1).map((x) => act('ip.bloquer', { ip: x.ip, minutes: 60 })) });
    }
    const n5 = await c(500, 600, t - w, t);
    if (n5 >= S.pic5xxAttention) out.push({ rule: 'pic_5xx', key: '5xx', severity: n5 >= S.pic5xxCritique ? 'critique' : 'attention', vars: { n: n5, min: S.picFenetreMin, seuil: S.pic5xxAttention }, evidence: (await top(500, 600)).ev, actions: [] });
    return out;
  }
  async function ruleVolume() {
    const out = []; const lim = { export: S.exportsHeure, pdf: S.pdfHeure, fiche: S.fichesHeure };
    const nom = { export: { fr: 'exports', ht: 'ekspòtasyon' }, pdf: { fr: 'téléchargements de PDF', ht: 'telechajman PDF' }, fiche: { fr: 'consultations de fiches d’élèves', ht: 'konsiltasyon fich elèv' } };
    const rows = await db.all("SELECT user_id, school_id, kind, COUNT(*) AS n FROM security_event WHERE kind IN ('export','pdf','fiche') AND at_ms > ? AND user_id IS NOT NULL GROUP BY user_id, school_id, kind", now() - H);
    for (const r of rows) {
      const n = Number(r.n); if (n < lim[r.kind]) continue;
      const cible = `compte n° ${r.user_id} (école ${r.school_id})`;
      const seuils = `exports ${S.exportsHeure}, PDF ${S.pdfHeure}, fiches ${S.fichesHeure}`;
      out.push({ rule: 'volume_anormal', key: `u:${r.user_id}|${r.kind}`, severity: n >= 3 * lim[r.kind] ? 'critique' : 'attention', vars: { n, cible, quoi: nom[r.kind].fr, seuil: lim[r.kind], seuils }, varsHt: { n, cible, quoi: nom[r.kind].ht, seuil: lim[r.kind], seuils },
        evidence: [`${n} ${nom[r.kind].fr} en 1 h (seuil ${lim[r.kind]})`, ...(await lastEvents('kind = ? AND user_id = ? AND at_ms > ?', r.kind, r.user_id, now() - H)).map(evLine)], actions: accountActions({ user_id: Number(r.user_id) }) });
    }
    return out;
  }
  // Bloc 4 : beaucoup de vérifications d'élèves par une même école (ou beaucoup de codes/dates faux) en une heure.
  async function ruleSearches() {
    const out = []; const since = now() - H;
    const rows = await db.all(`SELECT school_id, COUNT(*) AS n, SUM(CASE WHEN detail = 'introuvable' THEN 1 ELSE 0 END) AS miss, COUNT(DISTINCT user_id) AS users
      FROM security_event WHERE kind = 'recherche' AND at_ms > ? AND school_id IS NOT NULL GROUP BY school_id`, since);
    for (const r of rows) {
      const n = Number(r.n), miss = Number(r.miss || 0);
      if (n < S.recherchesEcoleHeure && miss < S.recherchesEchecsHeure) continue;
      const top = await db.get("SELECT user_id, COUNT(*) AS n FROM security_event WHERE kind = 'recherche' AND at_ms > ? AND school_id = ? GROUP BY user_id ORDER BY COUNT(*) DESC LIMIT 1", since, r.school_id);
      const critique = n >= 3 * S.recherchesEcoleHeure || miss >= 3 * S.recherchesEchecsHeure;
      const vars = { n, miss, cible: `école n° ${r.school_id}`, comptes: Number(r.users), seuil: S.recherchesEcoleHeure, echecs: S.recherchesEchecsHeure };
      out.push({ rule: 'recherches_eleves', key: `e:${r.school_id}`, severity: critique ? 'critique' : 'attention', vars, varsHt: { ...vars, cible: `lekòl n° ${r.school_id}` },
        evidence: [`${n} vérifications d’élèves en 1 h dont ${miss} sans résultat (seuils ${S.recherchesEcoleHeure} / ${S.recherchesEchecsHeure})`,
          ...(await lastEvents("kind = 'recherche' AND school_id = ? AND at_ms > ?", r.school_id, since)).map(evLine)],
        actions: top ? accountActions({ user_id: Number(top.user_id) }) : [] });
    }
    return out;
  }
  // Bloc 5 : propositions en masse pour le portail public (compte compromis, robot, envoi de contenu indésirable).
  async function rulePropositions() {
    const out = []; const since = now() - 24 * H; const hour = now() - H;
    const rows = await db.all(`SELECT school_id, COUNT(*) AS n, SUM(CASE WHEN at_ms > ? THEN 1 ELSE 0 END) AS h, COUNT(DISTINCT user_id) AS users
      FROM security_event WHERE kind = 'proposition' AND at_ms > ? AND school_id IS NOT NULL GROUP BY school_id`, hour, since);
    for (const r of rows) {
      const n = Number(r.n), h = Number(r.h || 0);
      if (h < S.propositionsHeure && n < S.propositionsJour) continue;
      const top = await db.get("SELECT user_id, COUNT(*) AS n FROM security_event WHERE kind = 'proposition' AND at_ms > ? AND school_id = ? GROUP BY user_id ORDER BY COUNT(*) DESC LIMIT 1", since, r.school_id);
      const critique = h >= 3 * S.propositionsHeure || n >= 3 * S.propositionsJour;
      const vars = { n: h, jour: n, cible: `école n° ${r.school_id}`, comptes: Number(r.users), seuil: S.propositionsHeure, seuilJour: S.propositionsJour };
      out.push({ rule: 'propositions_masse', key: `e:${r.school_id}`, severity: critique ? 'critique' : 'attention', vars, varsHt: { ...vars, cible: `lekòl n° ${r.school_id}` },
        evidence: [`${h} propositions pour le portail en 1 h, ${n} en 24 h (seuils ${S.propositionsHeure} / ${S.propositionsJour})`,
          ...(await lastEvents("kind = 'proposition' AND school_id = ? AND at_ms > ?", r.school_id, since)).map(evLine)],
        actions: top ? accountActions({ user_id: Number(top.user_id) }) : [] });
    }
    return out;
  }
  // Bloc 6 : consultation en masse inhabituelle par un compte du ministère (beaucoup de consultations, de fiches
  // nominatives ou d'écoles différentes en une heure, ou un volume très au-dessus de sa moyenne des 7 derniers jours).
  async function ruleMinistere() {
    const out = []; const hour = now() - H; const week = now() - 7 * 24 * H;
    const rows = await db.all(`SELECT account, COUNT(*) AS n, SUM(CASE WHEN detail LIKE 'nominatif%' THEN 1 ELSE 0 END) AS nom, COUNT(DISTINCT school_id) AS ecoles
      FROM security_event WHERE kind = 'ministere' AND at_ms > ? AND account IS NOT NULL GROUP BY account`, hour);
    for (const r of rows) {
      const n = Number(r.n), nom = Number(r.nom || 0), ecoles = Number(r.ecoles || 0);
      const past = Number((await db.get("SELECT COUNT(*) AS n FROM security_event WHERE kind = 'ministere' AND account = ? AND at_ms > ? AND at_ms <= ?", r.account, week, hour)).n);
      const moyenne = past / (7 * 24 - 1);
      const pic = n >= S.ministereMinimum && past > 0 && n >= S.ministereFacteur * Math.max(moyenne, 1);
      if (n < S.ministereConsultationsHeure && nom < S.ministereNominatifHeure && ecoles < S.ministereEcolesHeure && !pic) continue;
      const critique = n >= 3 * S.ministereConsultationsHeure || nom >= 3 * S.ministereNominatifHeure || ecoles >= 3 * S.ministereEcolesHeure;
      const id = /^min:\d+$/.test(r.account) ? Number(r.account.slice(4)) : null;
      const vars = { n, nominatif: nom, ecoles, moyenne: moyenne.toFixed(1), cible: maskAccount(r.account), seuil: S.ministereConsultationsHeure, seuilNominatif: S.ministereNominatifHeure, seuilEcoles: S.ministereEcolesHeure };
      out.push({ rule: 'ministere_consultations', key: r.account, severity: critique ? 'critique' : 'attention', vars, varsHt: { ...vars, cible: id ? `ministè n° ${id}` : vars.cible },
        evidence: [`${n} consultations en 1 h, dont ${nom} nominatives, sur ${ecoles} école(s) ; moyenne ${moyenne.toFixed(1)} / h sur 7 jours`,
          ...(await lastEvents("kind = 'ministere' AND account = ? AND at_ms > ?", r.account, hour)).map(evLine)],
        actions: id ? ministryActions(id) : [] });
    }
    return out;
  }
  // Bloc 7 : adresses e-mail des élèves — créations en masse, rafale de changements de destination (détournement
  // des messages), changements répétés pour la même adresse, échecs de code de vérification.
  async function ruleEmails() {
    const out = []; const hour = now() - H; const day = now() - 24 * H;
    const rows = await db.all("SELECT school_id, user_id, detail, at_ms FROM security_event WHERE kind = 'email_eleve' AND at_ms > ? AND school_id IS NOT NULL", day);
    const by = new Map();
    for (const r of rows) { const k = Number(r.school_id); if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
    for (const [sid, list] of by) {
      const recent = list.filter((r) => Number(r.at_ms) > hour);
      const creations = recent.filter((r) => /^creation:/.test(r.detail || '')).reduce((a, r) => a + Number(String(r.detail).split(':')[1] || 0), 0);
      const dests = recent.filter((r) => /^destination:/.test(r.detail || ''));
      const echecs = recent.filter((r) => /^verif_echec:/.test(r.detail || '')).length;
      const perAddress = new Map();
      for (const r of list.filter((x) => /^destination:/.test(x.detail || ''))) perAddress.set(r.detail, (perAddress.get(r.detail) || 0) + 1);
      const repeat = Math.max(0, ...perAddress.values());
      if (creations < S.emailsCreationsHeure && dests.length < S.emailsDestinationsHeure && repeat < S.emailsDestinationAdresseJour && echecs < S.emailsEchecsHeure) continue;
      const critique = creations >= 3 * S.emailsCreationsHeure || dests.length >= 3 * S.emailsDestinationsHeure || echecs >= 3 * S.emailsEchecsHeure;
      const counts = new Map();
      for (const r of recent.length ? recent : list) if (r.user_id) counts.set(r.user_id, (counts.get(r.user_id) || 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const vars = { n: dests.length, creations, repetes: repeat, echecs, cible: `école n° ${sid}`, seuil: S.emailsDestinationsHeure, seuilCreations: S.emailsCreationsHeure, seuilAdresse: S.emailsDestinationAdresseJour, seuilEchecs: S.emailsEchecsHeure };
      out.push({ rule: 'emails_eleves', key: `e:${sid}`, severity: critique ? 'critique' : 'attention', vars, varsHt: { ...vars, cible: `lekòl n° ${sid}` },
        evidence: [`${dests.length} changements de destination en 1 h, ${creations} adresses créées en 1 h, ${repeat} changements pour une même adresse en 24 h, ${echecs} codes faux en 1 h`,
          ...(await lastEvents("kind = 'email_eleve' AND school_id = ? AND at_ms > ?", sid, day)).map(evLine)],
        actions: top ? accountActions({ user_id: Number(top[0]) }) : [] });
    }
    return out;
  }
  // Exports en masse (pt67) : plus de {seuil} exports ou PDF en 1 h par un compte, ou export d'une école entière.
  const sqlSince = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
  async function ruleExportMasse() {
    const out = [];
    const rows = await db.all("SELECT user_id, school_id, COUNT(*) AS n FROM security_event WHERE kind IN ('export','pdf') AND at_ms > ? AND user_id IS NOT NULL GROUP BY user_id, school_id", now() - H);
    for (const r of rows) {
      const n = Number(r.n); if (n <= S.exportMasseHeure) continue;
      const cible = `compte n° ${r.user_id} (école ${r.school_id})`;
      out.push({ rule: 'export_masse', key: `u:${r.user_id}|heure`, severity: 'critique', immediate: true, vars: { quoi: `${n} exports ou PDF en 1 h`, cible, seuil: S.exportMasseHeure }, varsHt: { quoi: `${n} ekspòtasyon oswa PDF nan 1 è`, cible, seuil: S.exportMasseHeure },
        evidence: [`${n} exports/PDF en 1 h (seuil ${S.exportMasseHeure})`, ...(await lastEvents("kind IN ('export','pdf') AND user_id = ? AND at_ms > ?", r.user_id, now() - H)).map(evLine)], actions: accountActions({ user_id: Number(r.user_id) }) });
    }
    const since = now() - S.alertesFenetreMin * MIN;
    const whole = await db.all(`SELECT a.id, a.school_id, a.actor_user_id, a.action, a.created_at, s.slug FROM audit_log a JOIN school s ON s.id = a.school_id
      WHERE a.outcome = 'ok' AND a.created_at > ? AND ((a.action = 'export.students' AND a.record_type = 'school') OR a.action = 'export.finance') ORDER BY a.id DESC LIMIT 200`, sqlSince(since - 60e3));
    for (const r of whole) {
      const t = parseDbTime(r.created_at); if (!(t > since)) continue;
      const quoi = r.action === 'export.finance' ? { fr: 'export des finances de toute l’école', ht: 'ekspòtasyon finans tout lekòl la' } : { fr: 'export de tous les élèves de l’école', ht: 'ekspòtasyon tout elèv lekòl la' };
      const cible = `compte n° ${r.actor_user_id} (${r.slug})`;
      out.push({ rule: 'export_masse', key: `audit:${r.id}`, severity: 'attention', immediate: true, vars: { quoi: quoi.fr, cible, seuil: S.exportMasseHeure }, varsHt: { quoi: quoi.ht, cible, seuil: S.exportMasseHeure },
        evidence: [`${haitiTime(t, TZ)} (Haïti) · ${r.action} · ${r.slug} · compte n° ${r.actor_user_id}`], actions: r.actor_user_id ? accountActions({ user_id: Number(r.actor_user_id) }).slice(0, 2) : [] });
    }
    return out;
  }
  // Comptes privilégiés (pt67) : nouveau super-admin, direction invitée ou acceptée, changement de rôles.
  async function rulePrivileged() {
    const out = []; const since = now() - S.alertesFenetreMin * MIN; const s0 = sqlSince(since - 60e3);
    const plat = await db.all(`SELECT id, admin_id, action, target, created_at FROM platform_audit WHERE outcome = 'ok' AND created_at > ? AND action IN ('admin.create','admin.direction.inviter') ORDER BY id DESC LIMIT 100`, s0);
    for (const r of plat) {
      const t = parseDbTime(r.created_at); if (!(t > since)) continue;
      const q = r.action === 'admin.create' ? { fr: 'nouveau compte super-admin', ht: 'nouvo kont super-admin' } : { fr: 'invitation d’un compte direction (super-admin)', ht: 'envitasyon yon kont direksyon (super-admin)' };
      const cible = r.action === 'admin.create' ? `admin n° ${r.target}` : `école n° ${r.target}`;
      out.push({ rule: 'comptes_privilegies', key: `pa:${r.id}`, severity: r.action === 'admin.create' ? 'critique' : 'attention', immediate: true, vars: { quoi: q.fr, cible }, varsHt: { quoi: q.ht, cible },
        evidence: [`${haitiTime(t, TZ)} (Haïti) · ${r.action} · ${cible}${r.admin_id ? ` · par admin n° ${r.admin_id}` : ''}`], actions: [] });
    }
    const sch = await db.all(`SELECT a.id, a.school_id, a.actor_user_id, a.action, a.record_id, a.reason, a.created_at, s.slug FROM audit_log a JOIN school s ON s.id = a.school_id
      WHERE a.outcome = 'ok' AND a.created_at > ? AND a.action IN ('user.roles','invitation.accept') ORDER BY a.id DESC LIMIT 200`, s0);
    for (const r of sch) {
      const t = parseDbTime(r.created_at); if (!(t > since)) continue;
      if (r.action === 'invitation.accept' && !/^direction\b/.test(String(r.reason || ''))) continue;
      const roles = (String(r.reason || '').match(/\[rôles: ([^\]]*)\]/) || [])[1] || '';
      const q = r.action === 'user.roles' ? { fr: `changement de rôles (${roles || '—'})`, ht: `chanjman wòl (${roles || '—'})` } : { fr: 'nouveau compte direction (invitation acceptée)', ht: 'nouvo kont direksyon (envitasyon aksepte)' };
      const cible = `compte n° ${r.record_id} (${r.slug})`;
      out.push({ rule: 'comptes_privilegies', key: `al:${r.id}`, severity: 'attention', immediate: true, vars: { quoi: q.fr, cible }, varsHt: { quoi: q.ht, cible },
        evidence: [`${haitiTime(t, TZ)} (Haïti) · ${r.action} · ${r.slug} · compte n° ${r.record_id}${r.actor_user_id && r.action === 'user.roles' ? ` · par compte n° ${r.actor_user_id}` : ''}`],
        actions: r.record_id ? accountActions({ user_id: Number(r.record_id) }).slice(0, 2) : [] });
    }
    return out;
  }
  async function ruleSensitive() {
    const out = [];
    const since = new Date(now() - 24 * H).toISOString().replace('T', ' ').slice(0, 19);
    const rows = await db.all(`SELECT a.school_id, a.actor_user_id, a.action, a.record_id, a.created_at, s.slug FROM audit_log a JOIN school s ON s.id = a.school_id
      WHERE a.outcome = 'ok' AND a.created_at > ? AND a.action IN ('evaluation.rouvrir','payment.cancel','user.roles','grade.correct') ORDER BY a.id DESC LIMIT 5000`, since);
    const groups = new Map();
    for (const r of rows) { if (!SENSIBLES.test(r.action)) continue; const k = `${r.school_id}|${r.actor_user_id}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    for (const [k, list] of groups) {
      const off = list.filter((r) => { const h = haitiHour(parseDbTime(r.created_at), TZ); return h < S.heureMatin || h >= S.heureSoir; });
      const n = list.length;
      let sev = null;
      if (n >= 3 * S.sensiblesJour) sev = 'critique'; else if (n >= S.sensiblesJour || off.length >= S.horsHeuresAttention) sev = 'attention'; else if (off.length) sev = 'info';
      if (!sev) continue;
      const kinds = [...new Set(list.map((r) => r.action))].join(', ');
      const [sid, uid] = k.split('|');
      const cible = `compte n° ${uid} (${list[0].slug})`;
      out.push({ rule: 'modifs_sensibles', key: `u:${uid}`, severity: sev, vars: { n, hors: off.length, quoi: kinds, cible, seuil: S.sensiblesJour, soir: S.heureSoir, matin: S.heureMatin },
        evidence: list.slice(0, 6).map((r) => `${haitiTime(parseDbTime(r.created_at), TZ)} (Haïti) · ${r.action} · ${r.slug} · fiche ${r.record_id || '—'}`),
        actions: [...accountActions({ user_id: Number(uid) }).slice(0, 2), act('ecole.deconnecter', { school_id: Number(sid) })] });
    }
    return out;
  }
  // Santé et configuration : une alerte par problème (clé = composant).
  function etat(rule, key, severity, fr, ht, recoFr, recoHt, evidence = []) {
    return { rule, key, severity, vars: { detail: fr, detail_ht: ht, reco: recoFr, reco_ht: recoHt }, evidence, actions: [] };
  }
  async function ruleHealth(opts = {}) {
    const out = [];
    const t0 = process.hrtime.bigint(); let ok = true;
    try { await db.get('SELECT 1 AS ok'); } catch { ok = false; }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const lat = latencies.length ? [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length / 2)] : 0;
    const m = { healthz: ok, latence_base_ms: Math.round(ms), latence_mediane_ms: Math.round(lat) };
    if (!ok) out.push(etat('sante', 'healthz', 'critique', 'La base de données ne répond pas (healthz en échec).', 'Baz done a pa reponn (healthz an echèk).', 'Vérifiez le conteneur de la base et l’espace disque.', 'Verifye kontenè baz done a ak espas disk la.'));
    const worst = Math.max(ms, lat);
    if (ok && worst >= S.latenceAttentionMs) out.push(etat('sante', 'latence', worst >= S.latenceCritiqueMs ? 'critique' : 'attention', `Le serveur est lent : ${Math.round(worst)} ms (base ${Math.round(ms)} ms, médiane des requêtes ${Math.round(lat)} ms).`, `Sèvè a lan : ${Math.round(worst)} ms.`, 'Regardez la charge du serveur et les requêtes lentes.', 'Gade chaj sèvè a ak demann ki lan yo.', [`base ${Math.round(ms)} ms`, `médiane ${Math.round(lat)} ms`]));
    try {
      if (typeof fs.statfsSync === 'function') {
        const dir = env.NORIA_DB && env.NORIA_DB !== ':memory:' ? path.dirname(path.resolve(env.NORIA_DB)) : process.cwd();
        const st = fs.statfsSync(dir); const pct = (Number(st.bavail) / Number(st.blocks)) * 100;
        m.disque_libre_pct = Math.round(pct * 10) / 10;
        if (pct < S.disqueAttentionPct) out.push(etat('sante', 'disque', pct < S.disqueCritiquePct ? 'critique' : 'attention', `Disque presque plein : ${pct.toFixed(1)} % libre.`, `Disk la prèske plen : ${pct.toFixed(1)} % lib.`, 'Supprimez les vieilles sauvegardes locales ou agrandissez le disque.', 'Efase ansyen sovgad lokal yo oswa agrandi disk la.', [`${dir} : ${pct.toFixed(1)} % libre`]));
      }
    } catch { /* statfs indisponible */ }
    const memPct = (os.freemem() / os.totalmem()) * 100; m.memoire_libre_pct = Math.round(memPct * 10) / 10;
    if (memPct < S.memoireAttentionPct) out.push(etat('sante', 'memoire', memPct < S.memoireCritiquePct ? 'critique' : 'attention', `Mémoire presque épuisée : ${memPct.toFixed(1)} % libre.`, `Memwa a prèske fini : ${memPct.toFixed(1)} % lib.`, 'Vérifiez les processus du serveur ; augmentez la mémoire si cela dure.', 'Verifye pwosesis sèvè a ; ogmante memwa a si sa dire.', [`RSS NORIA ${Math.round(process.memoryUsage().rss / 1048576)} Mo`]));
    const size = await opts.dbSize(); m.taille_base = size;
    if (size != null && size > S.baseMaxMo * 1048576) out.push(etat('sante', 'taille_base', 'attention', `La base dépasse ${S.baseMaxMo} Mo (${Math.round(size / 1048576)} Mo).`, `Baz la depase ${S.baseMaxMo} Mo.`, 'Prévoyez de l’espace et vérifiez la durée des sauvegardes.', 'Prevwa espas epi verifye konbyen tan sovgad yo pran.'));
    const b = opts.backups(); m.sauvegardes = b;
    if (!b.configure) { if (prod) out.push(etat('sante', 'sauvegarde', 'attention', 'Le dossier de sauvegarde n’est pas configuré (BACKUP_DIR) : l’assistant ne peut pas vérifier les sauvegardes.', 'Dosye sovgad la pa konfigire (BACKUP_DIR).', 'Renseignez BACKUP_DIR et activez le minuteur noria-sauvegarde.timer.', 'Mete BACKUP_DIR epi aktive minitè noria-sauvegarde.timer.')); }
    else if (b.error || !b.last) out.push(etat('sante', 'sauvegarde', 'critique', 'Aucune sauvegarde trouvée dans le dossier de sauvegarde.', 'Pa gen okenn sovgad nan dosye a.', 'Lancez deploy/sauvegarde/noria-sauvegarde.sh et vérifiez le minuteur systemd.', 'Lanse deploy/sauvegarde/noria-sauvegarde.sh epi verifye minitè systemd la.'));
    else {
      const age = (now() - Date.parse(b.last.at)) / H; m.sauvegarde_age_h = Math.round(age * 10) / 10;
      if (b.hors_site === false) out.push(etat('sante', 'sauvegarde_hors_site', 'attention', 'La dernière sauvegarde n’a pas été copiée hors du serveur (S3/R2).', 'Dènye sovgad la pa t kopye andeyò sèvè a (S3/R2).', 'Vérifiez S3_BUCKET et les clés dans /etc/noria/sauvegarde.env.', 'Verifye S3_BUCKET ak kle yo nan /etc/noria/sauvegarde.env.', [`dernière : ${b.last.name}`]));
      if (age > S.sauvegardeMaxHeures) out.push(etat('sante', 'sauvegarde', 'critique', `La dernière sauvegarde date de ${Math.round(age)} h (plus de ${S.sauvegardeMaxHeures} h).`, `Dènye sovgad la gen ${Math.round(age)} è (plis pase ${S.sauvegardeMaxHeures} è).`, 'Vérifiez le minuteur noria-sauvegarde.timer (journalctl -u noria-sauvegarde) et lancez une sauvegarde à la main.', 'Verifye minitè noria-sauvegarde.timer epi lanse yon sovgad alamen.', [`dernière : ${b.last.name} · ${haitiTime(Date.parse(b.last.at), TZ)} (Haïti)`]));
    }
    const cert = await certExpiry(); if (cert) m.certificat = cert;
    if (cert && cert.jours != null && cert.jours < S.certAttentionJours) out.push(etat('sante', 'certificat', cert.jours < S.certCritiqueJours ? 'critique' : 'attention', `Le certificat HTTPS expire dans ${cert.jours} jour(s) (${cert.fin}).`, `Sètifika HTTPS la ap ekspire nan ${cert.jours} jou.`, 'Caddy renouvelle seul : vérifiez qu’il atteint Let’s Encrypt (ports 80/443, DNS).', 'Caddy renouvle l pou kont li : verifye li ka jwenn Let’s Encrypt (pò 80/443, DNS).', [`source : ${cert.source}`]));
    return { alerts: out, mesures: m };
  }
  async function certExpiry() {
    const file = env.NORIA_TLS_CERT_FILE;
    const days = (d) => Math.floor((Date.parse(d) - now()) / (24 * H));
    if (file) { try { const c = new crypto.X509Certificate(fs.readFileSync(file)); return { source: 'fichier', fin: c.validTo, jours: days(c.validTo) }; } catch { return { source: 'fichier', erreur: 'illisible' }; } }
    const pub = publicUrl || env.NORIA_PUBLIC_URL;
    if (!pub || !/^https:/.test(pub) || env.NORIA_ASSISTANT_CERT_RESEAU === '0' || env.NODE_TEST_CONTEXT) return null;
    const host = new URL(pub).hostname;
    return new Promise((resolve) => {
      const s = tls.connect({ host, port: 443, servername: host, timeout: 4000 }, () => { const c = s.getPeerCertificate(); s.end(); resolve(c && c.valid_to ? { source: host, fin: c.valid_to, jours: days(c.valid_to) } : null); });
      s.on('error', () => resolve(null)); s.on('timeout', () => { s.destroy(); resolve(null); });
    });
  }
  function ruleConfig(opts = {}) {
    const out = []; if (!prod && env.NORIA_ASSISTANT_CONFIG_TOUJOURS !== '1') return out;
    const miss = (k, sev, fr, ht) => out.push(etat('configuration', k, sev, fr, ht, 'Ajoutez la variable dans .env puis redémarrez.', 'Ajoute varyab la nan .env epi redemare.', [`${k} : absente`]));
    if (!env.NORIA_CLE_MAITRE) miss('NORIA_CLE_MAITRE', 'critique', 'NORIA_CLE_MAITRE est absente : les clés de signature des écoles (badges, relevés) ne sont pas protégées.', 'NORIA_CLE_MAITRE pa la : kle siyati lekòl yo pa pwoteje.');
    if (!env.NORIA_OTP_SECRET) miss('NORIA_OTP_SECRET', 'critique', 'NORIA_OTP_SECRET est absente : les codes de connexion à 6 chiffres sont moins protégés.', 'NORIA_OTP_SECRET pa la : kòd koneksyon 6 chif yo mwens pwoteje.');
    let bk = null; try { bk = opts.backups ? opts.backups() : null; } catch { bk = null; }
    // La clé peut vivre dans /etc/noria/sauvegarde.env (script root) : etat.json confirme alors le chiffrement.
    if (!env.NORIA_BACKUP_AGE_RECIPIENT && !(bk && bk.chiffrement)) miss('NORIA_BACKUP_AGE_RECIPIENT', 'attention', 'Clé de chiffrement des sauvegardes absente (NORIA_BACKUP_AGE_RECIPIENT) : les sauvegardes ne seraient pas chiffrées.', 'Kle chifreman sovgad yo pa la : sovgad yo pa t ap chifre.');
    // NORIA_SMS_CONSOLE_ACCEPTE=1 : l'opérateur accepte explicitement le SMS simulé (pas de passerelle payante).
    // L'alerte n'est plus proposée : une alerte déjà traitée ne se rouvre pas à l'analyse suivante.
    if ((env.NORIA_SMS_PROVIDER || 'console') === 'console' && env.NORIA_SMS_CONSOLE_ACCEPTE !== '1') miss('NORIA_SMS_PROVIDER', 'attention', 'Les SMS sont en mode console (simulés) : aucun code ni alerte ne part réellement par SMS.', 'SMS yo an mòd konsòl (simile) : okenn kòd pa pati vre.');
    if ((env.NORIA_EMAIL_PROVIDER || 'console') === 'console') miss('NORIA_EMAIL_PROVIDER', 'attention', 'Les e-mails sont en mode console (simulés).', 'Imèl yo an mòd konsòl (simile).');
    if (!secureCookie) miss('NORIA_SECURE_COOKIE', 'critique', 'Les cookies de session ne sont pas marqués Secure : ils peuvent circuler sans HTTPS.', 'Cookie sesyon yo pa make Secure : yo ka pase san HTTPS.');
    return out;
  }
  function ruleDeps() {
    const out = [];
    const file = env.NORIA_AUDIT_RAPPORT || path.join(__dirname, '..', 'data', 'npm-audit.json');
    let st, j;
    try { st = fs.statSync(file); j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {
      if (prod) out.push(etat('dependances', 'rapport', 'info', 'Aucun rapport npm audit lisible : l’assistant ne peut pas vérifier les dépendances.', 'Pa gen rapò npm audit : asistan an pa ka verifye depandans yo.', 'Lancez npm run audit:rapport (ou récupérez l’artefact de la CI) et déposez le fichier.', 'Lanse npm run audit:rapport epi depoze fichye a.', [file]));
      return out;
    }
    const v = (j.metadata && j.metadata.vulnerabilities) || {};
    const pk = Object.entries(j.vulnerabilities || {}).map(([n, x]) => `${n} (${x.severity})`).slice(0, 6);
    if (v.critical > 0 || v.high > 0) out.push(etat('dependances', 'vulnerabilites', v.critical > 0 ? 'critique' : 'attention', `npm audit signale ${v.critical || 0} faille(s) critique(s) et ${v.high || 0} élevée(s).`, `npm audit montre ${v.critical || 0} fay kritik ak ${v.high || 0} ki wo.`, 'Mettez à jour les paquets, relancez les tests puis redéployez.', 'Mete pake yo ajou, relanse tès yo epi redeplwaye.', pk));
    else if (v.moderate > 0) out.push(etat('dependances', 'vulnerabilites', 'info', `npm audit signale ${v.moderate} faille(s) modérée(s).`, `npm audit montre ${v.moderate} fay modere.`, 'À planifier à la prochaine mise à jour.', 'Planifye l pou pwochen mizajou a.', pk));
    const age = (now() - st.mtimeMs) / (24 * H);
    if (age > S.rapportAuditMaxJours) out.push(etat('dependances', 'rapport_ancien', 'info', `Le rapport npm audit date de ${Math.round(age)} jours.`, `Rapò npm audit la gen ${Math.round(age)} jou.`, 'Relancez npm run audit:rapport.', 'Relanse npm run audit:rapport.'));
    return out;
  }

  /* ---------- Enregistrement des alertes ---------- */
  async function upsert(c) {
    const fp = `${c.rule}:${c.key}`;
    const t = T(c.rule, c.vars, c.varsHt || c.vars);
    const ev = JSON.stringify(c.evidence.slice(0, 10)), acts = JSON.stringify(c.actions);
    const open = await db.get("SELECT * FROM security_alert WHERE fingerprint = ? AND status = 'ouverte' ORDER BY id DESC LIMIT 1", fp);
    if (open) {
      const sev = SEV[c.severity] > SEV[open.severity] ? c.severity : open.severity;
      await db.run(`UPDATE security_alert SET severity = ?, explain_fr = ?, explain_ht = ?, reco_fr = ?, reco_ht = ?, evidence = ?, actions = ?, hits = hits + 1, last_at = ? WHERE id = ?`,
        sev, t.explain.fr, t.explain.ht, t.reco.fr, t.reco.ht, ev, acts, iso(now()), open.id);
      return { id: open.id, created: false, escalated: sev !== open.severity && sev === 'critique', severity: sev };
    }
    const closed = await db.get("SELECT status, closed_at FROM security_alert WHERE fingerprint = ? AND status <> 'ouverte' ORDER BY id DESC LIMIT 1", fp);
    if (closed && closed.closed_at) {
      const since = now() - Date.parse(closed.closed_at);
      if (closed.status === 'faux_positif' && since < S.fauxPositifJours * 24 * H) return null;
      if (closed.status === 'traitee' && since < S.reouvertureTraiteeMin * MIN) return null;
    }
    const id = await db.insert(`INSERT INTO security_alert (rule, fingerprint, severity, title_fr, title_ht, explain_fr, explain_ht, reco_fr, reco_ht, evidence, actions, first_at, last_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, c.rule, fp, c.severity, t.title.fr, t.title.ht, t.explain.fr, t.explain.ht, t.reco.fr, t.reco.ht, ev, acts, iso(now()), iso(now()));
    return { id, created: true, escalated: false, severity: c.severity };
  }

  /* ---------- Notifications (regroupées : 1 message par règle toutes les 30 min) ----------
     Critique ou règle « immédiate » : message tout de suite (super-admin + e-mail/Telegram des alertes).
     Attention : récapitulatif au plus toutes les {recapMin} min. Une alerte n'est signalée qu'une fois (notified_at). */
  async function notify(rule, alert, { critique = true } = {}) {
    const row = await db.get('SELECT last_ms, suppressed FROM security_notice WHERE rule = ?', rule);
    if (row && now() - Number(row.last_ms) < S.notificationMin * MIN) {
      await db.run('UPDATE security_notice SET suppressed = suppressed + 1 WHERE rule = ?', rule);
      return { sent: false, grouped: true };
    }
    const extra = row && Number(row.suppressed) ? ` (+${row.suppressed} alerte(s) regroupée(s) depuis le dernier message)` : '';
    if (row) await db.run('UPDATE security_notice SET last_ms = ?, suppressed = 0 WHERE rule = ?', now(), rule);
    else await db.run('INSERT INTO security_notice (rule, last_ms, suppressed) VALUES (?,?,0)', rule, now());
    // Aucune donnée personnelle : titre de la règle, gravité, numéro d'alerte.
    const g = critique ? 'CRITIQUE' : 'ATTENTION';
    const text = `NORIA sécurité — ${g} : ${alert.title_fr} (alerte n° ${alert.id})${extra}. Ouvrez /#admin → Assistant sécurité. Aucune action n’a été faite automatiquement.`;
    const sent = []; const admMails = [];
    if (notifier && critique) {
      for (const a of await db.all("SELECT id, email, phone FROM platform_admin WHERE state = 'actif'")) {
        const ch = a.phone ? 'sms' : 'email';
        try { await notifier.adapter(ch).send({ to: a.phone || a.email, subject: 'NORIA : alerte de sécurité critique', text }); sent.push(ch); if (ch === 'email') admMails.push(a.email); }
        catch (e) { log(`[assistant] notification ${ch} en échec : ${e.message}`); }
      }
    }
    const ext = await out_.deliver(`NORIA : alerte de sécurité ${critique ? 'critique' : '« attention »'}`, text, { skipEmail: admMails.find((m) => out_.email() && m.toLowerCase() === out_.email().toLowerCase()) || null });
    for (const c of ext.channels) sent.push(`alertes-${c}`);
    const hook = env.NORIA_ASSISTANT_WEBHOOK_URL;
    if (hook && /^https:\/\//.test(hook)) {
      try { await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(8000) }); sent.push('webhook'); }
      catch (e) { log(`[assistant] webhook en échec : ${e.message}`); }
    }
    if (sent.length) await db.run('UPDATE security_alert SET notified_at = ? WHERE id = ?', iso(now()), alert.id);
    await db.run('INSERT INTO platform_audit (admin_id, action, target, detail, outcome, ip) VALUES (?,?,?,?,?,?)', null, 'assistant.notification', String(alert.id), `${rule} → ${sent.join(', ') || 'aucun canal'}${extra}${ext.capped ? ' (plafond horaire atteint)' : ''}`, 'ok', null);
    return { sent: true, channels: sent };
  }
  // Récapitulatif des alertes « attention » (et critiques regroupées) pas encore signalées, au plus toutes les {recapMin} min.
  async function digest() {
    if (!(await out_.configured())) return null;
    const row = await db.get("SELECT last_ms FROM security_notice WHERE rule = '_recap'");
    if (row && now() - Number(row.last_ms) < S.recapMin * MIN) return null;
    const list = await db.all(`SELECT id, severity, title_fr, hits FROM security_alert WHERE status = 'ouverte' AND notified_at IS NULL AND severity IN ('attention','critique') AND last_at > ?
      ORDER BY CASE severity WHEN 'critique' THEN 0 ELSE 1 END, last_at DESC LIMIT 200`, iso(now() - 24 * H));
    if (!list.length) return null;
    const lines = list.slice(0, 10).map((a) => `• ${a.severity === 'critique' ? 'CRITIQUE' : 'attention'} — ${a.title_fr} (n° ${a.id}${Number(a.hits) > 1 ? `, ${a.hits} fois` : ''})`);
    const text = `NORIA sécurité — récapitulatif : ${list.length} alerte(s) ouverte(s) non encore signalée(s).\n${lines.join('\n')}${list.length > 10 ? `\n… et ${list.length - 10} autre(s).` : ''}\nOuvrez /#admin → Assistant sécurité.`;
    const r = await out_.deliver('NORIA : récapitulatif sécurité', text);
    if (!r.sent) return { sent: false, capped: r.capped };
    if (row) await db.run("UPDATE security_notice SET last_ms = ?, suppressed = 0 WHERE rule = '_recap'", now());
    else await db.run("INSERT INTO security_notice (rule, last_ms, suppressed) VALUES ('_recap',?,0)", now());
    for (const a of list) await db.run('UPDATE security_alert SET notified_at = ? WHERE id = ?', iso(now()), a.id);
    await db.run('INSERT INTO platform_audit (admin_id, action, target, detail, outcome, ip) VALUES (?,?,?,?,?,?)', null, 'assistant.notification', 'recap', `récapitulatif ${list.length} alerte(s) → ${r.channels.join(', ')}`, 'ok', null);
    return { sent: true, n: list.length, channels: r.channels };
  }
  async function handle(cands) {
    const res = [], notes = [];
    for (const c of cands) {
      const r = await upsert(c); if (!r) continue; res.push(r);
      const crit = r.severity === 'critique';
      if ((r.created && (crit || c.immediate)) || r.escalated) {
        if (r.escalated) await db.run('UPDATE security_alert SET notified_at = NULL WHERE id = ?', r.id);
        const a = await db.get('SELECT id, title_fr FROM security_alert WHERE id = ?', r.id);
        notes.push(await notify(c.rule, a, { critique: crit }));
      }
    }
    return { res, notes };
  }

  /* ---------- Analyse ---------- */
  async function analyse(opts) {
    if (running) return running;
    running = exclusive(async () => {
      await flush();
      const cands = [];
      const health = await ruleHealth(opts);
      for (const f of [ruleBrute, ruleNewDevice, ruleCrossSchool, ruleSpikes, ruleVolume, ruleExportMasse, rulePrivileged, ruleSearches, rulePropositions, ruleMinistere, ruleEmails, ruleSensitive]) {
        try { cands.push(...await f()); } catch (e) { log(`[assistant] règle ${f.name} en échec : ${e.message}`); }
      }
      cands.push(...health.alerts, ...ruleConfig(opts), ...ruleDeps());
      const { res, notes } = await handle(cands);
      try { const d = await digest(); if (d) notes.push({ recap: true, ...d }); } catch (e) { log(`[assistant] récapitulatif en échec : ${e.message}`); }
      await db.run('DELETE FROM security_event WHERE at_ms < ?', now() - S.retentionJours * 24 * H);
      await db.run('DELETE FROM security_pending WHERE expires_at < ?', iso(now() - H));
      const hc = env.NORIA_ASSISTANT_HEALTHCHECKS_URL;
      if (hc && /^https:\/\//.test(hc)) {
        const crit = res.some((r) => r.severity === 'critique');
        fetch(crit ? `${hc.replace(/\/$/, '')}/fail` : hc, { method: 'POST', body: crit ? 'alerte critique ouverte' : 'ok', signal: AbortSignal.timeout(8000) }).catch(() => {});
      }
      lastRun = { at: iso(now()), candidats: cands.length, nouvelles: res.filter((r) => r.created).length, mesures: health.mesures, notifications: notes };
      return lastRun;
    });
    try { return await running; } finally { running = null; }
  }
  function start(opts, minutes = Number(env.NORIA_ASSISTANT_INTERVALLE_MIN || 5)) {
    if (timer || !(minutes > 0)) return;
    timer = setInterval(() => analyse(opts).catch((e) => log(`[assistant] analyse en échec : ${e.message}`)), minutes * MIN);
    timer.unref();
    setTimeout(() => analyse(opts).catch(() => {}), 20e3).unref();
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  async function score() {
    const rows = await db.all("SELECT severity, COUNT(*) AS n FROM security_alert WHERE status = 'ouverte' AND last_at > ? GROUP BY severity", iso(now() - 24 * H));
    const c = { info: 0, attention: 0, critique: 0 }; for (const r of rows) c[r.severity] = Number(r.n);
    return { score: Math.max(0, 100 - 25 * c.critique - 8 * c.attention - 2 * c.info), ...c };
  }

  /* ---------- Guide (questions guidées) ---------- */
  async function guide(alert, q, lang, libre) {
    const L = lang === 'ht' ? 'ht' : 'fr';
    if (!alert) return { source: 'guide', reponse: (GENERAL[q] || GENERAL.actions)[L] };
    const g = G[alert.rule] || G.sante;
    const ev = JSON.parse(alert.evidence || '[]');
    const vars = { seuil: '', n: alert.hits };
    const nums = { force_brute_ip: S.bruteIpAttention, force_brute_compte: S.bruteCompteAttention, pulverisation: S.pulverisationComptes, inter_ecoles: S.interEcolesRefus, pic_4xx: S.pic4xx, pic_5xx: S.pic5xxAttention, modifs_sensibles: S.sensiblesJour, recherches_eleves: S.recherchesEcoleHeure, ministere_consultations: S.ministereConsultationsHeure, propositions_masse: S.propositionsHeure, emails_eleves: S.emailsDestinationsHeure };
    Object.assign(vars, { seuilNominatif: S.ministereNominatifHeure, seuilEcoles: S.ministereEcolesHeure, facteur: S.ministereFacteur, seuilJour: S.propositionsJour, jour: '', creations: '', repetes: '', seuilCreations: S.emailsCreationsHeure, seuilAdresse: S.emailsDestinationAdresseJour, seuilEchecs: S.emailsEchecsHeure, echecs: S.recherchesEchecsHeure, miss: '', comptes: '', seuil: nums[alert.rule] ?? '', seuils: `exports ${S.exportsHeure}, PDF ${S.pdfHeure}, fiches ${S.fichesHeure}`, soir: S.heureSoir, matin: S.heureMatin });
    const m = (alert.explain_fr.match(/(\d+) (échecs|réponses|erreurs|refus|modifications|vérifications|propositions|consultations)/) || [])[1]; if (m) vars.n = m;
    const cm = alert.explain_fr.match(/essayé (\d+) comptes/); if (cm) vars.comptes = cm[1];
    if (q === 'libre' && llm && libre) {
      try { return { source: llm.name, reponse: await llm.ask({ question: libre, alerte: llm.redact(alert) }) }; }
      catch (e) { return { source: 'guide', reponse: `${L === 'ht' ? 'Modèl ekstèn lan pa disponib.' : 'Modèle externe indisponible.'} ${fill(g.pourquoi[L], vars)}` }; }
    }
    if (q === 'quoi') {
      const acts = JSON.parse(alert.actions || '[]').map((a) => a.label[L]).join(' · ');
      return { source: 'guide', reponse: `${QUOI[L]}${alert[`reco_${L}`]}${acts ? ` ${L === 'ht' ? 'Aksyon pwopoze' : 'Actions proposées'} : ${acts}.` : ''} ${GENERAL.actions[L]}` };
    }
    if (q === 'risque') return { source: 'guide', reponse: RISQUE[alert.severity][L] };
    if (q === 'faux') return { source: 'guide', reponse: g.faux[L] };
    return { source: 'guide', reponse: `${alert[`explain_${L}`]} ${fill(g.pourquoi[L], vars)}${ev.length ? ` ${L === 'ht' ? 'Prèv' : 'Preuves'} : ${ev.slice(0, 3).join(' ; ')}.` : ''}` };
  }

  return { record, flush, settle, alertes: out_, observe, loginOk, isBlocked, refreshBlocks, analyse, start, stop, score, guide, lastRun: () => lastRun, seuils: S, llmEnabled: !!llm, ACTIONS };
}

module.exports = { createSecurity, maskIp, maskAccount, DEFAULTS, ACTIONS, readSeuils };
