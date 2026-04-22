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
  /** Mode aperçu enseignant : désactive sauvegarde, polling, envoi et PATCH statut. */
  apercu?: boolean;
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

function estFinalise(c: Record<string, unknown>): boolean {
  return !!c.date_version_finale;
}

export default function AtelierEcriture({
  blocId,
  sujet,
  contrainte,
  afficherContrainte,
  contenu,
  eleveRbId,
  onTermine,
  apercu = false,
}: Props) {
  const [texte, setTexte] = useState(() => getTexteCourantInitial(contenu));
  const [annotations, setAnnotations] = useState<Annotation[]>(() =>
    getAnnotationsInitiales(contenu)
  );
  const [autoSaveStatus, setAutoSaveStatus] = useState<"" | "saving" | "saved">("");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [envoye, setEnvoye] = useState(() => estEnvoye(contenu));
  const [finalise, setFinalise] = useState(() => estFinalise(contenu));

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedTexte = useRef(getTexteCourantInitial(contenu));

  const vendredi = estVendredi();
  // Édition bloquée si finalisé OU si on est vendredi et déjà envoyé
  const verrouille = finalise || (vendredi && envoye);

  // ── Auto-save 2s après dernière frappe ──
  useEffect(() => {
    if (apercu) return;
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
    if (apercu) return;
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

  // ── Envoyer le texte (premier envoi ou version finale) ──
  async function envoyer(final: boolean = false) {
    if (apercu) return;
    if (!texte.trim()) return;
    const question = final
      ? "Es-tu sûr de vouloir envoyer ta version finale ? Tu ne pourras plus rien modifier après."
      : "Es-tu sûr de vouloir envoyer ton texte au maître ? Il pourra le corriger et tu pourras encore le retravailler.";
    if (!confirm(question)) {
      return;
    }
    setEnvoiEnCours(true);
    try {
      const res = await fetch("/api/ecriture/envoyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocId, texte, eleveRbId, final }),
      });
      if (res.ok) {
        setEnvoye(true);
        if (final) setFinalise(true);
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
    if (verrouille) return;
    // Les positions stockées sont celles au moment de la pose par l'enseignant.
    // Le texte a pu bouger depuis : on recale via l'extrait si besoin.
    let debut = ann.debut;
    let fin = ann.fin;
    if (texte.slice(debut, fin) !== ann.extrait) {
      const idx = texte.indexOf(ann.extrait);
      if (idx < 0) {
        alert("Le passage à corriger n'existe plus dans ton texte.");
        return;
      }
      debut = idx;
      fin = idx + ann.extrait.length;
    }
    const avant = texte.slice(0, debut);
    const apres = texte.slice(fin);
    const nouveauTexte = avant + ann.suggestion + apres;
    setTexte(nouveauTexte);
    // Marquer comme acceptée
    if (!apercu) {
      try {
        await fetch("/api/enseignant/ecriture/annotation", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blocId, id: ann.id, statut: "acceptee", eleveRbId }),
        });
      } catch {}
    }
    setAnnotations((prev) =>
      prev.map((a) => (a.id === ann.id ? { ...a, statut: "acceptee" as const } : a))
    );
  }

  async function garderMonTexte(ann: Annotation) {
    if (!apercu) {
      try {
        await fetch("/api/enseignant/ecriture/annotation", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blocId, id: ann.id, statut: "ignoree", eleveRbId }),
        });
      } catch {}
    }
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


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── En-tête ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        background: verrouille ? "rgba(5,150,105,0.08)" : "rgba(124,58,237,0.08)",
        borderRadius: 14, padding: "12px 18px",
        border: `1.5px solid ${verrouille ? "rgba(5,150,105,0.25)" : "rgba(124,58,237,0.2)"}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="ms" style={{ fontSize: 24, color: verrouille ? "#059669" : "#7C3AED" }}>
            {verrouille ? "task_alt" : "edit_note"}
          </span>
          <div>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 15, color: verrouille ? "#059669" : "#7C3AED" }}>
              {finalise
                ? "Version finale envoyée"
                : envoye
                  ? vendredi
                    ? "Vendredi — relis et envoie ta version finale"
                    : "Texte envoyé — tu peux encore corriger"
                  : "Atelier d'écriture — Écris et envoie quand tu es prêt"}
            </div>
            <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>
              {finalise
                ? "Ton texte est définitivement rendu."
                : envoye
                  ? vendredi
                    ? "Tu ne peux plus modifier le texte. Clique sur « Envoyer la version finale »."
                    : "Applique les corrections du maître pour améliorer ton texte"
                  : "Clique sur « Envoyer au maître » quand tu penses avoir terminé"}
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
            {nbNouvelles} correction{nbNouvelles > 1 ? "s" : ""} du maître
          </div>
        )}
      </div>

      {/* ── Grille texte + propositions ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: annotationsActives.length > 0 ? "minmax(0, 1.6fr) minmax(260px, 1fr)" : "1fr",
          gap: 16,
          alignItems: "start",
        }}
      >

      {/* ── Zone d'édition (colonne gauche) ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "sticky", top: 12 }}>
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          readOnly={verrouille}
          placeholder="Écris ton texte ici. Tu peux revenir le retravailler chaque jour."
          style={{
            width: "100%", minHeight: 320, padding: "20px",
            borderRadius: 14, border: "1.5px solid var(--pb-outline-variant, #ccc)",
            fontSize: 15, lineHeight: 1.8, fontFamily: "Manrope, sans-serif",
            color: "var(--pb-on-surface)",
            background: verrouille ? "#FAFAFA" : "white", resize: "vertical",
            outline: "none", transition: "border-color 0.2s",
            cursor: verrouille ? "default" : "text",
          }}
          onFocus={(e) => { if (!verrouille) e.currentTarget.style.borderColor = "#7C3AED"; }}
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

      {/* ── Colonne droite : propositions du maître en cartes ── */}
      {annotationsActives.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{
            background: "#F5F3FF", border: "1.5px solid #DDD6FE",
            borderRadius: 12, padding: "10px 12px",
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#4338CA",
          }}>
            <span className="ms" style={{ fontSize: 18 }}>auto_awesome</span>
            Propositions du maître ({annotationsActives.length})
          </div>
          {annotationsActives.map((a) => {
            const estNouvelle = a.statut === "nouvelle";
            return (
              <div
                key={a.id}
                style={{
                  background: "white", border: "1.5px solid #DDD6FE",
                  borderRadius: 12, padding: "10px 12px",
                  display: "flex", flexDirection: "column", gap: 6,
                  fontFamily: "Manrope, sans-serif",
                }}
                onMouseEnter={() => {
                  if (estNouvelle && !apercu) {
                    fetch("/api/enseignant/ecriture/annotation", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ blocId, id: a.id, statut: "lue", eleveRbId }),
                    }).catch(() => {});
                    setAnnotations((prev) =>
                      prev.map((x) => (x.id === a.id ? { ...x, statut: "lue" as const } : x))
                    );
                  }
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                    background: estNouvelle ? "#4338CA" : "#A5B4FC",
                    color: "white",
                  }}>
                    {estNouvelle ? "Nouvelle" : "Lue"}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontStyle: "italic", color: "#991B1B" }}>
                  « {a.extrait} »
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>
                  → « {a.suggestion} »
                </div>
                {a.commentaire && (
                  <div style={{ fontSize: 12, color: "#4338CA", fontStyle: "italic", lineHeight: 1.4 }}>
                    {a.commentaire}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 2 }}>
                  {verrouille ? (
                    <span style={{ fontSize: 11, color: "var(--pb-on-surface-variant)", fontStyle: "italic" }}>
                      Lecture seule
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => garderMonTexte(a)}
                        style={{
                          background: "white", color: "var(--pb-on-surface-variant)",
                          border: "1px solid var(--pb-outline-variant, #ddd)", borderRadius: 8,
                          padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        Laisser
                      </button>
                      <button
                        onClick={() => appliquerAnnotation(a)}
                        style={{
                          background: "#4338CA", color: "white", border: "none",
                          borderRadius: 8, padding: "4px 12px", fontSize: 11, fontWeight: 700,
                          cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
                        }}
                      >
                        <span className="ms" style={{ fontSize: 14 }}>check</span>
                        Modifier
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      </div> {/* fin grille */}

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

        {!finalise && !envoye && (
          <button
            onClick={() => envoyer(false)}
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
            {envoiEnCours ? "Envoi..." : "Envoyer au maître"}
          </button>
        )}

        {!finalise && envoye && vendredi && (
          <button
            onClick={() => envoyer(true)}
            disabled={envoiEnCours || !texte.trim()}
            style={{
              background: "linear-gradient(135deg, #059669, #047857)", color: "white", border: "none",
              borderRadius: 12, padding: "10px 24px", fontSize: 14,
              fontWeight: 700, cursor: (envoiEnCours || !texte.trim()) ? "not-allowed" : "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              opacity: (envoiEnCours || !texte.trim()) ? 0.5 : 1,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span className="ms" style={{ fontSize: 18 }}>task_alt</span>
            {envoiEnCours ? "Envoi..." : "Envoyer la version finale"}
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

    </div>
  );
}
