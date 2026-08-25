# Ceintures de compétences — Français « Phrases »

Brief de mise en œuvre. Ce dossier contient le travail de conception déjà fait :
le référentiel, un exemple de banque d'exercices validé, la migration et un
validateur. Le code applicatif reste à écrire.

**Objectif** : en production pour la rentrée. Périmètre de ce lot : le domaine
**Phrases** uniquement (41 items, 9 ceintures). Mots, Textes et les 4 domaines
de maths viendront après, sur le même moteur.

---

## 1. Décision d'architecture — à respecter

**Une ceinture est un chapitre. Un item est un exercice de ce chapitre.**

Ne PAS construire de moteur parallèle. Tout le cycle
exercices → évaluation → remédiation existe déjà dans PlanBox et fonctionne.
Ce qui manque tient en trois choses : l'écran de choix de ceinture, l'étape
de diagnostic, et le lien item ↔ exercice.

Concrètement :

| Concept ceinture | Support existant |
|---|---|
| Ceinture (ex. Phrases · Bleu clair) | ligne de `chapitres`, `sous_matiere = 'ceinture-phrases'` |
| Item (ex. P17) | ligne de `exercice` du chapitre, avec `contenu.item_code = 'P17'` |
| Entraînement sur un item | `/eleve/chapitre/[id]/exercice/[exerciceId]` — **page existante, ne pas réécrire** |
| Résultat d'un item | `exercice_resultat` |
| Évaluation de ceinture | `/eleve/chapitre/[id]/evaluation` + `/api/progression/valider-eval` |
| Remédiation après échec | `/api/progression/remediation` |
| Progression | `pb_progression` |

**Le diagnostic n'est pas un nouveau mécanisme de validation.** Il écrit des
lignes `exercice_resultat` avec `valide = true` sur les items réussis. L'écran
chapitre existant les affiche alors comme validés et débloque la suite tout seul.
C'est ce qui rend le lot petit.

### Rayon d'action

Additif strict. Nouvelles tables, nouvelles routes, nouvelles pages.
Le seul fichier existant à modifier est le tableau de bord élève, pour ajouter
l'entrée « Ceintures ». Si tu te retrouves à modifier une route ou un composant
existant, arrête-toi et signale-le : c'est le signe qu'une hypothèse est fausse.

---

## 2. Contrats de l'existant — déjà relevés, ne pas refaire l'exploration

### Déblocage des exercices
`app/api/chapitres/progression/route.ts` — l'exercice d'index N est débloqué si
N = 0, ou si l'exercice N−1 est validé. Séquentiel.

Conséquence heureuse : après le diagnostic, les items acquis sont validés, donc
les items suivants se débloquent en cascade jusqu'au premier item non acquis.
L'élève reprend exactement là où il doit travailler. **Aucune modification de la
logique de déblocage n'est nécessaire.**

L'évaluation se débloque quand tous les exercices sont validés — voir
`app/eleve/chapitre/[id]/page.tsx`, variable `evalDebloquee`.

### Enregistrement d'un résultat
`POST /api/chapitres/exercices/resultat`
Corps : `{ exercice_id, eleve_id? | rb_eleve_id?, score, total }`
Le seuil de validation est lu sur `chapitres.seuil_exercice` (défaut 90 %),
`valide` est calculé côté serveur. Un élève PlanBox authentifié ne peut poster
que ses propres résultats (`getServerUser()`), les élèves Repetibox passent
par `rb_eleve_id` sans contrôle.

### Double source d'élèves
Partout : `eleve_id` (uuid, PlanBox) **ou** `rb_eleve_id` (int, Repetibox),
jamais les deux. Le hook `hooks/useEleveSession.ts` renvoie
`{ id, prenom, nom, source: "planbox" | "repetibox" }`. Le paramètre d'URL
est `eleve_id=` ou `rb_eleve_id=` selon `session.source`.

### Découverte des chapitres par l'élève
`GET /api/chapitres/mes-chapitres` passe par `eleve_groupe` → `chapitre_assignation`
(`actif = true`) et filtre sur `date_debut <= aujourd'hui`.

**Les chapitres-ceintures doivent être exclus de cette liste**, sinon les
9 ceintures apparaîtront comme 9 chapitres ordinaires sur le tableau de bord.
Le précédent à suivre est `rituel-orthographe` : `app/api/admin/chapitres/route.ts`
fait déjà `.or("sous_matiere.is.null,sous_matiere.neq.rituel-orthographe")`.
Faire la même chose pour `sous_matiere` commençant par `ceinture-`, dans
`mes-chapitres` **et** dans la liste enseignant.

