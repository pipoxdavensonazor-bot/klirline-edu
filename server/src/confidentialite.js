'use strict';
// Politique de confidentialité publique du portail (/confidentialite et /ht/confidentialite), en français et en kreyòl.
// Texte statique, sans script ni ressource externe ; rendu par portail-pages.js dans la mise en page du portail.
// Le contenu décrit ce que NORIA fait réellement (voir docs/confidentialite.md). À faire relire par un juriste avant de
// s'en prévaloir : aucune certification ni conformité n'y est revendiquée.
const UPDATED = '2026-10-17';
const CONTACT = 'contact@klirline.ca';

const C = {
  fr: {
    title: 'Politique de confidentialité',
    desc: 'Comment NORIA (Klirline) recueille, utilise, protège et conserve les données personnelles des écoles, des familles et des visiteurs.',
    updated: 'Dernière mise à jour : 17 octobre 2026',
    intro: 'Cette page explique quelles données personnelles NORIA traite, pourquoi, avec qui elles sont partagées, combien de temps elles sont gardées et comment exercer vos droits. Elle s’applique au portail public noriaedu.com, à l’espace des écoles (/app) et aux services de connexion associés.',
    sections: [
      ['Qui sommes-nous', [
        'NORIA est un logiciel de gestion scolaire édité et exploité par Klirline Inc. (« Klirline », « nous »).',
        `Pour toute question sur vos données : ${CONTACT}.`,
        'Pour les données d’un élève, l’école reste responsable de ce qu’elle saisit : Klirline les héberge et les traite pour son compte et selon ses instructions.',
      ]],
      ['Données que nous traitons', [
        'Comptes des écoles (direction, secrétariat, enseignants, parents, élèves) : nom, rôle, école, adresse e-mail et/ou numéro de téléphone, langue préférée, mot de passe (stocké uniquement sous forme d’empreinte).',
        'Dossier scolaire saisi par l’école : identité de l’élève (nom, prénom, code élève, date de naissance), classe et inscription, lien parent-enfant, notes, évaluations et bulletins, présences et absences, remarques de santé ou familiales si l’école les renseigne, photo pour la carte d’élève (privée : jamais publiée ni accessible sans connexion, visible seulement par le personnel autorisé de l’école, l’élève et ses parents ; métadonnées et localisation retirées ; retirable à tout moment sur demande à l’école), paiements de scolarité et reçus, prêts de bibliothèque, relevés, certificats et transferts entre écoles, notifications.',
        'Déclarations annuelles des écoles au ministère, lorsque ce module est activé.',
        'Comptes grand public du portail : adresse e-mail ou numéro de téléphone, langue et abonnements choisis (annonces, événements). Demandes d’inscription d’école : nom de l’école, nom et coordonnées de la personne qui la représente.',
        'Codes de connexion : codes à usage unique envoyés par e-mail ou par Telegram ; ils ne sont gardés que sous forme d’empreinte et expirent après 10 minutes.',
        'Connexion par WhatsApp (lorsqu’elle est activée) : le numéro WhatsApp qui nous écrit et le code court contenu dans le message, uniquement pour vérifier la connexion.',
        'Connexion par Telegram (lorsqu’elle est activée) : l’identifiant de conversation Telegram (chat id) relié à votre compte, pour vous envoyer vos codes. Vous pouvez délier Telegram à tout moment.',
        'Appareils de confiance : si vous cochez « Faire confiance à cet appareil », nous gardons l’empreinte d’un jeton aléatoire, un libellé approximatif de l’appareil (par exemple « Chrome sur Android ») et les dates d’utilisation.',
        'Journaux techniques et de sécurité : adresse IP, date, page demandée, résultat, empreinte du navigateur, tentatives de connexion et actions sensibles (journal d’audit), pour protéger le service et détecter les abus.',
      ]],
      ['Pourquoi nous les utilisons', [
        'Fournir le service demandé par l’école : gestion des élèves, des notes, des présences, des bulletins, des paiements et de la communication avec les familles.',
        'Vous connecter de façon sûre (mot de passe, codes à usage unique, WhatsApp, Telegram, appareils de confiance, codes d’activation remis par l’école).',
        'Envoyer les messages liés au service (codes, invitations, avis) et, si vous vous êtes abonné, les nouvelles du portail.',
        'Assurer la sécurité, prévenir la fraude, corriger les erreurs et garder des sauvegardes.',
        'Nous n’utilisons pas vos données pour de la publicité ciblée et nous ne créons pas de profils commerciaux.',
      ]],
      ['Base du traitement et consentement', [
        'Les données scolaires sont traitées parce que l’école utilise NORIA pour sa mission et nous en confie le traitement. C’est l’école qui recueille, auprès des parents ou tuteurs, les autorisations nécessaires pour les élèves mineurs.',
        'Un élève mineur n’a accès à NORIA que par un compte créé par son école. Les lauréats mineurs ne sont affichés en entier sur le portail public qu’avec le consentement de l’école et du parent ; sinon seules les initiales sont publiées.',
        'Les comptes grand public, les abonnements et la connexion par WhatsApp ou Telegram reposent sur votre choix : vous pouvez les arrêter à tout moment.',
      ]],
      ['Avec qui nous les partageons', [
        'Nous ne vendons ni ne louons aucune donnée personnelle.',
        'Nous faisons appel à ces prestataires, uniquement pour faire fonctionner le service :',
        '• Vultr : hébergement du serveur et de la base de données (centre de données de Miami, États-Unis).',
        '• Cloudflare : acheminement sécurisé du trafic du site (protection et mise en cache) ; Cloudflare R2 : stockage chiffré des sauvegardes.',
        '• Resend : envoi des e-mails (codes, invitations, avis).',
        '• Meta (WhatsApp) : réception des messages de connexion envoyés par WhatsApp, lorsque cette option est activée.',
        '• Telegram : envoi des codes par le bot NORIA, si vous avez relié Telegram.',
        'Les données d’une école ne sont visibles que par les comptes de cette école, selon leur rôle. Elles peuvent être transmises au ministère uniquement lorsque l’école envoie une déclaration ou qu’un transfert d’élève le prévoit.',
        'Nous pouvons communiquer des données si la loi nous y oblige.',
        'Certaines de ces données sont hébergées ou traitées hors d’Haïti (notamment aux États-Unis).',
      ]],
      ['Combien de temps nous les gardons', [
        'Données scolaires : tant que l’école utilise NORIA, puis selon les instructions de l’école à la fin du contrat.',
        'Codes de connexion et demandes WhatsApp : 10 minutes de validité ; lien Telegram en attente : 15 minutes.',
        'Appareils de confiance : 30 jours au plus ; supprimés plus tôt si vous vous déconnectez, révoquez l’appareil ou changez de mot de passe.',
        'Journaux de sécurité : environ 35 jours.',
        'Sauvegardes chiffrées : 30 quotidiennes, 4 hebdomadaires et 12 mensuelles ; une donnée effacée disparaît donc des sauvegardes au plus tard après environ 12 mois.',
        'Comptes grand public : jusqu’à leur suppression à votre demande.',
      ]],
      ['Comment nous les protégeons', [
        'Connexions chiffrées (HTTPS) ; mots de passe, codes et jetons conservés uniquement sous forme d’empreinte ; sauvegardes chiffrées.',
        'Cloisonnement des écoles dans la base de données (sécurité au niveau des lignes) : une école ne peut pas lire les données d’une autre.',
        'Accès limité selon le rôle, journal des actions sensibles, limitation des tentatives de connexion et surveillance des comportements suspects.',
        'Aucune mesure n’est parfaite : en cas d’incident touchant vos données, nous prévenons les écoles concernées.',
      ]],
      ['Cookies', [
        'Le portail public se consulte sans cookie et sans traceur publicitaire ni outil de mesure d’audience tiers.',
        'noria_session : cookie de session, posé seulement quand vous vous connectez à l’espace des écoles ; il disparaît à la déconnexion ou à l’expiration.',
        'noria_appareil : posé seulement si vous choisissez de faire confiance à l’appareil ; il dure 30 jours au plus.',
        'D’autres cookies de session du même type servent aux comptes grand public du portail et aux espaces d’administration. Tous sont strictement nécessaires, HttpOnly et ne servent jamais à la publicité.',
        'L’application garde aussi dans votre navigateur quelques informations locales : la langue, le dernier code d’école utilisé et, si vous travaillez hors ligne, les saisies en attente d’envoi.',
      ]],
      ['Vos droits', [
        'Vous pouvez demander à accéder à vos données, à les faire corriger ou à les faire supprimer, et retirer un consentement donné (abonnements, WhatsApp, Telegram).',
        'Pour les données scolaires, adressez-vous d’abord à votre école, qui peut corriger le dossier directement ; vous pouvez aussi nous écrire et nous transmettrons votre demande à l’école.',
        `Pour toute autre demande : ${CONTACT}. Nous répondons dans un délai raisonnable, après avoir vérifié votre identité.`,
        'Vous pouvez délier Telegram et révoquer vos appareils de confiance vous-même dans « Connexion et appareils ».',
      ]],
      ['Modifications', [
        'Nous pouvons mettre à jour cette politique quand NORIA évolue. La date en haut de la page indique la dernière version ; en cas de changement important, nous en informons les écoles.',
      ]],
    ],
    contact: `Contact : ${CONTACT}`,
    link: 'Confidentialité',
  },
  ht: {
    title: 'Politik konfidansyalite',
    desc: 'Kijan NORIA (Klirline) ranmase, sèvi ak, pwoteje epi kenbe done pèsonèl lekòl yo, fanmi yo ak vizitè yo.',
    updated: 'Dènye mizajou : 17 oktòb 2026',
    intro: 'Paj sa a esplike ki done pèsonèl NORIA trete, poukisa, ak ki moun yo pataje, konbyen tan yo kenbe yo ak kijan ou ka sèvi ak dwa ou. Li aplike pou pòtay piblik noriaedu.com, espas lekòl yo (/app) ak sèvis koneksyon ki ale avè yo.',
    sections: [
      ['Kiyès nou ye', [
        'NORIA se yon lojisyèl jesyon lekòl Klirline Inc. (« Klirline », « nou ») fè epi fè mache.',
        `Pou nenpòt kesyon sou done ou : ${CONTACT}.`,
        'Pou done yon elèv, se lekòl la ki responsab sa li antre : Klirline kenbe yo epi trete yo pou lekòl la, dapre enstriksyon li.',
      ]],
      ['Done nou trete', [
        'Kont lekòl yo (direksyon, sekretarya, pwofesè, paran, elèv) : non, wòl, lekòl, adrès imèl ak/oswa nimewo telefòn, lang ou pito, modpas (nou kenbe sèlman yon anprent li).',
        'Dosye lekòl la antre : idantite elèv la (non, siyati, kòd elèv, dat nesans), klas ak enskripsyon, lyen paran-pitit, nòt, evalyasyon ak bilten, prezans ak absans, nòt sou sante oswa fanmi si lekòl la mete yo, foto pou kat elèv la (prive : yo pa janm pibliye l ni montre l san koneksyon ; se sèlman pèsonèl lekòl la ki gen dwa, elèv la ak paran li ki ka wè l ; done lokalizasyon retire ; lekòl la ka retire l nenpòt lè sou demann), peman lekòl ak resi, prè nan bibliyotèk, relve, sètifika ak transfè ant lekòl, notifikasyon.',
        'Deklarasyon chak ane lekòl yo voye bay ministè a, lè modil sa a aktive.',
        'Kont piblik pòtay la : adrès imèl oswa nimewo telefòn, lang ak abònman ou chwazi (anons, evènman). Demann enskripsyon lekòl : non lekòl la, non ak kowòdone moun ki reprezante l.',
        'Kòd koneksyon : kòd yon sèl fwa nou voye pa imèl oswa pa Telegram ; nou kenbe sèlman yon anprent yo epi yo ekspire apre 10 minit.',
        'Koneksyon pa WhatsApp (lè li aktive) : nimewo WhatsApp ki ekri nou an ak ti kòd ki nan mesaj la, sèlman pou verifye koneksyon an.',
        'Koneksyon pa Telegram (lè li aktive) : idantifyan konvèsasyon Telegram (chat id) ki konekte ak kont ou, pou voye kòd ou yo. Ou ka retire Telegram nenpòt lè.',
        'Aparèy konfyans : si ou koche « Fè aparèy sa a konfyans », nou kenbe anprent yon jeton o aza, yon ti non pou aparèy la (egzanp « Chrome sou Android ») ak dat ou te sèvi avè l.',
        'Jounal teknik ak sekirite : adrès IP, dat, paj ou mande, rezilta, anprent navigatè a, eseye konekte ak aksyon sansib (jounal odit), pou pwoteje sèvis la epi detekte abi.',
      ]],
      ['Poukisa nou sèvi avè yo', [
        'Bay sèvis lekòl la mande : jesyon elèv, nòt, prezans, bilten, peman ak kominikasyon ak fanmi yo.',
        'Konekte ou san danje (modpas, kòd yon sèl fwa, WhatsApp, Telegram, aparèy konfyans, kòd aktivasyon lekòl la bay).',
        'Voye mesaj ki gen rapò ak sèvis la (kòd, envitasyon, avi) epi, si ou abòne, nouvèl pòtay la.',
        'Asire sekirite, anpeche fwod, korije erè epi kenbe kopi sekou.',
        'Nou pa sèvi ak done ou pou piblisite sible epi nou pa fè pwofil komèsyal.',
      ]],
      ['Baz tretman an ak konsantman', [
        'Nou trete done lekòl yo paske lekòl la sèvi ak NORIA pou misyon li epi li konfye nou tretman an. Se lekòl la ki pou jwenn otorizasyon paran oswa responsab yo pou elèv minè yo.',
        'Yon elèv minè gen aksè ak NORIA sèlman ak yon kont lekòl li kreye. Laureya minè yo parèt ak non konplè sou pòtay piblik la sèlman si lekòl la ak paran an dakò ; sinon se sèlman inisyal yo ki parèt.',
        'Kont piblik, abònman ak koneksyon pa WhatsApp oswa Telegram depann de chwa ou : ou ka sispann yo nenpòt lè.',
      ]],
      ['Ak kiyès nou pataje yo', [
        'Nou pa vann ni lwe okenn done pèsonèl.',
        'Nou sèvi ak founisè sa yo, sèlman pou fè sèvis la mache :',
        '• Vultr : sèvè a ak baz done a (sant done Miami, Etazini).',
        '• Cloudflare : fè trafik sit la pase san danje (pwoteksyon ak kach) ; Cloudflare R2 : kote nou estoke kopi sekou chifre yo.',
        '• Resend : voye imèl (kòd, envitasyon, avi).',
        '• Meta (WhatsApp) : resevwa mesaj koneksyon ou voye pa WhatsApp, lè opsyon sa a aktive.',
        '• Telegram : bot NORIA a voye kòd yo, si ou konekte Telegram.',
        'Done yon lekòl parèt sèlman pou kont lekòl sa a, dapre wòl yo. Yo ka ale bay ministè a sèlman lè lekòl la voye yon deklarasyon oswa lè yon transfè elèv mande sa.',
        'Nou ka bay done si lalwa oblije nou.',
        'Gen nan done sa yo ki estoke oswa trete andeyò Ayiti (sitou Etazini).',
      ]],
      ['Konbyen tan nou kenbe yo', [
        'Done lekòl : toutan lekòl la ap sèvi ak NORIA, apre sa dapre enstriksyon lekòl la lè kontra a fini.',
        'Kòd koneksyon ak demann WhatsApp : yo bon pou 10 minit ; lyen Telegram k ap tann : 15 minit.',
        'Aparèy konfyans : 30 jou pi plis ; yo efase pi bonè si ou dekonekte, si ou retire aparèy la oswa si ou chanje modpas.',
        'Jounal sekirite : anviwon 35 jou.',
        'Kopi sekou chifre : 30 chak jou, 4 chak semèn ak 12 chak mwa ; yon done ki efase disparèt nan kopi sekou yo pi ta apre anviwon 12 mwa.',
        'Kont piblik : jiskaske ou mande pou efase yo.',
      ]],
      ['Kijan nou pwoteje yo', [
        'Koneksyon chifre (HTTPS) ; modpas, kòd ak jeton kenbe sèlman an fòm anprent ; kopi sekou chifre.',
        'Chak lekòl separe nan baz done a (sekirite nivo liy) : yon lekòl pa ka li done yon lòt lekòl.',
        'Aksè limite dapre wòl, jounal aksyon sansib, limit sou eseye konekte ak siveyans konpòtman sispèk.',
        'Pa gen okenn pwoteksyon ki pafè : si yon ensidan touche done ou, n ap avèti lekòl yo ki konsène.',
      ]],
      ['Cookies', [
        'Ou ka gade pòtay piblik la san cookie, san traseur piblisite ni zouti mezire odyans lòt moun.',
        'noria_session : cookie sesyon, li parèt sèlman lè ou konekte nan espas lekòl yo ; li disparèt lè ou dekonekte oswa lè li ekspire.',
        'noria_appareil : li parèt sèlman si ou chwazi fè aparèy la konfyans ; li dire 30 jou pi plis.',
        'Lòt cookie sesyon menm jan an sèvi pou kont piblik pòtay la ak espas administrasyon yo. Yo tout nesesè, HttpOnly epi yo pa janm sèvi pou piblisite.',
        'Aplikasyon an kenbe kèk enfòmasyon nan navigatè ou tou : lang lan, dènye kòd lekòl ou te itilize a epi, si ou travay san entènèt, sa ou antre ki ap tann pou pati.',
      ]],
      ['Dwa ou', [
        'Ou ka mande pou wè done ou, pou korije yo oswa pou efase yo, epi retire yon konsantman ou te bay (abònman, WhatsApp, Telegram).',
        'Pou done lekòl, pale ak lekòl ou anvan, li ka korije dosye a dirèkteman ; ou ka ekri nou tou, n ap voye demann lan bay lekòl la.',
        `Pou nenpòt lòt demann : ${CONTACT}. N ap reponn nan yon delè rezonab, apre nou fin verifye idantite ou.`,
        'Ou ka retire Telegram epi retire aparèy konfyans ou yo poukont ou nan « Koneksyon ak aparèy ».',
      ]],
      ['Chanjman', [
        'Nou ka mete politik sa a ajou lè NORIA chanje. Dat ki anlè paj la montre dènye vèsyon an ; si gen yon gwo chanjman, n ap avèti lekòl yo.',
      ]],
    ],
    contact: `Kontak : ${CONTACT}`,
    link: 'Konfidansyalite',
  },
};

function body(L, esc) {
  const c = C[L];
  const sec = c.sections.map(([h, ps], i) => `<section class="sec pv" aria-labelledby="pv${i}"><h2 id="pv${i}">${esc(h)}</h2>`
    + ps.map((p) => (p.startsWith('• ') ? `<p class="pv-li">${esc(p.slice(2))}</p>` : `<p>${esc(p)}</p>`)).join('') + '</section>').join('');
  return `<article class="pv-doc"><h1>${esc(c.title)}</h1><p class="mut"><time datetime="${UPDATED}">${esc(c.updated)}</time></p><p>${esc(c.intro)}</p>${sec}`
    + `<p class="sec"><a href="mailto:${CONTACT}">${esc(c.contact)}</a></p></article>`;
}

module.exports = { C, body, UPDATED, CONTACT, SLUG: 'confidentialite' };
