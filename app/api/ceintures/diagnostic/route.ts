import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireProprietaireOuEnseignant } from "@/lib/server-auth";
import { lireEleve, type EleveRef } from "@/lib/ceintures-serveur";
import { domaineParCode, titreChapitre } from "@/lib/ceintures-competences";

/**
 * Le diagnostic d'une ceinture : 2 QCM par item, sur une seule page, sans
 * correction pendant la passation.
 *
 * Ce n'est PAS un nouveau mécanisme de validation. À la remise, les items
 * réussis 2/2 reçoivent une ligne `exercice_resultat` avec `valide = true` :
 * la page chapitre existante les affiche comme validés et débloque la suite
 * toute seule, jusqu'au premier item non acquis.
 */

interface QuestionBanque {
  question: string;
  options: string[];
  reponse_correcte: number;
  explication?: string;
  /** Figure ou droite dessinée avec la question. Voir SPEC-FIGURES.md. */
  figure?: unknown;
  droite?: unknown;
}

/** Question telle qu'elle part chez l'élève : sans la réponse. */
interface QuestionPosee {
  item_code: string;
  question: string;
  options: string[];
  figure?: unknown;
  droite?: unknown;
}

async function chargerCeinture(domaineCode: string, idx: number) {
  const admin = createAdminClient();

  const { data: lien } = await admin
    .from("ceinture_chapitre")
    .select("chapitre_id")
    .eq("domaine_code", domaineCode)
    .eq("ceinture_idx", idx)
    .maybeSingle();

  const { data: items } = await admin
    .from("ceinture_item")
    .select("code, libelle, validation, ordre")
    .eq("domaine_code", domaineCode)
    .eq("ceinture_idx", idx)
    .eq("actif", true)
    .order("ordre");

  return { chapitreId: (lien?.chapitre_id as string) ?? null, items: items ?? [] };
}

