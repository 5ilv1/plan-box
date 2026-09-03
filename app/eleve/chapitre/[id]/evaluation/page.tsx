"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useEleveSession } from "@/hooks/useEleveSession";
import TexteATrousEleve from "@/components/TexteATrousEleve";
import { resoudrePositionsTrous } from "@/lib/texte-a-trous";
import ClassementEleve from "@/components/ClassementEleve";
import ExerciceStack from "@/components/ExerciceStack";
import DroiteGraduee, { type Droite } from "@/components/DroiteGraduee";
import FigureGeo, { type Figure } from "@/components/FigureGeo";
import { useReprise } from "@/hooks/useReprise";
import { cleEvaluation, empreinte } from "@/lib/reprise";
import AnalysePhraseEleve from "@/components/AnalysePhraseEleve";
import CalcMentalStack from "@/components/CalcMentalStack";
import { FonctionGram, QCMQuestion } from "@/types";
import ProblemeMathsEleve from "@/components/ProblemeMathsEleve";
import type { ProblemeMaths } from "@/types";

// ── Types ──────────────────────────────────────────────────────────────

interface Exercice {
  id: string;
  titre: string;
  type: string;
  contenu: Record<string, unknown>;
  ordre: number;
}

interface MiniExercice {
  id: string;            // exercice original ID
  titre: string;
  type: string;
  contenu: Record<string, unknown>; // contenu réduit (sous-ensemble)
}

interface ScoreExo {
  exerciceId: string;
  bon: number;
  total: number;
}

type Etat = "chargement" | "en_cours" | "resultat";

// ── Helpers ──────────────────────────────────────────────────────────────

function melanger<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Prend n éléments aléatoires d'un tableau */
/**
 * Plafonds de composition de l'évaluation. Aucune évaluation de ceinture ne
 * doit dépasser 20 questions — mesuré par docs/ceintures/test-longueur-evaluations.mjs.
 *
 * `texte_a_trous` n'a délibérément PAS de plafond : y prélever déplace les
 * homophones sur le mauvais mot (docs/ceintures/CORRECTIF-piocher.md). Sa
 * réduction s'est faite dans la banque, en passant six textes de 5 à 4 trous.
 */
const MAX_CLASSEMENT = 4;
const MAX_GROUPES_ANALYSE = 4;

function piocher<T>(arr: T[], n: number): T[] {
  return melanger(arr).slice(0, n);
}

