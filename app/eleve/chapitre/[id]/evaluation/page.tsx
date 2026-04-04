"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useEleveSession } from "@/hooks/useEleveSession";

interface Exercice {
  id: string;
  titre: string;
  type: string;
  contenu: Record<string, unknown>;
  ordre: number;
}

interface QuestionEval {
  enonce: string;
  reponse: string;
  indice?: string;
  options?: string[];
  reponseIdx?: number;
  exerciceId: string;
  exerciceTitre: string;
}

type Etat = "chargement" | "en_cours" | "resultat";

export default function PageEvaluationFinale() {
  const { id: chapitreId } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, chargement: chargementSession } = useEleveSession();

  const [chapitreTitre, setChapitreTitre] = useState("");
  const [seuilEval, setSeuilEval] = useState(90);
  const [etat, setEtat] = useState<Etat>("chargement");

  const [questions, setQuestions] = useState<QuestionEval[]>([]);
  const [indexCourant, setIndexCourant] = useState(0);
  const [reponseEleve, setReponseEleve] = useState("");
  const [qcmChoisi, setQcmChoisi] = useState<number | null>(null);
  const [resultats, setResultats] = useState<Array<{ correct: boolean; exerciceId: string }>>([]);
  const [afficherCorrection, setAfficherCorrection] = useState(false);

  const [score, setScore] = useState(0);
  const [reussi, setReussi] = useState(false);
  const [exercicesEchoues, setExercicesEchoues] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

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
      const [chapRes, exoRes] = await Promise.all([
        fetch(`/api/admin/chapitres/${chapitreId}`, { signal }).then((r) => r.json()),
        fetch(`/api/chapitres/exercices?chapitre_id=${chapitreId}`, { signal }).then((r) => r.json()),
      ]);

      if (signal.aborted) return;

      if (chapRes.chapitre) {
        setChapitreTitre(chapRes.chapitre.titre);
        setSeuilEval(chapRes.chapitre.seuil_evaluation ?? 90);
      }

      const exercices: Exercice[] = exoRes.exercices ?? [];
      if (exercices.length === 0) {
        router.push(`/eleve/chapitre/${chapitreId}`);
        return;
      }

      // Extraire des questions de chaque exercice (2-3 par exercice, mélangées)
      const allQuestions: QuestionEval[] = [];

      for (const ex of exercices) {
        const qs = extraireQuestions(ex);
        const nbAPrendre = Math.min(3, Math.max(2, qs.length));
        const melangees = melanger(qs);
        allQuestions.push(...melangees.slice(0, nbAPrendre));
      }

      setQuestions(melanger(allQuestions));
      setEtat("en_cours");
    } catch (err) {
      if (signal.aborted) return;
      console.error("[charger evaluation]", err);
      router.push(`/eleve/chapitre/${chapitreId}`);
    }
  }

  function extraireQuestions(ex: Exercice): QuestionEval[] {
    const qs: QuestionEval[] = [];
    const contenu = ex.contenu;

    if (ex.type === "exercice" && Array.isArray(contenu.questions)) {
      for (const q of contenu.questions as Array<{ enonce: string; reponse_attendue: string; indice?: string }>) {
        qs.push({ enonce: q.enonce, reponse: q.reponse_attendue, indice: q.indice, exerciceId: ex.id, exerciceTitre: ex.titre });
      }
    } else if (ex.type === "qcm" && Array.isArray(contenu.questions)) {
      for (const q of contenu.questions as Array<{ question: string; options: string[]; reponse_correcte: number; explication?: string }>) {
        qs.push({
          enonce: q.question, reponse: q.options[q.reponse_correcte],
          options: q.options, reponseIdx: q.reponse_correcte,
          exerciceId: ex.id, exerciceTitre: ex.titre,
        });
      }
    } else if (ex.type === "calcul_mental" && Array.isArray(contenu.calculs)) {
      for (const c of contenu.calculs as Array<{ enonce: string; reponse: string }>) {
        qs.push({ enonce: c.enonce, reponse: String(c.reponse), exerciceId: ex.id, exerciceTitre: ex.titre });
      }
    } else if (ex.type === "texte_a_trous" && Array.isArray(contenu.trous)) {
      for (const t of contenu.trous as Array<{ mot: string; indice?: string }>) {
        qs.push({ enonce: `Quel mot manque ?${t.indice ? ` (indice : ${t.indice})` : ""}`, reponse: t.mot, exerciceId: ex.id, exerciceTitre: ex.titre });
      }
    } else if (ex.type === "classement" && Array.isArray(contenu.items)) {
      const cats = (contenu.categories as string[]) ?? [];
      for (const item of contenu.items as Array<{ texte: string; categorie: string }>) {
        qs.push({
          enonce: `Dans quelle catégorie : "${item.texte}" ?`,
          reponse: item.categorie, options: cats, reponseIdx: cats.indexOf(item.categorie),
          exerciceId: ex.id, exerciceTitre: ex.titre,
        });
      }
    } else if (ex.type === "analyse_phrase" && Array.isArray(contenu.phrases)) {
      for (const phrase of contenu.phrases as Array<{ texte: string; groupes: Array<{ mots: string; fonction: string }> }>) {
        for (const g of phrase.groupes) {
          qs.push({
            enonce: `Dans la phrase « ${phrase.texte} », quelle est la fonction de « ${g.mots} » ?`,
            reponse: g.fonction,
            exerciceId: ex.id, exerciceTitre: ex.titre,
          });
        }
      }
    }
    // ecriture_contrainte : pas de questions extraites — exercice validé par l'IA directement

    return qs;
  }

  function melanger<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const normaliser = (s: string) =>
    s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

  const verifierReponse = useCallback(() => {
    const q = questions[indexCourant];
    if (!q) return;

    let correct = false;
    if (q.options && qcmChoisi !== null) {
      correct = qcmChoisi === q.reponseIdx;
    } else {
      correct = normaliser(reponseEleve) === normaliser(q.reponse);
    }

    setResultats((prev) => [...prev, { correct, exerciceId: q.exerciceId }]);
    setAfficherCorrection(true);
  }, [indexCourant, questions, reponseEleve, qcmChoisi]);

  function passerSuivant() {
    setAfficherCorrection(false);
    setReponseEleve("");
    setQcmChoisi(null);

    if (indexCourant + 1 >= questions.length) {
      // Fin de l'évaluation
      const bonnes = resultats.filter((r) => r.correct).length;
      const total = questions.length;
      const pct = Math.round((bonnes / total) * 100);

      setScore(bonnes);
      setReussi(pct >= seuilEval);

      // Exercices échoués (IDs uniques des exercices où l'élève a fait des erreurs)
      const echecs = new Set<string>();
      for (const r of resultats) {
        if (!r.correct) echecs.add(r.exerciceId);
      }
      const echecsArr = Array.from(echecs);
      setExercicesEchoues(echecsArr);

      setEtat("resultat");

      // Sauvegarder le résultat de l'évaluation
      fetch("/api/chapitres/evaluation-resultat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapitre_id: chapitreId,
          eleve_id: session?.source === "planbox" ? session.id : undefined,
          rb_eleve_id: session?.source === "repetibox" ? parseInt(session.id, 10) : undefined,
          score: bonnes,
          total,
          exercices_echoues: echecsArr,
        }),
      }).catch(() => {});
    } else {
      setIndexCourant((prev) => prev + 1);
    }
  }

  // ── Rendu ──────────────────────────────────────────────────────────────

  if (etat === "chargement") {
    return (
      <div style={{ maxWidth: 500, margin: "60px auto", padding: "0 20px", textAlign: "center" }}>
        <div className="skeleton" style={{ height: 200, borderRadius: 20 }} />
      </div>
    );
  }

  if (etat === "resultat") {
    const pct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

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
            {score}/{questions.length} ({pct}%)
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
                const q = questions.find((q) => q.exerciceId === exId);
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
                    {q?.exerciceTitre ?? "Exercice"}
                  </Link>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              onClick={() => router.push(`/eleve/chapitre/${chapitreId}`)}
              style={{
                padding: "12px 24px", borderRadius: 12, fontSize: 15, fontWeight: 700,
                background: reussi ? "#22C55E" : "var(--pb-primary)",
                color: "white", border: "none", cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              {reussi ? "🏆 Retour au chapitre" : "← Retour au parcours"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── En cours ──────────────────────────────────────────────────────────

  const q = questions[indexCourant];
  if (!q) return null;

  const isQCM = q.options && q.options.length > 0;
  const progression = ((indexCourant) / questions.length) * 100;

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: "20px 20px 80px" }}>
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
            {indexCourant + 1}/{questions.length}
          </span>
        </div>

        {/* Dots de progression */}
        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {questions.map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: "50%",
              background: i < resultats.length
                ? resultats[i].correct ? "#22C55E" : "#EF4444"
                : i === indexCourant ? "#DC2626" : "var(--pb-outline-variant, #ddd)",
              transition: "background 0.3s",
            }} />
          ))}
        </div>
      </div>

      {/* Question */}
      <div style={{
        padding: "28px 24px", borderRadius: 20,
        background: "white", border: "2px solid rgba(220,38,38,0.15)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
      }}>
        <p style={{
          fontSize: 17, fontWeight: 700, marginBottom: 20, lineHeight: 1.5,
          color: "var(--pb-on-surface)", fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>
          {q.enonce}
        </p>

        {isQCM ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {q.options!.map((opt, i) => {
              let bg = "var(--pb-surface-container, #f5f5f5)";
              let border = "1.5px solid var(--pb-outline-variant, #e0e0e0)";
              let color = "var(--pb-on-surface)";

              if (afficherCorrection) {
                if (i === q.reponseIdx) {
                  bg = "#DCFCE7"; border = "1.5px solid #22C55E"; color = "#166534";
                } else if (i === qcmChoisi && i !== q.reponseIdx) {
                  bg = "#FEE2E2"; border = "1.5px solid #EF4444"; color = "#991B1B";
                }
              } else if (i === qcmChoisi) {
                bg = "rgba(220,38,38,0.08)"; border = "1.5px solid #DC2626"; color = "#DC2626";
              }

              return (
                <button
                  key={i}
                  onClick={() => !afficherCorrection && setQcmChoisi(i)}
                  disabled={afficherCorrection}
                  style={{
                    padding: "12px 16px", borderRadius: 12, textAlign: "left",
                    background: bg, border, color, fontSize: 15, fontWeight: 600,
                    cursor: afficherCorrection ? "default" : "pointer",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    transition: "all 0.2s",
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        ) : (
          <div>
            <input
              type="text"
              value={reponseEleve}
              onChange={(e) => setReponseEleve(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !afficherCorrection && reponseEleve.trim()) verifierReponse(); }}
              disabled={afficherCorrection}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Ta réponse…"
              autoFocus
              style={{
                width: "100%", padding: "14px 16px", borderRadius: 12,
                border: afficherCorrection
                  ? resultats[indexCourant]?.correct
                    ? "2px solid #22C55E"
                    : "2px solid #EF4444"
                  : "2px solid var(--pb-outline-variant, #ddd)",
                fontSize: 16, fontWeight: 600,
                background: afficherCorrection
                  ? resultats[indexCourant]?.correct ? "#F0FDF4" : "#FEF2F2"
                  : "white",
                outline: "none", boxSizing: "border-box",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            />
            {afficherCorrection && !resultats[indexCourant]?.correct && (
              <p style={{ fontSize: 13, color: "#22C55E", fontWeight: 600, marginTop: 8 }}>
                Réponse correcte : {q.reponse}
              </p>
            )}
          </div>
        )}

        {/* Bouton valider / suivant */}
        <div style={{ marginTop: 20 }}>
          {!afficherCorrection ? (
            <button
              onClick={verifierReponse}
              disabled={isQCM ? qcmChoisi === null : !reponseEleve.trim()}
              style={{
                width: "100%", padding: "14px", borderRadius: 12,
                background: (isQCM ? qcmChoisi !== null : reponseEleve.trim()) ? "#DC2626" : "#ccc",
                color: "white", border: "none", fontSize: 15, fontWeight: 700,
                cursor: (isQCM ? qcmChoisi !== null : reponseEleve.trim()) ? "pointer" : "default",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Valider
            </button>
          ) : (
            <button
              onClick={passerSuivant}
              style={{
                width: "100%", padding: "14px", borderRadius: 12,
                background: resultats[resultats.length - 1]?.correct ? "#22C55E" : "#F87171",
                color: "white", border: "none", fontSize: 15, fontWeight: 700,
                cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              {indexCourant + 1 >= questions.length ? "Voir le résultat" : "Suivant →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