/**
 * GET /api/ceintures/diagnostic?domaine=PHRA&idx=2&eleve_id=…
 * Les questions de la ceinture, sans les bonnes réponses, ou la passation
 * déjà enregistrée le cas échéant.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const eleve = lireEleve(params);
  const domaineCode = (params.get("domaine") ?? "").toUpperCase();
  const idx = Number(params.get("idx"));

  if (!eleve.eleveId && !eleve.rbEleveId) {
    return NextResponse.json({ erreur: "eleve_id ou rb_eleve_id requis" }, { status: 400 });
  }
  const domaine = domaineParCode(domaineCode);
  if (!domaine || !Number.isInteger(idx) || idx < 0 || idx > 8) {
    return NextResponse.json({ erreur: "domaine ou idx invalide" }, { status: 400 });
  }

  const auth = await requireProprietaireOuEnseignant(eleve.eleveId, eleve.rbEleveId);
  if (!auth.ok) return auth.error;

  const admin = createAdminClient();
  const { chapitreId, items } = await chargerCeinture(domaineCode, idx);

  if (!chapitreId || !items.length) {
    return NextResponse.json({ erreur: "Ceinture introuvable" }, { status: 404 });
  }

  // Déjà passé ? On ne le repropose pas — seul l'enseignant peut réinitialiser.
  let q = admin
    .from("ceinture_diagnostic")
    .select("id, items_acquis, nb_correct, nb_total, created_at")
    .eq("domaine_code", domaineCode)
    .eq("ceinture_idx", idx);
  q = eleve.eleveId ? q.eq("eleve_id", eleve.eleveId) : q.eq("rb_eleve_id", eleve.rbEleveId);
  const { data: dejaPasse } = await q.maybeSingle();

  if (dejaPasse) {
    return NextResponse.json({
      deja_passe: true,
      diagnostic: dejaPasse,
      chapitre_id: chapitreId,
    });
  }

  const { data: banque } = await admin
    .from("ceinture_banque")
    .select("item_code, contenu")
    .eq("usage", "diagnostic")
    .in("item_code", items.map((i) => i.code));

  // Ordre des items du référentiel, questions dans l'ordre de la banque :
  // les deux questions d'un même item se suivent, ce qui évite à l'élève de
  // sauter d'une notion à l'autre à chaque question.
  const questions: QuestionPosee[] = [];
  for (const item of items) {
    const dItem = (banque ?? []).filter((b) => b.item_code === item.code);
    for (const b of dItem) {
      const c = b.contenu as unknown as QuestionBanque;
      // La figure part avec la question : « Quelle heure indique cette
      // horloge ? » sans horloge n'a pas de sens, y compris au diagnostic.
      questions.push({
        item_code: item.code,
        question: c.question,
        options: c.options,
        ...(c.figure ? { figure: c.figure } : {}),
        ...(c.droite ? { droite: c.droite } : {}),
      });
    }
  }

  if (!questions.length) {
    return NextResponse.json({ erreur: "Banque de diagnostic vide" }, { status: 404 });
  }

  return NextResponse.json({
    deja_passe: false,
    domaine: { code: domaine.code, nom: domaine.nom, slug: domaine.slug },
    ceinture_idx: idx,
    titre: titreChapitre(domaine, idx),
    chapitre_id: chapitreId,
    items: items.map((i) => ({ code: i.code, libelle: i.libelle })),
    questions,
  });
}

/**
 * POST /api/ceintures/diagnostic
 * Body : { domaine, idx, eleve_id? | rb_eleve_id?, reponses: number[] }
 *
 * `reponses` suit l'ordre des questions renvoyées par le GET ; -1 = sans réponse.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const domaineCode = String(body.domaine ?? "").toUpperCase();
  const idx = Number(body.idx);
  const eleve: EleveRef = {
    eleveId: body.eleve_id ?? null,
    rbEleveId: body.rb_eleve_id != null ? Number(body.rb_eleve_id) : null,
  };
  const reponses: number[] = Array.isArray(body.reponses) ? body.reponses : [];

  if (!eleve.eleveId && !eleve.rbEleveId) {
    return NextResponse.json({ erreur: "eleve_id ou rb_eleve_id requis" }, { status: 400 });
  }
  const domaine = domaineParCode(domaineCode);
  if (!domaine || !Number.isInteger(idx) || idx < 0 || idx > 8) {
    return NextResponse.json({ erreur: "domaine ou idx invalide" }, { status: 400 });
  }

  const auth = await requireProprietaireOuEnseignant(eleve.eleveId, eleve.rbEleveId);
  if (!auth.ok) return auth.error;

  const admin = createAdminClient();
  const { chapitreId, items } = await chargerCeinture(domaineCode, idx);
  if (!chapitreId || !items.length) {
    return NextResponse.json({ erreur: "Ceinture introuvable" }, { status: 404 });
  }

  const { data: banque } = await admin
    .from("ceinture_banque")
    .select("item_code, contenu")
    .eq("usage", "diagnostic")
    .in("item_code", items.map((i) => i.code));

  // Reconstruire l'ordre exact du GET pour aligner les réponses.
  const attendues: { item_code: string; q: QuestionBanque }[] = [];
  for (const item of items) {
    for (const b of (banque ?? []).filter((x) => x.item_code === item.code)) {
      attendues.push({ item_code: item.code, q: b.contenu as unknown as QuestionBanque });
    }
  }

  if (reponses.length !== attendues.length) {
    return NextResponse.json(
      { erreur: `${reponses.length} réponse(s) pour ${attendues.length} question(s)` },
      { status: 400 },
    );
  }

  // Un item est acquis s'il est réussi sur TOUTES ses questions.
  const bonnesParItem = new Map<string, { bonnes: number; total: number }>();
  let nbCorrect = 0;

  attendues.forEach((a, i) => {
    const juste = reponses[i] === a.q.reponse_correcte;
    if (juste) nbCorrect++;
    const acc = bonnesParItem.get(a.item_code) ?? { bonnes: 0, total: 0 };
    acc.total++;
    if (juste) acc.bonnes++;
    bonnesParItem.set(a.item_code, acc);
  });

  // Les items dont la validation revient à l'enseignant (production d'écrit,
  // copie…) ne sont jamais acquis sur un QCM : réussir deux questions sur le
  // portrait moral ne dispense pas de l'écrire.
  const validationParCode = new Map(items.map((i) => [i.code, i.validation as string]));

  const itemsAcquis = [...bonnesParItem.entries()]
    .filter(([code, s]) => s.bonnes === s.total && validationParCode.get(code) === "auto")
    .map(([code]) => code);

  // ── Enregistrer la passation ────────────────────────────────────────────
  // Pas d'upsert : les index d'unicité sont PARTIELS (`where eleve_id is not
  // null`), et PostgREST ne sait pas les viser par `onConflict`. On remplace
  // une éventuelle passation précédente — cas d'une réinitialisation suivie
  // d'une reprise concurrente.
  const [colEleve, valEleve]: [string, string | number] = eleve.eleveId
    ? ["eleve_id", eleve.eleveId]
    : ["rb_eleve_id", eleve.rbEleveId as number];

  await admin
    .from("ceinture_diagnostic")
    .delete()
    .eq("domaine_code", domaineCode)
    .eq("ceinture_idx", idx)
    .eq(colEleve, valEleve);

  const { data: diagnostic, error: errDiag } = await admin
    .from("ceinture_diagnostic")
    .insert({
      eleve_id: eleve.eleveId,
      rb_eleve_id: eleve.rbEleveId,
      domaine_code: domaineCode,
      ceinture_idx: idx,
      questions: attendues.map((a) => ({
        item_code: a.item_code,
        question: a.q.question,
        options: a.q.options,
        reponse_correcte: a.q.reponse_correcte,
      })),
      reponses,
      items_acquis: itemsAcquis,
      nb_correct: nbCorrect,
      nb_total: attendues.length,
    })
    .select()
    .single();

  if (errDiag) {
    console.error("[ceintures/diagnostic POST]", errDiag);
    return NextResponse.json({ erreur: "Enregistrement impossible" }, { status: 500 });
  }

  // ── Valider les items acquis ────────────────────────────────────────────
  // Une ligne `exercice_resultat` à score = total : c'est le mécanisme existant
  // qui prend le relais, y compris pour le déblocage en cascade.
  let nbValides = 0;
  if (itemsAcquis.length) {
    const { data: exercices } = await admin
      .from("exercice")
      .select("id, contenu, nb_questions")
      .eq("chapitre_id", chapitreId);

    const aValider = (exercices ?? []).filter((e) =>
      itemsAcquis.includes((e.contenu as Record<string, unknown>)?.item_code as string),
    );

    if (aValider.length) {
      const lignes = aValider.map((e) => {
        const total = Math.max(1, e.nb_questions ?? 1);
        return {
          exercice_id: e.id,
          eleve_id: eleve.eleveId,
          rb_eleve_id: eleve.rbEleveId,
          score: total,
          total,
          valide: true,
        };
      });

      const { error: errRes } = await admin.from("exercice_resultat").insert(lignes);
      if (errRes) console.error("[ceintures/diagnostic] exercice_resultat:", errRes.message);
      else nbValides = lignes.length;
    }
  }

  return NextResponse.json({
    ok: true,
    diagnostic_id: diagnostic.id,
    chapitre_id: chapitreId,
    nb_correct: nbCorrect,
    nb_total: attendues.length,
    items_acquis: itemsAcquis,
    items_a_travailler: items.filter((i) => !itemsAcquis.includes(i.code)).map((i) => ({
      code: i.code,
      libelle: i.libelle,
    })),
    nb_items_valides: nbValides,
  });
}
