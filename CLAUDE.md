# Plan Box

Application de gestion de classe pour enseignants (CE2-CM2) avec exercices IA, dictées, plans de travail et suivi de progression.

## Stack technique
- Next.js 16 + React 19 + TypeScript
- Supabase (auth + base de données + RLS)
- Tailwind CSS v4
- Anthropic SDK : `claude-sonnet-4-6` (défaut), `claude-opus-4-20250514` (exercices complexes)
- OpenAI (TTS pour les dictées)

## Lancer le projet
```bash
cd /Users/sylvainrenaut/plan-box
npm run dev
```

## Architecture

### Structure des dossiers
```
app/
  api/                  # ~60 API routes
  enseignant/(app)/     # Pages enseignant (dashboard, chapitres, dictées, etc.)
  eleve/                # Pages élève (exercices, évaluation, révision)
  auth/                 # Authentification
components/             # Composants React réutilisables
lib/                    # Utilitaires (supabase, auth, validation, calcul, etc.)
scripts/                # Scripts CLI (joseph.ts)
```

### Patterns importants
- **Client Supabase navigateur** : `createClient()` depuis `lib/supabase.ts` (singleton)
- **Client Supabase admin** : `createAdminClient()` depuis `lib/supabase-admin.ts` (service_role, bypass RLS, API routes uniquement)
- **Auth serveur** : `getServerUser()` et `requireEnseignant()` depuis `lib/server-auth.ts`
- **requireEnseignant()** vérifie par email (`APP_ENSEIGNANT_EMAIL`) OU par possession d'une classe dans la table `classe`
- **Contenu exercices** : stocké en JSON dans `exercice.contenu` et `plan_travail.contenu`

### Double source élèves
Le système gère deux sources d'élèves :
- **PlanBox** : UUID Supabase Auth, préfixe `pb_UUID`
- **Repetibox** : ID entier importé, préfixe `rb_N`
Les deux coexistent dans les progressions, assignations et résultats.

## Base de données (Supabase)

### Projet
- ID : `dobaryyfqgcumwbskark`
- Région : `eu-west-3`

### Tables principales
| Table | Description |
|-------|-------------|
| `chapitres` | Chapitres (matière, sous_matiere, niveau_id, ordre) |
| `exercice` | Exercices liés à un chapitre (type, contenu JSON, ordre) |
| `exercice_resultat` | Résultats élèves (score, total, valide) |
| `eleves` | Élèves PlanBox (prenom, nom, niveau_id) |
| `eleve` | Élèves Repetibox (prenom, nom) |
| `groupes` | Groupes de classe |
| `eleve_groupe` | Liaison élève-groupe (planbox_eleve_id OU repetibox_eleve_id) |
| `chapitre_assignation` | Assignation chapitre → groupe (actif) |
| `plan_travail` | Blocs de travail assignés (type, statut, contenu JSON, `termine_le`, `duree_secondes`) |
| `pb_progression` | Progression par élève et chapitre (pourcentage, statut) |
| `niveaux` | CE2, CM1, CM2 |
| `classe` | Classes enseignant (user_id) |
| `dictees` | Dictées générées (titre, thème, niveaux 1-4 étoiles) |
| `notifications` | Notifications (`eleve_id` PlanBox **ou** `rb_eleve_id` Repetibox) |
| `evaluation_resultat` | Résultats d'évaluation |
| `banque_exercices` | Banque d'exercices réutilisables |
| `user_preferences` | Préférences UI (nav_order) |
| `ceinture_choix_semaine` | Domaines de ceintures choisis par l'élève pour la semaine |
| `exercice_reprise` | L'exercice en cours d'un élève, pour qu'il le reprenne |

### Relations FK critiques
Avant de supprimer un chapitre, nettoyer dans cet ordre :
1. `exercice_resultat` (via exercice_id)
2. `exercice`, `chapitre_assignation`, `pb_progression`, `evaluation_resultat`, `plan_travail`, `notifications`, `banque_exercices` (via chapitre_id)
3. Puis `chapitres`

### Marqueur rituel orthographe
`sous_matiere = "rituel-orthographe"` identifie les chapitres Ma P'tite Règle. Ils sont filtrés de la page Chapitres mais apparaissent dans la progression.

## Types d'exercices

| Type | Contenu JSON | Description |
|------|-------------|-------------|
| `revision` | `points_cles[]`, `contenu_html`, `exemples[]` | Leçon/fiche de révision |
| `exercice` | `questions[{enonce, reponse_attendue, indice}]` | Questions ouvertes à trous |
| `texte_a_trous` | `texte_complet`, `trous[{mot, position, indice}]` | Texte avec mots manquants |
| `qcm` | `questions[{question, options[], reponse_correcte, explication}]` | QCM |
| `ecriture_contrainte` | `consigne`, `contraintes[]`, `nb_phrases` | Écriture libre avec contraintes |
| `calcul_mental` | `questions[{expression, reponse}]` | Calcul mental |
| `analyse_phrase` | `phrases[{phrase, analyse}]` | Analyse grammaticale |
| `classement` | `categories[]`, `items[{texte, categorie}]` | Trier des éléments par catégorie |
| `comparaison` | `paires[{gauche, droite, signe}]`, `avec_egalite` | Placer < ou > entre deux nombres |
| `rangement` | `critere`, `series[{elements[]}]` | Ranger des étiquettes de gauche à droite |

### Fractions représentées par des aires

Un disque ou un rectangle partagé en parts égales, certaines coloriées ; l'élève
donne la fraction. **Ce n'est pas un type d'exercice** : c'est une clé
facultative `figure` sur une question de `qcm` (ou d'`exercice`), comme le cadran
ou la droite graduée — voir `docs/ceintures/SPEC-FIGURES.md`.

- Les questions sont **calculées**, pas écrites par l'IA (`lib/fractions-aires.ts`,
  route `app/api/generer-fractions-aires`).
- **Tuile « Fractions »** dans la grille de `/enseignant/generer`, à côté de
  « QCM ». Les deux tuiles engendrent un bloc `qcm` et ouvrent le même
  formulaire, sur un sous-mode différent (`source`). ⚠️ Le sous-mode n'a
  d'abord existé que dans le formulaire, et il était **introuvable** : on
  cherche un exercice dans la grille des types, pas dans un champ du
  formulaire.
- Les trois mauvaises réponses sont des erreurs d'élève identifiées : fraction
  inversée, parts blanches comptées, coloriées rapportées aux blanches.
- ⚠️ **Aucune option ne vaut la bonne réponse** : un dessin qui montre `2/4` ne
  propose jamais `1/2`, qui serait juste. Toute fraction égale en valeur est
  écartée.
- **Les deux sens sont disponibles** : un dessin → écrire la fraction, ou une
  fraction → choisir le dessin (`options_figures`, un dessin par option). Dans
  le second, ⚠️ **deux dessins se distinguent d'au moins un dixième de l'aire** :
  `10/12` et `11/12` côte à côte sont le même disque presque plein.
- Contrat vérifié par `npx tsx docs/tests/test-fractions-aires.mjs` (47 cas) —
  à relancer après toute modification du module. Rendu à l'œil sur
  `/enseignant/admin/figures`.

### Vérification des types numériques
`comparaison` et `rangement` ne font **jamais** confiance à l'IA sur le résultat :
- Le signe et l'ordre sont recalculés côté serveur (`lib/comparaison-nombres.ts`, `lib/rangement.ts`).
- `evaluerNombre()` lit les écritures françaises — espaces de milliers, virgule décimale,
  fractions, × ÷ — **et** les nombres en toutes lettres (« un-million-deux-cent-mille »).
