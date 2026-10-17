'use strict';
const { openStore } = require('./store');
const { createServer } = require('./app');
const { seed, seedMulti, seedPortal } = require('./seed');
const { createNotifier } = require('./notify');

// DATABASE_URL=postgres://… (production) ; sinon NORIA_DB (fichier SQLite, développement).
async function main() {
  const url = process.env.DATABASE_URL || process.env.NORIA_DB || 'noria-demo.sqlite';
  const prod = process.env.NODE_ENV === 'production';
  const demo = process.env.NORIA_DEMO === '1';
  if (demo && prod) {
    console.error('Refus : NORIA_DEMO=1 est interdit avec NODE_ENV=production.');
    process.exit(1);
  }
  // Adaptateurs d'envoi : une configuration incomplète arrête le démarrage ; « console » reste le défaut en développement.
  const notifier = createNotifier(process.env);
  if (prod && (notifier.simulated.sms || notifier.simulated.email))
    console.warn('Attention : envoi simulé (console) en production — définir NORIA_SMS_PROVIDER et NORIA_EMAIL_PROVIDER.');
  console.log(`Envoi : SMS ${notifier.sms.name}, e-mail ${notifier.email.name}.`);
  const db = await openStore(url);
  const empty = !(await db.get('SELECT COUNT(*) AS n FROM school')).n;
  if (empty && demo) { const ids = await seedMulti(db, await seed(db)); await seedPortal(db, ids); console.log('Données fictives insérées (NORIA_DEMO=1).'); }
  else if (empty) console.log('Base vide : aucune donnée de démonstration (lancer avec NORIA_DEMO=1 pour en créer).');
  const port = Number(process.env.PORT || 3100);
  const host = process.env.HOST || '127.0.0.1';
  // En production : cookies Secure et confiance au mandataire HTTPS (Caddy), sauf NORIA_TRUST_PROXY=0.
  const server = createServer(db, {
    notifier, demo,
    secureCookie: prod || process.env.NORIA_SECURE_COOKIE === '1',
    trustProxy: process.env.NORIA_TRUST_PROXY ? process.env.NORIA_TRUST_PROXY === '1' : prod,
  });
  // Assistant sécurité : analyse périodique interne (NORIA_ASSISTANT_INTERVALLE_MIN, 5 min par défaut ; 0 = manuelle seulement).
  const { backups, dbSize } = require('./plateforme');
  if (server.sec) server.sec.start({ backups, dbSize: () => dbSize(db) });
  server.keepAliveTimeout = 65_000; // plus long que celui du mandataire, pour éviter des 502 sporadiques
  server.listen(port, host, () => console.log(`NORIA (${db.kind}${demo ? ', démo' : ''}) : http://${host}:${port}`));

  // Arrêt propre (docker stop, systemd, déploiement) : on n'accepte plus de connexions, on laisse finir les
  // requêtes en cours, puis on ferme la base. Au-delà de 10 s, sortie forcée.
  let stopping = false;
  const stop = (signal) => {
    if (stopping) return; stopping = true;
    console.log(`${signal} reçu : arrêt en cours…`);
    const force = setTimeout(() => { console.error('Arrêt forcé (délai dépassé).'); process.exit(1); }, 10_000);
    force.unref();
    if (server.sec) server.sec.stop();
    server.close(async () => {
      try { await db.close(); } catch (e) { console.error(e); }
      console.log('Arrêt terminé.');
      process.exit(0);
    });
    server.closeIdleConnections?.();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

main().catch((e) => { console.error(e); process.exit(1); });
