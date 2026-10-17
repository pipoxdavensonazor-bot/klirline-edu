'use strict';
// Textes des SMS et e-mails, en français et en kreyòl. SMS courts (un seul segment de 160 caractères GSM hors lien).
const LANGS = ['fr', 'ht'];
const pick = (lang) => (LANGS.includes(lang) ? lang : 'fr');

// En-tête d'invitation : initiales et nom de l'école (texte), logo ou initiales (HTML).
const banner = (v) => (v.initials ? `${v.initials} — ${v.school}\n${'—'.repeat(Math.min(40, v.school.length + v.initials.length + 3))}\n\n` : '');
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function inviteHtml(v, lang) {
  if (!v.link) return undefined;
  const mark = v.logoUrl
    ? `<img src="${h(v.logoUrl)}" alt="${h(v.initials || '')}" width="64" height="64" style="display:block;border-radius:8px">`
    : `<div style="width:64px;height:64px;border-radius:8px;background:#1f2a37;color:#fff;font:bold 22px/64px Arial,sans-serif;text-align:center">${h(v.initials || '')}</div>`;
  const L = lang === 'ht'
    ? { hi: `Bonjou ${h(v.name)},`, body: `${h(v.school)} envite w antre nan NORIA. Lyen an bon pou ${h(v.hours)} è, yon sèl fwa.`, cta: 'Aktive kont mwen' }
    : { hi: `Bonjour ${h(v.name)},`, body: `${h(v.school)} vous invite à rejoindre NORIA. Le lien est valable ${h(v.hours)} heures, une seule fois.`, cta: 'Activer mon compte' };
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f5f7;font:15px/1.5 Arial,sans-serif;color:#1f2a37">
<table role="presentation" width="100%" style="max-width:520px;margin:auto;background:#fff;border-radius:12px;padding:24px"><tr><td>
<table role="presentation"><tr><td>${mark}</td><td style="padding-left:14px"><b style="font-size:18px">${h(v.school)}</b><br><span style="color:#5b6573">${h(v.initials || '')}</span></td></tr></table>
<p>${L.hi}</p><p>${L.body}</p>
<p><a href="${h(v.link)}" style="display:inline-block;background:#1f6feb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${L.cta}</a></p>
<p style="color:#5b6573;font-size:12px">${h(v.link)}</p><p style="color:#5b6573;font-size:12px">NORIA</p></td></tr></table></body></html>`;
}

const T = {
  code: {
    fr: (v) => ({ sms: `NORIA : votre code est ${v.code}. Valable ${v.minutes} min. Ne le donnez à personne.`,
      subject: `Votre code de connexion NORIA : ${v.code}`,
      text: `Bonjour,\n\nVotre code de connexion NORIA est : ${v.code}\n\nIl est valable ${v.minutes} minutes et ne sert qu'une fois. Personne de l'école ne vous le demandera : ne le donnez à personne.\n\nSi vous n'avez rien demandé, ignorez ce message.\n\nNORIA` }),
    ht: (v) => ({ sms: `NORIA : kòd ou se ${v.code}. Li bon pou ${v.minutes} min. Pa bay pèsonn li.`,
      subject: `Kòd koneksyon NORIA ou : ${v.code}`,
      text: `Bonjou,\n\nKòd koneksyon NORIA ou se : ${v.code}\n\nLi bon pou ${v.minutes} minit epi li sèvi yon sèl fwa. Pèsonn nan lekòl la p ap mande w li : pa bay pèsonn li.\n\nSi se pa ou ki mande l, pa okipe mesaj sa a.\n\nNORIA` }),
  },
  invitation: {
    fr: (v) => ({ sms: `${v.initials ? `[${v.initials}] ` : 'NORIA : '}${v.school} vous invite. Activez votre compte (${v.hours} h) : ${v.link}`,
      subject: `${v.initials ? `[${v.initials}] ` : ''}Invitation NORIA — ${v.school}`,
      html: inviteHtml(v, 'fr'),
      text: `${banner(v)}Bonjour ${v.name},\n\n${v.school} vous invite à rejoindre NORIA.\nActivez votre compte et choisissez votre mot de passe avec ce lien (valable ${v.hours} heures, une seule fois) :\n\n${v.link}\n\nNORIA` }),
    ht: (v) => ({ sms: `${v.initials ? `[${v.initials}] ` : 'NORIA : '}${v.school} envite w. Aktive kont ou (${v.hours} è) : ${v.link}`,
      subject: `${v.initials ? `[${v.initials}] ` : ''}Envitasyon NORIA — ${v.school}`,
      html: inviteHtml(v, 'ht'),
      text: `${banner(v)}Bonjou ${v.name},\n\n${v.school} envite w antre nan NORIA.\nAktive kont ou epi chwazi modpas ou ak lyen sa a (li bon pou ${v.hours} è, yon sèl fwa) :\n\n${v.link}\n\nNORIA` }),
  },
  recuperation: {
    fr: (v) => ({ sms: `NORIA : nouveau mot de passe (${v.minutes} min) : ${v.link}`,
      subject: 'NORIA — nouveau mot de passe',
      text: `Bonjour,\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable ${v.minutes} minutes, une seule fois) :\n\n${v.link}\n\nToutes vos sessions seront fermées. Si vous n'avez rien demandé, ignorez ce message.\n\nNORIA` }),
    ht: (v) => ({ sms: `NORIA : nouvo modpas (${v.minutes} min) : ${v.link}`,
      subject: 'NORIA — nouvo modpas',
      text: `Bonjou,\n\nPou chwazi yon nouvo modpas, louvri lyen sa a (li bon pou ${v.minutes} minit, yon sèl fwa) :\n\n${v.link}\n\nTout sesyon ou yo ap fèmen. Si se pa ou ki mande l, pa okipe mesaj sa a.\n\nNORIA` }),
  },
  // Relevé de notes : état de la demande, sans aucune note (le document est dans le portail).
  releve: {
    fr: (v) => { const w = { emis: 'est disponible dans votre espace NORIA', refuse: 'a été refusée (motif dans votre espace NORIA)', annule: 'a été annulé' }[v.status];
      return { sms: `${v.initials ? `[${v.initials}] ` : 'NORIA : '}Relevé de notes : la demande ${w}.`, subject: `${v.initials ? `[${v.initials}] ` : ''}Relevé de notes — ${v.school}`,
        text: `Bonjour,\n\nRelevé de notes officiel (${v.school}) : la demande ${w}.\n\nNORIA` }; },
    ht: (v) => { const w = { emis: 'disponib nan espas NORIA ou', refuse: 'refize (rezon an nan espas NORIA ou)', annule: 'anile' }[v.status];
      return { sms: `${v.initials ? `[${v.initials}] ` : 'NORIA : '}Relve nòt : demann lan ${w}.`, subject: `${v.initials ? `[${v.initials}] ` : ''}Relve nòt — ${v.school}`,
        text: `Bonjou,\n\nRelve nòt ofisyèl (${v.school}) : demann lan ${w}.\n\nNORIA` }; },
  },
  // Transfert de dossier : code de consentement envoyé au parent rattaché (école d'origine), puis état final. Sans note.
  transfert_code: {
    fr: (v) => ({ sms: `NORIA : ${v.to} demande le dossier scolaire de votre enfant (${v.from}). Si vous êtes d'accord, donnez ce code à l'école : ${v.code} (${v.minutes} min).`,
      subject: `Transfert de dossier — ${v.to}`,
      text: `Bonjour,\n\n${v.to} demande le transfert du dossier scolaire de votre enfant, inscrit à ${v.from}.\n\nSi vous êtes d'accord, donnez ce code à l'école d'accueil : ${v.code}\nIl est valable ${v.minutes} minutes et ne sert qu'une fois. Si vous n'êtes pas d'accord, ne donnez pas ce code.\n\nNORIA` }),
    ht: (v) => ({ sms: `NORIA : ${v.to} mande dosye lekòl pitit ou (${v.from}). Si ou dakò, bay lekòl la kòd sa a : ${v.code} (${v.minutes} min).`,
      subject: `Transfè dosye — ${v.to}`,
      text: `Bonjou,\n\n${v.to} mande pou yo transfere dosye lekòl pitit ou, ki enskri nan ${v.from}.\n\nSi ou dakò, bay lekòl k ap resevwa l la kòd sa a : ${v.code}\nLi bon pou ${v.minutes} minit epi li sèvi yon sèl fwa. Si ou pa dakò, pa bay kòd la.\n\nNORIA` }),
  },
  transfert: {
    fr: (v) => { const w = { transfere: `est terminé : le dossier est maintenant à ${v.to}`, refuse: 'a été refusé par l’école d’origine', annule: 'a été annulé' }[v.status];
      return { sms: `NORIA : le transfert du dossier de votre enfant (${v.from} → ${v.to}) ${w}.`, subject: `Transfert de dossier — ${v.to}`, text: `Bonjour,\n\nLe transfert du dossier scolaire de votre enfant (${v.from} → ${v.to}) ${w}.\n\nNORIA` }; },
    ht: (v) => { const w = { transfere: `fini : dosye a nan ${v.to} kounye a`, refuse: 'lekòl kote l te ye a refize l', annule: 'anile' }[v.status];
      return { sms: `NORIA : transfè dosye pitit ou (${v.from} → ${v.to}) ${w}.`, subject: `Transfè dosye — ${v.to}`, text: `Bonjou,\n\nTransfè dosye lekòl pitit ou (${v.from} → ${v.to}) ${w}.\n\nNORIA` }; },
  },
};

function render(kind, lang, vars) { return T[kind][pick(lang)](vars); }
module.exports = { render, pick, LANGS };
