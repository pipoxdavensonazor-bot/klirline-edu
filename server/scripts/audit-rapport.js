'use strict';
// Rapport de dépendances pour l'assistant sécurité : lance `npm audit --json` (sur le poste, en CI ou par cron, jamais
// depuis le serveur NORIA) et dépose le résultat dans data/npm-audit.json (ou le chemin donné / NORIA_AUDIT_RAPPORT).
// Le serveur ne fait que lire ce fichier (règle « dépendances »). Usage : npm run audit:rapport [-- chemin]
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const out = process.argv[2] || process.env.NORIA_AUDIT_RAPPORT || path.join(__dirname, '..', 'data', 'npm-audit.json');
const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--json'], { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let j; try { j = JSON.parse(r.stdout); } catch { console.error('npm audit : sortie illisible', (r.stderr || '').slice(0, 500)); process.exit(2); }
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(j, null, 1));
const v = (j.metadata && j.metadata.vulnerabilities) || {};
console.log(`Rapport écrit : ${out} — critiques ${v.critical || 0}, élevées ${v.high || 0}, modérées ${v.moderate || 0}, faibles ${v.low || 0}`);
