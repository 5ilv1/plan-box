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
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastInternalTexte = useRef<string>(getTexteCourantInitial(contenu));
  // Statuts décidés localement par l'élève, que le polling ne doit pas écraser
  const statutsLocauxRef = useRef<Map<string, Annotation["statut"]>>(new Map());

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
          // Préserve les statuts décidés localement par l'élève (accepte/ignore/lue)
          // pour que le polling ne fasse pas réapparaître une annotation déjà traitée.
          const merged = (data.annotations as Annotation[]).map((a) => {
            const override = statutsLocauxRef.current.get(a.id);
            return override ? { ...a, statut: override } : a;
          });
          setAnnotations(merged);
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
  async function envoyer(estFinal: boolean = false) {
    if (apercu) return;
    if (!texte.trim()) return;
    const question = estFinal
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
        body: JSON.stringify({ blocId, texte, eleveRbId, final: estFinal }),
      });
      if (res.ok) {
        setEnvoye(true);
        if (estFinal) setFinalise(true);
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
    // Mise à jour optimiste immédiate : l'annotation disparaît sans attendre le réseau
    setTexte(nouveauTexte);
    statutsLocauxRef.current.set(ann.id, "acceptee");
    setAnnotations((prev) =>
      prev.map((a) => (a.id === ann.id ? { ...a, statut: "acceptee" as const } : a))
    );
    // Sync serveur en arrière-plan
    if (!apercu) {
      fetch("/api/enseignant/ecriture/annotation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocId, id: ann.id, statut: "acceptee", eleveRbId }),
      }).catch(() => {});
    }
  }

  async function garderMonTexte(ann: Annotation) {
    // Optimiste : on marque immédiatement et on laisse la requête partir en arrière-plan
    statutsLocauxRef.current.set(ann.id, "ignoree");
    setAnnotations((prev) =>
      prev.map((a) => (a.id === ann.id ? { ...a, statut: "ignoree" as const } : a))
    );
    if (!apercu) {
      fetch("/api/enseignant/ecriture/annotation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocId, id: ann.id, statut: "ignoree", eleveRbId }),
      }).catch(() => {});
    }
  }

  // Annotations actives = non acceptées, non ignorées
  const annotationsActives = useMemo(
    () => annotations.filter((a) => a.statut !== "acceptee" && a.statut !== "ignoree"),
    [annotations]
  );

  const nbMots = texte.trim() ? texte.trim().split(/\s+/).length : 0;

  // Positions en cours des annotations du maître (recalées sur le texte actuel)
  // Ne garde que celles dont l'extrait est toujours présent dans le texte.
  const teacherRanges = useMemo(() => {
    const ranges: Array<{ debut: number; fin: number; id: string }> = [];
    for (const a of annotationsActives) {
      let debut = a.debut;
      let fin = a.fin;
      if (texte.slice(debut, fin) !== a.extrait) {
        const idx = texte.indexOf(a.extrait);
        if (idx < 0) continue;
        debut = idx;
        fin = idx + a.extrait.length;
      }
      ranges.push({ debut, fin, id: a.id });
    }
    return ranges;
  }, [annotationsActives, texte]);

  // Annotations affichées dans le panneau bleu : uniquement celles encore
  // applicables (extrait présent dans le texte), pour rester cohérent avec
  // le surlignage.
  const annotationsAffichees = useMemo(() => {
    const idsApplicables = new Set(teacherRanges.map((t) => t.id));
    return annotationsActives.filter((a) => idsApplicables.has(a.id));
  }, [annotationsActives, teacherRanges]);

  const nbNouvelles = useMemo(
    () => annotationsAffichees.filter((a) => a.statut === "nouvelle").length,
    [annotationsAffichees]
  );

  // Erreurs IA encore valides :
  //  - retrouve le mot à la position stockée, sinon via indexOf dans le texte
  //  - si le mot n'est nulle part, l'erreur a été corrigée → on la jette
  //  - la position ne doit pas chevaucher une annotation du maître
  const erreursIAVisibles = useMemo(() => {
    return erreursIA
      .map((e): ErreurIA | null => {
        if (!e.mot) return null;
        const motLower = e.mot.toLowerCase();
        let pos = e.position;
        const valid =
          pos >= 0 &&
          pos + e.mot.length <= texte.length &&
          texte.substring(pos, pos + e.mot.length).toLowerCase() === motLower;
        if (!valid) {
          pos = texte.toLowerCase().indexOf(motLower);
          if (pos < 0) return null;
        }
        const fin = pos + e.mot.length;
        if (teacherRanges.some((t) => pos < t.fin && fin > t.debut)) return null;
        return { ...e, position: pos };
      })
      .filter((e): e is ErreurIA => e !== null);
  }, [erreursIA, teacherRanges, texte]);

  // HTML surligné pour le contentEditable : rouge = IA, bleu = maître
  const htmlSurligne = useMemo(() => {
    type Mark = { debut: number; fin: number; type: "teacher" | "ia" };
    const marks: Mark[] = teacherRanges.map((t) => ({ debut: t.debut, fin: t.fin, type: "teacher" as const }));

    for (const e of erreursIAVisibles) {
      if (!e.mot) continue;
      const debut = e.position;
      const fin = debut + e.mot.length;
      if (debut < 0 || fin > texte.length) continue;
      const chevauche = marks.some((mk) => debut < mk.fin && fin > mk.debut);
      if (!chevauche) marks.push({ debut, fin, type: "ia" });
    }

    const escape = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    if (marks.length === 0) return escape(texte);
    marks.sort((a, b) => a.debut - b.debut);

    let html = "";
    let offset = 0;
    for (const m of marks) {
      if (m.debut < offset) continue;
      if (m.debut > offset) html += escape(texte.slice(offset, m.debut));
      const seg = escape(texte.slice(m.debut, m.fin));
      const color = m.type === "ia" ? "#DC2626" : "#2563EB";
      html += `<span style="color:${color};font-weight:800;">${seg}</span>`;
      offset = m.fin;
    }
    if (offset < texte.length) html += escape(texte.slice(offset));
    return html;
  }, [texte, erreursIAVisibles, teacherRanges]);

  // Sync HTML surligné dans le contentEditable, en préservant la position du
  // curseur. On n'écrit dans le DOM que si le contenu HTML attendu diffère.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML === htmlSurligne) return;
    // Sauve la position du curseur (offset caractère depuis le début du div)
    let caretOffset: number | null = null;
    if (document.activeElement === el) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (el.contains(range.endContainer)) {
          const pre = document.createRange();
          pre.selectNodeContents(el);
          pre.setEnd(range.endContainer, range.endOffset);
          caretOffset = pre.toString().length;
        }
      }
    }
    el.innerHTML = htmlSurligne;
    // Restaure le curseur
    if (caretOffset !== null) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let charsLeft = caretOffset;
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const len = node.textContent?.length ?? 0;
        if (charsLeft <= len) {
          const range = document.createRange();
          range.setStart(node, charsLeft);
          range.collapse(true);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          break;
        }
        charsLeft -= len;
      }
    }
  }, [htmlSurligne]);

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

      {/* ── Zone d'édition (contentEditable avec surlignage inline) ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          ref={editorRef}
          contentEditable={!verrouille && !apercu}
          suppressContentEditableWarning
          spellCheck={false}
          onInput={(e) => {
            if (verrouille || apercu) return;
            const t = (e.currentTarget as HTMLDivElement).innerText;
            lastInternalTexte.current = t;
            setTexte(t);
          }}
          onFocus={(e) => { if (!verrouille) (e.currentTarget as HTMLDivElement).style.borderColor = "#7C3AED"; }}
          onBlur={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--pb-outline-variant, #ccc)"; }}
          style={{
            width: "100%", minHeight: 320, padding: "20px",
            borderRadius: 14, border: "1.5px solid var(--pb-outline-variant, #ccc)",
            fontSize: 15, lineHeight: 1.8, fontFamily: "Manrope, sans-serif",
            color: "var(--pb-on-surface)",
            background: verrouille ? "#FAFAFA" : "white",
            outline: "none", transition: "border-color 0.2s",
            cursor: verrouille ? "default" : "text",
            whiteSpace: "pre-wrap", wordBreak: "break-word",
            boxSizing: "border-box",
          }}
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
          {erreursIAVisibles.length > 0 && (
            <span style={{ color: "#DC2626", fontWeight: 600 }}>
              {erreursIAVisibles.length} erreur{erreursIAVisibles.length > 1 ? "s" : ""} à corriger
            </span>
          )}
        </div>
      </div>

      {/* ── Liste des erreurs IA ── */}
      {erreursIAVisibles.length > 0 && (
        <div style={{
          background: "#FEF2F2", border: "1.5px solid #FECACA",
          borderRadius: 14, padding: "14px 18px",
        }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#B91C1C", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span className="ms" style={{ fontSize: 18 }}>spellcheck</span>
            {erreursIAVisibles.length} erreur{erreursIAVisibles.length > 1 ? "s" : ""} à corriger
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {erreursIAVisibles.map((e, i) => (
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

      {/* ── Propositions du maître ── */}
      {annotationsAffichees.length > 0 && (
        <div style={{
          background: "#EFF6FF", border: "1.5px solid #BFDBFE",
          borderRadius: 14, padding: "14px 18px",
        }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 13, color: "#1D4ED8", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span className="ms" style={{ fontSize: 18 }}>auto_awesome</span>
            {annotationsAffichees.length} correction{annotationsAffichees.length > 1 ? "s" : ""} du maître
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {annotationsAffichees.map((a) => (
              <div
                key={a.id}
                style={{
                  background: "white", border: "1px solid #BFDBFE",
                  borderRadius: 10, padding: "10px 14px",
                  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                  fontFamily: "Manrope, sans-serif",
                }}
                onMouseEnter={() => {
                  if (a.statut === "nouvelle" && !apercu) {
                    statutsLocauxRef.current.set(a.id, "lue");
                    setAnnotations((prev) =>
                      prev.map((x) => (x.id === a.id ? { ...x, statut: "lue" as const } : x))
                    );
                    fetch("/api/enseignant/ecriture/annotation", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ blocId, id: a.id, statut: "lue", eleveRbId }),
                    }).catch(() => {});
                  }
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 800, color: "#1D4ED8" }}>
                  {a.extrait}
                </span>
                <span className="ms" style={{ fontSize: 18, color: "#9CA3AF" }}>arrow_forward</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#059669" }}>
                  {a.suggestion}
                </span>
                {a.commentaire && (
                  <span style={{ fontSize: 12, color: "#1E40AF", fontStyle: "italic", flex: 1, minWidth: 120 }}>
                    {a.commentaire}
                  </span>
                )}
                {!verrouille && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => garderMonTexte(a)}
                      style={{
                        background: "white", color: "var(--pb-on-surface-variant)",
                        border: "1px solid var(--pb-outline-variant, #ddd)", borderRadius: 8,
                        padding: "6px 12px", fontSize: 12, fontWeight: 600,
                        cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
                        minHeight: 36,
                      }}
                    >
                      Laisser
                    </button>
                    <button
                      type="button"
                      onClick={() => appliquerAnnotation(a)}
                      style={{
                        background: "#1D4ED8", color: "white", border: "none",
                        borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700,
                        cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
                        display: "inline-flex", alignItems: "center", gap: 4,
                        minHeight: 36,
                      }}
                    >
                      <span className="ms" style={{ fontSize: 14 }}>check</span>
                      Modifier
                    </button>
                  </div>
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
