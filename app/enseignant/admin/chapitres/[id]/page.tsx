"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import EnseignantLayout from "@/components/EnseignantLayout";
import AffecterExerciceModal from "@/components/AffecterExerciceModal";

interface QuestionExercice {
  id: number;
  enonce: string;
  reponse_attendue: string;
  indice?: string;
}

interface ExerciceContenu {
  titre?: string;
  consigne?: string;
  questions?: QuestionExercice[];
  calculs?: { id: number; enonce: string; reponse: string }[];
}

interface ExerciceStats {
  total: number;
  valides: number;
}

interface Exercice {
  id: string;
  type: "exercice" | "calcul_mental";
  matiere: string | null;
  titre: string | null;
  contenu: ExerciceContenu;
  nb_utilisations: number;
  ordre: number | null;
  created_at: string;
  stats: ExerciceStats;
}

interface Chapitre {
  id: string;
  titre: string;
  matiere: string;
  description: string | null;
  nb_cartes_eval: number;
  seuil_reussite: number;
  created_at: string;
  niveaux?: { nom: string };
}

const DRAG_THRESHOLD = 6;

export default function PageChapitrDetail() {
  const { id: chapitreId } = useParams<{ id: string }>();
  const router = useRouter();

  // Données
  const [chapitre, setChapitre] = useState<Chapitre | null>(null);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [chargement, setChargement] = useState(true);

  // Édition paramètres chapitre
  const [editParams, setEditParams] = useState(false);
  const [seuil, setSeuil] = useState(90);
  const [nbCartes, setNbCartes] = useState(20);
  const [enSauvegardeParams, setEnSauvegardeParams] = useState(false);

  // Édition exercice inline
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [editTitre, setEditTitre] = useState("");
  const [editConsigne, setEditConsigne] = useState("");
  const [editQuestions, setEditQuestions] = useState<QuestionExercice[]>([]);
  const [enSauvegardeExo, setEnSauvegardeExo] = useState(false);
  const [enRegeneration, setEnRegeneration] = useState(false);

  // Aperçu modal
  const [apercu, setApercu] = useState<Exercice | null>(null);

  // Affectation
  const [aAffecter, setAAffecter] = useState<Exercice | null>(null);

  // Duplication
  const [enDuplication, setEnDuplication] = useState<string | null>(null);

  // Suppression
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const [nbNonFait, setNbNonFait] = useState<number | null>(null);
  const [enSuppression, setEnSuppression] = useState(false);

  // DnD vertical
  const dragIdRef = useRef<string | null>(null);
  const dragOrigIdxRef = useRef<number>(0);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dropIndexRef = useRef<number | null>(null);
  const exercicesRef = useRef<Exercice[]>([]);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  useEffect(() => { exercicesRef.current = exercices; }, [exercices]);
  useEffect(() => { dropIndexRef.current = dropIndex; }, [dropIndex]);

  useEffect(() => {
    // Vérif auth
    fetch("/api/admin/chapitres").then((r) => {
      if (r.status === 401) router.push("/enseignant");
    });
    charger();
  }, [chapitreId]);

  async function charger() {
    setChargement(true);
    const [chapRes, exRes] = await Promise.all([
      fetch(`/api/admin/chapitres/${chapitreId}`).then((r) => r.json()),
      fetch(`/api/admin/chapitres/${chapitreId}/exercices`).then((r) => r.json()),
    ]);

    if (chapRes.chapitre) {
      setChapitre(chapRes.chapitre);
      setSeuil(chapRes.chapitre.seuil_reussite ?? 90);
      setNbCartes(chapRes.chapitre.nb_cartes_eval ?? 20);
    }
    setExercices(exRes.exercices ?? []);
    setChargement(false);
  }

  async function sauvegarderParams() {
    setEnSauvegardeParams(true);
    await fetch("/api/admin/chapitres", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: chapitreId, seuil_reussite: seuil, nb_cartes_eval: nbCartes }),
    });
    setChapitre((prev) =>
      prev ? { ...prev, seuil_reussite: seuil, nb_cartes_eval: nbCartes } : prev
    );
    setEditParams(false);
    setEnSauvegardeParams(false);
  }

  async function mettreAJourOrdre(ordonnés: Exercice[]) {
    await fetch(`/api/admin/chapitres/${chapitreId}/exercices`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ordre: ordonnés.map((ex, i) => ({ id: ex.id, ordre: i + 1 })),
      }),
    });
  }

  function ouvrirEdition(ex: Exercice) {
    setEnEdition(ex.id);
    setEditTitre(ex.titre ?? "");
    setEditConsigne(ex.contenu.consigne ?? "");
    setEditQuestions(ex.contenu.questions ?? []);
    setEnRegeneration(false);
  }

  async function regenererQuestions(ex: Exercice) {
    setEnRegeneration(true);
    const res = await fetch("/api/regenerer-exercice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: ex.type,
        titre: editTitre || ex.titre,
        consigne: editConsigne || ex.contenu.consigne,
        nbElements: ex.type === "exercice"
          ? (ex.contenu.questions?.length || 10)
          : (ex.contenu.calculs?.length || 10),
        matiere: ex.matiere ?? chapitre?.matiere,
        niveau: chapitre?.niveaux?.nom ?? "CM",
      }),
    });
    const json = await res.json();
    if (json.resultat) {
      if (ex.type === "exercice" && json.resultat.questions) {
        setEditConsigne(json.resultat.consigne ?? editConsigne);
        setEditQuestions(json.resultat.questions);
      } else if (ex.type === "calcul_mental" && json.resultat.calculs) {
        // Met à jour les calculs directement dans le contenu
        await fetch("/api/admin/exercices", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: ex.id,
            titre: editTitre || ex.titre,
            contenu: { ...ex.contenu, calculs: json.resultat.calculs },
          }),
        });
        await charger();
        setEnEdition(null);
      }
    }
    setEnRegeneration(false);
  }

  async function sauvegarderExercice(exId: string) {
    setEnSauvegardeExo(true);
    const exActuel = exercices.find((e) => e.id === exId);
    const contenuMaj: ExerciceContenu = {
      ...exActuel?.contenu,
      titre: editTitre,
      consigne: editConsigne,
      questions: editQuestions,
    };

    await fetch("/api/admin/exercices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: exId, titre: editTitre, contenu: contenuMaj }),
    });

    setExercices((prev) =>
      prev.map((e) =>
        e.id === exId ? { ...e, titre: editTitre, contenu: contenuMaj } : e
      )
    );
    setEnEdition(null);
    setEnSauvegardeExo(false);
  }

  async function dupliquerExercice(ex: Exercice) {
    setEnDuplication(ex.id);
    await fetch("/api/admin/exercices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: ex.type,
        matiere: ex.matiere,
        chapitre_id: chapitreId,
        titre: `${ex.titre ?? "Sans titre"} (copie)`,
        contenu: ex.contenu,
        nb_utilisations: 0,
      }),
    });
    await charger();
    setEnDuplication(null);
  }

  async function initierSuppression(exId: string) {
    const res = await fetch(
      `/api/admin/chapitres/${chapitreId}/exercices?check_delete=${exId}`
    );
    const json = await res.json();
    setNbNonFait(json.nonFait ?? 0);
    setASupprimer(exId);
  }

  async function supprimerExercice() {
    if (!aSupprimer) return;
    setEnSuppression(true);
    await fetch(`/api/admin/exercices?id=${aSupprimer}&chapitre_id=${chapitreId}&force=true`, {
      method: "DELETE",
    });
    setExercices((prev) => prev.filter((e) => e.id !== aSupprimer));
    setASupprimer(null);
    setNbNonFait(null);
    setEnSuppression(false);
  }

  // ── DnD pointer events ────────────────────────────────────────────────────

  function handlePointerDown(e: React.PointerEvent, exId: string, idx: number) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragIdRef.current = exId;
    dragOrigIdxRef.current = idx;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = false;
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragIdRef.current || !startPosRef.current) return;
      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;

      if (!isDraggingRef.current && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        isDraggingRef.current = true;
        setDraggingId(dragIdRef.current);
      }

      if (!isDraggingRef.current) return;
      setGhostPos({ x: e.clientX, y: e.clientY });

      // Calcule drop index par midpoint des lignes
      const exs = exercicesRef.current;
      let targetIdx = exs.length;
      for (let i = 0; i < exs.length; i++) {
        const el = rowRefs.current[exs[i].id];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
          targetIdx = i;
          break;
        }
      }
      setDropIndex(targetIdx);
      dropIndexRef.current = targetIdx;
    }

    function onUp() {
      if (isDraggingRef.current && dragIdRef.current !== null) {
        const fromIdx = dragOrigIdxRef.current;
        const toIdx = dropIndexRef.current ?? exercicesRef.current.length;
        const effectiveToIdx = toIdx > fromIdx ? toIdx - 1 : toIdx;

        if (fromIdx !== effectiveToIdx) {
          const newOrder = [...exercicesRef.current];
          const [removed] = newOrder.splice(fromIdx, 1);
          newOrder.splice(effectiveToIdx, 0, removed);
          setExercices(newOrder);
          mettreAJourOrdre(newOrder);
        }
      }

      dragIdRef.current = null;
      startPosRef.current = null;
      isDraggingRef.current = false;
      setDraggingId(null);
      setGhostPos(null);
      setDropIndex(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []); // refs évitent les stale closures

  // ── Rendu ────────────────────────────────────────────────────────────────

  if (chargement) {
    return (
      <EnseignantLayout>
        <div className="page">
          <div className="container" style={{ maxWidth: 760 }}>
            <div className="skeleton" style={{ height: 80, borderRadius: 12, marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 240, borderRadius: 12 }} />
          </div>
        </div>
      </EnseignantLayout>
    );
  }

  if (!chapitre) {
    return (
      <EnseignantLayout>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
          <div className="card" style={{ textAlign: "center", padding: "32px 24px" }}>
            <p style={{ marginBottom: 16 }}>Chapitre introuvable.</p>
            <Link href="/enseignant/admin/chapitres" className="btn-primary">← Retour</Link>
          </div>
        </div>
      </EnseignantLayout>
    );
  }

  const draggingEx = draggingId ? exercices.find((e) => e.id === draggingId) : null;

  return (
    <EnseignantLayout>
      {/* Sous-barre chapitre */}
      <div
        style={{
          background: "white",
          borderBottom: "1px solid var(--border)",
          padding: "8px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/enseignant/admin/chapitres" className="btn-ghost" style={{ padding: "4px 8px", fontSize: 13 }}>←</Link>
          <span style={{ fontWeight: 700, fontSize: 15 }}>📚 {chapitre.titre}</span>
          <span
            style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              background: "var(--bg)",
              padding: "2px 10px",
              borderRadius: 100,
              border: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            {chapitre.niveaux?.nom} · {chapitre.matiere}
          </span>
        </div>
        <Link
          href={`/enseignant/generer?chapitre=${chapitreId}`}
          className="btn-primary"
          style={{ fontSize: 13, whiteSpace: "nowrap" }}
        >
          + Ajouter un exercice
        </Link>
      </div>

      <div className="page">
        <div className="container" style={{ maxWidth: 760 }}>

          {/* ── Paramètres du chapitre ── */}
          <div className="card" style={{ marginBottom: 24, padding: "16px 20px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", display: "block" }}>
                    Seuil de réussite
                  </span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: "var(--primary)" }}>
                    {chapitre.seuil_reussite}%
                  </span>
                </div>
                <div
                  style={{
                    width: 1,
                    height: 36,
                    background: "var(--border)",
                    flexShrink: 0,
                  }}
                />
                <div>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", display: "block" }}>
                    Questions d'éval
                  </span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: "var(--primary)" }}>
                    {chapitre.nb_cartes_eval}
                  </span>
                </div>
              </div>

              <button
                className="btn-ghost"
                onClick={() => {
                  setEditParams(!editParams);
                  setSeuil(chapitre.seuil_reussite);
                  setNbCartes(chapitre.nb_cartes_eval);
                }}
                style={{ padding: "5px 14px", fontSize: 13 }}
              >
                {editParams ? "Annuler" : "Modifier"}
              </button>
            </div>

            {editParams && (
              <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                      Seuil de réussite : <strong>{seuil}%</strong>
                    </label>
                    <input
                      type="range" min={70} max={100} step={5} value={seuil}
                      onChange={(e) => setSeuil(+e.target.value)}
                      style={{ width: "100%" }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)" }}>
                      <span>70%</span><span>100%</span>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                      Questions d'éval : <strong>{nbCartes}</strong>
                    </label>
                    <input
                      type="range" min={10} max={30} step={5} value={nbCartes}
                      onChange={(e) => setNbCartes(+e.target.value)}
                      style={{ width: "100%" }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)" }}>
                      <span>10</span><span>30</span>
                    </div>
                  </div>
                </div>
                <button
                  className="btn-primary"
                  onClick={sauvegarderParams}
                  disabled={enSauvegardeParams}
                  style={{ width: "100%" }}
                >
                  {enSauvegardeParams ? "Sauvegarde…" : "✓ Enregistrer les paramètres"}
                </button>
              </div>
            )}
          </div>

          {/* ── Liste des exercices ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>📝 Exercices</h2>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {exercices.length} exercice{exercices.length !== 1 ? "s" : ""}
            </span>
          </div>

          {exercices.length === 0 ? (
            <div
              className="card"
              style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-secondary)" }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
              <p style={{ marginBottom: 20 }}>Aucun exercice pour ce chapitre.</p>
              <Link
                href={`/enseignant/generer?chapitre=${chapitreId}`}
                className="btn-primary"
                style={{ display: "inline-block" }}
              >
                Générer un exercice
              </Link>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              {exercices.map((ex, idx) => {
                const isDragging = ex.id === draggingId;
                const showDropBefore = dropIndex === idx && draggingId !== null;
                const showDropAfter =
                  dropIndex === exercices.length &&
                  idx === exercices.length - 1 &&
                  draggingId !== null;
                const nbQ = ex.contenu.questions?.length ?? 0;

                return (
                  <div key={ex.id}>
                    {/* Indicateur drop avant */}
                    {showDropBefore && (
                      <div
                        style={{
                          height: 3,
                          background: "var(--primary)",
                          borderRadius: 100,
                          margin: "4px 0",
                          boxShadow: "0 0 8px var(--primary-mid)",
                        }}
                      />
                    )}

                    <div
                      ref={(el) => { rowRefs.current[ex.id] = el; }}
                      className="card"
                      style={{
                        padding: "14px 16px",
                        marginBottom: 8,
                        opacity: isDragging ? 0.3 : 1,
                        transition: "opacity 0.15s",
                      }}
                    >
                      {/* Ligne principale */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

                        {/* Handle DnD */}
                        <div
                          onPointerDown={(e) => handlePointerDown(e, ex.id, idx)}
                          style={{
                            cursor: "grab",
                            padding: "4px 6px",
                            color: "var(--text-secondary)",
                            fontSize: 16,
                            flexShrink: 0,
                            touchAction: "none",
                            userSelect: "none",
                            lineHeight: 1,
                          }}
                          title="Glisser pour réordonner"
                        >
                          ⋮⋮
                        </div>

                        {/* Badge type */}
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            flexShrink: 0,
                            background: ex.type === "exercice" ? "#DBEAFE" : "#D1FAE5",
                            color: ex.type === "exercice" ? "#1E40AF" : "#065F46",
                          }}
                        >
                          {ex.type === "exercice" ? "📝" : "🔢"} {ex.type === "exercice" ? "Exercice" : "Calcul"}
                        </span>

                        {/* Titre + méta */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 14,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {ex.titre ?? "Sans titre"}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--text-secondary)",
                              marginTop: 2,
                              display: "flex",
                              gap: 12,
                            }}
                          >
                            {ex.type === "exercice" && nbQ > 0 && (
                              <span>{nbQ} question{nbQ !== 1 ? "s" : ""}</span>
                            )}
                            <span>
                              {new Date(ex.created_at).toLocaleDateString("fr-FR", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                        </div>

                        {/* Indicateur élèves */}
                        <div style={{ flexShrink: 0, textAlign: "right" }}>
                          {ex.stats.total > 0 ? (
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color:
                                  ex.stats.valides === ex.stats.total
                                    ? "var(--success)"
                                    : "var(--text-secondary)",
                              }}
                            >
                              {ex.stats.valides}/{ex.stats.total} ✅
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: "var(--border)" }}>
                              Non assigné
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <button
                            className="btn-secondary"
                            onClick={() => setApercu(ex)}
                            style={{ padding: "4px 10px", fontSize: 13, borderRadius: 6 }}
                          >
                            Aperçu
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={() => dupliquerExercice(ex)}
                            disabled={enDuplication === ex.id}
                            style={{ padding: "4px 10px", fontSize: 13, borderRadius: 6 }}
                          >
                            {enDuplication === ex.id ? "…" : "Dupliquer"}
                          </button>
                          <button
                            className="btn-primary"
                            onClick={() => setAAffecter(ex)}
                            style={{ padding: "4px 10px", fontSize: 13, borderRadius: 6 }}
                          >
                            Affecter
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={() =>
                              enEdition === ex.id ? setEnEdition(null) : ouvrirEdition(ex)
                            }
                            style={{
                              padding: "4px 10px",
                              fontSize: 13,
                              borderRadius: 6,
                              background: enEdition === ex.id ? "var(--primary-pale)" : undefined,
                            }}
                          >
                            Modifier
                          </button>
                          <button
                            className="btn-ghost"
                            onClick={() => initierSuppression(ex.id)}
                            style={{ padding: "5px 9px", fontSize: 14, color: "var(--text-secondary)" }}
                            title="Supprimer"
                          >
                            🗑
                          </button>
                        </div>
                      </div>

                      {/* ── Éditeur inline (exercice uniquement) ── */}
                      {enEdition === ex.id && ex.type === "exercice" && (
                        <div
                          style={{
                            marginTop: 16,
                            borderTop: "1px solid var(--border)",
                            paddingTop: 16,
                          }}
                        >
                          {/* Titre */}
                          <div className="form-group" style={{ marginBottom: 12 }}>
                            <label className="form-label" style={{ fontSize: 12 }}>Titre</label>
                            <input
                              type="text"
                              className="form-input"
                              value={editTitre}
                              onChange={(e) => setEditTitre(e.target.value)}
                              style={{ fontSize: 13 }}
                            />
                          </div>

                          {/* Consigne */}
                          <div className="form-group" style={{ marginBottom: 12 }}>
                            <label className="form-label" style={{ fontSize: 12 }}>Consigne</label>
                            <input
                              type="text"
                              className="form-input"
                              value={editConsigne}
                              onChange={(e) => setEditConsigne(e.target.value)}
                              style={{ fontSize: 13 }}
                            />
                          </div>

                          {/* Regénérer */}
                          <div style={{ marginBottom: 14 }}>
                            <button
                              className="btn-secondary"
                              onClick={() => regenererQuestions(ex)}
                              disabled={enRegeneration}
                              style={{ fontSize: 12, padding: "5px 12px", width: "100%" }}
                            >
                              {enRegeneration ? "Génération en cours…" : "Regénérer les questions avec l'IA"}
                            </button>
                          </div>

                          {/* Questions */}
                          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, color: "var(--text)" }}>
                            Questions
                          </div>

                          {editQuestions.map((q, qi) => (
                            <div
                              key={q.id}
                              style={{
                                marginBottom: 8,
                                padding: "10px 12px",
                                background: "var(--bg)",
                                borderRadius: 8,
                                border: "1px solid var(--border)",
                                display: "flex",
                                gap: 10,
                                alignItems: "flex-start",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 11,
                                  color: "var(--text-secondary)",
                                  fontWeight: 700,
                                  paddingTop: 8,
                                  minWidth: 24,
                                }}
                              >
                                Q{qi + 1}
                              </span>
                              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={q.enonce}
                                  onChange={(e) =>
                                    setEditQuestions((prev) =>
                                      prev.map((qq, i) =>
                                        i === qi ? { ...qq, enonce: e.target.value } : qq
                                      )
                                    )
                                  }
                                  placeholder="Énoncé de la question"
                                  style={{ fontSize: 12 }}
                                />
                                <input
                                  type="text"
                                  className="form-input"
                                  value={q.reponse_attendue}
                                  onChange={(e) =>
                                    setEditQuestions((prev) =>
                                      prev.map((qq, i) =>
                                        i === qi
                                          ? { ...qq, reponse_attendue: e.target.value }
                                          : qq
                                      )
                                    )
                                  }
                                  placeholder="Réponse attendue"
                                  style={{ fontSize: 12, borderColor: "var(--success)" }}
                                />
                                <input
                                  type="text"
                                  className="form-input"
                                  value={q.indice ?? ""}
                                  onChange={(e) =>
                                    setEditQuestions((prev) =>
                                      prev.map((qq, i) =>
                                        i === qi ? { ...qq, indice: e.target.value } : qq
                                      )
                                    )
                                  }
                                  placeholder="💡 Indice (optionnel)"
                                  style={{ fontSize: 12 }}
                                />
                              </div>
                              <button
                                onClick={() =>
                                  setEditQuestions((prev) => prev.filter((_, i) => i !== qi))
                                }
                                style={{
                                  padding: "4px 8px",
                                  fontSize: 13,
                                  background: "none",
                                  border: "none",
                                  color: "var(--error)",
                                  cursor: "pointer",
                                  flexShrink: 0,
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}

                          <button
                            className="btn-ghost"
                            onClick={() =>
                              setEditQuestions((prev) => [
                                ...prev,
                                {
                                  id: (prev[prev.length - 1]?.id ?? 0) + 1,
                                  enonce: "",
                                  reponse_attendue: "",
                                  indice: "",
                                },
                              ])
                            }
                            style={{ fontSize: 12, width: "100%", marginBottom: 12 }}
                          >
                            + Ajouter une question
                          </button>

                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              className="btn-primary"
                              onClick={() => sauvegarderExercice(ex.id)}
                              disabled={enSauvegardeExo}
                              style={{ flex: 1, fontSize: 13 }}
                            >
                              {enSauvegardeExo ? "Sauvegarde…" : "✓ Enregistrer"}
                            </button>
                            <button
                              className="btn-ghost"
                              onClick={() => setEnEdition(null)}
                              style={{ fontSize: 13 }}
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Indicateur drop après (dernier élément) */}
                    {showDropAfter && (
                      <div
                        style={{
                          height: 3,
                          background: "var(--primary)",
                          borderRadius: 100,
                          marginTop: 4,
                          boxShadow: "0 0 8px var(--primary-mid)",
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Ghost DnD ── */}
      {ghostPos && draggingEx && (
        <div
          style={{
            position: "fixed",
            left: ghostPos.x - 20,
            top: ghostPos.y - 24,
            zIndex: 1000,
            pointerEvents: "none",
            background: "white",
            borderRadius: 10,
            padding: "10px 16px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            border: "2px solid var(--primary)",
            transform: "rotate(1.5deg) scale(1.03)",
            fontSize: 14,
            fontWeight: 600,
            maxWidth: 280,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {draggingEx.type === "exercice" ? "📝" : "🔢"} {draggingEx.titre ?? "Exercice"}
        </div>
      )}

      {/* ── Modal aperçu ── */}
      {apercu && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
            padding: 24,
          }}
          onClick={() => setApercu(null)}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 560,
              maxHeight: "85vh",
              overflowY: "auto",
              padding: "24px 22px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: 18,
              }}
            >
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800 }}>
                  {apercu.type === "exercice" ? "📝" : "🔢"} {apercu.titre ?? "Aperçu"}
                </h3>
                {apercu.stats.total > 0 && (
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {apercu.stats.valides}/{apercu.stats.total} élèves ont validé
                  </span>
                )}
              </div>
              <button
                className="btn-ghost"
                onClick={() => setApercu(null)}
                style={{ padding: "4px 10px" }}
              >
                ✕
              </button>
            </div>

            {apercu.type === "exercice" && (
              <div>
                {apercu.contenu.consigne && (
                  <p style={{ fontWeight: 600, marginBottom: 14, color: "var(--text)" }}>
                    {apercu.contenu.consigne}
                  </p>
                )}
                {(apercu.contenu.questions ?? []).map((q, i) => (
                  <div
                    key={q.id}
                    style={{
                      marginBottom: 10,
                      padding: "10px 14px",
                      background: "var(--primary-pale)",
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {i + 1}. {q.enonce}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--primary)", marginTop: 4 }}>
                      → {q.reponse_attendue}
                    </div>
                    {q.indice && (
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                        💡 {q.indice}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {apercu.type === "calcul_mental" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(apercu.contenu.calculs ?? []).map((c, i) => (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "var(--bg)",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      {i + 1}. {c.enonce}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--success)", fontWeight: 700 }}>
                      = {c.reponse}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal affectation ── */}
      {aAffecter && (
        <AffecterExerciceModal
          exercice={{ id: aAffecter.id, type: aAffecter.type, titre: aAffecter.titre, contenu: aAffecter.contenu as unknown as Record<string, unknown>, chapitre_id: chapitreId }}
          onClose={() => setAAffecter(null)}
        />
      )}

      {/* ── Modal suppression ── */}
      {aSupprimer && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
            padding: 24,
          }}
        >
          <div
            className="card"
            style={{ maxWidth: 420, padding: "28px 24px", textAlign: "center" }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
            <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>
              Supprimer cet exercice ?
            </p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
              {exercices.find((e) => e.id === aSupprimer)?.titre ?? ""}
            </p>

            {nbNonFait !== null && nbNonFait > 0 && (
              <div
                style={{
                  background: "#FEF3C7",
                  border: "1px solid #FDE68A",
                  borderRadius: 8,
                  padding: "10px 14px",
                  marginBottom: 16,
                  fontSize: 13,
                  color: "#92400E",
                  textAlign: "left",
                }}
              >
                ⚠️ Cet exercice est assigné à{" "}
                <strong>{nbNonFait} élève{nbNonFait > 1 ? "s" : ""}</strong> qui ne l'ont
                pas encore complété. Ces tâches seront aussi supprimées du plan de travail.
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={supprimerExercice}
                disabled={enSuppression}
                style={{
                  padding: "8px 20px",
                  fontSize: 13,
                  background: "var(--error)",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {enSuppression ? "Suppression…" : "Confirmer"}
              </button>
              <button
                className="btn-ghost"
                onClick={() => { setASupprimer(null); setNbNonFait(null); }}
                style={{ fontSize: 13 }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </EnseignantLayout>
  );
}