/** Crée des mini-exercices à partir des exercices du chapitre */
function creerMiniExercices(exercices: Exercice[]): MiniExercice[] {
  const minis: MiniExercice[] = [];

  for (const ex of exercices) {
    const c = ex.contenu;

    switch (ex.type) {
      case "texte_a_trous": {
        const trous = (c.trous as Array<{ position: number; mot: string; indice?: string }>) ?? [];
        if (trous.length === 0) break;
        // Tous les trous sont conservés : la pose des trous se cale sur le premier
        // emplacement libre (accents ignorés), donc prélever ou réordonner la liste
        // fait glisser les homophones (a/à, et/est…) sur le mauvais mot.
        // L'exercice étant validé en tout ou rien, garder les 5 trous au lieu de 4
        // ne change pas sa difficulté. Voir docs/ceintures/CORRECTIF-piocher.md.
        const trousChoisis = trous;
        minis.push({
          id: ex.id,
          titre: ex.titre,
          type: "texte_a_trous",
          contenu: {
            ...c,
            // Même résolution qu'à l'entraînement : sans elle, les trous se
            // posent sur les premiers mots du texte au lieu des bons.
            // Les indices sont retirés, comme pour les types « exercice » et
            // « qcm » : ils donnaient la méthode le jour de l'évaluation, et
            // leur longueur disloquait la mise en page du texte.
            trous: resoudrePositionsTrous((c.texte_complet as string) ?? "", trousChoisis)
              .map(({ indice, ...reste }) => { void indice; return reste; }),
          },
        });
        break;
      }

      case "classement": {
        // 4 items, mais tirés de façon ÉQUILIBRÉE : un par catégorie d'abord,
        // le reste au hasard. Un simple piocher() laissait une catégorie sans
        // aucun item dans 38 % des tirages — jusqu'à 85 % sur les exercices à
        // 4 catégories (C34, M30, P18) — et l'exercice y perdait son sens.
        // La banque n'a jamais plus de 4 catégories, toutes pourvues : les
        // représenter toutes est donc toujours possible.
        const items = (c.items as Array<{ texte: string; categorie: string }>) ?? [];
        if (items.length === 0) break;

        const parCategorie = new Map<string, typeof items>();
        for (const item of items) {
          const liste = parCategorie.get(item.categorie) ?? [];
          liste.push(item);
          parCategorie.set(item.categorie, liste);
        }

        const retenus: typeof items = [];
        for (const liste of parCategorie.values()) {
          const [premier] = piocher(liste, 1);
          if (premier) retenus.push(premier);
        }
        const reste = items.filter((i) => !retenus.includes(i));
        retenus.push(...piocher(reste, Math.max(0, MAX_CLASSEMENT - retenus.length)));

        // Mélangé pour que l'ordre ne trahisse pas les catégories.
        const itemsChoisis = piocher(retenus, retenus.length);
        minis.push({
          id: ex.id,
          titre: ex.titre,
          type: "classement",
          contenu: {
            ...c,
            items: itemsChoisis,
          },
        });
        break;
      }

      case "qcm": {
        // Prendre 3 questions du QCM
        const questions = (c.questions as QuestionQCM[]) ?? [];
        if (questions.length === 0) break;
        const qChoisis = piocher(questions, Math.min(3, questions.length));
        // Retirer les explications en évaluation
        const qSansExplication = qChoisis.map(({ explication, ...rest }) => rest);
        minis.push({
          id: ex.id,
          titre: ex.titre,
          type: "qcm",
          contenu: { ...c, questions: qSansExplication },
        });
        break;
      }

      case "exercice": {
        // Prendre 2-3 questions
        const questions = (c.questions as Array<{ id: number; enonce: string; reponse_attendue: string; indice?: string }>) ?? [];
        if (questions.length === 0) break;
        const qChoisis = piocher(questions, Math.min(3, questions.length));
        // Retirer les indices en évaluation
        const qSansIndice = qChoisis.map(({ indice, ...rest }) => rest);
        minis.push({
          id: ex.id,
          titre: ex.titre,
          type: "exercice",
          contenu: { ...c, questions: qSansIndice },
        });
        break;
      }

      case "probleme_maths": {
        // Sur le modèle d'« exercice » : 2 problèmes, sans leur indice.
        // Seul type auto-corrigeable parmi ceux qui étaient ignorés ici — son
        // absence laissait trois évaluations de maths à 6 questions, où une
        // seule erreur coûtait la ceinture.
        const problemes = (c.problemes as Array<Record<string, unknown>>) ?? [];
        if (problemes.length === 0) break;
        const pChoisis = piocher(problemes, Math.min(2, problemes.length));
        // On garde resultat_attendu, phrase_reponse_attendue et mots_cles :
        // c'est ce dont ProblemeMathsEleve a besoin pour corriger seul.
        const pSansIndice = pChoisis.map(({ indice, ...reste }) => { void indice; return reste; });
        minis.push({
          id: ex.id,
          titre: ex.titre,
          type: "probleme_maths",
          contenu: { ...c, problemes: pSansIndice },
        });
        break;
      }

      case "calcul_mental": {
        // Prendre 3-4 calculs
        const calculs = (c.calculs as Array<{ id: number; enonce: string; reponse: string }>) ?? [];
        if (calculs.length === 0) break;
        const cChoisis = piocher(calculs, Math.min(4, calculs.length));
        minis.push({
          id: ex.id,
          titre: ex.titre,
          type: "calcul_mental",
          contenu: { ...c, calculs: cChoisis },
        });
        break;
      }

      case "analyse_phrase": {
        // Plafonner par GROUPES et non par phrases : une phrase en porte de 2
        // à 8, donc « 2 phrases » coûtait de 4 à 16 questions. On prend des
        // phrases ENTIÈRES, dans l'ordre, tant que le total des groupes tient
        // sous le plafond — et au moins une, même si elle le dépasse à elle
        // seule. Une phrase tronquée n'aurait pas de sens à analyser.
        const phrases = (c.phrases as Array<{ texte: string; groupes: Array<{ mots: string; fonction: string; debut: number; fin: number }> }>) ?? [];
        if (phrases.length === 0) break;

        const pChoisis: typeof phrases = [];
        let groupesRetenus = 0;
        for (const phrase of phrases) {
          const cout = phrase.groupes?.length ?? 0;
          if (pChoisis.length > 0 && groupesRetenus + cout > MAX_GROUPES_ANALYSE) break;
          pChoisis.push(phrase);
          groupesRetenus += cout;
        }
        minis.push({
          id: ex.id,
          titre: ex.titre,
          type: "analyse_phrase",
          contenu: { ...c, phrases: pChoisis },
        });
        break;
      }

      // ecriture_contrainte : pas évaluable automatiquement, on skip
      default:
        break;
    }
  }

  // L'ordre n'est PAS tiré ici : il dépend d'une éventuelle reprise, qui n'est
  // pas encore connue à ce stade. Le mélange se fait à l'appel, une fois que
  // l'on sait si l'élève reprend une évaluation interrompue.
  return minis;
}

