'use strict';
// Politique de confidentialité publique du portail (/confidentialite et /ht/confidentialite), en français et en kreyòl.
// Texte statique, sans script ni ressource externe ; rendu par portail-pages.js dans la mise en page du portail.
// Le contenu décrit ce que NORIA fait réellement (voir docs/confidentialite.md). À faire relire par un juriste avant de
// s'en prévaloir : aucune certification ni conformité n'y est revendiquée. Ne pas publier tant que Philippe n'a pas dit
// « publier ». Ce bandeau reste dans le code et la documentation, pas sur la page.
const UPDATED = '2026-11-03';
const CONTACT = 'contact@klirline.ca';

const C = {
  fr: {
    title: 'Politique de confidentialité',
    desc: 'Quelles données personnelles NORIA (Klirline Inc.) traite, qui en décide, avec qui elles sont partagées, combien de temps elles sont gardées et comment exercer vos droits.',
    updated: 'Dernière mise à jour : 3 novembre 2026 — version 2.0',
    intro: 'Cette page explique quelles données personnelles NORIA traite, pourquoi, qui en est responsable, avec qui elles sont partagées, où elles sont traitées, combien de temps elles sont gardées et comment exercer vos droits. Elle s’applique au portail public https://noriaedu.com, à l’espace des écoles (https://noriaedu.com/app), aux réunions audio entre l’école et les parents et aux services de connexion associés. Résumé en créole haïtien : https://noriaedu.com/ht/confidentialite. Elle comporte deux parties : A. Services scolaires (données saisies et utilisées par les écoles) et B. Portail public et comptes grand public.',
    sections: [
      ['Qui sommes-nous', [
        'NORIA est un logiciel de gestion scolaire édité et exploité par Klirline Inc. (« Klirline », « nous »), société établie à Montréal (Québec), Canada, numéro d’entreprise 777880576RC0001. Adresse : Montréal (Québec), Canada.',
        `Responsable de la protection des renseignements personnels : Philippe Davenson Azor, président de Klirline Inc. — ${CONTACT}.`,
        `Pour toute question, demande d’accès ou de rectification, ou plainte relative à la protection des renseignements personnels, écrivez au responsable à ${CONTACT}.`,
      ]],
      ['Qui décide de l’utilisation de vos données', [
        'Données scolaires. Pour les données traitées dans les services scolaires, l’école décide des finalités pédagogiques et administratives. Klirline traite ces données selon le contrat et les instructions de l’école. Votre école reste votre premier interlocuteur pour le dossier scolaire.',
        'Traitements propres à Klirline. Pour la sécurité du service et les journaux techniques, les comptes grand public du portail, la facturation de l’abonnement NORIA aux écoles et l’amélioration de la fiabilité du service, Klirline décide des finalités qui lui sont propres.',
        'Qui décide, en bref :',
        '• Dossier scolaire, comptes de l’espace école, photo de badge, réunions audio, paiements de scolarité : l’école (Klirline traite pour son compte).',
        '• Lauréats et contenus scolaires sur le portail public : l’école propose et recueille les autorisations ; Klirline publie sur instruction.',
        '• Journaux de sécurité, prévention des abus, sauvegardes : Klirline, pour la sécurité du service.',
        '• Comptes grand public, abonnements, demandes d’inscription d’école : Klirline.',
        '• Factures de l’abonnement NORIA émises aux écoles : Klirline.',
      ]],
      ['Données que nous traitons pour les écoles', [
        'Partie A — Services scolaires. Cette section et les quatre suivantes portent sur les données saisies et utilisées par les écoles.',
        'Comptes (direction, secrétariat, enseignants, parents, élèves) : nom, rôle, école, adresse courriel et/ou numéro de téléphone, langue préférée, mot de passe (stocké uniquement sous forme d’empreinte).',
        'Dossier scolaire saisi par l’école : identité de l’élève (nom, prénom, code élève, date de naissance), classe et inscription, lien parent-enfant, notes, évaluations et bulletins, présences et absences, prêts de bibliothèque, relevés, certificats et transferts entre écoles, notifications ; déclarations annuelles au ministère lorsque ce module est activé.',
        'Remarques de santé ou familiales : facultatives. Dans le produit, seules la direction et le secrétariat les voient. Elles ne sont pas transmises au ministère ni dans le dossier de transfert.',
        'Photo de badge (carte d’élève) : voir « Photo de badge et photos publiques ».',
        'Paiements de scolarité : montants, reçus et factures que l’école émet aux familles. L’école est l’émettrice ; NORIA est l’outil.',
        'Réunions audio : voir « Réunions audio entre l’école et les parents ».',
        'Les données des élèves servent à la gestion scolaire et à l’enseignement. La publication publique d’une photographie ou d’un résultat nominatif fait l’objet d’un examen distinct et des autorisations nécessaires.',
      ]],
      ['Pourquoi nous les utilisons', [
        'Fournir le service demandé par l’école : gestion des élèves, des notes, des présences, des bulletins, des paiements et de la communication avec les familles.',
        'Vous connecter de façon sûre (voir « Comptes grand public, connexion et appareils »).',
        'Organiser les réunions audio entre l’école et les parents.',
        'Envoyer les messages liés au service (codes, invitations, avis). Les coordonnées fournies par l’école servent aux communications scolaires nécessaires. Elles ne servent pas au marketing sans le consentement ou l’autorisation que le droit applicable exige.',
        'Assurer la sécurité, prévenir la fraude, corriger les erreurs et garder des sauvegardes.',
        'Nous n’utilisons pas vos données pour de la publicité ciblée, nous ne créons pas de profils commerciaux et nous ne vendons ni ne louons aucune donnée personnelle.',
      ]],
      ['Photo de badge et photos publiques : deux usages distincts', [
        'Photo de badge. Elle sert à l’identification et à la gestion scolaire. Elle n’est pas publiée. Après connexion, elle est visible par le personnel autorisé de l’école, l’élève et ses parents. Les métadonnées et la localisation sont retirées. L’école peut la retirer sur demande. Aucune reconnaissance faciale n’est utilisée. Elle n’est pas réutilisée pour une promotion ni publiée sur le portail public sans un examen distinct et les autorisations nécessaires.',
        'Photos et contenus publics. Toute photo ou tout résultat destiné au portail public fait l’objet d’une autorisation distincte (voir « Lauréats et contenus publics concernant des mineurs »).',
      ]],
      ['Réunions audio entre l’école et les parents', [
        'La diffusion audio NORIA transmet la voix des participants. Il n’y a pas de vidéo dans cette diffusion : seule la direction de l’école peut donner la parole à un parent. Sont traités : la voix, le nom, la présence, les mains levées et les autorisations de prise de parole (journalisées).',
        'Le son est envoyé en direct par segments techniques d’environ 6 secondes, déposés temporairement sur Cloudflare R2 (préfixe r/) et retirés environ 60 secondes après leur sortie de la liste de lecture. Une règle de cycle de vie prévue sur ce préfixe sert de filet de sécurité : elle supprime après 1 jour ce qui resterait, par exemple si l’application redémarre pendant une réunion. Une copie d’un segment peut rester dans le cache du réseau Cloudflare jusqu’à environ 24 heures (le segment est envoyé avec une durée de cache d’un jour). Le produit NORIA ne fait pas d’enregistrement permanent ni de transcription, et la voix n’est pas utilisée pour identifier une personne.',
        'L’école peut indiquer un lien https de rediffusion qu’elle héberge ailleurs. NORIA conserve ce lien, pas le fichier audio.',
        'S’il n’y a pas de flux audio NORIA et que l’assistance prévue ne dépasse pas le seuil (50 parents par défaut), un lien audio Jitsi peut être remis aux parents (meet.jit.si, ou l’adresse configurée sur le serveur). Les intervenants (direction, secrétariat, enseignants) reçoivent un lien de salle Jitsi. NORIA ne stocke pas cet audio ; Jitsi traite ce qui passe par sa salle, selon sa propre politique.',
        'La salle de cours Jitsi sur meet.systemli.org, dans l’application, est une démonstration. Elle ne doit pas servir à des dossiers d’élèves réels. NORIA n’y copie ni le son ni l’image.',
        'Les participants ne doivent pas enregistrer la réunion sans l’accord de l’école. Toute fonction d’enregistrement permanent ferait l’objet d’une nouvelle analyse et d’une mise à jour de cette politique.',
      ]],
      ['Base du traitement et autorisations', [
        'Les données scolaires sont traitées parce que l’école utilise NORIA pour sa mission éducative et nous en confie le traitement. Cette mission ne couvre pas à elle seule la publication publique ni les remarques sensibles : l’école recueille auprès des parents ou tuteurs les autorisations que la loi exige, selon les modèles fournis par Klirline, et en conserve la preuve.',
        'Un élève mineur n’a accès à NORIA que par un compte créé par son école.',
      ]],
      ['Comptes grand public, connexion et appareils', [
        'Partie B — Portail public et comptes grand public. Les comptes, abonnements, annonces et événements de cette partie sont séparés des données scolaires.',
        'Comptes grand public : adresse courriel ou numéro de téléphone, langue et abonnements choisis (annonces, événements, actualités, lauréats, filtre par département). Le produit ne demande pas une déclaration d’âge à la création du compte.',
        'Demandes d’inscription d’école : nom de l’école, département, commune, nom de la direction, courriel, téléphone facultatif, effectif approximatif et message facultatif.',
        'Codes de connexion : codes à usage unique envoyés par courriel ou par Telegram, gardés seulement sous forme d’empreinte, valables 10 minutes.',
        'Connexion par WhatsApp (si elle est activée) : le numéro WhatsApp qui nous écrit et le code court du message, uniquement pour vérifier la connexion. Le message passe par WhatsApp, donc par Meta.',
        'Invitations aux réunions : par courriel. S’il n’y a pas d’adresse courriel, NORIA prépare un lien wa.me pour que l’école l’envoie elle-même ; NORIA n’appelle pas l’interface de Meta pour cet envoi. Dès qu’une adresse courriel existe, c’est elle qui est utilisée.',
        'Connexion par Telegram (si elle est activée) : l’identifiant de conversation (chat id) relié à votre compte. Vous pouvez délier Telegram à tout moment. Le lien d’association en attente expire après 15 minutes.',
        'Appareils de confiance : si vous cochez « Faire confiance à cet appareil », l’empreinte d’un jeton aléatoire, un libellé approximatif de l’appareil et les dates d’utilisation.',
        'Journaux techniques et de sécurité : adresse IP, date, page demandée, résultat, empreinte du navigateur, tentatives de connexion et actions sensibles (journal d’audit).',
        'Les comptes grand public, les abonnements et la connexion par WhatsApp ou Telegram reposent sur votre choix : vous pouvez les arrêter à tout moment.',
        'SMS : aucun envoi par SMS n’est actif (le canal reste simulé). Si un service SMS est activé plus tard, le numéro de téléphone et les informations nécessaires à l’envoi pourront être transmis à un prestataire technique pour délivrer les codes ou les notifications demandés. Les communications commerciales resteraient soumises aux autorisations requises.',
      ]],
      ['Cookies et mesure d’audience', [
        'Le portail public se consulte sans cookie publicitaire et sans outil tiers de mesure d’audience. Une consultation ordinaire des pages publiques ne dépose pas de cookie NORIA. Les scripts de page ne sont autorisés que depuis le site lui-même. Aucun témoin Cloudflare Web Analytics n’est chargé.',
        'Le réseau Cloudflare indique au navigateur une consigne de rapports d’erreurs réseau (Network Error Logging). Ces rapports portent sur des erreurs de passage, pas sur une mesure d’audience. NORIA ne s’en sert pas pour compter les visiteurs.',
        'Cookies NORIA, tous strictement nécessaires au service, jamais utilisés pour la publicité :',
        '• noria_session : session de l’espace des écoles, HttpOnly, 8 heures au plus, supprimé à la déconnexion.',
        '• noria_appareil : appareil de confiance, si vous le choisissez, HttpOnly, 30 jours au plus.',
        '• noria_public : session des comptes grand public, HttpOnly, 30 jours au plus.',
        '• noria_pub_in : témoin sans secret (la valeur est « 1 »), pour afficher « Mon compte » sur les pages mises en cache, 30 jours au plus, retiré avec la session.',
        '• noria_admin : session d’administration de la plateforme, HttpOnly, 2 heures au plus.',
        '• noria_ministere : session de l’espace du ministère, HttpOnly, 4 heures au plus.',
        'L’application garde aussi dans votre navigateur la langue, le dernier code d’école utilisé et, hors ligne, les saisies en attente d’envoi. Sur un appareil partagé, déconnectez-vous. Les écoles sont responsables des appareils qu’elles mettent à disposition.',
      ]],
      ['Facturation et TCA', [
        'Les données de facturation servent à établir, transmettre et gérer les factures, et à répondre aux obligations comptables et fiscales applicables. Le rôle de chaque partie suit qui émet la facture.',
        'Factures de l’abonnement NORIA émises par Klirline aux écoles : montant hors taxe, TCA de 10 % ajoutée par le produit sur les factures nouvelles, total toutes taxes comprises ; paiements MonCash, NatCash, virement ou espèces, avec leur référence. Klirline est responsable de ces factures. Une facture émise avant cette règle peut ne pas comporter de ligne de TCA.',
        'Frais de scolarité facturés par une école aux familles dans NORIA : l’école est responsable et émettrice ; Klirline fournit l’outil.',
        'L’accès est limité aux personnes autorisées (pour l’école : direction, secrétariat et comptabilité ; pour l’abonnement NORIA : l’administration Klirline). Les factures et les paiements de l’abonnement ne s’effacent pas dans la base : ils restent pour la comptabilité. [à confirmer : durée précise de conservation fiscale en Haïti]',
      ]],
      ['Lauréats et contenus publics concernant des mineurs', [
        'Le nom complet et la photo d’un élève mineur ne sont publiés sur le portail public que si l’école et le parent ou tuteur ont donné les autorisations requises. La preuve est conservée (nom du parent, date, auteur de la saisie). Le nom du parent n’est pas public.',
        'Sinon, la publication est non nominative : initiales de chaque mot du nom, et aucune photo. La photo n’est alors pas servie.',
        `Un retrait peut être demandé à tout moment à l’école ou à ${CONTACT}.`,
      ]],
      ['Avec qui nous partageons les données', [
        'Des prestataires techniques interviennent uniquement pour faire fonctionner le service, avec les seules données nécessaires à leur prestation :',
        '• Vultr : hébergement du serveur et de la base de données (centre de données de Miami, États-Unis).',
        '• Cloudflare : acheminement sécurisé du trafic (protection, mise en cache, rapports d’erreurs réseau).',
        '• Cloudflare R2 : stockage chiffré des sauvegardes et stockage temporaire des segments audio des réunions (préfixe r/).',
        '• Resend : envoi des courriels (codes, invitations, avis, factures et rappels).',
        '• Meta (WhatsApp) : connexion par WhatsApp, si vous avez choisi cette option.',
        '• Telegram : envoi des codes, si vous avez relié Telegram.',
        '• Jitsi (meet.jit.si, ou le serveur configuré) : salle des intervenants et, pour une petite réunion sans flux NORIA, lien audio des parents. La démonstration de cours (meet.systemli.org) ne doit pas recevoir de dossiers d’élèves.',
        'WhatsApp, Telegram et Jitsi sont des services que vous ou l’école choisissez d’utiliser ; leurs propres politiques s’appliquent à ce qu’ils traitent de leur côté. Les données d’une école ne sont visibles que par les comptes de cette école, selon leur rôle. Elles peuvent être transmises au ministère uniquement lorsque l’école envoie une déclaration ou qu’un transfert d’élève le prévoit. Les notes de santé, les notes familiales et les contacts ne font pas partie de cet envoi au ministère. Nous ne vendons ni ne louons aucune donnée personnelle. Nous pouvons communiquer des données si la loi nous y oblige.',
      ]],
      ['Où les données sont traitées', [
        'Certains renseignements sont traités hors du pays de résidence de l’utilisateur, notamment aux États-Unis : la base de données est hébergée à Miami. Klirline exploite le service depuis le Canada (Montréal). Cloudflare, y compris R2 dont l’emplacement du stockage est automatique, ainsi que les autres prestataires, peuvent traiter des données dans d’autres pays. Les régions exactes de Resend, de Meta et de Telegram ne sont pas fixées dans le code de NORIA. [à confirmer : régions contractuelles de Resend, Meta et Telegram]',
        'Ces données peuvent alors être soumises aux lois de ces pays. Klirline documente les flux concernés et met en place les garanties contractuelles et techniques que le droit applicable exige. Nous ne prétendons pas à un hébergement exclusivement canadien ou haïtien.',
      ]],
      ['Combien de temps nous les gardons', [
        'Données scolaires : tant que l’école utilise NORIA. À la fin du contrat, l’école a 60 jours pour exporter. Ensuite, les données sont supprimées des systèmes actifs, selon les instructions de l’école, sous réserve des obligations légales de conservation. Ce qui resterait dans une sauvegarde disparaît selon le calendrier des sauvegardes (au plus environ 12 mois).',
        'Codes de connexion et demandes WhatsApp : 10 minutes de validité. Lien Telegram en attente : 15 minutes.',
        'Segments audio des réunions NORIA : environ 60 secondes après leur sortie de la liste. Filet de sécurité prévu : suppression après 1 jour sur le préfixe r/. Cache Cloudflare : 24 heures au plus.',
        'Appareils de confiance : 30 jours au plus. Ils sont retirés plus tôt à la déconnexion, à la révocation, ou lorsque le mot de passe est réinitialisé (les sessions du compte sont alors fermées).',
        'Journaux de sécurité : environ 35 jours.',
        'Sauvegardes chiffrées sur Cloudflare R2 : 30 quotidiennes, 4 hebdomadaires et 12 mensuelles. Une donnée supprimée disparaît des sauvegardes au plus tard après environ 12 mois. Une sauvegarde n’est restaurée qu’en cas de sinistre, dans une base vide.',
        'Comptes grand public : jusqu’à leur suppression à votre demande, immédiate depuis « Mon compte ». Aucune durée d’inactivité ne les efface automatiquement.',
        'Factures et pièces comptables : pendant la durée exigée par la loi fiscale applicable. Le produit empêche de les supprimer dans la base. [à confirmer : durée précise de conservation fiscale en Haïti]',
        'Photo de badge : jusqu’au retrait demandé à l’école, ou tant que le dossier de l’élève est conservé.',
      ]],
      ['Comment nous les protégeons', [
        'Connexions chiffrées (HTTPS). Mots de passe, codes et jetons conservés uniquement sous forme d’empreinte. Sauvegardes chiffrées.',
        'Cloisonnement des écoles dans la base de données (sécurité au niveau des lignes), qui vise à empêcher qu’une école accède aux données d’une autre.',
        'Accès limité selon le rôle, journal des actions sensibles, limitation des tentatives de connexion et surveillance des comportements suspects.',
        'Aucune mesure n’est parfaite. Si Klirline prend connaissance d’un incident de sécurité susceptible de concerner les données traitées pour une école, elle en informe l’établissement sans délai indu. Les parties coopèrent pour évaluer les risques, limiter les conséquences et effectuer les notifications que le droit applicable exige, auprès des autorités compétentes et des personnes concernées. Klirline tient un registre des incidents.',
      ]],
      ['Vos droits', [
        'Vous pouvez demander à accéder à vos données, à les faire corriger ou supprimer, et retirer un consentement donné (abonnements, WhatsApp, Telegram, publication publique). L’exercice de ces droits dépend du droit applicable et des obligations légales de conservation.',
        'Données scolaires : adressez-vous d’abord à votre école, qui peut corriger le dossier directement. Si vous nous écrivez, nous transmettons votre demande à l’école.',
        `Autres données : ${CONTACT}. Nous vérifions votre identité et répondons dans un délai de 30 jours.`,
        `Plainte : écrivez au responsable de la protection des renseignements personnels (${CONTACT}). Nous accusons réception et répondons par écrit. Vous pouvez aussi vous adresser à la Commission d’accès à l’information du Québec ou au Commissariat à la protection de la vie privée du Canada, selon votre situation. [à confirmer : autorité haïtienne compétente, lorsqu’elle est identifiée, pour les personnes en Haïti]`,
        'Vous pouvez délier Telegram et révoquer vos appareils de confiance vous-même dans « Connexion et appareils ».',
      ]],
      ['Modifications', [
        'Nous mettons à jour cette politique quand NORIA évolue. La date en haut de la page indique la dernière version. En cas de changement important, nous en informons les écoles au moins 30 jours à l’avance, ainsi que les utilisateurs concernés, par un avis visible. L’historique des versions est conservé.',
        'Contact : Philippe Davenson Azor, responsable de la protection des renseignements personnels — contact@klirline.ca — Klirline Inc. (numéro d’entreprise 777880576RC0001), Montréal (Québec), Canada.',
      ]],
    ],
    contact: `Contact : Philippe Davenson Azor — ${CONTACT}`,
    link: 'Confidentialité',
  },
  ht: {
    title: 'Politik konfidansyalite',
    desc: 'Ki done pèsonèl NORIA (Klirline Inc.) trete, kiyès ki deside, ak ki moun yo pataje, konbyen tan yo kenbe yo epi kijan ou ka sèvi ak dwa ou.',
    updated: 'Dènye mizajou : 3 novanm 2026 — vèsyon 2.0',
    intro: 'Paj sa a esplike ki done pèsonèl NORIA trete, poukisa, kiyès ki responsab, ak ki moun yo pataje, ki kote yo trete yo, konbyen tan yo kenbe yo epi kijan ou ka sèvi ak dwa ou. Li aplike pou pòtay piblik https://noriaedu.com, espas lekòl yo (https://noriaedu.com/app), reyinyon ak son ant lekòl la ak paran yo, ak sèvis koneksyon ki ale avè yo. Rezime an franse : https://noriaedu.com/confidentialite. Li gen de pati : A. Sèvis lekòl (done lekòl yo antre epi itilize) ak B. Pòtay piblik ak kont piblik.',
    sections: [
      ['Kiyès nou ye', [
        'NORIA se yon lojisyèl jesyon lekòl Klirline Inc. (« Klirline », « nou ») fè epi fè mache. Konpayi an chita nan Montréal (Québec), Canada, nimewo antrepriz 777880576RC0001. Adrès : Montréal (Québec), Canada.',
        `Responsab pwoteksyon enfòmasyon pèsonèl yo : Philippe Davenson Azor, prezidan Klirline Inc. — ${CONTACT}.`,
        `Pou nenpòt kesyon, demann pou wè oswa korije done, oswa plent sou pwoteksyon enfòmasyon pèsonèl, ekri responsab la nan ${CONTACT}.`,
      ]],
      ['Kiyès ki deside kijan done ou yo itilize', [
        'Done lekòl. Pou done yo trete nan sèvis lekòl yo, se lekòl la ki deside pouki rezon pedagojik ak administratif. Klirline trete done sa yo dapre kontra a ak enstriksyon lekòl la. Lekòl ou a rete premye moun pou pale sou dosye lekòl la.',
        'Tretman ki pou Klirline. Pou sekirite sèvis la ak jounal teknik yo, kont piblik pòtay la, fakti abònman NORIA pou lekòl yo, ak pou fè sèvis la pi solid, se Klirline ki deside rezon pa l yo.',
        'Kiyès ki deside, an rezime :',
        '• Dosye lekòl, kont espas lekòl la, foto badj, reyinyon ak son, peman frè lekòl : lekòl la (Klirline trete pou li).',
        '• Laureya ak kontni lekòl sou pòtay piblik la : lekòl la pwopoze epi ranmase otorizasyon yo ; Klirline pibliye sou enstriksyon.',
        '• Jounal sekirite, prevansyon abi, kopi sekou : Klirline, pou sekirite sèvis la.',
        '• Kont piblik, abònman, demann enskripsyon lekòl : Klirline.',
        '• Fakti abònman NORIA yo voye bay lekòl yo : Klirline.',
      ]],
      ['Done nou trete pou lekòl yo', [
        'Pati A — Sèvis lekòl. Seksyon sa a ak kat ki vin apre yo pale de done lekòl yo antre epi itilize.',
        'Kont (direksyon, sekretarya, pwofesè, paran, elèv) : non, wòl, lekòl, adrès imèl ak/oswa nimewo telefòn, lang ou pito, modpas (nou kenbe sèlman yon anprent li).',
        'Dosye lekòl la antre : idantite elèv la (non, prenon, kòd elèv, dat nesans), klas ak enskripsyon, lyen paran-pitit, nòt, evalyasyon ak bilten, prezans ak absans, prè nan bibliyotèk, relve, sètifika ak transfè ant lekòl, notifikasyon ; deklarasyon chak ane bay ministè a lè modil sa a aktive.',
        'Nòt sou sante oswa fanmi : si lekòl la vle. Nan pwodui a, se direksyon ak sekretarya sèlman ki wè yo. Yo pa ale bay ministè a ni nan dosye transfè a.',
        'Foto badj (kat elèv) : gade « Foto badj ak foto piblik ».',
        'Peman frè lekòl : montan, resi ak fakti lekòl la voye bay fanmi yo. Se lekòl la ki fè fakti a ; NORIA se zouti a.',
        'Reyinyon ak son : gade « Reyinyon ak son ant lekòl la ak paran yo ».',
        'Done elèv yo sèvi pou jesyon lekòl la ak ansèyman an. Pibliye yon foto oswa yon rezilta ak non sou entènèt mande yon egzamen apa ak otorizasyon ki nesesè yo.',
      ]],
      ['Poukisa nou sèvi avè yo', [
        'Bay sèvis lekòl la mande : jesyon elèv, nòt, prezans, bilten, peman ak kominikasyon ak fanmi yo.',
        'Konekte ou san danje (gade « Kont piblik, koneksyon ak aparèy »).',
        'Òganize reyinyon ak son ant lekòl la ak paran yo.',
        'Voye mesaj ki gen rapò ak sèvis la (kòd, envitasyon, avi). Kowòdone lekòl la bay yo sèvi pou kominikasyon lekòl ki nesesè. Yo pa sèvi pou maketing san konsantman oswa otorizasyon lalwa mande.',
        'Asire sekirite, anpeche fwod, korije erè epi kenbe kopi sekou.',
        'Nou pa sèvi ak done ou pou piblisite sible, nou pa fè pwofil komèsyal epi nou pa vann ni lwe okenn done pèsonèl.',
      ]],
      ['Foto badj ak foto piblik : de itilizasyon diferan', [
        'Foto badj. Li sèvi pou idantifye elèv la ak pou jesyon lekòl la. Yo pa pibliye l. Apre koneksyon, pèsonèl lekòl la ki gen dwa, elèv la ak paran li ka wè l. Done ki dekri fichye a ak kote li te pran yo retire. Lekòl la ka retire l sou demann. Pa gen rekonesans figi. Yo pa sèvi avè l pou piblisite ni pibliye l sou pòtay piblik la san yon egzamen apa ak otorizasyon ki nesesè yo.',
        'Foto ak kontni piblik. Nenpòt foto oswa rezilta pou pòtay piblik la mande yon otorizasyon apa (gade « Laureya ak kontni piblik sou minè »).',
      ]],
      ['Reyinyon ak son ant lekòl la ak paran yo', [
        'Difizyon son NORIA a transmèt vwa moun ki ladan l yo. Pa gen videyo nan difizyon sa a : se direksyon lekòl la sèlman ki ka bay yon paran lapawòl. Yo trete : vwa a, non an, prezans, men ki leve ak otorizasyon pou pale (yo ekri yo nan jounal la).',
        'Son an ale an dirèk pa ti bout teknik anviwon 6 segonn, yo poze pou yon ti tan sou Cloudflare R2 (prefiks r/) epi yo retire yo anviwon 60 segonn apre yo soti nan lis lekti a. Yon règ dire lavi ki prevwa sou prefiks sa a se yon mezi sekirite anplis : li efase apre 1 jou sa ki ta rete, pa egzanp si aplikasyon an rekòmanse pandan yon reyinyon. Yon kopi yon bout ka rete nan kach rezo Cloudflare la jiska anviwon 24 èdtan (bout la voye ak yon dire kach yon jou). Pwodui NORIA a pa fè anrejistreman pèmanan ni transkripsyon, epi li pa sèvi ak vwa a pou idantifye yon moun.',
        'Lekòl la ka mete yon lyen https pou yon redifizyon li estoke yon lòt kote. NORIA kenbe lyen an, pa fichye son an.',
        'Si pa gen flux son NORIA epi kantite moun yo prevwa pa depase limit la (50 paran pa defo), yo ka bay paran yo yon lyen son Jitsi (meet.jit.si, oswa adrès ki regle sou sèvè a). Moun ki pale yo (direksyon, sekretarya, pwofesè) resevwa yon lyen sal Jitsi. NORIA pa estoke son sa a ; Jitsi trete sa ki pase nan sal li a, dapre pwòp politik li.',
        'Sal kou Jitsi sou meet.systemli.org, nan aplikasyon an, se yon demonstrasyon. Li pa dwe sèvi pou dosye elèv reyèl. NORIA pa kopye ni son ni imaj la.',
        'Moun ki ladan reyinyon an pa dwe anrejistre l san akò lekòl la. Nenpòt fonksyon anrejistreman pèmanan ta mande yon nouvo analiz ak yon mizajou politik sa a.',
      ]],
      ['Baz tretman an ak otorizasyon', [
        'Nou trete done lekòl yo paske lekòl la sèvi ak NORIA pou misyon edikasyon li epi li konfye nou tretman an. Misyon sa a pou kont li pa kouvri piblikasyon piblik ni nòt sansib yo : lekòl la ranmase bò kote paran oswa responsab legal yo otorizasyon lalwa mande, dapre modèl Klirline bay, epi li kenbe prèv la.',
        'Yon elèv minè gen aksè ak NORIA sèlman ak yon kont lekòl li kreye.',
      ]],
      ['Kont piblik, koneksyon ak aparèy', [
        'Pati B — Pòtay piblik ak kont piblik. Kont, abònman, anons ak evènman pati sa a separe de done lekòl yo.',
        'Kont piblik : adrès imèl oswa nimewo telefòn, lang ak abònman ou chwazi (anons, evènman, nouvèl, laureya, filt pa depatman). Pwodui a pa mande yon deklarasyon laj lè kont la kreye.',
        'Demann enskripsyon lekòl : non lekòl la, depatman, komin, non direksyon an, imèl, telefòn si genyen, kantite elèv apwoksimatif ak mesaj si genyen.',
        'Kòd koneksyon : kòd yon sèl fwa nou voye pa imèl oswa pa Telegram, nou kenbe sèlman yon anprent yo, yo bon pou 10 minit.',
        'Koneksyon pa WhatsApp (si li aktive) : nimewo WhatsApp ki ekri nou an ak ti kòd ki nan mesaj la, sèlman pou verifye koneksyon an. Mesaj la pase pa WhatsApp, kidonk pa Meta.',
        'Envitasyon reyinyon : pa imèl. Si pa gen adrès imèl, NORIA prepare yon lyen wa.me pou lekòl la voye l li menm ; NORIA pa rele entèfas Meta pou voye sa a. Depi gen yon adrès imèl, se li yo itilize.',
        'Koneksyon pa Telegram (si li aktive) : idantifyan konvèsasyon an (chat id) ki konekte ak kont ou. Ou ka retire Telegram nenpòt lè. Lyen asosyasyon k ap tann lan ekspire apre 15 minit.',
        'Aparèy konfyans : si ou koche « Fè aparèy sa a konfyans », anprent yon jeton o aza, yon ti non pou aparèy la ak dat ou te sèvi avè l.',
        'Jounal teknik ak sekirite : adrès IP, dat, paj ou mande, rezilta, anprent navigatè a, eseye konekte ak aksyon sansib (jounal odit).',
        'Kont piblik, abònman ak koneksyon pa WhatsApp oswa Telegram depann de chwa ou : ou ka sispann yo nenpòt lè.',
        'SMS : pa gen okenn voye pa SMS k ap mache (kanal la rete simule). Si yon sèvis SMS aktive pita, nimewo telefòn nan ak enfòmasyon ki nesesè pou voye a ka ale bay yon founisè teknik pou li livre kòd oswa notifikasyon yo mande. Kominikasyon komèsyal yo ta rete anba otorizasyon ki nesesè yo.',
      ]],
      ['Cookies ak mezi odyans', [
        'Ou ka gade pòtay piblik la san cookie piblisite epi san zouti lòt moun pou mezire odyans. Yon vizit nòmal sou paj piblik yo pa depoze cookie NORIA. Script paj yo otorize sèlman depi sit la menm. Pa gen temwen Cloudflare Web Analytics ki chaje.',
        'Rezo Cloudflare la di navigatè a kijan pou rapòte erè rezo (Network Error Logging). Rapò sa yo pale de erè pasaj, pa de mezi odyans. NORIA pa sèvi avè yo pou konte vizitè.',
        'Cookie NORIA, tout nesesè pou sèvis la, yo pa janm sèvi pou piblisite :',
        '• noria_session : sesyon espas lekòl yo, HttpOnly, 8 èdtan pou pi plis, li disparèt lè ou dekonekte.',
        '• noria_appareil : aparèy konfyans, si ou chwazi l, HttpOnly, 30 jou pou pi plis.',
        '• noria_public : sesyon kont piblik yo, HttpOnly, 30 jou pou pi plis.',
        '• noria_pub_in : temwen san sekrè (valè a se « 1 »), pou montre « Kont mwen » sou paj ki nan kach, 30 jou pou pi plis, li ale ak sesyon an.',
        '• noria_admin : sesyon administrasyon platfòm nan, HttpOnly, 2 èdtan pou pi plis.',
        '• noria_ministere : sesyon espas ministè a, HttpOnly, 4 èdtan pou pi plis.',
        'Aplikasyon an kenbe kèk enfòmasyon nan navigatè ou tou : lang lan, dènye kòd lekòl ou te itilize a epi, si ou travay san entènèt, sa ou antre ki ap tann pou pati. Sou yon aparèy plizyè moun pataje, dekonekte. Lekòl yo responsab aparèy yo mete a dispozisyon.',
      ]],
      ['Faktirasyon ak TCA', [
        'Done faktirasyon yo sèvi pou fè, voye ak jere fakti yo, epi pou reponn ak obligasyon kontabl ak fiskal ki aplike. Wòl chak pati swiv kiyès ki fè fakti a.',
        'Fakti abònman NORIA Klirline voye bay lekòl yo : montan san taks, TCA 10 % pwodui a ajoute sou fakti nouvo yo, total ak tout taks ; peman MonCash, NatCash, transfè labank oswa kach, ak referans yo. Klirline responsab fakti sa yo. Yon fakti ki te fèt anvan règ sa a ka pa gen liy TCA.',
        'Frè lekòl yon lekòl fakti bay fanmi yo nan NORIA : se lekòl la ki responsab epi ki fè fakti a ; Klirline bay zouti a.',
        'Aksè a limite pou moun ki gen otorizasyon (pou lekòl la : direksyon, sekretarya ak kontabilite ; pou abònman NORIA : administrasyon Klirline). Fakti ak peman abònman an pa efase nan baz la : yo rete pou kontabilite. [à confirmer : konbyen tan egzak pou kenbe pyès fiskal ann Ayiti]',
      ]],
      ['Laureya ak kontni piblik sou minè', [
        'Non konplè ak foto yon elèv minè pibliye sou pòtay piblik la sèlman si lekòl la ak paran oswa responsab legal la bay otorizasyon ki nesesè yo. Prèv la kenbe (non paran an, dat, moun ki antre l). Non paran an pa piblik.',
        'Sinon, piblikasyon an pa gen non : inisyal chak mo nan non an, epi pa gen foto. Lè sa a, foto a pa sèvi.',
        `Ou ka mande pou retire l nenpòt lè bay lekòl la oswa nan ${CONTACT}.`,
      ]],
      ['Ak kiyès nou pataje done yo', [
        'Gen founisè teknik ki antre sèlman pou fè sèvis la mache, ak done ki nesesè pou travay yo sèlman :',
        '• Vultr : sèvè a ak baz done a (sant done Miami, Etazini).',
        '• Cloudflare : fè trafik la pase san danje (pwoteksyon, kach, rapò erè rezo).',
        '• Cloudflare R2 : estoke kopi sekou chifre yo ak bout son reyinyon yo pou yon ti tan (prefiks r/).',
        '• Resend : voye imèl (kòd, envitasyon, avi, fakti ak rapèl).',
        '• Meta (WhatsApp) : koneksyon pa WhatsApp, si ou chwazi opsyon sa a.',
        '• Telegram : voye kòd yo, si ou konekte Telegram.',
        '• Jitsi (meet.jit.si, oswa sèvè ki regle a) : sal moun ki pale yo epi, pou yon ti reyinyon san flux NORIA, lyen son paran yo. Demonstrasyon kou a (meet.systemli.org) pa dwe resevwa dosye elèv.',
        'WhatsApp, Telegram ak Jitsi se sèvis ou menm oswa lekòl la chwazi itilize ; pwòp politik yo aplike sou sa yo trete bò kote yo. Done yon lekòl parèt sèlman pou kont lekòl sa a, dapre wòl yo. Yo ka ale bay ministè a sèlman lè lekòl la voye yon deklarasyon oswa lè yon transfè elèv mande sa. Nòt sante, nòt fanmi ak kowòdone pa fè pati voye sa a bay ministè a. Nou pa vann ni lwe okenn done pèsonèl. Nou ka bay done si lalwa oblije nou.',
      ]],
      ['Ki kote done yo trete', [
        'Gen enfòmasyon yo trete andeyò peyi kote moun nan rete a, sitou Etazini : baz done a chita Miami. Klirline fè sèvis la mache depi Canada (Montréal). Cloudflare, ansanm ak R2 kote depo a chwazi otomatikman, ak lòt founisè yo, ka trete done nan lòt peyi. Rejyon egzak Resend, Meta ak Telegram pa fikse nan kòd NORIA a. [à confirmer : rejyon kontra Resend, Meta ak Telegram]',
        'Done sa yo ka tonbe anba lwa peyi sa yo. Klirline dokimante flux yo epi mete garanti kontra ak teknik lalwa ki aplike a mande. Nou pa di hosting lan se Canada oswa Ayiti sèlman.',
      ]],
      ['Konbyen tan nou kenbe yo', [
        'Done lekòl : toutan lekòl la ap sèvi ak NORIA. Lè kontra a fini, lekòl la gen 60 jou pou ekspòte. Apre sa, done yo efase nan sistèm k ap mache yo, dapre enstriksyon lekòl la, sof si lalwa mande pou kenbe yo. Sa ki ta rete nan yon kopi sekou disparèt dapre kalandriye kopi sekou yo (anviwon 12 mwa pou pi plis).',
        'Kòd koneksyon ak demann WhatsApp : yo bon pou 10 minit. Lyen Telegram k ap tann : 15 minit.',
        'Bout son reyinyon NORIA yo : anviwon 60 segonn apre yo soti nan lis la. Mezi sekirite anplis ki prevwa : efase apre 1 jou sou prefiks r/. Kach Cloudflare : 24 èdtan pou pi plis.',
        'Aparèy konfyans : 30 jou pou pi plis. Yo retire pi bonè lè ou dekonekte, lè ou retire yo, oswa lè modpas la refèt (sesyon kont lan fèmen lè sa a).',
        'Jounal sekirite : anviwon 35 jou.',
        'Kopi sekou chifre sou Cloudflare R2 : 30 chak jou, 4 chak semèn ak 12 chak mwa. Yon done ki efase disparèt nan kopi sekou yo pi ta apre anviwon 12 mwa. Yon kopi sekou retabli sèlman si gen yon gwo aksidan, nan yon baz vid.',
        'Kont piblik : jiskaske ou mande pou efase yo, touswit depi « Kont mwen ». Pa gen dire inaktivite ki efase yo otomatikman.',
        'Fakti ak pyès kontabl : pandan dire lalwa fiskal ki aplike a mande. Pwodui a anpeche efase yo nan baz la. [à confirmer : konbyen tan egzak pou kenbe pyès fiskal ann Ayiti]',
        'Foto badj : jiskaske lekòl la retire l sou demann, oswa toutan dosye elèv la kenbe.',
      ]],
      ['Kijan nou pwoteje yo', [
        'Koneksyon chifre (HTTPS). Modpas, kòd ak jeton kenbe sèlman an fòm anprent. Kopi sekou chifre.',
        'Chak lekòl separe nan baz done a (sekirite nivo liy), pou anpeche yon lekòl rive nan done yon lòt.',
        'Aksè limite dapre wòl, jounal aksyon sansib, limit sou eseye konekte ak siveyans konpòtman sispèk.',
        'Pa gen okenn pwoteksyon ki pafè. Si Klirline vin konnen yon ensidan sekirite ki ka touche done li trete pou yon lekòl, li enfòme etablisman an san reta ki pa nesesè. Pati yo kolabore pou evalye risk yo, limite konsekans yo epi fè notifikasyon lalwa ki aplike a mande, bay otorite ki konpetan yo ak moun yo konsène. Klirline kenbe yon rejis ensidan.',
      ]],
      ['Dwa ou', [
        'Ou ka mande pou wè done ou, pou korije yo oswa pou efase yo, epi retire yon konsantman ou te bay (abònman, WhatsApp, Telegram, piblikasyon piblik). Egzèsis dwa sa yo depann de lalwa ki aplike a ak obligasyon legal pou kenbe done.',
        'Done lekòl : pale ak lekòl ou anvan, li ka korije dosye a dirèkteman. Si ou ekri nou, n ap voye demann lan bay lekòl la.',
        `Lòt done : ${CONTACT}. Nou verifye idantite ou epi n ap reponn nan yon delè 30 jou.`,
        `Plent : ekri responsab pwoteksyon enfòmasyon pèsonèl yo (${CONTACT}). Nou akize resepsyon epi n ap reponn alekri. Ou ka ekri tou Komisyon aksè a enfòmasyon Québec la oswa Komisyonè pwoteksyon vi prive Canada a, dapre sitiyasyon ou. [à confirmer : otorite ayisyen ki konpetan, lè yo idantifye l, pou moun ki ann Ayiti]`,
        'Ou ka retire Telegram epi retire aparèy konfyans ou yo poukont ou nan « Koneksyon ak aparèy ».',
      ]],
      ['Chanjman', [
        'Nou mete politik sa a ajou lè NORIA chanje. Dat ki anlè paj la montre dènye vèsyon an. Si gen yon gwo chanjman, n ap enfòme lekòl yo omwen 30 jou alavans, ansanm ak itilizatè yo konsène, ak yon avi ki parèt. Istorik vèsyon yo kenbe.',
        'Kontak : Philippe Davenson Azor, responsab pwoteksyon enfòmasyon pèsonèl yo — contact@klirline.ca — Klirline Inc. (nimewo antrepriz 777880576RC0001), Montréal (Québec), Canada.',
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
