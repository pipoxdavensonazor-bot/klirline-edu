'use strict';
// Bloc 7 : adaptateurs des fournisseurs pour les adresses e-mail des élèves.
//   - Routage entrant (« synchronisation ») : chaque adresse NORIA est un transfert vers l'adresse personnelle
//     vérifiée de l'élève (ou d'un parent). Le contenu des messages ne passe JAMAIS par NORIA.
//       simule        : défaut (développement, tests) ; table en mémoire, aucun appel réseau.
//       cloudflare    : Cloudflare Email Routing (gratuit) — une règle « to = adresse → forward » par adresse.
//                       Limite : 200 règles et 200 destinations vérifiées ; au-delà, règle « catch-all » + Email
//                       Worker qui interroge POST /api/emails/entrant (voir docs/emails-eleves.md).
//       forwardemail  : Forward Email (alias par API, offre Enhanced 3 $/mois) — « à valider au branchement ».
//   - Envoi sortant (codes de vérification, avis de changement de destination) :
//       simule        : défaut ; le message est écrit dans le journal du serveur (jamais pendant les tests).
//       mailgun       : API HTTP Mailgun (POST /v3/<domaine>/messages), région US ou EU.
//       noria         : réutilise l'envoi déjà configuré pour NORIA (NORIA_SMTP_URL ou NORIA_EMAIL_WEBHOOK).
// Aucune clé n'est écrite dans le code : tout vient des variables d'environnement. Le « fetch » est injectable :
// les tests passent un faux fetch et vérifient les requêtes, sans aucun appel réseau.

const SIMULE = { routes: new Map(), sent: [] }; // état du mode simulé (lu par les tests)

class ProviderError extends Error {}
const need = (env, names, who) => {
  const miss = names.filter((n) => !env[n]);
  if (miss.length) throw new ProviderError(`${who} : variable(s) manquante(s) ${miss.join(', ')}`);
  return names.map((n) => String(env[n]));
};
async function call(fetchFn, url, init, who) {
  let res;
  try { res = await fetchFn(url, init); } catch (e) { throw new ProviderError(`${who} : réseau indisponible (${e.message})`); }
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    const msg = body && (body.message || (body.errors && body.errors[0] && body.errors[0].message));
    const err = new ProviderError(`${who} : HTTP ${res.status}${msg ? ` — ${String(msg).slice(0, 120)}` : ''}`);
    err.status = res.status; err.body = body;
    throw err;
  }
  return body || {};
}

