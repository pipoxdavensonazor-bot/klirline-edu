# Termes kreyòl à faire valider par un locuteur natif

Relecture des chaînes HT (octobre 2026) : orthographe standard de l'IPN (Institut pédagogique national), ton
respectueux, pas de calque du français. Les corrections ci-dessous sont **déjà appliquées** dans l'interface, mais
elles restent à confirmer par un locuteur natif, si possible un enseignant ou une enseignante.
Le test `server/test/kreyol.test.js` vérifie que chaque clé française a son équivalent HT, sans valeur vide.

## 1. Choix de vocabulaire à confirmer

| Clé / contexte | Français | Ancien HT | HT retenu | Question pour le relecteur |
|---|---|---|---|---|
| `dashboard` | Tableau de bord | Tablo bò | **Tablo jeneral** | « Tablo bò » était un calque. Faut-il plutôt « Akèy » ou « Paj prensipal » ? |
| `settings` | Paramètres | Paramèt | **Reglaj** | Le mot « reglaj » est-il compris des secrétariats ? |
| `enrol` | Effectifs | Efektif | **Kantite elèv** | Le terme « efektif » est-il courant dans les écoles ? |
| `dues` / `dueDate` | Échéances / Échéance | Echèyans | **Dat pou peye / Dat limit** | « Echèyans » se dit-il dans les bureaux de comptabilité ? |
| `method` | Mode de paiement | Mwayen | **Mòd peman** | Faut-il plutôt « Fason ou peye » ? |
| `transfer`, mode `virement` | Virement | Viman | **Transfè labank** | Peut-on dire « Vireman » ? |
| `cash`, mode `especes` | Espèces | Lajan kach | **Kach** (finances), **Lajan kach** (démo) | Faut-il une seule forme ? |
| barème | Barème | Baremn / barem | **Barèm** | Orthographe IPN de ce mot ? |
| `coef` | Coefficient | Koyefisyan | **Koefisyan** | Laquelle des deux graphies faut-il garder ? |
| `ret` (bibliothèque) | Retour | — | **Resevwa liv la** | Le bouton s'adresse au personnel. Faut-il plutôt « Retou » ? |
| `cur` (prêts) | En cours | — | **Ki poko remèt** | Est-ce assez court pour un filtre ? |
| `bal` | Solde | Sold | **Sa ki rete pou peye** (finances) ; « Sold » ailleurs | Les parents comprennent-ils « sold » ? Le solde peut aussi être négatif (trop-perçu). |
| `ref` | Référence de transaction | — | **Nimewo tranzaksyon an** | Est-ce le terme que les parents voient dans les SMS MonCash et NatCash ? |
| `seyans` | Séance | seans | **seyans** | Graphie IPN ? |
| `Klas vityèl` / `Klas vizyèl` | Classe virtuelle / Classe visuelle | (inchangé) | — | Ces deux noms de modules proches risquent-ils d'être confondus ? |
| `lowConn` | Mode faible connexion | Mòd ti koneksyon | **Mòd koneksyon fèb** | — |
| `dupWarn` | Doublons potentiels | Doublon posib | **Gendwa elèv sa a deja anrejistre** | — |
| `packs` | Paquets hors ligne | Pakè deyò-liy | **Pakè pou san entènèt** | « Deyò liy » se dit-il ? |
| `Note` (bouton) | Noter | Note | **Bay nòt** | — |
| `appSub` | Une école, une famille et un avenir | (texte français) | **Yon lekòl, yon fanmi ak yon avni** | Ce slogan doit-il rester en français, comme le logo ? |

## 2. Corrections d'orthographe ou de grammaire (à confirmer rapidement)

- `Piblye` devient **Pibliye** (faute de frappe).
- `annatant` devient **ap tann** (la forme « annatant » est un calque de « en attente »).
- Déterminant après une consonne finale : `kont lan` devient **kont la**, `prezans lan` **prezans la**, `seans lan` **seyans la**, `Anons lan` **Anons la**. Règle appliquée : « la » après une consonne finale prononcée, « lan » après une voyelle nasale. Merci de confirmer chaque cas.
- `jamè` devient **pa janm** ; `JANM modpas` devient **li PA JANM yon modpas**.
- `Brouillon` (mot français dans une chaîne HT) devient **Bouyon**.
- `&` dans les libellés devient **ak**.
- `Soumèt` devient **Voye** (même terme que dans le module des notes).

## 3. Termes laissés tels quels, à vérifier

- **Pwofesè** pour « enseignant » : on garde ce mot plutôt qu'« anseyan ».
- **Direksyon**, **Sekretarya**, **Kontablite**, **Bibliyotèk** : noms des rôles.
- **Bilten** (bulletin), **Resi** (reçu), **Egzanplè** (exemplaire), **Otè** (auteur), **Katalòg**.
- **Odit**, **Jounal odit**, **Atribisyon**, **Lisans** : termes techniques peu courants.
- **Senkwonize** et **senkwonizasyon** : faut-il dire plutôt « mete ajou » ?
- Les chaînes HT mêlées au code de `src/addons.js` (environ 140) ont été relues. Les longs textes d'aide sur Jitsi et sur les portails mériteraient une deuxième lecture.

## 4. Limites connues

- Le bouton « Se déconnecter » et le pied de page restent en français après le passage en HT : ils ne sont pas redessinés au changement de langue. Ce comportement existait déjà avant cette relecture.
- Les PDF (bulletins, reçus) sont bilingues FR / HT sur chaque ligne.
