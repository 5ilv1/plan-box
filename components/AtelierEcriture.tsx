"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

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
  const [erreursIA, setErreursIA] = useState<Array<{ mot: string; type: string; position: number; indice: string; correction?: string }>>([]);
  const analyser = useCallback(async () => {
    if (!texte.trim()) return;
    setAnalyseEnCours(true);
    setAnalyseMessage("");
    try {
      const res = await fetch("/api/ecriture/analyser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texte, jour: 2, sujet }),
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

  // ── Segments highlight : on découpe le texte selon les annotations actives ──
  const segments = useMemo(() => {
    if (annotationsActives.length === 0 && erreursIA.length === 0) {
      return [{ text: texte, type: "normal" as const }];
    }

    type Seg = { text: string; type: "normal" } | { text: string; type: "annotation"; ann: Annotation } | { text: string; type: "erreur"; erreur: typeof erreursIA[number] };

    // Construire la liste de marquages valides (extrait trouvé dans le texte courant)
    const marks: Array<{ debut: number; fin: number; kind: "annotation" | "erreur"; ann?: Annotation; erreur?: typeof erreursIA[number] }> = [];

    for (const a of annotationsActives) {
      // On tente d'abord la position stockée, puis une recherche textuelle si l'élève a modifié le texte autour
      if (
        a.debut >= 0 &&
        a.fin <= texte.length &&
        texte.slice(a.debut, a.fin) === a.extrait
      ) {
        marks.push({ debut: a.debut, fin: a.fin, kind: "annotation", ann: a });
      } else {
        const idx = texte.indexOf(a.extrait);
        if (idx >= 0) {
          marks.push({ debut: idx, fin: idx + a.extrait.length, kind: "annotation", ann: a });
        }
      }
    }

    for (const e of erreursIA) {
      if (e.position >= 0 && texte.substring(e.position, e.position + e.mot.length).toLowerCase() === e.mot.toLowerCase()) {
        marks.push({ debut: e.position, fin: e.position + e.mot.length, kind: "erreur", erreur: e });
      } else {
        const idx = texte.toLowerCase().indexOf(e.mot.toLowerCase());
        if (idx >= 0) marks.push({ debut: idx, fin: idx + e.mot.length, kind: "erreur", erreur: e });
      }
    }

    marks.sort((a, b) => a.debut - b.debut);

    const result: Seg[] = [];
    let offset = 0;
    for (const m of marks) {
      if (m.debut < offset) continue; // chevauchement → skip
      if (m.debut > offset) {
        result.push({ text: texte.slice(offset, m.debut), type: "normal" });
      }
      const chunk = texte.slice(m.debut, m.fin);
      if (m.kind === "annotation") {
        result.push({ text: chunk, type: "annotation", ann: m.ann! });
      } else {
        result.push({ text: chunk, type: "erreur", erreur: m.erreur! });
      }
      offset = m.fin;
    }
    if (offset < texte.length) {
      result.push({ text: texte.slice(offset), type: "normal" });
    }
    return result;
  }, [texte, annotationsActives, erreursIA]);

  const nbMots = texte.trim() ? texte.trim().split(/\s+/).length : 0;

  // Clic sur un passage annoté : trouver l'annotation correspondant à la position cliquée
  function onClickHighlight(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const id = target.getAttribute("data-annotation-id");
    if (!id) return;
    const ann = annotationsActives.find((a) => a.id === id);
    if (!ann) return;
    setAnnotationOuverte(ann);
    // Marquer comme lue
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
        <div style={{ position: "relative", minHeight: 320 }}>
          {/* Couche highlights (derrière) */}
          <div
            ref={highlightRef}
            aria-hidden
            onClick={onClickHighlight}
            style={{
              position: "absolute", inset: 0, padding: "20px",
              borderRadius: 14, border: "1.5px solid transparent",
              fontSize: 15, lineHeight: 1.8, fontFamily: "Manrope, sans-serif",
              whiteSpace: "pre-wrap", wordWrap: "break-word",
              overflow: "hidden", pointerEvents: "none",
              color: "var(--pb-on-surface)",
            }}
          >
            {segments.map((s, i) => {
              if (s.type === "normal") return <span key={i}>{s.text}</span>;
              if (s.type === "annotation") {
                const statut = s.ann.statut;
                return (
                  <mark
                    key={i}
                    data-annotation-id={s.ann.id}
                    style={{
                      background: statut === "nouvelle" ? "rgba(67,56,202,0.18)" : "rgba(67,56,202,0.1)",
                      color: "#4338CA",
                      borderBottom: statut === "nouvelle" ? "2px solid #4338CA" : "2px dashed #4338CA",
                      borderRadius: 3, padding: "1px 0",
                      fontWeight: 600,
                      pointerEvents: "auto", cursor: "pointer",
                    }}
                  >
                    {s.text}
                  </mark>
                );
              }
              // erreur IA
              return (
                <mark
                  key={i}
                  style={{
                    background: "rgba(220,38,38,0.15)",
                    color: "#DC2626",
                    borderBottom: "2px solid #DC2626",
                    borderRadius: 3, padding: "1px 0",
                    fontWeight: 600,
                  }}
                >
                  {s.text}
                </mark>
              );
            })}
          </div>

          {/* Textarea transparent (devant) */}
          <textarea
            ref={textareaRef}
            value={texte}
            onChange={(e) => {
              setTexte(e.target.value);
              // Reset erreurs IA car positions invalides
              if (erreursIA.length > 0) setErreursIA([]);
            }}
            placeholder="Écris ton texte ici. Tu peux revenir le retravailler chaque jour, jusqu'à vendredi."
            style={{
              position: "relative", zIndex: 1,
              width: "100%", minHeight: 320, padding: "20px",
              borderRadius: 14, border: "1.5px solid var(--pb-outline-variant, #ccc)",
              fontSize: 15, lineHeight: 1.8, fontFamily: "Manrope, sans-serif",
              color: (annotationsActives.length > 0 || erreursIA.length > 0) ? "transparent" : "var(--pb-on-surface)",
              caretColor: "var(--pb-on-surface)",
              background: "transparent", resize: "vertical",
              outline: "none", transition: "border-color 0.2s",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "#7C3AED"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--pb-outline-variant, #ccc)"; }}
            onScroll={(e) => {
              if (highlightRef.current) {
                highlightRef.current.scrollTop = e.currentTarget.scrollTop;
              }
            }}
          />
        </div>

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
                onClick={() => setAnnotationOuverte(a)}
                style={{
                  textAlign: "left", background: "white", border: "1px solid #DDD6FE",
                  borderRadius: 10, padding: "10px 14px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10, fontFamily: "Manrope, sans-serif",
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
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("[AtelierEcriture] click Corriger mon texte, texte.length=", texte.length, "analyseEnCours=", analyseEnCours);
            analyser();
          }}
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
