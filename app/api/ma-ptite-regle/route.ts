import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";
import { validerReponsesExercice } from "@/lib/valider-reponses-exercice";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

/* ──────────────────────────────────────────────────────
   GET  /api/ma-ptite-regle?enseignant_id=UUID
   Liste toutes les règles (chapitres sous_matiere = "rituel-orthographe")
   ────────────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const enseignantId = req.nextUrl.searchParams.get("enseignant_id");
  const admin = createAdminClient();

  // Récupérer les chapitres rituel-orthographe
  let query = admin
    .from("chapitres")
    .select("*, niveaux(nom)")
    .eq("sous_matiere", "rituel-orthographe")
    .order("created_at", { ascending: false });

  const { data: chapitres, error } = await query;
  if (error) {
    console.error("[ma-ptite-regle GET] chapitres:", error);
    return NextResponse.json({ error: "Erreur de lecture" }, { status: 500 });
  }

  // Pour chaque chapitre, récupérer les exercices et l'assignation
  const ids = (chapitres ?? []).map((c: any) => c.id);

  const [exosRes, assignRes] = await Promise.all([
    ids.length > 0
      ? admin.from("exercice").select("id, chapitre_id, titre, type, ordre, nb_questions, contenu").in("chapitre_id", ids).order("ordre")
      : { data: [], error: null },
    ids.length > 0
      ? admin.from("chapitre_assignation").select("chapitre_id, groupe_id, actif").in("chapitre_id", ids)
      : { data: [], error: null },
  ]);

  const exosMap = new Map<string, any[]>();
  for (const e of exosRes.data ?? []) {
    const arr = exosMap.get(e.chapitre_id) ?? [];
    arr.push(e);
    exosMap.set(e.chapitre_id, arr);
  }

  const assignMap = new Map<string, number>();
  for (const a of (assignRes.data ?? []) as any[]) {
    if (a.actif) assignMap.set(a.chapitre_id, (assignMap.get(a.chapitre_id) ?? 0) + 1);
  }

  const regles = (chapitres ?? []).map((c: any) => ({
    ...c,
    exercices: exosMap.get(c.id) ?? [],
    nb_groupes_assignes: assignMap.get(c.id) ?? 0,
  }));

  return NextResponse.json({ regles });
}

/* ──────────────────────────────────────────────────────
   POST /api/ma-ptite-regle
   Crée une règle : chapitre + leçon (revision) + 5 exercices IA
   Body: { titre, regle, astuce, exemple, niveau_id, groupe_ids? }
   ────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { titre, regle, astuce, exemple, niveau_id, groupe_ids, date_debut,
      mots_cibles } = body;

    if (!titre || !regle) {
      return NextResponse.json({ error: "titre et regle requis" }, { status: 400 });
    }

    // 0. Détection automatique de la catégorie par l'IA
    const categorie = await detecterCategorie(titre, regle);
    console.log(`[ma-ptite-regle] Catégorie détectée pour "${titre}": ${categorie}`);

    const admin = createAdminClient();

    // 1. Créer le chapitre
    const { data: chapitre, error: errCh } = await admin
      .from("chapitres")
      .insert({
        titre: `Ma P'tite Règle : ${titre}`,
        matiere: "français",
        sous_matiere: "rituel-orthographe",
        niveau_id: niveau_id || null,
        description: regle,
        date_debut: date_debut || null,
        nb_cartes_eval: 10,
        seuil_reussite: 80,
      })
      .select()
      .single();

    if (errCh || !chapitre) {
      console.error("[ma-ptite-regle POST] chapitre:", errCh);
      return NextResponse.json({ error: "Erreur création chapitre" }, { status: 500 });
    }

    // 2. Créer l'exercice de type "revision" (leçon)
    const leconContenu = {
      contenu_html: `<h3>La règle</h3><p>${regle}</p>`,
      astuce: astuce || null,
      points_cles: [regle, astuce, exemple].filter(Boolean),
      exemples: exemple
        ? [{ titre: "Exemple", colonnes: ["Phrase", "Explication"], lignes: [[exemple, astuce || ""]] }]
        : [],
    };

    await admin.from("exercice").insert({
      chapitre_id: chapitre.id,
      titre: `Leçon : ${titre}`,
      type: "revision",
      contenu: leconContenu,
      nb_questions: 0,
      ordre: 0,
    });

    // 3. Générer les exercices via IA (adaptés à la catégorie de règle)
    const exercicesDefs = getExercicesDefs(categorie, titre, regle, mots_cibles);

    const niveauNom = "CM1-CM2";
    const results: { jour: string; ok: boolean; titre?: string }[] = [];

    for (let i = 0; i < exercicesDefs.length; i++) {
      const def = exercicesDefs[i];
      try {
        // Exercice d'écriture : contenu statique, pas de génération IA
        if (def.type === "ecriture_contrainte") {
          const contraintes = genererContraintesEcriture(categorie, titre, regle, mots_cibles);
          await admin.from("exercice").insert({
            chapitre_id: chapitre.id,
            titre: def.label,
            type: def.type,
            contenu: {
              consigne: `Écris 3 phrases en utilisant correctement « ${titre} ».\nRappel : ${regle}`,
              contraintes,
              nb_phrases: 3,
            },
            nb_questions: 3,
            ordre: i + 1,
          });
          results.push({ jour: def.jour, ok: true, titre: def.label });
          continue;
        }

        const generated = await genererExerciceRegle(
          def.type as "qcm" | "texte_a_trous" | "exercice",
          def.nb,
          titre,
          regle,
          astuce || "",
          exemple || "",
          def.instruction,
          niveauNom,
          (def as any).reponseUnMot ?? false,
          categorie,
        );

        // Tronquer au nombre cible si on a demandé plus (pour compenser le filtre)
        const nbCible = (def as any).nbCible ?? def.nb;
        if (Array.isArray(generated.contenu.questions) && generated.contenu.questions.length > nbCible) {
          generated.contenu.questions = generated.contenu.questions.slice(0, nbCible);
        }

        // Calculer le vrai nombre de questions/trous
        let nbFinal = def.nb;
        if (Array.isArray(generated.contenu.questions)) {
          nbFinal = generated.contenu.questions.length;
        } else if (def.type === "texte_a_trous" && Array.isArray(generated.contenu.trous)) {
          nbFinal = generated.contenu.trous.length;
        }

        await admin.from("exercice").insert({
          chapitre_id: chapitre.id,
          titre: def.label,
          type: def.type,
          contenu: generated.contenu,
          nb_questions: nbFinal,
          ordre: i + 1,
        });

        results.push({ jour: def.jour, ok: true, titre: generated.titre });
      } catch (err) {
        console.error(`[ma-ptite-regle] erreur génération ${def.jour}:`, err);
        results.push({ jour: def.jour, ok: false });
      }
    }

    // 4. Assigner aux groupes si fournis
    if (groupe_ids && groupe_ids.length > 0) {
      const assignations = groupe_ids.map((gid: string) => ({
        chapitre_id: chapitre.id,
        groupe_id: gid,
        actif: true,
      }));
      await admin.from("chapitre_assignation").insert(assignations);
    }

    return NextResponse.json({ chapitre, results });
  } catch (err) {
    console.error("[ma-ptite-regle POST]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/* ──────────────────────────────────────────────────────
   PATCH /api/ma-ptite-regle
   Modifie un chapitre rituel. Body: { id, date_debut? }
   ────────────────────────────────────────────────────── */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, date_debut } = body;

  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("chapitres")
    .update({ date_debut: date_debut || null })
    .eq("id", id);

  if (error) {
    console.error("[ma-ptite-regle PATCH]", error);
    return NextResponse.json({ error: "Erreur mise à jour" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/* ──────────────────────────────────────────────────────
   DELETE /api/ma-ptite-regle?id=UUID
   Supprime un chapitre rituel et ses exercices
   ────────────────────────────────────────────────────── */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const admin = createAdminClient();

  // Supprimer toutes les dépendances FK avant de supprimer le chapitre
  const exRes = await admin.from("exercice").select("id").eq("chapitre_id", id);
  const exIds = (exRes.data ?? []).map((e: any) => e.id);
  if (exIds.length > 0) {
    await admin.from("exercice_resultat").delete().in("exercice_id", exIds);
  }

  // Nettoyer toutes les tables référençant chapitre_id
  await Promise.all([
    admin.from("exercice").delete().eq("chapitre_id", id),
    admin.from("chapitre_assignation").delete().eq("chapitre_id", id),
    admin.from("pb_progression").delete().eq("chapitre_id", id),
    admin.from("evaluation_resultat").delete().eq("chapitre_id", id),
    admin.from("plan_travail").delete().eq("chapitre_id", id),
    admin.from("notifications").delete().eq("chapitre_id", id),
    admin.from("banque_exercices").delete().eq("chapitre_id", id),
  ]);

  const { error } = await admin.from("chapitres").delete().eq("id", id);
  if (error) {
    console.error("[ma-ptite-regle DELETE]", error);
    return NextResponse.json({ error: "Erreur suppression: " + error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/* ──────────────────────────────────────────────────────
   Helpers : détection automatique de catégorie
   ────────────────────────────────────────────────────── */

async function detecterCategorie(
  titre: string,
  regle: string,
): Promise<"homophone" | "morphologie" | "syntaxe"> {
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 50,
      messages: [{
        role: "user",
        content: `Classe cette règle d'orthographe dans UNE des 3 catégories suivantes :
- "homophone" : confusion entre deux mots qui se prononcent pareil (est/et, ou/où, sont/son, a/à, etc.)
- "morphologie" : transformation de forme (pluriels, terminaisons verbales -er/-é, accords, suffixes)
- "syntaxe" : structure de phrase (négation ne…pas, interrogation, etc.)

Titre : "${titre}"
Règle : "${regle}"

Réponds UNIQUEMENT par un seul mot : homophone, morphologie ou syntaxe.`,
      }],
    });

    const raw = (message.content[0].type === "text" ? message.content[0].text : "").trim().toLowerCase();
    if (raw === "morphologie") return "morphologie";
    if (raw === "syntaxe") return "syntaxe";
    return "homophone";
  } catch (err) {
    console.warn("[detecterCategorie] Erreur, fallback homophone:", err);
    return "homophone";
  }
}

/* ──────────────────────────────────────────────────────
   Helpers : définitions d'exercices par catégorie
   ────────────────────────────────────────────────────── */

type ExoDef = {
  jour: string;
  label: string;
  type: "exercice" | "texte_a_trous" | "qcm" | "ecriture_contrainte";
  nb: number;
  nbCible?: number;
  reponseUnMot?: boolean;
  instruction: string;
};

function getExercicesDefs(
  categorie: string,
  titre: string,
  regle: string,
  mots_cibles?: string[],
): ExoDef[] {
  const motsCiblesStr = mots_cibles?.length
    ? mots_cibles.map((m) => `"${m}"`).join(" et ")
    : titre.includes(" / ")
      ? titre.split(" / ").map((m) => `"${m.trim()}"`).join(" et ")
      : `"${titre}"`;

  if (categorie === "homophone") {
    return [
      {
        jour: "Lundi",
        label: "Observation — Découverte",
        type: "exercice",
        nb: 7, nbCible: 5, reponseUnMot: true,
        instruction: `Exercice d'observation/découverte pour que l'élève identifie la règle par lui-même.
RÈGLE ABSOLUE : chaque question contient UNE SEULE phrase avec UN SEUL trou (UN SEUL mot manquant, jamais deux).
L'énoncé contient exactement UN "___" et la reponse_attendue est exactement UN SEUL MOT (ex: ${motsCiblesStr}).
JAMAIS une phrase complète en reponse_attendue, JAMAIS de "/", JAMAIS plusieurs mots.
Les phrases doivent guider l'élève vers la compréhension de la règle sans la formuler explicitement.`,
      },
      {
        jour: "Mardi",
        label: "Exercice à trous — Entraînement",
        type: "texte_a_trous",
        nb: 8,
        instruction: `Exercice à trous d'entraînement. L'élève doit compléter les phrases avec le bon mot.
Le texte doit être une petite histoire cohérente avec les mots manquants liés à la règle.
Les trous portent UNIQUEMENT sur les mots EXACTS visés par la règle : uniquement ${motsCiblesStr}.
INTERDIT de mettre un trou sur d'autres mots.
CHAQUE occurrence de ces mots exacts dans le texte DOIT être un trou. Aucune ne doit rester en clair.`,
      },
      {
        jour: "Mercredi",
        label: "Trouve l'erreur — Entraînement",
        type: "qcm",
        nb: 5,
        instruction: `Exercice "trouve la bonne phrase". L'élève doit trouver la phrase correctement orthographiée parmi 4 propositions.
Chaque question propose 4 versions de la MÊME phrase. Les erreurs portent UNIQUEMENT sur la confusion entre ${motsCiblesStr}.
INTERDIT : inventer des mots qui n'existent pas. Les erreurs doivent être des VRAIES confusions entre les homophones existants.`,
      },
      {
        jour: "Jeudi",
        label: "Écriture — Utilise la règle",
        type: "ecriture_contrainte",
        nb: 0,
        instruction: "",
      },
    ];
  }

  if (categorie === "morphologie") {
    // Détecter si c'est une règle de pluriel ou de terminaison verbale
    const estPluriel = /pluriel|pluri|-al|-ail|-ou/i.test(titre);
    const estVerbe = /infinitif|participe|conjugaison|-er|-é/i.test(titre);

    const instructionObservation = estVerbe
      ? `Exercice d'observation/découverte sur la règle « ${titre} ».
Chaque question présente une phrase avec UN SEUL trou (___) à la place d'un verbe.
L'élève doit écrire la bonne forme du verbe : infinitif (-er) ou participe passé (-é/-ée/-és/-ées).
Format de chaque question :
- enonce : une phrase avec un trou à la place du verbe, suivi du verbe entre parenthèses. Ex: "Il a ___ une pomme. (manger)"
- reponse_attendue : la forme correcte du verbe (ex: "mangé", "manger")
La reponse_attendue est UN SEUL MOT : c'est OBLIGATOIREMENT la forme correcte du verbe indiqué entre parenthèses.
Si l'énoncé dit "(manger)" → la réponse est "mangé" ou "manger", JAMAIS un autre verbe.
UNIQUEMENT des verbes du 1er groupe (-er) : manger, jouer, marcher, regarder, trouver, préparer, etc.
INTERDIT d'utiliser des verbes du 2e groupe (finir, choisir…) ou du 3e groupe (prendre, vendre, faire…).
INTERDIT de répondre par un verbe différent de celui entre parenthèses.
Alterner infinitif et participe passé.`
      : `Exercice d'observation/découverte sur la règle « ${titre} ».
Chaque question présente un mot ou un groupe nominal au SINGULIER. L'élève doit écrire la forme au PLURIEL.
Format de chaque question :
- enonce : "Écris au pluriel : un {mot}" (ou "des {groupe nominal}")
- reponse_attendue : la forme plurielle correcte (ex: "des chevaux", "des bijoux")
Les questions doivent couvrir à la fois les cas réguliers ET les exceptions de la règle.
Au moins 2 questions doivent porter sur des exceptions.`;

    const instructionTrous = estVerbe
      ? `Exercice à trous sur « ${titre} ».
Génère une petite histoire cohérente qui utilise des verbes du 1er groupe à l'infinitif et au participe passé.
UNIQUEMENT des verbes du 1er groupe (-er) : manger, jouer, marcher, regarder, trouver, etc.
INTERDIT : verbes du 2e groupe (finir, choisir…) ou du 3e groupe (prendre, vendre, faire…).
Les trous portent UNIQUEMENT sur les verbes en -er ou -é/-ée/-és/-ées.
Le texte doit alterner les deux formes (infinitif et participe passé).
CHAQUE verbe en -er ou -é concerné par la règle DOIT être un trou.
L'indice doit être l'astuce "vendre/vendu" appliquée au contexte de la phrase.`
      : `Exercice à trous sur « ${titre} ».
Génère une petite histoire cohérente qui utilise des noms/adjectifs au pluriel concernés par cette règle.
Les trous portent UNIQUEMENT sur les mots au pluriel qui illustrent la règle (les formes en -oux, -aux, -eaux, -als, -ails selon la règle).
Le texte doit mélanger des cas réguliers ET des exceptions.
CHAQUE mot au pluriel concerné par la règle DOIT être un trou.
L'indice doit rappeler si c'est un cas régulier ou une exception.`;

    const instructionQcm = estVerbe
      ? `Exercice "trouve la bonne phrase". L'élève doit trouver la phrase avec la bonne terminaison du verbe parmi 4 propositions.
Chaque question propose 4 versions de la MÊME phrase. Les erreurs portent sur la confusion entre -er (infinitif) et -é/-ée/-és/-ées (participe passé).
UNIQUEMENT des verbes du 1er groupe (-er). INTERDIT : verbes du 2e ou 3e groupe.
INTERDIT : inventer des terminaisons fantaisistes. Les erreurs doivent être des confusions RÉELLES entre infinitif et participe passé.
Varier les verbes et les contextes (après auxiliaire, après préposition, après un autre verbe).`
      : `Exercice "trouve la bonne phrase". L'élève doit trouver la phrase correctement orthographiée parmi 4 propositions.
Chaque question propose 4 versions de la MÊME phrase contenant un pluriel lié à la règle « ${titre} ».
Les erreurs portent sur la terminaison du pluriel : mauvais suffixe (-s au lieu de -x, -aux au lieu de -als, etc.).
INTERDIT : inventer des suffixes fantaisistes. Les erreurs doivent être des confusions RÉELLES entre les terminaisons existantes (-s, -x, -aux, -als, -ails, -oux).
Au moins 2 questions doivent porter sur des exceptions.`;

    return [
      {
        jour: "Lundi",
        label: "Observation — Découverte",
        type: "exercice",
        nb: 7, nbCible: 5, reponseUnMot: estVerbe,
        instruction: instructionObservation,
      },
      {
        jour: "Mardi",
        label: "Exercice à trous — Entraînement",
        type: "texte_a_trous",
        nb: 8,
        instruction: instructionTrous,
      },
      {
        jour: "Mercredi",
        label: "Trouve l'erreur — Entraînement",
        type: "qcm",
        nb: 5,
        instruction: instructionQcm,
      },
      {
        jour: "Jeudi",
        label: "Écriture — Utilise la règle",
        type: "ecriture_contrainte",
        nb: 0,
        instruction: "",
      },
    ];
  }

  // categorie === "syntaxe" (ex: la négation ne…pas)
  return [
    {
      jour: "Lundi",
      label: "Observation — Découverte",
      type: "exercice",
      nb: 7, nbCible: 5,
      instruction: `Exercice d'observation/découverte sur « ${titre} ».
Chaque question présente une phrase AFFIRMATIVE. L'élève doit la réécrire à la forme NÉGATIVE en utilisant correctement la structure « ${titre} ».
Format :
- enonce : "Mets cette phrase à la forme négative : {phrase affirmative}"
- reponse_attendue : la phrase complète à la forme négative
Les phrases doivent être simples et variées (temps présent, passé composé, futur).
Inclure au moins 1 phrase avec un verbe commençant par une voyelle (n' au lieu de ne).`,
    },
    {
      jour: "Mardi",
      label: "Exercice à trous — Entraînement",
      type: "texte_a_trous",
      nb: 8,
      instruction: `Exercice à trous sur « ${titre} ».
Génère une petite histoire cohérente contenant des phrases à la forme NÉGATIVE.
Les trous portent UNIQUEMENT sur les mots de la négation : "ne", "n'", "pas", "plus", "jamais", "rien", "personne".
CHAQUE mot de négation dans le texte DOIT être un trou.
L'indice doit aider l'élève à identifier quelle partie de la négation manque (premier ou second élément).`,
    },
    {
      jour: "Mercredi",
      label: "Trouve l'erreur — Entraînement",
      type: "qcm",
      nb: 5,
      instruction: `Exercice "trouve la bonne phrase". L'élève doit trouver la phrase avec la négation correctement placée parmi 4 propositions.
Chaque question propose 4 versions de la MÊME phrase négative.
Les erreurs portent sur le placement ou l'oubli de « ne/n' » ou « pas/plus/jamais » :
- oubli du "ne" (erreur fréquente à l'oral)
- "ne" mal placé (pas devant le verbe)
- mauvais second élément de la négation
INTERDIT : inventer des structures impossibles. Les erreurs doivent refléter les VRAIES fautes des élèves.`,
    },
    {
      jour: "Jeudi",
      label: "Écriture — Utilise la règle",
      type: "ecriture_contrainte",
      nb: 0,
      instruction: "",
    },
  ];
}

/* ── Contraintes pour l'exercice d'écriture ──────────── */

function genererContraintesEcriture(
  categorie: string,
  titre: string,
  regle: string,
  mots_cibles?: string[],
): string[] {
  if (categorie === "homophone") {
    const mots = mots_cibles?.length
      ? mots_cibles
      : titre.split(" / ").map((m) => m.trim());
    const contraintes = mots.map((m) => `Utiliser correctement « ${m} » au moins une fois`);
    contraintes.push("Écrire des phrases complètes avec un sujet, un verbe et un complément");
    return contraintes;
  }

  if (categorie === "morphologie") {
    const estVerbe = /infinitif|participe|conjugaison|-er|-é/i.test(titre);
    if (estVerbe) {
      return [
        "Utiliser au moins 1 verbe du 1er groupe à l'infinitif (-er)",
        "Utiliser au moins 1 verbe du 1er groupe au participe passé (-é/-ée)",
        "Écrire des phrases complètes avec un sujet, un verbe et un complément",
      ];
    }
    return [
      `Utiliser au moins 2 mots au pluriel qui suivent la règle « ${titre} »`,
      `Utiliser au moins 1 mot qui est une exception à la règle`,
      "Écrire des phrases complètes avec un sujet, un verbe et un complément",
    ];
  }

  // syntaxe
  return [
    `Utiliser correctement la structure « ${titre} » dans au moins 2 phrases`,
    "Écrire au moins 1 phrase avec un verbe commençant par une voyelle (n' au lieu de ne)",
    "Écrire des phrases complètes avec un sujet, un verbe et un complément",
  ];
}

/* ──────────────────────────────────────────────────────
   Helpers : génération IA d'un exercice pour une règle
   ────────────────────────────────────────────────────── */

function getFormatPourType(type: "qcm" | "texte_a_trous" | "exercice"): string {
  switch (type) {
    case "qcm":
      return `{
  "titre": "Titre court",
  "consigne": "Consigne précise",
  "questions": [
    {
      "question": "La question posée",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "reponse_correcte": 2,
      "explication": "Explication de la bonne réponse"
    }
  ]
}`;
    case "texte_a_trous":
      return `{
  "titre": "Titre court",
  "consigne": "Complète le texte avec les mots manquants",
  "texte_complet": "Le texte intégral avec tous les mots (au moins 5 phrases). C'est UN SEUL texte continu.",
  "trous": [
    { "position": 0, "mot": "premier mot à deviner", "indice": "Un indice" }
  ]
}`;
    case "exercice":
      return `{
  "titre": "Titre court de l'exercice",
  "consigne": "La consigne générale",
  "questions": [
    {
      "id": 1,
      "enonce": "Texte de la question",
      "reponse_attendue": "La réponse correcte",
      "indice": "Un indice optionnel"
    }
  ]
}`;
  }
}

async function genererExerciceRegle(
  type: "qcm" | "texte_a_trous" | "exercice",
  nbQuestions: number,
  titreRegle: string,
  regle: string,
  astuce: string,
  exemple: string,
  instruction: string,
  niveauNom: string,
  reponseUnMot: boolean = false,
  categorie: string = "homophone",
): Promise<{ titre: string; contenu: any }> {
  const format = getFormatPourType(type);

  const THEMES = [
    "une sortie scolaire au musée", "une journée à la ferme", "une compétition sportive",
    "un voyage en train vers la mer", "la construction d'une cabane dans le jardin",
    "une aventure dans la forêt", "un anniversaire surprise", "un projet de jardinage",
    "un concours de cuisine entre amis", "une promenade au bord de la plage",
    "un spectacle de cirque", "la récolte des pommes à l'automne",
  ];
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)];

  // Sonnet par défaut, Opus pour les règles complexes (morphologie/syntaxe)
  const model = categorie !== "homophone"
    ? "claude-opus-4-20250514"
    : "claude-sonnet-4-20250514";

  const prompt = `Tu es un assistant pédagogique pour une école primaire française (niveau ${niveauNom}).

RÈGLE D'ORTHOGRAPHE à travailler : "${titreRegle}"
Règle : ${regle}
${astuce ? `Astuce de substitution : ${astuce}` : ""}
${exemple ? `Exemple : ${exemple}` : ""}

${instruction}

Thème pour les phrases : ${theme}.
Nombre d'items à générer : ${nbQuestions}.

IMPORTANT :
- Toutes les phrases doivent porter sur la difficulté "${titreRegle}"
- Langage simple, adapté à des enfants de 8-11 ans
- Pas de violence, pas de sujets sensibles
- Questions progressives en difficulté
${type === "qcm" ? "- IMPORTANT : la position de la bonne réponse (reponse_correcte) doit varier aléatoirement entre 0, 1, 2 et 3" : ""}
${type === "exercice" && reponseUnMot ? `- RÈGLE ABSOLUE : chaque énoncé contient exactement UN SEUL trou (___). JAMAIS deux trous dans une phrase.
- La reponse_attendue est exactement UN SEUL mot, jamais une combinaison avec "/" ou plusieurs mots.` : ""}
${type === "texte_a_trous" ? `- Génère UN SEUL texte cohérent d'au moins 5 phrases
- Chaque "mot" dans "trous" DOIT être un copier-coller exact d'un mot du texte_complet
- CHAQUE occurrence du mot visé dans le texte DOIT être un trou. Aucune occurrence ne doit rester en clair.
- L'indice doit être l'astuce de substitution ou le mot de remplacement` : ""}

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.
Format attendu :
${format}`;

  const message = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const json = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let contenu = JSON.parse(json);
  if (Array.isArray(contenu)) contenu = contenu[0];

  // Correction des positions pour texte_a_trous
  if (type === "texte_a_trous" && contenu.texte_complet && Array.isArray(contenu.trous)) {
    const mots = (contenu.texte_complet as string).split(/\s+/);

    // Déterminer le pattern attendu selon la règle (verbes -er/-é ou pluriels)
    const estVerbeRegle = /infinitif|participe|conjugaison|-er|-é/i.test(titreRegle ?? "");
    const patternVerbe = /^(.*er|.*é|.*ée|.*és|.*ées)$/i;

    const trousFixed: { position: number; mot: string; indice?: string }[] = [];
    for (const trou of contenu.trous) {
      const motSansPonctuation = trou.mot.replace(/[.,;:!?'"()]/g, "");

      // Filtrer les trous qui ne matchent pas le pattern de la règle
      if (estVerbeRegle && !patternVerbe.test(motSansPonctuation)) continue;

      const positionsPrises = new Set<number>(trousFixed.map((t) => t.position));
      for (let i = 0; i < mots.length; i++) {
        if (positionsPrises.has(i)) continue;
        const motTexte = mots[i].replace(/[.,;:!?'"()]/g, "");
        if (motTexte === motSansPonctuation || motTexte === trou.mot) {
          trousFixed.push({ ...trou, position: i, mot: mots[i] });
          break;
        }
      }
    }
    contenu.trous = trousFixed;
  }

  // Pour les homophones avec reponseUnMot : filtrer et corriger
  if (type === "exercice" && reponseUnMot && Array.isArray(contenu.questions)) {
    contenu.questions = contenu.questions.filter((q: any) => {
      const nbTrous = (q.enonce?.match(/_{2,}/g) || []).length;
      const repHasSlash = q.reponse_attendue?.includes("/");
      return nbTrous <= 1 && !repHasSlash;
    });

    for (const q of contenu.questions as any[]) {
      if (q.reponse_attendue?.includes(" ")) {
        q.reponse_attendue = q.reponse_attendue.split(/\s+/)[0].replace(/[.,;:!?]/g, "");
      }
    }
  }

  // Valider et corriger les réponses
  contenu = await validerReponsesExercice(contenu, type, anthropic);

  // Mélanger les options QCM (Fisher-Yates)
  if (type === "qcm" && Array.isArray(contenu.questions)) {
    for (const q of contenu.questions as any[]) {
      if (!Array.isArray(q.options) || q.reponse_correcte === undefined) continue;
      const bonneReponse = q.options[q.reponse_correcte];
      for (let i = q.options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [q.options[i], q.options[j]] = [q.options[j], q.options[i]];
      }
      q.reponse_correcte = q.options.indexOf(bonneReponse);
    }
  }

  const titre = contenu.titre || `${type} — ${titreRegle}`;
  return { titre, contenu };
}
