'use strict';
// Sert l'application (index.html sur /app, et src/) : liste blanche d'extensions, pas de sortie du dossier,
// compression gzip, ETag et cache court. Rien d'autre du dépôt (server/, .git, docs) n'est exposé.
// La racine / est le portail public (server/src/portail-pages.js) ; /index.html reste un alias de l'application.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const TYPES = {
  '.mjs': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2',  // bibliothèques locales (PDF.js, polices KaTeX)
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.ico': 'image/x-icon',
};
const COMPRESS = new Set(['.html', '.js', '.mjs', '.css', '.svg', '.json', '.webmanifest']);
// Fichiers servis à la racine (application installable) en plus de index.html et src/.
const ROOT_FILES = new Set(['/sw.js', '/manifest.webmanifest', '/favicon.ico']);
// Icônes demandées par les navigateurs à la racine (bloc 8) : copies servies depuis src/.
const ROOT_ALIASES = { '/apple-touch-icon.png': '/src/apple-touch-icon.png', '/apple-touch-icon-precomposed.png': '/src/apple-touch-icon.png' };
// Scripts et feuilles de style : appelés avec ?v=<version> (les images gardent leur URL, aussi utilisée par les gabarits JS).
const VERSIONNES = /^\/src\/.+\.(?:js|css)$/;

// CSP de la page : aucun script ni style en ligne (gestionnaires par délégation data-action, styles en classes).
// Le test test/csp.test.js échoue si un attribut on* ou style="" réapparaît dans le HTML ou les gabarits JS.
// Diffusion des réunions (NORIA_DIRECT_URL) : le lecteur hls.js lit les segments sur le domaine R2 (connect-src) et
// les joue par Media Source Extensions (media-src blob:) ; Safari et Chrome récents lisent la liste HLS nativement et
// chargent les segments en media-src. Seule cette origine est ajoutée.
const directOrigin = (() => { try { const u = new URL(process.env.NORIA_DIRECT_URL || ''); return u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === '127.0.0.1') ? u.origin : ''; } catch { return ''; } })();
const HTML_CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'",
  "img-src 'self' data:", `connect-src 'self'${directOrigin ? ' ' + directOrigin : ''}`, `media-src 'self' https: blob:${directOrigin ? ' ' + directOrigin : ''}`, "frame-src https://meet.systemli.org", "object-src 'none'",
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
    // /tarifs est une page du portail (server/src/portail-pages.js), avec le même en-tête et le même pied de page.
    if (ROOT_FILES.has(p)) return path.join(rootAbs, p.slice(1));
    if (ROOT_ALIASES[p]) p = ROOT_ALIASES[p];
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
    h.update(src); // toute modification de sw.js lui-même change aussi la version (bloc 8)
    // Mêmes URL que la page (src/x.js?v=…) : le service worker revalide ce que la page vient de recevoir (304) au lieu
    // de tout retélécharger sous une autre URL.
    const v = assetVersion();
    const urls = list.map((u) => (VERSIONNES.test(u) ? `${u}?v=${v}` : u));
    return src.replace('__NORIA_VERSION__', h.digest('hex').slice(0, 12)).replace('__NORIA_ASSETS__', JSON.stringify(urls));
  }

  // Version des fichiers de l'interface = empreinte du contenu de src/ (recalculée au plus toutes les 60 s).
  // Ajoutée aux URL des scripts et feuilles de style (src/x.js?v=…) dans les pages HTML et par les chargements à la demande (NORIA_U.v) :
  // après un déploiement, les URL changent, donc ni le navigateur ni le cache Cloudflare ne servent d'ancienne version.
  let version = null; let versionAt = 0;
  function assetVersion() {
    if (version && Date.now() - versionAt < 60e3) return version;
    const h = crypto.createHash('sha256');
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) walk(abs);
        else if (e.isFile() && TYPES[path.extname(e.name)]) h.update(path.relative(srcAbs, abs)).update('\0').update(fs.readFileSync(abs));
      }
    };
    try { walk(srcAbs); } catch { /* pas de dossier src : version fixe */ }
    version = h.digest('hex').slice(0, 10); versionAt = Date.now();
    return version;
  }
  function versionHtml(html, v) {
    // Signale au navigateur qu'un serveur NORIA est présent : sans ce repère (fichiers statiques seuls),
    // la maquette reste en démonstration locale sans même interroger /api/config.
    return html.replace('<head>', `<head><meta name="noria-server" content="1"><meta name="noria-version" content="${v}">`)
      .replace(/((?:href|src)=")(src\/[^"#?]+\.(?:js|css))"/g, `$1$2?v=${v}"`);
  }

  function load(abs) {
    const st = fs.statSync(abs, { throwIfNoEntry: false });
    if (!st || !st.isFile()) return null;
    const hit = cache.get(abs);
    const isSw = abs === path.join(rootAbs, 'sw.js');
    const ext = path.extname(abs);
    const v = ext === '.html' ? assetVersion() : null;
    if (hit && hit.mtime === st.mtimeMs && hit.v === v && !isSw) return hit;
    let raw = fs.readFileSync(abs);
    if (ext === '.html') raw = Buffer.from(versionHtml(raw.toString('utf8'), v));
    if (abs === path.join(rootAbs, 'sw.js')) raw = Buffer.from(swSource(raw.toString('utf8')));
    const entry = {
      mtime: st.mtimeMs, v, raw, type: TYPES[ext], ext,
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
      // HTML et sw.js : revalidés à chaque fois (mises à jour). Fichier demandé avec la version courante (?v=, posée
      // dans les pages HTML) : immuable, 1 an (navigateur, Cloudflare). Le reste : cache court, le service worker fait le reste.
      'cache-control': f.ext === '.html' || url.pathname === '/sw.js' ? 'no-cache'
        : url.pathname.startsWith('/src/') && url.searchParams.get('v') === assetVersion() ? 'public, max-age=31536000, immutable'
          : 'public, max-age=3600',
      etag: f.etag, vary: 'Accept-Encoding',
    };
    // Caméra autorisée pour la page elle-même seulement (scan des badges) ; jamais pour un cadre tiers.
    if (f.ext === '.html') { headers['content-security-policy'] = HTML_CSP; headers['permissions-policy'] = 'camera=(self "https://meet.systemli.org"), microphone=(self "https://meet.systemli.org"), display-capture=(self "https://meet.systemli.org"), geolocation=()'; }
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
