"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Erreur {
  mot: string;
  type: "orthographe" | "grammaire" | "syntaxe";
  position: number;
  indice: string;
  correction?: string;
}

interface Props {
  blocId: string;
  sujet: string;
  contrainte: string;
  afficherContrainte: boolean;
  contenu: Record<string, unknown>;
  eleveRbId?: number;
  onTermine: () => void;
}

// J1=lundi(1), J2=mardi(2), J3=jeudi(4), J4=vendredi(5)
function getJourAtelier(contenu: Record<string, unknown> | null): number | null {
  const day = new Date().getDay();
  // Pas un jour d'école (mercredi, samedi, dimanche)
  if (![1, 2, 4, 5].includes(day)) return null;

  if (!contenu) return 1;

  // Déterminer le jour en fonction de la progression réelle
  const t1 = (contenu.texte_jour1 as string || "").trim();
  const t2 = (contenu.texte_jour2 as string || "").trim();
  const t3 = (contenu.texte_jour3 as string || "").trim();
  const tf = (contenu.texte_final as string || "").trim();

  // Si texte finalisé → J4 (lecture seule)
  if (tf) return 4;
  // Si J3 rempli → J4 (finalisation)
  if (t3) return 4;
  // Si J2 rempli → J3 (correction 2)
  if (t2) return 3;
  // Si J1 rempli → J2 (correction 1)
  if (t1) return 2;
  // Sinon → J1 (premier jet)
  return 1;
}

const JOUR_CONFIG = [
  { label: "Jour 1 — Premier jet", icon: "edit_note", desc: "Écris ton histoire librement", color: "#7C3AED", hasTimer: false },
  { label: "Jour 2 — Correction", icon: "spellcheck", desc: "Corrige les erreurs identifiées", color: "#2563EB", hasTimer: true },
  { label: "Jour 3 — Amélioration", icon: "rate_review", desc: "Continue à corriger et développer", color: "#D97706", hasTimer: true },
  { label: "Jour 4 — Finalisation", icon: "task_alt", desc: "Termine et rends ton texte final", color: "#059669", hasTimer: true },
];

const TIMER_DURATION = 20 * 60; // 20 minutes en secondes

const TYPE_COLORS: Record<string, { label: string; color: string; bg: string }> = {
  orthographe: { label: "Orthographe", color: "#DC2626", bg: "#FEE2E2" },
  grammaire:   { label: "Grammaire",   color: "#D97706", bg: "#FEF3C7" },
  syntaxe:     { label: "Syntaxe",     color: "#2563EB", bg: "#DBEAFE" },
};

