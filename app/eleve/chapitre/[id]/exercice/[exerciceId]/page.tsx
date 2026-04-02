"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useEleveSession } from "@/hooks/useEleveSession";

interface Question {
  id: number;
  enonce: string;
  reponse_attendue: string;
  indice?: string;
}

interface QCMQuestion {
  question: string;
  options: string[];
  reponse_correcte: number;
  explication?: string;
}

interface Calcul {
  id: number;
  enonce: string;
  reponse: string;
}

interface Exercice {
  id: string;
  titre: string;
  type: string;
  contenu: Record<string, unknown>;
  nb_questions: number;
  chapitre_id: string;
}

type Etat = "chargement" | "en_cours" | "resultat";

export default function PageExerciceEleve() {
  const { id: chapitreId, exerciceId } = useParams<{ id: string; exerciceId: string }>();
  const router = useRouter();
  const { session, chargement: chargementSession } = useEleveSession();

  const [exercice, setExercice] = useState<Exercice | null>(null);
  const [etat, setEtat] = useState<Etat>("chargement");

  // Questions / réponses
  const [questions, setQuestions] = useState<Array<{ enonce: string; reponse: string; indice?: string; options?: string[]; reponseIdx?: number }>>([]);
  const [indexCourant, setIndexCourant] = useState(0);
  const [reponseEleve, setReponseEleve] = useState("");
  const [qcmChoisi, setQcmChoisi] = useState<number | null>(null);
  const [resultats, setResultats] = useState<boolean[]>([]);
  const [afficherCorrection, setAfficherCorrection] = useState(false);

  // Résultat final
  const [score, setScore] = useState(0);
  const [valide, setValide] = useState(false);
  const [enSauvegarde, setEnSauvegarde] = useState(false);

  useEffect(() => {
    if (chargementSession) return;
    if (!session) { router.push("/eleve"); return; }
    chargerExercice();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargementSession, session]);

  async function chargerExercice() {
    const res = await fetch(`/api/chapitres/exercices?chapitre_id=${chapitreId}`);
    const json = await res.json();
    const exos = json.exercices ?? [];
    const ex = exos.find((e: Exercice) => e.id === exerciceId);

    if (!ex) {
      router.push(`/eleve/chapitre/${chapitreId}`);
      return;
    }

    setExercice(ex);

    // Préparer les questions selon le type
    const qs: typeof questions = [];
    const contenu = ex.contenu;

    if (ex.type === "exercice" && Array.isArray(contenu.questions)) {
      for (const q of contenu.questions as Question[]) {
        qs.push({ enonce: q.enonce, reponse: q.reponse_attendue, indice: q.indice });
      }
    } else if (ex.type === "qcm" && Array.isArray(contenu.questions)) {
      for (const q of contenu.questions as QCMQuestion[]) {
        qs.push({
          enonce: q.question,
          reponse: q.options[q.reponse_correcte],
          options: q.options,
          reponseIdx: q.reponse_correcte,
        });
      }
    } else if (ex.type === "calcul_mental" && Array.isArray(contenu.calculs)) {
      for (const c of contenu.calculs as Calcul[]) {
        qs.push({ enonce: c.enonce, reponse: String(c.reponse) });
      }
    } else if (ex.type === "texte_a_trous" && Array.isArray(contenu.trous)) {
      for (const t of contenu.trous as Array<{ mot: string; indice?: string }>) {
        qs.push({ enonce: `Quel mot manque ?${t.indice ? ` (indice : ${t.indice})` : ""}`, reponse: t.mot });
      }
    } else if (ex.type === "classement" && Array.isArray(contenu.items)) {
      for (const item of contenu.items as Array<{ texte: string; categorie: string }>) {
        const cats = (contenu.categories as string[]) ?? [];
        qs.push({
          enonce: `Dans quelle catégorie : "${item.texte}" ?`,
          reponse: item.categorie,
          options: cats,
          reponseIdx: cats.indexOf(item.categorie),
        });
      }
    } else if (ex.type === "analyse_phrase" && Array.isArray(contenu.phrases)) {
      for (const phrase of contenu.phrases as Array<{ texte: string; groupes: Array<{ mots: string; fonction: string }> }>) {
        for (const g of phrase.groupes) {
          qs.push({
            enonce: `Dans la phrase « ${phrase.texte} », quelle est la fonction de « ${g.mots} » ?`,
            reponse: g.fonction,
          });
        }
      }
    }

    // Mélanger les questions
    for (let i = qs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [qs[i], qs[j]] = [qs[j], qs[i]];
    }

    setQuestions(qs);
    setEtat("en_cours");
  }

  const normaliser = (s: string) => s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

  const verifierReponse = useCallback(() => {
    const q = questions[indexCourant];
    if (!q) return;

    let correct = false;
    if (q.options && qcmChoisi !== null) {
      correct = qcmChoisi === q.reponseIdx;
    } else {
      correct = normaliser(reponseEleve) === normaliser(q.reponse);
    }

    setResultats((prev) => [...prev, correct]);
    setAfficherCorrection(true);
  }, [indexCourant, questions, reponseEleve, qcmChoisi]);

  async function passerSuivant() {
    setAfficherCorrection(false);
    setReponseEleve("");
    setQcmChoisi(null);

    if (indexCourant + 1 >= questions.length) {
      // Fin de l'exercice — calculer le score et sauvegarder
      const bonnes = resultats.filter(Boolean).length;
      const total = questions.length;
      const estValide = bonnes === total; // 100% requis

      setScore(bonnes);
      setValide(estValide);
      setEtat("resultat");

      // Sauvegarder le résultat
      setEnSauvegarde(true);
      await fetch("/api/chapitres/exercices/resultat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exercice_id: exerciceId,
          eleve_id: session?.source === "planbox" ? session.id : undefined,
          rb_eleve_id: session?.source === "repetibox" ? parseInt(session.id, 10) : undefined,
          score: bonnes,
          total,
        }),
      });
      setEnSauvegarde(false);
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
    return (
      <div style={{ maxWidth: 500, margin: "40px auto", padding: "0 20px", textAlign: "center" }}>
        <div style={{
          padding: "40px 30px", borderRadius: 24,
          background: valide
            ? "linear-gradient(135deg, #DCFCE7, #F0FDF4)"
            : "linear-gradient(135deg, #FEF2F2, #FFF)",
          border: valide ? "2px solid #22C55E" : "2px solid #F87171",
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>
            {valide ? "🎉" : "💪"}
          </div>
          <h2 style={{
            fontSize: 22, fontWeight: 800, marginBottom: 8,
            color: valide ? "#166534" : "#991B1B",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            {valide ? "Exercice validé !" : "Pas encore…"}
          </h2>
          <p style={{ fontSize: 16, color: "var(--pb-on-surface-variant)", marginBottom: 4 }}>
            {score}/{questions.length} bonnes réponses
          </p>
          <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", marginBottom: 24 }}>
            {valide
              ? "Tu peux passer à la suite !"
              : "Il faut 100% pour valider. Réessaie !"}
          </p>

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            {!valide && (
              <button
                onClick={() => {
                  // Reset et recommencer
                  setIndexCourant(0);
                  setResultats([]);
                  setReponseEleve("");
                  setQcmChoisi(null);
                  setAfficherCorrection(false);
                  // Re-mélanger
                  const qs = [...questions];
                  for (let i = qs.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [qs[i], qs[j]] = [qs[j], qs[i]];
                  }
                  setQuestions(qs);
                  setEtat("en_cours");
                }}
                style={{
                  padding: "12px 24px", borderRadius: 12, fontSize: 15, fontWeight: 700,
                  background: "#DC2626", color: "white", border: "none", cursor: "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                🔄 Réessayer
              </button>
            )}
            <button
              onClick={() => router.push(`/eleve/chapitre/${chapitreId}`)}
              style={{
                padding: "12px 24px", borderRadius: 12, fontSize: 15, fontWeight: 700,
                background: valide ? "#22C55E" : "var(--pb-surface-container, #f0f0f0)",
                color: valide ? "white" : "var(--pb-on-surface)",
                border: "none", cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              {valide ? "Continuer →" : "Retour au parcours"}
            </button>
          </div>
        </div>

        {enSauvegarde && (
          <p style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginTop: 12 }}>
            Sauvegarde en cours…
          </p>
        )}
      </div>
    );
  }

  // ── En cours ──────────────────────────────────────────────────────────

  const q = questions[indexCourant];
  if (!q) return null;

  const isQCM = q.options && q.options.length > 0;

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: "20px 20px 80px" }}>
      {/* En-tête */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "var(--pb-on-surface-variant)" }}>
            {exercice?.titre}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-primary)" }}>
            {indexCourant + 1}/{questions.length}
          </span>
        </div>

        {/* Barre progression */}
        <div style={{ height: 6, background: "var(--pb-surface-container, #f0f0f0)", borderRadius: 100, overflow: "hidden" }}>
          <div style={{
            width: `${((indexCourant) / questions.length) * 100}%`,
            height: "100%", background: "var(--pb-primary)", borderRadius: 100,
            transition: "width 0.3s ease",
          }} />
        </div>

        {/* Dots résultats */}
        <div style={{ display: "flex", gap: 4, marginTop: 8, justifyContent: "center" }}>
          {questions.map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: "50%",
              background: i < resultats.length
                ? resultats[i] ? "#22C55E" : "#EF4444"
                : i === indexCourant ? "var(--pb-primary)" : "var(--pb-outline-variant, #ddd)",
              transition: "background 0.2s",
            }} />
          ))}
        </div>
      </div>

      {/* Question */}
      <div style={{
        padding: "28px 24px", borderRadius: 20, background: "white",
        border: "1px solid var(--pb-outline-variant, #eee)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
        marginBottom: 20,
      }}>
        <p style={{
          fontSize: 18, fontWeight: 700, marginBottom: 20, lineHeight: 1.5,
          color: "var(--pb-on-surface)", textAlign: "center",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>
          {q.enonce}
        </p>

        {/* Champ réponse */}
        {isQCM ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {q.options!.map((opt, oi) => {
              let bg = "var(--pb-surface-container, #f5f5f5)";
              let border = "1px solid var(--pb-outline-variant, #eee)";
              let color = "var(--pb-on-surface)";

              if (afficherCorrection) {
                if (oi === q.reponseIdx) {
                  bg = "#DCFCE7"; border = "2px solid #22C55E"; color = "#166534";
                } else if (oi === qcmChoisi && oi !== q.reponseIdx) {
                  bg = "#FEE2E2"; border = "2px solid #EF4444"; color = "#991B1B";
                }
              } else if (qcmChoisi === oi) {
                bg = "rgba(37,99,235,0.1)"; border = "2px solid var(--pb-primary)";
              }

              return (
                <button key={oi} onClick={() => !afficherCorrection && setQcmChoisi(oi)} style={{
                  padding: "12px 16px", borderRadius: 12, fontSize: 15, fontWeight: 500,
                  background: bg, border, color, cursor: afficherCorrection ? "default" : "pointer",
                  textAlign: "left", fontFamily: "'Plus Jakarta Sans', sans-serif",
                  transition: "all 0.15s",
                }}>
                  {opt}
                </button>
              );
            })}
          </div>
        ) : (
          <div>
            <input
              value={reponseEleve}
              onChange={(e) => setReponseEleve(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !afficherCorrection && reponseEleve.trim() && verifierReponse()}
              placeholder="Ta réponse…"
              disabled={afficherCorrection}
              autoFocus
              style={{
                width: "100%", padding: "14px 16px", borderRadius: 12,
                fontSize: 16, fontWeight: 500, textAlign: "center",
                border: afficherCorrection
                  ? resultats[resultats.length - 1]
                    ? "2px solid #22C55E"
                    : "2px solid #EF4444"
                  : "2px solid var(--pb-outline-variant, #ddd)",
                background: afficherCorrection
                  ? resultats[resultats.length - 1]
                    ? "#F0FDF4"
                    : "#FEF2F2"
                  : "white",
                outline: "none",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            />
            {afficherCorrection && !resultats[resultats.length - 1] && (
              <p style={{ fontSize: 14, color: "#DC2626", marginTop: 8, textAlign: "center" }}>
                Réponse : <strong>{q.reponse}</strong>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bouton action */}
      {!afficherCorrection ? (
        <button
          onClick={verifierReponse}
          disabled={isQCM ? qcmChoisi === null : !reponseEleve.trim()}
          style={{
            width: "100%", padding: "14px", borderRadius: 14, fontSize: 16, fontWeight: 700,
            background: (isQCM ? qcmChoisi !== null : reponseEleve.trim()) ? "var(--pb-primary)" : "var(--pb-surface-container, #eee)",
            color: (isQCM ? qcmChoisi !== null : reponseEleve.trim()) ? "white" : "var(--pb-on-surface-variant)",
            border: "none", cursor: "pointer",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          Vérifier
        </button>
      ) : (
        <button
          onClick={passerSuivant}
          style={{
            width: "100%", padding: "14px", borderRadius: 14, fontSize: 16, fontWeight: 700,
            background: resultats[resultats.length - 1] ? "#22C55E" : "#F59E0B",
            color: "white", border: "none", cursor: "pointer",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {indexCourant + 1 >= questions.length ? "Voir le résultat" : "Question suivante →"}
        </button>
      )}
    </div>
  );
}
