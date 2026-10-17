#!/usr/bin/env node
'use strict';
// Crée un compte administrateur de la plateforme (super-admin), sans école. Seul moyen de créer ce compte :
// aucune route publique ne le permet. La connexion exigera ensuite le mot de passe ET un code à 6 chiffres envoyé
// par SMS (si --telephone) ou par e-mail.
//   cd server && npm run admin:creer -- --email admin@exemple.org --nom "Nom Prénom" [--telephone +509…]
// Le mot de passe (14 caractères minimum) est demandé sans écho, ou lu dans NORIA_ADMIN_PASSWORD (automatisation).
// Base : DATABASE_URL (PostgreSQL) ou NORIA_DB (SQLite), comme le serveur.
const { openStore } = require('../src/store');
const { createAdmin } = require('../src/plateforme');

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) { const m = argv[i].match(/^--([\w-]+)(?:=(.*))?$/); if (m) o[m[1]] = m[2] ?? argv[++i]; }
  return o;
}
function askHidden(q) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error('terminal requis pour saisir le mot de passe (ou NORIA_ADMIN_PASSWORD)'));
    process.stdout.write(q);
    const stdin = process.stdin; let buf = '';
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    const on = (ch) => {
      if (ch === '\r' || ch === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', on); process.stdout.write('\n'); resolve(buf); }
      else if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130); }
      else if (ch === '\u007f') buf = buf.slice(0, -1);
      else buf += ch;
    };
    stdin.on('data', on);
  });
}

(async () => {
  const a = args(process.argv.slice(2));
  if (!a.email || !a.nom) { console.error('Usage : npm run admin:creer -- --email <e-mail> --nom "<nom>" [--telephone <numéro>]'); process.exit(2); }
  let pw = process.env.NORIA_ADMIN_PASSWORD;
  if (!pw) { pw = await askHidden('Mot de passe (14 caractères minimum) : '); const again = await askHidden('Confirmer : '); if (pw !== again) throw new Error('les deux saisies diffèrent'); }
  const db = await openStore(process.env.DATABASE_URL || process.env.NORIA_DB || 'noria-demo.sqlite');
  try {
    const id = await createAdmin(db, { email: a.email, name: a.nom, phone: a.telephone, password: pw });
    console.log(`Administrateur de la plateforme créé (n° ${id}) : ${a.email.toLowerCase()}. Connexion : /#admin (mot de passe + code).`);
  } finally { await db.close(); }
})().catch((e) => { console.error(`Échec : ${/UNIQUE|duplicate/.test(e.message) ? 'ce compte existe déjà' : e.message}`); process.exit(1); });
