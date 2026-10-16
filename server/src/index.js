'use strict';
const { openDb } = require('./db');
const { createServer } = require('./app');
const { seed } = require('./seed');

const file = process.env.NORIA_DB || 'noria-demo.sqlite';
const db = openDb(file);
if (!db.prepare('SELECT COUNT(*) n FROM school').get().n) { seed(db); console.log('Données fictives insérées.'); }
const port = Number(process.env.PORT || 3100);
createServer(db).listen(port, '127.0.0.1', () => console.log(`API NORIA (démo, données fictives) : http://127.0.0.1:${port}`));
