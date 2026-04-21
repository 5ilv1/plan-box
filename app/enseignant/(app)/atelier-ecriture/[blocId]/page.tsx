"use client";

import { useEffect, useState, useRef, useCallback, useMemo, use } from "react";
import Link from "next/link";

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

interface HistoriqueEntry {
  date: string;
  texte: string;
}

interface Contenu {
  sujet: string;
  contrainte: string;
  afficher_contrainte: boolean;
  texte_courant: string;
  historique: HistoriqueEntry[];
  annotations: Annotation[];
  texte_final: string;
  date_envoi: string | null;
}

interface Eleve {
  id: string;
  source: "planbox" | "repetibox";
  prenom: string;
  nom: string;
  classe: string;
}

interface SuggestionIA {
  debut: number;
  fin: number;
  extrait: string;
  suggestion: string;
  commentaire: string;
}

const STATUT_COULEURS: Record<Annotation["statut"], { bg: string; fg: string; label: string }> = {
  nouvelle: { bg: "#EEF2FF", fg: "#4338CA", label: "Nouvelle" },
  lue: { bg: "#F3F4F6", fg: "#6B7280", label: "Vue" },
  acceptee: { bg: "#DCFCE7", fg: "#166534", label: "Appliquée" },
  ignoree: { bg: "#FEF3C7", fg: "#92400E", label: "Ignorée" },
};

