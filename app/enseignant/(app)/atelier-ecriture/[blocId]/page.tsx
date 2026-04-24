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
  const [iaEditIndex, setIaEditIndex] = useState<number | null>(null);
  const [iaExtraitEnCours, setIaExtraitEnCours] = useState(false);

  // Édition du texte
  const [editionTexte, setEditionTexte] = useState(false);
  const [brouillonTexte, setBrouillonTexte] = useState("");
  const [sauvegardeTexte, setSauvegardeTexte] = useState(false);

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
    // Position ABSOLUE de la sélection dans le texte (via un range du début
    // du container jusqu'au début de la sélection). Évite le bug du indexOf
    // qui tombait toujours sur la 1re occurrence quand le mot apparaît
    // plusieurs fois (ex : deux « c'est » dans le texte).
    let debut = texteAffiche.indexOf(text); // fallback si le range échoue
    try {
      const preRange = document.createRange();
      preRange.selectNodeContents(texteRef.current);
      preRange.setEnd(range.startContainer, range.startOffset);
      debut = preRange.toString().length;
    } catch {}
    if (debut < 0) {
      setSelection(null);
      return;
    }
    setSelection({ debut, fin: debut + text.length, extrait: text });
    setFormSuggestion("");
    setFormCommentaire("");
    setIaEditIndex(null);
  }

  function editerSuggestionDepuisTexte(idx: number) {
    const s = suggestionsIA[idx];
    if (!s) return;
    // Recale la position réelle dans le texte (au cas où)
    let debut = s.debut;
    let fin = s.fin;
    if (texteAffiche.slice(debut, fin) !== s.extrait) {
      const pos = texteAffiche.indexOf(s.extrait);
      if (pos >= 0) {
        debut = pos;
        fin = pos + s.extrait.length;
      }
    }
    setSelection({ debut, fin, extrait: s.extrait });
    setFormSuggestion(s.suggestion);
    setFormCommentaire(s.commentaire ?? "");
    setIaEditIndex(idx);
    window.getSelection()?.removeAllRanges();
  }

  function annulerFormulaire() {
    setSelection(null);
    setFormSuggestion("");
    setFormCommentaire("");
    setIaEditIndex(null);
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
        const data = await res.json();
        const nouvelles: Annotation[] = data.annotations ?? [];
        if (iaEditIndex !== null) {
          const idx = iaEditIndex;
          setSuggestionsIA((prev) => prev.filter((_, i) => i !== idx));
        }
        setContenu((prev) => (prev ? { ...prev, annotations: [...prev.annotations, ...nouvelles] } : prev));
        setSelection(null);
        setFormSuggestion("");
        setFormCommentaire("");
        setIaEditIndex(null);
      }
    } catch {}
    setEnregistrement(false);
  }

  async function supprimerAnnotation(id: string) {
    if (!confirm("Supprimer cette annotation ?")) return;
    const res = await fetch("/api/enseignant/ecriture/annotation", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocId, id }),
    });
    if (res.ok) {
      setContenu((prev) => (prev ? { ...prev, annotations: prev.annotations.filter((a) => a.id !== id) } : prev));
    }
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
        body: JSON.stringify({ texte: contenu.texte_courant, sujet: contenu.sujet, blocId }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestionsIA(data.suggestions ?? []);
      }
    } catch {}
    setIaEnCours(false);
  }

  async function validerSuggestionIA(idx: number) {
    const s = suggestionsIA[idx];
    if (!s || !s.suggestion.trim()) return;
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
            suggestion: s.suggestion.trim(),
            commentaire: s.commentaire.trim() || undefined,
          },
        ],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const nouvelles: Annotation[] = data.annotations ?? [];
      setSuggestionsIA((prev) => prev.filter((_, i) => i !== idx));
      setContenu((prev) => (prev ? { ...prev, annotations: [...prev.annotations, ...nouvelles] } : prev));
    }
  }

  function rejeterSuggestionIA(idx: number) {
    setSuggestionsIA((prev) => prev.filter((_, i) => i !== idx));
  }

  function modifierSuggestionIA(idx: number, champ: "suggestion" | "commentaire", valeur: string) {
    setSuggestionsIA((prev) => prev.map((s, i) => (i === idx ? { ...s, [champ]: valeur } : s)));
  }

  function demarrerEditionTexte() {
    if (!contenu) return;
    setBrouillonTexte(contenu.texte_courant);
    setEditionTexte(true);
    setSelection(null);
    setIaEditIndex(null);
  }

  async function enregistrerEditionTexte() {
    if (!contenu) return;
    setSauvegardeTexte(true);
    try {
      const res = await fetch("/api/enseignant/ecriture/texte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocId, texte: brouillonTexte }),
      });
      if (res.ok) {
        setContenu((prev) =>
          prev
            ? {
                ...prev,
                texte_courant: brouillonTexte,
                texte_final: prev.date_envoi && prev.texte_final ? brouillonTexte : prev.texte_final,
              }
            : prev
        );
        // Recale les suggestions IA dont l'extrait existe encore dans le nouveau texte ;
        // les autres (dont l'extrait a été modifié/supprimé) sont retirées.
        setSuggestionsIA((prev) => {
          const rescale: SuggestionIA[] = [];
          let curseur = 0;
          for (const s of prev) {
            const idx = brouillonTexte.indexOf(s.extrait, curseur);
            const pos = idx >= 0 ? idx : brouillonTexte.indexOf(s.extrait);
            if (pos < 0) continue;
            rescale.push({ ...s, debut: pos, fin: pos + s.extrait.length });
            curseur = pos + s.extrait.length;
          }
          return rescale;
        });
        setIaEditIndex(null);
        setEditionTexte(false);
      }
    } catch {}
    setSauvegardeTexte(false);
  }

  function annulerEditionTexte() {
    setEditionTexte(false);
    setBrouillonTexte("");
  }

  async function proposerIAExtrait() {
    if (!selection?.extrait || !contenu) return;
    setIaExtraitEnCours(true);
    try {
      const res = await fetch("/api/enseignant/ecriture/suggestion-extrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocId,
          extrait: selection.extrait,
          contexte: contenu.texte_courant,
          sujet: contenu.sujet,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.suggestion) setFormSuggestion(data.suggestion);
        if (data.commentaire) setFormCommentaire(data.commentaire);
      }
    } catch {}
    setIaExtraitEnCours(false);
  }

  async function validerToutesSuggestionsIA() {
    const valides = suggestionsIA.filter((s) => s.suggestion.trim());
    if (valides.length === 0) return;
    const res = await fetch("/api/enseignant/ecriture/annotation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocId,
        annotations: valides.map((s) => ({
          debut: s.debut,
          fin: s.fin,
          extrait: s.extrait,
          suggestion: s.suggestion.trim(),
          commentaire: s.commentaire.trim() || undefined,
        })),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const nouvelles: Annotation[] = data.annotations ?? [];
      setSuggestionsIA([]);
      setContenu((prev) => (prev ? { ...prev, annotations: [...prev.annotations, ...nouvelles] } : prev));
    }
  }

  // ── Affichage highlights (annotations existantes + suggestions IA en attente) ──
  const segments = useMemo(() => {
    if (!contenu) return [];
    type Seg =
      | { text: string; type: "normal" }
      | { text: string; type: "annotation"; ann: Annotation }
      | { text: string; type: "ia"; sug: SuggestionIA };
    if (vueTexte !== "courant") {
      return [{ text: texteAffiche, type: "normal" as const }] as Seg[];
    }
    type Mark =
      | { debut: number; fin: number; kind: "annotation"; ann: Annotation }
      | { debut: number; fin: number; kind: "ia"; sug: SuggestionIA };
    const marks: Mark[] = [];
    for (const a of contenu.annotations) {
      if (texteAffiche.slice(a.debut, a.fin) === a.extrait) {
        marks.push({ debut: a.debut, fin: a.fin, kind: "annotation", ann: a });
      } else {
        const idx = texteAffiche.indexOf(a.extrait);
        if (idx >= 0) marks.push({ debut: idx, fin: idx + a.extrait.length, kind: "annotation", ann: a });
      }
    }
    for (const s of suggestionsIA) {
      let debut = s.debut;
      let fin = s.fin;
      if (texteAffiche.slice(debut, fin) !== s.extrait) {
        const idx = texteAffiche.indexOf(s.extrait);
        if (idx < 0) continue;
        debut = idx;
        fin = idx + s.extrait.length;
      }
      // Skip si déjà couvert par une annotation posée
      const chevauche = marks.some((m) => m.kind === "annotation" && debut < m.fin && fin > m.debut);
      if (!chevauche) marks.push({ debut, fin, kind: "ia", sug: s });
    }
    if (marks.length === 0) {
      return [{ text: texteAffiche, type: "normal" as const }] as Seg[];
    }
    marks.sort((a, b) => a.debut - b.debut);
    const result: Seg[] = [];
    let offset = 0;
    for (const m of marks) {
      if (m.debut < offset) continue;
      if (m.debut > offset) result.push({ text: texteAffiche.slice(offset, m.debut), type: "normal" });
      if (m.kind === "annotation") {
        result.push({ text: texteAffiche.slice(m.debut, m.fin), type: "annotation", ann: m.ann });
      } else {
        result.push({ text: texteAffiche.slice(m.debut, m.fin), type: "ia", sug: m.sug });
      }
      offset = m.fin;
    }
    if (offset < texteAffiche.length) result.push({ text: texteAffiche.slice(offset), type: "normal" });
    return result;
  }, [contenu, texteAffiche, vueTexte, suggestionsIA]);

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
          <Link
            href={`/enseignant/atelier-ecriture/${blocId}/apercu-eleve`}
            style={{
              background: "white", color: "#4338CA",
              border: "1px solid #C4B5FD", borderRadius: 10,
              padding: "6px 12px", fontSize: 12, fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex", alignItems: "center", gap: 6,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            <span className="ms" style={{ fontSize: 16 }}>visibility</span>
            Voir comme l&apos;élève
          </Link>
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
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(320px, 1fr)", gap: 20, alignItems: "start" }}>

        {/* Texte de l'élève */}
        <div style={{ position: "sticky", top: 12 }}>
          {vueTexte === "courant" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <p style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", margin: 0, fontStyle: "italic", flex: 1, minWidth: 200 }}>
                Sélectionne un passage pour proposer une correction.
                {envoye
                  ? " Le texte a été envoyé : tes annotations resteront visibles pour l'élève."
                  : " L\u2019élève la verra en temps réel."}
              </p>
              {!editionTexte && (
                <button
                  onClick={demarrerEditionTexte}
                  style={{
                    background: "white", color: "#4338CA",
                    border: "1px solid #C4B5FD", borderRadius: 8,
                    padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}
                  title="Corriger directement le texte de l'élève"
                >
                  <span className="ms" style={{ fontSize: 14 }}>edit</span>
                  Éditer le texte
                </button>
              )}
            </div>
          )}
          {editionTexte ? (
            <div>
              <textarea
                value={brouillonTexte}
                onChange={(e) => setBrouillonTexte(e.target.value)}
                autoFocus
                style={{
                  width: "100%",
                  background: "#FFFBEB",
                  border: "1.5px solid #FCD34D",
                  borderRadius: 14, padding: "20px 24px",
                  fontSize: 15, lineHeight: 1.9, fontFamily: "'Lora', Georgia, serif",
                  color: "var(--pb-on-surface)",
                  minHeight: 320, resize: "vertical",
                }}
              />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  onClick={annulerEditionTexte}
                  disabled={sauvegardeTexte}
                  style={{
                    background: "white", color: "#6B7280",
                    border: "1px solid #ddd", borderRadius: 8,
                    padding: "6px 14px", fontSize: 12, fontWeight: 600,
                    cursor: sauvegardeTexte ? "not-allowed" : "pointer",
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={enregistrerEditionTexte}
                  disabled={sauvegardeTexte || brouillonTexte === contenu.texte_courant}
                  style={{
                    background: "#4338CA", color: "white", border: "none",
                    borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700,
                    cursor: (sauvegardeTexte || brouillonTexte === contenu.texte_courant) ? "not-allowed" : "pointer",
                    opacity: (sauvegardeTexte || brouillonTexte === contenu.texte_courant) ? 0.5 : 1,
                  }}
                >
                  {sauvegardeTexte ? "Sauvegarde…" : "Enregistrer"}
                </button>
              </div>
            </div>
          ) : (
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
              userSelect: vueTexte === "courant" ? "text" : "auto",
              cursor: vueTexte === "courant" ? "text" : "default",
            }}
          >
            {texteAffiche.trim() ? (
              segments.map((s, i) => {
                if (s.type === "normal") return <span key={i}>{s.text}</span>;
                if (s.type === "annotation") {
                  return (
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
                  );
                }
                const iaIdx = suggestionsIA.indexOf(s.sug);
                const estEnEdition = iaIdx !== -1 && iaIdx === iaEditIndex;
                return (
                  <mark
                    key={i}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (iaIdx !== -1) editerSuggestionDepuisTexte(iaIdx);
                    }}
                    style={{
                      background: estEnEdition ? "#FDE68A" : "#FEF3C7",
                      color: "#7C3AED",
                      borderBottom: `2px ${estEnEdition ? "solid" : "dashed"} #7C3AED`,
                      padding: "1px 2px", borderRadius: 2, fontWeight: 600,
                      cursor: "pointer",
                    }}
                    title={`Clique pour retoucher : ${s.sug.suggestion}${s.sug.commentaire ? " · " + s.sug.commentaire : ""}`}
                  >
                    {s.text}
                  </mark>
                );
              })
            ) : (
              <p style={{ color: "var(--pb-on-surface-variant)", fontStyle: "italic", margin: 0 }}>
                Pas encore de texte.
              </p>
            )}
          </div>
          )}

          {/* Bouton IA */}
          {!editionTexte && vueTexte === "courant" && contenu.texte_courant.trim() && (
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

        </div>

        {/* Panneau latéral : form sélection + liste annotations */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {selection && vueTexte === "courant" && (
            <div style={{
              background: iaEditIndex !== null ? "#FEF3C7" : "#F5F3FF",
              border: `1.5px solid ${iaEditIndex !== null ? "#FCD34D" : "#C4B5FD"}`,
              borderRadius: 14, padding: "16px 18px",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: iaEditIndex !== null ? "#92400E" : "#4338CA", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em", display: "inline-flex", alignItems: "center", gap: 4 }}>
                {iaEditIndex !== null && <span className="ms" style={{ fontSize: 14 }}>auto_awesome</span>}
                {iaEditIndex !== null ? "Suggestion IA — retouche puis pose" : "Nouvelle annotation"}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, fontStyle: "italic", color: "#6B21A8" }}>
                  « {selection.extrait} »
                </div>
                {iaEditIndex === null && (
                  <button
                    onClick={proposerIAExtrait}
                    disabled={iaExtraitEnCours}
                    style={{
                      background: "linear-gradient(135deg, #7C3AED, #4338CA)",
                      color: "white", border: "none", borderRadius: 8,
                      padding: "4px 10px", fontSize: 11, fontWeight: 700,
                      cursor: iaExtraitEnCours ? "not-allowed" : "pointer",
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      display: "inline-flex", alignItems: "center", gap: 4,
                      opacity: iaExtraitEnCours ? 0.6 : 1,
                    }}
                    title="Demander une proposition IA pour ce passage"
                  >
                    <span className="ms" style={{ fontSize: 14 }}>auto_awesome</span>
                    {iaExtraitEnCours ? "IA…" : "Proposition IA"}
                  </button>
                )}
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
                rows={Math.max(3, Math.ceil((formCommentaire.length || 0) / 60))}
                style={{
                  width: "100%", padding: "8px 12px", fontSize: 13, lineHeight: 1.5,
                  border: "1px solid var(--pb-outline-variant, #ccc)", borderRadius: 8,
                  marginBottom: 10, fontFamily: "inherit", resize: "vertical",
                }}
              />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button
                  onClick={annulerFormulaire}
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

          {/* Suggestions IA éditables */}
          {suggestionsIA.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.06em", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span className="ms" style={{ fontSize: 14 }}>auto_awesome</span>
                  Suggestions IA ({suggestionsIA.length})
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => setSuggestionsIA([])}
                    style={{
                      background: "white", color: "#6B7280",
                      border: "1px solid #ddd", borderRadius: 8,
                      padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Tout ignorer
                  </button>
                  <button
                    onClick={validerToutesSuggestionsIA}
                    style={{
                      background: "#4338CA", color: "white", border: "none",
                      borderRadius: 8, padding: "4px 12px", fontSize: 12,
                      fontWeight: 700, cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    <span className="ms" style={{ fontSize: 16 }}>done_all</span>
                    Tout valider
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {suggestionsIA.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      background: "white", border: "1.5px solid #DDD6FE", borderRadius: 10,
                      padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6,
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#991B1B", fontStyle: "italic" }}>
                      « {s.extrait} »
                    </div>
                    <input
                      type="text"
                      value={s.suggestion}
                      onChange={(e) => modifierSuggestionIA(i, "suggestion", e.target.value)}
                      placeholder="Proposition de correction"
                      style={{
                        width: "100%", padding: "6px 10px", fontSize: 13, fontWeight: 600,
                        color: "#166534", background: "#F0FDF4",
                        border: "1px solid #BBF7D0", borderRadius: 8, fontFamily: "inherit",
                      }}
                    />
                    <textarea
                      value={s.commentaire}
                      onChange={(e) => modifierSuggestionIA(i, "commentaire", e.target.value)}
                      placeholder="Commentaire pédagogique (optionnel)"
                      rows={Math.max(2, Math.ceil((s.commentaire?.length ?? 0) / 40))}
                      style={{
                        width: "100%", padding: "6px 10px", fontSize: 12, lineHeight: 1.4,
                        color: "#4338CA", fontStyle: "italic",
                        border: "1px solid #E0E7FF", borderRadius: 8, fontFamily: "inherit", resize: "vertical",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button
                        onClick={() => rejeterSuggestionIA(i)}
                        style={{
                          background: "white", color: "#6B7280",
                          border: "1px solid #ddd", borderRadius: 6,
                          padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        Ignorer
                      </button>
                      <button
                        onClick={() => validerSuggestionIA(i)}
                        disabled={!s.suggestion.trim()}
                        style={{
                          background: "#4338CA", color: "white", border: "none",
                          borderRadius: 6, padding: "3px 12px", fontSize: 11,
                          fontWeight: 700, cursor: s.suggestion.trim() ? "pointer" : "not-allowed",
                          opacity: s.suggestion.trim() ? 1 : 0.5,
                        }}
                      >
                        Poser
                      </button>
                    </div>
                  </div>
                ))}
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
