'use strict';
// Adaptateur optionnel pour brancher plus tard un modèle de langage externe à l'assistant sécurité.
// DÉSACTIVÉ PAR DÉFAUT : sans NORIA_ASSISTANT_LLM, l'assistant répond uniquement avec ses règles et son guide intégré.
// Interface : { name, redact(alerte) → objet sans donnée personnelle, ask({ question, alerte }) → texte }.
// Jamais de données personnelles d'élèves : seuls partent la règle, la gravité, le nombre d'occurrences et des
// compteurs ; preuves, comptes, IP, noms, e-mails et numéros sont retirés, et la question est nettoyée.
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONE = /\+?\d[\d\s.-]{6,}\d/g;
const IPV4 = /\b\d{1,3}(\.\d{1,3}){3}\b/g;
function scrub(s) { return String(s || '').replace(EMAIL, '[e-mail]').replace(IPV4, '[ip]').replace(PHONE, '[numéro]').slice(0, 500); }
function redact(alert) {
  return { regle: String(alert.rule || ''), gravite: String(alert.severity || ''), occurrences: Number(alert.hits || 0), statut: String(alert.status || '') };
}
function createLlm(env = process.env) {
  const kind = String(env.NORIA_ASSISTANT_LLM || '').toLowerCase();
  if (!kind || kind === '0' || kind === 'non') return null;
  if (kind !== 'http') throw new Error(`NORIA_ASSISTANT_LLM inconnu : ${kind} (seul « http » est prévu)`);
  const url = env.NORIA_ASSISTANT_LLM_URL || '';
  if (!/^https:\/\//.test(url)) throw new Error('NORIA_ASSISTANT_LLM_URL doit être une adresse https');
  return {
    name: 'llm-http', redact, scrub,
    async ask({ question, alerte }) {
      const body = { question: scrub(question), alerte: alerte && typeof alerte === 'object' ? redact(alerte) : null, langue: 'fr' };
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.NORIA_ASSISTANT_LLM_TOKEN ? { authorization: `Bearer ${env.NORIA_ASSISTANT_LLM_TOKEN}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return String(j.reponse || j.answer || '').slice(0, 2000);
    },
  };
}
module.exports = { createLlm, redact, scrub };
