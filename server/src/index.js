'use strict';
const { openStore } = require('./store');
const { createServer } = require('./app');
const { seed } = require('./seed');

// DATABASE_URL=postgres://… (production) ; sinon NORIA_DB (fichier SQLite, développement).
async function main() {
  const url = process.env.DATABASE_URL || process.env.NORIA_DB || 'noria-demo.sqlite';
  const demo = process.env.NORIA_DEMO === '1';
  if (demo && process.env.NODE_ENV === 'production') {
    console.error('Refus : NORIA_DEMO=1 est interdit avec NODE_ENV=production.');
    process.exit(1);
  }
  const db = await openStore(url);
  const empty = !(await db.get('SELECT COUNT(*) AS n FROM school')).n;
  if (empty && demo) { await seed(db); console.log('Données fictives insérées (NORIA_DEMO=1).'); }
  else if (empty) console.log('Base vide : aucune donnée de démonstration (lancer avec NORIA_DEMO=1 pour en créer).');
  const port = Number(process.env.PORT || 3100);
  const host = process.env.HOST || '127.0.0.1';
  createServer(db, { demo, secureCookie: process.env.NODE_ENV === 'production' || process.env.NORIA_SECURE_COOKIE === '1' })
    .listen(port, host, () => console.log(`NORIA (${db.kind}${demo ? ', démo' : ''}) : http://${host}:${port}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
