'use strict';
// Relais de diffusion : lit la liste HLS écrite par MediaMTX/ffmpeg (volume partagé, en mémoire), envoie chaque segment
// terminé vers le bucket R2 (API S3, signature AWS v4 locale, aucune dépendance), retire de R2 les segments sortis de
// la fenêtre, puis tout le préfixe à l'arrêt. La liste (.m3u8, quelques centaines d'octets) n'est jamais envoyée à R2 :
// NORIA la sert aux seuls parents connectés (jeton signé court), avec des URL de segments sur le domaine R2.
//   Clés R2 : r/<id réunion>-<clé secrète de 32 hexa>/<segment>.ts — impossibles à deviner, renouvelées à chaque démarrage.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const sha256hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// Requête S3 signée (AWS SigV4, région « auto » pour R2). Renvoie la réponse fetch.
function s3Request(cfg, method, key, body, headers = {}) {
  const u = new URL(cfg.endpoint);
  const pathName = `/${cfg.bucket}/${key.split('/').map(enc).join('/')}`;
  const now = new Date(); const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); const day = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body || '');
  const h = { host: u.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = String(v);
  const names = Object.keys(h).sort();
  const canon = [method, pathName, '', ...names.map((n) => `${n}:${h[n].trim()}`), '', names.join(';'), payloadHash].join('\n');
  const scope = `${day}/${cfg.region || 'auto'}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canon)].join('\n');
  let k = hmac('AWS4' + cfg.secretAccessKey, day); k = hmac(k, cfg.region || 'auto'); k = hmac(k, 's3'); k = hmac(k, 'aws4_request');
  const sig = crypto.createHmac('sha256', k).update(toSign).digest('hex');
  const auth = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}`;
  const { host, ...send } = h; // fetch fixe lui-même l'en-tête Host
  return (cfg.fetch || fetch)(`${u.origin}${pathName}`, { method, headers: { ...send, authorization: auth }, body: body || undefined });
}

// Liste HLS : séquence de départ, durée cible, segments (durée + nom de fichier). Noms limités à [a-z0-9_.-].
function parsePlaylist(txt) {
  const lines = String(txt).split(/\r?\n/); const out = { seq: 0, target: 6, segs: [], ended: false };
  let dur = null;
  for (const l of lines) {
    if (l.startsWith('#EXT-X-MEDIA-SEQUENCE:')) out.seq = Number(l.slice(22)) || 0;
    else if (l.startsWith('#EXT-X-TARGETDURATION:')) out.target = Number(l.slice(22)) || 6;
    else if (l.startsWith('#EXTINF:')) dur = parseFloat(l.slice(8));
    else if (l.startsWith('#EXT-X-ENDLIST')) out.ended = true;
    else if (l && !l.startsWith('#') && dur !== null) { if (/^[a-z0-9_.-]{1,64}$/i.test(l)) out.segs.push({ dur, name: l }); dur = null; }
  }
  return out;
}

