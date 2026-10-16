'use strict';
// Textes des SMS et e-mails, en français et en kreyòl. SMS courts (un seul segment de 160 caractères GSM hors lien).
const LANGS = ['fr', 'ht'];
const pick = (lang) => (LANGS.includes(lang) ? lang : 'fr');

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
    fr: (v) => ({ sms: `NORIA : ${v.school} vous invite. Activez votre compte (${v.hours} h) : ${v.link}`,
      subject: `Invitation NORIA — ${v.school}`,
      text: `Bonjour ${v.name},\n\n${v.school} vous invite à rejoindre NORIA.\nActivez votre compte et choisissez votre mot de passe avec ce lien (valable ${v.hours} heures, une seule fois) :\n\n${v.link}\n\nNORIA` }),
    ht: (v) => ({ sms: `NORIA : ${v.school} envite w. Aktive kont ou (${v.hours} è) : ${v.link}`,
      subject: `Envitasyon NORIA — ${v.school}`,
      text: `Bonjou ${v.name},\n\n${v.school} envite w antre nan NORIA.\nAktive kont ou epi chwazi modpas ou ak lyen sa a (li bon pou ${v.hours} è, yon sèl fwa) :\n\n${v.link}\n\nNORIA` }),
  },
  recuperation: {
    fr: (v) => ({ sms: `NORIA : nouveau mot de passe (${v.minutes} min) : ${v.link}`,
      subject: 'NORIA — nouveau mot de passe',
      text: `Bonjour,\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable ${v.minutes} minutes, une seule fois) :\n\n${v.link}\n\nToutes vos sessions seront fermées. Si vous n'avez rien demandé, ignorez ce message.\n\nNORIA` }),
    ht: (v) => ({ sms: `NORIA : nouvo modpas (${v.minutes} min) : ${v.link}`,
      subject: 'NORIA — nouvo modpas',
      text: `Bonjou,\n\nPou chwazi yon nouvo modpas, louvri lyen sa a (li bon pou ${v.minutes} minit, yon sèl fwa) :\n\n${v.link}\n\nTout sesyon ou yo ap fèmen. Si se pa ou ki mande l, pa okipe mesaj sa a.\n\nNORIA` }),
  },
};

function render(kind, lang, vars) { return T[kind][pick(lang)](vars); }
module.exports = { render, pick, LANGS };
