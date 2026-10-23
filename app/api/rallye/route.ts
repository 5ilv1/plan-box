import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import { dateDuJour } from "@/lib/motus";
import {
  FICHES, classementClasse, cleEleve, fiche, filtreEleveRallye, partiesDeLEleve,
  rallyeActif, resoudreEleveRallye, type PartieRallye,
} from "@/lib/rallye-bestioles-serveur";
import {
  episodePublic, estBonne, questionsPubliques, scorePartie, tirerPropositions,
  type EleveCourantRallye, type EpisodePublic, type FicheRallye, type LigneClassement, type QuestionPublique,
} from "@/lib/rallye-bestioles";

/**
 * Rallye Bestioles.
 *
 *   GET  /api/rallye                               → état de l'élève (EtatRallye)
 *   POST /api/rallye { action: "choisir", fiche }  → choisit un des podcasts proposés
 *   POST /api/rallye { action: "repondre", question, choix } → répond à UNE question
 *
 * Les bonnes réponses ne quittent le serveur qu'une fois la question répondue :
 * le navigateur ne peut ni se corriger lui-même ni se déclarer gagnant.
 */

export interface PartiePublique {
  episode: EpisodePublic;
  questions: QuestionPublique[];
  reponses: Array<number | null>;
  /** Bonnes options des questions déjà répondues, `null` pour les autres. */
  corrections: Array<number[] | null>;
  score: number;
  total: number;
  termine: boolean;
}

export interface EtatRallye {
  actif: boolean;
  prenom: string;
  phase: "choix" | "partie" | "termine_tout";
  propositions: EpisodePublic[];
  partie: PartiePublique | null;
  /** Le dernier podcast terminé : l'écran de score après le QCM. */
  derniere: PartiePublique | null;
  /** Points des podcasts terminés aujourd'hui. */
  scoreDuJour: number;
  scoreGlobal: number;
  nbJoues: number;
  nbTotal: number;
  classement: LigneClassement[];
  moi: string;
}

function partiePublique(p: PartieRallye, f: FicheRallye): PartiePublique {
  const reponses = f.questions.map((_, i) => (typeof p.reponses[i] === "number" ? p.reponses[i] : null));
  return {
    episode: episodePublic(f),
    questions: questionsPubliques(f),
    reponses,
    corrections: f.questions.map((q, i) => (reponses[i] === null ? null : q.bonnes)),
    score: p.score,
    total: p.total,
    termine: p.termine,
  };
}

async function etat(admin: ReturnType<typeof createAdminClient>, eleve: EleveCourantRallye): Promise<EtatRallye> {
  const date = dateDuJour();
  const [actif, parties, classement] = await Promise.all([
    rallyeActif(admin), partiesDeLEleve(admin, eleve), classementClasse(admin),
  ]);
  const joues = new Set(parties.map((p) => p.fiche));
  const disponibles = FICHES.map((f) => f.numero).filter((n) => !joues.has(n));
  const scoreGlobal = parties.filter((p) => p.termine).reduce((s, p) => s + p.score, 0);

  const terminees = parties.filter((p) => p.termine && fiche(p.fiche));
  const derniere = terminees[terminees.length - 1];
  const base: EtatRallye = {
    actif, prenom: eleve.prenom, phase: "choix", propositions: [], partie: null,
    derniere: derniere ? partiePublique(derniere, fiche(derniere.fiche)!) : null,
    scoreDuJour: terminees.filter((p) => p.date === date).reduce((s, p) => s + p.score, 0),
    scoreGlobal, nbJoues: parties.filter((p) => p.termine).length, nbTotal: FICHES.length,
    classement, moi: cleEleve(eleve),
  };

  // Un podcast choisi et pas fini se reprend, quel que soit le jour du choix.
  const enCours = parties.find((p) => !p.termine && fiche(p.fiche));
  if (enCours) return { ...base, phase: "partie", partie: partiePublique(enCours, fiche(enCours.fiche)!) };

  if (disponibles.length === 0) return { ...base, phase: "termine_tout" };

  // Le nombre de podcasts joués entre dans la graine : après chaque podcast,
  // un nouveau tirage ; un rechargement, lui, ne rebat pas les cartes.
  const propositions = tirerPropositions(disponibles, `${cleEleve(eleve)}|${parties.length}`, date)
    .map((n) => episodePublic(fiche(n)!));
  return { ...base, phase: "choix", propositions };
}

