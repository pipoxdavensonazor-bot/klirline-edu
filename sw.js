/* NORIA — service worker : met l'interface en cache pour qu'elle s'ouvre sans réseau.
   Les réponses /api/ (données personnelles) ne sont JAMAIS mises en cache ici.
   VERSION et ASSETS sont remplis par le serveur (server/src/static.js) à partir de index.html. */
"use strict";
const VERSION = "__NORIA_VERSION__";
const ASSETS = __NORIA_ASSETS__;
const CACHE = "noria-ui-" + VERSION;
const HTML_TIMEOUT_MS = 3500; // réseau lent : au-delà, on sert la page en cache

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE)
    // no-cache : revalidation par ETag (304, quelques centaines d'octets) au lieu d'un second téléchargement complet
    // des fichiers que la page vient de recevoir.
    .then((c) => c.addAll(["/", ...ASSETS].map((u) => new Request(u, { cache: "no-cache" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("noria-ui-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function withTimeout(p, ms) { return new Promise((ok, ko) => { const t = setTimeout(() => ko(new Error("délai")), ms); p.then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); ko(e); }); }); }

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return; // réseau seul
  if (req.mode === "navigate") {
    // Page : réseau d'abord (pour recevoir les mises à jour), cache si hors ligne ou trop lent.
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await withTimeout(fetch(req), HTML_TIMEOUT_MS);
        if (res.ok && url.pathname === "/") cache.put("/", res.clone());
        return res;
      } catch (err) {
        return (await cache.match("/")) || Response.error();
      }
    })());
    return;
  }
  // Fichiers de l'interface : cache d'abord (versionné), réseau sinon.
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
