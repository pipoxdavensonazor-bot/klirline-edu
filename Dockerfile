# syntax=docker/dockerfile:1
# Image NORIA : Node 20, dépendances de production seulement, utilisateur non root, système de fichiers en lecture seule
# possible (aucune écriture hors /tmp). Construire depuis la racine du dépôt : docker build -t noria .

# --- Étape 1 : dépendances (outils de compilation disponibles si un module natif n'a pas de binaire précompilé)
FROM node:20-bookworm-slim AS deps
WORKDIR /app/server
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# --- Étape 2 : exécution (sans compilateur ni npm cache)
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3100 NODE_OPTIONS=--enable-source-maps
WORKDIR /app
# Fichiers appartenant à root, lisibles par tous : l'utilisateur « node » ne peut pas modifier le code.
COPY index.html ministere.html sw.js manifest.webmanifest ./
COPY src ./src
COPY server/package.json ./server/
COPY server/src ./server/src
COPY server/migrations ./server/migrations
COPY server/scripts ./server/scripts
COPY --from=deps /app/server/node_modules ./server/node_modules
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
STOPSIGNAL SIGTERM
CMD ["node", "server/src/index.js"]