export default function EnseignantAtelierBloc({
  params,
}: {
  params: Promise<{ blocId: string }>;
}) {
  const { blocId } = use(params);

  const [loading, setLoading] = useState(true);
  const [contenu, setContenu] = useState<Contenu | null>(null);
  const [eleve, setEleve] = useState<Eleve | null>(null);
  const [statut, setStatut] = useState("");

  const [vueTexte, setVueTexte] = useState<"courant" | string>("courant");
  const [selection, setSelection] = useState<{ debut: number; fin: number; extrait: string } | null>(null);

  // Form nouvelle annotation
  const [formSuggestion, setFormSuggestion] = useState("");
  const [formCommentaire, setFormCommentaire] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);

  // IA
  const [iaEnCours, setIaEnCours] = useState(false);
  const [suggestionsIA, setSuggestionsIA] = useState<SuggestionIA[]>([]);

  const texteRef = useRef<HTMLDivElement>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/enseignant/ecriture/bloc?blocId=${blocId}`);
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      setContenu(data.contenu);
      setEleve(data.eleve);
      setStatut(data.bloc.statut);
    } catch {}
    setLoading(false);
  }, [blocId]);

  useEffect(() => {
    charger();
  }, [charger]);

  // ── Texte affiché (courant ou historique d'un jour) ──
  const texteAffiche = useMemo(() => {
    if (!contenu) return "";
    if (vueTexte === "courant") return contenu.texte_courant;
    const h = contenu.historique.find((e) => e.date === vueTexte);
    return h?.texte ?? "";
  }, [contenu, vueTexte]);

  // ── Capturer une sélection dans le texte ──
  function onMouseUpTexte() {
    if (vueTexte !== "courant") return; // on n'annote que le texte courant
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!texteRef.current?.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }
    const text = sel.toString();
    if (!text.trim()) {
      setSelection(null);
      return;
    }
    // Retrouver la position absolue dans texteAffiche
    const idx = texteAffiche.indexOf(text);
    if (idx < 0) {
      setSelection(null);
      return;
    }
    setSelection({ debut: idx, fin: idx + text.length, extrait: text });
    setFormSuggestion("");
    setFormCommentaire("");
  }

  async function enregistrerAnnotation() {
    if (!selection || !formSuggestion.trim()) return;
    setEnregistrement(true);
    try {
      const res = await fetch("/api/enseignant/ecriture/annotation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocId,
          annotations: [
            {
              debut: selection.debut,
              fin: selection.fin,
              extrait: selection.extrait,
              suggestion: formSuggestion.trim(),
              commentaire: formCommentaire.trim() || undefined,
            },
          ],
        }),
      });
      if (res.ok) {
        setSelection(null);
        setFormSuggestion("");
        setFormCommentaire("");
        await charger();
      }
    } catch {}
    setEnregistrement(false);
  }

  async function supprimerAnnotation(id: string) {
    if (!confirm("Supprimer cette annotation ?")) return;
    await fetch("/api/enseignant/ecriture/annotation", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocId, id }),
    });
    await charger();
  }

  // ── Suggestions IA ──
  async function genererSuggestionsIA() {
    if (!contenu?.texte_courant?.trim()) return;
    setIaEnCours(true);
    setSuggestionsIA([]);
    try {
      const res = await fetch("/api/enseignant/ecriture/suggestions-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texte: contenu.texte_courant, sujet: contenu.sujet }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestionsIA(data.suggestions ?? []);
      }
    } catch {}
    setIaEnCours(false);
  }

  async function validerSuggestionIA(s: SuggestionIA) {
    const res = await fetch("/api/enseignant/ecriture/annotation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocId,
        annotations: [
          {
            debut: s.debut,
            fin: s.fin,
            extrait: s.extrait,
            suggestion: s.suggestion,
            commentaire: s.commentaire,
          },
        ],
      }),
    });
    if (res.ok) {
      setSuggestionsIA((prev) => prev.filter((x) => x !== s));
      await charger();
    }
  }

  function rejeterSuggestionIA(s: SuggestionIA) {
    setSuggestionsIA((prev) => prev.filter((x) => x !== s));
  }

  // ── Affichage highlights (annotations existantes + sélection en cours) ──
  const segments = useMemo(() => {
    if (!contenu) return [];
    type Seg = { text: string; type: "normal" } | { text: string; type: "annotation"; ann: Annotation };
    if (contenu.annotations.length === 0 || vueTexte !== "courant") {
      return [{ text: texteAffiche, type: "normal" as const }] as Seg[];
    }
    const marks: { debut: number; fin: number; ann: Annotation }[] = [];
    for (const a of contenu.annotations) {
      if (texteAffiche.slice(a.debut, a.fin) === a.extrait) {
        marks.push({ debut: a.debut, fin: a.fin, ann: a });
      } else {
        const idx = texteAffiche.indexOf(a.extrait);
        if (idx >= 0) marks.push({ debut: idx, fin: idx + a.extrait.length, ann: a });
      }
    }
    marks.sort((a, b) => a.debut - b.debut);
    const result: Seg[] = [];
    let offset = 0;
    for (const m of marks) {
      if (m.debut < offset) continue;
      if (m.debut > offset) result.push({ text: texteAffiche.slice(offset, m.debut), type: "normal" });
      result.push({ text: texteAffiche.slice(m.debut, m.fin), type: "annotation", ann: m.ann });
      offset = m.fin;
    }
    if (offset < texteAffiche.length) result.push({ text: texteAffiche.slice(offset), type: "normal" });
    return result;
  }, [contenu, texteAffiche, vueTexte]);

  if (loading) {
    return <div className="skeleton" style={{ height: 200, borderRadius: 16 }} />;
  }

  if (!contenu || !eleve) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "var(--pb-on-surface-variant)" }}>
        <p>Bloc introuvable.</p>
        <Link href="/enseignant/atelier-ecriture" className="btn-primary-sm" style={{ marginTop: 16 }}>
          ← Retour à la liste
        </Link>
      </div>
    );
  }

  const envoye = !!contenu.date_envoi && contenu.texte_final.trim().length > 0;
  const nbMots = texteAffiche.trim() ? texteAffiche.trim().split(/\s+/).length : 0;

  return (
    <>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Link
          href="/enseignant/atelier-ecriture"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 13, color: "var(--pb-on-surface-variant)",
            textDecoration: "none", marginBottom: 10,
          }}
        >
          <span className="ms" style={{ fontSize: 18 }}>arrow_back</span>
          Retour
        </Link>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h2 className="ens-page-title" style={{ marginBottom: 4 }}>
              {eleve.prenom} {eleve.nom}
            </h2>
            <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", margin: 0 }}>
              {eleve.classe} · {nbMots} mot{nbMots > 1 ? "s" : ""} ·{" "}
              {envoye ? (
                <span style={{ color: "#059669", fontWeight: 700 }}>Envoyé le {contenu.date_envoi}</span>
              ) : statut === "en_cours" ? (
                <span style={{ color: "#1D4ED8", fontWeight: 700 }}>En cours</span>
              ) : (
                <span style={{ color: "#6B7280", fontWeight: 700 }}>À faire</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Sujet */}
      <div style={{
        background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(124,58,237,0.12))",
        border: "1.5px solid rgba(124,58,237,0.2)",
        borderRadius: 14, padding: "12px 16px", marginBottom: 16,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#7C3AED", marginBottom: 4 }}>
          Sujet
        </div>
        <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: 14, color: "var(--pb-on-surface)", margin: 0 }}>
          {contenu.sujet}
        </p>
      </div>

      {/* Onglets jour */}
      {contenu.historique.length > 0 && (
        <div style={{ display: "flex", gap: 4, background: "#F3F4F6", borderRadius: 10, padding: 3, marginBottom: 16, flexWrap: "wrap" }}>
          <button
            onClick={() => setVueTexte("courant")}
            style={{
              flex: "1 1 120px", padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: "none", cursor: "pointer",
              background: vueTexte === "courant" ? "white" : "transparent",
              color: vueTexte === "courant" ? "#4338CA" : "var(--pb-on-surface-variant)",
              boxShadow: vueTexte === "courant" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            Texte actuel
          </button>
          {contenu.historique.map((h) => (
            <button
              key={h.date}
              onClick={() => setVueTexte(h.date)}
              style={{
                flex: "1 1 120px", padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: "none", cursor: "pointer",
                background: vueTexte === h.date ? "white" : "transparent",
                color: vueTexte === h.date ? "var(--pb-on-surface)" : "var(--pb-on-surface-variant)",
                boxShadow: vueTexte === h.date ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              {new Date(h.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
            </button>
          ))}
        </div>
      )}

      {/* Zone texte + panneau annotations */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 1fr)", gap: 20 }}>

        {/* Texte de l'élève */}
        <div>
          {vueTexte === "courant" && !envoye && (
            <p style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginBottom: 8, fontStyle: "italic" }}>
              Sélectionne un passage pour proposer une correction. L&apos;élève la verra en temps réel.
            </p>
          )}
          <div
            ref={texteRef}
            onMouseUp={onMouseUpTexte}
            style={{
              background: "white",
              border: "1.5px solid var(--pb-outline-variant, #ddd)",
              borderRadius: 14, padding: "20px 24px",
              fontSize: 15, lineHeight: 1.9, fontFamily: "'Lora', Georgia, serif",
              color: "var(--pb-on-surface)", whiteSpace: "pre-wrap",
              minHeight: 320,
              userSelect: vueTexte === "courant" && !envoye ? "text" : "auto",
              cursor: vueTexte === "courant" && !envoye ? "text" : "default",
            }}
          >
            {texteAffiche.trim() ? (
              segments.map((s, i) =>
                s.type === "normal" ? (
                  <span key={i}>{s.text}</span>
                ) : (
                  <mark
                    key={i}
                    style={{
                      background: STATUT_COULEURS[s.ann.statut].bg,
                      color: STATUT_COULEURS[s.ann.statut].fg,
                      borderBottom: `2px solid ${STATUT_COULEURS[s.ann.statut].fg}`,
                      padding: "1px 0", borderRadius: 2, fontWeight: 600,
                    }}
                    title={`${s.ann.suggestion}${s.ann.commentaire ? " · " + s.ann.commentaire : ""}`}
                  >
                    {s.text}
                  </mark>
                )
              )
            ) : (
              <p style={{ color: "var(--pb-on-surface-variant)", fontStyle: "italic", margin: 0 }}>
                Pas encore de texte.
              </p>
            )}
          </div>

          {/* Bouton IA */}
          {vueTexte === "courant" && !envoye && contenu.texte_courant.trim() && (
            <div style={{ marginTop: 12 }}>
              <button
                onClick={genererSuggestionsIA}
                disabled={iaEnCours}
                style={{
                  background: "linear-gradient(135deg, #7C3AED, #4338CA)",
                  color: "white", border: "none", borderRadius: 10,
                  padding: "10px 18px", fontSize: 13, fontWeight: 700,
                  cursor: iaEnCours ? "not-allowed" : "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  display: "inline-flex", alignItems: "center", gap: 6,
                  opacity: iaEnCours ? 0.6 : 1,
                }}
              >
                <span className="ms" style={{ fontSize: 18 }}>auto_awesome</span>
                {iaEnCours ? "Analyse du texte…" : "Proposer des corrections (IA)"}
              </button>
            </div>
          )}

          {/* Liste suggestions IA en attente de validation */}
          {suggestionsIA.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Suggestions IA ({suggestionsIA.length}) — valide celles que tu veux poser
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {suggestionsIA.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      background: "white", border: "1.5px solid #DDD6FE", borderRadius: 12,
                      padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 13 }}>
                      <span style={{ color: "#991B1B", fontStyle: "italic" }}>« {s.extrait} »</span>
                      <span className="ms" style={{ fontSize: 14, color: "#6B7280", margin: "0 6px", verticalAlign: "middle" }}>arrow_right_alt</span>
                      <span style={{ color: "#166534", fontWeight: 700 }}>« {s.suggestion} »</span>
                    </div>
                    {s.commentaire && (
                      <div style={{ fontSize: 12, color: "#4338CA", fontStyle: "italic" }}>
                        {s.commentaire}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button
                        onClick={() => rejeterSuggestionIA(s)}
                        style={{
                          background: "white", color: "#6B7280",
                          border: "1px solid #ddd", borderRadius: 8,
                          padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        Ignorer
                      </button>
                      <button
                        onClick={() => validerSuggestionIA(s)}
                        style={{
                          background: "#4338CA", color: "white", border: "none",
                          borderRadius: 8, padding: "4px 14px", fontSize: 12,
                          fontWeight: 700, cursor: "pointer",
                        }}
                      >
                        Poser cette annotation
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Panneau latéral : form sélection + liste annotations */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {selection && vueTexte === "courant" && !envoye && (
            <div style={{
              background: "#F5F3FF", border: "1.5px solid #C4B5FD",
              borderRadius: 14, padding: "16px 18px",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#4338CA", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Nouvelle annotation
              </div>
              <div style={{ fontSize: 13, fontStyle: "italic", color: "#6B21A8", marginBottom: 10 }}>
                « {selection.extrait} »
              </div>
              <input
                type="text"
                value={formSuggestion}
                onChange={(e) => setFormSuggestion(e.target.value)}
                placeholder="Proposition de correction"
                style={{
                  width: "100%", padding: "8px 12px", fontSize: 13,
                  border: "1px solid var(--pb-outline-variant, #ccc)", borderRadius: 8,
                  marginBottom: 8, fontFamily: "inherit",
                }}
              />
              <textarea
                value={formCommentaire}
                onChange={(e) => setFormCommentaire(e.target.value)}
                placeholder="Commentaire pédagogique (optionnel)"
                rows={2}
                style={{
                  width: "100%", padding: "8px 12px", fontSize: 13,
                  border: "1px solid var(--pb-outline-variant, #ccc)", borderRadius: 8,
                  marginBottom: 10, fontFamily: "inherit", resize: "vertical",
                }}
              />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setSelection(null)}
                  style={{
                    background: "white", color: "#6B7280",
                    border: "1px solid #ddd", borderRadius: 8,
                    padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={enregistrerAnnotation}
                  disabled={!formSuggestion.trim() || enregistrement}
                  style={{
                    background: "#4338CA", color: "white", border: "none",
                    borderRadius: 8, padding: "6px 14px", fontSize: 12,
                    fontWeight: 700, cursor: (!formSuggestion.trim() || enregistrement) ? "not-allowed" : "pointer",
                    opacity: (!formSuggestion.trim() || enregistrement) ? 0.5 : 1,
                  }}
                >
                  {enregistrement ? "Envoi…" : "Poser"}
                </button>
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--pb-on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Annotations ({contenu.annotations.length})
            </div>
            {contenu.annotations.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", fontStyle: "italic", margin: 0 }}>
                Aucune annotation pour le moment.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {contenu.annotations.map((a) => {
                  const c = STATUT_COULEURS[a.statut];
                  return (
                    <div
                      key={a.id}
                      style={{
                        background: "white", border: `1.5px solid ${c.fg}33`, borderRadius: 10,
                        padding: "10px 12px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                          background: c.bg, color: c.fg,
                        }}>
                          {c.label}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--pb-on-surface-variant)" }}>
                          {a.date}
                        </span>
                        <button
                          onClick={() => supprimerAnnotation(a.id)}
                          style={{
                            marginLeft: "auto", background: "transparent", border: "none",
                            cursor: "pointer", color: "#6B7280", padding: 0,
                          }}
                          title="Supprimer"
                        >
                          <span className="ms" style={{ fontSize: 16 }}>delete</span>
                        </button>
                      </div>
                      <div style={{ fontSize: 12, color: "#991B1B", fontStyle: "italic", marginBottom: 4 }}>
                        « {a.extrait} »
                      </div>
                      <div style={{ fontSize: 13, color: "#166534", fontWeight: 600, marginBottom: 4 }}>
                        → {a.suggestion}
                      </div>
                      {a.commentaire && (
                        <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", fontStyle: "italic" }}>
                          {a.commentaire}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
