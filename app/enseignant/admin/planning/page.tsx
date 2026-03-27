"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import EnseignantLayout from "@/components/EnseignantLayout";

interface EleveInfo {
  prenom: string;
  nom: string;
  source: "planbox" | "repetibox";
  niveau?: string;
}

interface BlocPlanning {
  id: string;
  type: "exercice" | "calcul_mental" | string;
  titre: string | null;
  statut: "a_faire" | "fait" | string;
  date_assignation: string;
  date_limite: string | null;
  chapitre_id: string | null;
  eleve_id: string | null;
  repetibox_eleve_id: number | null;
  groupe_label: string | null;
  eleve_info: EleveInfo | null;
  contenu: Record<string, unknown>;
}

interface GroupeFiltre {
  id: string;
  nom: string;
}

// Groupe d'exercices identiques (même titre + type) le même jour → un seul bloc affiché
interface GroupeBloc {
  key: string;
  titre: string | null;
  type: string;
  date_assignation: string;
  date_limite: string | null;
  chapitre_id: string | null;
  contenu: Record<string, unknown>;
  blocs: BlocPlanning[];
}

type SupprimerMode = { type: "un"; id: string } | { type: "tous" } | null;
type VueMode = "semaine" | "mois";

const COULEURS_TYPE: Record<string, { bg: string; border: string; color: string }> = {
  exercice:      { bg: "#EEF0FE", border: "#AAB7FA", color: "#1642A3" },  // blue-50/200/700
  calcul_mental: { bg: "#D4DAFC", border: "#587DF6", color: "#0D2E76" },  // blue-100/400/800
  ressource:     { bg: "#EEF0FE", border: "#8399F8", color: "#1642A3" },  // blue-50/300/700
  dictee:        { bg: "#EDE9FE", border: "#7C3AED", color: "#17055b" },
  mots:          { bg: "#deeffe", border: "#5ca0f0", color: "#1a4fa0" },
};

const ICONES_TYPE: Record<string, string> = {
  exercice: "edit_note",
  calcul_mental: "pin",
  ressource: "open_in_new",
  eval: "quiz",
  dictee: "edit",
  mots: "menu_book",
};

const JOURS_SEMAINE = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
const JOURS_MOIS    = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function getLundi(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const r = new Date(d);
  r.setDate(r.getDate() + diff);
  r.setHours(12, 0, 0, 0);
  return r;
}
function formatISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${j}`;
}
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function formatJour(d: Date) { return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }); }
function formatMoisAnnee(d: Date) { return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); }
function getPremierJourMois(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function getDernierJourMois(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function getPremierCaseMois(d: Date): Date {
  const premier = getPremierJourMois(d);
  const jour = premier.getDay();
  const diff = jour === 0 ? -6 : 1 - jour;
  const r = new Date(premier);
  r.setDate(r.getDate() + diff);
  return r;
}

const DRAG_THRESHOLD = 6;

// Regroupe les blocs d'un même jour par (titre, type)
function grouperBlocs(blocs: BlocPlanning[]): GroupeBloc[] {
  const map = new Map<string, GroupeBloc>();
  for (const b of blocs) {
    const key = `${b.titre ?? ""}||${b.type}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        titre: b.titre,
        type: b.type,
        date_assignation: b.date_assignation,
        date_limite: b.date_limite,
        chapitre_id: b.chapitre_id,
        contenu: b.contenu,
        blocs: [],
      });
    }
    map.get(key)!.blocs.push(b);
  }
  return [...map.values()];
}

