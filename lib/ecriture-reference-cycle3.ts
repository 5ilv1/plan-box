/**
 * Référentiel de correction pour l'atelier d'écriture — cycle 3 (CE2 / CM1 / CM2).
 *
 * Ce fichier est injecté dans les prompts Claude via prompt caching
 * (cache_control ephemeral, TTL 5 min). Son contenu est stable — le modifier
 * déclenche juste un miss de cache au prochain appel, sans casser le service.
 *
 * Édite-le librement : ajoute les notions vues en classe, les fautes
 * typiques des élèves, les exigences précises par niveau. Plus le contenu
 * est riche et ciblé, plus la correction IA devient pertinente et
 * pédagogiquement adaptée.
 */

export const REFERENCE_CYCLE3 = `# Référentiel de correction — Atelier d'écriture cycle 3

## Attendus officiels (Bulletin Officiel — programme cycle 3)

### CE2 (8-9 ans)
Ce qui est exigible :
- Majuscules en début de phrase, point final, virgules simples.
- Accord sujet-verbe au présent, imparfait, futur, passé composé (personnes simples : je, tu, il/elle, nous, vous, ils/elles).
- Accord en genre (féminin/masculin) et nombre (singulier/pluriel) dans le groupe nominal simple (déterminant + nom + adjectif).
- Pluriels réguliers en -s, pluriels en -x (chevaux, journaux, oiseaux…).
- Homophones les plus fréquents : a/à, et/est, on/ont, son/sont.
- Passé composé avec être et avoir (accords de base).
- Verbes du 1er groupe à l'infinitif (-er) vs. participe passé (-é).

Ce qui N'EST PAS exigé au CE2 — à ne pas signaler comme erreur :
- Subjonctif, conditionnel complexe.
- Accords du participe passé avec COD antéposé.
- Orthographe lexicale rare.
- Style soutenu / figures de style.

### CM1 (9-10 ans)
En plus du CE2 :
- Conjugaison complète des verbes des 3 groupes aux temps simples.
- Accord du participe passé avec être et avoir (règle de base).
- Homophones plus fins : ou/où, ce/se, ces/ses, la/là/l'a, mes/mais.
- Participe présent en -ant.
- Pluriels des mots en -ou (genoux, cailloux, bijoux…) et en -al/-ail.
- Ponctuation : deux-points, point-virgule, guillemets de dialogue.

Ce qui N'EST PAS exigé au CM1 :
- Subjonctif imparfait.
- Accords du participe passé des verbes pronominaux complexes.

### CM2 (10-11 ans)
En plus du CM1 :
- Tous les homophones grammaticaux courants.
- Conjugaison du conditionnel, du subjonctif présent.
- Accord du participe passé : être, avoir avec COD antéposé.
- Concordance des temps simples.
- Style : éviter les répétitions, varier les connecteurs.

---

## Homophones grammaticaux — signaler les confusions

| Confusion | Règle |
|-----------|-------|
| a / à | "a" = verbe avoir (il a) ; "à" = préposition (il va à l'école) |
| et / est | "et" = conjonction (paul et moi) ; "est" = verbe être (il est) |
| on / ont | "on" = pronom (on mange) ; "ont" = verbe avoir (ils ont) |
| son / sont | "son" = possessif (son sac) ; "sont" = verbe être (ils sont) |
| ou / où | "ou" = choix (café ou thé) ; "où" = lieu/temps (où vas-tu ?) |
| ce / se | "ce" = démonstratif (ce livre) ; "se" = pronom réfléchi (il se lave) |
| ces / ses | "ces" = démonstratif pluriel (ces livres) ; "ses" = possessif (ses livres à lui) |
| la / là / l'a | "la" = article/pronom ; "là" = lieu ; "l'a" = le/la + verbe avoir |
| mes / mais | "mes" = possessif (mes amis) ; "mais" = conjonction d'opposition |
| leur / leurs | "leur" = invariable devant verbe (je leur parle) ou singulier possessif ; "leurs" = pluriel possessif |
| -er / -é | -er = infinitif (manger) ; -é = participe passé (mangé) — test : remplacer par "vendre"/"vendu" |

## Erreurs typiques par catégorie à détecter systématiquement

### Orthographe
- Oubli d'accents (foret → forêt, ete → été, ou → où).
- Confusion c/ç/s/ss (garson → garçon, poison/poisson).
- Anglicismes : text → texte, cool → sympa, ok → d'accord, shopping → achats.
- Mots composés (grand-mère, porte-monnaie).
- "Dictionnaire" oublié d'un n, "apparaître" (double p).
- Terminaison muette : chat, bras, trop, beaucoup.

### Grammaire / conjugaison
- Imparfait 3e pers. sing. : "il marchais" → "il marchait" (-ait pas -ais).
- Confusion imparfait / passé simple.
- Terminaison -é / -er / -ez : "il a mangez" → "mangé" ; "pour mangé" → "pour manger".
- Accord GN : "les grands arbre" → "les grands arbres" ; "une belle maison" (féminin).
- Oubli du "s" du pluriel sur l'adjectif : "des arbres vert" → "verts".
- "je vais" et non "je vas" ; "tu vas" et non "tu va".

### Syntaxe / ponctuation
- Phrases sans majuscule / point.
- Phrases trop longues sans ponctuation.
- Oubli des virgules dans une énumération.
- Dialogue sans guillemets ni tiret.
- Répétition excessive du même connecteur (et, et, et…) ou du même sujet.

---

## Ce qu'il faut faire (attitude de correction)

1. **Systématique sur l'orthographe et la grammaire** : signale TOUTES les occurrences (même répétées), en respectant la règle CRITIQUE des positions exactes.
2. **Adapté au niveau** : ne pénalise pas un CE2 sur une notion CM2. Pour un CM2, sois plus exigeant sur le style.
3. **Vocabulaire bienveillant** : l'indice doit aider à comprendre, jamais humilier. Style : "Attention…", "Regarde…", "Est-ce que tu peux vérifier…".
4. **Pas de stylistique** : ne corrige pas un choix d'auteur ("j'ai couru vite" est valable, ne propose pas "j'ai filé comme une flèche").
5. **Privilégier la pédagogie** : l'indice explique la règle, ne donne la correction QUE si l'erreur est récurrente (champ "correction").

## Ce qu'il faut ÉVITER

- Signaler un mot correct comme faute.
- Signaler un choix stylistique légitime.
- Proposer des reformulations de style.
- Utiliser un vocabulaire au-dessus du niveau (pas de "hypallage", "subordonnée relative complétive"…).
- Signaler une faute qui dépasse le programme du niveau de l'élève.
`;
