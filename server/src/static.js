'use strict';
// Sert l'application (index.html sur /app, et src/) : liste blanche d'extensions, pas de sortie du dossier,
// compression gzip, ETag et cache court. Rien d'autre du dépôt (server/, .git, docs) n'est exposé.
// La racine / est le portail public (server/src/portail-pages.js) ; /index.html reste un alias de l'application.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};
const COMPRESS = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest']);
// Fichiers servis à la racine (application installable) en plus de index.html et src/.
const ROOT_FILES = new Set(['/sw.js', '/manifest.webmanifest', '/favicon.ico']);

// CSP de la page : aucun script ni style en ligne (gestionnaires par délégation data-action, styles en classes).
// Le test test/csp.test.js échoue si un attribut on* ou style="" réapparaît dans le HTML ou les gabarits JS.
const HTML_CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'",
  "img-src 'self' data:", "connect-src 'self'", "frame-src https://meet.systemli.org", "object-src 'none'",
  "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

function createStatic(root) {
  const rootAbs = path.resolve(root);
  const srcAbs = path.join(rootAbs, 'src');
  const cache = new Map();

  function resolve(pathname) {
    let p;
    try { p = decodeURIComponent(pathname); } catch { return null; }
    if (p === '/app' || p === '/index.html') return path.join(rootAbs, 'index.html');
    // Bloc 6 : portail du ministère (page séparée, légère ; 404 en amont tant que NORIA_MINISTERE ne vaut pas 1).
    if (p === '/ministere' || p === '/ministere/') return path.join(rootAbs, 'ministere.html');
    if (ROOT_FILES.has(p)) return path.join(rootAbs, p.slice(1));
    if (!p.startsWith('/src/') || p.includes('\0')) return null;
    const abs = path.resolve(rootAbs, '.' + p);
    if (!abs.startsWith(srcAbs + path.sep)) return null;
    if (!TYPES[path.extname(abs)]) return null;
    return abs;
  }

  // Liste des fichiers de l'interface (lus dans index.html) et version = empreinte de leur contenu :
  // toute modification d'un fichier change sw.js, donc le navigateur remplace le cache.
  function precacheList() {
    const html = fs.readFileSync(path.join(rootAbs, 'index.html'), 'utf8');
    const found = [...html.matchAll(/(?:href|src)="(src\/[^"#?]+)"/g)].map((m) => '/' + m[1]);
    return [...new Set([...found, '/manifest.webmanifest', '/favicon.ico', '/src/favicon-32.png', '/src/apple-touch-icon.png', '/src/icon-192.png', '/src/icon-512.png'])]
      .filter((u) => { const a = resolve(u); return a && fs.existsSync(a); });
  }
  function swSource(src) {
    const list = precacheList();
    const h = crypto.createHash('sha256');
    for (const u of list) h.update(u).update(fs.readFileSync(resolve(u)));
    h.update(fs.readFileSync(path.join(rootAbs, 'index.html')));
    return src.replace('__NORIA_VERSION__', h.digest('hex').slice(0, 12)).replace('__NORIA_ASSETS__', JSON.stringify(list));
  }

  function load(abs) {
    const st = fs.statSync(abs, { throwIfNoEntry: false });
    if (!st || !st.isFile()) return null;
    const hit = cache.get(abs);
    const isSw = abs === path.join(rootAbs, 'sw.js');
    if (hit && hit.mtime === st.mtimeMs && !isSw) return hit;
    let raw = fs.readFileSync(abs);
    const ext = path.extname(abs);
    // Signale au navigateur qu'un serveur NORIA est présent : sans ce repère (fichiers statiques seuls),
    // la maquette reste en démonstration locale sans même interroger /api/config.
    if (ext === '.html') raw = Buffer.from(raw.toString('utf8').replace('<head>', '<head><meta name="noria-server" content="1">'));
    if (abs === path.join(rootAbs, 'sw.js')) raw = Buffer.from(swSource(raw.toString('utf8')));
    const entry = {
      mtime: st.mtimeMs, raw, type: TYPES[ext], ext,
      gz: COMPRESS.has(ext) ? zlib.gzipSync(raw, { level: 9 }) : null,
      etag: '"' + crypto.createHash('sha1').update(raw).digest('base64url').slice(0, 16) + '"',
    };
    cache.set(abs, entry);
    return entry;
  }

  return function serve(req, res, baseHeaders) {
    const url = new URL(req.url, 'http://localhost');
    const abs = resolve(url.pathname);
    const f = abs && load(abs);
    if (!f) return false;
    const headers = {
      ...baseHeaders,
      'content-type': f.type,
      // HTML et sw.js : revalidés à chaque fois (mises à jour) ; le reste : cache court, le service worker fait le reste.
      'cache-control': f.ext === '.html' || url.pathname === '/sw.js' ? 'no-cache' : 'public, max-age=3600',
      etag: f.etag, vary: 'Accept-Encoding',
    };
    // Caméra autorisée pour la page elle-même seulement (scan des badges) ; jamais pour un cadre tiers.
    if (f.ext === '.html') { headers['content-security-policy'] = HTML_CSP; headers['permissions-policy'] = 'camera=(self), microphone=(), geolocation=()'; }
    else delete headers['content-security-policy'];
    if (req.headers['if-none-match'] === f.etag) { res.writeHead(304, headers); res.end(); return true; }
    const gzip = f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    const body = gzip ? f.gz : f.raw;
    if (gzip) headers['content-encoding'] = 'gzip';
    headers['content-length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  };
}

module.exports = { createStatic, HTML_CSP };
