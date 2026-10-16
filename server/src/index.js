'use strict';
const { openDb } = require('./db');
const { createServer } = require('./app');
const { seed } = require('./seed');

async function main() {
  const file = process.env.NORIA_DB || 'noria-demo.sqlite';
  const demo = process.env.NORIA_DEMO === '1';
  if (demo && process.env.NODE_ENV === 'production') {
    console.error('Refus : NORIA_DEMO=1 est interdit avec NODE_ENV=production.');
    process.exit(1);
  }
  const db = openDb(file);
  const empty = !db.prepare('SELECT COUNT(*) n FROM school').get().n;
  if (empty && demo) { await seed(db); console.log('Données fictives insérées (NORIA_DEMO=1).'); }
  else if (empty) console.log('Base vide : aucune donnée de démonstration (lancer avec NORIA_DEMO=1 pour en créer).');
  const port = Number(process.env.PORT || 3100);
  createServer(db).listen(port, '127.0.0.1', () => console.log(`API NORIA (démo) : http://127.0.0.1:${port}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
