"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

type ErreurIA = {
  mot: string;
  type: string;
  position: number;
  indice: string;
  correction?: string;
};

interface Annotation {
  id: string;
  date: string;
  debut: number;
  fin: number;
  extrait: string;
  suggestion: string;
  commentaire?: string;
  statut: "nouvelle" | "lue" | "acceptee" | "ignoree";
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

function getTexteCourantInitial(c: Record<string, unknown>): string {
  if (typeof c.texte_courant === "string") return c.texte_courant;
  return (
    (c.texte_final as string) ||
    (c.texte_jour3 as string) ||
    (c.texte_jour2 as string) ||
    (c.texte_jour1 as string) ||
    ""
  );
}

function getAnnotationsInitiales(c: Record<string, unknown>): Annotation[] {
  return Array.isArray(c.annotations) ? (c.annotations as Annotation[]) : [];
}

function estVendredi(): boolean {
  return new Date().getDay() === 5;
}

function estEnvoye(c: Record<string, unknown>): boolean {
  const envoi = c.date_envoi as string | undefined | null;
  const tf = (c.texte_final as string) ?? "";
  return !!envoi && tf.trim().length > 0;
}

export default function AtelierEcriture({
  blocId,
  sujet,
  contrainte,
  afficherContrainte,
  contenu,
  eleveRbId,
  onTermine,
}: Props) {
  const [texte, setTexte] = useState(() => getTexteCourantInitial(contenu));
  const [annotations, setAnnotations] = useState<Annotation[]>(() =>
    getAnnotationsInitiales(contenu)
  );
  const [annotationOuverte, setAnnotationOuverte] = useState<Annotation | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"" | "saving" | "saved">("");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [verrouille, setVerrouille] = useState(() => estEnvoye(contenu));

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedTexte = useRef(getTexteCourantInitial(contenu));

  const vendredi = estVendredi();

  // ── Auto-save 2s après dernière frappe ──
  useEffect(() => {
    if (verrouille) return;
    if (texte === lastSavedTexte.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      setAutoSaveStatus("saving");
      try {
        const res = await fetch("/api/ecriture/sauvegarder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blocId, texte, eleveRbId }),
        });
        if (res.ok) {
          lastSavedTexte.current = texte;
          setAutoSaveStatus("saved");
          setTimeout(() => setAutoSaveStatus(""), 2500);
        } else {
          setAutoSaveStatus("");
        }
      } catch {
        setAutoSaveStatus("");
      }
    }, 1500);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [texte, blocId, eleveRbId, verrouille]);