- Une paire ou une série non vérifiable est **écartée**, jamais servie fausse.
- Interdits et filtrés : nombres relatifs (hors programme cycle 3) et formes belges/suisses
  (septante, huitante, octante, nonante).
- Le générateur demande 2 items de marge et coupe au nombre saisi après filtrage.

## Génération IA — règles communes

`lib/prompts-communs.ts` est injecté en `system` dans les 14 routes de génération :
- **`REGLE_NOMBRES_EN_LETTRES`** : un nombre écrit en toutes lettres prend un trait d'union
  entre TOUS ses éléments (`trois-cent-vingt-deux`). La règle n'impose pas d'écrire en
  lettres — les chiffres restent libres. Français de France uniquement.
  ⚠️ **Le prompt ne fait pas foi** : le modèle l'appliquait un jour sur deux. Le contenu
  généré repasse par `normaliserNombresEnLettres()` (`lib/nombres-en-lettres.ts`) aux 17
  points de parsing des 16 routes, et **`lib/valider-reponses-exercice.ts` est le piège
  principal** — ce second passage « corrige l'orthographe » des réponses et défaisait les
  traits d'union que la génération venait de poser ; il connaît la règle depuis.
  **Portée volontairement étroite** : seuls les champs ENTIÈREMENT occupés par un nombre
  sont corrigés — la réponse d'un « écris 345 en lettres », l'énoncé d'une dictée de
  nombres. Une phrase qui parle de millions au passage n'est pas touchée, et les chapitres
  de romans importés dans `exercice.contenu` non plus. Deux garde-fous :
  `traitsUnionSiNombre()` pour la portée, et un aller-retour par `nombreEnLettres()` —
  sans lui, « un zéro » devenait « un-zéro » et « tous les trois une chanson »
  devenait « trois-une ». Contrat vérifié par
  `npx tsx docs/tests/test-traits-union-nombres.mjs` (55 cas) — à relancer après toute
  modification du module. `scripts/reparer-traits-union.ts` (`--dry-run`, `--exemples`)
  applique la même règle au contenu déjà en base ; passé le 09/09/2026 sur les fiches
  « Écrire les nombres en lettres ».
- **`extraireJSON()`** : isole le premier objet JSON d'une réponse en suivant l'imbrication
  des accolades. Les modèles ajoutent souvent une phrase après l'objet, ce qui fait échouer
  un `JSON.parse` sur la réponse brute.

## Tableau de bord élève

Les blocs de `plan_travail` sont répartis en **trois paniers** par `repartirBlocs()`
(`app/eleve/dashboard/page.tsx`), partagé par les trois points de chargement (PlanBox,
Repetibox, rafraîchissement 30 s) :

| Panier | Contenu |
|--------|---------|
| **En retard** | jour passé et `statut != 'fait'` → bandeau rouge, masqué s'il est vide |
| **Aujourd'hui** | date du jour, ou `periodicite = 'semaine'`, ou ressource reportée |
| **Reste de la semaine** | à venir, dans la semaine en cours |

- La fenêtre de chargement remonte **7 jours avant le lundi** : le travail non fait la
  semaine précédente ne disparaît pas au changement de semaine.
- Dictées et mots sont exclus du rattrapage (activités de classe, `filtrerDicteesMotsJourStrict`).
- **Problème du jour** : la carte est barrée dès que le problème est *terminé*, pas seulement
  réussi — trois essais épuisés, la correction montrée, il n'y a plus rien à faire
  (`lib/probleme-du-jour.ts`, `problemeTermine()`). La couleur du pied de carte distingue
  « ✓ Résolu » de « ✓ Fait ». Le serveur fait foi (`serverAttempt.termine`) ; le
  `localStorage` de la page du problème ne sert qu'en secours, et seulement s'il porte sur
  le même `problemId`.

## Avatar élève

Le customiseur vit **dans Plan Box** depuis la rentrée (`/eleve/avatar`), plus par SSO vers
Repetibox : envoyer un CE2 dans l'autre application au milieu de son onboarding était fragile.
L'avatar reste stocké dans `eleve.avatar_bigheads` (table Repetibox, base partagée) et suit
donc l'élève dans les deux applications ; Repetibox garde son propre écran.

⚠️ L'onboarding avatar **redirige hors du tableau de bord**. Toute autre fenêtre modale doit
attendre l'état `avatarPret` du dashboard, sinon elle s'affiche une fraction de seconde avant
la redirection.

## Ma P'tite Règle — Catégories

| Catégorie | Exemples | Modèle IA |
|-----------|----------|-----------|
| `homophone` | est/et, ou/où, sont/son, a/à | Sonnet |
| `morphologie` | -er/-é, pluriels -ou/-ail, accords | Opus |
| `syntaxe` | négation ne…pas, interrogation | Opus |

La détection de catégorie est automatique via `detecterCategorie()` dans l'API.

## Dictées

### Workflow
1. Génération IA : 4 niveaux de difficulté (⭐ CE2 → ⭐⭐⭐⭐ CM2+)
2. Audio TTS via OpenAI (phrase par phrase)
3. Élève écoute et écrit (manuscrit ou clavier)
4. Correction via Claude Vision (analyse image manuscrite)

### Structure
```typescript
DicteeContenu {
  niveau_etoiles: 1|2|3|4
  titre, texte, phrases[], mots[],
  audio_complet_url, audio_phrases_urls
}
```

## Variables d'environnement
```
NEXT_PUBLIC_SUPABASE_URL       # URL Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY  # Clé anonyme Supabase
SUPABASE_SECRET_KEY            # Clé service_role (serveur)
APP_ENSEIGNANT_EMAIL           # Email enseignant
PB_ANTHROPIC_KEY               # Clé API Anthropic
OPENAI_API_KEY                 # Clé OpenAI (TTS)
CRON_SECRET                    # Secret pour les crons
NEXT_PUBLIC_APP_URL            # URL de l'app
NEXT_PUBLIC_REPETIBOX_URL      # URL Repetibox
NOTION_TOKEN                   # Intégration Notion (programmation)
NOTION_DB_SEANCES              # Base « Programmation année en cours »
```

## Déploiement
- **Vercel** : auto-deploy sur push `main`
- **URL prod** : https://plan-box-phi.vercel.app

## Ceintures de compétences

Référentiel PIDAPI adapté, étendu à 7 domaines × 9 couleurs (vert clair → noir).
Conception et décisions dans `docs/ceintures/BRIEF.md`.

**Règle d'architecture** : une ceinture est une ligne de `chapitres`
(`sous_matiere = 'ceinture-<domaine>'`), un item est une ligne de
`exercice` portant `contenu.item_code`. Tout le cycle entraînement → évaluation
réutilise le moteur existant — ne pas en construire un second.

| Table | Rôle |
|-------|------|
| `ceinture_domaine` | 7 domaines : MOTS, PHRA, TEXT (français) · NOMB, CALC, GRME, GEOM (maths) |
| `ceinture_item` | le référentiel : code, ceinture, libellé, type d'exercice |
| `ceinture_chapitre` | (domaine, ceinture_idx) → `chapitre_id` |
| `ceinture_diagnostic` | une passation : questions, réponses, items acquis |
| `ceinture_banque` | 2 questions de diagnostic + 2 variantes par item |
| `ceinture_variante` | la variante de remédiation servie à UN élève |

