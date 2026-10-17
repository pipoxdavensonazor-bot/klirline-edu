# Portail du ministère de l'Éducation (bloc 6, PROTOTYPE)

> Prototype sur données fictives. Désactivé par défaut. Rien ne doit être utilisé avec des données réelles avant une
> validation juridique et institutionnelle (MENFP), un audit de sécurité et une authentification renforcée.

## 1. Activation

| Variable | Défaut | Effet |
|---|---|---|
| `NORIA_MINISTERE` | `0` | `1` active le portail. À `0` : `/ministere`, `/src/ministere*.js|css`, `/src/declaration.js`, `/src/admin-ministere.js`, `/api/ministere/*`, `/api/declarations*` et `/api/admin/ministere/*` répondent 404 ; `/api/config` ne mentionne rien ; le module « Déclaration au ministère » et l'onglet super-admin sont invisibles. |
| `NORIA_TRANSFERT_MINISTERE` | `0` | inchangé (bloc 4) : exige l'étape ministère des transferts. Avec `NORIA_MINISTERE=1`, cette étape se fait depuis le portail, signée par la clé du ministère. |
| `NORIA_CLE_MAITRE` | — | chiffre la clé privée Ed25519 du ministère (comme celles des écoles). Obligatoire en production. |
| `NORIA_OTP_SECRET` | — | sel des codes à 6 chiffres (comme les autres codes). |
| `NORIA_ASSISTANT_SEUILS` | — | JSON optionnel ; seuils `ministere*` de la règle `ministere_consultations`. |
| `NORIA_DEMO=1` + `NORIA_MINISTERE=1` | — | base vide : 5 écoles fictives de plus (départements variés), 3 déclarations signées, compte `inspection@ministere.exemple.invalid` / `+50900000900`. |

## 2. Comptes et connexion

- Création par le super-admin uniquement (onglet « Ministère », `GET|POST /api/admin/ministere/comptes`, motif
  obligatoire, `…/:id/desactiver|reactiver`, `GET /api/admin/ministere/journal`), tracée dans `platform_audit`.
- Connexion : identifiant (e-mail ou téléphone) → code à 6 chiffres (SMS si téléphone, sinon e-mail ; 10 min, 5 essais,
  1 code par minute, 5 par heure ; réponse identique que le compte existe ou non) → session `noria_ministere`
  (cookie HttpOnly SameSite=Strict, `Path=/api/ministere`, 4 h, ou jeton Bearer). Écritures : en-tête `x-noria`
  exigé avec le cookie. Sessions séparées des écoles et du super-admin.

## 3. Cloisonnement PostgreSQL

- Rôle `noria_ministere` (NOLOGIN, sans BYPASSRLS). Les routes du ministère tournent dans `db.asMinistry()` :
  `SET LOCAL ROLE noria_ministere` + `app.ministere_id`. Sans compte réglé, les politiques ne laissent rien voir.
- Droits par colonnes en lecture : `school` (sans logo ni signature), `school_year`, `level`, `class`, `enrollment`,
  `student` (identité, sexe, date de naissance, statut — jamais santé, famille, contacts), `year_decision`,
  `app_user` (id, école, état), `user_role`, `portal_item` (lauréats seulement). Aucun droit sur notes, présences,
  finances, sessions, clés, transferts, liens parents. Écritures : seulement le statut des déclarations « envoyee »
  (accusé ou correction), les événements « ministère » et les traces `ministere.%` du journal des écoles.
- `noria_app` (écoles) n'a aucun droit sur `ministry_*` ; une école ne voit que ses déclarations et ne peut que
  remplacer une version en « correction_demandee ». Déclarations : contenu signé figé, aucune suppression ;
  journaux en ajout seul (déclencheurs SQLite et PostgreSQL).

## 4. Consultation

- Vue d'ensemble agrégée (`GET /api/ministere/ecoles` : filtres année, département, commune, recherche, statut de
  déclaration) et fiche école (`GET /api/ministere/ecoles/:id`) : effectifs, filles / garçons, classes, réussite,
  personnel par fonction, lauréats publiés. Aucun nom d'élève.
- Détail nominatif seulement sur action explicite avec motif (≥ 5 caractères) : liste d'une classe
  (`POST …/ecoles/:id/classes/:cid/eleves`) ou fiche élève (`POST …/eleves/:id`). Chaque consultation est écrite dans
  `ministry_audit` ET dans le journal de l'école (`audit_log`, action `ministere.consultation`, motif), et alimente
  l'assistant sécurité.
- Toute consultation (même agrégée) est inscrite dans `ministry_audit` ; « Mon journal » la montre au compte.

## 5. Déclaration annuelle

- Côté direction (module « Déclaration au ministère », secrétariat en lecture) : aperçu (effectifs par classe,
  résultats de fin d'année, personnel, lauréats ; mineurs sans double accord en initiales), case de certification,
  bouton « Envoyer la déclaration au ministère ». Le dossier (JSON) et son PDF à l'en-tête de l'école sont figés et
  signés par la clé Ed25519 de l'école : `NORIA-DECLARATION|v1|école|année|version|sha256(dossier)|sha256(pdf)`.
- Côté ministère : liste, détail avec vérification de signature, PDF signé, « Accuser réception » ou « Demander une
  correction » (précision obligatoire, notification à la direction). Après une correction, l'école envoie une nouvelle
  version ; la précédente passe « remplacee ». Historique complet par année (`declaration_event`).

## 6. Transferts et vérification

- Étape ministère des transferts (si `NORIA_TRANSFERT_MINISTERE=1`) : voir `docs/transferts.md`.
- « Vérifier un document » : code ou lien du QR (photo décodée sur l'appareil), pour badges, relevés, bulletins,
  reçus et certificats de transfert ; limite 30 vérifications / 15 min par compte.

## 7. Limites connues (prototype)

- Connexion par code seul (pas de mot de passe ni de second facteur matériel) : acceptable pour un prototype, pas
  pour la production.
- Petits effectifs : les agrégats d'une petite classe peuvent permettre de déduire des informations individuelles.
- Sauvegardes : `backup.js` ne liste pas encore les tables des blocs 4 à 6 (déjà le cas avant ce bloc).
