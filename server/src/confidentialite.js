'use strict';
// Politique de confidentialité publique du portail (/confidentialite et /ht/confidentialite), en français et en kreyòl.
// Texte statique, sans script ni ressource externe ; rendu par portail-pages.js dans la mise en page du portail.
// Version 2.0 du 4 novembre 2026, à publier sur instruction (« Publier »). Le texte suit la source validée pour
// publication. Il ne revendique aucune certification. Les points encore ouverts (minorité, TCA, régions, durée fiscale,
// autorité en Haïti) sont des phrases de la page, pas des crochets. Voir docs/confidentialite.md.
const UPDATED = '2026-11-04';
const CONTACT = 'confidentialite@noriaedu.com';
const ADDRESS = '10948 Avenue de Rome, Montréal-Nord (Québec) H1H 4P4, Canada';

const C = {
  fr: {
    title: 'Politique de confidentialité',
    desc: 'Quelles données personnelles NORIA (Klirline Inc.) traite, qui en décide, avec qui elles sont partagées, combien de temps elles sont gardées et comment exercer vos droits.',
    updated: 'Dernière mise à jour : 4 novembre 2026 — Version 2.0',
    intro: 'Cette page explique quelles données personnelles NORIA traite, pourquoi, qui en est responsable, avec qui elles sont partagées, où elles sont traitées, combien de temps elles sont gardées et comment exercer vos droits. Elle s’applique au portail public https://noriaedu.com, à l’espace des écoles (https://noriaedu.com/app), aux réunions audio entre l’école et les parents et aux services de connexion associés. Résumé en créole haïtien : https://noriaedu.com/ht/confidentialite. Elle comporte deux parties distinctes : A. Services scolaires (données saisies et utilisées par les écoles) et B. Portail public et comptes grand public.',
    sections: [
      ['Qui sommes-nous', [
        `NORIA est un logiciel de gestion scolaire édité et exploité par Klirline Inc. (« Klirline », « nous »), société établie à Montréal (Québec), Canada, numéro d’entreprise 777880576RC0001. Adresse : ${ADDRESS}.`,
        `Responsable de la protection des renseignements personnels : Philippe Davenson Azor, président de Klirline Inc. — ${CONTACT}.`,
        `Pour toute question, demande d’accès ou de rectification, ou plainte relative à la protection des renseignements personnels, vous pouvez contacter le responsable de la protection des renseignements personnels de Klirline à l’adresse suivante : ${CONTACT}. Les coordonnées complémentaires requises par le droit applicable sont disponibles sur le site de l’entreprise.`,
      ]],
      ['Qui décide de l’utilisation de vos données', [
        'Données scolaires. Pour les données traitées dans le cadre des services scolaires, l’établissement détermine les finalités pédagogiques et administratives, tandis que Klirline traite les données selon le contrat et les instructions convenues (conditions de service et accord de traitement des données conclus avec chaque école). Votre école reste votre premier interlocuteur pour le dossier scolaire.',
        'Traitements propres à Klirline. Pour les traitements qu’elle réalise à ses propres fins — sécurité du service et journaux techniques, comptes grand public du portail, facturation de l’abonnement NORIA aux écoles, amélioration du service — Klirline assume les responsabilités qui lui incombent en vertu du droit applicable.',
        'Qui décide, en bref :',
        '• Dossier scolaire, comptes de l’espace école, photo de badge, réunions audio, paiements de scolarité : l’école (Klirline traite pour son compte).',
        '• Lauréats et contenus scolaires sur le portail public : l’école propose et recueille les autorisations ; Klirline publie sur instruction.',
        '• Journaux de sécurité, prévention des abus, sauvegardes : Klirline (pour la sécurité du service).',
        '• Comptes grand public, abonnements, demandes d’inscription d’école : Klirline.',
        '• Factures de l’abonnement NORIA émises aux écoles : Klirline.',
      ]],
      ['Données que nous traitons pour les écoles', [
        'Partie A — Services scolaires. Cette section et les suivantes jusqu’aux autorisations portent sur les données saisies et utilisées par les écoles.',
        'Comptes (direction, secrétariat, enseignants, parents, élèves) : nom, rôle, école, adresse courriel et/ou numéro de téléphone, langue préférée, mot de passe (stocké uniquement sous forme d’empreinte).',
        'Dossier scolaire saisi par l’école : identité de l’élève (nom, prénom, code élève, date de naissance), classe et inscription, lien parent-enfant, notes, évaluations et bulletins, présences et absences, prêts de bibliothèque, relevés, certificats et transferts entre écoles, notifications ; déclarations annuelles au ministère lorsque ce module est activé.',
        'Remarques de santé ou familiales : facultatives, réservées aux personnes désignées par l’école, saisies seulement lorsque c’est nécessaire.',
        'Photo de badge (carte d’élève) : voir « Photo de badge et photos publiques ».',
        'Paiements de scolarité : montants, reçus et factures émis par l’école aux familles (l’école est l’émettrice ; NORIA est l’outil).',
        'Réunions audio : voir « Réunions audio entre l’école et les parents ».',
        'Les données des élèves sont traitées pour les besoins de la gestion scolaire et de l’enseignement. Les utilisations facultatives, notamment la publication publique de photographies ou de résultats nominatifs, font l’objet d’un examen distinct et des autorisations nécessaires.',
      ]],
      ['Pourquoi nous les utilisons', [
        'Fournir le service demandé par l’école : gestion des élèves, des notes, des présences, des bulletins, des paiements et de la communication avec les familles.',
        'Vous connecter de façon sûre (voir « Comptes grand public, connexion et appareils »).',
        'Organiser les réunions audio entre l’école et les parents.',
        'Envoyer les messages liés au service (codes, invitations, avis). Les coordonnées fournies par l’établissement sont utilisées pour transmettre les communications scolaires nécessaires. Elles ne sont pas utilisées à des fins de marketing sans le consentement ou l’autorisation requis par le droit applicable.',
        'Assurer la sécurité, prévenir la fraude, corriger les erreurs et garder des sauvegardes.',
        'Nous n’utilisons pas vos données pour de la publicité ciblée, nous ne créons pas de profils commerciaux et nous ne vendons ni ne louons aucune donnée personnelle.',
      ]],
      ['Photo de badge et photos publiques : deux usages distincts', [
        'Photo de badge. La photographie de badge est utilisée uniquement pour les besoins d’identification et de gestion scolaire. Elle est privée : non publiée, visible seulement après connexion par le personnel autorisé de l’école, l’élève et ses parents ; métadonnées et localisation retirées ; retirable sur demande à l’école. Aucune reconnaissance faciale n’est utilisée. Elle ne peut être réutilisée à des fins promotionnelles ou publiée sur un portail public sans examen préalable de la base juridique et obtention des autorisations nécessaires.',
        'Photos et contenus publics. Toute photo ou tout résultat destiné au portail public fait l’objet d’une autorisation distincte (voir « Lauréats et contenus publics concernant des mineurs »).',
      ]],
      ['Réunions audio entre l’école et les parents', [
        'Les réunions audio permettent la transmission de la voix des participants. Il n’y a pas de vidéo ; seule la direction de l’école peut donner la parole à un parent. Sont traités : la voix, le nom, la présence, les mains levées et les autorisations de prise de parole (journalisées).',
        'Le son est diffusé en direct par segments techniques d’environ 6 secondes, stockés temporairement sur Cloudflare R2 et supprimés environ 60 secondes après leur diffusion. Une règle de suppression automatique après 1 jour est prévue comme filet de sécurité (configuration Cloudflare à maintenir documentée). Une copie d’un segment peut subsister dans le cache du réseau Cloudflare pendant 24 heures au plus. Le système NORIA ne prévoit pas d’enregistrement permanent des réunions ni de transcription, et la voix n’est pas utilisée pour identifier une personne. Klirline indique que le système ne prévoit pas d’enregistrement permanent ni de transcription ; la conservation effective des segments reste limitée aux durées techniques ci-dessus.',
        'Les participants ne doivent pas enregistrer la réunion sans l’accord de l’école. Un avis est affiché avant l’entrée dans chaque réunion. Toute fonction d’enregistrement future ferait l’objet d’une nouvelle analyse et d’une mise à jour de cette politique.',
      ]],
      ['Base du traitement et autorisations', [
        'Les données scolaires sont traitées parce que l’école utilise NORIA pour sa mission éducative et nous en confie le traitement. La mission éducative ne justifie pas à elle seule tous les usages : l’école recueille auprès des parents ou tuteurs les autorisations nécessaires lorsque la loi l’exige (notamment pour la publication publique ou les remarques sensibles), selon les modèles fournis par Klirline, et en conserve la preuve.',
        'Un élève mineur n’a accès à NORIA que par un compte créé par son école. Les règles haïtiennes sur la minorité et l’autorité parentale restent à valider par un juriste en Haïti.',
      ]],
      ['Comptes grand public, connexion et appareils', [
        'Partie B — Portail public et comptes grand public. Les comptes grand public sont soumis aux dispositions de cette partie relatives aux abonnements, annonces et événements. Les données recueillies à ces fins sont traitées séparément des données scolaires, selon les finalités et garanties applicables.',
        'Comptes grand public : adresse courriel ou numéro de téléphone, langue et abonnements choisis (annonces, événements, lauréats, filtre par département). Âge minimal pour un compte grand public : à préciser selon le droit applicable ; un parcours adapté aux mineurs sera mis en place le cas échéant. En attendant, l’usage du portail public par un mineur se fait sous la responsabilité du parent ou tuteur.',
        'Demandes d’inscription d’école : nom de l’école, nom et coordonnées de la personne qui la représente.',
        'Codes de connexion : codes à usage unique envoyés par courriel ou par Telegram, gardés seulement sous forme d’empreinte, valables 10 minutes.',
        'Connexion par WhatsApp (si activée) : le numéro WhatsApp qui nous écrit et le code court du message, uniquement pour vérifier la connexion.',
        'Invitations aux réunions : par courriel et, si vous l’avez accepté, par WhatsApp (votre numéro est alors communiqué à Meta pour l’envoi). Une alternative par courriel est toujours possible.',
        'Connexion par Telegram (si activée) : l’identifiant de conversation relié à votre compte ; vous pouvez délier Telegram à tout moment.',
        'Appareils de confiance : si vous cochez « Faire confiance à cet appareil », l’empreinte d’un jeton aléatoire, un libellé approximatif de l’appareil et les dates d’utilisation.',
        'Journaux techniques et de sécurité : adresse IP, date, page demandée, résultat, empreinte du navigateur, tentatives de connexion et actions sensibles (journal d’audit).',
        'Les comptes grand public, les abonnements et la connexion par WhatsApp ou Telegram reposent sur votre choix : vous pouvez les arrêter à tout moment.',
        'SMS : aucun envoi par SMS n’est actif. Si le service SMS est activé, le numéro de téléphone et les informations nécessaires à l’envoi pourront être transmis à un prestataire technique afin de délivrer les codes d’authentification ou notifications demandés. Les communications commerciales seront soumises aux autorisations requises.',
      ]],
      ['Cookies et mesure d’audience', [
        'Le portail public se consulte sans cookie publicitaire et sans outil tiers de mesure d’audience. La vérification du 3 novembre 2026 ne montre pas d’outil Cloudflare Web Analytics sur le site. Cloudflare peut déposer un cookie technique de sécurité si une protection anti-abus est active ; ce cookie n’est pas utilisé pour de la publicité. Le réseau Cloudflare peut recevoir des rapports techniques d’erreurs réseau envoyés par votre navigateur (Network Error Logging), utilisés pour la fiabilité du service et non pour mesurer l’audience.',
        'Cookies NORIA, tous strictement nécessaires, HttpOnly, jamais utilisés pour la publicité :',
        '• noria_session : session de l’espace des écoles (8 heures au plus ; supprimé à la déconnexion).',
        '• noria_appareil : appareil de confiance, si vous le choisissez (30 jours au plus).',
        '• noria_public : session des comptes grand public (30 jours au plus).',
        '• noria_admin, noria_ministere : sessions des espaces d’administration.',
        'L’application garde aussi dans votre navigateur la langue, le dernier code d’école utilisé et, hors ligne, les saisies en attente d’envoi. Sur un appareil partagé, déconnectez-vous ; les écoles sont responsables des appareils qu’elles mettent à disposition.',
      ]],
      ['Facturation et TCA', [
        'Les données de facturation sont utilisées pour établir, transmettre et gérer les factures ainsi que pour satisfaire aux obligations comptables et fiscales applicables. La responsabilité de chaque partie dépend de son rôle effectif dans l’émission des factures et la perception des taxes.',
        'Factures de l’abonnement NORIA émises par Klirline aux écoles (montants HT, TCA 10 %, TTC ; paiements MonCash, NatCash, virement ou espèces et leur référence) : Klirline est responsable.',
        'Frais de scolarité facturés par une école aux familles dans NORIA : l’école est responsable ; Klirline ne fournit que l’outil.',
        'L’accès aux données de facturation est limité aux personnes autorisées. Le statut fiscal de Klirline pour la TCA en Haïti et les mentions obligatoires des factures restent à valider par un juriste ou un comptable en Haïti.',
      ]],
      ['Lauréats et contenus publics concernant des mineurs', [
        'La publication du nom complet d’un élève mineur sur un portail public est subordonnée à la vérification de la base juridique applicable et à l’obtention des autorisations requises (celle de l’école et celle du parent ou tuteur, dont la preuve est conservée). À défaut, Klirline privilégie une publication non nominative — initiales et aucune photo — sous réserve que les informations diffusées ne permettent pas indirectement d’identifier l’élève.',
        `Un retrait peut être demandé à tout moment à l’école ou à ${CONTACT}.`,
      ]],
      ['Avec qui nous partageons les données', [
        'Des prestataires techniques interviennent, uniquement pour faire fonctionner le service et avec les seules données nécessaires à leur service :',
        '• Vultr : hébergement du serveur et de la base de données (centre de données de Miami, États-Unis).',
        '• Cloudflare : acheminement sécurisé du trafic du site (protection, mise en cache, rapports d’erreurs réseau).',
        '• Cloudflare R2 : stockage chiffré des sauvegardes et stockage temporaire des segments audio des réunions.',
        '• Resend : envoi des courriels (codes, invitations, avis, factures et rappels).',
        '• Meta (WhatsApp) : connexion par WhatsApp et invitations, si vous avez choisi cette option.',
        '• Telegram : envoi des codes, si vous avez relié Telegram.',
        'WhatsApp et Telegram sont des services que vous choisissez d’utiliser ; leurs propres politiques s’appliquent à ce qu’ils traitent de leur côté. Les données d’une école ne sont visibles que par les comptes de cette école, selon leur rôle. Elles peuvent être transmises au ministère uniquement lorsque l’école envoie une déclaration ou qu’un transfert d’élève le prévoit. Nous pouvons communiquer des données si la loi nous y oblige.',
      ]],
      ['Où les données sont traitées', [
        'Certains renseignements peuvent être traités par des prestataires situés hors du pays de résidence de l’utilisateur, notamment aux États-Unis : la base de données est hébergée à Miami (États-Unis), Klirline exploite le service depuis le Canada, et le réseau Cloudflare ainsi que les autres prestataires peuvent traiter des données dans d’autres pays, dans des régions qui dépendent des contrats fournisseurs et qui restent à documenter. Ces données peuvent alors être soumises aux lois de ces pays.',
        'Klirline documente les flux concernés et met en place les garanties contractuelles et techniques requises par le droit applicable. Nous ne prétendons pas à un hébergement exclusivement canadien ou haïtien.',
      ]],
      ['Combien de temps nous les gardons', [
        '• Données scolaires : tant que l’école utilise NORIA ; à la fin du contrat, 60 jours pour l’export, puis suppression des systèmes actifs selon les instructions de l’école, sous réserve des obligations légales.',
        '• Codes de connexion, demandes WhatsApp : 10 minutes de validité.',
        '• Lien Telegram en attente : 15 minutes.',
        '• Segments audio des réunions : environ 60 secondes après diffusion (filet de sécurité prévu : 1 jour ; cache Cloudflare : 24 heures au plus).',
        '• Appareils de confiance : 30 jours au plus ; supprimés plus tôt à la déconnexion, à la révocation ou au changement de mot de passe.',
        '• Journaux de sécurité : environ 35 jours.',
        '• Sauvegardes chiffrées : 30 quotidiennes, 4 hebdomadaires, 12 mensuelles. Une donnée supprimée disparaît des sauvegardes au plus tard après environ 12 mois et n’est pas restaurée, sauf sinistre majeur (réglage de production documenté côté serveur).',
        '• Comptes grand public : jusqu’à leur suppression à votre demande, selon la politique de conservation des comptes.',
        '• Factures et pièces comptables : durée exigée par la loi fiscale applicable (à préciser avec un conseil compétent).',
        '• Photo de badge : jusqu’au retrait demandé à l’école ou à la fin de la scolarité (durée fixée par l’école).',
      ]],
      ['Comment nous les protégeons', [
        'Connexions chiffrées (HTTPS) ; mots de passe, codes et jetons conservés uniquement sous forme d’empreinte ; sauvegardes chiffrées ; cloisonnement des écoles dans la base de données (sécurité au niveau des lignes), qui vise à empêcher qu’une école accède aux données d’une autre ; accès limité selon le rôle, journal des actions sensibles, limitation des tentatives de connexion et surveillance des comportements suspects.',
        'Aucune mesure n’est parfaite. En cas d’incident de confidentialité, Klirline informe l’établissement sans délai indu après avoir pris connaissance d’un incident de sécurité susceptible de concerner les données traitées pour son compte. Les parties coopèrent afin d’évaluer les risques, de limiter les conséquences et d’effectuer les notifications exigées par le droit applicable (autorités compétentes et personnes concernées). Klirline tient un registre des incidents.',
      ]],
      ['Vos droits', [
        'Vous pouvez demander à accéder à vos données, à les faire corriger ou supprimer, et retirer un consentement donné (abonnements, WhatsApp, Telegram, publication publique). L’exercice de ces droits dépend du droit applicable et des obligations légales de conservation.',
        'Données scolaires : adressez-vous d’abord à votre école, qui peut corriger le dossier directement ; si vous nous écrivez, nous transmettons votre demande à l’école.',
        `Autres données : ${CONTACT}. Nous vérifions votre identité et répondons dans un délai raisonnable selon la loi applicable.`,
        `Plainte : écrivez au responsable de la protection des renseignements personnels (${CONTACT}) ; nous accusons réception et répondons par écrit. Vous pouvez aussi vous adresser à la Commission d’accès à l’information du Québec ou au Commissariat à la protection de la vie privée du Canada, selon votre situation. Pour les personnes situées en Haïti, l’autorité compétente sera indiquée dès qu’elle est confirmée par un conseil local.`,
        'Vous pouvez délier Telegram et révoquer vos appareils de confiance vous-même dans « Connexion et appareils ».',
      ]],
      ['Modifications', [
        'Nous mettons à jour cette politique quand NORIA évolue. La date en haut de la page indique la dernière version ; en cas de changement important, nous en informons les écoles au moins 30 jours à l’avance, ainsi que les utilisateurs concernés par un avis visible. L’historique des versions est conservé.',
        `Contact : Philippe Davenson Azor, responsable de la protection des renseignements personnels — ${CONTACT} — Klirline Inc. (numéro d’entreprise 777880576RC0001), Montréal (Québec), Canada.`,
      ]],
    ],
    contact: `Contact : Philippe Davenson Azor — ${CONTACT}`,
    link: 'Confidentialité',
  },
  ht: {
    title: 'Politik konfidansyalite',
    desc: 'Ki done pèsonèl NORIA (Klirline Inc.) trete, kiyès ki deside, ak ki moun yo pataje yo, konbyen tan yo kenbe yo epi kijan ou ka sèvi ak dwa ou.',
    updated: 'Dènye mizajou : 4 novanm 2026 — Vèsyon 2.0',
    intro: 'Paj sa a esplike ki done pèsonèl NORIA trete, poukisa, kiyès ki responsab, ak ki moun yo pataje yo, ki kote yo trete yo, konbyen tan yo kenbe yo, epi kijan ou ka sèvi ak dwa ou. Li aplike pou pòtay piblik https://noriaedu.com, espas lekòl yo (https://noriaedu.com/app), reyinyon ak son ant lekòl la ak paran yo, ak sèvis koneksyon ki ale avè yo. Rezime an franse : https://noriaedu.com/confidentialite. Li gen de pati ki diferan : A. Sèvis lekòl (done lekòl yo antre epi itilize) ak B. Pòtay piblik ak kont piblik.',
    sections: [
      ['Kiyès nou ye', [
        `NORIA se yon lojisyèl jesyon lekòl Klirline Inc. (« Klirline », « nou ») fè epi fè mache. Se yon konpayi ki chita Montréal (Québec), Canada, nimewo antrepriz 777880576RC0001. Adrès : ${ADDRESS}.`,
        `Responsab pwoteksyon enfòmasyon pèsonèl yo : Philippe Davenson Azor, prezidan Klirline Inc. — ${CONTACT}.`,
        `Pou nenpòt kesyon, demann pou wè oswa korije done, oswa plent sou pwoteksyon enfòmasyon pèsonèl, ou ka kontakte responsab pwoteksyon enfòmasyon pèsonèl Klirline nan adrès sa a : ${CONTACT}. Lòt kowòdone lalwa ki aplike a mande yo disponib sou sit konpayi an.`,
      ]],
      ['Kiyès ki deside kijan done ou yo itilize', [
        'Done lekòl. Pou done yo trete nan kad sèvis lekòl yo, se etablisman an ki detèmine rezon pedagojik ak administratif yo, pandan Klirline trete done yo dapre kontra a ak enstriksyon yo te dakò (kondisyon sèvis yo ak akò tretman done yo siyen ak chak lekòl). Lekòl ou a rete premye moun pou pale sou dosye lekòl la.',
        'Tretman ki pou Klirline. Pou tretman li fè pou pwòp rezon pa l — sekirite sèvis la ak jounal teknik yo, kont piblik pòtay la, fakti abònman NORIA pou lekòl yo, amelyorasyon sèvis la — Klirline pran responsabilite ki pou li dapre lalwa ki aplike a.',
        'Kiyès ki deside, an rezime :',
        '• Dosye lekòl, kont espas lekòl la, foto badj, reyinyon ak son, peman frè lekòl : lekòl la (Klirline trete pou kont li).',
        '• Laureya ak kontni lekòl sou pòtay piblik la : lekòl la pwopoze epi ranmase otorizasyon yo ; Klirline pibliye sou enstriksyon.',
        '• Jounal sekirite, prevansyon abi, kopi sekou : Klirline (pou sekirite sèvis la).',
        '• Kont piblik, abònman, demann enskripsyon lekòl : Klirline.',
        '• Fakti abònman NORIA yo voye bay lekòl yo : Klirline.',
      ]],
      ['Done nou trete pou lekòl yo', [
        'Pati A — Sèvis lekòl. Seksyon sa a ak sa ki vin apre yo, jiska otorizasyon yo, pale de done lekòl yo antre epi itilize.',
        'Kont (direksyon, sekretarya, pwofesè, paran, elèv) : non, wòl, lekòl, adrès imèl ak/oswa nimewo telefòn, lang ou pito, modpas (nou kenbe l sèlman an fòm anprent).',
        'Dosye elèv la, jan lekòl la antre l : idantite elèv la (non, prenon, kòd elèv, dat nesans), klas ak enskripsyon, lyen paran-pitit, nòt, evalyasyon ak bilten, prezans ak absans, prè nan bibliyotèk, relve, sètifika ak transfè ant lekòl, notifikasyon ; deklarasyon chak ane bay ministè a lè modil sa a aktive.',
        'Nòt sou sante oswa fanmi : yo pa obligatwa, yo rezève pou moun lekòl la deziyen, yo antre sèlman lè sa nesesè.',
        'Foto badj (kat elèv) : gade « Foto badj ak foto piblik ».',
        'Peman frè lekòl : montan, resi ak fakti lekòl la voye bay fanmi yo (se lekòl la ki fè fakti a ; NORIA se zouti a).',
        'Reyinyon ak son : gade « Reyinyon ak son ant lekòl la ak paran yo ».',
        'Done elèv yo trete pou bezwen jesyon lekòl la ak ansèyman an. Itilizasyon ki pa obligatwa, sitou pibliye foto oswa rezilta ak non, fè objè yon egzamen apa ak otorizasyon ki nesesè yo.',
      ]],
      ['Poukisa nou sèvi avè yo', [
        'Bay sèvis lekòl la mande : jesyon elèv, nòt, prezans, bilten, peman ak kominikasyon ak fanmi yo.',
        'Konekte ou nan yon fason ki an sekirite (gade « Kont piblik, koneksyon ak aparèy »).',
        'Òganize reyinyon ak son ant lekòl la ak paran yo.',
        'Voye mesaj ki gen rapò ak sèvis la (kòd, envitasyon, avi). Kowòdone etablisman an bay yo sèvi pou transmèt kominikasyon lekòl ki nesesè. Yo pa itilize pou maketing san konsantman oswa otorizasyon lalwa ki aplike a mande.',
        'Asire sekirite, anpeche fwod, korije erè epi kenbe kopi sekou.',
        'Nou pa itilize done ou pou piblisite ki vize ou, nou pa kreye pwofil komèsyal, epi nou pa vann ni lwe okenn done pèsonèl.',
      ]],
      ['Foto badj ak foto piblik : de itilizasyon diferan', [
        'Foto badj. Foto badj la itilize sèlman pou bezwen idantifikasyon ak jesyon lekòl. Li prive : yo pa pibliye l, li parèt sèlman apre koneksyon pou pèsonèl lekòl la ki gen otorizasyon, elèv la ak paran li ; enfòmasyon ki dekri fichye a ak kote li te pran yo retire ; yo ka retire l sou demann bay lekòl la. Pa gen rekonesans figi. Yo pa ka sèvi avè l pou pwomosyon ni pibliye l sou yon pòtay piblik san yo pa egzamine baz legal la alavans epi jwenn otorizasyon ki nesesè yo.',
        'Foto ak kontni piblik. Nenpòt foto oswa rezilta ki pou pòtay piblik la mande yon otorizasyon apa (gade « Laureya ak kontni piblik sou minè »).',
      ]],
      ['Reyinyon ak son ant lekòl la ak paran yo', [
        'Reyinyon ak son yo pèmèt transmèt vwa moun k ap patisipe yo. Pa gen videyo ; se direksyon lekòl la sèlman ki ka bay yon paran lapawòl. Yo trete : vwa a, non an, prezans, men ki leve, ak otorizasyon pou pale (yo ekri yo nan jounal la).',
        'Son an difize an dirèk pa ti bout teknik anviwon 6 segonn, yo estoke pou yon ti tan sou Cloudflare R2 epi yo efase anviwon 60 segonn apre yo fin difize. Yon règ pou efase otomatikman apre 1 jou prevwa kòm yon mezi sekirite anplis (konfigirasyon Cloudflare la dwe rete dokimante). Yon kopi yon bout ka rete nan kach rezo Cloudflare la pandan 24 èdtan pou pi plis. Sistèm NORIA a pa prevwa anrejistreman pèmanan reyinyon yo ni transkripsyon, epi yo pa sèvi ak vwa a pou idantifye yon moun. Klirline fè konnen sistèm nan pa prevwa anrejistreman pèmanan ni transkripsyon ; tan yo kenbe bout yo tout bon rete limite nan dire teknik ki anwo yo.',
        'Moun k ap patisipe yo pa dwe anrejistre reyinyon an san akò lekòl la. Yon avi parèt anvan ou antre nan chak reyinyon. Nenpòt fonksyon anrejistreman alavni ta mande yon nouvo analiz ak yon mizajou politik sa a.',
      ]],
      ['Baz tretman an ak otorizasyon', [
        'Nou trete done lekòl yo paske lekòl la itilize NORIA pou misyon edikasyon li epi li konfye nou tretman an. Misyon edikasyon an pou kont li pa jistifye tout itilizasyon yo : lekòl la ranmase bò kote paran oswa responsab legal yo otorizasyon ki nesesè lè lalwa mande sa (sitou pou piblikasyon piblik oswa nòt sansib), dapre modèl Klirline bay, epi li kenbe prèv la.',
        'Yon elèv minè gen aksè ak NORIA sèlman ak yon kont lekòl li kreye. Règ ayisyen yo sou minorite ak otorite paran an rete pou yon jiris ann Ayiti valide.',
      ]],
      ['Kont piblik, koneksyon ak aparèy', [
        'Pati B — Pòtay piblik ak kont piblik. Kont piblik yo tonbe anba dispozisyon pati sa a sou abònman, anons ak evènman. Done yo ranmase pou rezon sa yo trete apa de done lekòl yo, dapre rezon ak garanti ki aplike.',
        'Kont piblik : adrès imèl oswa nimewo telefòn, lang ak abònman ou chwazi (anons, evènman, laureya, filt pa depatman). Laj minimòm pou yon kont piblik : li rete pou presize dapre lalwa ki aplike a ; yon chemen ki adapte pou minè yo ap mete an plas si sa nesesè. Pou kounye a, itilizasyon pòtay piblik la pa yon minè fèt anba responsabilite paran oswa responsab legal la.',
        'Demann enskripsyon lekòl : non lekòl la, non ak kowòdone moun ki reprezante l la.',
        'Kòd koneksyon : kòd yon sèl fwa yo voye pa imèl oswa pa Telegram, yo kenbe sèlman an fòm anprent, yo bon pou 10 minit.',
        'Koneksyon pa WhatsApp (si li aktive) : nimewo WhatsApp ki ekri nou an ak kòd kout ki nan mesaj la, sèlman pou verifye koneksyon an.',
        'Envitasyon reyinyon : pa imèl epi, si ou te aksepte, pa WhatsApp (lè sa a nimewo ou voye bay Meta pou voye mesaj la). Yon lòt fason pa imèl toujou posib.',
        'Koneksyon pa Telegram (si li aktive) : idantifyan konvèsasyon an ki relye ak kont ou ; ou ka retire lyen Telegram an nenpòt lè.',
        'Aparèy konfyans : si ou koche « Fè aparèy sa a konfyans », anprent yon jeton o aza, yon ti non apwoksimatif aparèy la ak dat itilizasyon yo.',
        'Jounal teknik ak sekirite : adrès IP, dat, paj yo mande, rezilta, anprent navigatè a, eseye konekte ak aksyon sansib (jounal odit).',
        'Kont piblik yo, abònman yo ak koneksyon pa WhatsApp oswa Telegram repoze sou chwa ou : ou ka sispann yo nenpòt lè.',
        'SMS : pa gen okenn voye pa SMS k ap mache. Si sèvis SMS la aktive, nimewo telefòn nan ak enfòmasyon ki nesesè pou voye a ka ale bay yon founisè teknik pou li livre kòd otantifikasyon oswa notifikasyon yo mande. Kominikasyon komèsyal yo ap tonbe anba otorizasyon ki nesesè yo.',
      ]],
      ['Cookies ak mezi odyans', [
        'Ou ka gade pòtay piblik la san cookie piblisite epi san zouti lòt moun pou mezire odyans. Verifikasyon 3 novanm 2026 la pa montre zouti Cloudflare Web Analytics sou sit la. Cloudflare ka depoze yon cookie teknik sekirite si yon pwoteksyon kont abi aktif ; cookie sa a pa itilize pou piblisite. Rezo Cloudflare la ka resevwa rapò teknik sou erè rezo navigatè ou voye (Network Error Logging). Rapò sa yo sèvi pou fyab sèvis la, yo pa sèvi pou mezire odyans.',
        'Cookie NORIA, tout nesesè nèt, HttpOnly, yo pa janm itilize pou piblisite :',
        '• noria_session : sesyon espas lekòl yo (8 èdtan pou pi plis ; li efase lè ou dekonekte).',
        '• noria_appareil : aparèy konfyans, si ou chwazi l (30 jou pou pi plis).',
        '• noria_public : sesyon kont piblik yo (30 jou pou pi plis).',
        '• noria_admin, noria_ministere : sesyon espas administrasyon yo.',
        'Aplikasyon an kenbe tou nan navigatè ou lang lan, dènye kòd lekòl ou te itilize a epi, lè ou pa gen entènèt, sa ou antre k ap tann pou pati. Sou yon aparèy plizyè moun pataje, dekonekte ; lekòl yo responsab aparèy yo mete a dispozisyon.',
      ]],
      ['Faktirasyon ak TCA', [
        'Done faktirasyon yo itilize pou fè, voye ak jere fakti yo, epi pou satisfè obligasyon kontabl ak fiskal ki aplike. Responsablite chak pati depann de wòl reyèl li nan fè fakti yo ak nan pran taks yo.',
        'Fakti abònman NORIA Klirline voye bay lekòl yo (montan san taks, HT, TCA 10 %, total ak taks, TTC ; peman MonCash, NatCash, transfè labank oswa kach, ak referans yo) : se Klirline ki responsab.',
        'Frè lekòl yon lekòl fakti bay fanmi yo nan NORIA : se lekòl la ki responsab ; Klirline bay zouti a sèlman.',
        'Aksè ak done faktirasyon yo limite pou moun ki gen otorizasyon. Estati fiskal Klirline pou TCA ann Ayiti ak mansyon obligatwa sou fakti yo rete pou yon jiris oswa yon kontab ann Ayiti valide.',
      ]],
      ['Laureya ak kontni piblik sou minè', [
        'Pibliye non konplè yon elèv minè sou yon pòtay piblik depann de verifikasyon baz legal ki aplike a ak de otorizasyon ki nesesè yo (sa lekòl la ak sa paran oswa responsab legal la, epi prèv la kenbe). Si sa pa fèt, Klirline pito yon piblikasyon san non — inisyal epi pa gen foto — depi enfòmasyon yo pibliye pa pèmèt idantifye elèv la yon fason endirèk.',
        `Ou ka mande pou retire l nenpòt lè bay lekòl la oswa nan ${CONTACT}.`,
      ]],
      ['Ak kiyès nou pataje done yo', [
        'Gen founisè teknik ki antre sèlman pou fè sèvis la mache, ak done ki nesesè pou sèvis yo sèlman :',
        '• Vultr : sèvè a ak baz done a (sant done Miami, Etazini).',
        '• Cloudflare : fè trafik sit la pase san danje (pwoteksyon, kach, rapò erè rezo).',
        '• Cloudflare R2 : estoke kopi sekou chifre yo ak bout son reyinyon yo pou yon ti tan.',
        '• Resend : voye imèl (kòd, envitasyon, avi, fakti ak rapèl).',
        '• Meta (WhatsApp) : koneksyon pa WhatsApp ak envitasyon, si ou chwazi opsyon sa a.',
        '• Telegram : voye kòd yo, si ou konekte Telegram.',
        'WhatsApp ak Telegram se sèvis ou chwazi itilize ; pwòp politik yo aplike sou sa yo trete bò kote yo. Done yon lekòl parèt sèlman pou kont lekòl sa a, dapre wòl yo. Yo ka ale bay ministè a sèlman lè lekòl la voye yon deklarasyon oswa lè yon transfè elèv mande sa. Nou ka kominike done si lalwa oblije nou.',
      ]],
      ['Ki kote done yo trete', [
        'Gen enfòmasyon founisè ki chita andeyò peyi kote itilizatè a rete ka trete, sitou Etazini : baz done a chita Miami (Etazini), Klirline fè sèvis la mache depi Canada, epi rezo Cloudflare la ansanm ak lòt founisè yo ka trete done nan lòt peyi, nan rejyon ki depann de kontra founisè yo epi ki rete pou dokimante. Done sa yo ka tonbe anba lwa peyi sa yo.',
        'Klirline dokimante flux yo konsène epi mete garanti nan kontra ak garanti teknik lalwa ki aplike a mande. Nou pa pretann done yo rete sèlman nan Canada oswa ann Ayiti.',
      ]],
      ['Konbyen tan nou kenbe yo', [
        '• Done lekòl : toutan lekòl la ap itilize NORIA ; lè kontra a fini, 60 jou pou ekspòte, apre sa yo efase nan sistèm k ap mache yo dapre enstriksyon lekòl la, sof obligasyon legal yo.',
        '• Kòd koneksyon, demann WhatsApp : 10 minit validite.',
        '• Lyen Telegram k ap tann : 15 minit.',
        '• Bout son reyinyon yo : anviwon 60 segonn apre difizyon an (mezi sekirite anplis ki prevwa : 1 jou ; kach Cloudflare : 24 èdtan pou pi plis).',
        '• Aparèy konfyans : 30 jou pou pi plis ; yo efase pi bonè lè ou dekonekte, lè ou retire yo, oswa lè modpas la chanje.',
        '• Jounal sekirite : anviwon 35 jou.',
        '• Kopi sekou chifre : 30 chak jou, 4 chak semèn, 12 chak mwa. Yon done ki efase disparèt nan kopi sekou yo pi ta apre anviwon 12 mwa epi yo pa retabli l, sof si gen yon gwo dezas (reglaj pwodiksyon ki dokimante bò kote sèvè a).',
        '• Kont piblik : jiskaske yo efase sou demann ou, dapre politik konsèvasyon kont yo.',
        '• Fakti ak pyès kontabl : dire lalwa fiskal ki aplike a mande (pou presize ak yon konsèy konpetan).',
        '• Foto badj : jiskaske yo retire l sou demann bay lekòl la oswa jiskaske lekòl la fini (dire lekòl la fikse).',
      ]],
      ['Kijan nou pwoteje yo', [
        'Koneksyon chifre (HTTPS) ; modpas, kòd ak jeton kenbe sèlman an fòm anprent ; kopi sekou chifre ; chak lekòl separe nan baz done a (sekirite nivo liy), sa ki vize anpeche yon lekòl rive nan done yon lòt ; aksè limite dapre wòl, jounal aksyon sansib, limit sou eseye konekte ak siveyans konpòtman sispèk.',
        'Pa gen okenn mezi ki pafè. Si gen yon ensidan konfidansyalite, Klirline enfòme etablisman an san reta ki pa nesesè apre li fin konnen yon ensidan sekirite ki ka konsène done yo trete pou kont li. Pati yo kolabore pou evalye risk yo, limite konsekans yo epi fè notifikasyon lalwa ki aplike a mande (otorite konpetan yo ak moun yo konsène). Klirline kenbe yon rejis ensidan.',
      ]],
      ['Dwa ou', [
        'Ou ka mande pou wè done ou, pou fè yo korije oswa efase, epi retire yon konsantman ou te bay (abònman, WhatsApp, Telegram, piblikasyon piblik). Egzèsis dwa sa yo depann de lalwa ki aplike a ak obligasyon legal pou kenbe done.',
        'Done lekòl : pale ak lekòl ou anvan, li ka korije dosye a dirèkteman ; si ou ekri nou, n ap voye demann ou an bay lekòl la.',
        `Lòt done : ${CONTACT}. Nou verifye idantite ou epi n ap reponn nan yon delè rezonab dapre lalwa ki aplike a.`,
        `Plent : ekri responsab pwoteksyon enfòmasyon pèsonèl yo (${CONTACT}) ; nou konfime nou resevwa l epi n ap reponn alekri. Ou ka ekri tou Komisyon aksè a enfòmasyon Québec la oswa Komisyonè pwoteksyon vi prive Canada a, dapre sitiyasyon ou. Pou moun ki ann Ayiti, otorite konpetan an ap endike depi yon konsèy lokal konfime l.`,
        'Ou ka retire lyen Telegram epi retire aparèy konfyans ou yo poukont ou nan « Koneksyon ak aparèy ».',
      ]],
      ['Chanjman', [
        'Nou mete politik sa a ajou lè NORIA evolye. Dat ki anlè paj la montre dènye vèsyon an ; si gen yon gwo chanjman, n ap enfòme lekòl yo omwen 30 jou alavans, ansanm ak itilizatè yo konsène, ak yon avi ki parèt. Istorik vèsyon yo kenbe.',
        `Kontak : Philippe Davenson Azor, responsab pwoteksyon enfòmasyon pèsonèl yo — ${CONTACT} — Klirline Inc. (nimewo antrepriz 777880576RC0001), Montréal (Québec), Canada.`,
      ]],
    ],
    contact: `Kontak : Philippe Davenson Azor — ${CONTACT}`,
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