- Modules : `lib/ceintures-competences.ts` (couleurs, domaines, helpers) et
  `lib/ceintures-serveur.ts` (état, remédiation). ⚠️ `lib/ceintures.ts` est
  **autre chose** : les ceintures de multiplications de Repetibox.
- Scripts : `scripts/seed-ceintures.ts` (chapitres) puis
  `scripts/import-banque-ceintures.ts` (banque + exercices). Les deux prennent
  `--domaine=PHRA|MOTS|TEXT|all` et `--dry-run`, et sont idempotents.
- La progression **ne s'écrit pas** : elle se dérive de `evaluation_resultat`
  (`reussi = true` ⇒ ceinture acquise).
- Le diagnostic ne valide que les items `validation = 'auto'`.
- Pas d'`upsert` sur `ceinture_diagnostic` ni `ceinture_variante` : leurs index
  d'unicité sont partiels, `onConflict` ne sait pas les viser.
- Non-régression obligatoire après toute modification de
  `app/eleve/chapitre/[id]/evaluation/page.tsx` :
  `node docs/ceintures/test-piocher.mjs` doit sortir « 0 exercice affecté ».

### Affichage côté élève

7 domaines (`sous_matiere = "ceinture-<domaine>"`, 9 couleurs chacun). Ils sont **filtrés**
de la page Chapitres, de `mes-chapitres` et de la section « Chapitres & règles » du planning :
ils ont leur propre parcours sur `/eleve/ceintures`.

**Choix hebdomadaire** : l'élève choisit 2 domaines à sa première connexion de la semaine
(quel que soit le jour — mardi la semaine de la rentrée). Seuls ces deux-là s'affichent sur
son tableau de bord.
- Table `ceinture_choix_semaine`, une ligne par élève et par lundi.
- Choix initial + **UNE** modification : `nb_modifications` (contrainte `between 0 and 1`),
  refus `409` côté API, bouton masqué côté élève.
- API : `app/api/ceintures/choix-semaine/route.ts` · Fenêtre : `components/CeinturesSemaineModal.tsx`

## Motus du jour

Un mot à deviner par jour, **commun à toute la classe**, servi tous les jours — week-ends
et vacances compris : aucun contrôle de calendrier scolaire.

| Table | Rôle |
|-------|------|
| `motus_mot` | la liste de mots de l'enseignant (`mot`, `mot_normalise` unique, `actif`) |
| `motus_jour` | le mot tiré pour une date (PK = `date`), avec **copie du texte** |
| `motus_partie` | la partie d'un élève ce jour-là (`essais` jsonb, `trouve`, `termine`) |
| `motus_lexique` | les ~182 000 mots **acceptés comme proposition** (≠ mots à deviner) |
| `motus_semaine` | le thème de la semaine (`lundi`, `theme`, `impose`) |

- Logique partagée : `lib/motus.ts` (`assurerMotDuJour()`, `evaluerEssai()`, `etatPartie()`).
- **Le mot secret ne quitte jamais le serveur** tant que la partie n'est pas finie : le
  navigateur envoie une proposition, l'API renvoie les couleurs. Pas de triche par la console.
- Tirage : parmi les mots actifs, les jamais sortis d'abord, puis les moins récemment sortis ;
  le hachage de la date départage. Une liste de N mots ne se répète pas avant N jours.
- `motus_jour` garde une copie du mot : supprimer un mot de la liste ne casse pas les
  journées déjà jouées.
- Pas d'`upsert` sur `motus_partie` : ses index d'unicité sont partiels (`eleve_id` /
  `rb_eleve_id`), `onConflict` ne sait pas les viser.
- Date calculée à Paris (`dateDuJour()`), pas en UTC : sinon le mot changerait à 2 h du matin.
- **Une proposition qui n'est pas un mot est refusée et ne coûte pas d'essai** (`motExiste()`).
  Le lexique vient du paquet npm `an-array-of-french-words` (dépendance de dev, MIT),
  normalisé et chargé en base par `scripts/seed-lexique-motus.ts` (idempotent) — la prod ne
  lit que la table. Formes fléchies comprises : « chevaux », « mangeaient » passent.
  Le mot du jour échappe au dictionnaire : l'enseignant peut faire deviner un mot absent
  de la liste sans le rendre invalidable. Dictionnaire injoignable ⇒ on accepte, un refus
  injuste étant plus pénalisant qu'une proposition farfelue.
### Thèmes

Chaque semaine a un thème, **affiché sous la grille** : c'est l'indice. Le mot du jour est
tiré dans ce thème, ce qui rend l'indice honnête.

- **Un mot doit évoquer son thème sans explication** : c'est le premier critère de
  `scripts/mots-motus-cycle3.ts`, avant le niveau de vocabulaire. La musique et les
  vêtements ont leur propre thème pour cette raison — « trompette » sous l'indice
  « L'école » égarait les élèves. Un mot n'est mis dans plusieurs thèmes que s'il est
  évident dans chacun.
- ⚠️ **PostgREST plafonne toute lecture à 1000 lignes** et la liste dépasse ce seuil :
  filtrer le thème en mémoire après un `select` global peut ne jamais voir un thème
  entier et servir un mot hors sujet. Le tirage filtre donc `.eq("theme", …)` dans la
  requête, la liste enseignant pagine par `range()`, et le compte par thème passe par
  la vue `motus_theme_compte`.
- `lib/motus-themes.ts` : les 25 thèmes, les fenêtres de calendrier et le calcul de Pâques
  (mobile — d'où l'algorithme de Meeus). Aucun accès base : le module est aussi importé
  par les composants.