  // ── Polling annotations toutes les 20s ──
  useEffect(() => {
    if (verrouille) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/ecriture/annotations?blocId=${blocId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.annotations)) {
          setAnnotations(data.annotations);
        }
      } catch {}
    }, 20000);
    return () => clearInterval(interval);
  }, [blocId, verrouille]);

  // ── Analyser le texte (bouton "Corrige-moi") ──
  const [analyseEnCours, setAnalyseEnCours] = useState(false);
  const [analyseMessage, setAnalyseMessage] = useState<string>("");
  const [erreursIA, setErreursIA] = useState<ErreurIA[]>([]);
  const analyser = useCallback(async () => {
    if (!texte.trim()) return;
    setAnalyseEnCours(true);
    setAnalyseMessage("");
    try {
      const res = await fetch("/api/ecriture/analyser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texte, sujet, blocId }),
      });
      if (!res.ok) {
        setAnalyseMessage("Erreur lors de l'analyse, réessaie.");
      } else {
        const data = await res.json();
        const erreurs = data.erreurs ?? [];
        setErreursIA(erreurs);
        if (erreurs.length === 0) {
          setAnalyseMessage("Bravo ! Je n'ai trouvé aucune erreur dans ton texte.");
        } else {
          setAnalyseMessage("");
        }
      }
    } catch {
      setAnalyseMessage("Problème réseau, réessaie dans un instant.");
    }
    setAnalyseEnCours(false);
  }, [texte, sujet]);

  // ── Envoyer le texte final (vendredi uniquement) ──
  async function envoyer() {
    if (!vendredi || !texte.trim()) return;
    if (!confirm("Es-tu sûr de vouloir envoyer ton texte à la maîtresse ? Tu ne pourras plus le modifier après.")) {
      return;
    }
    setEnvoiEnCours(true);
    try {
      const res = await fetch("/api/ecriture/envoyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocId, texte, eleveRbId }),
      });
      if (res.ok) {
        setVerrouille(true);
        onTermine();
      } else {
        const data = await res.json();
        alert(data.erreur ?? "Erreur lors de l'envoi");
      }
    } catch {
      alert("Erreur réseau");
    }
    setEnvoiEnCours(false);
  }

  // ── Appliquer une annotation (remplace l'extrait par la suggestion) ──
  async function appliquerAnnotation(ann: Annotation) {
    const avant = texte.slice(0, ann.debut);
    const apres = texte.slice(ann.fin);
    const nouveauTexte = avant + ann.suggestion + apres;
    setTexte(nouveauTexte);
    setAnnotationOuverte(null);
    // Marquer comme acceptée
    try {
      await fetch("/api/enseignant/ecriture/annotation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocId, id: ann.id, statut: "acceptee", eleveRbId }),
      });
    } catch {}
    setAnnotations((prev) =>
      prev.map((a) => (a.id === ann.id ? { ...a, statut: "acceptee" as const } : a))
    );
  }

  async function garderMonTexte(ann: Annotation) {
    setAnnotationOuverte(null);
    try {
      await fetch("/api/enseignant/ecriture/annotation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocId, id: ann.id, statut: "ignoree", eleveRbId }),
      });
    } catch {}
    setAnnotations((prev) =>
      prev.map((a) => (a.id === ann.id ? { ...a, statut: "ignoree" as const } : a))
    );
  }

  // Annotations actives = non acceptées, non ignorées
  const annotationsActives = useMemo(
    () => annotations.filter((a) => a.statut !== "acceptee" && a.statut !== "ignoree"),
    [annotations]
  );
  const nbNouvelles = useMemo(
    () => annotationsActives.filter((a) => a.statut === "nouvelle").length,
    [annotationsActives]
  );

  const nbMots = texte.trim() ? texte.trim().split(/\s+/).length : 0;

  // Ouvrir une annotation depuis la liste (et la marquer comme lue)
  function ouvrirAnnotation(ann: Annotation) {
    setAnnotationOuverte(ann);
    if (ann.statut === "nouvelle") {
      fetch("/api/enseignant/ecriture/annotation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocId, id: ann.id, statut: "lue", eleveRbId }),
      }).catch(() => {});
      setAnnotations((prev) =>
        prev.map((a) => (a.id === ann.id ? { ...a, statut: "lue" as const } : a))
      );
    }
  }

  // Appliquer une correction d'erreur IA : remplacer le mot par la correction
  function appliquerCorrection(erreur: ErreurIA) {
    if (!erreur.correction) return;
    // Localiser le mot : position stockée si elle correspond, sinon recherche insensible à la casse
    let pos = erreur.position;
    if (
      pos < 0 ||
      pos + erreur.mot.length > texte.length ||
      texte.substring(pos, pos + erreur.mot.length).toLowerCase() !== erreur.mot.toLowerCase()
    ) {
      pos = texte.toLowerCase().indexOf(erreur.mot.toLowerCase());
    }
    if (pos < 0) return;
    const avant = texte.slice(0, pos);
    const apres = texte.slice(pos + erreur.mot.length);
    setTexte(avant + erreur.correction + apres);
    setErreursIA((prev) => prev.filter((e) => e !== erreur));
  }

  // ── Vue : texte envoyé (lecture seule) ──
  if (verrouille) {
    return (
      <div style={{ padding: "32px 24px", textAlign: "center" }}>
        <span className="ms" style={{ fontSize: 56, color: "#059669", display: "block", marginBottom: 12 }}>task_alt</span>
        <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 20, marginBottom: 8 }}>
          Texte envoyé !
        </h3>
        <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", marginBottom: 20 }}>
          Bravo, ton texte est rendu à la maîtresse.
        </p>
        <div style={{
          textAlign: "left", background: "var(--pb-surface-container-low, #f5f5ff)",
          borderRadius: 14, padding: "18px 22px", maxHeight: 320, overflowY: "auto",
        }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pb-on-surface-variant)", marginBottom: 8 }}>
            Ton texte final · {nbMots} mot{nbMots > 1 ? "s" : ""}
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--pb-on-surface)", whiteSpace: "pre-wrap", margin: 0 }}>
            {texte}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── En-tête ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        background: "rgba(124,58,237,0.08)", borderRadius: 14, padding: "12px 18px",
        border: "1.5px solid rgba(124,58,237,0.2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="ms" style={{ fontSize: 24, color: "#7C3AED" }}>edit_note</span>
          <div>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "#7C3AED" }}>
              Atelier d&apos;écriture — {vendredi ? "Jour d'envoi" : "Écris et corrige ton texte"}
            </div>
            <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>
              {vendredi
                ? "Clique sur « Envoyer » quand tu es prêt"
                : "Tu peux écrire, corriger et revenir demain"}
            </div>
          </div>
        </div>

        {/* Badge annotations */}
        {nbNouvelles > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#EEF2FF", color: "#4338CA", padding: "6px 12px",
            borderRadius: 999, fontWeight: 700, fontSize: 13,
            border: "1.5px solid #C7D2FE",
          }}>
            <span className="ms" style={{ fontSize: 18 }}>auto_awesome</span>
            {nbNouvelles} correction{nbNouvelles > 1 ? "s" : ""} de la maîtresse
          </div>
        )}
      </div>

      {/* ── Zone d'édition ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Écris ton texte ici. Tu peux revenir le retravailler chaque jour, jusqu'à vendredi."
          style={{
            width: "100%", minHeight: 320, padding: "20px",
            borderRadius: 14, border: "1.5px solid var(--pb-outline-variant, #ccc)",
            fontSize: 15, lineHeight: 1.8, fontFamily: "Manrope, sans-serif",
            color: "var(--pb-on-surface)",
            background: "white", resize: "vertical",
            outline: "none", transition: "border-color 0.2s",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "#7C3AED"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--pb-outline-variant, #ccc)"; }}
        />

        {/* Barre de statut */}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--pb-on-surface-variant)", padding: "0 4px", flexWrap: "wrap", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span>{nbMots} mot{nbMots > 1 ? "s" : ""}</span>
            {autoSaveStatus === "saving" && (
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span className="ms" style={{ fontSize: 14 }}>sync</span>
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
          {erreursIA.length > 0 && (
            <span style={{ color: "#DC2626", fontWeight: 600 }}>
              {erreursIA.length} erreur{erreursIA.length > 1 ? "s" : ""} à corriger
            </span>
          )}
        </div>
      </div>

      {/* ── Liste des erreurs IA ── */}
      {erreursIA.length > 0 && (
        <div style={{
          background: "#FEF2F2", border: "1.5px solid #FECACA",
          borderRadius: 14, padding: "14px 18px",
        }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#B91C1C", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span className="ms" style={{ fontSize: 18 }}>spellcheck</span>
            {erreursIA.length} erreur{erreursIA.length > 1 ? "s" : ""} à corriger
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {erreursIA.map((e, i) => (
              <div
                key={i}
                style={{
                  background: "white", border: "1px solid #FECACA",
                  borderRadius: 10, padding: "10px 14px",
                  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                  fontFamily: "Manrope, sans-serif",
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 800, color: "#DC2626" }}>
                  {e.mot}
                </span>
                {e.correction && (
                  <>
                    <span className="ms" style={{ fontSize: 18, color: "#9CA3AF" }}>arrow_forward</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#059669" }}>
                      {e.correction}
                    </span>
                  </>
                )}
                <span style={{ fontSize: 12, color: "#6B7280", flex: 1, minWidth: 120 }}>
                  {e.indice}
                </span>
                {e.correction && (
                  <button
                    type="button"
                    onClick={() => appliquerCorrection(e)}
                    style={{
                      background: "#059669", color: "white", border: "none",
                      borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700,
                      cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
                      display: "flex", alignItems: "center", gap: 4,
                      minHeight: 36,
                    }}
                  >
                    <span className="ms" style={{ fontSize: 16 }}>check</span>
                    Corriger
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Liste des annotations enseignant (résumé) ── */}
      {annotationsActives.length > 0 && (
        <div style={{
          background: "#F5F3FF", border: "1.5px solid #DDD6FE",
          borderRadius: 14, padding: "14px 18px",
        }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#4338CA", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span className="ms" style={{ fontSize: 18 }}>auto_awesome</span>
            Propositions de la maîtresse
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {annotationsActives.map((a) => (
              <button
                key={a.id}
                onClick={() => ouvrirAnnotation(a)}
                style={{
                  textAlign: "left", background: "white", border: "1px solid #DDD6FE",
                  borderRadius: 10, padding: "12px 14px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10, fontFamily: "Manrope, sans-serif",
                  minHeight: 44,
                }}
              >
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                  background: a.statut === "nouvelle" ? "#4338CA" : "#A5B4FC",
                  color: "white", flexShrink: 0,
                }}>
                  {a.statut === "nouvelle" ? "Nouvelle" : "Lue"}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#4338CA", textDecoration: "underline" }}>
                  « {a.extrait.length > 40 ? a.extrait.slice(0, 40) + "…" : a.extrait} »
                </span>
                <span className="ms" style={{ fontSize: 18, color: "#6B7280", marginLeft: "auto" }}>chevron_right</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Feedback analyse ── */}
      {analyseEnCours && (
        <div style={{
          background: "#EEF2FF", border: "1.5px solid #C7D2FE",
          borderRadius: 12, padding: "12px 16px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span className="ms" style={{ fontSize: 20, color: "#4338CA", animation: "spin 1s linear infinite" }}>sync</span>
          <span style={{ fontSize: 13, color: "#4338CA", fontWeight: 600 }}>
            Analyse de ton texte en cours… quelques secondes.
          </span>
        </div>
      )}
      {analyseMessage && !analyseEnCours && (
        <div style={{
          background: erreursIA.length === 0 ? "#F0FDF4" : "#FEF3C7",
          border: `1.5px solid ${erreursIA.length === 0 ? "#BBF7D0" : "#FDE68A"}`,
          borderRadius: 12, padding: "12px 16px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span className="ms" style={{ fontSize: 20, color: erreursIA.length === 0 ? "#059669" : "#B45309" }}>
            {erreursIA.length === 0 ? "check_circle" : "info"}
          </span>
          <span style={{ fontSize: 13, color: erreursIA.length === 0 ? "#166534" : "#92400E", fontWeight: 600 }}>
            {analyseMessage}
          </span>
        </div>
      )}

      {/* ── Boutons d'action ── */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", position: "relative", zIndex: 10 }}>
        <button
          type="button"
          onClick={analyser}
          disabled={analyseEnCours || !texte.trim()}
          style={{
            background: "white", color: "#7C3AED",
            border: "1.5px solid #C4B5FD", borderRadius: 12,
            padding: "10px 20px", fontSize: 13, fontWeight: 700,
            cursor: (analyseEnCours || !texte.trim()) ? "not-allowed" : "pointer",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            display: "flex", alignItems: "center", gap: 6,
            opacity: (analyseEnCours || !texte.trim()) ? 0.5 : 1,
            position: "relative", zIndex: 10, pointerEvents: "auto",
          }}
        >
          <span className="ms" style={{ fontSize: 18 }}>spellcheck</span>
          {analyseEnCours ? "Analyse..." : "Corriger mon texte"}
        </button>

        {vendredi && (
          <button
            onClick={envoyer}
            disabled={envoiEnCours || !texte.trim()}
            style={{
              background: "#059669", color: "white", border: "none",
              borderRadius: 12, padding: "10px 24px", fontSize: 14,
              fontWeight: 700, cursor: (envoiEnCours || !texte.trim()) ? "not-allowed" : "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              opacity: (envoiEnCours || !texte.trim()) ? 0.5 : 1,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span className="ms" style={{ fontSize: 18 }}>send</span>
            {envoiEnCours ? "Envoi..." : "Envoyer à la maîtresse"}
          </button>
        )}
      </div>

      {/* Hint contrainte (si affichée) */}
      {afficherContrainte && contrainte && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          background: "rgba(124,58,237,0.05)", border: "1.5px dashed rgba(124,58,237,0.25)",
          borderRadius: 12, padding: "12px 16px",
        }}>
          <span className="ms" style={{ fontSize: 18, color: "#7C3AED", flexShrink: 0, marginTop: 1 }}>push_pin</span>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#5B21B6", margin: 0, lineHeight: 1.5 }}>
            {contrainte}
          </p>
        </div>
      )}

      {/* ── Modale annotation ── */}
      {annotationOuverte && (
        <div
          onClick={() => setAnnotationOuverte(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white", borderRadius: 20, padding: "28px 32px",
              maxWidth: 480, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span className="ms" style={{ fontSize: 24, color: "#4338CA" }}>auto_awesome</span>
              <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 17, margin: 0 }}>
                Proposition de la maîtresse
              </h3>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", marginBottom: 6 }}>
                Ton texte
              </div>
              <div style={{
                background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10,
                padding: "10px 14px", fontSize: 14, color: "#991B1B", fontStyle: "italic",
              }}>
                « {annotationOuverte.extrait} »
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", marginBottom: 6 }}>
                Proposition
              </div>
              <div style={{
                background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10,
                padding: "10px 14px", fontSize: 14, color: "#166534", fontWeight: 600,
              }}>
                « {annotationOuverte.suggestion} »
              </div>
            </div>

            {annotationOuverte.commentaire && (
              <div style={{
                background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: 10,
                padding: "10px 14px", fontSize: 13, color: "#3730A3", marginBottom: 20,
                lineHeight: 1.5,
              }}>
                {annotationOuverte.commentaire}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => garderMonTexte(annotationOuverte)}
                style={{
                  background: "white", color: "var(--pb-on-surface-variant)",
                  border: "1.5px solid var(--pb-outline-variant, #ddd)", borderRadius: 10,
                  padding: "8px 16px", fontSize: 13, fontWeight: 700,
                  cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Garder mon texte
              </button>
              <button
                onClick={() => appliquerAnnotation(annotationOuverte)}
                style={{
                  background: "#4338CA", color: "white", border: "none",
                  borderRadius: 10, padding: "8px 18px", fontSize: 13, fontWeight: 700,
                  cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <span className="ms" style={{ fontSize: 16 }}>check</span>
                Appliquer la correction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
