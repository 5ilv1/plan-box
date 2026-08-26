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
| `plan_travail` | Blocs de travail assignés (type, statut, contenu JSON) |
| `pb_progression` | Progression par élève et chapitre (pourcentage, statut) |
| `niveaux` | CE2, CM1, CM2 |
| `classe` | Classes enseignant (user_id) |
| `dictees` | Dictées générées (titre, thème, niveaux 1-4 étoiles) |
| `notifications` | Notifications |
| `evaluation_resultat` | Résultats d'évaluation |
| `banque_exercices` | Banque d'exercices réutilisables |
| `user_preferences` | Préférences UI (nav_order) |

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
```

## Déploiement
- **Vercel** : auto-deploy sur push `main`
- **URL prod** : https://plan-box-phi.vercel.app

## Ceintures de compétences (français)

Référentiel PIDAPI adapté : 3 domaines × 9 couleurs (vert clair → noir), 112 items.
Conception et décisions dans `docs/ceintures/BRIEF.md`.

**Règle d'architecture** : une ceinture est une ligne de `chapitres`
(`sous_matiere = 'ceinture-mots|phrases|textes'`), un item est une ligne de
`exercice` portant `contenu.item_code`. Tout le cycle entraînement → évaluation
réutilise le moteur existant — ne pas en construire un second.

| Table | Rôle |
|-------|------|
| `ceinture_domaine` | MOTS, PHRA, TEXT (les 4 domaines de maths viendront) |
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

## Changer d'année (remise à zéro)

Bouton **« Changer d'année »** en bas de `/enseignant/parametres`.

- Définition des tables vidées : `lib/nouvelle-annee.ts`
- API : `app/api/admin/nouvelle-annee/route.ts` (`GET` = aperçu chiffré, `POST` = exécution)
- UI : `components/NouvelleAnneeSection.tsx` (saisie de « NOUVELLE ANNEE » obligatoire)

**Efface** tout le travail élève : `plan_travail`, `exercice_resultat`, `evaluation_resultat`,
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
