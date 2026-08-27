"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { CEINTURES, genererCalculs, descriptionCeinture, SEUIL_EVAL, type Calcul, type CeintureDefinition } from "@/lib/ceintures";

interface Props {
  eleveId?: string;
  repetiboxEleveId?: number;
  /**
   * Ouvre le module sur cette couleur au lieu de la ceinture courante de
   * l'élève — utilisé par le bouton des leçons de Calcul (C10, C17, C22, C32),
   * qui renvoient chacune vers leur couleur. Si l'élève l'a déjà dépassée,
   * c'est une révision : la progression se dérivant du MAXIMUM des ceintures
   * réussies, rejouer une couleur inférieure ne le fait jamais régresser.
   */
  ceintureImposee?: number;
  onTermine: (score: { bon: number; total: number }) => void;
}

type Phase = "accueil" | "countdown" | "jeu" | "resultat";

export default function CeintureMultiplication({ eleveId, repetiboxEleveId, ceintureImposee, onTermine }: Props) {
  const [ceintureIndex, setCeintureIndex] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [dernierScore, setDernierScore] = useState<number | null>(null); // % dernier entraînement
  const [phase, setPhase] = useState<Phase>("accueil");
  const [mode, setMode] = useState<"entrainement" | "evaluation">("entrainement");
  const [ceintureJouee, setCeintureJouee] = useState(0); // index de la ceinture au moment du lancement
  const [calculs, setCalculs] = useState<Calcul[]>([]);
  const [indexCalc, setIndexCalc] = useState(0);
  const [reponse, setReponse] = useState("");
  const [resultats, setResultats] = useState<{ calcul: Calcul; reponseEleve: number | null; correct: boolean }[]>([]);
  const [tempsRestant, setTempsRestant] = useState(90_000);
  const [countdown, setCountdown] = useState(3);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef(0);

  // Charger la progression
  useEffect(() => {
    const params = new URLSearchParams();
    if (eleveId) params.set("eleve_id", eleveId);
    if (repetiboxEleveId) params.set("rb_id", String(repetiboxEleveId));

    fetch(`/api/ceinture-progression?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setCeintureIndex(ceintureImposee ?? data.ceinture_index ?? 0);
        setDernierScore(data.dernier_score_pct ?? null);
        setChargement(false);
      })
      .catch(() => setChargement(false));
  }, [eleveId, repetiboxEleveId, ceintureImposee]);

  const ceinture = CEINTURES[ceintureIndex] ?? CEINTURES[0];

  const terminerJeu = useCallback((calculsJoues: typeof resultats, tousLesCalculs: Calcul[], tempsEcoule: number) => {
    if (timerRef.current) clearInterval(timerRef.current);

    // Ajouter les calculs non répondus comme faux
    const restants = tousLesCalculs.slice(calculsJoues.length).map((c) => ({
      calcul: c, reponseEleve: null as number | null, correct: false,
    }));
    const tousResultats = [...calculsJoues, ...restants];
    setResultats(tousResultats);

    const nbCorrect = tousResultats.filter((r) => r.correct).length;
    const score = { bon: nbCorrect, total: tousResultats.length };

    // Sauvegarder
    setSaving(true);
    fetch("/api/ceinture-resultat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eleve_id: eleveId ?? null,
        repetibox_eleve_id: repetiboxEleveId ?? null,
        ceinture_index: ceintureIndex,
        mode,
        nb_correct: nbCorrect,
        nb_total: tousResultats.length,
        temps_ms: tempsEcoule,
        reussi: mode === "evaluation" ? nbCorrect === tousResultats.length : nbCorrect / tousResultats.length >= 0.9,
        details: tousResultats.map((r) => ({
          enonce: r.calcul.enonce,
          reponse_attendue: r.calcul.reponse,
          reponse_eleve: r.reponseEleve,
          correct: r.correct,
        })),
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.nouvelle_ceinture !== undefined) {
          setCeintureIndex(data.nouvelle_ceinture);
        }
        setDernierScore(Math.round((nbCorrect / tousResultats.length) * 100));
        setSaving(false);
      })
      .catch(() => setSaving(false));

    setPhase("resultat");
    onTermine(score);
  }, [ceintureIndex, mode, eleveId, repetiboxEleveId, onTermine]);

  function lancerPartie(m: "entrainement" | "evaluation") {
    setMode(m);
    setCeintureJouee(ceintureIndex);
    const c = genererCalculs(ceinture);
    setCalculs(c);
    setIndexCalc(0);
    setReponse("");
    setResultats([]);
    setTempsRestant(ceinture.tempsMs);
    setCountdown(3);
    setPhase("countdown");
  }

  // Countdown 3-2-1
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      setPhase("jeu");
      startTimeRef.current = Date.now();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // Timer du jeu
  useEffect(() => {
    if (phase !== "jeu") return;

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const rest = Math.max(0, ceinture.tempsMs - elapsed);
      setTempsRestant(rest);
      if (rest <= 0) {
        terminerJeu(resultatsRef.current, calculsRef.current, ceinture.tempsMs);
      }
    }, 100);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, ceinture.tempsMs, terminerJeu]);

  // Refs pour accès dans le timer
  const resultatsRef = useRef(resultats);
  resultatsRef.current = resultats;
  const calculsRef = useRef(calculs);
  calculsRef.current = calculs;

  // Focus input quand on passe au jeu ou au calcul suivant
  useEffect(() => {
    if (phase === "jeu") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [phase, indexCalc]);

  function validerReponse() {
    const rep = parseInt(reponse, 10);
    const calc = calculs[indexCalc];
    if (!calc || isNaN(rep)) return;

    const correct = rep === calc.reponse;
    const nouveauResultat = { calcul: calc, reponseEleve: rep, correct };
    const nouveauxResultats = [...resultats, nouveauResultat];
    setResultats(nouveauxResultats);

    if (indexCalc + 1 >= calculs.length) {
      // Tous les calculs répondus
      terminerJeu(nouveauxResultats, calculs, Date.now() - startTimeRef.current);
    } else {
      setIndexCalc((i) => i + 1);
      setReponse("");
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      validerReponse();
    }
  }

  // ── Chargement ──
  if (chargement) {
    return (
      <div style={{ textAlign: "center", padding: "48px 20px" }}>
        <span className="ms spin" style={{ fontSize: 32, color: "var(--pb-primary)" }}>progress_activity</span>
      </div>
    );
  }

  // ── Résultat ──
  if (phase === "resultat") {
    const nbCorrect = resultats.filter((r) => r.correct).length;
    const pct = Math.round((nbCorrect / resultats.length) * 100);
    const isEval = mode === "evaluation";
    const reussiEval = isEval && nbCorrect === resultats.length;
    const ceinturePassee = CEINTURES[ceintureJouee] ?? CEINTURES[0];
    const nouvelleCeinture = reussiEval ? CEINTURES[Math.min(ceintureJouee + 1, CEINTURES.length - 1)] : null;

    return (
      <div>
        {/* Score */}
        <div style={{
          textAlign: "center", padding: "32px 20px", marginBottom: 20,
          borderRadius: "1.25rem",
          background: reussiEval
            ? `linear-gradient(135deg, ${ceinturePassee.couleurFond}, white)`
            : pct >= 90
              ? "linear-gradient(135deg, #dcfce7, #bbf7d0)"
              : pct >= 50
                ? "linear-gradient(135deg, #fef9c3, #fde68a)"
                : "linear-gradient(135deg, #fee2e2, #fecaca)",
        }}>
          {reussiEval ? (
            <>
              <div style={{ fontSize: 56, marginBottom: 8 }}>🏅</div>
              <div style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: 24, fontWeight: 900,
                color: ceinturePassee.couleur,
              }}>
                Ceinture {ceinturePassee.nom} obtenue !
              </div>
              <p style={{ fontSize: 14, marginTop: 8, color: "var(--pb-on-surface-variant)" }}>
                {saving ? "Enregistrement..." : `Bravo ! Tu passes maintenant à la ceinture ${nouvelleCeinture!.nom}`}
              </p>
            </>
          ) : (
            <>
              <div style={{ fontSize: 48, marginBottom: 8 }}>
                {pct >= 90 ? "🎉" : pct >= 50 ? "💪" : "📝"}
              </div>
              <div style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: 28, fontWeight: 900,
                color: pct >= 90 ? "#166534" : pct >= 50 ? "#854d0e" : "#991b1b",
              }}>
                {nbCorrect} / {resultats.length}
              </div>
              <p style={{ fontSize: 14, marginTop: 4, color: "var(--pb-on-surface-variant)" }}>
                {isEval
                  ? "Il faut 100% pour obtenir la ceinture. Continue à t'entraîner !"
                  : pct >= 90
                    ? "Super entraînement ! Tu peux tenter l'évaluation."
                    : "Continue à t'entraîner pour progresser !"}
              </p>
            </>
          )}
        </div>

        {/* Détails des erreurs */}
        {resultats.some((r) => !r.correct) && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 15, fontWeight: 700, marginBottom: 10,
              color: "var(--pb-on-surface)",
            }}>
              Calculs à revoir
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {resultats.filter((r) => !r.correct).map((r, i) => (
                <div key={i} style={{
                  padding: "10px 14px", borderRadius: "0.75rem",
                  background: "#fee2e2", borderLeft: "3px solid #ef4444",
                  fontSize: 14, display: "flex", justifyContent: "space-between",
                }}>
                  <span style={{ fontWeight: 600 }}>{r.calcul.enonce}</span>
                  <span>
                    <span style={{ color: "#dc2626", textDecoration: "line-through" }}>
                      {r.reponseEleve ?? "—"}
                    </span>
                    <span style={{ color: "#166534", fontWeight: 700, marginLeft: 8 }}>
                      {r.calcul.reponse}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => lancerPartie("entrainement")}
            className="pb-btn surface"
            style={{ flex: 1 }}
          >
            <span className="ms" style={{ fontSize: 18 }}>replay</span>
            S&apos;entraîner
          </button>
          {pct >= SEUIL_EVAL && !reussiEval && (
            <button
              onClick={() => lancerPartie("evaluation")}
              className="pb-btn primary"
              style={{ flex: 1 }}
            >
              <span className="ms" style={{ fontSize: 18 }}>military_tech</span>
              Passer la ceinture
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Countdown ──
  if (phase === "countdown") {
    return (
      <div style={{
        textAlign: "center", padding: "80px 20px",
      }}>
        <div style={{
          width: 120, height: 120, borderRadius: "50%",
          background: ceinture.couleur, color: "white",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 24px",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: 64, fontWeight: 900,
          animation: "pulse 1s ease-in-out infinite",
        }}>
          {countdown > 0 ? countdown : "GO"}
        </div>
        <p style={{ fontSize: 16, fontWeight: 600, color: "var(--pb-on-surface-variant)" }}>
          {mode === "evaluation" ? "Évaluation" : "Entraînement"} — Ceinture {ceinture.nom}
        </p>
        <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", opacity: 0.7 }}>
          {ceinture.nbCalculs} calculs en {ceinture.tempsMs / 1000}s
        </p>
      </div>
    );
  }

  // ── Jeu en cours ──
  if (phase === "jeu") {
    const calc = calculs[indexCalc];
    const secondes = Math.ceil(tempsRestant / 1000);
    const pctTemps = (tempsRestant / ceinture.tempsMs) * 100;
    const urgent = secondes <= 10;

    return (
      <div>
        {/* Énoncé ceinture */}
        <p style={{
          textAlign: "center", fontSize: 13, fontWeight: 600,
          color: ceinture.couleur, marginBottom: 12,
        }}>
          {descriptionCeinture(ceinture)}
        </p>

        {/* Barre de temps */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 6,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--pb-on-surface-variant)" }}>
              {indexCalc + 1} / {calculs.length}
            </span>
            <span style={{
              fontSize: 14, fontWeight: 800,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              color: urgent ? "#dc2626" : "var(--pb-on-surface)",
            }}>
              {secondes}s
            </span>
          </div>
          <div style={{
            height: 8, background: "var(--pb-surface-container, #e5e7eb)",
            borderRadius: 4, overflow: "hidden",
          }}>
            <div style={{
              height: "100%", borderRadius: 4,
              background: urgent ? "#dc2626" : ceinture.couleur,
              width: `${pctTemps}%`,
              transition: "width 0.1s linear",
            }} />
          </div>
        </div>

        {/* Calcul */}
        <div style={{
          textAlign: "center",
          padding: "40px 20px",
          background: "var(--pb-surface-container, #f5f5f5)",
          borderRadius: "1.5rem",
          marginBottom: 20,
        }}>
          <div style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "clamp(2rem, 8vw, 3.5rem)",
            fontWeight: 900,
            color: "var(--pb-on-surface)",
            marginBottom: 24,
            letterSpacing: 2,
          }}>
            {calc?.enonce}
          </div>

          {/* Affichage réponse */}
          <div style={{
            width: 140, height: 56, margin: "0 auto",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 32, fontWeight: 800,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            borderRadius: 16,
            border: `3px solid ${ceinture.couleur}`,
            background: "white",
            color: reponse ? "var(--pb-on-surface)" : "#d1d5db",
            letterSpacing: 2,
          }}>
            {reponse || "?"}
          </div>
          {/* Input caché pour le clavier physique (desktop) */}
          <input
            ref={inputRef}
            type="number"
            inputMode="none"
            value={reponse}
            onChange={(e) => setReponse(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
            style={{
              position: "absolute", opacity: 0, width: 0, height: 0,
              pointerEvents: "none",
            }}
          />
        </div>

        {/* Pavé numérique */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          margin: "0 auto",
        }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              onClick={() => { setReponse((r) => r + String(n)); inputRef.current?.focus(); }}
              style={{
                height: 52, borderRadius: 14, border: "none",
                background: "white", cursor: "pointer",
                fontSize: 22, fontWeight: 700,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                color: "var(--pb-on-surface)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                transition: "transform 0.1s",
              }}
              onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.95)")}
              onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              {n}
            </button>
          ))}
          {/* Effacer */}
          <button
            onClick={() => { setReponse((r) => r.slice(0, -1)); inputRef.current?.focus(); }}
            style={{
              height: 52, borderRadius: 14, border: "none",
              background: "#fee2e2", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <span className="ms" style={{ fontSize: 22, color: "#dc2626" }}>backspace</span>
          </button>
          {/* 0 */}
          <button
            onClick={() => { setReponse((r) => r + "0"); inputRef.current?.focus(); }}
            style={{
              height: 52, borderRadius: 14, border: "none",
              background: "white", cursor: "pointer",
              fontSize: 22, fontWeight: 700,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              color: "var(--pb-on-surface)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            0
          </button>
          {/* Valider */}
          <button
            onClick={() => { validerReponse(); inputRef.current?.focus(); }}
            disabled={reponse === ""}
            style={{
              height: 52, borderRadius: 14, border: "none",
              background: reponse ? ceinture.couleur : "#d1d5db",
              cursor: reponse ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.2s",
            }}
          >
            <span className="ms" style={{ fontSize: 24, color: "white" }}>check</span>
          </button>
        </div>

        {/* Indicateurs de progression */}
        <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap", marginTop: 16 }}>
          {calculs.map((_, i) => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: "50%",
              background: i < resultats.length
                ? (resultats[i].correct ? "#22c55e" : "#ef4444")
                : i === indexCalc
                  ? ceinture.couleur
                  : "#e5e7eb",
              transition: "background 0.2s",
            }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Accueil ──
  const peutPasserEval = dernierScore !== null && dernierScore >= SEUIL_EVAL;

  return (
    <div>
      {/* Ceinture actuelle */}
      <div style={{
        textAlign: "center", padding: "28px 20px 24px", marginBottom: 20,
        borderRadius: "1.5rem",
        background: `linear-gradient(135deg, ${ceinture.couleur}18, ${ceinture.couleurFond})`,
        border: `3px solid ${ceinture.couleur}`,
      }}>
        {/* Icône + nom */}
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: ceinture.couleur,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 14px",
          boxShadow: `0 6px 24px ${ceinture.couleur}50`,
        }}>
          <span className="ms" style={{ fontSize: 36, color: "white" }}>military_tech</span>
        </div>
        <h2 style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: 26, fontWeight: 900, color: ceinture.couleur,
          marginBottom: 2,
        }}>
          Ceinture {ceinture.nom}
        </h2>

        {/* Sous-titre : description de l'objectif */}
        <p style={{
          fontSize: 15, fontWeight: 600,
          color: "var(--pb-on-surface)",
          marginBottom: 14, lineHeight: 1.5,
        }}>
          {descriptionCeinture(ceinture)}
        </p>

        {/* Ceintures obtenues */}
        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
          {CEINTURES.map((c, i) => (
            <div key={i} title={`Ceinture ${c.nom}`} style={{
              width: 20, height: 20, borderRadius: "50%",
              background: i <= ceintureIndex ? c.couleur : "#e5e7eb",
              opacity: i < ceintureIndex ? 0.6 : i === ceintureIndex ? 1 : 0.3,
              border: i === ceintureIndex ? "3px solid white" : "none",
              boxShadow: i === ceintureIndex ? `0 0 0 2px ${c.couleur}` : "none",
              transition: "all 0.3s",
            }} />
          ))}
        </div>
      </div>

      {/* Dernier score */}
      {dernierScore !== null && (
        <div style={{
          padding: "12px 16px", borderRadius: "1rem",
          background: dernierScore >= 90 ? "#dcfce7" : "#fef9c3",
          marginBottom: 16, fontSize: 14, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span className="ms" style={{ fontSize: 18, color: dernierScore >= 90 ? "#16a34a" : "#ca8a04" }}>
            {dernierScore >= 90 ? "check_circle" : "trending_up"}
          </span>
          Dernier entraînement : {dernierScore}%
          {dernierScore >= 90 && (
            <span style={{ marginLeft: "auto", color: "#16a34a", fontSize: 13 }}>
              Évaluation débloquée !
            </span>
          )}
        </div>
      )}

      {/* Boutons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          onClick={() => lancerPartie("entrainement")}
          className="pb-btn surface"
          style={{
            width: "100%", padding: "16px 24px",
            fontSize: 16, fontWeight: 700,
          }}
        >
          <span className="ms" style={{ fontSize: 22 }}>play_arrow</span>
          S&apos;entraîner
        </button>

        <button
          onClick={() => lancerPartie("evaluation")}
          disabled={!peutPasserEval}
          className="pb-btn primary"
          style={{
            width: "100%", padding: "16px 24px",
            fontSize: 16, fontWeight: 700,
            opacity: peutPasserEval ? 1 : 0.4,
            cursor: peutPasserEval ? "pointer" : "default",
          }}
        >
          <span className="ms" style={{ fontSize: 22 }}>military_tech</span>
          Passer ma ceinture
          {!peutPasserEval && (
            <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.7, marginLeft: 8 }}>
              ({SEUIL_EVAL}% requis à l&apos;entraînement)
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