- Priorité : choix de l'enseignant (`impose`) > calendrier (Noël, Halloween, carnaval,
  Pâques, printemps, été, rentrée) > rotation (thèmes jamais sortis d'abord).
- Les fenêtres de saison sont **courtes exprès** (2 à 4 semaines) : une fenêtre longue
  épuise son thème — 5 semaines de Noël demanderaient 35 mots de Noël — et mange les
  semaines des thèmes ordinaires.
- ~1 000 entrées pour 890 mots distincts (un mot peut servir dans plusieurs thèmes, d'où
  l'unicité sur `(mot_normalise, theme)`). Source : `scripts/mots-motus-cycle3.ts`,
  import par `scripts/seed-mots-motus.ts` (idempotent, `--dry-run`), qui **valide chaque
  mot contre `motus_lexique`** : une faute de frappe est refusée à l'import.
- Le dernier passage d'un mot se repère par son texte, pas par son id : le même mot
  présent dans deux thèmes ne doit pas ressortir aussitôt.
- Changer le thème de la semaine côté enseignant retire un nouveau mot du jour et
  **efface les parties du jour** (les couleurs déjà affichées seraient fausses sinon).

- Élève : carte d'aperçu à droite du bloc « Bonjour » (`MotusCarte variant="hero"`, ≥ 960 px)
  ou dans le bento en dessous, et jeu complet sur `/eleve/motus`.
- Enseignant : `/enseignant/motus` — liste de mots (ajout en lot, activer/désactiver,
  supprimer), mot du jour (changer / imposer un mot) et résultats de la classe.
  ⚠️ Changer le mot du jour **efface les parties déjà jouées** ce jour-là.

## Reprendre un exercice interrompu

Un élève coupé au milieu d'un exercice — batterie à plat, sonnerie, tablette qui change de
mains — reprend là où il s'était arrêté. Les réponses sont enregistrées **en base**, pas dans
le navigateur : la reprise suit l'élève d'une tablette à l'autre.

| Pièce | Rôle |
|-------|------|
| `exercice_reprise` | une ligne par élève et par travail en cours (`cle` = `exercice:<id>`, `evaluation:<chapitre>`) |
| `lib/reprise.ts` | la forme des clés et `empreinte()` |
| `hooks/useReprise.ts` | chargement, sauvegarde groupée, effacement |
| `app/api/reprise/route.ts` | GET / POST / DELETE, réservés au propriétaire |

- **`etat.empreinte` est le garde-fou** : une reprise ne vaut que si les questions n'ont pas
  changé depuis. Le risque est réel — un réimport de banque réécrit les 236 exercices d'un
  coup. Empreinte différente ⇒ la reprise est jetée et l'élève recommence, c'est-à-dire le
  comportement d'avant : jamais une régression, jamais une réponse attribuée à la mauvaise
  question.
- **L'ordre des questions fait partie de l'état.** Les deux pages tiraient leur ordre au
  chargement ; elles le tirent maintenant *après* avoir su s'il y a une reprise, sinon un
  index enregistré ne désignerait pas la même question au retour.
- La sauvegarde est groupée (700 ms) et **forcée par `sendBeacon`** quand la page se cache —
  c'est précisément le moment où l'on coupe un élève.
- Une sauvegarde qui échoue n'interrompt jamais l'élève : il perd sa reprise, pas son exercice.
- Ce qui est couvert : la page d'entraînement (question par question), l'évaluation
  (à la frontière du mini-exercice — les exercices notés gardent leur score, celui qui était
  en cours recommence) et **les blocs du plan de travail** (`/eleve/activite/[id]`, clé
  `activite:<bloc>`) — ce sont eux qui traînent le plus, un exercice en retard se faisant à
  un moment volé. L'ordre y vit dans `ExerciceStack` : il est tiré une fois et enregistré
  avec les réponses, et la page attend `reprise.pret` avant de monter le composant.
  Les **activités à validation unique** le sont aussi — voir ci-dessous.
- **Pas couvert, et volontairement** : le mini-exercice en cours d'une évaluation. Une
  évaluation se passe en classe, sous surveillance, pas à un moment volé ; sa frontière
  de reprise reste le mini-exercice.
- Pas d'`upsert` : index d'unicité partiels (`eleve_id` / `rb_eleve_id`).

### Les activités à validation unique

`ExerciceStack` avance question par question : son état tient dans un index. Cinq
activités n'ont pas d'index — l'élève remplit un texte, glisse des étiquettes, range une
série, et ne valide qu'au bout. Coupé en route, il perdait **tout**, et c'est justement
le travail le plus long à refaire : vingt étiquettes replacées une à une.

| Activité | Ce qui est enregistré |
|---|---|
| `texte_a_trous` | les mots saisis, et le nombre de vérifications |
| `classement` | la réserve **dans son ordre mélangé** et le contenu de chaque catégorie |
| `analyse_phrase` | phrase et étape en cours, groupes trouvés, score |
| `comparaison` | les signes posés, les lignes verrouillées, **le premier essai** |
| `rangement` | réserve et étiquettes posées par série, **le premier essai** |

- `lib/reprise-composants.ts` ne contient que les **gardes** : « cet état décrit-il encore
  ce contenu-là ? ». Elles sont pures et testées
  (`npx tsx docs/tests/test-reprise-composants.mjs`, 57 cas) parce qu'une garde trop
  permissive **ne plante pas** : elle rend un travail qui se rapporte à d'autres
  questions. Dans le doute elles rendent `null`, et l'élève recommence — le comportement
  d'avant, jamais une régression.
- **L'ordre mélangé fait partie du travail**, comme l'ordre des questions dans
  `ExerciceStack` : remélanger au retour ferait sauter les étiquettes sous les yeux de
  l'élève. Réserve et éléments posés doivent couvrir **exactement** les items, une fois
  chacun : une étiquette perdue rendrait la série invalidable, et l'élève ne pourrait
  plus terminer.
- ⚠️ **Le premier essai doit survivre à l'interruption.** Sans lui, un élève coupé après
  un premier essai raté revient corriger ses erreurs et ressort avec un sans-faute. C'est
  le même principe que `premier_score` : la note honnête est celle du premier jet.
- ⚠️ **L'analyse de phrase se repère dans les phrases SAINES**, après `recalerGroupes()`
  qui écarte un groupe introuvable. Une phrase écartée décale tous les index : la garde
  doit voir la liste assainie, jamais la liste brute du contenu. D'où le `useMemo` placé
  **avant** les `useState` dans le composant.
- Le texte à trous revient toujours **en saisie**, jamais sur l'écran de correction : ce
  qu'on rend à l'élève est son travail, pas un verdict.
- `empreinteContenu()` (`lib/reprise.ts`) calcule l'empreinte des sept types repris en un
  seul endroit. Elle ne retient que ce qui invaliderait le travail — énoncés, réponses,
  groupes, signes attendus : un titre retouché ne doit pas jeter le travail d'un élève.
- Ces cinq activités ne transmettaient pas `nbTentatives` à `marquerFait()` : leur
  `premier_score` était réécrit à chaque passage, exactement comme `ExerciceStack` avant
  correction. Toute nouvelle activité doit le transmettre.

### ⚠️ La note honnête d'une activité qui se refait jusqu'au sans-faute

Quatre des cinq ne se terminent **que** lorsque tout est juste : l'élève corrige jusqu'au
bout. Leur score final vaut donc toujours le total — et c'est cette valeur qui partait en
base. `premier_score` valait **100 % pour tout le monde**, y compris pour l'élève qui s'y
était repris quatre fois. Le graphe de réussite par sous-domaine, fait précisément pour
repérer le travail bâclé, ne voyait que des notes parfaites. Seule l'analyse de phrase y
échappait, son score étant déjà celui du premier jet.

`ScoreActivite` (`lib/score-activite.ts`) porte donc **deux nombres** :

| Champ | Ce qu'il dit | Qui s'en sert |
|---|---|---|
| `bon` / `total` | ce qui est juste à la fin | le statut du bloc (`fait` / `en cours`) |
| `premier` | ce qui était juste au **premier essai** | `premier_score`, donc le suivi |

- Le statut ne change pas de calcul : un élève qui finit a fini, quel que soit le nombre
  d'essais. Seule la note enregistrée devient honnête.
- `premier` est **facultatif** : une activité à essai unique n'en a pas besoin,
  `marquerFait()` retombe sur `score.bon`.
- La comparaison et le rangement calculaient déjà cette note pour l'afficher
  (« 9/10 du premier coup ») avant de la jeter. Le texte à trous et le classement ont
  gagné un relevé `premierResultat`, qui **traverse l'interruption** comme les réponses —
  sans quoi un élève coupé après un premier jet raté reviendrait corriger et ressortirait
  à 100 %.
- ⚠️ La page d'entraînement d'un chapitre (`exercice_resultat`) garde son score final :
  elle pilote la progression dans le chapitre, pas le suivi par sous-domaine.

## Suivi enseignant

Une seule page, **`/enseignant/suivi`** (« Suivi » dans la barre latérale). Elle a
remplacé quatre onglets du tableau de bord (Suivi du jour, Feedback, Progression élèves,
Ceintures) **et** la page « Bilan de classe » : cinq surfaces qui se recoupaient avec
quatre définitions différentes du taux de complétion.

| Pièce | Rôle |
|-------|------|
| `lib/suivi-metriques.ts` | le socle : périmètre, matière d'un bloc, scores, durée, périodes |
| `app/api/enseignant/suivi-stats/route.ts` | **une seule** route, un seul chargement |
| `components/suivi/` | les graphes (Recharts) et les listes |
| `components/suivi/MatriceJour.tsx` | la matrice élèves × travaux du jour (ex-`SuiviJourView`) |
| `components/suivi/ProgressionChapitres.tsx` | élèves × chapitres (ex-`ProgressionElevesView`) |

- **`/enseignant/bilan` et `/enseignant/eleves/[id]/performance` sont des redirections** :
  les liens existants continuent de fonctionner.
- **Périmètre du taux de complétion** : `TYPES_COMPTES` dans `lib/suivi-metriques.ts`.
  Podcasts (`ressource`), ceintures de multiplication et cartes Repetibox sont **exclus** —
  ce sont des activités libres, les compter ferait chuter le taux d'un élève qui a
  pourtant tout fait.
- **Le problème du jour et le calcul du jour en font partie** (`lib/rituels-du-jour.ts`),
  alors qu'ils ne sont pas des blocs de `plan_travail` : ils vivent dans `daily_problems` /
  `problem_attempts` et `calcul_jour` / `calcul_jour_resultat`. Ils sont fabriqués en
  pseudo-blocs et **n'entrent que dans la complétion** : pas de score, pas de durée, et
  jamais dans les retards — la journée passée, un rituel non fait ne se rattrape pas.
  - ⚠️ **Un rituel ne compte qu'un jour où l'élève a du travail assigné.** Les lignes de
    `daily_problems` et `calcul_jour` sont créées à la volée dès qu'un élève ouvre son
    tableau de bord : sans cette règle, un samedi où un seul élève se connecte ajouterait
    deux tâches non faites à toute la classe et ferait chuter la semaine.
  - ⚠️ `problem_attempts.student_id` est l'**uuid d'authentification**, pas `rb_eleve_id` —
    d'où le détour par `eleve.auth_id`. Même piège que les notifications.
  - Compter les rituels fait **baisser** le taux affiché (semaine du 21/09 : 70 % → 68 %,
    jusqu'à −15 points certains jours) : la moitié de la classe ne les fait pas. C'est le
    chiffre honnête, et c'est celui que l'élève voit déjà sur sa barre.
  - Contrat : `npx tsx docs/tests/test-rituels-du-jour.mjs` (13 cas).
- **La barre « Progression du jour » de l'élève applique exactement la même règle**
  (`app/eleve/dashboard/page.tsx`) : même `completion()`, même `TYPES_COMPTES`, mêmes
  rituels. Deux définitions du même chiffre, c'est exactement ce que cette page a été
  faite pour supprimer.
- **La matière d'un bloc ne vient pas de `chapitre_id`**, qui est toujours nul sur
  `plan_travail`. Elle se lit dans `contenu.matiere`, sinon se déduit du `type`
  (`matiereDuBloc()`). Un bloc qu'on ne sait pas classer part dans **« Non classé »** et
  y reste visible : jamais rangé au hasard dans une matière. Les pages de génération
  (`generer`, `nouvelle-semaine`) posent `contenu.matiere` sur **tous** les types, pas
  seulement `exercice`.
- ⚠️ **PostgREST plafonne toute lecture à 1000 lignes** et un trimestre dépasse ce seuil.
  Passer par `chargerBlocs()`, qui pagine par `range()` — un `select` simple perdrait
  des semaines entières sans lever d'erreur.
- L'agrégation par matière est **pondérée par le nombre de questions** : sinon un calcul
  mental de 20 questions pèserait autant qu'un exercice de 3.

- **Un seul vocabulaire** : `lib/matieres-referentiel.ts`. Le formulaire de
  création et le suivi lisaient deux listes différentes — « Mathématiques /
  Numération » d'un côté, « Maths / Nombres » de l'autre — donc des colonnes qui
  ne se rejoignaient jamais. Le libellé du formulaire fait foi ;
  `normaliserMatiere()` rattrape les variantes à la lecture.
- **La sous-matière est exigée à la création** pour les types dont le type ne dit
  pas de quoi parle l'exercice : `exercice`, `qcm`, `eval`, `classement`
  (`TYPES_SOUS_MATIERE_REQUISE`). Ailleurs le type tranche — un calcul mental est
  du calcul — et l'imposer serait de la friction sans information.
  ⚠️ Le champ existait déjà mais était branché **comme un filtre de chapitres**,
  pas comme une étiquette : `MatiereChapitreSelector` le remettait à `""` à
  chaque rechargement, `GenererExerciceForm` ne le transmettait pas, et
  `generer/page.tsx` ne l'écrivait nulle part. Trois ruptures en série, d'où
  **zéro bloc classé sur 934**. Toute modification de cette chaîne doit vérifier
  qu'elle arrive bien jusqu'à `plan_travail.contenu.sous_matiere`.
- `banque_exercices` enregistre désormais le **titre de tous les types** : il
  était réservé à `exercice` et `qcm`, ce qui rendait les autres irrattachables à
  leur bloc — et donc irréparables.
- **Matière ET sous-domaine.** Le graphe de réussite range par *sous-domaine*
  (Conjugaison, Calcul…), pas par matière : c'est la distinction qui sert à
  décider quoi reprendre. `Classement.precis` vaut `false` quand le sous-domaine
  n'est qu'un repli sur le type d'activité (« Exercices », « QCM ») ou
  « Non classé » — le bloc est compté, mais on ne sait pas de quoi il parle.
  `SOUS_DOMAINES` est la liste fermée par matière.
  `scripts/reparer-matiere-blocs.ts` fait préciser le contenu déjà en base
  (`--dry-run` pour l'inventaire, `--repondre "1=f1,2=m2"`, `--tout` pour revoir
  aussi ce que le type classait d'office).
  ⚠️ Il **fait confirmer chaque exercice** et ne recopie pas `banque_exercices`.
  Cette table est du texte libre et le montre : « Français »/« français »,
  « Mathématiques »/« Maths »/« maths », 53 lignes vides, 2 sous-matières sur
  165 — et « Révision : Le verbe être et avoir au présent » y est enregistré en
  *Mathématiques*. Les types autres que `exercice` et `qcm` y sont stockés **sans
  titre** (`generer/page.tsx:868`), donc impossibles à rattacher. Recopier la
  banque changerait un trou visible en erreur invisible.

### Clore un travail infaisable

Un exercice peut être **cassé** : un groupe mal placé dans une analyse de phrase, une
réponse attendue fautive, un énoncé qui se contredit. L'élève a fait neuf questions sur
dix et bute sur la dernière ; ses seules issues étaient de laisser le travail en retard,
ou de le refaire depuis le début pour se heurter au même mur.

Le bouton **« Valider »** de la fiche élève (à côté de « Refaire », sur tout travail non
terminé) clôt le bloc **sans pénaliser l'élève**.

| Pièce | Rôle |
|---|---|
| `lib/progres-partiel.ts` | **pur** : ce qu'on sait déjà du travail, sans rien décider |
| `app/api/enseignant/bloc-valider/route.ts` | `GET ?id=` relève · `POST {id, bon, total}` enregistre |
| `FenetreValidation` (page `suivi`) | montre le relevé et le rend modifiable |

- ⚠️ **La note est rapportée à ce qui a été fait** : neuf justes sur neuf tentées font
  **9/9**, pas 9/10. Compter la dixième contre l'élève reviendrait à lui faire payer un
  exercice cassé.
- Le relevé vient, dans l'ordre : de la **note déjà portée** sur le bloc (un travail « en
  cours » peut en avoir une — l'élève avait fini, mais sous le seuil), puis de la
  **reprise** (`exercice_reprise`), qui est la seule trace du travail d'un élève bloqué.
- **Les deux nombres sont affichés et modifiables** avant l'enregistrement : ils
  deviennent une note, et l'enseignant sait parfois mieux que la machine ce qui s'est
  passé. Ce qu'on ne sait pas établir vaut `null` et laisse les cases vides — mieux vaut
  une saisie qu'un chiffre inventé.
- **Un refus volontaire** : un texte à trous rempli mais jamais vérifié. On sait ce que
  l'élève a tapé, pas si c'est juste — la comparaison tient compte des élisions et vit
  dans le composant. La refaire côté serveur risquerait de contredire son écran.
  Le classement, la comparaison et le rangement se recalculent, eux, sans ambiguïté
  (catégorie attendue, signe attendu, ordre attendu).
- `contenu.valide_par_enseignant` garde la trace de la décision : sans elle, un 9/9
  ressemblerait plus tard à un sans-faute ordinaire et personne ne saurait que l'exercice
  était cassé.
- La **durée n'est pas remise à zéro** : le signal « travail expédié » deviendrait faux.
  La reprise, elle, est supprimée — la laisser rouvrirait l'exercice cassé.
- Contrat vérifié par `npx tsx docs/tests/test-progres-partiel.mjs` (30 cas).

### Travail bâclé

`plan_travail.termine_le` (timestamptz) et `plan_travail.duree_secondes` (entier).

- Mesure côté élève par `hooks/useDureeActivite.ts`, qui **ne compte que pendant que
  l'onglet est visible** : une tablette laissée ouverte à la récréation fausserait tout.
- Écriture par `marquerFait()` (`app/eleve/activite/[id]/page.tsx`), point de passage
  unique des ~28 fins d'activité. `termine_le` est posé **côté serveur** dans
  `PATCH /api/mon-plan-travail`, donc pour tous les élèves réels (tous Repetibox).
- Un bloc remis à faire doit repasser par `champsReprise()` — sinon il garde la durée
  d'avant. Concerné : `bloc-refaire`, `ElevePanel`, le bascule de `MatriceJour`, le
  PATCH de `mon-plan-travail`.
- **`signalBaclage()` exige DEUX signaux** : moins de 5 s par question **et** moins de
  50 % au premier essai. Un élève rapide et juste n'est pas un élève qui bâcle ; accuser
  sur la seule vitesse pénaliserait les bons. Même principe que le
  `tempsMin < 5` du calcul du jour.
- **Le score au premier essai est la note honnête** : après correction tout le monde
  finit haut. `premier_score` / `premier_score_total` n'étaient écrits correctement que
  par deux chemins sur trois — `ExerciceStack` ne transmettait pas `nb_tentatives` et
  réécrivait le premier score à chaque passage.

### Graphiques

Recharts, paramètres communs dans `components/suivi/theme-charts.ts`.

La palette n'est pas choisie à l'œil : elle passe le validateur du guide de
visualisation (bande de clarté, chroma, séparation daltonisme, contraste) sur fond blanc,
la surface des cartes. Trois teintes sont sous 3:1 — partout où elles servent, **la
valeur est écrite à côté de la marque**. Une couleur suit toujours une entité (le niveau
de l'élève), jamais son rang : filtrer ne doit pas repeindre les survivants.

### Rappels aux élèves

`notifications` ne savait désigner qu'un élève PlanBox (`eleve_id`, uuid). Comme tous les
élèves sont Repetibox, le bouton « Envoyer un rappel » écrivait `rb_12` dans une colonne
uuid et échouait en silence. La table a maintenant **`rb_eleve_id`**, le type `rappel` est
accepté par la contrainte, et les élèves Repetibox lisent leurs notifications par
`app/api/mes-notifications/route.ts` (ils n'ont pas de session Supabase côté navigateur).

## Engendrer la semaine depuis la programmation Notion

Sur `/enseignant/nouvelle-semaine`, le bouton **« Depuis ma programmation »**
lit les séances de la semaine dans la base Notion « Programmation année en
cours » — la même que lit le projet `vue-classe` — et engendre les exercices.
L'enseignant n'a qu'à choisir le type d'activité, relire, et poser les blocs.

**Maths et français uniquement.** Histoire, géographie, sciences, anglais et
arts restent manuels : leurs séances ne se transforment pas en exercice
auto-corrigé.

| Pièce | Rôle |
|-------|------|
| `lib/seances-notion.ts` | lecture Notion (serveur), extraction du corpus et de la différenciation |
| `lib/seances-traduction.ts` | **pur** : le pont entre les deux vocabulaires |
| `lib/seances-generation.ts` | **pur** : séance + type → quelle route appeler, avec quoi |
| `app/api/enseignant/seances-semaine/route.ts` | `GET ?lundi=`, éclaté par niveau |
| `components/SeancesSemainePanel.tsx` | choisir → engendrer → relire |

Variables d'environnement : `NOTION_TOKEN`, `NOTION_DB_SEANCES`.

⚠️ **Une erreur Notion ne doit jamais atteindre l'écran telle quelle.** Son message de
404 cite l'identifiant de base interrogé — et si l'identifiant a été mal saisi, ce peut
être un jeton. C'est arrivé : `NOTION_DB_SEANCES` contenait un `ntn_…` en production, et
le panneau de planification l'a affiché en clair. `ErreurNotion` porte le code, le détail
part aux journaux, et `messageErreurNotion()` dit à l'enseignant quoi vérifier (404 → la
base et son partage, 401 → le jeton). Contrat vérifié dans
`docs/tests/test-seances-traduction.mjs`.

⚠️ **Les deux variables se vérifient en production, pas seulement au build.** Le
déploiement du 16/09 avait été contrôlé par la présence de la route dans la sortie de
build ; la valeur, elle, était fausse, et la fonction n'a jamais marché en ligne jusqu'au
23/09. Un `GET /api/enseignant/seances-semaine?lundi=…` avec une session enseignante est
le seul contrôle qui vaille.

### Ce que la base Notion donne, et ce qu'elle ne donne pas

- `Objectifs` est rempli à 100 % et fait la consigne de génération. Précis en
  maths, **tautologique en français** (« Bilan de grammaire. ») — d'où le recours
  au corps de la page.
- Le **corps** des séances de français porte le **corpus de la semaine** (le texte
  réellement lu en classe) et la **différenciation** (`★☆☆ tous · ★★☆ CM1 et CM2
  · ★★★ CM2`, format constant). Le corpus part dans les prompts via
  `blocCorpus()` (`lib/prompts-communs.ts`), les étoiles donnent la difficulté.
- ⚠️ **Deux gabarits de corpus coexistent.** Les séances de langue annoncent
  « Corpus de la semaine » et donnent le texte en **un bloc**, suivi aussitôt
  de « Discipline : … » et « Différenciation : … ». Les séances de **lecture**
  titrent « Texte de lecture - « … » » et étalent le texte sur **cinq ou six
  paragraphes**, précédés d'une note « Prolongement du corpus … feuille
  imprimable dans Documents ».
  `extraireDuCorps()` reconnaît les deux annonces, recolle les paragraphes,
  **s'arrête** à un titre ou à une ligne d'intendance, et **écarte** la note de
  renvoi — laissée dans le corpus, elle ferait fabriquer des questions sur la
  feuille imprimable. Sans cela, les séances de lecture n'avaient jamais de
  texte : les seules pour lesquelles le type `lecture` en exige un.
- **Les maths sont déjà séparées par niveau** ; le français est tagué CE2 + CM,
  donc **une séance de français donne trois lignes**, une par niveau.
- Le sous-domaine des maths se lit dans le **code du titre** (`(N3 · fiche 16)`,
  `ÉVALUATION G1`) : N → Numération, C → Calcul, G → Géométrie,
  M → Grandeurs et mesures, D → Organisation et gestion de données.

### Une séance de grammaire porte deux notions

Les séances du mardi travaillent **la grammaire et l'orthographe**, et
l'enseignant l'écrit dans le titre, séparé par « · » :

```
Grammaire - Les types de phrases · a / à
Grammaire - La forme négative · son/sont · on/ont · -ent
```

`Discipline` ne peut pas le dire : elle ne porte qu'une valeur par séance, et
n'offre pas d'Orthographe. `decouperVolets()` lit donc le titre — **le premier
segment est la grammaire, tout ce qui suit est de l'orthographe** — et rend
**deux lignes**, chacune avec son titre, son objectif et ses types suggérés.
Une séance du mardi taguée CE2 + CM donne ainsi six lignes.

Les objectifs sont répartis de la même main : une proposition qui cite une
notion d'orthographe lui revient, les autres restent à la grammaire. Quand
l'objectif recopie le titre (« Le sujet et le verbe · et / est. »), le « · » y
est lu comme au titre.

⚠️ Sans ce découpage, on n'engendrait **qu'un exercice sur les deux notions
travaillées**, et l'orthographe disparaissait du suivi par sous-domaine — une
matière entière absente du graphe de réussite, sans rien qui le signale.

Les homophones visés (`a/à`, `et/est`, `son/sont`, `on/ont`) sont précisément
ceux que `TexteATrousEleve` sert en `<select>` : d'où `texte_a_trous` en tête
des suggestions pour l'orthographe. Un `<input>` texte y serait impraticable
(piège nº 5).

### Le calcul mental des séances de maths

Chaque séance de maths commence par cinq minutes de calcul mental, et la page
Notion le dit — **23 séances sur 24** sur deux semaines sondées. Il devient une
ligne à part, un volet de plus (comme l'orthographe d'une séance de grammaire),
de sous-domaine « Calcul » et de type `calcul_mental`.

Deux formes, une par niveau — `extraireCalculMental()` lit les deux :

| | CM1 / CM2 | CE2 |
|---|---|---|
| Procédure | 1re ligne : « Ajouter 9, 19, 29 (procédure N7) : » | dans le **titre**, après le tiret |
| Calculs faits en classe | une ligne à « · » | un **tableau** « Je dis / Réponse » |

- ⚠️ Notion ne livre les rangées d'un tableau **qu'à part** : `tableauCalculMental()`
  repère le tableau, `lireRangees()` fait l'appel de plus.
- Les calculs de la classe partent au générateur comme **gabarit**, avec
  l'interdiction de les recopier : un élève qui les a faits le matin les
  retrouverait tels quels.
- Le calcul mental n'est **jamais une évaluation** : un jour de bilan commence
  aussi par cinq minutes de calcul mental, qui restent un entraînement. Sa ligne
  n'est donc pas décochée d'office, et ne propose pas `eval` en premier.
- Le corps des pages de maths est lu désormais — une trentaine d'appels à Notion
  par semaine, **par paquets de trois**, le rythme toléré. Ouverture du panneau :
  4 à 6 s au lieu de 1 à 2.

### L'incertitude qui reste, signalée à l'écran

⚠️ `sousMatiereIncertaine` marque ce qui est **déduit**, pour que l'enseignant
confirme. Sans ça, l'erreur file droit dans le graphe de réussite sans laisser
de trace. Un seul cas subsiste : **les maths CE2 n'ont pas de code de
chapitre** (27 séances sur 81), le sous-domaine est un repli sur « Numération ».

### Ce qui n'est pas pilotable depuis une séance

`classement` réclame des catégories qu'aucun champ ne fournit, et `ecriture`
tire son sujet d'un générateur de thèmes indépendant. Les deux sont exclus des
suggestions (`empechement()` dit pourquoi) et restent accessibles à la main.

### Pièges des routes de génération

Chacune a son contrat, et `lib/seances-generation.ts` les concentre :
- `generer-calcul-mental-ia` renvoie `{ calculs }`, **pas** `{ resultat }` ;
- `generer-analyse-phrase` échoue en **500** sans `fonctionsActives` (prendre
  `FONCTIONS_DEFAUT[niveau]`) ;
- `generer-lecture` est la seule à prendre un vrai texte (`texte`) ;
- le niveau s'appelle `niveauNom` pour `exercice` et `calcul_mental`, `niveau`
  partout ailleurs.

### Relecture

L'exercice s'affiche **en entier** et se corrige sur place : titre, consigne,
énoncés et réponses attendues. Un aperçu tronqué n'est pas une relecture — on ne
décide pas d'envoyer un exercice à des élèves sans l'avoir lu jusqu'au bout.

⚠️ Deux choses restent en lecture seule, et ce n'est pas un oubli : le **texte
d'un texte à trous** et les **groupes d'une analyse de phrase**. Leurs positions
sont des index calculés sur le texte (`trous.position`, `groupes.debut/fin`) ;
les retoucher à la main désynchroniserait l'exercice et l'élève se retrouverait
devant une réponse impossible — le piège nº 8 des pièges connus. Pour ces
cas-là, le bouton **Régénérer** refait la ligne seule, sans relancer le lot.

Le sélecteur de type propose les types **adaptés d'abord, puis tous les autres** :
ne montrer que les deux ou trois « justes » rendait le reste inatteignable — on
ne pouvait pas demander du calcul mental sur une séance de numération. Changer
le sous-domaine recalcule les suggestions.

### Reprendre un exercice à l'unité

Après la génération, le bouton **« Modifier »** d'une ligne ouvre **le formulaire
de la page « Nouvel exercice »**, pré-rempli pour la séance : type d'activité au
choix, consigne, sous-matière, niveau, groupe, date. Le résultat remplace le
contenu de la ligne ; le jour et le groupe restent ceux de la séance.

- **Un seul répartiteur** : `lib/generation-contenu.ts` (`executerGeneration()`)
  est sorti de `generer/page.tsx`, qui l'utilise désormais. Dix types, avec leurs
  chemins propres — modes manuels, fractions en images, calcul mental local ou
  par IA. Un second formulaire aurait divergé du premier.
- `valeursFormulaire()` (`lib/seances-generation.ts`, pur, testé) traduit une
  séance en `defaultValues` — **les noms de champs que lit chaque formulaire**
  (`consigneDetaillee`, `consignesSpeciales`, `sous_matiere` pour le QCM…). Un
  nom faux ne plante pas : le champ reste vide.
- ⚠️ Le **groupe** est pré-choisi d'après le niveau de la ligne : le formulaire
  d'exercice en déduit le `niveauNom` donné au modèle, sans lui il écrirait
  « École primaire ».
- Le **corpus** ne figure dans aucun formulaire : il est ajouté aux paramètres
  au moment de l'appel.
- `classement` et `lecture` sans corpus, refusés au panneau, deviennent possibles
  ici : le formulaire permet de saisir catégories ou texte.
- Deux formulaires ont été complétés : `GenererCalcMentalForm` accepte
  `defaultValues`, `GenererExerciceForm` garde la sous-matière reçue. Leur bouton
  « Banque » n'apparaît que si `onPiocherBanque` est fourni.

### Un rechargement ne doit rien effacer

Le 23/09, un déploiement est passé en ligne **pendant** une génération : Next.js
a rechargé la page pour servir la nouvelle version, et quinze exercices
engendrés — trois minutes et demie, quinze appels au modèle — ont disparu. Ils
n'existaient qu'en mémoire jusqu'au clic sur « Poser » ; les routes de
génération n'écrivent rien.

- **Brouillon par semaine** (`lib/brouillon-seances.ts`, `localStorage`) : choix,
  types, sous-domaines corrigés et contenus engendrés. Rouvrir le panneau les
  rend **en relecture** avec un bandeau « N exercices retrouvés ». Même poste,
  quelques minutes d'écart : le navigateur suffit, pas besoin de base.
- ⚠️ **Le brouillon ne s'écrit qu'une fois relu** (`brouillonActif`) : au montage
  la liste est vide, et l'enregistrer aussitôt effacerait justement ce qu'on veut
  retrouver.
- La fusion se fait **par clé** (séance × volet × niveau), jamais par position ;
  une génération coupée (`encours`) redevient `attente`, et « Engendrer les N
  restants » la reprend. Effacé à la pose, périmé au bout de 7 jours.
- Pendant la génération, et sur la grille tant que des blocs ne sont pas
  planifiés, le navigateur **demande confirmation** avant de quitter la page.
- Contrat vérifié par `npx tsx docs/tests/test-brouillon-seances.mjs` (28 cas).

La génération est **séquentielle** : `generer-exercice` limite à 20 appels par
minute, une semaine en demande une douzaine, et un échec isolé ne doit pas
emporter le lot. Compter ~15 s par exercice.

Contrat vérifié par `npx tsx docs/tests/test-seances-traduction.mjs` (182 cas) —
à relancer après toute modification de ces modules.

## Changer d'année (remise à zéro)

Bouton **« Changer d'année »** en bas de `/enseignant/parametres`.

- Définition des tables vidées : `lib/nouvelle-annee.ts`
- API : `app/api/admin/nouvelle-annee/route.ts` (`GET` = aperçu chiffré, `POST` = exécution)
- UI : `components/NouvelleAnneeSection.tsx` (saisie de « NOUVELLE ANNEE » obligatoire)

**Efface** tout le travail élève : `plan_travail`, `exercice_resultat`, `evaluation_resultat`,
`exercice_reprise`,
`calcul_jour_resultat`, `qcm_reponse`, `pb_progression`, `notifications`,
`eleve_bibliotheque_choix`, `chapitre_assignation`, `dictee_correction_feedback`.

**Conserve** les contenus (chapitres, exercices, livres, leçons, podcasts, banques) et les
ceintures de multiplication. Options cochables : dictées, Ma P'tite Règle, thèmes d'écriture.

⚠️ **Base partagée avec Repetibox** (même projet Supabase `dobaryyfqgcumwbskark`). Ne jamais
vider `carte`, `flash_session`, `badge_eleve`, `progression`, `etudiant`, `eleve`,
`groupe_eleve`, `qr_tokens`, `math_problems`, `problem_attempts` : ces tables appartiennent à
Repetibox. `badge_eleve.eleve_id` et `ceinture_resultat.repetibox_eleve_id` sont en
`ON DELETE CASCADE` sur `eleve` — supprimer un élève Repetibox efface ses badges et ses ceintures.

## Pièges connus

1. **Normalisation des accents** : ne JAMAIS supprimer les accents dans le normaliser (`normaliser()` dans la page exercice élève). Sinon `ou` = `où` et `er` = `é`
2. **FK avant suppression** : toujours nettoyer toutes les tables FK avant de supprimer un chapitre (voir section Relations FK)
3. **requireEnseignant()** : vérifie par email OU par classe, pas uniquement par email
4. **Exercices -er/-é** : UNIQUEMENT verbes du 1er groupe, INTERDIT 2e/3e groupe dans les prompts
5. **Texte à trous -er/-é** : utiliser des `<select>` dropdown, pas des inputs texte (sinon impossible de répondre)
6. **env vars** : dans les scripts CLI, charger avec `export $(grep -v '^#' .env.local | xargs)` avant d'exécuter
7. **Dates en heure locale** : ne JAMAIS appeler `toISOString()` sur une `Date` construite en heure locale (`new Date(a, m, j)`, `setDate()`). En France (UTC+1/+2) le résultat recule d'un jour. Pour les conversions semaine ↔ date, utiliser `lib/semaine-iso.ts` (`lundiDeSemaine()`, `semaineISO()`), qui calcule tout en UTC ; sinon formater à la main avec `getFullYear()/getMonth()/getDate()`
8. **`debut`/`fin` d'une analyse de phrase sont des index de MOTS**, jamais de caractères, et l'IA se trompe régulièrement d'un mot. Un groupe mal placé n'est pas une petite faute : l'élève clique exactement dessus, la réponse est refusée, et **rien ne le fait avancer** — c'est arrivé en classe sur « Les élèves courent dans la cour de récréation chaque mardi. ». Le texte du groupe (`mots`) fait foi ; `lib/analyse-phrase.ts` (`recalerGroupes`) recalcule les positions et **écarte** un groupe introuvable, à la génération comme à l'affichage. Le composant élève donne en plus la réponse après trois essais : aucune étape ne doit pouvoir enfermer un élève. `scripts/reparer-analyse-phrase.ts` remet en état le contenu déjà en base (idempotent, `--dry-run`).
9. **`figure` et `droite` se perdent en chemin** : ce sont des clés facultatives d'une *question*, pas des types d'exercice. Toute page qui reconstruit sa propre liste de questions à partir de `contenu` doit les recopier, et son rendu doit appeler `FigureGeo` / `DroiteGraduee` — sinon l'élève lit « Quelle est cette figure ? » sans figure. Deux pages sont tombées dans le piège l'une après l'autre : l'entraînement (`chapitre/[id]/exercice/[exerciceId]`) et le `MiniQCM` de l'évaluation. La banque ne pose de dessin qu'à trois endroits — questions de `qcm` (156), questions d'`exercice` (276) et questions de diagnostic (3) : c'est là qu'il faut vérifier après toute modification d'un de ces rendus. Un QCM de fractions en images passe par les mêmes rendus, **plus l'aperçu enseignant** de `/enseignant/generer` : sans le dessin, on valide une question qu'on n'a pas pu relire.

## Joseph — Agent de test et correction

Joseph est un élève virtuel qui vérifie et corrige automatiquement les exercices.

### Commandes
Quand l'utilisateur dit **"fais passer Joseph"**, exécuter :
```bash
export $(grep -v '^#' .env.local | xargs) && npm run joseph
```

| Demande utilisateur | Commande |
|---------------------|----------|
| "fais passer Joseph" | `npm run joseph` |
| "fais passer Joseph sur er" | `npm run joseph "er"` |
| "fais passer Joseph avec correction" | `npm run joseph -- --fix` |
| "fais passer Joseph sur er avec correction" | `npm run joseph -- --fix "er"` |
| "fais passer Joseph sur les dictées" | `npm run joseph -- --dictees` |
| "fais passer Joseph sur le parcours élève" | `npm run joseph -- --parcours` |

### Capacités
- **Ma P'tite Règle** : vérifie structure + contenu IA de chaque exercice, corrige en BDD avec `--fix`
- **Dictées** (`--dictees`) : vérifie la cohérence des dictées générées (texte, phrases, mots, niveaux)
- **Parcours élève** (`--parcours`) : simule un élève qui fait les exercices d'un chapitre de bout en bout
