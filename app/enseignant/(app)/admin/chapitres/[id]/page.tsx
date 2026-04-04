"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────

type TypeExercice = "exercice" | "calcul_mental" | "texte_a_trous" | "analyse_phrase" | "qcm" | "classement" | "ecriture_contrainte" | "revision";

interface Exercice {
  id: string;
  chapitre_id: string;
  ordre: number;
  titre: string;
  type: TypeExercice;
  contenu: Record<string, unknown>;
  nb_questions: number;
  created_at: string;
}

interface Chapitre {
  id: string;
  titre: string;
  matiere: string;
  sous_matiere?: string | null;
  description: string | null;
  seuil_evaluation: number;
  seuil_reussite: number;
  seuil_exercice: number;
  nb_cartes_eval: number;
  created_at: string;
  niveaux?: { nom: string };
}

interface GroupeAssignation {
  id: string;
  nom: string;
  actif: boolean;
}

// ── Constantes ─────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<TypeExercice, { label: string; icon: string; bg: string; color: string }> = {
  exercice:        { label: "Exercice",        icon: "edit_note",    bg: "#DBEAFE", color: "#1E40AF" },
  calcul_mental:   { label: "Calcul mental",   icon: "calculate",    bg: "#D1FAE5", color: "#065F46" },
  texte_a_trous:   { label: "Texte à trous",   icon: "text_fields",  bg: "#E0F2FE", color: "#0369A1" },
  analyse_phrase:  { label: "Analyse phrase",   icon: "schema",       bg: "#EDE9FE", color: "#6D28D9" },
  qcm:             { label: "QCM",             icon: "quiz",         bg: "#FEF3C7", color: "#92400E" },
  classement:      { label: "Classement",      icon: "category",     bg: "#FCE7F3", color: "#9D174D" },
  ecriture_contrainte: { label: "Écriture",   icon: "edit",         bg: "#F3E8FF", color: "#7C3AED" },
  revision:            { label: "Révision",   icon: "menu_book",    bg: "#FEF3C7", color: "#D97706" },
};

const DRAG_THRESHOLD = 6;

// ── Page ───────────────────────────────────────────────────────────────────

