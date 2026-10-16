'use strict';
// Base de test : SQLite en mémoire par défaut ; PostgreSQL si NORIA_TEST_PG=postgres://… (compte autorisé à créer des
// bases). Chaque fichier de test reçoit sa propre base PostgreSQL, supprimée à la fin.
const crypto = require('node:crypto');
const { openStore } = require('../src/store');

const PG = process.env.NORIA_TEST_PG || '';

async function openTestDb() {
  if (!PG) { const db = await openStore(':memory:'); db.cleanup = () => db.close(); return db; }
  const { Client } = require('pg');
  const name = `noria_t_${crypto.randomBytes(5).toString('hex')}`;
  const admin = new Client({ connectionString: PG });
  await admin.connect(); await admin.query(`CREATE DATABASE ${name}`); await admin.end();
  const u = new URL(PG); u.pathname = `/${name}`;
  const db = await openStore(u.toString());
  db.url = u.toString();
  db.cleanup = async () => {
    await db.close();
    const c = new Client({ connectionString: PG }); await c.connect();
    await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); await c.end();
  };
  return db;
}

const FK = /FOREIGN KEY|foreign key/;
module.exports = { openTestDb, PG, FK };
