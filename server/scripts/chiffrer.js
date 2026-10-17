#!/usr/bin/env node
'use strict';
// Chiffrement AES-256-GCM en flux (entrée standard → sortie standard), clé tirée de l'environnement.
//   NORIA_BACKUP_KEY : 32 octets, en hexadécimal (64 caractères) ou base64. Générer : openssl rand -hex 32
//   node scripts/chiffrer.js chiffrer   < sauvegarde.dump > sauvegarde.dump.enc
//   node scripts/chiffrer.js dechiffrer < sauvegarde.dump.enc > sauvegarde.dump
// Format : « NORIAGCM1 » (9 octets) + IV (12) + chiffré + étiquette d'authentification (16).
// Remarque : la commande « openssl enc » ne prend pas en charge GCM, d'où ce petit outil (module natif de Node).
// En déchiffrement, la sortie n'est fiable que si le code de retour vaut 0 (étiquette vérifiée à la fin) :
// le script de restauration écrit dans un fichier temporaire et l'abandonne en cas d'échec.
const crypto = require('node:crypto');
const { Transform, pipeline } = require('node:stream');

const MAGIC = Buffer.from('NORIAGCM1');
const TAG = 16;

function readKey(env = process.env) {
  const v = String(env.NORIA_BACKUP_KEY || '').trim();
  if (!v) throw new Error('NORIA_BACKUP_KEY manquante');
  const key = /^[0-9a-f]{64}$/i.test(v) ? Buffer.from(v, 'hex') : Buffer.from(v, 'base64');
  if (key.length !== 32) throw new Error('NORIA_BACKUP_KEY doit faire 32 octets (64 caractères hexadécimaux ou base64)');
  return key;
}

function encryptStream(key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  let head = false;
  return new Transform({
    transform(chunk, _e, cb) {
      if (!head) { this.push(Buffer.concat([MAGIC, iv])); head = true; }
      cb(null, c.update(chunk));
    },
    flush(cb) {
      if (!head) this.push(Buffer.concat([MAGIC, iv]));
      this.push(c.final()); this.push(c.getAuthTag()); cb();
    },
  });
}

function decryptStream(key) {
  let buf = Buffer.alloc(0);
  let d = null;
  return new Transform({
    transform(chunk, _e, cb) {
      buf = Buffer.concat([buf, chunk]);
      if (!d) {
        if (buf.length < MAGIC.length + 12) return cb();
        if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) return cb(new Error('format inconnu (en-tête NORIAGCM1 absent)'));
        d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(MAGIC.length, MAGIC.length + 12));
        buf = buf.subarray(MAGIC.length + 12);
      }
      // On garde toujours les 16 derniers octets : ce peut être l'étiquette.
      if (buf.length > TAG) { const out = d.update(buf.subarray(0, buf.length - TAG)); buf = buf.subarray(buf.length - TAG); return cb(null, out); }
      cb();
    },
    flush(cb) {
      if (!d || buf.length !== TAG) return cb(new Error('fichier tronqué'));
      try { d.setAuthTag(buf); this.push(d.final()); cb(); } catch { cb(new Error('authentification échouée : clé incorrecte ou fichier altéré')); }
    },
  });
}

if (require.main === module) {
  const mode = process.argv[2];
  if (!['chiffrer', 'dechiffrer'].includes(mode)) { console.error('Usage : node scripts/chiffrer.js chiffrer|dechiffrer < entrée > sortie'); process.exit(2); }
  let key;
  try { key = readKey(); } catch (e) { console.error(`Échec : ${e.message}`); process.exit(2); }
  pipeline(process.stdin, mode === 'chiffrer' ? encryptStream(key) : decryptStream(key), process.stdout, (e) => {
    if (e) { console.error(`Échec : ${e.message}`); process.exit(1); }
  });
}

module.exports = { encryptStream, decryptStream, readKey };
