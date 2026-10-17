'use strict';
// Clés par école : paire Ed25519 (signature des relevés officiels) et secret HMAC (jetons des QR de badge).
// Table school_key lue par la connexion système seulement (jamais par le rôle applicatif soumis à la RLS).
// Clé privée chiffrée en AES-256-GCM quand NORIA_CLE_MAITRE (32 octets, hex ou base64) est réglée.
const crypto = require('node:crypto');

let warned = false;
function masterKey() {
  const raw = process.env.NORIA_CLE_MAITRE || '';
  if (!raw) {
    if (!warned && process.env.NODE_ENV === 'production') { warned = true; console.warn('[clés] NORIA_CLE_MAITRE absente : clés privées des écoles non chiffrées en base'); }
    return null;
  }
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('NORIA_CLE_MAITRE : 32 octets attendus (hex ou base64)');
  return buf;
}
function seal(plain) {
  const k = masterKey(); if (!k) return { value: plain, enc: 0 };
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const out = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return { value: [iv, c.getAuthTag(), out].map((b) => b.toString('base64')).join('.'), enc: 1 };
}
function unseal(value, enc) {
  if (!enc) return value;
  const k = masterKey(); if (!k) throw new Error('NORIA_CLE_MAITRE nécessaire pour lire la clé de l’école');
  const [iv, tag, data] = value.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', k, iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

// sys : connexion système (ctx.db). Crée les clés au premier usage (course entre deux requêtes : la première gagne).
async function schoolKeys(sys, schoolId) {
  let row = await sys.get('SELECT * FROM school_key WHERE school_id = ?', schoolId);
  if (!row) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const priv = seal(privateKey.export({ type: 'pkcs8', format: 'pem' }));
    const keyId = crypto.createHash('sha256').update(Buffer.from(pub, 'base64')).digest('hex').slice(0, 16);
    try {
      await sys.run('INSERT INTO school_key (school_id, key_id, public_key, private_key, private_enc, badge_secret) VALUES (?,?,?,?,?,?)',
        schoolId, keyId, pub, priv.value, priv.enc, crypto.randomBytes(32).toString('base64'));
    } catch (e) { if (!/UNIQUE|23505|duplicate/.test(e.message + (e.code || ''))) throw e; }
    row = await sys.get('SELECT * FROM school_key WHERE school_id = ?', schoolId);
  }
  return {
    keyId: row.key_id,
    publicKey: crypto.createPublicKey({ key: Buffer.from(row.public_key, 'base64'), format: 'der', type: 'spki' }),
    privateKey: () => crypto.createPrivateKey(unseal(row.private_key, row.private_enc)),
    badgeSecret: Buffer.from(row.badge_secret, 'base64'),
  };
}
async function publicKey(sys, schoolId) {
  const row = await sys.get('SELECT key_id, public_key FROM school_key WHERE school_id = ?', schoolId);
  return row ? { keyId: row.key_id, publicKey: crypto.createPublicKey({ key: Buffer.from(row.public_key, 'base64'), format: 'der', type: 'spki' }) } : null;
}

// Clé Ed25519 du ministère (bloc 6, portail du ministère) : une seule clé active (la plus ancienne), créée au premier
// usage, chiffrée comme celles des écoles. Elle signe la décision du ministère sur un transfert.
const toPub = (b64) => crypto.createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' });
async function ministryKeys(sys) {
  let row = await sys.get('SELECT * FROM ministry_key ORDER BY id LIMIT 1');
  if (!row) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const priv = seal(privateKey.export({ type: 'pkcs8', format: 'pem' }));
    const keyId = `M${crypto.createHash('sha256').update(Buffer.from(pub, 'base64')).digest('hex').slice(0, 15)}`;
    await sys.run('INSERT INTO ministry_key (key_id, public_key, private_key, private_enc) VALUES (?,?,?,?)', keyId, pub, priv.value, priv.enc);
    row = await sys.get('SELECT * FROM ministry_key ORDER BY id LIMIT 1');
  }
  return { keyId: row.key_id, publicKey: toPub(row.public_key), privateKey: () => crypto.createPrivateKey(unseal(row.private_key, row.private_enc)) };
}
async function ministryPublicKey(sys, keyId) {
  const row = await sys.get('SELECT key_id, public_key FROM ministry_key WHERE key_id = ?', String(keyId || ''));
  return row ? { keyId: row.key_id, publicKey: toPub(row.public_key) } : null;
}

// Message signé d'un relevé : type, code de vérification et empreinte SHA-256 du PDF.
const transcriptMessage = (code, sha256) => Buffer.from(`NORIA-RELEVE|v1|${code}|${sha256}`, 'utf8');
const sign = (privateKey, msg) => crypto.sign(null, msg, privateKey).toString('base64');
const verify = (publicKey, msg, sig) => { try { return crypto.verify(null, msg, publicKey, Buffer.from(String(sig), 'base64')); } catch { return false; } };

module.exports = { schoolKeys, publicKey, ministryKeys, ministryPublicKey, transcriptMessage, sign, verify, seal, unseal };