async function eleveDeLaSession() {
  const user = await getServerUser();
  if (!user) return { erreur: NextResponse.json({ erreur: "Non authentifié" }, { status: 401 }) };
  const admin = createAdminClient();
  const eleve = await resoudreEleveRallye(admin, user.id);
  if (!eleve) return { erreur: NextResponse.json({ erreur: "Élève inconnu" }, { status: 403 }) };
  return { admin, eleve };
}

export async function GET(req: NextRequest) {
  // ?actif=1 : le seul réglage, pour le tableau de bord d'un élève Plan Box natif
  // (les élèves Repetibox le reçoivent par /api/eleve/chargement).
  if (new URL(req.url).searchParams.get("actif")) {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ erreur: "Non authentifié" }, { status: 401 });
    return NextResponse.json({ actif: await rallyeActif(createAdminClient()) });
  }
  const s = await eleveDeLaSession();
  if (s.erreur) return s.erreur;
  try {
    return NextResponse.json(await etat(s.admin, s.eleve));
  } catch (err) {
    console.error("[rallye] GET", err);
    return NextResponse.json({ erreur: "Lecture impossible" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const s = await eleveDeLaSession();
  if (s.erreur) return s.erreur;
  const { admin, eleve } = s;
  const body = await req.json().catch(() => ({}));

  try {
    const courant = await etat(admin, eleve);
    if (!courant.actif) return NextResponse.json({ erreur: "Le rallye est fermé." }, { status: 403 });

    if (body?.action === "choisir") {
      const numero = Number(body.fiche);
      if (courant.phase !== "choix") {
        return NextResponse.json({ erreur: "Tu ne peux pas choisir un autre podcast maintenant.", etat: courant }, { status: 409 });
      }
      if (!courant.propositions.some((p) => p.numero === numero)) {
        return NextResponse.json({ erreur: "Ce podcast ne fait pas partie de tes propositions.", etat: courant }, { status: 400 });
      }
      const [col, val] = filtreEleveRallye(eleve);
      const f = fiche(numero)!;
      const { error } = await admin.from("rallye_partie").insert({
        [col]: val, prenom: eleve.prenom, nom: eleve.nom, fiche: numero, date: dateDuJour(),
        reponses: f.questions.map(() => null), score: 0, total: f.questions.length,
      });
      // 23505 : déjà choisi (double clic) — l'état relu dira lequel.
      if (error && error.code !== "23505") throw new Error(error.message);
      return NextResponse.json(await etat(admin, eleve));
    }

    if (body?.action === "repondre") {
      const i = Number(body.question);
      const choix = Number(body.choix);
      const parties = await partiesDeLEleve(admin, eleve);
      const partie = parties.find((p) => !p.termine && fiche(p.fiche));
      if (!partie) return NextResponse.json({ erreur: "Aucun podcast en cours.", etat: courant }, { status: 409 });
      const f = fiche(partie.fiche)!;
      const q = f.questions[i];
      if (!q || !Number.isInteger(choix) || choix < 0 || choix >= q.options.length) {
        return NextResponse.json({ erreur: "Réponse invalide." }, { status: 400 });
      }
      const reponses = f.questions.map((_, k) => (typeof partie.reponses[k] === "number" ? partie.reponses[k] : null));
      // Une réponse donnée ne se change pas : on renvoie simplement sa correction.
      if (reponses[i] === null) {
        reponses[i] = choix;
        const score = scorePartie(f, reponses);
        const termine = reponses.every((r) => r !== null);
        const { error } = await admin.from("rallye_partie").update({
          reponses, score, termine, ...(termine ? { termine_le: new Date().toISOString() } : {}),
        }).eq("id", partie.id).eq("termine", false);
        if (error) throw new Error(error.message);
      }
      const choisie = reponses[i] as number;
      return NextResponse.json({
        bonne: estBonne(q, choisie),
        choix: choisie,
        bonnes: q.bonnes,
        etat: await etat(admin, eleve),
      });
    }

    return NextResponse.json({ erreur: "Action inconnue" }, { status: 400 });
  } catch (err) {
    console.error("[rallye] POST", err);
    return NextResponse.json({ erreur: "Enregistrement impossible" }, { status: 500 });
  }
}