export default function AtelierEcriture({ blocId, sujet, contrainte, afficherContrainte, contenu, eleveRbId, onTermine }: Props) {
  const jour = getJourAtelier(contenu);
  const cfg = jour ? JOUR_CONFIG[jour - 1] : null;

  const [texte, setTexte] = useState("");
  const [erreurs, setErreurs] = useState<Erreur[]>([]);
  const [analyseEnCours, setAnalyseEnCours] = useState(false);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"" | "saving" | "saved">("");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedTexte = useRef("");
  const [tempsRestant, setTempsRestant] = useState(TIMER_DURATION);
  const [timerActive, setTimerActive] = useState(false);
  const [timerExpire, setTimerExpire] = useState(false);
  const [jourTermine, setJourTermine] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Charger le texte du jour précédent
  useEffect(() => {
    if (!jour) return;
    if (jour === 1) {
      setTexte((contenu.texte_jour1 as string) || "");
    } else if (jour === 2) {
      setTexte((contenu.texte_jour2 as string) || (contenu.texte_jour1 as string) || "");
    } else if (jour === 3) {
      setTexte((contenu.texte_jour3 as string) || (contenu.texte_jour2 as string) || (contenu.texte_jour1 as string) || "");
    } else if (jour === 4) {
      setTexte((contenu.texte_final as string) || (contenu.texte_jour3 as string) || (contenu.texte_jour2 as string) || "");
    }

    // Vérifier si le jour est déjà terminé
    const jourKey = jour === 4 ? "texte_final" : `texte_jour${jour}`;
    if (contenu[jourKey] && (contenu[jourKey] as string).length > 0 && jour > 1) {
      // Déjà sauvegardé pour ce jour
    }
    lastSavedTexte.current = texte;
  }, [jour, contenu]);

  // Auto-save debounce (2s après dernière frappe)
  useEffect(() => {
    if (!jour || jourTermine || !texte.trim() || texte === lastSavedTexte.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      setAutoSaveStatus("saving");
      try {
        await fetch("/api/ecriture/sauvegarder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blocId, jour, texte, eleveRbId }),
        });
        lastSavedTexte.current = texte;
        setAutoSaveStatus("saved");
        setTimeout(() => setAutoSaveStatus(""), 3000);
      } catch {
        setAutoSaveStatus("");
      }
    }, 2000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [texte, jour, blocId, eleveRbId, jourTermine]);

  // Auto-démarrage du timer + analyse pour J2, J3, J4
  const analyseDejaLancee = useRef(false);
  useEffect(() => {
    if (cfg?.hasTimer && !analyseDejaLancee.current && texte.trim().length > 0) {
      analyseDejaLancee.current = true;
      setTimerActive(true);
      // Lancer l'analyse avec un petit délai pour que le state soit prêt
      setTimeout(() => analyserTexte(), 500);
    }
  }, [cfg?.hasTimer, texte]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timer pour J2, J3, J4
  useEffect(() => {
    if (!cfg?.hasTimer || !timerActive) return;
    timerRef.current = setInterval(() => {
      setTempsRestant((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setTimerExpire(true);
          setTimerActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerActive, cfg?.hasTimer]);

  // Analyser les erreurs avec l'IA
  const analyserTexte = useCallback(async () => {
    if (!texte.trim() || !jour) return;
    setAnalyseEnCours(true);
    try {
      const erreursPrecedentes = jour === 3
        ? (contenu.erreurs_jour2 as Erreur[]) ?? []
        : jour === 4
          ? (contenu.erreurs_jour3 as Erreur[]) ?? []
          : [];

      const res = await fetch("/api/ecriture/analyser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texte,
          erreurs_precedentes: erreursPrecedentes,
          jour,
          sujet,
        }),
      });
      const data = await res.json();
      console.log("[AtelierEcriture] Erreurs trouvées:", data.erreurs?.length ?? 0, data.erreurs);
      setErreurs(data.erreurs ?? []);
    } catch (err) {
      console.error("[AtelierEcriture] Erreur analyse:", err);
    }
    setAnalyseEnCours(false);
  }, [texte, jour, contenu, sujet]);

  // Sauvegarder
  async function sauvegarder(final = false) {
    setSauvegarde(true);
    try {
      await fetch("/api/ecriture/sauvegarder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocId,
          jour: final && jour === 4 ? 4 : jour,
          texte,
          erreurs: erreurs.length > 0 ? erreurs : undefined,
          eleveRbId,
        }),
      });
      if (final && jour === 4) {
        setJourTermine(true);
        onTermine();
      } else {
        setJourTermine(true);
      }
    } catch {}
    setSauvegarde(false);
  }

  // Compteur de mots
  const nbMots = texte.trim() ? texte.trim().split(/\s+/).length : 0;

  // Formatage du timer
  const minutes = Math.floor(tempsRestant / 60);
  const secondes = tempsRestant % 60;
  const timerStr = `${minutes}:${secondes.toString().padStart(2, "0")}`;

  // ── Pas un jour d'atelier (mercredi, weekend) ──
  if (!jour || !cfg) {
    const texteActuel = (contenu.texte_final as string) || (contenu.texte_jour3 as string) || (contenu.texte_jour2 as string) || (contenu.texte_jour1 as string) || "";
    return (
      <div style={{ padding: "32px 28px", textAlign: "center" }}>
        <span className="ms" style={{ fontSize: 48, color: "var(--pb-on-surface-variant)", opacity: 0.4, display: "block", marginBottom: 12 }}>schedule</span>
        <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
          Pas de session aujourd&apos;hui
        </h3>
        <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", marginBottom: 20 }}>
          L&apos;atelier reprend au prochain jour prévu.
        </p>
        {texteActuel && (
          <div style={{ textAlign: "left", background: "var(--pb-surface-container-low, #f5f5ff)", borderRadius: 14, padding: "16px 20px", maxHeight: 200, overflowY: "auto" }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pb-on-surface-variant)", marginBottom: 8 }}>Ton texte en cours</p>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--pb-on-surface)", whiteSpace: "pre-wrap" }}>{texteActuel}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Jour terminé ──
  if (jourTermine) {
    return (
      <div style={{ padding: "48px 28px", textAlign: "center" }}>
        <span className="ms" style={{ fontSize: 56, color: cfg.color, display: "block", marginBottom: 16 }}>check_circle</span>
        <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 20, marginBottom: 8, color: "var(--pb-on-surface)" }}>
          {jour === 4 ? "Texte finalisé !" : `${cfg.label} terminé !`}
        </h3>
        <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", marginBottom: 8 }}>
          {jour === 4 ? "Bravo, ton texte est rendu !" : "Ton travail est sauvegardé. À la prochaine session !"}
        </p>
        <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)" }}>{nbMots} mots</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── En-tête jour ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: `${cfg.color}10`, borderRadius: 14, padding: "12px 18px",
        border: `1.5px solid ${cfg.color}25`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="ms" style={{ fontSize: 24, color: cfg.color }}>{cfg.icon}</span>
          <div>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 15, color: cfg.color }}>{cfg.label}</div>
            <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>{cfg.desc}</div>
          </div>
        </div>

        {/* Timer */}
        {cfg.hasTimer && (
          <div style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800,
            fontSize: 22, color: timerExpire ? "#DC2626" : cfg.color,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span className="ms" style={{ fontSize: 20 }}>{timerExpire ? "timer_off" : "timer"}</span>
            {timerExpire ? "Temps écoulé" : timerStr}
          </div>
        )}
      </div>

      {/* ── Zone de travail ── */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

        {/* Textarea avec highlights */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ position: "relative", minHeight: 300 }}>
            {/* Couche de highlights (derrière) */}
            <div
              aria-hidden
              style={{
                position: "absolute", inset: 0, padding: "20px",
                borderRadius: 14, border: "1.5px solid transparent",
                fontSize: 15, lineHeight: 1.8, fontFamily: "Manrope, sans-serif",
                whiteSpace: "pre-wrap", wordWrap: "break-word",
                overflow: "hidden", pointerEvents: "none",
                color: "var(--pb-on-surface)",
              }}
            >
              {erreurs.length > 0 ? (() => {
                // Construire la liste de TOUTES les positions d'erreurs dans le texte
                const positions: { idx: number; len: number; erreur: Erreur }[] = [];
                for (const e of erreurs) {
                  // Utiliser la position fournie par l'IA si disponible, sinon chercher
                  if (e.position > 0 && texte.substring(e.position, e.position + e.mot.length).toLowerCase() === e.mot.toLowerCase()) {
                    positions.push({ idx: e.position, len: e.mot.length, erreur: e });
                  } else {
                    // Chercher TOUTES les occurrences du mot dans le texte
                    let searchFrom = 0;
                    const motLower = e.mot.toLowerCase();
                    while (searchFrom < texte.length) {
                      const idx = texte.toLowerCase().indexOf(motLower, searchFrom);
                      if (idx < 0) break;
                      positions.push({ idx, len: e.mot.length, erreur: e });
                      searchFrom = idx + e.mot.length;
                    }
                  }
                }

                // Trier par position et dédupliquer les chevauchements
                positions.sort((a, b) => a.idx - b.idx);
                const result: { text: string; isError: boolean; erreur?: Erreur }[] = [];
                let offset = 0;

                for (const p of positions) {
                  if (p.idx < offset) continue; // skip chevauchement
                  if (p.idx > offset) {
                    result.push({ text: texte.slice(offset, p.idx), isError: false });
                  }
                  result.push({ text: texte.slice(p.idx, p.idx + p.len), isError: true, erreur: p.erreur });
                  offset = p.idx + p.len;
                }
                if (offset < texte.length) {
                  result.push({ text: texte.slice(offset), isError: false });
                }

                return result.map((part, i) => part.isError ? (
                  <mark key={i} style={{
                    background: part.erreur?.type === "orthographe" ? "rgba(220,38,38,0.15)"
                      : part.erreur?.type === "grammaire" ? "rgba(217,119,6,0.15)"
                      : "rgba(37,99,235,0.15)",
                    color: part.erreur?.type === "orthographe" ? "#DC2626"
                      : part.erreur?.type === "grammaire" ? "#D97706"
                      : "#2563EB",
                    fontWeight: 700,
                    borderRadius: 3,
                    padding: "1px 0",
                    borderBottom: `2px solid ${
                      part.erreur?.type === "orthographe" ? "#DC2626"
                      : part.erreur?.type === "grammaire" ? "#D97706"
                      : "#2563EB"
                    }`,
                  }}>{part.text}</mark>
                ) : (
                  <span key={i}>{part.text}</span>
                ));
              })() : texte}
            </div>

            {/* Textarea transparent (devant) */}
            <textarea
              ref={textareaRef}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              disabled={timerExpire}
              placeholder={jour === 1 ? "Commence à écrire ton histoire ici..." : "Continue ton texte..."}
              style={{
                position: "relative", zIndex: 1,
                width: "100%", minHeight: 300, padding: "20px",
                borderRadius: 14, border: "1.5px solid var(--pb-outline-variant, #ccc)",
                fontSize: 15, lineHeight: 1.8, fontFamily: "Manrope, sans-serif",
                color: erreurs.length > 0 ? "transparent" : "var(--pb-on-surface)",
                caretColor: "var(--pb-on-surface)",
                background: "transparent", resize: "vertical",
                outline: "none", transition: "border-color 0.2s",
                opacity: timerExpire ? 0.5 : 1,
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = cfg.color; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--pb-outline-variant, #ccc)"; }}
              onScroll={(e) => {
                // Synchroniser le scroll du highlight
                const highlight = e.currentTarget.previousElementSibling as HTMLElement;
                if (highlight) { highlight.scrollTop = e.currentTarget.scrollTop; }
              }}
            />
          </div>

          {/* Barre de statut */}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--pb-on-surface-variant)", padding: "0 4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span>{nbMots} mot{nbMots > 1 ? "s" : ""}</span>
              {autoSaveStatus === "saving" && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--pb-on-surface-variant)" }}>
                  <span className="ms" style={{ fontSize: 14, animation: "spin 1s linear infinite" }}>sync</span>
                  Sauvegarde...
                </span>
              )}
              {autoSaveStatus === "saved" && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#16A34A" }}>
                  <span className="ms" style={{ fontSize: 14 }}>cloud_done</span>
                  Sauvegardé
                </span>
              )}
            </div>
            {erreurs.length > 0 && (
              <span style={{ color: "#DC2626", fontWeight: 600 }}>
                {erreurs.length} erreur{erreurs.length > 1 ? "s" : ""} identifiée{erreurs.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Panneau erreurs (J2, J3, J4) */}
        {jour > 1 && timerActive && erreurs.length > 0 && (
          <div style={{
            width: 340, flexShrink: 0,
            background: "white",
            borderRadius: 20, padding: "24px",
            maxHeight: 500, overflowY: "auto",
            border: "1.5px solid var(--pb-outline-variant, #ddd)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
          }}>
            <div style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 16,
              marginBottom: 6, display: "flex", alignItems: "center", gap: 8,
              color: "var(--pb-on-surface)",
            }}>
              <span className="ms" style={{ fontSize: 22, color: "#DC2626" }}>error</span>
              Erreurs à corriger
            </div>
            <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", marginBottom: 20, lineHeight: 1.4 }}>
              {erreurs.length} erreur{erreurs.length > 1 ? "s" : ""} trouvée{erreurs.length > 1 ? "s" : ""} — corrige-les dans ton texte
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {erreurs.map((e, i) => {
                const tc = TYPE_COLORS[e.type] ?? TYPE_COLORS.orthographe;
                return (
                  <div key={i} style={{
                    background: tc.bg, borderRadius: 14, padding: "14px 16px",
                    borderLeft: `4px solid ${tc.color}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        padding: "3px 8px", borderRadius: 6,
                        background: "white", color: tc.color,
                      }}>
                        {tc.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: tc.color, marginBottom: 8, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      &quot;{e.mot}&quot;
                    </div>
                    <p style={{ fontSize: 14, color: "var(--pb-on-surface)", margin: 0, lineHeight: 1.6 }}>
                      {e.indice}
                    </p>
                    {e.correction && (
                      <div style={{
                        marginTop: 10, padding: "8px 12px", borderRadius: 8,
                        background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.2)",
                        display: "flex", alignItems: "center", gap: 6,
                      }}>
                        <span className="ms" style={{ fontSize: 18, color: "#059669" }}>check_circle</span>
                        <span style={{ fontSize: 14, color: "#059669", fontWeight: 700 }}>
                          {e.correction}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Conseils J4 ── */}
      {jour === 4 && timerActive && (
        <div style={{
          background: "rgba(5,150,105,0.06)", border: "1.5px solid rgba(5,150,105,0.2)",
          borderRadius: 14, padding: "14px 18px",
        }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#059669", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span className="ms" style={{ fontSize: 18 }}>lightbulb</span>
            Conseils de finalisation
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--pb-on-surface-variant)" }}>
            {[
              "Relis ton introduction : est-elle accrocheuse ?",
              "Vérifie que tes paragraphes s'enchaînent bien",
              "As-tu une conclusion qui termine bien l'histoire ?",
              "Relis une dernière fois pour la ponctuation et les majuscules",
            ].map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                <span className="ms" style={{ fontSize: 14, color: "#059669", flexShrink: 0, marginTop: 2 }}>check</span>
                <span>{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Boutons d'action ── */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        {jour > 1 && timerActive && !analyseEnCours && (
          <button
            onClick={analyserTexte}
            style={{
              background: "white", color: cfg.color,
              border: `1.5px solid ${cfg.color}40`, borderRadius: 12,
              padding: "10px 20px", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span className="ms" style={{ fontSize: 18 }}>spellcheck</span>
            Re-analyser
          </button>
        )}

        {analyseEnCours && (
          <span style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", display: "flex", alignItems: "center", gap: 6 }}>
            <span className="ms" style={{ fontSize: 18 }}>hourglass_empty</span>
            Analyse en cours...
          </span>
        )}

        <button
          onClick={() => sauvegarder(jour === 4)}
          disabled={sauvegarde || !texte.trim()}
          style={{
            background: cfg.color, color: "white", border: "none",
            borderRadius: 12, padding: "10px 24px", fontSize: 14,
            fontWeight: 700, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
            opacity: (sauvegarde || !texte.trim()) ? 0.5 : 1,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <span className="ms" style={{ fontSize: 18 }}>{jour === 4 ? "send" : "save"}</span>
          {sauvegarde ? "Sauvegarde..." : jour === 4 ? "Rendre mon texte final" : "Sauvegarder"}
        </button>
      </div>
    </div>
  );
}
