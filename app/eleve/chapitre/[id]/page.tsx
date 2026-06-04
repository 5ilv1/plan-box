"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useEleveSession } from "@/hooks/useEleveSession";

interface ExerciceProgression {
  exercice_id: string;
  ordre: number;
  titre: string;
  type: string;
  meilleur_score: number | null;
  total: number | null;
  valide: boolean;
  debloque: boolean;
  est_evaluation_finale?: boolean;
}

interface ChapitreInfo {
  id: string;
  titre: string;
  matiere: string;
  seuil_evaluation: number;
}

const TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  exercice:       { icon: "edit_note",   color: "#2563EB" },
  calcul_mental:  { icon: "calculate",   color: "#065F46" },
  texte_a_trous:  { icon: "text_fields", color: "#0369A1" },
  analyse_phrase: { icon: "schema",      color: "#6D28D9" },
  qcm:            { icon: "quiz",        color: "#92400E" },
  classement:     { icon: "category",    color: "#9D174D" },
  ecriture_contrainte: { icon: "edit",  color: "#7C3AED" },
  revision:       { icon: "menu_book",   color: "#D97706" },
  lecture:        { icon: "auto_stories", color: "#7C3AED" },
};

export default function PageChapitreEleve() {
  const { id: chapitreId } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, chargement: chargementSession } = useEleveSession();

  const [chapitre, setChapitre] = useState<ChapitreInfo | null>(null);
  const [exercices, setExercices] = useState<ExerciceProgression[]>([]);
  const [chargement, setChargement] = useState(true);
  const [evalDebloquee, setEvalDebloquee] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (chargementSession) return;
    if (!session) { router.push("/eleve"); return; }

    // Annuler le chargement précédent (ex: changement de chapitreId)
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    charger(session, ctrl.signal);

    return () => { ctrl.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargementSession, session, chapitreId]);

  async function charger(s: NonNullable<typeof session>, signal: AbortSignal) {
    setChargement(true);
    try {
      const param = s.source === "planbox"
        ? `eleve_id=${s.id}`
        : `rb_eleve_id=${s.id}`;

      const [chapRes, progRes] = await Promise.all([
        fetch(`/api/admin/chapitres/${chapitreId}`, { signal }).then((r) => r.json()),
        fetch(`/api/chapitres/progression?chapitre_id=${chapitreId}&${param}`, { signal }).then((r) => r.json()),
      ]);

      if (signal.aborted) return;

      if (chapRes.chapitre) {
        setChapitre(chapRes.chapitre);
      }

      const exos = progRes.exercices ?? [];
      setExercices(exos);
      // Pour les chapitres lecture, l'éval finale est un exercice séparé.
      // Elle est débloquée quand tous les autres exercices sont validés.
      const estLecture = chapRes.chapitre?.matiere === "lecture";
      if (estLecture) {
        const nonEval = exos.filter((e: ExerciceProgression) => !e.est_evaluation_finale);
        // Débloquée si tous les exercices non-eval sont validés
        // (ou s'il n'y en a pas — cas d'un chapitre avec uniquement l'eval_finale)
        setEvalDebloquee(nonEval.length === 0 || nonEval.every((e: ExerciceProgression) => e.valide));
      } else {
        setEvalDebloquee(exos.length > 0 && exos.every((e: ExerciceProgression) => e.valide));
      }
    } catch (err) {
      if (signal.aborted) return;
      console.error("[charger chapitre]", err);
    } finally {
      if (!signal.aborted) setChargement(false);
    }
  }

  if (chargement || chargementSession) {
    return (
      <div style={{ maxWidth: 800, margin: "40px auto", padding: "0 20px" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 60, borderRadius: 16, marginBottom: 12 }} />
        ))}
      </div>
    );
  }

  if (!chapitre) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p>Chapitre introuvable.</p>
        <Link href="/eleve/dashboard">← Retour</Link>
      </div>
    );
  }

  const nbValides = exercices.filter((e) => e.valide).length;
  const pourcentage = exercices.length > 0 ? Math.round((nbValides / exercices.length) * 100) : 0;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 20px 80px" }}>
      {/* En-tête */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/eleve/dashboard" style={{
          fontSize: 13, color: "var(--pb-on-surface-variant)", textDecoration: "none",
          display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12,
        }}>
          <span className="ms" style={{ fontSize: 18 }}>arrow_back</span> Retour
        </Link>

        <h1 style={{
          fontSize: 22, fontWeight: 800, margin: "0 0 8px",
          fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)",
        }}>
          📚 {chapitre.titre}
        </h1>

        {/* Barre de progression globale */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
          <div style={{
            flex: 1, height: 10, background: "var(--pb-surface-container, #f0f0f0)",
            borderRadius: 100, overflow: "hidden",
          }}>
            <div style={{
              width: `${pourcentage}%`, height: "100%",
              background: pourcentage === 100 ? "#22C55E" : "var(--pb-primary)",
              borderRadius: 100, transition: "width 0.5s ease",
            }} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--pb-on-surface)", minWidth: 50, textAlign: "right" }}>
            {nbValides}/{exercices.length}
          </span>
        </div>
      </div>

      {/* Liste des exercices */}
      <div style={{ position: "relative" }}>
        {/* Ligne de timeline */}
        {exercices.length > 0 && (
          <div style={{
            position: "absolute", left: 19, top: 20, bottom: evalDebloquee ? 20 : 60,
            width: 3, borderRadius: 100, zIndex: 0,
            background: `linear-gradient(to bottom, #22C55E ${pourcentage}%, var(--pb-outline-variant, #ddd) ${pourcentage}%)`,
          }} />
        )}

        {exercices
          .filter((ex) => !(chapitre.matiere === "lecture" && ex.est_evaluation_finale))
          .map((ex, idx) => {
          const typeInfo = TYPE_ICONS[ex.type] ?? TYPE_ICONS.exercice;
          const isLocked = !ex.debloque;
          const isCurrent = ex.debloque && !ex.valide;

          return (
            <div key={ex.exercice_id} style={{
              display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16,
              opacity: isLocked ? 0.45 : 1, transition: "opacity 0.3s",
            }}>
              {/* Cercle étape */}
              <div style={{
                width: 40, height: 40, borderRadius: "50%", flexShrink: 0, zIndex: 1,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: ex.valide ? "#22C55E" : isCurrent ? "white" : "var(--pb-surface-container, #eee)",
                border: ex.valide ? "none" : isCurrent ? `3px solid ${typeInfo.color}` : "2px solid var(--pb-outline-variant, #ddd)",
                boxShadow: isCurrent ? `0 0 0 4px ${typeInfo.color}22` : "none",
              }}>
                {ex.valide ? (
                  <span className="ms" style={{ fontSize: 22, color: "white" }}>check</span>
                ) : isLocked ? (
                  <span className="ms" style={{ fontSize: 18, color: "var(--pb-outline)" }}>lock</span>
                ) : (
                  <span style={{ fontWeight: 800, fontSize: 14, color: typeInfo.color }}>{idx + 1}</span>
                )}
              </div>

              {/* Carte exercice */}
              <div
                onClick={() => {
                  if (!isLocked) {
                    if (ex.type === "revision") {
                      router.push(`/eleve/chapitre/${chapitreId}/revision/${ex.exercice_id}`);
                    } else {
                      router.push(`/eleve/chapitre/${chapitreId}/exercice/${ex.exercice_id}`);
                    }
                  }
                }}
                style={{
                  flex: 1, padding: "14px 18px", borderRadius: 16,
                  background: isCurrent ? "white" : "var(--pb-surface-container, #fafafa)",
                  border: isCurrent ? `2px solid ${typeInfo.color}` : "1px solid var(--pb-outline-variant, #eee)",
                  cursor: isLocked ? "default" : "pointer",
                  boxShadow: isCurrent ? "0 2px 12px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span className="ms" style={{ fontSize: 16, color: typeInfo.color }}>{typeInfo.icon}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--pb-on-surface)" }}>
                        {ex.titre}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>
                      {ex.type === "revision"
                        ? ex.valide
                          ? "✅ Lu"
                          : isLocked
                            ? "🔒 Termine l'exercice précédent"
                            : isCurrent
                              ? "📖 Lire la leçon"
                              : ""
                        : ex.valide
                          ? `✅ Validé · ${ex.meilleur_score}/${ex.total}`
                          : isLocked
                            ? "🔒 Termine l'exercice précédent"
                            : isCurrent
                              ? "▶ Commencer"
                              : ""}
                    </div>
                  </div>

                  {isCurrent && (
                    <span className="ms" style={{ fontSize: 24, color: typeInfo.color }}>play_circle</span>
                  )}
                  {ex.valide && (
                    <span className="ms" style={{ fontSize: 24, color: "#22C55E" }}>verified</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Évaluation finale */}
        {(() => {
          const estLecture = chapitre.matiere === "lecture";
          const evalLecture = estLecture ? exercices.find((e) => e.est_evaluation_finale) : null;
          return (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 14, marginTop: 4,
          opacity: evalDebloquee ? 1 : 0.4,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%", flexShrink: 0, zIndex: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: evalDebloquee ? "linear-gradient(135deg, #DC2626, #B91C1C)" : "var(--pb-surface-container, #eee)",
            border: evalDebloquee ? "none" : "2px solid var(--pb-outline-variant, #ddd)",
            boxShadow: evalDebloquee ? "0 0 0 4px rgba(220,38,38,0.15)" : "none",
          }}>
            <span className="ms" style={{
              fontSize: 22,
              color: evalDebloquee ? "white" : "var(--pb-outline)",
            }}>
              {evalDebloquee ? "emoji_events" : "lock"}
            </span>
          </div>

          <div
            onClick={() => {
              if (!evalDebloquee) return;
              if (estLecture && evalLecture) {
                router.push(`/eleve/chapitre/${chapitreId}/exercice/${evalLecture.exercice_id}`);
              } else {
                router.push(`/eleve/chapitre/${chapitreId}/evaluation`);
              }
            }}
            style={{
              flex: 1, padding: "16px 18px", borderRadius: 16,
              background: evalDebloquee ? "linear-gradient(135deg, #FEF2F2, white)" : "var(--pb-surface-container, #fafafa)",
              border: evalDebloquee ? "2px solid rgba(220,38,38,0.3)" : "1px solid var(--pb-outline-variant, #eee)",
              cursor: evalDebloquee ? "pointer" : "default",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: evalDebloquee ? "#DC2626" : "var(--pb-on-surface-variant)" }}>
                  🏆 Évaluation finale
                </div>
                <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginTop: 2 }}>
                  {evalDebloquee
                    ? `Seuil : ${chapitre.seuil_evaluation}% · Bonne chance !`
                    : `Valide tous les exercices pour débloquer`}
                </div>
              </div>
              {evalDebloquee && (
                <span className="ms" style={{ fontSize: 28, color: "#DC2626" }}>play_circle</span>
              )}
            </div>
          </div>
        </div>
        );
        })()}
      </div>
    </div>
  );
}
