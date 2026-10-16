'use strict';
// Adaptateurs de paiement. Pour l'instant, saisie manuelle seulement : la référence MonCash, NatCash ou bancaire est
// recopiée par le personnel et n'est vérifiée par aucun service.
//
// Interface d'un adaptateur (à respecter pour brancher l'API MonCash ou NatCash plus tard) :
//   id                         identifiant court stocké dans payment.provider ('manuel', 'moncash', 'natcash'…)
//   methods                    modes pris en charge parmi 'especes', 'moncash', 'natcash', 'virement'
//   async verify({ method, reference, amountCents, currency, schoolId })
//     → { status: 'confirme' | 'non_verifie' | 'refuse', providerRef?: string, detail?: string }
//     Appelé AVANT la transaction d'enregistrement (aucune attente réseau dans une transaction SQLite).
//     'refuse' bloque l'enregistrement ; 'non_verifie' l'accepte en le signalant sur le reçu.
//   Un adaptateur ne reçoit jamais de secret client (code PIN, mot de passe) et n'en stocke aucun.
const manuel = {
  id: 'manuel',
  methods: ['especes', 'moncash', 'natcash', 'virement'],
  async verify({ method }) { return { status: method === 'especes' ? 'confirme' : 'non_verifie' }; },
};

const ADAPTERS = { manuel };
// NORIA_PAIEMENT_ADAPTATEUR choisit l'adaptateur (manuel par défaut) ; un adaptateur inconnu est une erreur de configuration.
function adapterFor(method, name = process.env.NORIA_PAIEMENT_ADAPTATEUR || 'manuel') {
  const a = ADAPTERS[name];
  if (!a) throw new Error(`adaptateur de paiement inconnu : ${name}`);
  return a.methods.includes(method) ? a : manuel;
}
function register(adapter) {
  if (!adapter || !adapter.id || !Array.isArray(adapter.methods) || typeof adapter.verify !== 'function') throw new Error('adaptateur invalide');
  ADAPTERS[adapter.id] = adapter;
}

module.exports = { adapterFor, register, ADAPTERS };