// ── QCM interne (sans appels API plan de travail) ──────────────────────

/**
 * Une question de QCM de ceinture : le QCM des podcasts ne connaît pas les
 * dessins, ceux des ceintures en posent. Même convention que QCMEleve et
 * ExerciceStack — la droite au-dessus de l'énoncé, la figure en dessous.
 */
type QuestionQCM = QCMQuestion & { droite?: Droite; figure?: Figure };

function MiniQCM({ questions, onTermine }: {
  questions: QuestionQCM[];
  onTermine: (score: { bon: number; total: number }) => void;
}) {
  const [index, setIndex] = useState(0);
  const [choisi, setChoisi] = useState<number | null>(null);
  const [feedback, setFeedback] = useState(false);
  const [bon, setBon] = useState(0);

  const q = questions[index];
  if (!q) return null;

  function valider() {
    if (choisi === null) return;
    const correct = choisi === q.reponse_correcte;
    if (correct) setBon((b) => b + 1);
    setFeedback(true);
  }

  function suivant() {
    setFeedback(false);
    setChoisi(null);
    if (index + 1 >= questions.length) {
      const finalBon = bon + (choisi === q.reponse_correcte ? 0 : 0); // bon already updated
      onTermine({ bon, total: questions.length });
    } else {
      setIndex((i) => i + 1);
    }
  }

  return (
    <div style={{
      background: "white", borderRadius: "1.5rem", padding: "2rem 1.5rem",
      border: `1px solid ${feedback ? (choisi === q.reponse_correcte ? "var(--accent, #16A34A)" : "#E53E3E") : "var(--border-light, #E2E8F0)"}`,
      boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
      display: "flex", flexDirection: "column", gap: "1.5rem",
      transition: "border-color 0.2s ease",
    }}>
      {/* Droite graduée, quand la question en déclare une */}
      {q.droite && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <DroiteGraduee droite={q.droite} />
        </div>
      )}

      {/* Question */}
      <div style={{
        textAlign: "center", padding: "1.25rem 1rem", borderRadius: "1rem",
        background: "#F7F8FA", minHeight: 80,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <p style={{
          fontSize: "1.25rem", fontWeight: 600, color: "var(--text-primary, #1A202C)",
          lineHeight: 1.4, margin: 0,
        }}>
          {q.question}
        </p>
      </div>

      {/* Figure : l'énoncé y renvoie (« Quelle est cette figure ? ») */}
      {q.figure && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <FigureGeo figure={q.figure} />
        </div>
      )}

      <div style={{ height: 1, background: "var(--border-light, #E2E8F0)" }} />

      {/* Grille 2×2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
        {q.options.map((opt, i) => {
          let bg = "white";
          let borderColor = "var(--border, #E2E8F0)";
          let textColor = "var(--text-primary, #1A202C)";

          if (!feedback && i === choisi) {
            borderColor = "#3B82F6"; bg = "#EFF6FF"; textColor = "#1D4ED8";
          } else if (feedback) {
            if (i === q.reponse_correcte) {
              borderColor = "var(--accent, #16A34A)"; bg = "#F0FAF5"; textColor = "var(--accent, #16A34A)";
            } else if (i === choisi && i !== q.reponse_correcte) {
              borderColor = "#E53E3E"; bg = "#FFF5F5"; textColor = "#E53E3E";
            }
          }

          return (
            <button
              key={i}
              onClick={() => !feedback && setChoisi(i)}
              disabled={feedback}
              style={{
                backgroundColor: bg, border: `1px solid ${borderColor}`, borderRadius: "0.875rem",
                padding: "1rem 1.25rem", fontSize: "0.9375rem", fontWeight: 500,
                color: textColor, cursor: feedback ? "default" : "pointer",
                textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s ease", fontFamily: "inherit",
              }}
            >
              {opt}
              {feedback && i === q.reponse_correcte && <span style={{ marginLeft: "0.5rem" }}>✓</span>}
              {feedback && i === choisi && i !== q.reponse_correcte && <span style={{ marginLeft: "0.5rem" }}>✗</span>}
            </button>
          );
        })}
      </div>

      {/* Bouton Valider / Suivant */}
      {!feedback ? (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            onClick={valider}
            disabled={choisi === null}
            style={{
              width: "auto", padding: "0.875rem 2.5rem", borderRadius: 999,
              background: "var(--pb-primary, #0050D4)", color: "white", border: "none",
              fontSize: 15, fontWeight: 700, opacity: choisi !== null ? 1 : 0.5,
              cursor: choisi !== null ? "pointer" : "not-allowed",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            ✓ Valider ma réponse
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            onClick={suivant}
            style={{
              width: "auto", padding: "0.875rem 2.5rem", borderRadius: 999,
              background: choisi === q.reponse_correcte ? "#16A34A" : "#DC2626",
              color: "white", border: "none", fontSize: 15, fontWeight: 700,
              cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            {index + 1 >= questions.length ? "Terminer ✅" : "Suivant →"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Composant principal ──────────────────────────────────────────────────

export default function PageEvaluationFinale() {
  const { id: chapitreId } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, chargement: chargementSession } = useEleveSession();

  const [chapitreTitre, setChapitreTitre] = useState("");
  const [seuilEval, setSeuilEval] = useState(90);
  const [etat, setEtat] = useState<Etat>("chargement");

  // `minisBruts` est la liste dans l'ordre des exercices du chapitre : c'est
  // sur elle que porte `ordre`. `minis` est ce que l'élève enchaîne.
  const [minisBruts, setMinisBruts] = useState<MiniExercice[] | null>(null);
  const [empreinteEval, setEmpreinteEval] = useState<string | null>(null);
  const [minis, setMinis] = useState<MiniExercice[]>([]);
  const [indexCourant, setIndexCourant] = useState(0);
  const [scores, setScores] = useState<ScoreExo[]>([]);
  // Vrai quand l'évaluation a été REPRISE : l'élève doit savoir pourquoi il ne
  // commence pas au premier exercice.
  const [repriseEval, setRepriseEval] = useState(false);
  // L'ordre effectivement servi : il fait partie de la reprise, sinon un index
  // enregistré ne désignerait aucun exercice au retour.
  const [ordreEval, setOrdreEval] = useState<number[]>([]);

  const [reussi, setReussi] = useState(false);
  const [exercicesEchoues, setExercicesEchoues] = useState<string[]>([]);
  // Les chapitres-ceintures ont leur propre écran de fin : le passage à la
  // couleur suivante. Voir /eleve/ceintures/reussite/[chapitreId].
  const [estCeinture, setEstCeinture] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Reprise : une évaluation de vingt questions perdue sur une batterie à plat
  // coûte cher. Elle reprend à la frontière du mini-exercice — les exercices
  // déjà notés gardent leur score, celui qui était en cours recommence.
  const { etatRepris, pret: reprisePrete, sauver, effacer } = useReprise({
    cle: empreinteEval ? cleEvaluation(chapitreId) : null,
    empreinte: empreinteEval,
    session,
  });

  useEffect(() => {
    if (chargementSession) return;
    if (!session) { router.push("/eleve"); return; }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    charger(ctrl.signal);

    return () => { ctrl.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargementSession, session, chapitreId]);

  async function charger(signal: AbortSignal) {
    try {
      // L'évaluation doit porter sur la variante que l'élève a travaillée.
      const paramEleve = session?.source === "planbox" ? `eleve_id=${session.id}` : `rb_eleve_id=${session?.id}`;
      const [chapRes, exoRes] = await Promise.all([
        fetch(`/api/admin/chapitres/${chapitreId}`, { signal }).then((r) => r.json()),
        fetch(`/api/chapitres/exercices?chapitre_id=${chapitreId}&${paramEleve}`, { signal }).then((r) => r.json()),
      ]);

      if (signal.aborted) return;

      if (chapRes.chapitre) {
        setChapitreTitre(chapRes.chapitre.titre);
        setSeuilEval(chapRes.chapitre.seuil_evaluation ?? 90);
        setEstCeinture(String(chapRes.chapitre.sous_matiere ?? "").startsWith("ceinture-"));
      }

      const exercices: Exercice[] = exoRes.exercices ?? [];
      if (exercices.length === 0) {
        router.push(`/eleve/chapitre/${chapitreId}`);
        return;
      }

      const miniExercices = creerMiniExercices(exercices);
      if (miniExercices.length === 0) {
        // Aucun exercice évaluable (type lecture, révision…) → valider automatiquement
        await fetch("/api/chapitres/evaluation-resultat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chapitre_id: chapitreId,
            eleve_id: session?.source === "planbox" ? session.id : undefined,
            rb_eleve_id: session?.source === "repetibox" ? parseInt(session.id, 10) : undefined,
            score: 1,
            total: 1,
          }),
        });
        setReussi(true);
        setEtat("resultat");
        return;
      }

      // L'empreinte porte sur la STRUCTURE de l'évaluation — quels exercices,
      // dans quel ordre — et non sur les questions tirées, qui changent à
      // chaque passage par construction. Un exercice ajouté ou retiré par
      // l'enseignant annule donc la reprise, à juste titre.
      setMinisBruts(miniExercices);
      setEmpreinteEval(empreinte(chapitreId, miniExercices.map((m) => `${m.id}:${m.type}`)));
    } catch (err) {
      if (signal.aborted) return;
      console.error("[charger evaluation]", err);
      router.push(`/eleve/chapitre/${chapitreId}`);
    }
  }

  // L'ordre des mini-exercices se décide ICI, une fois la reprise connue :
  // avant, un index ne désignerait pas le même exercice d'un passage à l'autre.
  useEffect(() => {
    if (!minisBruts || !reprisePrete) return;

    const repris = etatRepris?.ordre as number[] | undefined;
    const faits = (etatRepris?.scores as ScoreExo[] | undefined) ?? [];
    const ordreValide = Array.isArray(repris)
      && repris.length === minisBruts.length
      && repris.every((i) => Number.isInteger(i) && i >= 0 && i < minisBruts.length)
      && new Set(repris).size === repris.length;
    // Une reprise ne vaut que si ses scores portent sur les exercices attendus.
    const scoresValides = ordreValide
      && faits.length < minisBruts.length
      && faits.every((sc, i) => sc && sc.exerciceId === minisBruts[repris![i]].id);

    const ordre = ordreValide && scoresValides
      ? repris!
      : melanger(minisBruts.map((_, i) => i));

    setOrdreEval(ordre);
    setMinis(ordre.map((i) => minisBruts[i]));

    if (scoresValides && faits.length > 0) {
      setScores(faits);
      setIndexCourant(faits.length);
      setRepriseEval(true);
    }

    setEtat("en_cours");
  }, [minisBruts, reprisePrete, etatRepris]);

  // ── Callback quand un mini-exercice est terminé ──────────────────────

  function onMiniTermine(exerciceId: string, bon: number, total: number) {
    const newScores = [...scores, { exerciceId, bon, total }];
    setScores(newScores);
    setRepriseEval(false);

    if (indexCourant + 1 >= minis.length) {
      // Fin de l'évaluation — il n'y a plus rien à reprendre.
      void effacer();
      terminerEvaluation(newScores);
    } else {
      // Reprise : l'exercice qui vient d'être noté est acquis, on l'enregistre
      // avant de passer au suivant.
      if (empreinteEval) {
        sauver({ empreinte: empreinteEval, ordre: ordreEval, scores: newScores });
      }
      setIndexCourant((i) => i + 1);
    }
  }

  function terminerEvaluation(allScores: ScoreExo[]) {
    const totalBon = allScores.reduce((s, sc) => s + sc.bon, 0);
    const totalQ = allScores.reduce((s, sc) => s + sc.total, 0);
    const pct = totalQ > 0 ? Math.round((totalBon / totalQ) * 100) : 0;
    const aReussi = pct >= seuilEval;

    setReussi(aReussi);

    // Exercices échoués = ceux avec au moins une erreur
    const echecs = allScores
      .filter((sc) => sc.bon < sc.total)
      .map((sc) => sc.exerciceId);
    const echecsUniques = Array.from(new Set(echecs));
    setExercicesEchoues(echecsUniques);

    setEtat("resultat");

    // Sauvegarder
    const enregistrement = fetch("/api/chapitres/evaluation-resultat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapitre_id: chapitreId,
        eleve_id: session?.source === "planbox" ? session.id : undefined,
        rb_eleve_id: session?.source === "repetibox" ? parseInt(session.id, 10) : undefined,
        score: totalBon,
        total: totalQ,
        exercices_echoues: echecsUniques,
      }),
    }).catch(() => {});

    // Ceinture gagnée : on cède la place à l'écran de passage de couleur.
    // La redirection attend l'enregistrement, sinon cet écran lirait un état
    // de progression pas encore à jour et renverrait l'élève sur l'échelle.
    if (estCeinture && aReussi) {
      enregistrement.finally(() => {
        router.replace(
          `/eleve/ceintures/reussite/${chapitreId}?score=${totalBon}&total=${totalQ}`,
        );
      });
    }
  }

  // ── Rendu ──────────────────────────────────────────────────────────────

  if (etat === "chargement") {
    return (
      <div style={{ maxWidth: 800, margin: "60px auto", padding: "0 20px", textAlign: "center" }}>
        <div className="skeleton" style={{ height: 200, borderRadius: 20 }} />
      </div>
    );
  }

  if (etat === "resultat") {
    const totalBon = scores.reduce((s, sc) => s + sc.bon, 0);
    const totalQ = scores.reduce((s, sc) => s + sc.total, 0);
    const pct = totalQ > 0 ? Math.round((totalBon / totalQ) * 100) : 0;

    return (
      <div style={{ maxWidth: 500, margin: "40px auto", padding: "0 20px", textAlign: "center" }}>
        <div style={{
          padding: "40px 30px", borderRadius: 24,
          background: reussi
            ? "linear-gradient(135deg, #DCFCE7, #F0FDF4)"
            : "linear-gradient(135deg, #FEF2F2, #FFF)",
          border: reussi ? "2px solid #22C55E" : "2px solid #F87171",
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>
            {reussi ? "🏆" : "📖"}
          </div>
          <h2 style={{
            fontSize: 22, fontWeight: 800, marginBottom: 8,
            color: reussi ? "#166534" : "#991B1B",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            {reussi ? "Évaluation réussie !" : "Pas encore…"}
          </h2>
          <p style={{ fontSize: 18, fontWeight: 700, color: "var(--pb-on-surface)", marginBottom: 4 }}>
            {totalBon}/{totalQ} ({pct}%)
          </p>
          <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", marginBottom: 24 }}>
            {reussi
              ? "Bravo ! Tu as validé ce chapitre !"
              : `Il faut ${seuilEval}% pour réussir. Reprends les exercices où tu as eu des erreurs.`}
          </p>

          {!reussi && exercicesEchoues.length > 0 && (
            <div style={{
              textAlign: "left", padding: "16px 18px", borderRadius: 14,
              background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.15)",
              marginBottom: 20,
            }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#DC2626", marginBottom: 8 }}>
                Exercices à reprendre :
              </p>
              {exercicesEchoues.map((exId) => {
                const mini = minis.find((m) => m.id === exId);
                return (
                  <Link
                    key={exId}
                    href={`/eleve/chapitre/${chapitreId}/exercice/${exId}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 12px", marginBottom: 4, borderRadius: 8,
                      background: "white", textDecoration: "none", color: "var(--pb-on-surface)",
                      fontSize: 13, fontWeight: 600,
                    }}
                  >
                    <span className="ms" style={{ fontSize: 16, color: "#DC2626" }}>replay</span>
                    {mini?.titre ?? "Exercice"}
                  </Link>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              onClick={() => router.push(reussi ? "/eleve/dashboard" : `/eleve/chapitre/${chapitreId}`)}
              style={{
                padding: "12px 24px", borderRadius: 12, fontSize: 15, fontWeight: 700,
                background: reussi ? "#22C55E" : "var(--pb-primary)",
                color: "white", border: "none", cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              {reussi ? "🏆 Retour au tableau de bord" : "← Retour au parcours"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── En cours : afficher le mini-exercice courant ──────────────────────

  const mini = minis[indexCourant];
  if (!mini) return null;

  const progression = (indexCourant / minis.length) * 100;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 20px 80px" }}>
      {/* En-tête */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Link
            href={`/eleve/chapitre/${chapitreId}`}
            style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <span className="ms" style={{ fontSize: 18 }}>close</span> Quitter
          </Link>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#DC2626" }}>
            🏆 Évaluation
          </span>
        </div>

        <h1 style={{
          fontSize: 18, fontWeight: 800, margin: "0 0 4px",
          fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)",
        }}>
          {chapitreTitre}
        </h1>
        <p style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", margin: 0 }}>
          Seuil de réussite : {seuilEval}%
        </p>

        {/* Barre de progression */}
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 6, background: "var(--pb-surface-container, #f0f0f0)", borderRadius: 100, overflow: "hidden" }}>
            <div style={{
              width: `${progression}%`, height: "100%",
              background: "#DC2626", borderRadius: 100, transition: "width 0.3s ease",
            }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface)" }}>
            {indexCourant + 1}/{minis.length}
          </span>
        </div>

        {/* Dots de progression */}
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {minis.map((_, i) => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: "50%",
              background: i < scores.length
                ? scores[i].bon === scores[i].total ? "#22C55E" : "#EF4444"
                : i === indexCourant ? "#DC2626" : "var(--pb-outline-variant, #ddd)",
              transition: "background 0.3s",
            }} />
          ))}
        </div>
      </div>

      {repriseEval && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", borderRadius: 12, marginBottom: 12,
          background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.28)",
        }}>
          <span className="ms" style={{ fontSize: 18, color: "#16A34A" }}>history</span>
          <p style={{ fontSize: 14, color: "#166534", margin: 0, lineHeight: 1.5 }}>
            Tu reprends ton évaluation — {scores.length === 1
              ? "le premier exercice est déjà compté"
              : `les ${scores.length} premiers exercices sont déjà comptés`}, tu
            continues à partir d&apos;ici.
          </p>
        </div>
      )}

      {/* Titre du mini-exercice */}
      <p style={{
        fontSize: 14, fontWeight: 700, color: "#DC2626", marginBottom: 12,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        {mini.titre}
      </p>

      {/* Rendu du composant selon le type */}
      <div key={`${mini.id}-${indexCourant}`}>
        {mini.type === "texte_a_trous" && (
          <TexteATrousEleve
            titre={mini.titre}
            consigne={(mini.contenu.consigne as string) ?? "Complète les trous"}
            texteComplet={(mini.contenu.texte_complet as string) ?? ""}
            trous={(mini.contenu.trous as Array<{ position: number; mot: string; indice?: string }>) ?? []}
            onTermine={(score) => onMiniTermine(mini.id, score.bon, score.total)}
          />
        )}

        {mini.type === "classement" && (
          <ClassementEleve
            titre={mini.titre}
            consigne={(mini.contenu.consigne as string) ?? "Classe les éléments"}
            categories={(mini.contenu.categories as string[]) ?? []}
            items={(mini.contenu.items as Array<{ texte: string; categorie: string }>) ?? []}
            onTermine={(score) => onMiniTermine(mini.id, score.bon, score.total)}
          />
        )}

        {mini.type === "exercice" && (
          <ExerciceStack
            consigne={(mini.contenu.consigne as string)}
            questions={(mini.contenu.questions as Array<{ id: number; enonce: string; reponse_attendue: string; indice?: string }>) ?? []}
            onComplete={(_reponses, score, total) => onMiniTermine(mini.id, score, total)}
          />
        )}

        {mini.type === "qcm" && (
          <MiniQCM
            questions={(mini.contenu.questions as QuestionQCM[]) ?? []}
            onTermine={(score) => onMiniTermine(mini.id, score.bon, score.total)}
          />
        )}

        {mini.type === "probleme_maths" && (
          <ProblemeMathsEleve
            titre={mini.titre}
            theme={(mini.contenu.theme as string) ?? ""}
            consigne={(mini.contenu.consigne as string) ?? "Calcule, puis réponds par une phrase complète."}
            problemes={(mini.contenu.problemes as ProblemeMaths[]) ?? []}
            onTermine={(score) => onMiniTermine(mini.id, score.bon, score.total)}
          />
        )}

        {mini.type === "calcul_mental" && (
          <CalcMentalStack
            calculs={(mini.contenu.calculs as Array<{ id: number; enonce: string; reponse: string }>) ?? []}
            onComplete={(score, total) => onMiniTermine(mini.id, score, total)}
          />
        )}

        {mini.type === "analyse_phrase" && (
          <AnalysePhraseEleve
            titre={mini.titre}
            consigne={(mini.contenu.consigne as string) ?? "Analyse les phrases"}
            phrases={(mini.contenu.phrases as Array<{ texte: string; groupes: Array<{ mots: string; fonction: FonctionGram; debut: number; fin: number }> }>) ?? []}
            fonctionsActives={(mini.contenu.fonctionsActives as FonctionGram[]) ?? ["Sujet", "Verbe", "COD", "COI", "CC Lieu", "CC Temps", "CC Manière"]}
            onTermine={(score) => onMiniTermine(mini.id, score.bon, score.total)}
          />
        )}
      </div>
    </div>
  );
}