/* ---------- Routage entrant ---------- */
function routing(env = process.env, { fetch: fetchFn = globalThis.fetch } = {}) {
  const name = String(env.NORIA_EMAIL_FOURNISSEUR || 'simule').toLowerCase();
  if (name === 'simule') {
    return {
      name, simulated: true,
      async upsert({ address, destination }) { SIMULE.routes.set(address, destination); return { ref: `simule:${address}` }; },
      async remove({ address }) { SIMULE.routes.delete(address); },
    };
  }
  if (name === 'cloudflare') {
    const base = 'https://api.cloudflare.com/client/v4';
    const headers = () => { const [token] = need(env, ['NORIA_CF_API_TOKEN'], 'Cloudflare'); return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }; };
    const ids = () => need(env, ['NORIA_CF_ZONE_ID', 'NORIA_CF_ACCOUNT_ID'], 'Cloudflare');
    return {
      name, simulated: false,
      async upsert({ address, destination, ref }) {
        const [zone, account] = ids();
        // 1. Adresse de destination : Cloudflare envoie lui-même un lien de vérification au propriétaire (une fois).
        try {
          await call(fetchFn, `${base}/accounts/${account}/email/routing/addresses`, { method: 'POST', headers: headers(), body: JSON.stringify({ email: destination }) }, 'Cloudflare');
        } catch (e) { if (!(e.status === 409 || (e.body && JSON.stringify(e.body).includes('exist')))) throw e; }
        // 2. Règle de transfert propre à l'adresse NORIA.
        const rule = { name: `NORIA ${address}`.slice(0, 256), enabled: true, matchers: [{ type: 'literal', field: 'to', value: address }], actions: [{ type: 'forward', value: [destination] }] };
        const url = ref ? `${base}/zones/${zone}/email/routing/rules/${encodeURIComponent(ref)}` : `${base}/zones/${zone}/email/routing/rules`;
        const out = await call(fetchFn, url, { method: ref ? 'PUT' : 'POST', headers: headers(), body: JSON.stringify(rule) }, 'Cloudflare');
        return { ref: (out.result && (out.result.id || out.result.tag)) || ref };
      },
      async remove({ ref }) {
        if (!ref) return;
        const [zone] = ids();
        try { await call(fetchFn, `${base}/zones/${zone}/email/routing/rules/${encodeURIComponent(ref)}`, { method: 'DELETE', headers: headers() }, 'Cloudflare'); } catch (e) { if (e.status !== 404) throw e; }
      },
    };
  }
  if (name === 'forwardemail') {
    const base = 'https://api.forwardemail.net/v1';
    const headers = () => { const [token] = need(env, ['NORIA_FE_API_TOKEN'], 'Forward Email'); return { authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}`, 'content-type': 'application/json' }; };
    const split = (a) => { const i = a.lastIndexOf('@'); return [a.slice(0, i), a.slice(i + 1)]; };
    return {
      name, simulated: false,
      async upsert({ address, destination, ref }) {
        const [local, domain] = split(address);
        const url = ref ? `${base}/domains/${encodeURIComponent(domain)}/aliases/${encodeURIComponent(ref)}` : `${base}/domains/${encodeURIComponent(domain)}/aliases`;
        const body = ref ? { recipients: [destination], is_enabled: true } : { name: local, recipients: [destination], is_enabled: true, description: 'NORIA' };
        const out = await call(fetchFn, url, { method: ref ? 'PUT' : 'POST', headers: headers(), body: JSON.stringify(body) }, 'Forward Email');
        return { ref: out.id || ref };
      },
      async remove({ address, ref }) {
        if (!ref) return;
        const domain = split(address)[1];
        try { await call(fetchFn, `${base}/domains/${encodeURIComponent(domain)}/aliases/${encodeURIComponent(ref)}`, { method: 'DELETE', headers: headers() }, 'Forward Email'); } catch (e) { if (e.status !== 404) throw e; }
      },
    };
  }
  throw new ProviderError(`fournisseur inconnu : ${name} (simule, cloudflare, forwardemail)`);
}

/* ---------- Envoi sortant ---------- */
function outbound(env = process.env, { fetch: fetchFn = globalThis.fetch, notifier = null, log = console.log } = {}) {
  const name = String(env.NORIA_EMAIL_ENVOI || 'simule').toLowerCase();
  if (name === 'simule') {
    return {
      name, simulated: true,
      async send(m) {
        SIMULE.sent.push(m); if (SIMULE.sent.length > 200) SIMULE.sent.shift();
        if (!process.env.NODE_TEST_CONTEXT) log(`[e-mail élève simulé] → ${m.to} « ${m.subject} »\n${m.text}`);
        return { id: `simule-${SIMULE.sent.length}` };
      },
    };
  }
  if (name === 'mailgun') {
    return {
      name, simulated: false,
      async send(m) {
        const [key, domain] = need(env, ['NORIA_MAILGUN_API_KEY', 'NORIA_MAILGUN_DOMAIN'], 'Mailgun');
        const host = String(env.NORIA_MAILGUN_REGION || 'us').toLowerCase() === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
        const form = new URLSearchParams({ from: m.from, to: m.to, subject: m.subject, text: m.text });
        const out = await call(fetchFn, `${host}/v3/${encodeURIComponent(domain)}/messages`, {
          method: 'POST', headers: { authorization: `Basic ${Buffer.from(`api:${key}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() }, 'Mailgun');
        return { id: out.id || null };
      },
    };
  }
  if (name === 'noria') {
    return {
      name, simulated: false,
      async send(m) {
        const a = notifier && notifier.adapter && notifier.adapter('email');
        if (!a) throw new ProviderError('envoi NORIA non configuré');
        await a.send({ to: m.to, subject: m.subject, text: m.text });
        return { id: null };
      },
    };
  }
  throw new ProviderError(`envoi inconnu : ${name} (simule, mailgun, noria)`);
}

module.exports = { routing, outbound, SIMULE, ProviderError };
