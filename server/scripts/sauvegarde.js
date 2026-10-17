#!/usr/bin/env node
'use strict';
// Usage :
//   DATABASE_URL=postgres://… node scripts/sauvegarde.js sauver  noria-2026-10-16.json.gz
//   DATABASE_URL=postgres://… node scripts/sauvegarde.js restaurer noria-2026-10-16.json.gz   (base cible vide)
//   (sans DATABASE_URL : NORIA_DB, fichier SQLite)
// NORIA_BACKUP_KEY (32 octets, hexadécimal ou base64, comme scripts/chiffrer.js) : fichier chiffré AES-256-GCM.
// Obligatoire en production (le fichier contient les clés des écoles et du ministère, scellées par NORIA_CLE_MAITRE).
const fs = require('node:fs');
const { openStore } = require('../src/store');
const { dump, restore, toFile, fromFile } = require('../src/backup');
const { readKey } = require('./chiffrer');

async function main() {
  const [cmd, file] = process.argv.slice(2);
  if (!['sauver', 'restaurer'].includes(cmd) || !file) {
    console.error('Usage : node scripts/sauvegarde.js sauver|restaurer <fichier.json.gz>'); process.exit(2);
  }
  const key = process.env.NORIA_BACKUP_KEY ? readKey() : null;
  if (cmd === 'sauver' && !key && process.env.NODE_ENV === 'production') throw new Error('NORIA_BACKUP_KEY obligatoire en production (sauvegarde chiffrée)');
  const db = await openStore(process.env.DATABASE_URL || process.env.NORIA_DB || 'noria-demo.sqlite');
  try {
    if (cmd === 'sauver') {
      const data = await dump(db);
      fs.writeFileSync(file, toFile(data, key), { mode: 0o600 });
      const n = Object.values(data.tables).reduce((a, r) => a + r.length, 0);
      console.log(`Sauvegarde écrite : ${file} (${n} lignes, sha256 ${data.sha256.slice(0, 12)}…${key ? ', chiffrée AES-256-GCM' : ', NON chiffrée'})`);
    } else {
      const counts = await restore(db, fromFile(fs.readFileSync(file), key));
      console.log(`Restauration terminée : ${Object.values(counts).reduce((a, b) => a + b, 0)} lignes.`);
    }
  } finally { await db.close(); }
}
main().catch((e) => { console.error(`Échec : ${e.message}`); process.exit(1); });