export default function PageAdminPlanning() {
  const router = useRouter();
  const supabase = createClient();

  const [vueMode, setVueMode] = useState<VueMode>("semaine");
  const [lundi, setLundi]     = useState<Date>(() => getLundi(new Date()));
  const [mois, setMois]       = useState<Date>(() => new Date());

  const [blocs, setBlocs]           = useState<BlocPlanning[]>([]);
  const [chargement, setChargement] = useState(true);

  // ── Filtre par groupe ──────────────────────────────────────────────────────
  const [groupesFiltres, setGroupesFiltres]         = useState<GroupeFiltre[]>([]);
  const [membresParGroupe, setMembresParGroupe]     = useState<Map<string, { pbIds: Set<string>; rbIds: Set<number> }>>(new Map());
  const [filtreGroupeId, setFiltreGroupeId]         = useState<string>("");

  const [detail, setDetail]                 = useState<GroupeBloc | null>(null);
  const [jourDetailMois, setJourDetailMois] = useState<string | null>(null);

  const [aSupprimer, setASupprimer]       = useState<SupprimerMode>(null);
  const [enSuppression, setEnSuppression] = useState(false);

  const [supprimerBanqueConfirm, setSupprimerBanqueConfirm] = useState(false);
  const [enSuppressionBanque, setEnSuppressionBanque]       = useState(false);

  const [editMode, setEditMode]         = useState(false);
  const [editTitre, setEditTitre]       = useState("");
  const [editConsigne, setEditConsigne] = useState("");
  const [editQuestions, setEditQuestions] = useState<
    { id: number; enonce: string; reponse_attendue: string }[]
  >([]);
  const [enSauvegarde, setEnSauvegarde] = useState(false);
  const [niveauDicteePreview, setNiveauDicteePreview] = useState<number>(1);
  const [dicteesNiveaux, setDicteesNiveaux] = useState<Record<number, { texte: string; mots: { mot: string; definition?: string }[] }>>({});

  // Drag & drop
  const dragGroupRef   = useRef<GroupeBloc | null>(null);
  const startPosRef    = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef  = useRef(false);
  const dropTargetRef  = useRef<string | null>(null);
  const [ghostPos, setGhostPos]           = useState<{ x: number; y: number } | null>(null);
  const [draggingGroup, setDraggingGroup] = useState<GroupeBloc | null>(null);
  const [dropHighlight, setDropHighlight] = useState<string | null>(null);
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push("/enseignant");
    });
  }, []);

  // Chargement des groupes et de leurs membres (une seule fois au montage)
  useEffect(() => {
    async function chargerGroupes() {
      const [{ data: grps }, { data: membres }] = await Promise.all([
        supabase.from("groupes").select("id, nom").order("nom"),
        supabase.from("eleve_groupe").select("groupe_id, planbox_eleve_id, repetibox_eleve_id"),
      ]);
      setGroupesFiltres((grps ?? []) as GroupeFiltre[]);
      const map = new Map<string, { pbIds: Set<string>; rbIds: Set<number> }>();
      for (const m of (membres ?? []) as { groupe_id: string; planbox_eleve_id: string | null; repetibox_eleve_id: number | null }[]) {
        if (!map.has(m.groupe_id)) map.set(m.groupe_id, { pbIds: new Set(), rbIds: new Set() });
        const entry = map.get(m.groupe_id)!;
        if (m.planbox_eleve_id) entry.pbIds.add(m.planbox_eleve_id);
        if (m.repetibox_eleve_id) entry.rbIds.add(m.repetibox_eleve_id);
      }
      setMembresParGroupe(map);
    }
    chargerGroupes();
  }, []);

  const charger = useCallback(async () => {
    setChargement(true);
    let url: string;
    if (vueMode === "mois") {
      const debut = formatISO(getPremierJourMois(mois));
      const fin   = formatISO(getDernierJourMois(mois));
      url = `/api/admin/planning?debut=${debut}&fin=${fin}`;
    } else {
      url = `/api/admin/planning?lundi=${formatISO(lundi)}`;
    }
    const res  = await fetch(url);
    const json = await res.json();
    setBlocs(json.blocs ?? []);
    setChargement(false);
  }, [lundi, mois, vueMode]);

  useEffect(() => { charger(); }, [charger]);

  // ── Chargement des 4 niveaux dictée depuis la table `dictees` ────────────────
  useEffect(() => {
    if (!detail || detail.type !== "dictee") { setDicteesNiveaux({}); return; }
    const parentId = (detail.contenu as Record<string, unknown>).dictee_parent_id as string | undefined;
    if (!parentId) return;
    supabase
      .from("dictees")
      .select("niveau_etoiles, texte, mots")
      .eq("dictee_parent_id", parentId)
      .order("niveau_etoiles")
      .then(({ data }) => {
        if (!data) return;
        const map: Record<number, { texte: string; mots: { mot: string; definition?: string }[] }> = {};
        for (const row of data) {
          map[row.niveau_etoiles] = { texte: row.texte, mots: (row.mots as { mot: string; definition?: string }[]) ?? [] };
        }
        setDicteesNiveaux(map);
        const niveaux = Object.keys(map).map(Number).sort();
        setNiveauDicteePreview(niveaux[0] ?? 1);
      });
  }, [detail, supabase]);

  const semainePrecedente = () => setLundi((l) => addDays(l, -7));
  const semaineSuivante   = () => setLundi((l) => addDays(l, 7));
  const semaineActuelle   = () => setLundi(getLundi(new Date()));
  const moisPrecedent = () => setMois((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const moisSuivant   = () => setMois((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  const moisActuel    = () => setMois(new Date());

  // ── Drag ──────────────────────────────────────────────────────────────────────
  function onPointerDown(e: React.PointerEvent, group: GroupeBloc) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startPosRef.current  = { x: e.clientX, y: e.clientY };
    dragGroupRef.current = group;
    isDraggingRef.current = false;
  }

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      if (!startPosRef.current || !dragGroupRef.current) return;
      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;
      if (!isDraggingRef.current) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        isDraggingRef.current = true;
        setDraggingGroup(dragGroupRef.current);
      }
      setGhostPos({ x: e.clientX, y: e.clientY });
      let found: string | null = null;
      for (const [iso, ref] of Object.entries(colRefs.current)) {
        if (!ref) continue;
        const rect = ref.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top  && e.clientY <= rect.bottom) { found = iso; break; }
      }
      if (found !== dropTargetRef.current) {
        dropTargetRef.current = found;
        setDropHighlight(found);
      }
    }
    async function onPointerUp() {
      const group  = dragGroupRef.current;
      const target = dropTargetRef.current;
      const wasDragging = isDraggingRef.current;
      dragGroupRef.current = null; startPosRef.current = null;
      isDraggingRef.current = false; dropTargetRef.current = null;
      setDraggingGroup(null); setGhostPos(null); setDropHighlight(null);
      if (!group) return;
      if (!wasDragging) {
        setDetail(group);
        const niveaux = [...new Set(group.blocs.map((b) => (b.contenu as Record<string, unknown>).niveau_etoiles as number).filter(Boolean))].sort();
        setNiveauDicteePreview(niveaux[0] ?? 1);
        return;
      }
      if (!target || target === group.date_assignation) return;
      // Déplacer tous les blocs du groupe
      setBlocs((prev) => prev.map((b) =>
        group.blocs.some((gb) => gb.id === b.id) ? { ...b, date_assignation: target } : b
      ));
      const results = await Promise.all(
        group.blocs.map((b) => fetch("/api/admin/planning", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blocId: b.id, date_assignation: target }),
        }))
      );
      if (results.some((r) => !r.ok)) charger();
    }
    window.addEventListener("pointermove",   onPointerMove, { passive: true });
    window.addEventListener("pointerup",     onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove",   onPointerMove);
      window.removeEventListener("pointerup",     onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [charger]);

  // ── Suppression assignation ──────────────────────────────────────────────────
  async function supprimerAssignation(mode: "un" | "tous", id?: string) {
    setEnSuppression(true);
    if (mode === "un" && id) {
      await fetch(`/api/admin/planning?id=${id}`, { method: "DELETE" });
    } else if (mode === "tous" && detail) {
      await Promise.all(
        detail.blocs
          .filter((b) => b.statut !== "fait")
          .map((b) => fetch(`/api/admin/planning?id=${b.id}`, { method: "DELETE" }))
      );
    }
    setASupprimer(null);
    setEnSuppression(false);
    fermerDrawer();
    charger();
  }

  // ── Suppression banque ───────────────────────────────────────────────────────
  async function supprimerBanque() {
    if (!detail) return;
    setEnSuppressionBanque(true);
    try {
      const params = new URLSearchParams();
      if (detail.chapitre_id) params.set("chapitre_id", detail.chapitre_id);
      const res = await fetch(`/api/admin/exercices?${params.toString()}`);
      const { exercices } = await res.json();
      const banque = (exercices ?? []).find((e: { titre: string | null }) => e.titre === detail.titre);
      if (banque) {
        await fetch(`/api/admin/exercices?id=${banque.id}`, { method: "DELETE" });
      } else {
        await Promise.all(detail.blocs.map((b) =>
          fetch(`/api/admin/planning?id=${b.id}`, { method: "DELETE" })
        ));
      }
    } finally {
      setEnSuppressionBanque(false);
      setSupprimerBanqueConfirm(false);
      fermerDrawer();
      charger();
    }
  }

  // ── Édition inline ───────────────────────────────────────────────────────────
  function ouvrirEdit() {
    if (!detail) return;
    const ex = detail.contenu as {
      consigne?: string;
      questions?: { id: number; enonce: string; reponse_attendue: string }[];
    };
    setEditTitre(detail.titre ?? "");
    setEditConsigne(ex.consigne ?? "");
    setEditQuestions(ex.questions ?? []);
    setEditMode(true);
  }

  async function sauvegarderEdit() {
    if (!detail) return;
    setEnSauvegarde(true);
    const nouveauContenu = { ...detail.contenu, consigne: editConsigne, questions: editQuestions };
    await Promise.all(detail.blocs.map((b) =>
      fetch("/api/admin/planning", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocId: b.id, titre: editTitre, contenu: nouveauContenu }),
      })
    ));
    const updatedBlocs = detail.blocs.map((b) => ({ ...b, titre: editTitre, contenu: nouveauContenu }));
    const updatedDetail = { ...detail, titre: editTitre, contenu: nouveauContenu, blocs: updatedBlocs };
    setDetail(updatedDetail);
    setBlocs((prev) => prev.map((b) => updatedBlocs.find((ub) => ub.id === b.id) ?? b));
    setEnSauvegarde(false);
    setEditMode(false);
  }

  function ajouterQuestion() {
    const newId = editQuestions.length > 0 ? Math.max(...editQuestions.map((q) => q.id)) + 1 : 1;
    setEditQuestions((prev) => [...prev, { id: newId, enonce: "", reponse_attendue: "" }]);
  }

  function fermerDrawer() {
    setDetail(null);
    setASupprimer(null);
    setSupprimerBanqueConfirm(false);
    setEditMode(false);
  }

  // ── Données calculées ─────────────────────────────────────────────────────────
  const vendredi     = addDays(lundi, 4);
  const labelSemaine = `${formatJour(lundi)} – ${formatJour(vendredi)}`;
  const todayISO     = formatISO(new Date());

  // ── Filtrage par groupe ────────────────────────────────────────────────────
  const blocsFiltres: BlocPlanning[] = filtreGroupeId
    ? blocs.filter((b) => {
        const membres = membresParGroupe.get(filtreGroupeId);
        const groupe  = groupesFiltres.find((g) => g.id === filtreGroupeId);
        // Blocs assignés via groupe_label (assignation collective)
        if (groupe && b.groupe_label === groupe.nom) return true;
        if (!membres) return false;
        // Blocs assignés individuellement à un membre du groupe
        if (b.eleve_id && membres.pbIds.has(b.eleve_id)) return true;
        if (b.repetibox_eleve_id != null && membres.rbIds.has(b.repetibox_eleve_id)) return true;
        return false;
      })
    : blocs;

  const joursSemaine = JOURS_SEMAINE.map((nom, i) => {
    const date = addDays(lundi, i);
    const iso  = formatISO(date);
    const blocsJour = blocsFiltres.filter((b) => b.date_assignation === iso);
    return { nom, date, iso, groupes: grouperBlocs(blocsJour), nbBlocs: blocsJour.length };
  });

  function buildCalendrier() {
    const premierCase = getPremierCaseMois(mois);
    const moisNum = mois.getMonth();
    const annee   = mois.getFullYear();
    const jours: { date: Date; iso: string; dansMois: boolean; estWeekend: boolean }[] = [];
    let cur = new Date(premierCase);
    while (jours.length < 42) {
      const iso = formatISO(cur);
      const dayOfWeek = cur.getDay();
      const estWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const dansMois = cur.getMonth() === moisNum && cur.getFullYear() === annee;
      jours.push({ date: new Date(cur), iso, dansMois, estWeekend });
      cur = addDays(cur, 1);
      if (jours.length >= 28 && cur.getMonth() !== moisNum && cur.getFullYear() >= annee) break;
    }
    return jours;
  }

  const calendrier = vueMode === "mois" ? buildCalendrier() : [];
  const blocsParJour: Record<string, BlocPlanning[]> = {};
  blocsFiltres.forEach((b) => {
    if (!blocsParJour[b.date_assignation]) blocsParJour[b.date_assignation] = [];
    blocsParJour[b.date_assignation].push(b);
  });

  // ── GroupeCard ────────────────────────────────────────────────────────────────
  function GroupeCard({ g }: { g: GroupeBloc }) {
    const conf = COULEURS_TYPE[g.type] ?? { bg: "#F3F4F6", border: "#D1D5DB", color: "#374151" };
    const isDragging = draggingGroup?.key === g.key && draggingGroup.date_assignation === g.date_assignation;
    const nbFait  = g.blocs.filter((b) => b.statut === "fait").length;
    const nbTotal = g.blocs.length;
    const nomsEleves = g.blocs.map((b) => b.eleve_info?.prenom ?? "?").slice(0, 3).join(", ");
    const surplus = nbTotal > 3 ? ` +${nbTotal - 3}` : "";

    async function supprimerGroupe(e: React.MouseEvent) {
      e.stopPropagation();
      if (!confirm(`Supprimer "${g.titre}" pour tous les élèves ?`)) return;
      await fetch("/api/admin/supprimer-bloc-planning", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: g.type, titre: g.titre, date: g.date_assignation }),
      });
      charger();
    }

    return (
      <div
        onPointerDown={(e) => onPointerDown(e, g)}
        style={{
          background: conf.bg, border: `1.5px solid ${conf.border}`, borderRadius: 8,
          padding: "7px 10px", cursor: isDragging ? "grabbing" : "grab",
          opacity: isDragging ? 0.35 : 1, userSelect: "none", touchAction: "none",
          transition: "opacity 0.12s", position: "relative",
        }}
      >
        {/* Croix suppression */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={supprimerGroupe}
          title="Supprimer ce bloc"
          style={{
            position: "absolute", top: -6, right: -6,
            width: 18, height: 18, borderRadius: "50%",
            background: "#DC2626", border: "2px solid white",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)", padding: 0,
            transition: "transform 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          <span className="ms" style={{ fontSize: 11, color: "white", lineHeight: 1 }}>close</span>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
          <span className="ms" style={{ fontSize: 11 }}>{ICONES_TYPE[g.type] ?? "push_pin"}</span>
          <span style={{
            display: "inline-block", width: 7, height: 7, borderRadius: "50%", marginLeft: "auto",
            background: nbFait === nbTotal ? "#10B981" : nbFait > 0 ? "#F59E0B" : "#EF4444",
          }} />
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: conf.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {g.titre ?? (g.type === "calcul_mental" ? "Calcul mental" : "Sans titre")}
        </div>
        <div style={{ fontSize: 11, color: conf.color, opacity: 0.75, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {nomsEleves}{surplus}
          {nbTotal > 1 && <span style={{ marginLeft: 6, opacity: 0.6 }}>{nbFait}/{nbTotal} ✅</span>}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <EnseignantLayout>
      <div style={{ userSelect: draggingGroup ? "none" : undefined }}>

      {/* Ghost drag */}
      {ghostPos && draggingGroup && (() => {
        const conf = COULEURS_TYPE[draggingGroup.type] ?? { bg: "#F3F4F6", border: "#D1D5DB", color: "#374151" };
        return (
          <div style={{
            position: "fixed", left: ghostPos.x, top: ghostPos.y,
            transform: "translate(-50%, -50%) rotate(2deg) scale(1.05)",
            width: 170, pointerEvents: "none", zIndex: 999,
            background: conf.bg, border: `2px solid ${conf.border}`, borderRadius: 8,
            padding: "7px 10px", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", opacity: 0.95,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: conf.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>{ICONES_TYPE[draggingGroup.type] ?? "push_pin"}</span>{" "}
              {draggingGroup.titre ?? (draggingGroup.type === "calcul_mental" ? "Calcul mental" : "Sans titre")}
            </div>
            <div style={{ fontSize: 11, color: conf.color, opacity: 0.75, marginTop: 2 }}>
              {draggingGroup.blocs.length} élève{draggingGroup.blocs.length > 1 ? "s" : ""}
            </div>
          </div>
        );
      })()}

      {/* ── Barre navigation + toggle vue ─────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
        background: "white", borderBottom: "1px solid var(--border)", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden", marginRight: 8 }}>
          {(["semaine", "mois"] as VueMode[]).map((v) => (
            <button key={v} onClick={() => setVueMode(v)} style={{
              padding: "5px 14px", fontSize: 13, fontWeight: vueMode === v ? 700 : 400,
              background: vueMode === v ? "var(--primary)" : "white",
              color: vueMode === v ? "white" : "var(--text-secondary)",
              border: "none", cursor: "pointer", fontFamily: "var(--font)",
            }}>
              {v === "semaine" ? "Semaine" : "Mois"}
            </button>
          ))}
        </div>

        {vueMode === "semaine" ? (
          <>
            <button className="btn-ghost" onClick={semainePrecedente} style={{ padding: "5px 12px", fontSize: 16 }}>‹</button>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 150, textAlign: "center" }}>{labelSemaine}</span>
            <button className="btn-ghost" onClick={semaineSuivante}   style={{ padding: "5px 12px", fontSize: 16 }}>›</button>
            <button className="btn-ghost" onClick={semaineActuelle}   style={{ padding: "5px 10px", fontSize: 12 }}>Aujourd'hui</button>
          </>
        ) : (
          <>
            <button className="btn-ghost" onClick={moisPrecedent} style={{ padding: "5px 12px", fontSize: 16 }}>‹</button>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 150, textAlign: "center", textTransform: "capitalize" }}>
              {formatMoisAnnee(mois)}
            </span>
            <button className="btn-ghost" onClick={moisSuivant} style={{ padding: "5px 12px", fontSize: 16 }}>›</button>
            <button className="btn-ghost" onClick={moisActuel}  style={{ padding: "5px 10px", fontSize: 12 }}>Ce mois</button>
          </>
        )}

        {/* Filtre par groupe */}
        {groupesFiltres.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <span className="ms" style={{ fontSize: 14, color: "var(--text-secondary)", whiteSpace: "nowrap", flexShrink: 0 }}>group</span>
            <select
              value={filtreGroupeId}
              onChange={(e) => setFiltreGroupeId(e.target.value)}
              style={{
                fontSize: 13,
                fontFamily: "var(--font)",
                color: filtreGroupeId ? "var(--primary)" : "var(--text-secondary)",
                fontWeight: filtreGroupeId ? 700 : 400,
                background: filtreGroupeId ? "var(--primary-pale)" : "var(--white)",
                border: `1.5px solid ${filtreGroupeId ? "var(--primary)" : "var(--border)"}`,
                borderRadius: 8,
                padding: "5px 10px",
                cursor: "pointer",
                outline: "none",
                transition: "all 0.15s",
              }}
            >
              <option value="">Tous les groupes</option>
              {groupesFiltres.map((g) => (
                <option key={g.id} value={g.id}>{g.nom}</option>
              ))}
            </select>
            {filtreGroupeId && (
              <button
                onClick={() => setFiltreGroupeId("")}
                title="Effacer le filtre"
                style={{
                  padding: "4px 8px", fontSize: 12, background: "none",
                  border: "1px solid var(--border)", borderRadius: 6,
                  cursor: "pointer", color: "var(--text-secondary)", fontFamily: "var(--font)",
                }}
              >✕</button>
            )}
          </div>
        )}

        <Link
          href="/enseignant/generer"
          className="btn-primary"
          style={{ fontSize: 13, marginLeft: groupesFiltres.length > 0 ? 8 : "auto" }}
        >
          + Planifier
        </Link>
      </div>

      {/* ── Vue semaine ───────────────────────────────────────────────────────── */}
      {vueMode === "semaine" && (
        <div style={{ padding: "16px 12px", overflowX: "auto" }}>
          {chargement ? (
            <div style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>Chargement…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10, minWidth: 900 }}>
              {joursSemaine.map(({ nom, date, iso, groupes, nbBlocs }) => {
                const isToday  = iso === todayISO;
                const isTarget = dropHighlight === iso;
                return (
                  <div
                    key={iso}
                    ref={(el) => { colRefs.current[iso] = el; }}
                    style={{
                      background: isTarget ? "var(--primary-pale)" : "white",
                      border: `2px solid ${isTarget ? "var(--primary)" : isToday ? "var(--primary-mid)" : "var(--border)"}`,
                      borderRadius: 12, padding: 10, minHeight: 420,
                      transition: "border-color 0.1s, background 0.1s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: isToday ? "var(--primary)" : "var(--text)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{nom}</div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{formatJour(date)}</div>
                      </div>
                      <Link href={`/enseignant/generer?date=${iso}`} className="btn-ghost"
                        style={{ padding: "3px 9px", fontSize: 16, lineHeight: 1, color: "var(--primary)", fontWeight: 700 }}>+</Link>
                    </div>
                    {nbBlocs > 0 && (
                      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 6 }}>
                        {nbBlocs} activité{nbBlocs > 1 ? "s" : ""}
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {groupes.map((g) => <GroupeCard key={g.key} g={g} />)}
                    </div>
                    {groupes.length === 0 && !isTarget && (
                      <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-secondary)", fontSize: 12, opacity: 0.5 }}>Aucune activité</div>
                    )}
                    {isTarget && (
                      <div style={{ marginTop: 8, borderRadius: 8, border: "2px dashed var(--primary)", height: 48, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)", fontSize: 12, fontWeight: 600, opacity: 0.7 }}>
                        Déposer ici
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Vue mois ──────────────────────────────────────────────────────────── */}
      {vueMode === "mois" && (
        <div style={{ padding: "16px 12px" }}>
          {chargement ? (
            <div style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>Chargement…</div>
          ) : (
            <>
              <div style={{ background: "white", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--border)" }}>
                  {JOURS_MOIS.map((j, i) => (
                    <div key={j} style={{
                      padding: "8px 4px", textAlign: "center", fontSize: 12, fontWeight: 700,
                      color: i >= 5 ? "#9CA3AF" : "var(--text)",
                      textTransform: "uppercase", letterSpacing: "0.04em",
                    }}>{j}</div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                  {calendrier.map(({ date, iso, dansMois, estWeekend }) => {
                    const blocsJour    = blocsParJour[iso] ?? [];
                    const groupesMois  = grouperBlocs(blocsJour);
                    const isToday      = iso === todayISO;
                    const isTarget     = dropHighlight === iso;
                    const ouvert       = jourDetailMois === iso;
                    const cliquable    = dansMois;
                    return (
                      <div
                        key={iso}
                        ref={(el) => { colRefs.current[iso] = el; }}
                        onClick={() => cliquable && setJourDetailMois(ouvert ? null : iso)}
                        style={{
                          minHeight: 90, padding: "5px 5px 4px",
                          minWidth: 0, overflow: "hidden",
                          borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
                          background: isTarget ? "#EEF2FF" : ouvert ? "var(--primary-pale)" : !dansMois ? "#FAFAFA" : "white",
                          boxShadow: isTarget ? "inset 0 0 0 2px var(--primary)" : undefined,
                          cursor: cliquable ? "pointer" : "default",
                          opacity: !dansMois ? 0.4 : 1,
                          transition: "background 0.1s, box-shadow 0.1s",
                        }}
                      >
                        {/* Numéro du jour */}
                        <div style={{ display: "flex", alignItems: "center", marginBottom: 3, gap: 4 }}>
                          <div style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 22, height: 22, borderRadius: "50%", fontSize: 12, fontWeight: 600,
                            background: isToday ? "var(--primary)" : "transparent",
                            color: isToday ? "white" : estWeekend && dansMois ? "#9CA3AF" : "var(--text)",
                            flexShrink: 0,
                          }}>
                            {date.getDate()}
                          </div>
                          {isTarget && <span style={{ fontSize: 10, color: "var(--primary)", fontWeight: 800, marginLeft: "auto" }}>↓</span>}
                        </div>

                        {/* Chips blocs */}
                        {dansMois && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {groupesMois.map((g) => {
                              const conf = COULEURS_TYPE[g.type] ?? { bg: "#F3F4F6", border: "#D1D5DB", color: "#374151" };
                              const isDraggingThis = draggingGroup?.key === g.key && draggingGroup.date_assignation === g.date_assignation;
                              return (
                                <div
                                  key={g.key}
                                  onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, g); }}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    background: conf.bg, border: `1px solid ${conf.border}`, borderRadius: 3,
                                    padding: "2px 4px", display: "flex", alignItems: "center", gap: 3,
                                    cursor: isDraggingThis ? "grabbing" : "grab",
                                    opacity: isDraggingThis ? 0.35 : 1,
                                    userSelect: "none", touchAction: "none",
                                    overflow: "hidden",
                                  }}
                                >
                                  <span className="ms" style={{ fontSize: 9, flexShrink: 0 }}>{ICONES_TYPE[g.type] ?? "push_pin"}</span>
                                  <span style={{
                                    fontSize: 10, fontWeight: 600, color: conf.color,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                  }}>
                                    {g.titre ?? (g.type === "calcul_mental" ? "Calcul mental" : "—")}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Zone de dépôt */}
                        {isTarget && dansMois && groupesMois.length === 0 && (
                          <div style={{ marginTop: 4, borderRadius: 3, border: "1.5px dashed var(--primary)", height: 22, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)", fontSize: 10, fontWeight: 700 }}>
                            Déposer ici
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Popup modale jour sélectionné */}
              {jourDetailMois && (
                <div
                  style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
                  onClick={() => setJourDetailMois(null)}
                >
                  <div
                    style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440, maxHeight: "80vh", overflowY: "auto" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, textTransform: "capitalize", margin: 0 }}>
                        {new Date(jourDetailMois + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                      </h3>
                      <button className="btn-ghost" onClick={() => setJourDetailMois(null)} style={{ padding: "4px 10px" }}>✕</button>
                    </div>

                    {(blocsParJour[jourDetailMois] ?? []).length === 0 ? (
                      <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-secondary)", fontSize: 14 }}>
                        Aucune activité ce jour
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                        {grouperBlocs(blocsParJour[jourDetailMois] ?? []).map((g) => {
                          const conf = COULEURS_TYPE[g.type] ?? { bg: "#F3F4F6", border: "#D1D5DB", color: "#374151" };
                          const nbFait = g.blocs.filter((b) => b.statut === "fait").length;
                          return (
                            <div
                              key={g.key}
                              onClick={() => {
                              setJourDetailMois(null);
                              setDetail(g);
                              const niveaux = [...new Set(g.blocs.map((b) => (b.contenu as Record<string, unknown>).niveau_etoiles as number).filter(Boolean))].sort();
                              setNiveauDicteePreview(niveaux[0] ?? 1);
                            }}
                              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: conf.bg, border: `1.5px solid ${conf.border}`, borderRadius: 8, cursor: "pointer" }}
                            >
                              <span className="ms" style={{ fontSize: 16 }}>{ICONES_TYPE[g.type] ?? "push_pin"}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: conf.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {g.titre ?? (g.type === "calcul_mental" ? "Calcul mental" : "Sans titre")}
                                </div>
                                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                                  {g.blocs.map((b) => b.eleve_info?.prenom ?? "?").slice(0, 3).join(", ")}
                                  {g.blocs.length > 3 ? ` +${g.blocs.length - 3}` : ""}
                                </div>
                              </div>
                              <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: nbFait === g.blocs.length ? "#D1FAE5" : "#FEF3C7", color: nbFait === g.blocs.length ? "#065F46" : "#92400E", whiteSpace: "nowrap" }}>
                                {nbFait}/{g.blocs.length} ✅
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <Link
                      href={`/enseignant/generer?date=${jourDetailMois}`}
                      className="btn-primary"
                      style={{ display: "block", textAlign: "center", fontSize: 13 }}
                      onClick={() => setJourDetailMois(null)}
                    >
                      + Planifier ce jour
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Modale détail ─────────────────────────────────────────────────────── */}
      {detail && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => { if (!editMode) fermerDrawer(); }}
        >
          <div
            style={{
              background: "white", borderRadius: 16,
              width: "100%", maxWidth: 700,
              maxHeight: "90vh", overflowY: "auto",
              padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
                  <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>{ICONES_TYPE[detail.type] ?? "push_pin"}</span>{" "}
                  {detail.titre ?? (detail.type === "calcul_mental" ? "Calcul mental" : "Sans titre")}
                </h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {new Date(detail.date_assignation + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" })}
                  </span>
                  {/* Groupe ou élèves */}
                  {detail.blocs[0]?.groupe_label ? (
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "#D4DAFC", color: "#1642A3" }}>
                      👥 {detail.blocs[0].groupe_label}
                    </span>
                  ) : detail.blocs.length > 1 ? (
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "#EEF0FE", color: "#1642A3" }}>
                      👤 {detail.blocs.length} élèves
                    </span>
                  ) : null}
                </div>
              </div>
              <button className="btn-ghost" onClick={fermerDrawer} style={{ padding: "4px 10px", flexShrink: 0 }}>✕</button>
            </div>

            {/* ── Mode édition ─────────────────────────────────────────────────── */}
            {editMode ? (
              <div>
                <div className="form-group">
                  <label className="form-label">Titre</label>
                  <input className="form-input" value={editTitre} onChange={(e) => setEditTitre(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Consigne</label>
                  <textarea className="form-input" rows={2} value={editConsigne}
                    onChange={(e) => setEditConsigne(e.target.value)} style={{ resize: "vertical" }} />
                </div>
                <div className="form-group">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Questions</label>
                    <button type="button" onClick={ajouterQuestion}
                      style={{ fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font)" }}>
                      + Ajouter
                    </button>
                  </div>
                  {editQuestions.map((q, i) => (
                    <div key={q.id} style={{ marginBottom: 10, padding: 10, background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Q{i + 1}</span>
                        <button type="button" onClick={() => setEditQuestions((p) => p.filter((x) => x.id !== q.id))}
                          style={{ fontSize: 11, color: "var(--error)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font)" }}>✕</button>
                      </div>
                      <input className="form-input" style={{ marginBottom: 4, fontSize: 13 }} placeholder="Énoncé" value={q.enonce}
                        onChange={(e) => setEditQuestions((p) => p.map((x) => x.id === q.id ? { ...x, enonce: e.target.value } : x))} />
                      <input className="form-input" style={{ fontSize: 13 }} placeholder="Réponse attendue" value={q.reponse_attendue}
                        onChange={(e) => setEditQuestions((p) => p.map((x) => x.id === q.id ? { ...x, reponse_attendue: e.target.value } : x))} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={sauvegarderEdit} disabled={enSauvegarde} className="btn-primary" style={{ flex: 1 }}>
                    {enSauvegarde ? "Sauvegarde…" : "✅ Sauvegarder"}
                  </button>
                  <button className="btn-ghost" onClick={() => setEditMode(false)}>Annuler</button>
                </div>
              </div>
            ) : (() => {
                const exContenu = detail.contenu as { consigne?: string; questions?: { id: number; enonce: string; reponse_attendue: string; indice?: string }[] };
                const cmContenu = detail.contenu as { calculs?: { id: number; enonce: string; reponse: string | number }[] };
                const dicteeContenu = detail.contenu as { mots?: { mot: string; definition: string }[]; texte?: string; phrases?: string[] };
                const motsContenu = detail.contenu as { mots?: { mot: string; definition?: string }[] };
                return (
              <>
                {/* ── Aperçu exercice (vue élève) ── */}
                {detail.type === "exercice" && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                      Aperçu élève
                    </div>
                    <div style={{ background: "var(--bg)", borderRadius: 12, padding: "16px 18px", border: "1px solid var(--border)" }}>
                      {exContenu.consigne && (
                        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 16, color: "var(--text)" }}>{exContenu.consigne}</p>
                      )}
                      {(exContenu.questions ?? []).map((q, i) => (
                        <div key={q.id} style={{ marginBottom: 16, padding: "14px 16px", background: "var(--primary-pale)", borderRadius: 10, border: "1px solid var(--primary-mid)" }}>
                          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
                            {i + 1}. {q.enonce}
                          </div>
                          {q.indice && (
                            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8, fontStyle: "italic" }}>💡 {q.indice}</p>
                          )}
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              type="text"
                              disabled
                              placeholder="Réponse de l'élève…"
                              style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14, background: "white", color: "var(--text-secondary)", fontFamily: "inherit" }}
                            />
                            <span style={{ fontSize: 12, color: "var(--primary)", fontWeight: 700, whiteSpace: "nowrap" }}>✓ {q.reponse_attendue}</span>
                          </div>
                        </div>
                      ))}
                      <button disabled style={{ width: "100%", padding: "10px", background: "var(--primary)", color: "white", border: "none", borderRadius: 10, fontWeight: 600, fontSize: 14, opacity: 0.5, cursor: "not-allowed" }}>
                        ✅ Valider mes réponses
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Aperçu dictée ── */}
                {detail.type === "dictee" && (() => {
                  const LABELS: Record<number, string> = { 1: "CE2", 2: "CM1", 3: "CM2", 4: "CM2+" };
                  // Utilise la table `dictees` si disponible (tous les 4 niveaux), sinon fallback blocs
                  const hasDicteesNiveaux = Object.keys(dicteesNiveaux).length > 0;
                  const niveauxDispos = hasDicteesNiveaux
                    ? Object.keys(dicteesNiveaux).map(Number).sort()
                    : [...new Set(detail.blocs.map((b) => (b.contenu as Record<string, unknown>).niveau_etoiles as number).filter(Boolean))].sort();
                  const contenuNiveau = hasDicteesNiveaux
                    ? (dicteesNiveaux[niveauDicteePreview] ?? null)
                    : (() => {
                        const b = detail.blocs.find((b) => (b.contenu as Record<string, unknown>).niveau_etoiles === niveauDicteePreview);
                        return (b?.contenu ?? detail.contenu) as { texte?: string; mots?: { mot: string; definition?: string }[] };
                      })();
                  return (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                        Aperçu dictée
                      </div>
                      {/* Sélecteur de niveaux */}
                      {niveauxDispos.length > 1 && (
                        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                          {niveauxDispos.map((n) => {
                            const actif = n === niveauDicteePreview;
                            return (
                              <button
                                key={n}
                                onClick={() => setNiveauDicteePreview(n)}
                                style={{
                                  padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                                  border: actif ? "1.5px solid #7C3AED" : "1.5px solid #C4B5FD",
                                  background: actif ? "#7C3AED" : "#EDE9FE",
                                  color: actif ? "white" : "#17055b",
                                  transition: "all 0.15s",
                                }}
                              >
                                {"⭐".repeat(n)} {LABELS[n]}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div style={{ background: "var(--bg)", borderRadius: 12, padding: "16px 18px", border: "1px solid var(--border)" }}>
                        {contenuNiveau.texte && (
                          <div style={{ marginBottom: 14, padding: "12px 14px", background: "#EDE9FE", borderRadius: 8, border: "1px solid #7C3AED" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#17055b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>Texte</div>
                            <p style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6, margin: 0 }}>{contenuNiveau.texte}</p>
                          </div>
                        )}
                        {(contenuNiveau.mots ?? []).length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#17055b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                              Mots à apprendre ({(contenuNiveau.mots ?? []).length})
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              {(contenuNiveau.mots ?? []).map((m, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "6px 10px", borderRadius: 8, background: "#EDE9FE", border: "1px solid #C4B5FD" }}>
                                  <span style={{ fontWeight: 700, fontSize: 13, color: "#17055b", minWidth: 80 }}>{m.mot}</span>
                                  {m.definition && (
                                    <span style={{ fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic" }}>{m.definition}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Aperçu liste de mots ── */}
                {detail.type === "mots" && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                      Aperçu mots
                    </div>
                    <div style={{ background: "var(--bg)", borderRadius: 12, padding: "16px 18px", border: "1px solid var(--border)" }}>
                      {(motsContenu.mots ?? []).length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {(motsContenu.mots ?? []).map((m, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "8px 12px", background: "#deeffe", borderRadius: 8, border: "1px solid #5ca0f0" }}>
                              <span style={{ fontWeight: 700, fontSize: 14, color: "#1a4fa0", minWidth: 80 }}>{m.mot}</span>
                              {m.definition && (
                                <span style={{ fontSize: 13, color: "var(--text-secondary)", fontStyle: "italic" }}>{m.definition}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>Aucun mot</p>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Aperçu calcul mental (vue élève) ── */}
                {detail.type === "calcul_mental" && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                      Aperçu élève
                    </div>
                    <div style={{ background: "var(--bg)", borderRadius: 12, padding: "16px 18px", border: "1px solid var(--border)" }}>
                      {(cmContenu.calculs ?? []).map((c, i) => (
                        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "10px 14px", background: "var(--primary-pale)", borderRadius: 8, border: "1px solid var(--primary-mid)" }}>
                          <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{i + 1}. {c.enonce} =</span>
                          <input
                            type="text"
                            disabled
                            placeholder="?"
                            style={{ width: 70, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14, textAlign: "center", background: "white", color: "var(--text-secondary)", fontFamily: "inherit" }}
                          />
                          <span style={{ fontSize: 13, color: "var(--success)", fontWeight: 700, minWidth: 30 }}>{c.reponse}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Affectation : groupe ou élèves ── */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                    Affecté à
                  </div>
                  {(() => {
                    const groupMap = new Map<string, typeof detail.blocs>();
                    const individuels: typeof detail.blocs = [];
                    for (const b of detail.blocs) {
                      if (b.groupe_label) {
                        if (!groupMap.has(b.groupe_label)) groupMap.set(b.groupe_label, []);
                        groupMap.get(b.groupe_label)!.push(b);
                      } else {
                        individuels.push(b);
                      }
                    }
                    return (
                      <>
                        {[...groupMap.entries()].map(([label, blocs]) => {
                          const nbFait = blocs.filter((b) => b.statut === "fait").length;
                          return (
                            <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#D4DAFC", borderRadius: 8, marginBottom: 6 }}>
                              <span style={{ fontWeight: 700, fontSize: 14, color: "#1642A3" }}>👥 {label}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{nbFait}/{blocs.length} ✅</span>
                                {blocs.some((b) => b.statut !== "fait") && (
                                  <button onClick={() => { setSupprimerBanqueConfirm(false); setASupprimer({ type: "tous" }); }}
                                    style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer", border: "1px solid #FCA5A5", background: "#FFF5F5", color: "#DC2626" }}>
                                    🗑 Retirer
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {individuels.map((b) => (
                          <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--bg)", borderRadius: 8, marginBottom: 6 }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{b.eleve_info?.prenom ?? "?"} {b.eleve_info?.nom ?? ""}</div>
                              {b.eleve_info?.niveau && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{b.eleve_info.niveau}</div>}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: b.statut === "fait" ? "#D1FAE5" : "#FEF3C7", color: b.statut === "fait" ? "#065F46" : "#92400E" }}>
                                {b.statut === "fait" ? "✅" : "⏳"}
                              </span>
                              {b.statut !== "fait" && (
                                <button onClick={() => { setSupprimerBanqueConfirm(false); setASupprimer({ type: "un", id: b.id }); }}
                                  style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer", border: "1px solid #FCA5A5", background: "#FFF5F5", color: "#DC2626" }}>
                                  🗑
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                  {detail.date_limite && (
                    <div style={{ marginTop: 8 }}>
                      <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 12, background: "#FEE2E2", color: "#DC2626", fontWeight: 700 }}>
                        ⏰ Limite : {new Date(detail.date_limite + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                      </span>
                    </div>
                  )}
                </div>

                {/* ── Actions ── */}
                <div style={{ paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>

                  {detail.type === "exercice" && (
                    <button onClick={ouvrirEdit} className="btn-ghost"
                      style={{ width: "100%", padding: "9px 12px", fontSize: 13, textAlign: "left" }}>
                      ✏️ Modifier cet exercice
                    </button>
                  )}

                  {/* Confirmation suppression */}
                  {aSupprimer !== null ? (
                    <div style={{ background: "#FEF3C7", borderRadius: 8, padding: "10px 12px" }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "#92400E", marginBottom: 10 }}>
                        {aSupprimer.type === "un"
                          ? "Supprimer l'assignation pour cet élève ?"
                          : `Supprimer pour les ${detail.blocs.filter((b) => b.statut !== "fait").length} élèves non-terminés ?`}
                      </p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => {
                            if (aSupprimer.type === "un") supprimerAssignation("un", aSupprimer.id);
                            else supprimerAssignation("tous");
                          }}
                          disabled={enSuppression}
                          style={{ flex: 1, padding: "9px 0", background: "#D97706", color: "white", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 13 }}
                        >
                          {enSuppression ? "Suppression…" : "Confirmer"}
                        </button>
                        <button className="btn-ghost" onClick={() => setASupprimer(null)} style={{ padding: "9px 12px" }}>Annuler</button>
                      </div>
                    </div>
                  ) : (
                    !detail.blocs[0]?.groupe_label && detail.blocs.some((b) => b.statut !== "fait") && (
                      <button
                        onClick={() => { setSupprimerBanqueConfirm(false); setASupprimer({ type: "tous" }); }}
                        className="btn-ghost"
                        style={{ width: "100%", padding: "9px 12px", fontSize: 13, color: "#D97706", textAlign: "left" }}
                      >
                        🗑 Supprimer pour tous les élèves <span style={{ fontSize: 11, opacity: 0.7 }}>(non terminé)</span>
                      </button>
                    )
                  )}

                  {/* Supprimer de la banque */}
                  {supprimerBanqueConfirm ? (
                    <div style={{ background: "#FEE2E2", borderRadius: 8, padding: "12px" }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", marginBottom: 10 }}>
                        ⚠️ Supprimer de la banque retire cet exercice du plan de travail de tous les élèves qui ne l'ont pas encore fait.
                      </p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={supprimerBanque} disabled={enSuppressionBanque}
                          style={{ flex: 1, padding: "9px 0", background: "var(--error)", color: "white", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                          {enSuppressionBanque ? "Suppression…" : "Supprimer définitivement"}
                        </button>
                        <button className="btn-ghost" onClick={() => setSupprimerBanqueConfirm(false)} style={{ padding: "9px 12px" }}>Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setASupprimer(null); setSupprimerBanqueConfirm(true); }}
                      className="btn-ghost"
                      style={{ width: "100%", padding: "9px 12px", fontSize: 13, color: "var(--error)", textAlign: "left" }}>
                      🗑 Supprimer l'exercice définitivement <span style={{ fontSize: 11, opacity: 0.7 }}>(banque + tous les élèves)</span>
                    </button>
                  )}
                </div>
              </>
                );
              })()}
          </div>
        </div>
      )}
      </div>
    </EnseignantLayout>
  );
}
