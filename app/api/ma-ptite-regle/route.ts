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
    const { titre, regle, astuce, exemple, niveau_id, groupe_ids, date_debut } = body;

    if (!titre || !regle) {
      return NextResponse.json({ error: "titre et regle requis" }, { status: 400 });
    }

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

    // 3. Générer 5 exercices via IA
    const exercicesDefs = [
      {
        jour: "Lundi",
        label: "Observation — Découverte",
        type: "exercice" as const,
        nb: 7, nbCible: 5,
        instruction: `Exercice d'observation/découverte pour que l'élève identifie la règle par lui-même.
RÈGLE ABSOLUE : chaque question contient UNE SEULE phrase avec UN SEUL trou (UN SEUL mot manquant, jamais deux).
L'énoncé contient exactement UN "___" et la reponse_attendue est exactement UN mot.
INTERDIT : plusieurs trous dans une phrase, réponses avec "/" ou plusieurs mots.
Les phrases doivent guider l'élève vers la compréhension de la règle sans la formuler explicitement.`,
      },
      {
        jour: "Mardi",
        label: "Exercice à trous — Entraînement",
        type: "texte_a_trous" as const,
        nb: 8,
        instruction: `Exercice à trous d'entraînement. L'élève doit compléter les phrases avec le bon mot.
Les trous portent uniquement sur la difficulté orthographique visée par la règle.
Le texte doit être une petite histoire cohérente avec les mots manquants liés à la règle.
RÈGLE ABSOLUE : CHAQUE occurrence du mot visé par la règle dans le texte DOIT être un trou. Il ne doit JAMAIS y avoir un "est", "et" (ou le mot visé) écrit en clair dans le texte — tous doivent être remplacés par des trous.`,
      },
      {
        jour: "Mercredi",
        label: "Trouve l'erreur — Entraînement",
        type: "qcm" as const,
        nb: 5,
        instruction: `Exercice "trouve l'erreur". L'élève doit trouver la phrase correctement orthographiée parmi 4 propositions.
Chaque question propose 4 versions de la MÊME phrase. Les erreurs portent UNIQUEMENT sur la confusion entre les mots visés par la règle (ex: "est" utilisé à la place de "et", ou inversement).
INTERDIT : inventer des mots qui n'existent pas (comme "és", "ét", "a/à" mal orthographiés). Les erreurs doivent être des VRAIES confusions entre homophones existants.
Exemple pour est/et : une phrase avec "est" et "et" → les variantes inversent ces mots aux mauvais endroits.`,
      },
      {
        jour: "Jeudi",
        label: "Transforme / Réécris",
        type: "exercice" as const,
        nb: 5,
        instruction: `Exercice de transformation/réécriture. L'élève doit réécrire des phrases en appliquant la règle.
Exemples : transformer au pluriel, changer le sujet, passer d'une forme à l'autre.
Chaque question donne une phrase à transformer et l'élève doit écrire la phrase corrigée.`,
      },
      {
        jour: "Vendredi",
        label: "Évaluation — Mix",
        type: "qcm" as const,
        nb: 8,
        instruction: `Évaluation finale qui mélange tous les types d'exercices vus dans la semaine.
Questions variées : identification, correction d'erreurs, choix du bon mot.
Plus exigeant que les exercices précédents pour vérifier la maîtrise de la règle.
INTERDIT : inventer des mots qui n'existent pas comme distracteurs. Les erreurs dans les options doivent être des VRAIES confusions entre les homophones visés par la règle, pas des fautes de frappe ou des mots inventés.`,
      },
    ];

    const niveauNom = "CM1-CM2";
    const results: { jour: string; ok: boolean; titre?: string }[] = [];

    for (let i = 0; i < exercicesDefs.length; i++) {
      const def = exercicesDefs[i];
      try {
        const generated = await genererExerciceRegle(
          def.type,
          def.nb,
          titre,
          regle,
          astuce || "",
          exemple || "",
          def.instruction,
          niveauNom
        );

        // Tronquer au nombre cible si on a demandé plus (pour compenser le filtre)
        const nbCible = (def as any).nbCible ?? def.nb;
        if (Array.isArray(generated.contenu.questions) && generated.contenu.questions.length > nbCible) {
          generated.contenu.questions = generated.contenu.questions.slice(0, nbCible);
        }

        const nbFinal = Array.isArray(generated.contenu.questions)
          ? generated.contenu.questions.length
          : def.nb;

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

  // Supprimer les exercices, résultats, assignations, puis le chapitre
  await admin.from("exercice_resultat").delete().in(
    "exercice_id",
    (await admin.from("exercice").select("id").eq("chapitre_id", id)).data?.map((e: any) => e.id) ?? []
  );
  await admin.from("exercice").delete().eq("chapitre_id", id);
  await admin.from("chapitre_assignation").delete().eq("chapitre_id", id);
  await admin.from("pb_progression").delete().eq("chapitre_id", id);
  await admin.from("chapitres").delete().eq("id", id);

  return NextResponse.json({ ok: true });
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
      "enonce": "Texte de la question (phrase à transformer)",
      "reponse_attendue": "La réponse correcte (phrase transformée)",
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
  niveauNom: string
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
${type === "exercice" ? `- RÈGLE ABSOLUE : chaque énoncé contient exactement UN SEUL trou (___). JAMAIS deux trous dans une phrase.
- La reponse_attendue est exactement UN SEUL mot, jamais une combinaison avec "/" ou plusieurs mots.` : ""}
${type === "texte_a_trous" ? `- Génère UN SEUL texte cohérent d'au moins 5 phrases
- Chaque "mot" dans "trous" DOIT être un copier-coller exact d'un mot du texte_complet
- Les trous portent uniquement sur "${titreRegle}"
- CHAQUE occurrence du mot visé dans le texte DOIT être un trou. Aucune occurrence ne doit rester en clair.
- L'indice doit être l'astuce de substitution ou le mot de remplacement` : ""}

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour.
Format attendu :
${format}`;

  const message = await anthropic.messages.create({
    model: type === "texte_a_trous" ? "claude-sonnet-4-20250514" : "claude-haiku-4-5-20251001",
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
    const trousFixed: { position: number; mot: string; indice?: string }[] = [];
    for (const trou of contenu.trous) {
      const motSansPonctuation = trou.mot.replace(/[.,;:!?'"()]/g, "");
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

  // Pour les exercices à trou unique, filtrer les questions avec plusieurs trous
  if (type === "exercice" && Array.isArray(contenu.questions)) {
    contenu.questions = contenu.questions.filter((q: any) => {
      const nbTrous = (q.enonce?.match(/_{2,}/g) || []).length;
      const repHasSlash = q.reponse_attendue?.includes("/");
      return nbTrous <= 1 && !repHasSlash;
    });
  }

  // Valider et corriger les réponses
  contenu = await validerReponsesExercice(contenu, type, anthropic);

  const titre = contenu.titre || `${type} — ${titreRegle}`;
  return { titre, contenu };
}