### Auth serveur
`lib/server-auth.ts` : `getServerUser()`, `requireEnseignant()` (email
`APP_ENSEIGNANT_EMAIL` **ou** possession d'une classe),
`requireProprietaireOuEnseignant(eleveId, repetiboxId)` — c'est celle à utiliser
pour les routes du diagnostic.

### Base
Projet Supabase `dobaryyfqgcumwbskark`. Groupes existants : CE2
`9d2d7a69-bd28-4c2b-b4cd-0a9e71308b12`, CM1 `4eabc16b-7c15-4372-a046-2b893b149c49`,
CM2 `051dd2f4-c805-4827-9291-bb675998e51c`.
Niveaux : CE2 `11111111-0000-0000-0000-000000000001`, CM1 `…002`, CM2 `…003`.
`chapitres.niveau_id` est **nullable**, et `chapitres.niveaux_cibles` est un
tableau — une ceinture vise les trois niveaux à la fois, c'est tout son intérêt.

---

## 3. Pièges vérifiés — lire avant d'écrire du contenu

**1. `texte_a_trous` retrouve les mots sans les accents.**
`app/eleve/chapitre/[id]/exercice/[exerciceId]/page.tsx` (~ligne 300) ignore les
positions stockées et recherche chaque mot dans le texte en supprimant
ponctuation **et accents**, dans l'ordre, en sautant les positions déjà prises.
Donc un trou sur « à » peut se caler sur un « a » qui le précède. Même problème
pour et/est, ou/où, son/sont, on/ont, ce/se, et pour tout mot répété.

Règle : soit le mot masqué est unique dans le texte, soit **toutes** les
occurrences ambiguës sont masquées, dans l'ordre d'apparition.
`valider-banque.mjs` rejoue exactement cet algorithme — le lancer sur chaque
fichier de banque produit.

**2. `texte_a_trous` est en tout ou rien.**
`components/TexteATrousEleve.tsx` n'appelle `onTermine` que si toutes les
réponses sont bonnes. Score toujours `total/total`. Rester à 5 trous, pas plus.

**3. Ne jamais supprimer les accents dans le `normaliser()` des réponses.**
Déjà dans `CLAUDE.md`, piège nº 1. Vaut aussi pour tout code neuf.

**4. Le composant `TexteATrousEleve` génère des `<select>`** pour les paires
d'homophones connues (est/et, ou/où, sont/son, a/à, ce/se, on/ont) et pour
-er/-é. C'est voulu, et c'est exactement ce qu'il faut pour les items P47, P48, P49.

**5. Les questions sont mélangées** à chaque passage pour les types `exercice`,
`qcm` et `analyse_phrase`. Ne pas écrire de contenu où l'ordre compte.

---

## 4. Schéma à ajouter

Voir `migration.sql`. Cinq tables, aucune modification de l'existant.

- `ceinture_domaine` — PHRA, MOTS, TEXT, NOMB, CALC, GRME, ESGE
- `ceinture_item` — le référentiel (41 lignes pour PHRA)
- `ceinture_chapitre` — (domaine, ceinture_idx) → `chapitre_id`
- `ceinture_diagnostic` — une passation : questions posées, réponses, items acquis
- `ceinture_banque` — banque d'exercices par item, avec `valide_par_enseignant`

Le lien item ↔ exercice passe par `exercice.contenu->>'item_code'`, sans
changement de schéma sur `exercice`.

---

## 5. Parcours élève

1. `/eleve/ceintures` — les domaines ouverts, la couleur actuelle de l'élève sur
   chacun. Pour l'instant : Phrases seul.
2. `/eleve/ceintures/phrases` — l'échelle des 9 couleurs. Validées, en cours,
   à venir. On ne peut entrer que dans la ceinture courante.
3. Entrée dans une ceinture :
   - pas encore de diagnostic → `/eleve/ceintures/phrases/[idx]/diagnostic`
   - diagnostic fait → redirection vers `/eleve/chapitre/[chapitreId]`, **la page
     existante**, qui gère entraînement puis évaluation.
4. Diagnostic : 2 QCM par item de la ceinture (8 à 10 questions), une seule page,
   sans correction affichée pendant la passation. À la validation :
   - écrire la ligne `ceinture_diagnostic`
   - pour chaque item à 2/2 : insérer `exercice_resultat` avec `valide = true`,
     `score = total`, sur l'exercice correspondant du chapitre
   - rediriger vers la page chapitre
5. Évaluation, seuil 90 %, puis ceinture suivante. Mécanique existante.

Le diagnostic est repassable seulement si l'enseignant le réinitialise.
Prévoir un bouton côté enseignant, pas côté élève.

---

## 6. Ce qui est fourni dans ce dossier

| Fichier | Contenu |
|---|---|
| `referentiel-phrases.json` | Les 41 items : code, ceinture, libellé, niveau visé, type d'exercice, rattachement aux semaines de la P1 |
| `banque/ceinture-1-vert-fonce.json` | Banque complète de la ceinture vert foncé (P13, P14, P15, P20) — **format de référence**, déjà validé par `valider-banque.mjs` |
| `migration.sql` | Les 5 tables + le seed du référentiel Phrases |
| `valider-banque.mjs` | Rejoue l'algorithme de recherche des trous et contrôle les QCM et les classements |

Le classeur complet des 7 domaines (236 items) et la fiche imprimable élève
sont dans le Drive, sous *Français / Ceintures de compétences*.

### Format de la banque

```jsonc
{
  "item_code": "P14",
  "type": "texte_a_trous",
  "diagnostic": [            // exactement 2, TOUJOURS en QCM quel que soit le type
    { "question": "...", "options": ["a","b","c","d"],
      "reponse_correcte": 2, "explication": "..." }
  ],
  "entrainement": { /* contenu selon le type, voir ci-dessous */ }
}
```

Contenus par type, tels que les attend le code existant :

- `exercice` → `{ titre, consigne, questions:[{id, enonce, reponse_attendue, indice}] }`
  Réponse comparée après `normaliser()` : viser un seul mot, sans ambiguïté.
- `qcm` → `{ titre, consigne, questions:[{question, options[4], reponse_correcte, explication}] }`
- `texte_a_trous` → `{ titre, consigne, texte_complet, trous:[{position, mot, indice}] }`
  `position` est ignoré et recalculé — mais garder les trous **dans l'ordre du texte**.
- `classement` → `{ titre, consigne, categories:[…], items:[{texte, categorie}] }`
  `categorie` doit être une chaîne exacte de `categories`.
- `analyse_phrase` → `{ titre, consigne, phrases:[{texte, groupes:[{mots, fonction, debut, fin}]}] }`
  Fonctions autorisées : voir `FONCTIONS_COULEURS` dans `types/index.ts`.

---

## 7. Plan de travail proposé

1. **Migration** — jouer `migration.sql` sur Supabase. Additif, idempotent.
2. **Chapitres-ceintures** — script `scripts/seed-ceintures-phrases.ts` : créer
   les 9 chapitres (`sous_matiere = 'ceinture-phrases'`, `seuil_evaluation = 90`,
   `seuil_exercice = 90`, `niveaux_cibles = {CE2,CM1,CM2}`), remplir
   `ceinture_chapitre`, et les assigner aux trois groupes via `chapitre_assignation`.
3. **Exclusion des listes** — filtrer `sous_matiere LIKE 'ceinture-%'` dans
   `mes-chapitres` et dans la liste des chapitres enseignant.
4. **Banque** — reprendre le format de `ceinture-1-vert-fonce.json` et écrire
   les ceintures 0, 2 et 3 (vert clair, bleu clair, bleu foncé), soit 14 items.
   Passer `valider-banque.mjs` sur chaque fichier. Puis un script d'import qui
   remplit `ceinture_banque` et crée les lignes `exercice` correspondantes.
5. **Routes API** (`app/api/ceintures/…`) : état de progression d'un élève,
   récupération du diagnostic, enregistrement du diagnostic, réinitialisation
   côté enseignant.
6. **Écrans élève** : hub, échelle des couleurs, page de diagnostic.
   Reprendre les couleurs de `referentiel-phrases.json`.
   Réutiliser le style des composants existants — ne pas introduire de bibliothèque.
7. **Entrée dans le tableau de bord élève** — le seul fichier existant modifié.
8. **Vérification** : `npm run build`, puis parcours manuel complet avec un compte
   élève de test, puis `npm run joseph -- --parcours` sur un chapitre-ceinture.

Ne pas pousser sur `main` avant que le parcours ait été fait de bout en bout à la
main. Travailler sur la branche `ceintures-phrases` et vérifier sur la
prévisualisation Vercel.

---

## 8. Décisions déjà arrêtées — ne pas les rouvrir sans en parler

- 9 couleurs, vert clair → noir. PIDAPI en a 10 pour « Phrases » ; ramené à 9
  pour que les 7 domaines partagent la même échelle.
- Diagnostic : 2 questions par item, en QCM. Item acquis = 2/2.
- Validation de la ceinture : 90 %, comme les chapitres existants.
- Banque servie en priorité ; l'IA ne complète que si la banque est vide pour
  cet item, et l'exercice produit retourne dans la banque avec
  `valide_par_enseignant = false`.
- Les items P47 à P55 sont des ajouts au référentiel PIDAPI (homophones, verbes
  en -IR, imparfait, futur, passé simple, terminaison -ent). Ils sont assumés :
  PIDAPI ne couvrait aucun homophone, alors que c'est l'axe de « Ma P'tite Règle »
  et des semaines 2, 3, 4 et 7.

## 9. Reste à décider avec Sylvain

- Les 23 items des ceintures marron à noire : banque écrite à la main ou
  génération IA relue au fil de l'année ? Sans urgence — personne ne sera
  ceinture violette avant le printemps.
- Que voit l'enseignant ? Un tableau classe couleurs × élèves serait le pendant
  naturel de la « grille individuelle » PIDAPI, mais rien n'est spécifié.
- Réinitialisation du diagnostic : à quel niveau (élève, ceinture, domaine) ?