export default function PageChapitreDetail() {
  const { id: chapitreId } = useParams<{ id: string }>();
  const router = useRouter();

  // Toast feedback
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string, type: "ok" | "err" = "ok") {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast({ msg, type });
    toastRef.current = setTimeout(() => setToast(null), 3500);
  }

  // Données
  const [chapitre, setChapitre] = useState<Chapitre | null>(null);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [groupes, setGroupes] = useState<GroupeAssignation[]>([]);
  const [chargement, setChargement] = useState(true);

  // Ajout exercice
  const [ajoutVisible, setAjoutVisible] = useState(false);
  const [ajoutType, setAjoutType] = useState<TypeExercice>("exercice");
  const [ajoutTitre, setAjoutTitre] = useState("");
  const [ajoutContexte, setAjoutContexte] = useState("");
  const [enGeneration, setEnGeneration] = useState(false);

  // Édition exercice
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [editTitre, setEditTitre] = useState("");
  const [enSauvegarde, setEnSauvegarde] = useState(false);

  // Aperçu exercice
  const [apercuId, setApercuId] = useState<string | null>(null);

  // Suppression
  const [aSupprimer, setASupprimer] = useState<string | null>(null);

  // Ajout révision
  const [revisionVisible, setRevisionVisible] = useState(false);
  const [revTitre, setRevTitre] = useState("");
  const [revIntro, setRevIntro] = useState("");
  const [revTexte, setRevTexte] = useState("");
  const [revRegleOr, setRevRegleOr] = useState("");
  const [revAstuce, setRevAstuce] = useState("");
  const [revVideo, setRevVideo] = useState("");
  const [revPointsCles, setRevPointsCles] = useState<string[]>([""]);
  const [revExemples, setRevExemples] = useState<Array<{ titre: string; colonnes: string[]; lignes: string[][] }>>([]);
  const [revGrille, setRevGrille] = useState<{ titre: string; items: Array<{ etiquette: string; texte: string }> } | null>(null);
  const [revContexte, setRevContexte] = useState("");
  const [enGenerationLecon, setEnGenerationLecon] = useState(false);

  // Édition révision
  const [editRevisionId, setEditRevisionId] = useState<string | null>(null);

  // Onglet actif (parcours | suivi)
  const [onglet, setOnglet] = useState<"parcours" | "suivi">("parcours");

  // Suivi élèves
  interface SuiviExercice { id: string; titre: string; type: string; ordre: number }
  interface SuiviEleve {
    id: string; prenom: string; nom: string; source: string;
    resultats: Record<string, { score: number; total: number; valide: boolean }>;
    evaluation: { score: number; total: number; pourcentage: number; reussi: boolean } | null;
  }
  interface SuiviStats {
    nbEleves: number; nbValides: number; scoreMoyenEval: number | null;
    exercicesProblematiques: Array<{ exerciceId: string; titre: string; tauxReussite: number; nbEchecs: number }>;
  }
  const [suiviEleves, setSuiviEleves] = useState<SuiviEleve[]>([]);
  const [suiviExercices, setSuiviExercices] = useState<SuiviExercice[]>([]);
  const [suiviStats, setSuiviStats] = useState<SuiviStats | null>(null);
  const [suiviChargement, setSuiviChargement] = useState(false);
  const suiviChargeRef = useRef(false);

  // Paramètres
  const [editParams, setEditParams] = useState(false);
  const [seuil, setSeuil] = useState(90);
  const [seuilExo, setSeuilExo] = useState(90);

  // DnD
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

  // ── Chargement ────────────────────────────────────────────────────────────

  useEffect(() => {
    charger();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapitreId]);

  async function charger() {
    setChargement(true);
    const [chapRes, exRes, grpRes] = await Promise.all([
      fetch(`/api/admin/chapitres/${chapitreId}`).then((r) => r.json()),
      fetch(`/api/chapitres/exercices?chapitre_id=${chapitreId}`).then((r) => r.json()),
      fetch(`/api/chapitres/assignation?chapitre_id=${chapitreId}`).then((r) => r.json()),
    ]);

    if (chapRes.chapitre) {
      setChapitre(chapRes.chapitre);
      setSeuil(chapRes.chapitre.seuil_evaluation ?? 90);
      setSeuilExo(chapRes.chapitre.seuil_exercice ?? 90);
    }
    setExercices(exRes.exercices ?? []);
    setGroupes(grpRes.groupes ?? []);
    setChargement(false);
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function toggleGroupe(groupeId: string, actif: boolean) {
    const ancien = groupes.map((g) => ({ ...g }));
    setGroupes((prev) => prev.map((g) => g.id === groupeId ? { ...g, actif } : g));
    try {
      const res = await fetch("/api/chapitres/assignation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapitre_id: chapitreId, groupe_id: groupeId, actif }),
      });
      if (!res.ok) throw new Error();
      showToast(actif ? "Groupe activé" : "Groupe désactivé");
    } catch {
      setGroupes(ancien);
      showToast("Erreur lors de la modification du groupe", "err");
    }
  }

  async function ajouterExercice() {
    if (!ajoutTitre.trim()) return;
    setEnGeneration(true);

    try {
      // 1. Générer le contenu via IA
      const genRes = await fetch("/api/chapitres/generer-exercice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapitre_id: chapitreId,
          type: ajoutType,
          contexte: ajoutContexte || ajoutTitre,
          nb_questions: 10,
        }),
      });
      const genJson = await genRes.json();

      if (!genRes.ok) throw new Error(genJson.erreur || "Erreur de génération");

      // 2. Créer l'exercice en base
      const createRes = await fetch("/api/chapitres/exercices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapitre_id: chapitreId,
          titre: genJson.titre || ajoutTitre,
          type: ajoutType,
          contenu: genJson.contenu,
          nb_questions: 10,
        }),
      });
      const createJson = await createRes.json();

      if (createJson.exercice) {
        setExercices((prev) => [...prev, createJson.exercice]);
      }

      // Reset form
      setAjoutTitre("");
      setAjoutContexte("");
      setAjoutVisible(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur lors de la génération");
    }

    setEnGeneration(false);
  }

  async function ajouterExerciceManuel() {
    if (!ajoutTitre.trim()) return;

    const contenuVide: Record<string, unknown> = {};
    if (ajoutType === "exercice" || ajoutType === "qcm") {
      contenuVide.titre = ajoutTitre;
      contenuVide.consigne = "";
      contenuVide.questions = [];
    } else if (ajoutType === "calcul_mental") {
      contenuVide.calculs = [];
    } else if (ajoutType === "texte_a_trous") {
      contenuVide.titre = ajoutTitre;
      contenuVide.consigne = "";
      contenuVide.texte_complet = "";
      contenuVide.trous = [];
    } else if (ajoutType === "classement") {
      contenuVide.titre = ajoutTitre;
      contenuVide.consigne = "";
      contenuVide.categories = [];
      contenuVide.items = [];
    } else if (ajoutType === "analyse_phrase") {
      contenuVide.titre = ajoutTitre;
      contenuVide.consigne = "";
      contenuVide.phrases = [];
    }

    try {
      const res = await fetch("/api/chapitres/exercices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapitre_id: chapitreId,
          titre: ajoutTitre,
          type: ajoutType,
          contenu: contenuVide,
          nb_questions: 10,
        }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      if (json.exercice) {
        setExercices((prev) => [...prev, json.exercice]);
      }
      showToast("Exercice créé");
      setAjoutTitre("");
      setAjoutContexte("");
      setAjoutVisible(false);
    } catch {
      showToast("Erreur lors de la création de l'exercice", "err");
    }
  }

  function buildRevisionContenu() {
    return {
      introduction: revIntro || undefined,
      grille: revGrille && revGrille.items.length > 0 ? revGrille : undefined,
      contenu_html: revTexte || undefined,
      texte: revTexte || undefined, // rétro-compatibilité
      regle_or: revRegleOr || undefined,
      astuce: revAstuce || undefined,
      video_url: revVideo || undefined,
      points_cles: revPointsCles.filter((p) => p.trim()),
      exemples: revExemples.filter((e) => e.colonnes.length > 0 && e.lignes.length > 0),
    };
  }

  async function ajouterRevision() {
    if (!revTitre.trim()) return;
    try {
      const res = await fetch("/api/chapitres/exercices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapitre_id: chapitreId,
          titre: revTitre,
          type: "revision",
          contenu: buildRevisionContenu(),
          nb_questions: 0,
        }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      if (json.exercice) {
        setExercices((prev) => [...prev, json.exercice]);
      }
      showToast("Révision ajoutée");
      resetRevisionForm();
    } catch {
      showToast("Erreur lors de la création", "err");
    }
  }

  async function sauvegarderRevision() {
    if (!editRevisionId || !revTitre.trim()) return;
    setEnSauvegarde(true);
    try {
      const contenu = buildRevisionContenu();
      const res = await fetch("/api/chapitres/exercices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editRevisionId, titre: revTitre, contenu }),
      });
      if (!res.ok) throw new Error();
      setExercices((prev) => prev.map((e) =>
        e.id === editRevisionId ? { ...e, titre: revTitre, contenu } : e
      ));
      showToast("Révision mise à jour");
      resetRevisionForm();
    } catch {
      showToast("Erreur lors de la sauvegarde", "err");
    }
    setEnSauvegarde(false);
  }

  async function genererLecon() {
    if (!revTitre.trim()) return;
    setEnGenerationLecon(true);
    try {
      const res = await fetch("/api/chapitres/generer-lecon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapitre_id: chapitreId,
          titre: revTitre,
          contexte: revContexte || undefined,
        }),
      });
      const json = await res.json();
      if (json.contenu) {
        if (json.titre) setRevTitre(json.titre);
        setRevIntro(json.contenu.introduction || "");
        setRevTexte(json.contenu.contenu_html || json.contenu.texte || "");
        setRevRegleOr(json.contenu.regle_or || "");
        setRevAstuce(json.contenu.astuce || "");
        setRevPointsCles(json.contenu.points_cles?.length > 0 ? json.contenu.points_cles : [""]);
        setRevExemples(json.contenu.exemples?.length > 0 ? json.contenu.exemples : []);
        setRevGrille(json.contenu.grille?.items?.length > 0 ? json.contenu.grille : null);
      } else {
        showToast(json.error || "Erreur de génération", "err");
      }
    } catch {
      showToast("Erreur lors de la génération", "err");
    }
    setEnGenerationLecon(false);
  }

  function resetRevisionForm() {
    setRevisionVisible(false);
    setEditRevisionId(null);
    setRevTitre("");
    setRevIntro("");
    setRevTexte("");
    setRevRegleOr("");
    setRevAstuce("");
    setRevVideo("");
    setRevPointsCles([""]);
    setRevExemples([]);
    setRevGrille(null);
    setRevContexte("");
  }

  function ouvrirEditionRevision(ex: Exercice) {
    const c = ex.contenu as any;
    setEditRevisionId(ex.id);
    setRevTitre(ex.titre);
    setRevIntro(c.introduction ?? "");
    setRevTexte(c.contenu_html ?? c.texte ?? "");
    setRevRegleOr(c.regle_or ?? "");
    setRevAstuce(c.astuce ?? "");
    setRevVideo(c.video_url ?? "");
    setRevPointsCles(c.points_cles?.length ? [...c.points_cles] : [""]);
    setRevExemples(c.exemples?.length ? [...c.exemples] : []);
    setRevGrille(c.grille?.items?.length ? c.grille : null);
    setRevContexte("");
    setRevisionVisible(true);
  }

  async function supprimerExercice(id: string) {
    const ancien = [...exercices];
    setExercices((prev) => prev.filter((e) => e.id !== id));
    setASupprimer(null);
    try {
      const res = await fetch(`/api/chapitres/exercices?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      showToast("Exercice supprimé");
    } catch {
      setExercices(ancien);
      showToast("Erreur lors de la suppression", "err");
    }
  }

  async function renommerExercice(id: string) {
    if (!editTitre.trim()) return;
    setEnSauvegarde(true);
    const ancien = exercices.find((e) => e.id === id)?.titre ?? "";
    try {
      const res = await fetch("/api/chapitres/exercices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, titre: editTitre }),
      });
      if (!res.ok) throw new Error();
      setExercices((prev) => prev.map((e) => e.id === id ? { ...e, titre: editTitre } : e));
      showToast("Titre modifié");
    } catch {
      setExercices((prev) => prev.map((e) => e.id === id ? { ...e, titre: ancien } : e));
      showToast("Erreur lors du renommage", "err");
    }
    setEnEdition(null);
    setEnSauvegarde(false);
  }

  async function regenererExercice(ex: Exercice) {
    setEnGeneration(true);
    try {
      const res = await fetch("/api/chapitres/generer-exercice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapitre_id: chapitreId,
          type: ex.type,
          contexte: [
            ex.titre,
            // Conserver la consigne existante pour ne pas la perdre à la régénération
            ...(Array.isArray(ex.contenu) && ex.contenu[0]?.consigne ? [`Consigne : ${ex.contenu[0].consigne}`] : []),
            ...(typeof ex.contenu?.consigne === "string" && ex.contenu.consigne ? [`Consigne : ${ex.contenu.consigne}`] : []),
          ].filter(Boolean).join(". "),
          nb_questions: ex.nb_questions || 10,
        }),
      });
      const json = await res.json();
      if (json.contenu) {
        const updates: Record<string, unknown> = { id: ex.id, contenu: json.contenu };
        if (json.titre) updates.titre = json.titre;
        await fetch("/api/chapitres/exercices", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        setExercices((prev) => prev.map((e) => e.id === ex.id ? { ...e, contenu: json.contenu, ...(json.titre ? { titre: json.titre } : {}) } : e));
      }
    } catch {
      alert("Erreur lors de la régénération");
    }
    setEnGeneration(false);
  }

  async function sauvegarderSeuils() {
    const ancienSeuil = chapitre?.seuil_evaluation ?? 90;
    const ancienSeuilExo = chapitre?.seuil_exercice ?? 90;
    try {
      const res = await fetch("/api/admin/chapitres", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chapitreId, seuil_evaluation: seuil, seuil_exercice: seuilExo }),
      });
      if (!res.ok) throw new Error();
      setChapitre((prev) => prev ? { ...prev, seuil_evaluation: seuil, seuil_exercice: seuilExo } : prev);
      showToast("Seuils mis à jour");
    } catch {
      setSeuil(ancienSeuil);
      setSeuilExo(ancienSeuilExo);
      showToast("Erreur lors de la sauvegarde des seuils", "err");
    }
    setEditParams(false);
  }

  // ── Chargement suivi élèves ──
  async function chargerSuivi() {
    if (suiviChargeRef.current) return;
    suiviChargeRef.current = true;
    setSuiviChargement(true);
    try {
      const res = await fetch(`/api/chapitres/suivi?chapitre_id=${chapitreId}`);
      const json = await res.json();
      setSuiviExercices(json.exercices ?? []);
      setSuiviEleves(json.eleves ?? []);
      setSuiviStats(json.stats ?? null);
    } catch (err) {
      console.error("[chargerSuivi]", err);
    } finally {
      setSuiviChargement(false);
      suiviChargeRef.current = false;
    }
  }

  // Charger le suivi quand on bascule sur l'onglet
  useEffect(() => {
    if (onglet === "suivi" && !suiviStats) {
      chargerSuivi();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onglet]);

  async function mettreAJourOrdre(ordonnés: Exercice[]) {
    const ancien = [...exercices];
    try {
      const res = await fetch("/api/chapitres/exercices/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exercice_ids: ordonnés.map((e) => e.id) }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setExercices(ancien);
      showToast("Erreur lors du réordonnement", "err");
    }
  }

  // ── DnD ───────────────────────────────────────────────────────────────────

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
      const exs = exercicesRef.current;
      let targetIdx = exs.length;
      for (let i = 0; i < exs.length; i++) {
        const el = rowRefs.current[exs[i].id];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) { targetIdx = i; break; }
      }
      setDropIndex(targetIdx);
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
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helpers rendu ─────────────────────────────────────────────────────────

  function nbQuestionsContenu(ex: Exercice): number {
    if (ex.type === "revision") return 0;
    const c = ex.contenu;
    if (Array.isArray(c.questions)) return c.questions.length;
    if (Array.isArray(c.calculs)) return c.calculs.length;
    if (Array.isArray(c.trous)) return (c.trous as unknown[]).length;
    if (Array.isArray(c.phrases)) return (c.phrases as unknown[]).length;
    if (Array.isArray(c.items)) return (c.items as unknown[]).length;
    return ex.nb_questions;
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (chargement) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: 760 }}>
          <div className="skeleton" style={{ height: 80, borderRadius: 12, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 240, borderRadius: 12 }} />
        </div>
      </div>
    );
  }

  if (!chapitre) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div className="card" style={{ textAlign: "center", padding: "32px 24px" }}>
          <p style={{ marginBottom: 16 }}>Chapitre introuvable.</p>
          <Link href="/enseignant/admin/chapitres" className="btn-primary">← Retour</Link>
        </div>
      </div>
    );
  }

  const apercuEx = apercuId ? exercices.find((e) => e.id === apercuId) : null;

  return (
    <>
      {/* ── Toast ── */}
      {toast && (
        <div
          style={{
            position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
            zIndex: 9999, padding: "10px 22px", borderRadius: 12,
            background: toast.type === "ok" ? "#166534" : "#991B1B",
            color: "white", fontSize: 13, fontWeight: 600,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            animation: "fadeInUp 0.25s ease",
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          <span className="ms" style={{ fontSize: 18 }}>
            {toast.type === "ok" ? "check_circle" : "error"}
          </span>
          {toast.msg}
        </div>
      )}

      {/* ── Sous-barre ── */}
      <div style={{
        background: "white", borderBottom: "1px solid var(--border)",
        padding: "8px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/enseignant/admin/chapitres" className="btn-ghost" style={{ padding: "4px 8px", fontSize: 13 }}>←</Link>
          <span style={{ fontWeight: 700, fontSize: 15 }}>📚 {chapitre.titre}</span>
          <span style={{
            fontSize: 11, color: "var(--text-secondary)", background: "var(--bg)",
            padding: "2px 10px", borderRadius: 100, border: "1px solid var(--border)",
          }}>
            {chapitre.niveaux?.nom} · {chapitre.matiere}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setRevisionVisible(true)} style={{
            fontSize: 13, whiteSpace: "nowrap", padding: "6px 14px", borderRadius: 8,
            border: "1.5px solid #FDE68A", background: "#FFFBEB", color: "#92400E",
            fontWeight: 700, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span className="ms" style={{ fontSize: 16 }}>menu_book</span>
            + Révision
          </button>
          <button className="btn-primary" onClick={() => setAjoutVisible(true)} style={{ fontSize: 13, whiteSpace: "nowrap" }}>
            + Exercice
          </button>
        </div>
      </div>

      <div className="page">
        <div className="container" style={{ maxWidth: 760 }}>

          {/* ── Assignation par groupe ── */}
          {groupes.length > 0 && (
            <div style={{
              background: "linear-gradient(135deg, #2563EB08, #2563EB14)",
              border: "1.5px solid rgba(37,99,235,0.2)", borderRadius: 20,
              padding: "16px 20px", marginBottom: 20,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span className="ms" style={{ fontSize: 18, color: "#2563EB" }}>group</span>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#1E40AF" }}>
                  Assigné aux groupes
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {groupes.map((g) => (
                  <button key={g.id} onClick={() => toggleGroupe(g.id, !g.actif)} style={{
                    padding: "8px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600,
                    cursor: "pointer", border: "none", transition: "all 0.2s",
                    background: g.actif ? "#2563EB" : "var(--bg)",
                    color: g.actif ? "white" : "var(--text-secondary)",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span className="ms" style={{ fontSize: 16 }}>
                      {g.actif ? "check_circle" : "radio_button_unchecked"}
                    </span>
                    {g.nom}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 10, marginBottom: 0 }}>
                Le chapitre apparaîtra dans les activités en ligne des élèves des groupes sélectionnés.
              </p>
            </div>
          )}

          {/* ── Onglets ── */}
          <div style={{
            display: "flex", gap: 0, marginBottom: 20,
            borderRadius: 12, overflow: "hidden",
            border: "1px solid var(--border)", background: "var(--bg)",
          }}>
            {([
              { id: "parcours" as const, label: "Parcours", icon: "route" },
              { id: "suivi" as const, label: "Suivi élèves", icon: "monitoring" },
            ]).map((tab) => (
              <button key={tab.id} onClick={() => setOnglet(tab.id)} style={{
                flex: 1, padding: "10px 16px", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 700,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                background: onglet === tab.id ? "white" : "transparent",
                color: onglet === tab.id ? "var(--primary)" : "var(--text-secondary)",
                boxShadow: onglet === tab.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                transition: "all 0.15s",
              }}>
                <span className="ms" style={{ fontSize: 18 }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {onglet === "parcours" && (<>

          {/* ── Paramètres éval ── */}
          <div className="card" style={{ marginBottom: 20, padding: "14px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)", display: "block" }}>Seuil évaluation</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: "var(--primary)" }}>{chapitre.seuil_evaluation ?? 90}%</span>
                </div>
                <div style={{ width: 1, height: 30, background: "var(--border)" }} />
                <div>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)", display: "block" }}>Seuil exercices</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: "var(--primary)" }}>{chapitre.seuil_exercice ?? 90}%</span>
                </div>
                <div style={{ width: 1, height: 30, background: "var(--border)" }} />
                <div>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)", display: "block" }}>Exercices</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: "var(--primary)" }}>{exercices.length}</span>
                </div>
              </div>
              <button className="btn-ghost" onClick={() => setEditParams(!editParams)} style={{ padding: "5px 14px", fontSize: 13 }}>
                {editParams ? "Annuler" : "Modifier"}
              </button>
            </div>
            {editParams && (
              <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Seuil évaluation finale : <strong>{seuil}%</strong>
                </label>
                <input type="range" min={50} max={100} step={5} value={seuil}
                  onChange={(e) => setSeuil(+e.target.value)} style={{ width: "100%", marginBottom: 16 }} />
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Seuil validation exercices : <strong>{seuilExo}%</strong>
                </label>
                <input type="range" min={50} max={100} step={5} value={seuilExo}
                  onChange={(e) => setSeuilExo(+e.target.value)} style={{ width: "100%", marginBottom: 12 }} />
                <button className="btn-primary" onClick={sauvegarderSeuils} style={{ width: "100%" }}>
                  ✓ Enregistrer
                </button>
              </div>
            )}
          </div>

          {/* ── Parcours (timeline) ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>🛤️ Parcours de l&apos;élève</h2>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {exercices.filter((e) => e.type !== "revision").length} exercice{exercices.filter((e) => e.type !== "revision").length !== 1 ? "s" : ""}
              {exercices.filter((e) => e.type === "revision").length > 0 && ` · ${exercices.filter((e) => e.type === "revision").length} révision${exercices.filter((e) => e.type === "revision").length !== 1 ? "s" : ""}`}
              {" "}+ évaluation
            </span>
          </div>

          {exercices.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-secondary)" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🛤️</div>
              <p style={{ marginBottom: 20 }}>Aucun exercice dans ce chapitre.</p>
              <button className="btn-primary" onClick={() => setAjoutVisible(true)}>
                + Ajouter le premier exercice
              </button>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              {/* Ligne verticale de la timeline */}
              <div style={{
                position: "absolute", left: 23, top: 24, bottom: 24,
                width: 3, background: "linear-gradient(to bottom, #2563EB, #7C3AED)",
                borderRadius: 100, zIndex: 0,
              }} />

              {exercices.map((ex, idx) => {
                const isDragging = ex.id === draggingId;
                const showDropBefore = dropIndex === idx && draggingId !== null;
                const typeInfo = TYPE_LABELS[ex.type] || TYPE_LABELS.exercice;
                const nbQ = nbQuestionsContenu(ex);

                return (
                  <div key={ex.id}>
                    {showDropBefore && (
                      <div style={{ height: 3, background: "var(--primary)", borderRadius: 100, margin: "4px 0 4px 40px" }} />
                    )}

                    <div
                      ref={(el) => { rowRefs.current[ex.id] = el; }}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12,
                        opacity: isDragging ? 0.3 : 1, transition: "opacity 0.15s",
                      }}
                    >
                      {/* Numéro étape */}
                      <div style={{
                        width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                        background: "white", border: `3px solid ${typeInfo.color}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 800, fontSize: 16, color: typeInfo.color, zIndex: 1,
                        position: "relative",
                      }}>
                        {idx + 1}
                      </div>

                      {/* Carte exercice */}
                      <div className="card" style={{ flex: 1, padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {/* Handle DnD */}
                          <div
                            onPointerDown={(e) => handlePointerDown(e, ex.id, idx)}
                            style={{ cursor: "grab", padding: "2px 4px", color: "var(--text-secondary)", fontSize: 14, touchAction: "none", userSelect: "none" }}
                          >⋮⋮</div>

                          {/* Badge type */}
                          <span style={{
                            padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                            background: typeInfo.bg, color: typeInfo.color, display: "flex", alignItems: "center", gap: 3,
                          }}>
                            <span className="ms" style={{ fontSize: 13 }}>{typeInfo.icon}</span>
                            {typeInfo.label}
                          </span>

                          {/* Titre */}
                          {enEdition === ex.id ? (
                            <div style={{ display: "flex", gap: 6, flex: 1 }}>
                              <input
                                value={editTitre} onChange={(e) => setEditTitre(e.target.value)}
                                className="form-input" style={{ flex: 1, fontSize: 13, padding: "4px 10px" }}
                                autoFocus onKeyDown={(e) => e.key === "Enter" && renommerExercice(ex.id)}
                              />
                              <button className="btn-primary" onClick={() => renommerExercice(ex.id)} disabled={enSauvegarde}
                                style={{ fontSize: 12, padding: "4px 12px" }}>✓</button>
                              <button className="btn-ghost" onClick={() => setEnEdition(null)}
                                style={{ fontSize: 12, padding: "4px 8px" }}>✗</button>
                            </div>
                          ) : (
                            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                              onClick={() => { setEnEdition(ex.id); setEditTitre(ex.titre); }}>
                              {ex.titre}
                            </span>
                          )}

                          {/* Nb questions / label revision */}
                          {ex.type === "revision" ? (
                            <span style={{ fontSize: 11, color: "#D97706", fontWeight: 600, flexShrink: 0 }}>
                              Mini-leçon
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--text-secondary)", flexShrink: 0 }}>
                              {nbQ} question{nbQ !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>

                        {/* Aperçu vidéo pour les révisions */}
                        {ex.type === "revision" && (ex.contenu as any).video_url && (
                          <div style={{
                            display: "flex", alignItems: "center", gap: 6, marginTop: 6,
                            padding: "4px 10px", background: "#FFF7ED", borderRadius: 8, fontSize: 11,
                            color: "#92400E", fontWeight: 600,
                          }}>
                            <span className="ms" style={{ fontSize: 14 }}>videocam</span>
                            Vidéo incluse
                          </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          <button className="btn-ghost" style={{ fontSize: 11, padding: "3px 10px" }}
                            onClick={() => setApercuId(ex.id)}>
                            👁 Aperçu
                          </button>
                          {ex.type === "revision" ? (
                            <button className="btn-ghost" style={{ fontSize: 11, padding: "3px 10px" }}
                              onClick={() => ouvrirEditionRevision(ex)}>
                              ✏️ Modifier
                            </button>
                          ) : (
                            <button className="btn-ghost" style={{ fontSize: 11, padding: "3px 10px" }}
                              onClick={() => regenererExercice(ex)} disabled={enGeneration}>
                              🔄 Régénérer
                            </button>
                          )}
                          <button className="btn-ghost" style={{ fontSize: 11, padding: "3px 10px", color: "#DC2626" }}
                            onClick={() => setASupprimer(ex.id)}>
                            🗑
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Drop indicator after last */}
                    {dropIndex === exercices.length && idx === exercices.length - 1 && draggingId !== null && (
                      <div style={{ height: 3, background: "var(--primary)", borderRadius: 100, margin: "4px 0 4px 40px" }} />
                    )}
                  </div>
                );
              })}

              {/* Évaluation finale (toujours en dernier) */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 4 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  zIndex: 1, position: "relative",
                }}>
                  <span className="ms" style={{ fontSize: 22, color: "white" }}>emoji_events</span>
                </div>
                <div className="card" style={{
                  flex: 1, padding: "14px 16px",
                  background: "linear-gradient(135deg, #FEF2F2, #FFF)",
                  border: "1.5px solid rgba(220,38,38,0.2)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#DC2626" }}>
                      🏆 Évaluation finale
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      Seuil : {chapitre.seuil_evaluation ?? 90}% · 10 questions piochées dans tous les exercices
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "6px 0 0" }}>
                    Générée automatiquement à partir des exercices du parcours. L&apos;élève doit valider tous les exercices avant d&apos;y accéder.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Boutons ajouter (en bas de la timeline) */}
          {exercices.length > 0 && !ajoutVisible && !revisionVisible && (
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16 }}>
              <button className="btn-ghost" onClick={() => setRevisionVisible(true)}
                style={{ fontSize: 13, padding: "8px 16px", color: "#D97706" }}>
                📖 + Révision
              </button>
              <button className="btn-ghost" onClick={() => setAjoutVisible(true)}
                style={{ fontSize: 13, padding: "8px 16px" }}>
                ✏️ + Exercice
              </button>
            </div>
          )}

          </>)}

          {/* ═══════════════════════════════════════════════════════════════════
              ONGLET SUIVI ÉLÈVES
              ═══════════════════════════════════════════════════════════════════ */}
          {onglet === "suivi" && (
            <div>
              {suiviChargement ? (
                <div style={{ textAlign: "center", padding: "48px 20px" }}>
                  <div className="skeleton" style={{ height: 80, borderRadius: 16, marginBottom: 16 }} />
                  <div className="skeleton" style={{ height: 200, borderRadius: 16 }} />
                </div>
              ) : !suiviStats || suiviStats.nbEleves === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-secondary)" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>
                    <span className="ms" style={{ fontSize: 48, color: "var(--text-secondary)" }}>group_off</span>
                  </div>
                  <p style={{ marginBottom: 6, fontWeight: 600, fontSize: 15 }}>Aucun élève assigné</p>
                  <p style={{ fontSize: 13 }}>Assignez ce chapitre à un groupe pour voir le suivi.</p>
                </div>
              ) : (
                <>
                  {/* ── KPI ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                    <div className="card" style={{ padding: "14px 16px", textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Parcours validé
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: "#16A34A" }}>
                        {suiviStats.nbValides}<span style={{ fontSize: 16, fontWeight: 600, color: "var(--text-secondary)" }}>/{suiviStats.nbEleves}</span>
                      </div>
                    </div>
                    <div className="card" style={{ padding: "14px 16px", textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Score moyen éval
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: suiviStats.scoreMoyenEval != null ? "#2563EB" : "var(--text-secondary)" }}>
                        {suiviStats.scoreMoyenEval != null ? `${suiviStats.scoreMoyenEval}%` : "—"}
                      </div>
                    </div>
                    <div className="card" style={{ padding: "14px 16px", textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Exos en difficulté
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: suiviStats.exercicesProblematiques.length > 0 ? "#DC2626" : "#16A34A" }}>
                        {suiviStats.exercicesProblematiques.length}
                      </div>
                    </div>
                  </div>

                  {/* ── Alertes exercices problématiques ── */}
                  {suiviStats.exercicesProblematiques.length > 0 && (
                    <div style={{
                      background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 14,
                      padding: "12px 16px", marginBottom: 20,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <span className="ms" style={{ fontSize: 18, color: "#DC2626" }}>warning</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#991B1B" }}>Exercices problématiques</span>
                      </div>
                      {suiviStats.exercicesProblematiques.map((ep) => (
                        <div key={ep.exerciceId} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "6px 0", borderTop: "1px solid #FEE2E2",
                        }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#7F1D1D" }}>{ep.titre}</span>
                          <span style={{ fontSize: 12, color: "#991B1B" }}>
                            {ep.tauxReussite}% de réussite · {ep.nbEchecs} échec{ep.nbEchecs > 1 ? "s" : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Tableau croisé ── */}
                  <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{
                        width: "100%", borderCollapse: "collapse",
                        fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif",
                      }}>
                        <thead>
                          <tr style={{ background: "var(--bg)" }}>
                            <th style={{
                              padding: "10px 14px", textAlign: "left", fontWeight: 700,
                              position: "sticky", left: 0, background: "var(--bg)", zIndex: 2,
                              borderBottom: "2px solid var(--border)", fontSize: 11, color: "var(--text-secondary)",
                              textTransform: "uppercase", letterSpacing: "0.05em", minWidth: 140,
                            }}>
                              Élève
                            </th>
                            {suiviExercices.map((ex, i) => (
                              <th key={ex.id} style={{
                                padding: "10px 8px", textAlign: "center", fontWeight: 600,
                                borderBottom: "2px solid var(--border)", fontSize: 11,
                                color: "var(--text-secondary)", minWidth: 70, whiteSpace: "nowrap",
                              }}>
                                Exo {i + 1}
                              </th>
                            ))}
                            <th style={{
                              padding: "10px 8px", textAlign: "center", fontWeight: 700,
                              borderBottom: "2px solid var(--border)", fontSize: 11,
                              color: "#DC2626", minWidth: 70,
                            }}>
                              Éval
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {suiviEleves.map((eleve, idx) => {
                            const tousValides = suiviExercices.every((ex) => eleve.resultats[ex.id]?.valide);
                            return (
                              <tr key={eleve.id} style={{
                                background: idx % 2 === 0 ? "white" : "var(--bg)",
                                borderBottom: "1px solid var(--border)",
                              }}>
                                <td style={{
                                  padding: "8px 14px", fontWeight: 600,
                                  position: "sticky", left: 0, zIndex: 1,
                                  background: idx % 2 === 0 ? "white" : "var(--bg)",
                                  borderRight: "1px solid var(--border)",
                                  display: "flex", alignItems: "center", gap: 6,
                                }}>
                                  {tousValides && eleve.evaluation?.reussi ? (
                                    <span className="ms" style={{ fontSize: 14, color: "#16A34A" }}>verified</span>
                                  ) : tousValides ? (
                                    <span className="ms" style={{ fontSize: 14, color: "#2563EB" }}>check_circle</span>
                                  ) : null}
                                  <span>{eleve.prenom} {eleve.nom.charAt(0)}.</span>
                                </td>
                                {suiviExercices.map((ex) => {
                                  const r = eleve.resultats[ex.id];
                                  return (
                                    <td key={ex.id} style={{ padding: "8px 4px", textAlign: "center" }}>
                                      {!r ? (
                                        <span style={{ color: "var(--text-secondary)", fontSize: 16 }}>—</span>
                                      ) : r.valide ? (
                                        <span style={{
                                          display: "inline-block", padding: "2px 8px", borderRadius: 6,
                                          background: "#DCFCE7", color: "#166534", fontWeight: 700, fontSize: 11,
                                        }}>
                                          {r.score}/{r.total}
                                        </span>
                                      ) : (
                                        <span style={{
                                          display: "inline-block", padding: "2px 8px", borderRadius: 6,
                                          background: "#FEF3C7", color: "#92400E", fontWeight: 700, fontSize: 11,
                                        }}>
                                          {r.score}/{r.total}
                                        </span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td style={{ padding: "8px 4px", textAlign: "center" }}>
                                  {!eleve.evaluation ? (
                                    tousValides ? (
                                      <span style={{ fontSize: 11, color: "#2563EB", fontWeight: 600 }}>
                                        <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>lock_open</span>
                                      </span>
                                    ) : (
                                      <span className="ms" style={{ fontSize: 16, color: "var(--text-secondary)" }}>lock</span>
                                    )
                                  ) : eleve.evaluation.reussi ? (
                                    <span style={{
                                      display: "inline-block", padding: "2px 8px", borderRadius: 6,
                                      background: "#DCFCE7", color: "#166534", fontWeight: 700, fontSize: 11,
                                    }}>
                                      {eleve.evaluation.pourcentage}%
                                    </span>
                                  ) : (
                                    <span style={{
                                      display: "inline-block", padding: "2px 8px", borderRadius: 6,
                                      background: "#FEE2E2", color: "#991B1B", fontWeight: 700, fontSize: 11,
                                    }}>
                                      {eleve.evaluation.pourcentage}%
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* ── Bouton rafraîchir ── */}
                  <div style={{ textAlign: "center", marginTop: 16 }}>
                    <button className="btn-ghost" onClick={chargerSuivi} disabled={suiviChargement}
                      style={{ fontSize: 12, padding: "6px 16px" }}>
                      <span className="ms" style={{ fontSize: 16, verticalAlign: "middle", marginRight: 4 }}>refresh</span>
                      Actualiser
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Modale ajout exercice ── */}
      {ajoutVisible && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={() => !enGeneration && setAjoutVisible(false)}>
          <div className="card" style={{ width: 520, maxHeight: "80vh", overflow: "auto", padding: 24 }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Nouvel exercice</h3>

            {/* Type */}
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>Type</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              {(Object.keys(TYPE_LABELS) as TypeExercice[]).filter((t) => t !== "revision").map((t) => {
                const info = TYPE_LABELS[t];
                return (
                  <button key={t} onClick={() => setAjoutType(t)} style={{
                    padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: ajoutType === t ? `2px solid ${info.color}` : "1px solid var(--border)",
                    background: ajoutType === t ? info.bg : "white",
                    color: info.color, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <span className="ms" style={{ fontSize: 15 }}>{info.icon}</span>
                    {info.label}
                  </button>
                );
              })}
            </div>

            {/* Titre */}
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
              Titre de l&apos;exercice
            </label>
            <input
              value={ajoutTitre} onChange={(e) => setAjoutTitre(e.target.value)}
              className="form-input" placeholder="Ex: Les fractions décimales"
              style={{ width: "100%", marginBottom: 12 }}
            />

            {/* Contexte IA */}
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
              Contexte / instructions pour l&apos;IA <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>(optionnel)</span>
            </label>
            <textarea
              value={ajoutContexte} onChange={(e) => setAjoutContexte(e.target.value)}
              className="form-input" rows={3} placeholder="Décrivez ce que l'exercice doit couvrir..."
              style={{ width: "100%", resize: "vertical", marginBottom: 20 }}
            />

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-primary" onClick={ajouterExercice} disabled={!ajoutTitre.trim() || enGeneration}
                style={{ flex: 1 }}>
                {enGeneration ? "⏳ Génération en cours…" : "✨ Générer avec l'IA"}
              </button>
              <button className="btn-ghost" onClick={ajouterExerciceManuel} disabled={!ajoutTitre.trim() || enGeneration}
                style={{ whiteSpace: "nowrap" }}>
                Créer vide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modale aperçu ── */}
      {apercuEx && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={() => setApercuId(null)}>
          <div className="card" style={{ width: 600, maxHeight: "80vh", overflow: "auto", padding: 24 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{apercuEx.titre}</h3>
              <button className="btn-ghost" onClick={() => setApercuId(null)} style={{ fontSize: 18, padding: "2px 8px" }}>✕</button>
            </div>

            {/* Affichage selon le type */}
            {(apercuEx.type === "exercice" || apercuEx.type === "qcm") && Array.isArray(apercuEx.contenu.questions) && (
              <div>
                {typeof apercuEx.contenu.consigne === "string" && apercuEx.contenu.consigne && (
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, fontStyle: "italic" }}>
                    {String(apercuEx.contenu.consigne)}
                  </p>
                )}
                {(apercuEx.contenu.questions as Array<Record<string, unknown>>).map((q, i) => (
                  <div key={i} style={{ marginBottom: 12, padding: "10px 14px", background: "var(--bg)", borderRadius: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                      {i + 1}. {String(q.enonce || q.question || "")}
                    </div>
                    {typeof q.reponse_attendue === "string" && (
                      <div style={{ fontSize: 12, color: "#16A34A" }}>→ {String(q.reponse_attendue)}</div>
                    )}
                    {Array.isArray(q.options) && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                        {(q.options as string[]).map((opt: string, oi: number) => (
                          <span key={oi} style={{
                            padding: "2px 10px", borderRadius: 6, fontSize: 12,
                            background: oi === (q.reponse_correcte as number) ? "#D1FAE5" : "#F3F4F6",
                            fontWeight: oi === (q.reponse_correcte as number) ? 700 : 400,
                          }}>{opt}</span>
                        ))}
                      </div>
                    )}
                    {typeof q.indice === "string" && (
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>💡 {String(q.indice)}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {apercuEx.type === "calcul_mental" && Array.isArray(apercuEx.contenu.calculs) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {(apercuEx.contenu.calculs as Array<{ enonce: string; reponse: string }>).map((c, i) => (
                  <div key={i} style={{ padding: "8px 12px", background: "var(--bg)", borderRadius: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{c.enonce}</span>
                    <span style={{ fontSize: 12, color: "#16A34A", marginLeft: 8 }}>= {c.reponse}</span>
                  </div>
                ))}
              </div>
            )}

            {apercuEx.type === "texte_a_trous" && (() => {
              // Le contenu peut être un tableau de textes ou un objet unique
              const items: Array<{ titre?: string; consigne?: string; texte_complet?: string; trous?: Array<{ mot: string }> }> =
                Array.isArray(apercuEx.contenu) ? apercuEx.contenu : [apercuEx.contenu];
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {items.map((item, idx) => (
                    <div key={idx} style={{ padding: items.length > 1 ? "14px 16px" : 0, background: items.length > 1 ? "var(--bg-secondary, #f9fafb)" : "transparent", borderRadius: 12 }}>
                      {item.titre && items.length > 1 && (
                        <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                          {idx + 1}. {item.titre}
                        </p>
                      )}
                      {typeof item.consigne === "string" && item.consigne && (
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10, fontStyle: "italic" }}>
                          {item.consigne}
                        </p>
                      )}
                      <p style={{ fontSize: 14, lineHeight: 1.8 }}>
                        {item.texte_complet}
                      </p>
                      {Array.isArray(item.trous) && item.trous.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>Trous :</span>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                            {item.trous.map((t, i) => (
                              <span key={i} style={{ padding: "2px 8px", background: "#FEF3C7", borderRadius: 6, fontSize: 12 }}>
                                {t.mot}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {apercuEx.type === "classement" && (
              <div>
                {typeof apercuEx.contenu.consigne === "string" && apercuEx.contenu.consigne && (
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10, fontStyle: "italic" }}>
                    {String(apercuEx.contenu.consigne)}
                  </p>
                )}
                {Array.isArray(apercuEx.contenu.categories) && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    {(apercuEx.contenu.categories as string[]).map((cat, i) => (
                      <span key={i} style={{ padding: "4px 12px", background: "#EDE9FE", borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
                {Array.isArray(apercuEx.contenu.items) && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(apercuEx.contenu.items as Array<{ texte: string; categorie: string }>).map((item, i) => (
                      <span key={i} style={{ padding: "4px 10px", background: "var(--bg)", borderRadius: 6, fontSize: 12 }}>
                        {item.texte} → <strong>{item.categorie}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {apercuEx.type === "analyse_phrase" && Array.isArray(apercuEx.contenu.phrases) && (
              <div>
                {(apercuEx.contenu.phrases as Array<{ texte: string; groupes: Array<{ mots: string; fonction: string }> }>).map((p, i) => (
                  <div key={i} style={{ marginBottom: 12, padding: "10px 14px", background: "var(--bg)", borderRadius: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{p.texte}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {p.groupes.map((g, gi) => (
                        <span key={gi} style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, background: "#EDE9FE" }}>
                          {g.mots} → <strong>{g.fonction}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {apercuEx.type === "revision" && (() => {
              const c = apercuEx.contenu as any;
              const html = c.contenu_html || c.texte || "";
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {c.video_url && (
                    <div style={{
                      padding: "10px 14px", background: "#FFF7ED", borderRadius: 10,
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span className="ms" style={{ fontSize: 18, color: "#D97706" }}>videocam</span>
                      <a href={c.video_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 13, color: "#92400E", fontWeight: 600 }}>
                        {c.video_url}
                      </a>
                    </div>
                  )}
                  {c.introduction && (
                    <p style={{ fontSize: 13, color: "var(--text-secondary)", fontStyle: "italic", margin: 0 }}>
                      {c.introduction}
                    </p>
                  )}
                  {html && (
                    <div style={{
                      fontSize: 13, lineHeight: 1.7,
                      padding: "14px 16px", background: "var(--bg)", borderRadius: 10,
                    }}>
                      <div dangerouslySetInnerHTML={{ __html: html }} />
                    </div>
                  )}
                  {c.regle_or && (
                    <div style={{
                      padding: "12px 16px", borderRadius: 10,
                      background: "#F8F5FF", borderLeft: "4px solid #0050D4",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#0050D4", marginBottom: 4 }}>La Règle d&apos;Or</div>
                      <p style={{ fontSize: 13, margin: 0, fontWeight: 500 }}>{c.regle_or}</p>
                    </div>
                  )}
                  {c.astuce && (
                    <div style={{
                      padding: "12px 16px", borderRadius: 10,
                      background: "rgba(112,42,225,0.06)", border: "1px solid rgba(112,42,225,0.12)",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#5B00C7", marginBottom: 4 }}>💡 Astuce Pro</div>
                      <p style={{ fontSize: 13, margin: 0, color: "rgba(91,0,199,0.75)" }}>{c.astuce}</p>
                    </div>
                  )}
                  {c.exemples?.length > 0 && c.exemples.map((ex: any, i: number) => (
                    ex.colonnes && ex.lignes?.length > 0 && (
                      <div key={i} style={{ borderRadius: 10, border: "1px solid var(--border)", padding: "12px 14px", background: "white" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{ex.titre}</div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr>{ex.colonnes.map((col: string, ci: number) => (
                              <th key={ci} style={{ padding: "4px 8px", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 600, color: "var(--text-secondary)" }}>{col}</th>
                            ))}</tr>
                          </thead>
                          <tbody>
                            {ex.lignes.map((ligne: string[], li: number) => (
                              <tr key={li}>{ligne.map((cell: string, ci: number) => (
                                <td key={ci} style={{ padding: "4px 8px", borderBottom: "1px solid var(--bg)", fontWeight: ci === 1 ? 700 : 400, color: ci === 1 ? "#0050D4" : "inherit" }}>{cell}</td>
                              ))}</tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  ))}
                  {c.points_cles?.length > 0 && (
                    <div style={{ background: "#EFF6FF", borderRadius: 10, padding: "12px 16px" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1E40AF", marginBottom: 8 }}>✅ À retenir</div>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {c.points_cles.map((pt: string, i: number) => (
                          <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>{pt}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })()}

            {apercuEx.type === "ecriture_contrainte" && (
              <div>
                {typeof apercuEx.contenu.consigne === "string" && (
                  <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#5B21B6" }}>
                    📝 {apercuEx.contenu.consigne}
                  </p>
                )}
                <div style={{ fontSize: 13, marginBottom: 10 }}>
                  <strong>Nombre de phrases :</strong> {(apercuEx.contenu.nb_phrases as number) ?? 3}
                </div>
                {Array.isArray(apercuEx.contenu.contraintes) && (
                  <div style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Contraintes :</span>
                    <ul style={{ margin: "6px 0 0 16px", padding: 0, fontSize: 13 }}>
                      {(apercuEx.contenu.contraintes as string[]).map((c, i) => (
                        <li key={i} style={{ marginBottom: 3 }}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {typeof apercuEx.contenu.exemple === "string" && (
                  <p style={{ fontSize: 12, fontStyle: "italic", color: "var(--text-secondary)", marginTop: 8 }}>
                    💡 Exemple : « {apercuEx.contenu.exemple} »
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modale suppression ── */}
      {aSupprimer && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={() => setASupprimer(null)}>
          <div className="card" style={{ width: 400, padding: 24, textAlign: "center" }}
            onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>
              Supprimer cet exercice du parcours ?
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn-ghost" onClick={() => setASupprimer(null)}>Annuler</button>
              <button onClick={() => supprimerExercice(aSupprimer)}
                style={{
                  padding: "8px 20px", borderRadius: 8, fontWeight: 600, fontSize: 14,
                  border: "none", cursor: "pointer", background: "#DC2626", color: "white",
                }}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modale révision (création / édition) ── */}
      {revisionVisible && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={() => !enGenerationLecon && resetRevisionForm()}>
          <div className="card" style={{ width: 600, maxHeight: "85vh", overflow: "auto", padding: 24 }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 22 }}>📖</span>
              {editRevisionId ? "Modifier la révision" : "Nouvelle révision"}
            </h3>

            {/* Titre */}
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
              Titre de la leçon
            </label>
            <input
              value={revTitre} onChange={(e) => setRevTitre(e.target.value)}
              className="form-input" placeholder="Ex: Rappel — Les fractions décimales"
              style={{ width: "100%", marginBottom: 14 }}
            />

            {/* Contexte IA (seulement en création ou si texte vide) */}
            {!editRevisionId && (
              <>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Instructions pour l&apos;IA <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>(optionnel)</span>
                </label>
                <textarea
                  value={revContexte} onChange={(e) => setRevContexte(e.target.value)}
                  className="form-input" rows={2}
                  placeholder="Précisions sur le contenu souhaité..."
                  style={{ width: "100%", resize: "vertical", marginBottom: 10 }}
                />
                <button
                  onClick={genererLecon}
                  disabled={!revTitre.trim() || enGenerationLecon}
                  style={{
                    padding: "8px 18px", borderRadius: 8, border: "1.5px solid #FDE68A",
                    background: enGenerationLecon ? "#FEF3C7" : "linear-gradient(135deg, #FFFBEB, #FEF3C7)",
                    color: "#92400E", fontSize: 13, fontWeight: 700, cursor: "pointer",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    marginBottom: 16, display: "flex", alignItems: "center", gap: 6,
                    opacity: !revTitre.trim() || enGenerationLecon ? 0.6 : 1,
                  }}
                >
                  {enGenerationLecon ? "⏳ Génération en cours…" : "✨ Générer la leçon avec l'IA"}
                </button>
              </>
            )}

            {/* URL vidéo */}
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
              URL vidéo <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>(optionnel, YouTube)</span>
            </label>
            <input
              value={revVideo} onChange={(e) => setRevVideo(e.target.value)}
              className="form-input" placeholder="https://www.youtube.com/watch?v=..."
              style={{ width: "100%", marginBottom: 14 }}
            />

            {/* Introduction */}
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
              Introduction <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>(accroche courte)</span>
            </label>
            <input
              value={revIntro} onChange={(e) => setRevIntro(e.target.value)}
              className="form-input" placeholder="Pourquoi cette notion est importante..."
              style={{ width: "100%", marginBottom: 14 }}
            />

            {/* Contenu texte */}
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
              Contenu principal <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>(HTML simple)</span>
            </label>
            <textarea
              value={revTexte} onChange={(e) => setRevTexte(e.target.value)}
              className="form-input" rows={8}
              placeholder="Le corps de la leçon..."
              style={{ width: "100%", resize: "vertical", marginBottom: 14, fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}
            />

            {/* Règle d'Or */}
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6, color: "#0050D4" }}>
              🏆 Règle d&apos;Or <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>(la règle essentielle)</span>
            </label>
            <input
              value={revRegleOr} onChange={(e) => setRevRegleOr(e.target.value)}
              className="form-input" placeholder="La règle la plus importante à retenir..."
              style={{ width: "100%", marginBottom: 14 }}
            />

            {/* Astuce */}
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6, color: "#702AE1" }}>
              💡 Astuce Pro <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>(conseil pratique)</span>
            </label>
            <input
              value={revAstuce} onChange={(e) => setRevAstuce(e.target.value)}
              className="form-input" placeholder="Un truc mnémotechnique ou un conseil..."
              style={{ width: "100%", marginBottom: 14 }}
            />

            {/* Grille de badges */}
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6, color: "#4F5AE5" }}>
              🏷️ Grille visuelle <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>(badges : terminaisons, formules...)</span>
            </label>
            {revGrille && revGrille.items.length > 0 ? (
              <div style={{
                border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px",
                marginBottom: 8, background: "var(--bg)", fontSize: 12,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <strong>{revGrille.titre}</strong>
                  <span style={{ color: "var(--text-secondary)" }}>{revGrille.items.length} badge{revGrille.items.length > 1 ? "s" : ""}</span>
                  <button onClick={() => setRevGrille(null)}
                    style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 14 }}>✕</button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {revGrille.items.map((item, i) => (
                    <span key={i} style={{
                      background: "#E8EAFF", color: "#4F5AE5", fontWeight: 700,
                      fontSize: 11, borderRadius: 6, padding: "2px 8px",
                    }}>
                      {item.etiquette} {item.texte}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 8px", fontStyle: "italic" }}>
                Aucune grille. Générez la leçon avec l&apos;IA pour en créer automatiquement.
              </p>
            )}
            <div style={{ marginBottom: 14 }} />

            {/* Tableau d'exemples */}
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
              📊 Tableau d&apos;exemples <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>(conjugaison, calculs...)</span>
            </label>
            {revExemples.length > 0 && revExemples.map((ex, ei) => (
              <div key={ei} style={{
                border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px",
                marginBottom: 8, background: "var(--bg)", fontSize: 12,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <strong>{ex.titre}</strong>
                  <span style={{ color: "var(--text-secondary)" }}>({ex.colonnes.join(" · ")})</span>
                  <span style={{ color: "var(--text-secondary)" }}>{ex.lignes.length} ligne{ex.lignes.length > 1 ? "s" : ""}</span>
                  <button onClick={() => setRevExemples((prev) => prev.filter((_, j) => j !== ei))}
                    style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 14 }}>✕</button>
                </div>
              </div>
            ))}
            {revExemples.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 8px", fontStyle: "italic" }}>
                Aucun tableau. Générez la leçon avec l&apos;IA pour en créer automatiquement.
              </p>
            )}
            <div style={{ marginBottom: 14 }} />

            {/* Points clés */}
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
              ✅ Points clés — À retenir
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {revPointsCles.map((pt, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#2563EB", fontWeight: 700, flexShrink: 0 }}>💡</span>
                  <input
                    value={pt}
                    onChange={(e) => {
                      const cp = [...revPointsCles];
                      cp[i] = e.target.value;
                      setRevPointsCles(cp);
                    }}
                    className="form-input"
                    placeholder={`Point clé ${i + 1}`}
                    style={{ flex: 1, fontSize: 13, padding: "4px 10px", marginBottom: 0 }}
                  />
                  {revPointsCles.length > 1 && (
                    <button
                      onClick={() => setRevPointsCles((prev) => prev.filter((_, j) => j !== i))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 16, padding: "0 4px" }}
                    >✕</button>
                  )}
                </div>
              ))}
              {revPointsCles.length < 5 && (
                <button
                  onClick={() => setRevPointsCles((prev) => [...prev, ""])}
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: "4px 12px", alignSelf: "flex-start" }}
                >
                  + Ajouter un point clé
                </button>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10 }}>
              {editRevisionId ? (
                <button className="btn-primary" onClick={sauvegarderRevision}
                  disabled={!revTitre.trim() || !revTexte.trim() || enSauvegarde}
                  style={{ flex: 1 }}>
                  {enSauvegarde ? "Enregistrement…" : "✓ Enregistrer"}
                </button>
              ) : (
                <button className="btn-primary" onClick={ajouterRevision}
                  disabled={!revTitre.trim() || !revTexte.trim()}
                  style={{ flex: 1 }}>
                  📖 Ajouter au parcours
                </button>
              )}
              <button className="btn-ghost" onClick={resetRevisionForm}>
                Annuler
              </button>
            </div>

            {/* Bouton régénérer si en édition */}
            {editRevisionId && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Régénérer avec l&apos;IA
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={revContexte} onChange={(e) => setRevContexte(e.target.value)}
                    className="form-input" placeholder="Instructions..."
                    style={{ flex: 1, fontSize: 12, padding: "4px 10px", marginBottom: 0 }}
                  />
                  <button
                    onClick={genererLecon}
                    disabled={!revTitre.trim() || enGenerationLecon}
                    style={{
                      padding: "6px 14px", borderRadius: 8, border: "1.5px solid #FDE68A",
                      background: "#FFFBEB", color: "#92400E", fontSize: 12, fontWeight: 700,
                      cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
                      whiteSpace: "nowrap", opacity: enGenerationLecon ? 0.6 : 1,
                    }}
                  >
                    {enGenerationLecon ? "⏳…" : "✨ Générer"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ghost DnD */}
      {draggingId && ghostPos && (
        <div style={{
          position: "fixed", left: ghostPos.x - 100, top: ghostPos.y - 20,
          width: 200, padding: "8px 14px", background: "white", borderRadius: 10,
          boxShadow: "0 8px 30px rgba(0,0,0,0.15)", zIndex: 2000, pointerEvents: "none",
          fontSize: 13, fontWeight: 600, opacity: 0.9,
        }}>
          {exercices.find((e) => e.id === draggingId)?.titre ?? ""}
        </div>
      )}
    </>
  );
}