function createRelay(opts) {
  const dir = opts.dir; const base = String(opts.publicBase || '').replace(/\/$/, '');
  const cfg = opts.r2; const log = opts.log || ((...a) => console.log('[diffusion]', ...a));
  const live = new Map(); // id réunion → { key, uploaded: Map(nom → instant), pending:Set, gone: Map(nom → instant), seq, target, segs }
  const listeners = new Map(); // id réunion → Map(id utilisateur → dernier passage)
  let timer = null; let busy = false;
  const prefix = (mid, key) => `r/${mid}-${key}/`;

  async function put(mid, st, name) {
    const body = await fs.promises.readFile(path.join(dir, `reunion-${mid}`, name));
    const r = await s3Request(cfg, 'PUT', prefix(mid, st.key) + name, body, { 'content-type': 'video/mp2t', 'cache-control': 'public, max-age=86400, immutable' });
    if (!r.ok) throw new Error(`R2 PUT ${r.status}`);
    st.bytes += body.length; st.puts++;
  }
  async function del(mid, key, name) {
    const r = await s3Request(cfg, 'DELETE', prefix(mid, key) + name, null);
    if (!r.ok && r.status !== 404) throw new Error(`R2 DELETE ${r.status}`);
  }
  async function step(mid, st) {
    let txt; try { txt = await fs.promises.readFile(path.join(dir, `reunion-${mid}`, 'index.m3u8'), 'utf8'); } catch { return; }
    const pl = parsePlaylist(txt); st.seq = pl.seq; st.target = pl.target; st.segs = pl.segs;
    for (const s of pl.segs) {
      if (st.uploaded.has(s.name)) continue;
      try { await put(mid, st, s.name); st.uploaded.set(s.name, Date.now()); } catch (e) { st.errors++; log(`réunion ${mid} : envoi ${s.name} échoué (${e.message})`); break; }
    }
    // Segments sortis de la liste : retirés de R2 après 60 s (un auditeur en retard peut encore les lire).
    const inList = new Set(pl.segs.map((s) => s.name));
    for (const [n] of st.uploaded) if (!inList.has(n) && !st.gone.has(n)) st.gone.set(n, Date.now());
    for (const [n, t] of st.gone) {
      if (Date.now() - t < 60e3) continue;
      try { await del(mid, st.key, n); st.gone.delete(n); st.uploaded.delete(n); st.dels++; } catch (e) { st.errors++; log(`réunion ${mid} : retrait ${n} échoué (${e.message})`); break; }
    }
  }
  async function tick() {
    if (busy) return; busy = true;
    try { for (const [mid, st] of live) await step(mid, st); } finally { busy = false; }
  }

  return {
    start(mid, key) {
      if (!live.has(mid) || live.get(mid).key !== key) live.set(mid, { key, uploaded: new Map(), gone: new Map(), seq: 0, target: 6, segs: [], bytes: 0, puts: 0, dels: 0, errors: 0 });
      if (!timer) { timer = setInterval(() => { tick().catch((e) => log(e.message)); }, opts.intervalMs || 1000); if (timer.unref) timer.unref(); }
    },
    // Arrêt : tout le préfixe de la réunion est retiré de R2 (les segments envoyés et pas encore retirés).
    async stop(mid) {
      const st = live.get(mid); live.delete(mid); listeners.delete(mid);
      if (!live.size && timer) { clearInterval(timer); timer = null; }
      if (!st) return { retires: 0 };
      let n = 0;
      for (const [name] of st.uploaded) { try { await del(mid, st.key, name); n++; } catch (e) { log(`réunion ${mid} : retrait ${name} échoué (${e.message})`); } }
      return { retires: n };
    },
    // Liste servie aux parents : segments déjà présents dans R2 seulement, URL absolues sur le domaine public R2.
    playlist(mid, key) {
      const st = live.get(mid); if (!st || st.key !== key) return null;
      const ready = []; for (const s of st.segs) { if (!st.uploaded.has(s.name)) break; ready.push(s); }
      if (!ready.length) return null;
      const first = st.seq + st.segs.indexOf(ready[0]);
      return ['#EXTM3U', '#EXT-X-VERSION:3', `#EXT-X-TARGETDURATION:${st.target}`, `#EXT-X-MEDIA-SEQUENCE:${first}`,
        ...ready.flatMap((s) => [`#EXTINF:${s.dur.toFixed(3)},`, `${base}/${prefix(mid, key)}${s.name}`]), ''].join('\n');
    },
    seen(mid, uid) { let m = listeners.get(mid); if (!m) listeners.set(mid, (m = new Map())); m.set(uid, Date.now()); },
    // Auditeurs : comptes distincts ayant relu la liste dans les 20 dernières secondes (une liste toutes les ~6 s).
    listeners(mid) {
      const m = listeners.get(mid); if (!m) return 0; const lim = Date.now() - 20e3; let n = 0;
      for (const [u, t] of m) { if (t > lim) n++; else m.delete(u); }
      return n;
    },
    stats(mid) { const st = live.get(mid); return st ? { segments: st.uploaded.size, octets: st.bytes, envois: st.puts, retraits: st.dels, erreurs: st.errors } : null; },
    active: (mid) => live.has(mid),
    tick,
    close() { if (timer) clearInterval(timer); timer = null; },
  };
}

// Configuration par l'environnement (valeurs jamais journalisées). Sans R2 ou sans URL publique : pas de relais.
function fromEnv(e) {
  const need = ['NORIA_DIRECT_URL', 'NORIA_DIRECT_SECRET', 'NORIA_R2_ENDPOINT', 'NORIA_R2_BUCKET', 'NORIA_R2_ACCESS_KEY_ID', 'NORIA_R2_SECRET_ACCESS_KEY'];
  if (need.some((k) => !e[k])) return null;
  return createRelay({ dir: e.NORIA_DIRECT_DIR || '/diffusion', publicBase: e.NORIA_DIRECT_URL,
    r2: { endpoint: e.NORIA_R2_ENDPOINT, bucket: e.NORIA_R2_BUCKET, accessKeyId: e.NORIA_R2_ACCESS_KEY_ID, secretAccessKey: e.NORIA_R2_SECRET_ACCESS_KEY } });
}

module.exports = { fromEnv, createRelay, s3Request, parsePlaylist };
