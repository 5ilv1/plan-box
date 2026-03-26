"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useEleveSession } from "@/hooks/useEleveSession";
import { PlanTravail, Progression, Chapitre, Notification, TYPE_BLOC_CONFIG } from "@/types";
import ActivityCard from "@/components/ActivityCard";
import NotifCard from "@/components/NotifCard";

// ─── Types locaux ────────────────────────────────────────────────────────────

type ProgressionComplete = Progression & { chapitres: Chapitre };

interface ProgressionChapitre {
  chapitreId: string;
  titre: string;
  total: number;
  faits: number;
  evalDisponible: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MATIERE_ICONE: Record<string, string> = {
  maths: "calculate",
  français: "menu_book",
  histoire: "account_balance",
  géographie: "public",
  sciences: "science",
  anglais: "language",
  arts: "palette",
};

function iconeMatiere(matiere?: string | null): string {
  if (!matiere) return "description";
  return MATIERE_ICONE[matiere.toLowerCase()] ?? "description";
}

// Material Symbols pour chaque type de bloc (côté élève)
const TYPE_BLOC_MS: Record<string, { icon: string; color: string; bg: string }> = {
  exercice:      { icon: "edit_note",    color: "#2563EB", bg: "rgba(37,99,235,0.1)" },
  calcul_mental: { icon: "calculate",    color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
  mots:          { icon: "abc",          color: "#0369A1", bg: "rgba(3,105,161,0.1)" },
  dictee:        { icon: "headphones",   color: "#D97706", bg: "rgba(217,119,6,0.1)" },
  media:         { icon: "play_circle",  color: "#059669", bg: "rgba(5,150,105,0.1)" },
  eval:          { icon: "quiz",         color: "#DC2626", bg: "rgba(220,38,38,0.1)" },
  libre:         { icon: "draw",         color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
  ressource:     { icon: "open_in_new",  color: "#0891B2", bg: "rgba(8,145,178,0.1)" },
  repetibox:     { icon: "style",         color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
  fichier_maths: { icon: "square_foot",  color: "#0F766E", bg: "rgba(15,118,110,0.1)" },
  ecriture:      { icon: "edit_note",    color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
};

function groupParChapitre(blocs: PlanTravail[]): ProgressionChapitre[] {
  const map = new Map<string, { titre: string; exercices: PlanTravail[]; evals: PlanTravail[] }>();
  for (const b of blocs) {
    if (!b.chapitre_id) continue;
    if (!map.has(b.chapitre_id)) {
      map.set(b.chapitre_id, {
        titre: (b as any).chapitres?.titre ?? "Chapitre",
        exercices: [],
        evals: [],
      });
    }
    const entry = map.get(b.chapitre_id)!;
    if (b.type === "eval") entry.evals.push(b);
    else entry.exercices.push(b);
  }
  return Array.from(map.entries())
    .map(([id, { titre, exercices, evals }]) => ({
      chapitreId: id,
      titre,
      total: exercices.length,
      faits: exercices.filter((b) => b.statut === "fait").length,
      evalDisponible: evals.some((b) => b.statut === "a_faire"),
    }))
    .filter((p) => p.total > 0)
    .sort((a, b) => a.titre.localeCompare(b.titre));
}

// Wrapper auto-dismiss 5 s pour chaque notification
function NotifBanniere({ notif, onDismiss }: { notif: Notification; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(notif.id), 5000);
    return () => clearTimeout(t);
  }, [notif.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <NotifCard notif={notif} onMarquerLu={onDismiss} />;
}

// ─── Composant principal ─────────────────────────────────────────────────────

export default function DashboardEleve() {
  const router = useRouter();
  const supabase = createClient();
  const { session, chargement: chargementSession, effacerSession } = useEleveSession();

  const [niveauNom, setNiveauNom]                   = useState("");
  const [progressionsPB, setProgressionsPB]         = useState<ProgressionComplete[]>([]);
  const [progressionExos, setProgressionExos]       = useState<ProgressionChapitre[]>([]);
  const [blocsAujourdhui, setBlocsAujourdhui]       = useState<PlanTravail[]>([]);
  const [blocsSemaine, setBlocsSemaine]             = useState<PlanTravail[]>([]);
  const [notifications, setNotifications]           = useState<Notification[]>([]);
  const [chapitresRB, setChapitresRB]               = useState<Array<{ chapitre_id: number; chapitre_nom: string; nb_cartes_dues: number; token_url: string }>>([]);
  const [podcastsQcm, setPodcastsQcm]               = useState<Array<{ id: string; titre: string; qcm_id: string }>>([]);
  const [chargementDonnees, setChargementDonnees]   = useState(true);
  const [accordeonsOuverts, setAccordeonsOuverts]   = useState<Set<string>>(new Set());
  const [rbEleveId, setRbEleveId]                   = useState<number | null>(null);
  const [chargementRbBtn, setChargementRbBtn]        = useState(false);
  const [dailyProblem, setDailyProblem]               = useState<{ id: string; enonce: string; categorie: string; periode: string; semaine: string; niveau: string } | null>(null);
  const [dailyProblemSolved, setDailyProblemSolved]    = useState(false);

  // Ref pour accéder à session dans l'intervalle sans le capturer dans la closure
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  // ── Bornes semaine ──────────────────────────────────────────────────────────
  function getBornesSemaine() {
    const aujourd_hui = new Date();
    const jourSemaine = aujourd_hui.getDay();
    const lundi = new Date(aujourd_hui);
    lundi.setDate(aujourd_hui.getDate() - ((jourSemaine + 6) % 7));
    const fin = new Date(lundi);
    fin.setDate(lundi.getDate() + 13);
    return {
      debut: lundi.toISOString().split("T")[0],
      fin:   fin.toISOString().split("T")[0],
    };
  }

  // ── Déclenchement selon source ──────────────────────────────────────────────
  useEffect(() => {
    if (chargementSession) return;
    if (!session) { router.push("/eleve"); return; }
    if (session.source === "repetibox") {
      chargerRB(parseInt(session.id, 10));
    } else {
      chargerPB(session.id);
    }
  }, [chargementSession, session]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chargement Plan Box ─────────────────────────────────────────────────────
  async function chargerPB(eleveId: string) {
    const aujourd_hui = new Date().toISOString().split("T")[0];
    const { debut, fin } = getBornesSemaine();

    const [
      { data: eleveData },
      { data: progressionsData },
      { data: blocsWeek },
      { data: blocsExos },
      { data: podcastData },
      { data: notifsData },
    ] = await Promise.all([
      supabase.from("eleves").select("niveaux(nom), repetibox_eleve_id").eq("id", eleveId).single(),
      supabase.from("pb_progression").select("*, chapitres(*)").eq("eleve_id", eleveId).order("updated_at", { ascending: false }),
      supabase.from("plan_travail").select("*, chapitres(*)")
        .eq("eleve_id", eleveId)
        .gte("date_assignation", debut)
        .lte("date_assignation", fin)
        .order("created_at", { ascending: true }),
      supabase.from("plan_travail").select("id, type, statut, chapitre_id, chapitres(titre)")
        .eq("eleve_id", eleveId)
        .in("type", ["exercice", "calcul_mental", "eval"])
        .not("chapitre_id", "is", null),
      supabase.from("plan_travail").select("id, titre, contenu")
        .eq("eleve_id", eleveId)
        .eq("type", "ressource")
        .order("date_assignation", { ascending: false })
        .limit(10),
      supabase.from("notifications").select("*")
        .eq("eleve_id", eleveId)
        .eq("lu", false)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (eleveData) setNiveauNom((eleveData as any).niveaux?.nom ?? "");
    setProgressionsPB((progressionsData ?? []) as ProgressionComplete[]);
    setNotifications((notifsData ?? []) as Notification[]);

    supabase.from("eleves").update({ derniere_connexion: new Date().toISOString() }).eq("id", eleveId);

    const blocs = (blocsWeek ?? []) as PlanTravail[];
    setBlocsAujourdhui(blocs.filter((b) => b.periodicite === "semaine" || b.date_assignation === aujourd_hui));
    setBlocsSemaine(blocs.filter((b) => b.periodicite === "semaine" || b.date_assignation !== aujourd_hui));
    setProgressionExos(groupParChapitre((blocsExos ?? []) as unknown as PlanTravail[]));

    const podcasts = ((podcastData ?? []) as any[])
      .filter((b) => b.contenu?.qcm_id)
      .slice(0, 4)
      .map((b) => ({ id: b.id, titre: b.titre, qcm_id: b.contenu.qcm_id as string }));
    setPodcastsQcm(podcasts);

    setChargementDonnees(false);

    const rbId = (eleveData as any)?.repetibox_eleve_id;
    if (rbId) setRbEleveId(rbId);
    if (rbId) {
      fetch(`/api/revisions-repetibox-jour?rb_eleve_id=${rbId}&pb_eleve_id=${eleveId}`)
        .then((r) => r.json())
        .then((json) => setChapitresRB(json.chapitres ?? []))
        .catch(() => {});
    }

    // Problème du jour
    fetch("/api/daily-problem")
      .then((r) => r.json())
      .then((json) => {
        if (json.id && !json.noSchool) {
          setDailyProblem(json);
          // Priorité : statut serveur (validation enseignant) > localStorage
          if (json.serverAttempt?.solved) {
            setDailyProblemSolved(true);
          } else {
            const saved = localStorage.getItem(`dpd_${eleveId}_${new Date().toISOString().split("T")[0]}`);
            if (saved) { try { setDailyProblemSolved(JSON.parse(saved).solved === true); } catch {} }
          }
        }
      })
      .catch(() => {});
  }

  // ── Chargement Repetibox ────────────────────────────────────────────────────
  async function chargerRB(rbId: number) {
    supabase.from("eleves_planbox_meta").upsert(
      { repetibox_eleve_id: rbId, derniere_connexion: new Date().toISOString() },
      { onConflict: "repetibox_eleve_id" }
    );

    const res = await fetch(`/api/mon-plan-travail?rb=${rbId}`);
    const json = await res.json();
    const blocs: PlanTravail[] = json.blocs ?? [];

    const aujourd_hui = new Date().toISOString().split("T")[0];
    const { debut, fin } = getBornesSemaine();

    const blocsWeek = blocs.filter((b) => b.date_assignation >= debut && b.date_assignation <= fin);
    setBlocsAujourdhui(blocsWeek.filter((b) => b.periodicite === "semaine" || b.date_assignation === aujourd_hui));
    setBlocsSemaine(blocsWeek.filter((b) => b.periodicite === "semaine" || b.date_assignation !== aujourd_hui));

    const blocsExos = blocs.filter((b) => ["exercice", "calcul_mental", "eval"].includes(b.type) && b.chapitre_id);
    setProgressionExos(groupParChapitre(blocsExos));

    const podcastsRB = blocs
      .filter((b) => b.type === "ressource" && (b.contenu as any)?.qcm_id)
      .slice(0, 4)
      .map((b) => ({ id: b.id, titre: b.titre, qcm_id: (b.contenu as any).qcm_id as string }));
    setPodcastsQcm(podcastsRB);

    fetch(`/api/revisions-repetibox-jour?rb_eleve_id=${rbId}`)
      .then((r) => r.json())
      .then((json) => setChapitresRB(json.chapitres ?? []))
      .catch(() => {});

    // Problème du jour
    fetch("/api/daily-problem")
      .then((r) => r.json())
      .then((json) => {
        if (json.id && !json.noSchool) {
          setDailyProblem(json);
          // Priorité : statut serveur (validation enseignant) > localStorage
          if (json.serverAttempt?.solved) {
            setDailyProblemSolved(true);
          } else {
            const saved = localStorage.getItem(`dpd_${rbId}_${new Date().toISOString().split("T")[0]}`);
            if (saved) { try { setDailyProblemSolved(JSON.parse(saved).solved === true); } catch {} }
          }
        }
      })
      .catch(() => {});

    setChargementDonnees(false);
  }

  // ── Rafraîchissement silencieux des blocs (polling 30s) ─────────────────────
  // Signature minimale pour détecter un changement sans re-render inutile
  function sigBlocs(blocs: PlanTravail[]) {
    return blocs.map((b) => `${b.id}:${b.statut}:${JSON.stringify(b.contenu)}`).join("|");
  }

  const rafraichirBlocs = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;

    const aujourd_hui = new Date().toISOString().split("T")[0];
    const { debut, fin } = getBornesSemaine();

    try {
      let blocsWeek: PlanTravail[] = [];

      if (s.source === "repetibox") {
        const res = await fetch(`/api/mon-plan-travail?rb=${s.id}`);
        const json = await res.json();
        const blocs: PlanTravail[] = json.blocs ?? [];
        blocsWeek = blocs.filter((b) => b.date_assignation >= debut && b.date_assignation <= fin);
      } else {
        const { data } = await supabase
          .from("plan_travail")
          .select("*, chapitres(*)")
          .eq("eleve_id", s.id)
          .gte("date_assignation", debut)
          .lte("date_assignation", fin)
          .order("created_at", { ascending: true });
        blocsWeek = (data ?? []) as PlanTravail[];
      }

      const nouvsAujourd = blocsWeek.filter((b) => b.periodicite === "semaine" || b.date_assignation === aujourd_hui);
      const nouvsSemaine = blocsWeek.filter((b) => b.periodicite === "semaine" || b.date_assignation !== aujourd_hui);

      setBlocsAujourdhui((prev) => sigBlocs(nouvsAujourd) !== sigBlocs(prev) ? nouvsAujourd : prev);
      setBlocsSemaine((prev) => sigBlocs(nouvsSemaine) !== sigBlocs(prev) ? nouvsSemaine : prev);
    } catch { /* silencieux */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Démarre le polling dès que le chargement initial est terminé
  useEffect(() => {
    if (chargementDonnees) return;
    const interval = setInterval(rafraichirBlocs, 30_000);
    return () => clearInterval(interval);
  }, [chargementDonnees, rafraichirBlocs]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function marquerFait(id: string) {
    if (session?.source === "repetibox") {
      await fetch("/api/mon-plan-travail", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocId: id, statut: "fait", eleveRbId: parseInt(session.id, 10) }),
      });
    } else {
      await supabase.from("plan_travail").update({ statut: "fait" }).eq("id", id);
    }
    const marquer = (blocs: PlanTravail[]) =>
      blocs.map((b) => (b.id === id ? { ...b, statut: "fait" as const } : b));
    setBlocsAujourdhui(marquer);
    setBlocsSemaine(marquer);
  }

  async function toggleStatutPapier(id: string, statutActuel: string) {
    const nouveauStatut = statutActuel === "fait" ? "a_faire" : "fait";
    if (session?.source === "repetibox") {
      await fetch("/api/mon-plan-travail", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocId: id, statut: nouveauStatut, eleveRbId: parseInt(session.id, 10) }),
      });
    } else {
      await supabase.from("plan_travail").update({ statut: nouveauStatut }).eq("id", id);
    }
    const toggle = (blocs: PlanTravail[]) =>
      blocs.map((b) => (b.id === id ? { ...b, statut: nouveauStatut as PlanTravail["statut"] } : b));
    setBlocsAujourdhui(toggle);
    setBlocsSemaine(toggle);
  }

  async function marquerNotifLue(id: string) {
    await supabase.from("notifications").update({ lu: true }).eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  function toggleAccordeon(chapitreId: string) {
    setAccordeonsOuverts((prev) => {
      const next = new Set(prev);
      if (next.has(chapitreId)) next.delete(chapitreId);
      else next.add(chapitreId);
      return next;
    });
  }

  async function ouvrirRepetiboxRemediation() {
    const rbId = session?.source === "repetibox" ? parseInt(session.id, 10) : rbEleveId;
    if (!rbId) return;
    setChargementRbBtn(true);
    try {
      const params = new URLSearchParams({ rb_eleve_id: String(rbId) });
      if (session?.source !== "repetibox") params.set("pb_eleve_id", session!.id);
      const res = await fetch(`/api/revisions-repetibox-jour?${params}`);
      const json = await res.json();
      const url = json.chapitres?.[0]?.token_url;
      if (url) {
        const u = new URL(url);
        u.searchParams.delete("chapitre");
        window.location.href = u.toString();
      }
    } finally {
      setChargementRbBtn(false);
    }
  }

  async function deconnecter() {
    await effacerSession();
    router.push("/eleve");
  }

  // ── Écran de chargement ─────────────────────────────────────────────────────
  if (chargementSession || chargementDonnees) {
    return (
      <div className="eleve-page">
        <nav className="eleve-nav">
          <div className="eleve-nav-inner">
            <span className="eleve-nav-logo">Plan Box</span>
          </div>
        </nav>
        <main className="eleve-main">
          <div className="skeleton" style={{ height: 200, borderRadius: "2rem", marginBottom: 32 }} />
          <div className="eleve-bento">
            <div className="skeleton" style={{ height: 300, borderRadius: "1.75rem" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="skeleton" style={{ height: 120, borderRadius: "1.75rem" }} />
              <div className="skeleton" style={{ height: 120, borderRadius: "1.75rem" }} />
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Données calculées ───────────────────────────────────────────────────────
  const aujourd_hui_label = new Date().toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  });
  const nbFaitAujourd_hui = blocsAujourdhui.filter((b) => b.statut === "fait").length;
  const pctJour = blocsAujourdhui.length > 0
    ? Math.round((nbFaitAujourd_hui / blocsAujourdhui.length) * 100)
    : 0;

  // Map statut PB par chapitre_id
  const statutPBMap = new Map(progressionsPB.map((p) => [p.chapitre_id, p]));

  // Regrouper blocsAujourdhui par chapitre
  const groupeParChapId = new Map<string, { titre: string; matiere: string | null; blocs: PlanTravail[] }>();
  const blocsLibres: PlanTravail[] = [];
  for (const b of blocsAujourdhui) {
    if (!b.chapitre_id) { blocsLibres.push(b); continue; }
    if (!groupeParChapId.has(b.chapitre_id)) {
      groupeParChapId.set(b.chapitre_id, {
        titre:   (b as any).chapitres?.titre   ?? "Chapitre",
        matiere: (b as any).chapitres?.matiere ?? null,
        blocs:   [],
      });
    }
    groupeParChapId.get(b.chapitre_id)!.blocs.push(b);
  }

  const groupesChapitres = Array.from(groupeParChapId.entries()).sort(([idA], [idB]) => {
    const sA = statutPBMap.get(idA)?.statut ?? "en_cours";
    const sB = statutPBMap.get(idB)?.statut ?? "en_cours";
    if (sA === "remediation" && sB !== "remediation") return -1;
    if (sB === "remediation" && sA !== "remediation") return 1;
    return 0;
  });

  const evalDispoSet = new Set(progressionExos.filter((p) => p.evalDisponible).map((p) => p.chapitreId));

  const ORDRE: Record<string, number> = { remediation: 0, eval_dispo: 1, en_cours: 2, valide: 3 };
  const progressionsSorted = [...progressionsPB].sort((a, b) => {
    const clefA = a.statut === "en_cours" && evalDispoSet.has(a.chapitre_id) ? "eval_dispo" : a.statut;
    const clefB = b.statut === "en_cours" && evalDispoSet.has(b.chapitre_id) ? "eval_dispo" : b.statut;
    return (ORDRE[clefA] ?? 2) - (ORDRE[clefB] ?? 2);
  });

  const totalCartesRB = chapitresRB.reduce((s, c) => s + c.nb_cartes_dues, 0);
  const urlRB = (() => {
    const raw = chapitresRB[0]?.token_url;
    if (!raw) return "";
    try {
      const u = new URL(raw);
      u.searchParams.delete("chapitre");
      return u.toString();
    } catch {
      return raw;
    }
  })();

  const initiales = session?.prenom
    ? session.prenom.charAt(0).toUpperCase() + (session.nom?.charAt(0).toUpperCase() ?? "")
    : "?";

  // ── Rendu ───────────────────────────────────────────────────────────────────
  return (
    <div className="eleve-page">

      {/* ── Navigation fixe ── */}
      <nav className="eleve-nav">
        <div className="eleve-nav-inner">
          <span className="eleve-nav-logo">Plan Box</span>

          <div className="eleve-nav-links">
            {/* liens cachés sur mobile, visibles via bottom-nav */}
            <a href="#aujourd-hui" className="eleve-nav-link active">Aujourd'hui</a>
            <a href="#chapitres" className="eleve-nav-link">Mes chapitres</a>
            <a href="#a-venir" className="eleve-nav-link">À venir</a>
          </div>

          <div className="eleve-nav-actions">
            {niveauNom && (
              <span className="pb-pill" style={{ background: "rgba(0,80,212,0.1)", color: "var(--pb-primary)" }}>
                {niveauNom}
              </span>
            )}
            <div className="pb-avatar">{initiales}</div>
            <button
              onClick={deconnecter}
              style={{
                background: "none", border: "1px solid var(--pb-outline-variant)",
                borderRadius: 999, padding: "6px 14px", cursor: "pointer",
                fontSize: 13, fontWeight: 600, color: "var(--pb-on-surface-variant)",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                transition: "background 0.15s",
              }}
            >
              Déconnexion
            </button>
          </div>
        </div>
      </nav>

      <main className="eleve-main">

        {/* ── Notifications ── */}
        {notifications.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {notifications.map((n) => (
              <NotifBanniere key={n.id} notif={n} onDismiss={marquerNotifLue} />
            ))}
          </div>
        )}

        {/* ── Hero gradient ── */}
        <div className="eleve-hero">
          {/* décorations */}
          <div className="eleve-hero-deco" style={{
            width: 300, height: 300,
            background: "rgba(123,156,255,0.25)",
            top: -80, right: -60,
          }} />
          <div className="eleve-hero-deco" style={{
            width: 180, height: 180,
            background: "rgba(112,42,225,0.2)",
            bottom: -60, right: 200,
          }} />

          <div className="eleve-hero-grid">
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8, textTransform: "capitalize" }}>
                {aujourd_hui_label}
              </div>
              <h1 className="eleve-hero-title">
                Bonjour, {session?.prenom}
              </h1>
              <p className="eleve-hero-sub">
                {blocsAujourdhui.length > 0
                  ? `${nbFaitAujourd_hui} sur ${blocsAujourdhui.length} tâches complétées aujourd'hui`
                  : "Rien à faire aujourd'hui — bravo !"}
              </p>

              {/* Barre de progression jour */}
              {blocsAujourdhui.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
                    <span>Progression du jour</span>
                    <span>{pctJour}%</span>
                  </div>
                  <div className="pb-progress-track">
                    <div className="pb-progress-fill" style={{ width: `${pctJour}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* Carte stats hero — masquée sur portrait, visible à partir du paysage iPad */}
            <div className="eleve-hero-card eleve-hero-card-stats" style={{ position: "relative", zIndex: 1 }}>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Semaine en cours
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    {nbFaitAujourd_hui}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>faites aujourd'hui</div>
                </div>
                <div>
                  <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    {progressionsSorted.filter((p) => p.statut === "valide").length}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>chapitres validés</div>
                </div>
                {totalCartesRB > 0 && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      {totalCartesRB}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>cartes à réviser</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Bento grid ── */}
        <div className="eleve-bento">

          {/* ── Colonne gauche ── */}
          <div className="eleve-bento-sidebar" style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Flashcard Repetibox */}
            {(totalCartesRB > 0 || rbEleveId || session?.source === "repetibox") && (
              <div className="pb-flashcard-callout">
                <div style={{
                  position: "absolute", width: 200, height: 200, borderRadius: "50%",
                  background: "rgba(255,255,255,0.06)", top: -60, right: -60,
                  pointerEvents: "none",
                }} />
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.8, marginBottom: 12 }}>
                  Repetibox
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
                  {/* Icône carte style logo Repetibox */}
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: "rgba(255,255,255,0.18)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                      {/* Carte du dessous, inclinée */}
                      <rect x="4" y="6" width="16" height="21" rx="3"
                        fill="rgba(255,255,255,0.35)"
                        transform="rotate(-12 12 17)" />
                      {/* Carte principale */}
                      <rect x="9" y="3" width="16" height="21" rx="3"
                        fill="white"
                        transform="rotate(-5 17 14)" />
                      {/* Dot */}
                      <circle cx="17" cy="9" r="2"
                        fill="rgba(124,58,237,0.5)"
                        transform="rotate(-5 17 9)" />
                    </svg>
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    {totalCartesRB > 0 ? `${totalCartesRB} carte${totalCartesRB > 1 ? "s" : ""}` : "Mes cartes"}
                  </div>
                </div>
                <div style={{ fontSize: 14, opacity: 0.85 }}>
                  {totalCartesRB > 0
                    ? "Cartes à réviser aujourd'hui"
                    : "Révise tes flashcards"}
                </div>

                {urlRB ? (
                  <a
                    href={urlRB}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pb-flashcard-callout-btn"
                    style={{ display: "block", textAlign: "center", textDecoration: "none" }}
                  >
                    Commencer la révision →
                  </a>
                ) : (
                  <button
                    className="pb-flashcard-callout-btn"
                    onClick={ouvrirRepetiboxRemediation}
                    disabled={chargementRbBtn}
                    style={{ opacity: chargementRbBtn ? 0.6 : 1 }}
                  >
                    {chargementRbBtn ? "Chargement…" : "Réviser →"}
                  </button>
                )}
              </div>
            )}

            {/* Podcasts / QCM */}
            {podcastsQcm.length > 0 && (
              <div className="pb-card">
                <div style={{ marginBottom: 16 }}>
                  <p className="pb-section-title" style={{ fontSize: 16 }}>🎙️ Podiums podcasts</p>
                </div>
                {podcastsQcm.map((p) => (
                  <a
                    key={p.id}
                    href={`/eleve/qcm-classement/${p.qcm_id}`}
                    className="pb-podcast-item"
                    style={{ textDecoration: "none", color: "inherit", display: "flex" }}
                  >
                    <div className="pb-podcast-icon">
                      <span className="ms" style={{ fontSize: 20 }}>headphones</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 700, fontSize: 13, color: "var(--pb-on-surface)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {p.titre}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--pb-on-surface-variant)", marginTop: 2 }}>
                        Voir le classement →
                      </div>
                    </div>
                  </a>
                ))}
                <a
                  href="/eleve/qcm-classement/global"
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--pb-primary)", textDecoration: "none", marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--pb-outline-variant)" }}
                >
                  <span className="ms" style={{ fontSize: 16 }}>emoji_events</span>
                  Classement général →
                </a>
              </div>
            )}

            {/* Mes chapitres (Plan Box) */}
            {progressionsSorted.length > 0 && (
              <div id="chapitres" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <p className="pb-section-title">Mes chapitres</p>
                  <p className="pb-section-sub">{progressionsSorted.length} chapitre{progressionsSorted.length > 1 ? "s" : ""} en cours</p>
                </div>

                {progressionsSorted.map((prog) => {
                  const evalDispo      = evalDispoSet.has(prog.chapitre_id);
                  const estRemediation = prog.statut === "remediation";
                  const estValide      = prog.statut === "valide";
                  const progressionExo = progressionExos.find((p) => p.chapitreId === prog.chapitre_id);

                  let accentColor = "var(--pb-primary)";
                  let badgeText   = "En cours";
                  let badgeBg     = "rgba(0,80,212,0.1)";
                  let badgeColor  = "var(--pb-primary)";
                  let sousTitre   = progressionExo
                    ? `${progressionExo.faits}/${progressionExo.total} exercices faits`
                    : `${prog.pourcentage}% complété`;

                  if (estRemediation) {
                    accentColor = "var(--pb-tertiary-container)";
                    badgeText   = "Remédiation";
                    badgeBg     = "rgba(248,160,16,0.15)";
                    badgeColor  = "var(--pb-tertiary)";
                    sousTitre   = "Révise sur Repetibox · Éval demain";
                  } else if (estValide) {
                    accentColor = "#22c55e";
                    badgeText   = "Validé ✓";
                    badgeBg     = "#dcfce7";
                    badgeColor  = "#166534";
                    sousTitre   = `Validé le ${new Date(prog.updated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
                  } else if (evalDispo) {
                    accentColor = "var(--pb-tertiary-container)";
                    badgeText   = "Éval dispo";
                    badgeBg     = "rgba(248,160,16,0.15)";
                    badgeColor  = "var(--pb-tertiary)";
                    sousTitre   = "Lance l'évaluation !";
                  }

                  return (
                    <div
                      key={prog.id}
                      className="pb-card pb-card-accent"
                      style={{ borderLeftColor: accentColor, padding: "16px 20px" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--pb-on-surface)" }}>
                          {prog.chapitres?.titre ?? "Chapitre"}
                        </div>
                        <span className="pb-exo-tag" style={{ background: badgeBg, color: badgeColor, display: "flex", alignItems: "center", gap: 4 }}>
                          {evalDispo && <span className="ms" style={{ fontSize: 13, lineHeight: 1 }}>quiz</span>}
                          {estRemediation && <span className="ms" style={{ fontSize: 13, lineHeight: 1 }}>warning</span>}
                          {badgeText}
                        </span>
                      </div>

                      <div className="pb-progress-track light">
                        <div
                          className="pb-progress-fill light"
                          style={{
                            width: `${estValide ? 100 : prog.pourcentage}%`,
                            background: accentColor,
                          }}
                        />
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 10 }}>
                        <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>{sousTitre}</div>
                        {estRemediation && (rbEleveId || session?.source === "repetibox") && (
                          <button
                            onClick={ouvrirRepetiboxRemediation}
                            disabled={chargementRbBtn}
                            style={{
                              background: "var(--pb-secondary)", color: "white",
                              border: "none", borderRadius: 999,
                              padding: "4px 12px", fontSize: 11, fontWeight: 700,
                              cursor: "pointer", flexShrink: 0,
                              opacity: chargementRbBtn ? 0.6 : 1,
                              fontFamily: "'Plus Jakarta Sans', sans-serif",
                            }}
                          >
                            {chargementRbBtn ? "…" : "Repetibox →"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Colonne droite ── */}
          <div className="eleve-bento-main" style={{ display: "flex", flexDirection: "column", gap: 32 }}>

            {/* Section "Aujourd'hui" */}
            <section id="aujourd-hui">
              {(() => {
                const isPapier = (b: PlanTravail) => {
                  if (b.type === "ecriture" && (b.contenu as any)?.mode === "semaine") return false; // en ligne
                  return ["dictee", "fichier_maths", "lecon_copier", "ecriture"].includes(b.type);
                };
                const blocsPapier = blocsAujourdhui.filter(isPapier);
                const blocsEnLigneLibres = blocsLibres.filter((b) => !isPapier(b));
                const groupesEnLigne = groupesChapitres
                  .map(([id, info]) => [id, { ...info, blocs: info.blocs.filter((b) => !isPapier(b)) }] as [string, { titre: string; matiere: string | null; blocs: PlanTravail[] }])
                  .filter(([, info]) => info.blocs.length > 0);
                const totalEnLigne = groupesEnLigne.reduce((s, [, { blocs }]) => s + blocs.length, 0) + blocsEnLigneLibres.length + (chapitresRB.length > 0 && urlRB ? 1 : 0);
                return (
              <>
              {/* ─ Header ─ */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                <div>
                  <p className="pb-section-title">À faire aujourd'hui</p>
                  <p className="pb-section-sub">
                    {blocsAujourdhui.length === 0
                      ? "Rien à faire — bravo !"
                      : `${nbFaitAujourd_hui}/${blocsAujourdhui.length} tâches complétées`}
                  </p>
                </div>
                {blocsAujourdhui.length > 0 && (
                  <span style={{
                    marginLeft: "auto",
                    background: nbFaitAujourd_hui === blocsAujourdhui.length ? "#dcfce7" : "rgba(0,80,212,0.1)",
                    color: nbFaitAujourd_hui === blocsAujourdhui.length ? "#166534" : "var(--pb-primary)",
                    fontWeight: 800, fontSize: 13, padding: "4px 14px", borderRadius: 999,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}>
                    {nbFaitAujourd_hui === blocsAujourdhui.length ? "✓ Tout fait !" : `${blocsAujourdhui.length - nbFaitAujourd_hui} restant${blocsAujourdhui.length - nbFaitAujourd_hui > 1 ? "s" : ""}`}
                  </span>
                )}
              </div>

              {blocsAujourdhui.length === 0 && chapitresRB.length === 0 ? (
                <div className="pb-card" style={{ textAlign: "center", padding: "48px 24px" }}>
                  <span className="ms" style={{ fontSize: 44, color: "var(--pb-primary)", marginBottom: 12, display: "block" }}>celebration</span>
                  <p style={{ fontWeight: 700, fontSize: 16, color: "var(--pb-on-surface)", marginBottom: 4 }}>Journée libre !</p>
                  <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)" }}>Rien à faire aujourd'hui. Profite bien !</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

                  {/* ══ À faire sur le cahier ══ */}
                  {blocsPapier.length > 0 && (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                        <span className="ms" style={{ fontSize: 18, color: "var(--pb-on-surface-variant)" }}>edit</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          À faire sur le cahier
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {blocsPapier.map((b) => {
                          const estFait = b.statut === "fait";
                          const page = (b.contenu as any)?.numero_page;
                          const sousTitre = b.type === "fichier_maths"
                            ? `Mathématiques${page ? ` • Page ${page}` : ""}`
                            : b.type === "lecon_copier"
                            ? "À copier sur ton cahier"
                            : b.type === "ecriture"
                            ? "Écriture créative • À écrire sur ton cahier"
                            : "Dictée • À écrire sur ton cahier";
                          return (
                            <div
                              key={b.id}
                              className="pb-card"
                              style={{
                                display: "flex", alignItems: "center", gap: 16,
                                padding: "18px 20px",
                                opacity: estFait ? 0.65 : 1,
                              }}
                            >
                              {/* Cercle checkbox — toggle fait / a_faire */}
                              <button
                                onClick={() => toggleStatutPapier(b.id, b.statut)}
                                title={estFait ? "Annuler la validation" : "Marquer comme fait"}
                                style={{
                                  width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                                  border: `2px solid ${estFait ? "#5B5FC7" : "#C7C8E2"}`,
                                  background: estFait ? "rgba(91,95,199,0.1)" : "white",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  cursor: "pointer",
                                  transition: "all 0.2s",
                                }}
                              >
                                <span className="ms" style={{
                                  fontSize: 20, lineHeight: 1,
                                  color: estFait ? "#5B5FC7" : "#C7C8E2",
                                }}>check</span>
                              </button>

                              {/* Texte */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  fontSize: 15, fontWeight: 700,
                                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                                  color: "var(--pb-on-surface)",
                                  textDecoration: estFait ? "line-through" : "none",
                                  marginBottom: 3,
                                }}>
                                  {b.type === "dictee" ? `Dictée — ${b.titre}` : b.type === "lecon_copier" ? `Leçon — ${b.titre}` : b.type === "ecriture" ? `Écriture — ${b.titre.replace("Écriture — ", "")}` : b.titre}
                                </div>
                                <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>
                                  {sousTitre}
                                </div>
                              </div>

                              {/* Bouton accès activité — dictée, leçon à copier et écriture */}
                              {(b.type === "dictee" || b.type === "lecon_copier" || b.type === "ecriture") && b.contenu && !estFait && (
                                <Link
                                  href={`/eleve/activite/${b.id}`}
                                  className="pb-btn primary"
                                  style={{ padding: "8px 20px", fontSize: 13, borderRadius: 999, flexShrink: 0, whiteSpace: "nowrap" }}
                                >
                                  Voir →
                                </Link>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ══ À faire en ligne ══ */}
                  {(groupesEnLigne.length > 0 || blocsEnLigneLibres.length > 0 || (chapitresRB.length > 0 && urlRB) || dailyProblem) && (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                        <span className="ms" style={{ fontSize: 18, color: "var(--pb-on-surface-variant)" }}>computer</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          À faire en ligne
                        </span>
                        {totalEnLigne > 0 && (
                          <span style={{ background: "rgba(0,80,212,0.1)", color: "var(--pb-primary)", fontWeight: 700, fontSize: 11, padding: "2px 8px", borderRadius: 999, marginLeft: 4 }}>
                            {totalEnLigne}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                  {/* Grille de cartes pour les blocs en ligne */}
                  {(() => {
                    const CAT: Record<string, { label: string; color: string; bg: string }> = {
                      exercice:      { label: "Exercice",        color: "#2563EB", bg: "rgba(37,99,235,0.08)" },
                      calcul_mental: { label: "Calcul mental",   color: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
                      mots:          { label: "Vocabulaire",     color: "#D97706", bg: "rgba(217,119,6,0.08)" },
                      eval:          { label: "Évaluation",      color: "#DC2626", bg: "rgba(220,38,38,0.08)" },
                      ressource:     { label: "Ressource",       color: "#0891B2", bg: "rgba(8,145,178,0.08)" },
                      libre:         { label: "Activité libre",  color: "#6B7280", bg: "rgba(107,114,128,0.08)" },
                      repetibox:     { label: "Repetibox",       color: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
                      media:         { label: "Vidéo",           color: "#059669", bg: "rgba(5,150,105,0.08)" },
                      ecriture:       { label: "Écriture",          color: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
                      texte_a_trous:  { label: "Texte à trous",    color: "#0E7490", bg: "rgba(14,116,144,0.08)" },
                      analyse_phrase: { label: "Analyse de phrase", color: "#6D28D9", bg: "rgba(109,40,217,0.08)" },
                      classement: { label: "Classement", color: "#0369A1", bg: "rgba(3,105,161,0.08)" },
                      lecture: { label: "Lecture", color: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
                    };
                    const DESC: Record<string, string> = {
                      exercice:      "Entraîne-toi sur les notions du cours.",
                      calcul_mental: "Entraîne ta rapidité de calcul.",
                      mots:          "Apprends de nouveaux termes essentiels.",
                      eval:          "Évalue tes connaissances.",
                      ressource:     "Consulte la ressource en ligne.",
                      libre:         "Activité libre à réaliser.",
                      repetibox:     "Révise tes flashcards.",
                      media:         "Regarde la vidéo.",
                      ecriture:       "Atelier d'écriture de la semaine.",
                      texte_a_trous:  "Complète les mots manquants.",
                      analyse_phrase: "Identifie les fonctions grammaticales.",
                      classement: "Classe les éléments dans les bonnes catégories.",
                      lecture: "Lis le texte puis réponds aux questions.",
                    };
                    const TYPES_INTERACTIFS = ["exercice", "calcul_mental", "mots", "eval", "ressource", "media", "texte_a_trous", "analyse_phrase", "classement", "lecture"];
                    const tousBlocs = [
                      ...groupesEnLigne.flatMap(([, { blocs }]) => blocs),
                      ...blocsEnLigneLibres,
                    ];
                    if (tousBlocs.length === 0) return null;
                    return (
                      <div className="pb-activite-grid">
                        {tousBlocs.map((b, idx) => {
                          const estFait = b.statut === "fait";
                          const cat = CAT[b.type] ?? { label: b.type, color: "#6B7280", bg: "rgba(107,114,128,0.08)" };
                          const ms = TYPE_BLOC_MS[b.type] ?? { icon: "task_alt", color: "#6B7280", bg: "rgba(107,114,128,0.1)" };
                          const chapNom = (b as any).chapitres?.titre;
                          const desc = chapNom ?? DESC[b.type] ?? "";
                          const isEcritureSemaine = b.type === "ecriture" && (b.contenu as any)?.mode === "semaine";
                          const peutCommencer = (TYPES_INTERACTIFS.includes(b.type) || isEcritureSemaine) && b.contenu;
                          return (
                            <div
                              key={b.id}
                              className="pb-card"
                              style={{
                                padding: "20px 22px",
                                borderLeft: `4px solid ${cat.color}`,
                                display: "flex",
                                flexDirection: "column",
                                opacity: estFait ? 0.65 : 1,
                                minHeight: 160,
                                position: "relative",
                                overflow: "hidden",
                              }}
                            >
                              {/* Cercle déco */}
                              <div style={{
                                position: "absolute", bottom: -30, right: -30,
                                width: 100, height: 100, borderRadius: "50%",
                                background: cat.bg, pointerEvents: "none",
                              }} />

                              {/* Header : badge + icône */}
                              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                                    <span style={{
                                      fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                                      textTransform: "uppercase", padding: "4px 12px",
                                      borderRadius: 999, background: cat.bg, color: cat.color,
                                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                                    }}>
                                      {cat.label}
                                    </span>
                                  </div>
                                  <div style={{
                                    fontSize: 17, fontWeight: 800,
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                    color: "var(--pb-on-surface)", marginBottom: 8,
                                    textDecoration: estFait ? "line-through" : "none",
                                  }}>
                                    {b.titre}
                                  </div>
                                  <div style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", lineHeight: 1.5 }}>
                                    {desc}
                                  </div>
                                </div>
                                <span className="ms" style={{ fontSize: 22, color: `${cat.color}66`, flexShrink: 0, marginLeft: 10 }}>
                                  {ms.icon}
                                </span>
                              </div>

                              {/* Action */}
                              {!estFait && (
                                peutCommencer ? (
                                  <div style={{ marginTop: "auto", paddingTop: 16 }}>
                                    <Link
                                      href={`/eleve/activite/${b.id}`}
                                      className="pb-btn primary"
                                      style={{ padding: "10px 20px", fontSize: 14, borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0 }}
                                    >
                                      Commencer →
                                    </Link>
                                  </div>
                                ) : (
                                  <div style={{ marginTop: "auto", paddingTop: 16 }}>
                                    <button
                                      onClick={() => marquerFait(b.id)}
                                      className="pb-btn primary"
                                      style={{ padding: "10px 20px", fontSize: 14, borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0 }}
                                    >
                                      ✓ Marquer fait
                                    </button>
                                  </div>
                                )
                              )}
                            </div>
                          );
                        })}

                        {/* Carte Problème du jour */}
                        {dailyProblem && (
                          <div
                            className="pb-card"
                            style={{
                              padding: "20px 22px",
                              borderLeft: "4px solid #F59E0B",
                              display: "flex",
                              flexDirection: "column",
                              opacity: dailyProblemSolved ? 0.65 : 1,
                              minHeight: 160,
                              position: "relative",
                              overflow: "hidden",
                            }}
                          >
                            <div style={{
                              position: "absolute", bottom: -30, right: -30,
                              width: 100, height: 100, borderRadius: "50%",
                              background: "rgba(245,158,11,0.08)", pointerEvents: "none",
                            }} />
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                                    textTransform: "uppercase", padding: "4px 12px",
                                    borderRadius: 999, background: "rgba(245,158,11,0.12)", color: "#D97706",
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                  }}>
                                    Problème du jour
                                  </span>
                                </div>
                                <div style={{
                                  fontSize: 17, fontWeight: 800,
                                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                                  color: "var(--pb-on-surface)", marginBottom: 8,
                                  textDecoration: dailyProblemSolved ? "line-through" : "none",
                                }}>
                                  {dailyProblem.enonce.length > 50 ? dailyProblem.enonce.substring(0, 50) + "…" : dailyProblem.enonce}
                                </div>
                                <div style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", lineHeight: 1.5 }}>
                                  Période {dailyProblem.periode?.replace("P", "")} · Semaine {dailyProblem.semaine?.replace("S", "")} · {dailyProblem.categorie}
                                </div>
                              </div>
                              <span className="ms" style={{ fontSize: 22, color: "rgba(245,158,11,0.5)", flexShrink: 0, marginLeft: 10 }}>
                                calculate
                              </span>
                            </div>
                            {!dailyProblemSolved ? (
                              <div style={{ marginTop: "auto", paddingTop: 16 }}>
                                <Link
                                  href="/eleve/probleme-du-jour"
                                  className="pb-btn primary"
                                  style={{ padding: "10px 20px", fontSize: 14, borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0, background: "#F59E0B", borderColor: "#F59E0B" }}
                                >
                                  Commencer →
                                </Link>
                              </div>
                            ) : (
                              <div style={{ marginTop: "auto", paddingTop: 16, fontSize: 14, fontWeight: 700, color: "#16A34A" }}>
                                ✓ Résolu
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Bloc Repetibox (dans en ligne) */}
                  {chapitresRB.length > 0 && urlRB && (
                    <a
                      href={urlRB}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pb-card pb-card-accent-secondary"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        textDecoration: "none", color: "inherit", gap: 12,
                        padding: "20px 24px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 12,
                          background: "rgba(112,42,225,0.1)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          <svg width="26" height="26" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="4" y="6" width="16" height="21" rx="3"
                              fill="rgba(124,58,237,0.25)"
                              transform="rotate(-12 12 17)" />
                            <rect x="9" y="3" width="16" height="21" rx="3"
                              fill="#7C3AED"
                              transform="rotate(-5 17 14)" />
                            <circle cx="17" cy="9" r="2"
                              fill="rgba(255,255,255,0.7)"
                              transform="rotate(-5 17 9)" />
                          </svg>
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                            Mes cartes à réviser aujourd'hui
                          </div>
                          <div style={{ fontSize: 13, color: "var(--pb-secondary)", marginTop: 2 }}>
                            {totalCartesRB} carte{totalCartesRB > 1 ? "s" : ""} en attente
                          </div>
                        </div>
                      </div>
                      <span className="pb-btn secondary-fill" style={{ fontSize: 13, padding: "8px 20px", borderRadius: 999, flexShrink: 0 }}>
                        Réviser →
                      </span>
                    </a>
                  )}

                      </div>{/* fin flex col "en ligne" */}
                    </div>
                  )}{/* fin section en ligne */}

                </div>
              )}
              </>
              );
              })()}
            </section>


          </div>
        </div>
      </main>

      {/* ── Bottom nav mobile ── */}
      <nav className="pb-bottom-nav">
        <a href="#aujourd-hui" className="pb-bottom-nav-item active">
          <span className="ms" style={{ fontSize: 22 }}>today</span>
          Aujourd'hui
        </a>
        <a href="#chapitres" className="pb-bottom-nav-item">
          <span className="ms" style={{ fontSize: 22 }}>menu_book</span>
          Chapitres
        </a>
        <a href="#chapitres" className="pb-bottom-nav-item">
          <span className="ms" style={{ fontSize: 22 }}>bar_chart</span>
          Progression
        </a>
        <button
          onClick={deconnecter}
          className="pb-bottom-nav-item"
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          <span className="ms" style={{ fontSize: 22 }}>logout</span>
          Quitter
        </button>
      </nav>

    </div>
  );
}
