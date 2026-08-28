"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useEleveSession } from "@/hooks/useEleveSession";
import { PlanTravail, Progression, Chapitre, Notification, TYPE_BLOC_CONFIG } from "@/types";
import { CEINTURES } from "@/lib/ceintures";
import CeinturesSemaineModal, { DomaineChoisissable } from "@/components/CeinturesSemaineModal";
import ActivityCard from "@/components/ActivityCard";
import NotifCard from "@/components/NotifCard";
import Avatar from "@/components/Avatar";

// ─── Types locaux ────────────────────────────────────────────────────────────

type ProgressionComplete = Progression & { chapitres: Chapitre };

interface ProgressionChapitre {
  chapitreId: string;
  titre: string;
  total: number;
  faits: number;
  evalDisponible: boolean;
}

interface ChapitreAssigne {
  id: string;
  titre: string;
  matiere: string;
  sous_matiere: string | null;
  nbExercices: number;
  nbValides: number;
  pourcentage: number;
  tousValides: boolean;
  exerciceEnCoursId: string | null;
  exerciceEnCoursOrdre: number | null;
  prochainExerciceTitre: string | null;
  prochainExerciceType: string | null;
  prochainExerciceMinutes: number | null;
  derniereActivite: string | null;
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
  mots:          { icon: "spellcheck",   color: "#D97706", bg: "rgba(217,119,6,0.1)" },
  dictee:        { icon: "headphones",   color: "#D97706", bg: "rgba(217,119,6,0.1)" },
  media:         { icon: "play_circle",  color: "#059669", bg: "rgba(5,150,105,0.1)" },
  eval:          { icon: "quiz",         color: "#DC2626", bg: "rgba(220,38,38,0.1)" },
  libre:         { icon: "draw",         color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
  ressource:     { icon: "open_in_new",  color: "#0891B2", bg: "rgba(8,145,178,0.1)" },
  repetibox:     { icon: "style",         color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
  fichier_maths: { icon: "square_foot",  color: "#0F766E", bg: "rgba(15,118,110,0.1)" },
  probleme_maths:{ icon: "functions",    color: "#0D9488", bg: "rgba(13,148,136,0.1)" },
  ecriture:      { icon: "edit_note",    color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
  ceinture_multiplication: { icon: "military_tech", color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
  comparaison: { icon: "compare_arrows", color: "#0D9488", bg: "rgba(13,148,136,0.1)" },
  rangement: { icon: "sort", color: "#B45309", bg: "rgba(180,83,9,0.1)" },
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

/**
 * Filtre les blocs conditionnels (ex: révision mots jeudi si score mardi < 80%)
 * Un bloc avec `contenu.condition` n'est affiché que si la condition n'est PAS remplie
 * (= le score source est < seuil, donc l'élève a besoin de réviser)
 */
function filtrerBlocsConditionnels(blocs: PlanTravail[]): PlanTravail[] {
  // Collecter les scores des blocs déjà terminés
  const scoreParTitre = new Map<string, number>(); // titre → pourcentage
  for (const b of blocs) {
    if (b.statut === "fait" && b.contenu) {
      const c = b.contenu as Record<string, unknown>;
      const scoreEleve = c.score_eleve as number | undefined;
      const scoreTotal = c.score_total as number | undefined;
      if (scoreEleve != null && scoreTotal != null && scoreTotal > 0) {
        const pct = Math.round((scoreEleve / scoreTotal) * 100);
        // Garder le score le plus récent par titre
        scoreParTitre.set(b.titre, pct);
      }
    }
  }

  return blocs.filter((b) => {
    const condition = (b.contenu as Record<string, unknown>)?.condition as
      { source_titre: string; source_jour: string; seuil_pct: number } | undefined;
    if (!condition) return true; // pas de condition → toujours affiché

    const scoreMardi = scoreParTitre.get(condition.source_titre);
    if (scoreMardi == null) return true; // pas encore fait → afficher (l'élève doit pouvoir le faire)
    return scoreMardi < condition.seuil_pct; // afficher seulement si score insuffisant
  });
}

/**
 * Dictées et révisions de mots : ne doivent apparaître QUE le jour prévu,
 * même si l'élève ne les a pas faites. Donc on exclut celles dont la
 * date_assignation ≠ aujourd'hui (passée comme future).
 */
/**
 * Répartit les blocs chargés en trois paniers : en retard (jour passé et non
 * fait), aujourd'hui, et le reste de la semaine. Les blocs en périodicité
 * « semaine » sont toujours du jour ; les ressources non faites des semaines
 * précédentes gardent leur traitement « reporté » et ne sont pas en retard.
 */
function repartirBlocs(blocs: PlanTravail[], aujourd_hui: string, debut: string) {
  const estReporte = (b: PlanTravail) =>
    b.type === "ressource" && b.statut !== "fait" && b.date_assignation < debut;
  const estEnRetard = (b: PlanTravail) =>
    b.periodicite !== "semaine" &&
    b.statut !== "fait" &&
    b.date_assignation < aujourd_hui &&
    !estReporte(b);

  return {
    enRetard: blocs.filter(estEnRetard),
    aujourdhui: blocs.filter(
      (b) => !estEnRetard(b) &&
        (b.periodicite === "semaine" || b.date_assignation === aujourd_hui || estReporte(b)),
    ),
    semaine: blocs.filter(
      (b) => !estEnRetard(b) && b.periodicite !== "semaine" &&
        b.date_assignation !== aujourd_hui && !estReporte(b) &&
        // la fenêtre remonte 7 jours en arrière pour le rattrapage : ce qui
        // précède le lundi n'appartient pas au « reste de la semaine »
        b.date_assignation >= debut,
    ),
  };
}

function filtrerDicteesMotsJourStrict(blocs: PlanTravail[], aujourd_hui: string): PlanTravail[] {
  return blocs.filter((b) => {
    if (b.type !== "dictee" && b.type !== "mots") return true;
    return b.date_assignation === aujourd_hui;
  });
}

// ─── Cache stale-while-revalidate (sessionStorage) ────────────────────────────
// Bump la version à chaque changement de shape pour invalider les caches obsolètes.
const CACHE_VERSION = "v3";
const cacheKey = (id: string) => `pb_dash_${CACHE_VERSION}_${id}`;

interface DashCache {
  savedAt: number;
  niveauNom: string;
  progressionsPB: ProgressionComplete[];
  progressionExos: ProgressionChapitre[];
  blocsAujourdhui: PlanTravail[];
  blocsSemaine: PlanTravail[];
  blocsEnRetard: PlanTravail[];
  notifications: Notification[];
  chapitresRB: Array<{ chapitre_id: number; chapitre_nom: string; nb_cartes_dues: number; token_url: string }>;
  podcastsQcm: Array<{ id: string; titre: string; qcm_id: string }>;
  podcastsSemaine: Array<{ id: string; titre: string; qcm_id: string; fait: boolean; reporte: boolean }>;
  rbEleveId: number | null;
  ceintureActive: boolean;
  ceintureInfo: { index: number; nom: string; couleur: string } | null;
  dailyProblem: { id: string; enonce: string; categorie: string; periode: string; semaine: string; niveau: string } | null;
  dailyProblemSolved: boolean;
  chapitresAssignes: ChapitreAssigne[];
  serieParcours: number;
  calculJour: { id: string; operation: string; nombre1: number; nombre2: number; deja_fait?: boolean } | null;
}

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 h : au-delà, on considère obsolète

function chargerCache(id: string): DashCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashCache;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > CACHE_TTL_MS) {
      sessionStorage.removeItem(cacheKey(id));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function sauverCache(id: string, snap: Omit<DashCache, "savedAt">) {
  if (typeof window === "undefined") return;
  try {
    const payload: DashCache = { ...snap, savedAt: Date.now() };
    sessionStorage.setItem(cacheKey(id), JSON.stringify(payload));
  } catch {
    /* quota plein ou JSON cyclique → ignorer silencieusement */
  }
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
  const [blocsEnRetard, setBlocsEnRetard]           = useState<PlanTravail[]>([]);
  const [notifications, setNotifications]           = useState<Notification[]>([]);
  const [chapitresRB, setChapitresRB]               = useState<Array<{ chapitre_id: number; chapitre_nom: string; nb_cartes_dues: number; token_url: string }>>([]);
  const [podcastsQcm, setPodcastsQcm]               = useState<Array<{ id: string; titre: string; qcm_id: string }>>([]);
  const [podcastsSemaine, setPodcastsSemaine]         = useState<Array<{ id: string; titre: string; qcm_id: string; fait: boolean; reporte: boolean }>>([]);
  const [chargementDonnees, setChargementDonnees]   = useState(true);
  const [accordeonsOuverts, setAccordeonsOuverts]   = useState<Set<string>>(new Set());
  const [rbEleveId, setRbEleveId]                   = useState<number | null>(null);
  const [chargementRbBtn, setChargementRbBtn]        = useState(false);
  const [ceintureActive, setCeintureActive]           = useState(false);
  const [ceintureInfo, setCeintureInfo]               = useState<{ index: number; nom: string; couleur: string } | null>(null);
  const [dailyProblem, setDailyProblem]               = useState<{ id: string; enonce: string; categorie: string; periode: string; semaine: string; niveau: string } | null>(null);
  const [dailyProblemSolved, setDailyProblemSolved]    = useState(false);
  const [chapitresAssignes, setChapitresAssignes]      = useState<ChapitreAssigne[]>([]);
  const [serieParcours, setSerieParcours]              = useState<number>(0);
  const [calculJour, setCalculJour]                     = useState<{ id: string; operation: string; nombre1: number; nombre2: number; deja_fait?: boolean } | null>(null);
  const [ceinturesFrancais, setCeinturesFrancais] = useState<{
    couleurCourante: { nom: string; hex: string; hexFond: string } | null;
    domaines: Array<{ code: string; slug?: string; nom: string; icone?: string; commence?: boolean; couleurCourante: { nom?: string; hex: string; hexFond?: string } | null }>;
  } | null>(null);
  // Les deux domaines de ceintures choisis pour la semaine en cours.
  const [choixSemaine, setChoixSemaine] = useState<{
    domaines: string[];
    disponibles: DomaineChoisissable[];
    doitChoisir: boolean;
  } | null>(null);
  const [modalCeintures, setModalCeintures] = useState(false);
  // L'onboarding avatar (élèves Repetibox) redirige hors du tableau de bord :
  // tant qu'on ne sait pas s'il va se déclencher, aucune autre fenêtre ne s'ouvre.
  const [avatarPret, setAvatarPret] = useState(false);
  const [bibliothequePeutChoisir, setBibliothequePeutChoisir] = useState(false);
  const [bibliothequeEnCours, setBibliothequeEnCours]         = useState<{ chapitre_id: string; titre: string; auteur: string | null; couverture_url: string | null; pourcentage: number } | null>(null);

  // Ref pour accéder à session dans l'intervalle sans le capturer dans la closure
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);
  const abortRef = useRef<AbortController | null>(null);

  // ── Session serveur morte ───────────────────────────────────────────────────
  // Cas vécu (Lilou B) : la session Supabase est révoquée depuis un autre
  // appareil/app, mais le client se croit toujours connecté (cache). Les API
  // authentifiées répondent alors 401 et les ceintures/calcul/problème
  // disparaissent sans message, indéfiniment. Ici : on tente un refresh du
  // jeton ; s'il échoue, on déconnecte et on renvoie à l'écran de connexion.
  const reparationSessionRef = useRef<Promise<boolean> | null>(null);
  function reparerSession(): Promise<boolean> {
    if (!reparationSessionRef.current) {
      reparationSessionRef.current = (async () => {
        try {
          const { data, error } = await supabase.auth.refreshSession();
          if (!error && data.session) {
            reparationSessionRef.current = null; // refresh OK → futurs 401 re-tenteront
            return true;
          }
        } catch { /* refresh impossible → reconnexion */ }
        await effacerSession();
        router.replace("/eleve");
        return false;
      })();
    }
    return reparationSessionRef.current;
  }

  // ── Bornes semaine ──────────────────────────────────────────────────────────
  function getBornesSemaine() {
    const aujourd_hui = new Date();
    const jourSemaine = aujourd_hui.getDay();
    const lundi = new Date(aujourd_hui);
    lundi.setDate(aujourd_hui.getDate() - ((jourSemaine + 6) % 7));
    const fin = new Date(lundi);
    fin.setDate(lundi.getDate() + 6);
    // On remonte une semaine avant le lundi : un travail non fait la semaine
    // précédente reste « en retard » et ne disparaît pas au changement de semaine.
    const debutRetard = new Date(lundi);
    debutRetard.setDate(lundi.getDate() - 7);
    return {
      debut:       lundi.toISOString().split("T")[0],
      fin:         fin.toISOString().split("T")[0],
      debutRetard: debutRetard.toISOString().split("T")[0],
    };
  }

  // ── Déclenchement selon source ──────────────────────────────────────────────
  useEffect(() => {
    if (chargementSession) return;
    if (!session) { router.push("/eleve"); return; }

    // 1. HYDRATATION INSTANTANÉE depuis le cache (session précédente).
    // Si cache présent → on affiche le dashboard en < 50 ms, puis on rafraîchit
    // en tâche de fond. Sinon → skeleton loader classique.
    const cache = chargerCache(session.id);
    if (cache) {
      setNiveauNom(cache.niveauNom);
      setProgressionsPB(cache.progressionsPB);
      setProgressionExos(cache.progressionExos);
      setBlocsAujourdhui(cache.blocsAujourdhui);
      setBlocsSemaine(cache.blocsSemaine);
      setBlocsEnRetard(cache.blocsEnRetard ?? []);
      setNotifications(cache.notifications);
      setChapitresRB(cache.chapitresRB);
      setPodcastsQcm(cache.podcastsQcm);
      setPodcastsSemaine(cache.podcastsSemaine);
      setRbEleveId(cache.rbEleveId);
      setCeintureActive(cache.ceintureActive);
      setCeintureInfo(cache.ceintureInfo);
      setDailyProblem(cache.dailyProblem);
      setDailyProblemSolved(cache.dailyProblemSolved);
      setChapitresAssignes(cache.chapitresAssignes);
      setSerieParcours(cache.serieParcours ?? 0);
      setCalculJour(cache.calculJour);
      setChargementDonnees(false); // UI visible immédiatement
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // 2. RAFRAÎCHISSEMENT RÉSEAU (remplace le cache en arrière-plan).
    if (session.source === "repetibox") {
      chargerRB(parseInt(session.id, 10), ctrl.signal);
    } else {
      chargerPB(session.id, ctrl.signal);
    }

    // 3. FILET DE SÉCURITÉ : si aucun cache ET fetch > 8 s, on débloque
    // l'UI quoi qu'il arrive pour éviter le loader infini (« tourne en boucle »).
    const timeoutFilet = setTimeout(() => {
      if (!ctrl.signal.aborted) setChargementDonnees(false);
    }, 8000);

    return () => {
      ctrl.abort();
      clearTimeout(timeoutFilet);
    };
  }, [chargementSession, session]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Onboarding avatar obligatoire (élèves Repetibox) ────────────────────────
  // Vérification FRAÎCHE (jamais le cache) : si l'élève Repetibox n'a pas encore
  // créé son avatar, on le redirige vers le customiseur Repetibox (via SSO) et on
  // bloque l'accès au dashboard tant que ce n'est pas fait. L'avatar est stocké
  // côté Repetibox (table eleve) — Plan Box ne fait que le lire.
  useEffect(() => {
    if (chargementSession || !session) return;
    // Les élèves PlanBox n'ont pas d'onboarding avatar : rien ne les retient.
    if (session.source !== "repetibox") { setAvatarPret(true); return; }
    let annule = false;
    (async () => {
      try {
        const { data: { user } } = await createClient().auth.getUser();
        if (!user || annule) return;
        const res = await fetch(`/api/repetibox-eleve-by-auth?auth_id=${encodeURIComponent(user.id)}`);
        if (!res.ok || annule) return;
        const json = await res.json();
        if (!json.avatar_bigheads && !annule) {
          window.location.href = "/api/sso/redirect-repetibox?dest=" + encodeURIComponent("/eleve/avatar");
          return; // redirection en cours : on laisse `avatarPret` à false
        }
        if (!annule) setAvatarPret(true);
      } catch {
        /* Erreur réseau : on ne bloque pas (fail-open) pour ne pas piéger l'élève. */
        if (!annule) setAvatarPret(true);
      }
    })();
    return () => { annule = true; };
  }, [chargementSession, session]);

  // ── Statut bibliothèque (livre en cours / peut choisir) ─────────────────────
  useEffect(() => {
    if (!session) return;
    const ctrl = new AbortController();
    const qs = session.source === "planbox"
      ? `eleve_id=${session.id}`
      : `rb_id=${session.id}`;
    fetch(`/api/bibliotheque/statut?${qs}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((json) => {
        if (ctrl.signal.aborted) return;
        setBibliothequePeutChoisir(json.peut_choisir ?? false);
        setBibliothequeEnCours(json.livre_en_cours ?? null);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [session]);

  // ── Choix hebdomadaire des domaines de ceintures ───────────────────────────
  useEffect(() => {
    if (!session) return;
    const ctrl = new AbortController();
    const qs = session.source === "planbox"
      ? `eleve_id=${session.id}`
      : `rb_eleve_id=${session.id}`;
    fetch(`/api/ceintures/choix-semaine?${qs}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((json) => {
        if (ctrl.signal.aborted || json?.erreur) return;
        setChoixSemaine({
          domaines: json.domaines ?? [],
          disponibles: json.disponibles ?? [],
          doitChoisir: !!json.doitChoisir,
        });
        // L'ouverture est décidée plus bas : elle attend l'onboarding avatar.
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [session]);

  // Première connexion de la semaine → fenêtre de choix, mais jamais avant que
  // l'onboarding avatar de la rentrée soit réglé (il redirige hors de la page).
  const choixDejaPropose = useRef(false);
  useEffect(() => {
    if (!avatarPret || choixDejaPropose.current) return;
    if (!choixSemaine?.doitChoisir) return;
    choixDejaPropose.current = true;
    setModalCeintures(true);
  }, [avatarPret, choixSemaine]);

  async function enregistrerChoixSemaine(codes: string[]) {
    if (!session) return;
    const corps = session.source === "planbox"
      ? { eleve_id: session.id, domaines: codes }
      : { rb_eleve_id: session.id, domaines: codes };
    try {
      const res = await fetch("/api/ceintures/choix-semaine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const json = await res.json();
      if (res.ok && !json.erreur) {
        setChoixSemaine((prev) => prev ? { ...prev, domaines: json.domaines ?? codes, doitChoisir: false } : prev);
        setModalCeintures(false);
      }
    } catch {
      /* réseau : la fenêtre reste ouverte, l'élève peut réessayer */
    }
  }

  // ── Ceintures de compétences (français) ────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    const ctrl = new AbortController();
    const qs = session.source === "planbox"
      ? `eleve_id=${session.id}`
      : `rb_eleve_id=${session.id}`;
    fetch(`/api/ceintures/etat?${qs}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((json) => {
        if (ctrl.signal.aborted) return;
        const domaines = json.domaines ?? [];
        if (!domaines.length) { setCeinturesFrancais(null); return; }
        // La pastille de la tuile : la couleur du premier domaine encore en cours.
        const enCours = domaines.find((d: { termine: boolean }) => !d.termine) ?? domaines[0];
        setCeinturesFrancais({ couleurCourante: enCours.couleurCourante, domaines });
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [session]);

  // ── Chargement Plan Box ─────────────────────────────────────────────────────
  async function chargerPB(eleveId: string, signal: AbortSignal) {
    try {
      const aujourd_hui = new Date().toISOString().split("T")[0];
      const { debut, fin, debutRetard } = getBornesSemaine();

      const [
        { data: eleveData },
        { data: progressionsData },
        { data: blocsWeek },
        { data: blocsReportes },
        { data: blocsExos },
        { data: podcastData },
        { data: notifsData },
      ] = await Promise.all([
        supabase.from("eleves").select("niveaux(nom), repetibox_eleve_id").eq("id", eleveId).single(),
        supabase.from("pb_progression").select("*, chapitres(*)").eq("eleve_id", eleveId).order("updated_at", { ascending: false }),
        supabase.from("plan_travail").select("*, chapitres(*)")
          .eq("eleve_id", eleveId)
          .gte("date_assignation", debutRetard)
          .lte("date_assignation", fin)
          .order("created_at", { ascending: true }),
        supabase.from("plan_travail").select("*, chapitres(*)")
          .eq("eleve_id", eleveId)
          .eq("type", "ressource")
          .lt("date_assignation", debut)
          .neq("statut", "fait")
          .order("date_assignation", { ascending: false })
          .limit(50),
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

      if (signal.aborted) return;

      if (eleveData) setNiveauNom((eleveData as any).niveaux?.nom ?? "");
      setProgressionsPB((progressionsData ?? []) as ProgressionComplete[]);
      setNotifications((notifsData ?? []) as Notification[]);

      // .then() obligatoire : le builder Supabase ne s'exécute que s'il est attendu
      supabase.from("eleves").update({ derniere_connexion: new Date().toISOString() }).eq("id", eleveId).then(() => {});

      const blocs = filtrerDicteesMotsJourStrict(
        filtrerBlocsConditionnels([
          ...((blocsWeek ?? []) as PlanTravail[]),
          ...((blocsReportes ?? []) as PlanTravail[]),
        ]),
        aujourd_hui,
      );
      const paniers = repartirBlocs(blocs, aujourd_hui, debut);
      setBlocsAujourdhui(paniers.aujourdhui);
      setBlocsSemaine(paniers.semaine);
      setBlocsEnRetard(paniers.enRetard);
      setProgressionExos(groupParChapitre((blocsExos ?? []) as unknown as PlanTravail[]));

      const podcasts = ((podcastData ?? []) as any[])
        .filter((b) => b.contenu?.qcm_id)
        .slice(0, 4)
        .map((b) => ({ id: b.id, titre: b.titre, qcm_id: b.contenu.qcm_id as string }));
      setPodcastsQcm(podcasts);

      // Podcasts à présenter dans le bloc latéral : ceux de la semaine + ceux
      // reportés des semaines précédentes (non terminés). Déduplication par qcm_id.
      const podcastsBlocs: Array<{ bloc: PlanTravail; reporte: boolean }> = [];
      const vusQcm = new Set<string>();
      for (const b of blocs) {
        if (b.type !== "ressource") continue;
        const qcmId = (b.contenu as any)?.qcm_id as string | undefined;
        if (!qcmId || vusQcm.has(qcmId)) continue;
        vusQcm.add(qcmId);
        podcastsBlocs.push({ bloc: b, reporte: b.date_assignation < debut });
      }
      if (podcastsBlocs.length > 0) {
        const qcmIds = podcastsBlocs.map((p) => (p.bloc.contenu as any).qcm_id as string);
        let faits = new Set<string>();
        try {
          const resFaits = await fetch(
            `/api/qcm-reponse/faits?qcm_ids=${encodeURIComponent(qcmIds.join(","))}&eleve_id=${encodeURIComponent(eleveId)}`,
            { signal },
          );
          const jsonFaits = await resFaits.json().catch(() => ({ faits: [] }));
          faits = new Set<string>(jsonFaits.faits ?? []);
        } catch { /* réseau KO : on affiche les podcasts sans l'état "fait" */ }
        if (!signal.aborted) {
          setPodcastsSemaine(podcastsBlocs.map(({ bloc, reporte }) => ({
            id: bloc.id,
            titre: bloc.titre,
            qcm_id: (bloc.contenu as any).qcm_id as string,
            fait: faits.has((bloc.contenu as any).qcm_id),
            reporte,
          })));
        }
      } else if (!signal.aborted) {
        setPodcastsSemaine([]);
      }

      const rbId = (eleveData as any)?.repetibox_eleve_id;
      if (rbId) setRbEleveId(rbId);

      // Requêtes secondaires (non-bloquantes) — avec signal
      if (rbId) {
        fetch(`/api/revisions-repetibox-jour?rb_eleve_id=${rbId}&pb_eleve_id=${eleveId}`, { signal })
          .then((r) => r.json())
          .then((json) => { if (!signal.aborted) setChapitresRB(json.chapitres ?? []); })
          .catch(() => {});
      }

      const ceintureParam = rbId ? `rb_id=${rbId}` : `eleve_id=${eleveId}`;
      fetch(`/api/ceinture-active?${ceintureParam}`, { signal })
        .then(async (r) => {
          if (r.status === 401) {
            if (!(await reparerSession())) return null;
            const retry = await fetch(`/api/ceinture-active?${ceintureParam}`, { signal });
            return retry.ok ? retry.json() : null;
          }
          return r.ok ? r.json() : null;
        })
        .then((d) => {
          if (signal.aborted || !d) return; // erreur/401 → on garde l'état du cache
          setCeintureActive(d.actif === true);
          if (d.actif) {
            fetch(`/api/ceinture-progression?${ceintureParam}`, { signal })
              .then((r) => r.json())
              .then((p) => {
                if (signal.aborted) return;
                const c = CEINTURES[p.ceinture_index ?? 0];
                if (c) setCeintureInfo({ index: c.index, nom: c.nom, couleur: c.couleur });
              })
              .catch(() => {});
          }
        })
        .catch(() => {});

      fetch(`/api/chapitres/mes-chapitres?eleve_id=${eleveId}`, { signal })
        .then((r) => r.json())
        .then((json) => { if (!signal.aborted) { setChapitresAssignes(json.chapitres ?? []); setSerieParcours(json.serie ?? 0); } })
        .catch(() => {});

      fetch("/api/daily-problem", { signal })
        .then((r) => r.json())
        .then((json) => {
          if (signal.aborted) return;
          if (json.id && !json.noSchool) {
            setDailyProblem(json);
            if (json.serverAttempt?.solved) {
              setDailyProblemSolved(true);
            } else {
              const saved = localStorage.getItem(`dpd_${eleveId}_${new Date().toISOString().split("T")[0]}`);
              if (saved) { try { setDailyProblemSolved(JSON.parse(saved).solved === true); } catch {} }
            }
          } else {
            setDailyProblem(null);
            setDailyProblemSolved(false);
          }
        })
        .catch(() => {});

      fetch("/api/calcul-du-jour", { signal })
        .then((r) => r.json())
        .then((json) => {
          if (signal.aborted) return;
          setCalculJour(json.id ? json : null);
        })
        .catch(() => {});
    } catch (err) {
      if (signal.aborted) return;
      console.error("[chargerPB]", err);
    } finally {
      if (!signal.aborted) setChargementDonnees(false);
    }
  }

  // ── Chargement Repetibox ────────────────────────────────────────────────────
  async function chargerRB(rbId: number, signal: AbortSignal) {
    try {
      // .then() obligatoire : le builder Supabase ne s'exécute que s'il est attendu
      supabase.from("eleves_planbox_meta").upsert(
        { repetibox_eleve_id: rbId, derniere_connexion: new Date().toISOString() },
        { onConflict: "repetibox_eleve_id" }
      ).then(() => {});

      // Requêtes indépendantes (ceinture, calcul, problème, parcours) lancées
      // TOUT EN HAUT, en parallèle du chargement des plans de travail/podcasts.
      // Elles ne dépendent que de rbId : ainsi, même si le chargement des
      // podcasts est lent ou échoue (élève avec beaucoup de podcasts), rien ne
      // bloque jamais l'affichage des ceintures, du calcul ou du problème.
      fetch(`/api/revisions-repetibox-jour?rb_eleve_id=${rbId}`, { signal })
        .then((r) => r.json())
        .then((json) => { if (!signal.aborted) setChapitresRB(json.chapitres ?? []); })
        .catch(() => {});

      fetch(`/api/ceinture-active?rb_id=${rbId}`, { signal })
        .then(async (r) => {
          if (r.status === 401) {
            if (!(await reparerSession())) return null;
            const retry = await fetch(`/api/ceinture-active?rb_id=${rbId}`, { signal });
            return retry.ok ? retry.json() : null;
          }
          return r.ok ? r.json() : null;
        })
        .then((d) => {
          if (signal.aborted || !d) return; // erreur/401 → on garde l'état du cache
          setCeintureActive(d.actif === true);
          if (d.actif) {
            fetch(`/api/ceinture-progression?rb_id=${rbId}`, { signal })
              .then((r) => r.json())
              .then((p) => {
                if (signal.aborted) return;
                const c = CEINTURES[p.ceinture_index ?? 0];
                if (c) setCeintureInfo({ index: c.index, nom: c.nom, couleur: c.couleur });
              })
              .catch(() => {});
          }
        })
        .catch(() => {});

      fetch(`/api/chapitres/mes-chapitres?rb_id=${rbId}`, { signal })
        .then((r) => r.json())
        .then((json) => { if (!signal.aborted) { setChapitresAssignes(json.chapitres ?? []); setSerieParcours(json.serie ?? 0); } })
        .catch(() => {});

      fetch("/api/daily-problem", { signal })
        .then((r) => r.json())
        .then((json) => {
          if (signal.aborted) return;
          if (json.id && !json.noSchool) {
            setDailyProblem(json);
            if (json.serverAttempt?.solved) {
              setDailyProblemSolved(true);
            } else {
              const saved = localStorage.getItem(`dpd_${rbId}_${new Date().toISOString().split("T")[0]}`);
              if (saved) { try { setDailyProblemSolved(JSON.parse(saved).solved === true); } catch {} }
            }
          } else {
            setDailyProblem(null);
            setDailyProblemSolved(false);
          }
        })
        .catch(() => {});

      fetch("/api/calcul-du-jour", { signal })
        .then((r) => r.json())
        .then((json) => {
          if (signal.aborted) return;
          setCalculJour(json.id ? json : null);
        })
        .catch(() => {});

      const aujourd_hui = new Date().toISOString().split("T")[0];
      const { debut, fin, debutRetard } = getBornesSemaine();

      // 3 requêtes ciblées en parallèle au lieu d'une grosse qui charge tout
      const [resSemaine, resExos, resPodcasts] = await Promise.all([
        fetch(`/api/mon-plan-travail?rb=${rbId}&debut=${debutRetard}&fin=${fin}`, { signal }),
        fetch(`/api/mon-plan-travail?rb=${rbId}&types=exercice,calcul_mental,eval`, { signal }),
        fetch(`/api/mon-plan-travail?rb=${rbId}&types=ressource`, { signal }),
      ]);
      if (signal.aborted) return;

      const [jsonSemaine, jsonExos, jsonPodcasts] = await Promise.all([
        resSemaine.json(),
        resExos.json(),
        resPodcasts.json(),
      ]);

      const blocsSemaine: PlanTravail[] = jsonSemaine.blocs ?? [];
      const blocsExos: PlanTravail[] = (jsonExos.blocs ?? []).filter((b: PlanTravail) => b.chapitre_id);
      const blocsPodcasts: PlanTravail[] = jsonPodcasts.blocs ?? [];

      const blocsWeekFiltered = filtrerDicteesMotsJourStrict(
        filtrerBlocsConditionnels(blocsSemaine),
        aujourd_hui,
      );
      const paniersRB = repartirBlocs(blocsWeekFiltered, aujourd_hui, debut);
      setBlocsAujourdhui(paniersRB.aujourdhui);
      setBlocsSemaine(paniersRB.semaine);
      setBlocsEnRetard(paniersRB.enRetard);

      setProgressionExos(groupParChapitre(blocsExos));

      const podcastsRB = blocsPodcasts
        .filter((b) => (b.contenu as any)?.qcm_id)
        .slice(0, 4)
        .map((b) => ({ id: b.id, titre: b.titre, qcm_id: (b.contenu as any).qcm_id as string }));
      setPodcastsQcm(podcastsRB);

      // Podcasts à présenter dans le bloc latéral : ceux de la semaine + reportés.
      const podcastsBlocs: Array<{ bloc: PlanTravail; reporte: boolean }> = [];
      const vusQcm = new Set<string>();
      for (const b of blocsWeekFiltered) {
        if (b.type !== "ressource") continue;
        const qcmId = (b.contenu as any)?.qcm_id as string | undefined;
        if (!qcmId || vusQcm.has(qcmId)) continue;
        vusQcm.add(qcmId);
        podcastsBlocs.push({ bloc: b, reporte: b.date_assignation < debut });
      }
      if (podcastsBlocs.length > 0) {
        const qcmIds = podcastsBlocs.map((p) => (p.bloc.contenu as any).qcm_id as string);
        let faits = new Set<string>();
        try {
          const resFaits = await fetch(
            `/api/qcm-reponse/faits?qcm_ids=${encodeURIComponent(qcmIds.join(","))}&rb_id=${rbId}`,
            { signal },
          );
          const jsonFaits = await resFaits.json().catch(() => ({ faits: [] }));
          faits = new Set<string>(jsonFaits.faits ?? []);
        } catch { /* réseau KO : on affiche les podcasts sans l'état "fait" */ }
        if (!signal.aborted) {
          setPodcastsSemaine(podcastsBlocs.map(({ bloc, reporte }) => ({
            id: bloc.id,
            titre: bloc.titre,
            qcm_id: (bloc.contenu as any).qcm_id as string,
            fait: faits.has((bloc.contenu as any).qcm_id),
            reporte,
          })));
        }
      } else if (!signal.aborted) {
        setPodcastsSemaine([]);
      }

    } catch (err) {
      if (signal.aborted) return;
      console.error("[chargerRB]", err);
    } finally {
      if (!signal.aborted) setChargementDonnees(false);
    }
  }

  // ── Rafraîchissement silencieux des blocs (polling 30s) ─────────────────────
  // Signature minimale pour détecter un changement sans re-render inutile
  function sigBlocs(blocs: PlanTravail[]) {
    return blocs.map((b) => `${b.id}:${b.statut}:${JSON.stringify(b.contenu)}`).join("|");
  }

  const rafraichirBlocs = useCallback(async (signal?: AbortSignal) => {
    const s = sessionRef.current;
    if (!s) return;

    const aujourd_hui = new Date().toISOString().split("T")[0];
    const { debut, fin, debutRetard } = getBornesSemaine();

    try {
      let blocsWeek: PlanTravail[] = [];

      if (s.source === "repetibox") {
        const res = await fetch(`/api/mon-plan-travail?rb=${s.id}&debut=${debutRetard}&fin=${fin}`, signal ? { signal } : undefined);
        if (signal?.aborted) return;
        const json = await res.json();
        blocsWeek = json.blocs ?? [];
      } else {
        const [{ data: dataWeek }, { data: dataReportes }] = await Promise.all([
          supabase
            .from("plan_travail")
            .select("*, chapitres(*)")
            .eq("eleve_id", s.id)
            .gte("date_assignation", debutRetard)
            .lte("date_assignation", fin)
            .order("created_at", { ascending: true }),
          supabase
            .from("plan_travail")
            .select("*, chapitres(*)")
            .eq("eleve_id", s.id)
            .eq("type", "ressource")
            .lt("date_assignation", debut)
            .neq("statut", "fait")
            .order("date_assignation", { ascending: false })
            .limit(50),
        ]);
        if (signal?.aborted) return;
        blocsWeek = [...((dataWeek ?? []) as PlanTravail[]), ...((dataReportes ?? []) as PlanTravail[])];
      }

      const blocsFiltered = filtrerDicteesMotsJourStrict(
        filtrerBlocsConditionnels(blocsWeek),
        aujourd_hui,
      );
      const paniers = repartirBlocs(blocsFiltered, aujourd_hui, debut);

      if (!signal?.aborted) {
        setBlocsAujourdhui((prev) => sigBlocs(paniers.aujourdhui) !== sigBlocs(prev) ? paniers.aujourdhui : prev);
        setBlocsSemaine((prev) => sigBlocs(paniers.semaine) !== sigBlocs(prev) ? paniers.semaine : prev);
        setBlocsEnRetard((prev) => sigBlocs(paniers.enRetard) !== sigBlocs(prev) ? paniers.enRetard : prev);
      }
    } catch { /* silencieux — inclut AbortError */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling 30s + rafraîchissement au retour sur la page
  useEffect(() => {
    if (chargementDonnees) return;

    const ctrl = new AbortController();

    const interval = setInterval(() => rafraichirBlocs(ctrl.signal), 30_000);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        rafraichirBlocs(ctrl.signal);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      ctrl.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [chargementDonnees, rafraichirBlocs]);

  // ── Sauvegarde automatique du cache (synchrone) ─────────────────────────────
  // À chaque changement d'état significatif, on met à jour le snapshot
  // sessionStorage immédiatement → le cache est toujours frais même si l'élève
  // navigue très vite après un clic.
  useEffect(() => {
    if (chargementDonnees || !session) return;
    sauverCache(session.id, {
      niveauNom,
      progressionsPB,
      progressionExos,
      blocsAujourdhui,
      blocsSemaine,
      blocsEnRetard,
      notifications,
      chapitresRB,
      podcastsQcm,
      podcastsSemaine,
      rbEleveId,
      ceintureActive,
      ceintureInfo,
      dailyProblem,
      dailyProblemSolved,
      chapitresAssignes,
      serieParcours,
      calculJour,
    });
  }, [
    chargementDonnees, session, niveauNom, progressionsPB, progressionExos,
    blocsAujourdhui, blocsSemaine, blocsEnRetard, notifications, chapitresRB, podcastsQcm,
    podcastsSemaine, rbEleveId, ceintureActive, ceintureInfo, dailyProblem,
    dailyProblemSolved, chapitresAssignes, serieParcours, calculJour,
  ]);

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
    // Purger le cache dashboard de l'élève courant avant déconnexion
    if (session) {
      try { sessionStorage.removeItem(cacheKey(session.id)); } catch {}
    }
    await effacerSession();
    // window.location pour forcer un rechargement complet (reset état React + cache Supabase)
    window.location.href = "/eleve";
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
  const hasDailyProblem = dailyProblem !== null;
  const hasCalculJour = calculJour !== null;
  // Compteur de tâches du JOUR uniquement (exclut les blocs hebdomadaires
  // et les podcasts reportés qui ne sont pas spécifiquement à faire
  // aujourd'hui).
  const dateAujourdhui = new Date().toISOString().split("T")[0];
  const blocsDuJourStricts = blocsAujourdhui.filter((b) => b.date_assignation === dateAujourdhui);
  const totalTaches = blocsDuJourStricts.length + (hasDailyProblem ? 1 : 0) + (hasCalculJour ? 1 : 0);
  const nbFaitAujourd_hui = blocsDuJourStricts.filter((b) => b.statut === "fait").length
    + (hasDailyProblem && dailyProblemSolved ? 1 : 0)
    + (calculJour?.deja_fait ? 1 : 0);
  const pctJour = totalTaches > 0
    ? Math.round((nbFaitAujourd_hui / totalTaches) * 100)
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

  // Parcours en cours, triés : activité la plus récente d'abord, puis le plus avancé.
  const parcoursEnCours = [...chapitresAssignes]
    .filter((ch) => !ch.tousValides && ch.nbExercices > 0)
    .sort((a, b) => {
      const da = a.derniereActivite ?? "";
      const db = b.derniereActivite ?? "";
      if (da !== db) return db.localeCompare(da);
      return b.pourcentage - a.pourcentage;
    });
  // Le parcours « à la une » = celui déjà commencé le plus récemment (sinon le plus avancé).
  const parcoursALaUne = parcoursEnCours.find((ch) => ch.nbValides > 0) ?? parcoursEnCours[0] ?? null;

  // Ceintures affichées : les deux domaines choisis pour la semaine. Tant que le
  // choix n'est pas fait, on n'affiche que les domaines déjà commencés — un
  // domaine jamais travaillé n'a rien à faire dans le travail du jour.
  const domainesSemaine = (() => {
    const tous = ceinturesFrancais?.domaines ?? [];
    if (!tous.length) return [];
    const choisis = choixSemaine?.domaines ?? [];
    if (choisis.length > 0) return tous.filter((d) => choisis.includes(d.code));
    return tous.filter((d) => d.commence);
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
            <a href="#progression" className="eleve-nav-link">Mes chapitres</a>
            <a href="#a-venir" className="eleve-nav-link">À venir</a>
            <Link href="/eleve/bilan" className="eleve-nav-link" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span className="ms" style={{ fontSize: 16 }}>bar_chart</span>
              Mon bilan
            </Link>
          </div>

          <div className="eleve-nav-actions">
            {niveauNom && (
              <span className="pb-pill" style={{ background: "rgba(0,80,212,0.1)", color: "var(--pb-primary)" }}>
                {niveauNom}
              </span>
            )}
            {session?.avatar_bigheads ? (
              <Avatar options={session.avatar_bigheads} seed={session.prenom} size={40} />
            ) : (
              <div className="pb-avatar">{initiales}</div>
            )}
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
                {totalTaches > 0
                  ? `${nbFaitAujourd_hui} sur ${totalTaches} tâches complétées aujourd'hui`
                  : "Rien à faire aujourd'hui — bravo !"}
              </p>

              {/* Barre de progression jour */}
              {totalTaches > 0 && (
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

            {/* Ceintures de multiplications */}
            {ceintureActive && (
              <Link
                href="/eleve/activite/ceinture"
                className="pb-card"
                style={{
                  display: "block", textDecoration: "none", color: "inherit",
                  background: "linear-gradient(135deg, #FFF7ED, #FEF3C7)",
                  border: "1.5px solid rgba(245,158,11,0.25)",
                  padding: "20px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span className="ms" style={{ fontSize: 28, color: "#F59E0B" }}>military_tech</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#92400E" }}>
                      Ceintures de multiplications
                    </div>
                    <div style={{ fontSize: 12, color: "#B45309" }}>
                      Entraîne-toi sur les tables !
                    </div>
                  </div>
                </div>
                {ceintureInfo && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: "50%",
                      background: ceintureInfo.couleur,
                      border: "2px solid rgba(255,255,255,0.6)",
                      boxShadow: `0 0 0 1px ${ceintureInfo.couleur}40`,
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: ceintureInfo.couleur, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      Ceinture {ceintureInfo.nom}
                    </span>
                  </div>
                )}
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: "#F59E0B", color: "white", padding: "8px 18px",
                  borderRadius: 999, fontSize: 13, fontWeight: 700,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}>
                  S'entraîner →
                </div>
              </Link>
            )}

{/* Chapitres progressifs déplacés dans "À faire en ligne" */}

            {/* Bibliothèque — livre en cours ou invitation à choisir */}
            {bibliothequeEnCours ? (
              <Link
                href={`/eleve/chapitre/${bibliothequeEnCours.chapitre_id}`}
                className="pb-card"
                style={{
                  display: "block", textDecoration: "none", color: "inherit",
                  background: "linear-gradient(135deg, #F3E8FF, #E9D5FF)",
                  border: "1.5px solid rgba(124,58,237,0.25)",
                  padding: "20px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 48, height: 66, borderRadius: 6, flexShrink: 0,
                      background: bibliothequeEnCours.couverture_url
                        ? `url(${bibliothequeEnCours.couverture_url}) center / cover`
                        : "linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)",
                      boxShadow: "0 3px 8px rgba(0,0,0,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "white",
                    }}
                  >
                    {!bibliothequeEnCours.couverture_url && <span className="ms" style={{ fontSize: 22 }}>menu_book</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#7C3AED", letterSpacing: 0.5, marginBottom: 2, textTransform: "uppercase" }}>
                      Ma lecture
                    </div>
                    <div style={{
                      fontSize: 15, fontWeight: 800, color: "#4C1D95",
                      fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.2,
                      overflow: "hidden", textOverflow: "ellipsis",
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    }}>
                      {bibliothequeEnCours.titre}
                    </div>
                  </div>
                </div>
                <div style={{ height: 5, background: "rgba(124,58,237,0.25)", borderRadius: 999, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{
                    height: "100%", background: "#7C3AED",
                    width: `${bibliothequeEnCours.pourcentage}%`,
                    transition: "width 0.3s",
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#5B21B6", fontWeight: 700 }}>
                    {bibliothequeEnCours.pourcentage}% lu
                  </span>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    background: "#7C3AED", color: "white", padding: "6px 14px",
                    borderRadius: 999, fontSize: 12, fontWeight: 700,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}>
                    Continuer →
                  </span>
                </div>
              </Link>
            ) : bibliothequePeutChoisir && (
              <Link
                href="/eleve/bibliotheque"
                className="pb-card"
                style={{
                  display: "block", textDecoration: "none", color: "inherit",
                  background: "linear-gradient(135deg, #F3E8FF, #DDD6FE)",
                  border: "1.5px solid rgba(124,58,237,0.25)",
                  padding: "20px",
                  position: "relative", overflow: "hidden",
                }}
              >
                <div style={{
                  position: "absolute", top: -20, right: -10,
                  fontSize: 90, opacity: 0.12,
                }}>📚</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, position: "relative" }}>
                  <span className="ms" style={{ fontSize: 28, color: "#7C3AED" }}>auto_stories</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#4C1D95" }}>
                      Choisir ma prochaine lecture
                    </div>
                    <div style={{ fontSize: 12, color: "#7C3AED" }}>
                      Découvre la bibliothèque de la classe
                    </div>
                  </div>
                </div>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: "#7C3AED", color: "white", padding: "8px 18px",
                  borderRadius: 999, fontSize: 13, fontWeight: 700,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  position: "relative",
                }}>
                  Voir les livres →
                </div>
              </Link>
            )}

            {/* Podcasts à écouter (semaine en cours + reportés non terminés).
                Une fois que l'élève a répondu au QCM, le bloc est masqué. */}
            {podcastsSemaine.filter((p) => !p.fait).map((p) => (
              <div key={p.id} className="pb-card" style={{
                background: p.fait
                  ? "linear-gradient(135deg, #F0FDF4, #DCFCE7)"
                  : p.reporte
                    ? "linear-gradient(135deg, #FFF7ED, #FFEDD5)"
                    : "linear-gradient(135deg, #EFF6FF, #DBEAFE)",
                border: `1.5px solid ${p.fait ? "rgba(22,163,74,0.25)" : p.reporte ? "rgba(234,88,12,0.3)" : "rgba(59,130,246,0.25)"}`,
                padding: "20px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span className="ms" style={{ fontSize: 28, color: p.fait ? "#16A34A" : p.reporte ? "#EA580C" : "#3B82F6" }}>
                    {p.fait ? "check_circle" : "podcasts"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", color: p.fait ? "#166534" : p.reporte ? "#9A3412" : "#1E40AF" }}>
                      {p.reporte && !p.fait ? "Podcast à rattraper" : "Podcast de la semaine"}
                    </div>
                    <div style={{
                      fontSize: 12, color: p.fait ? "#15803D" : p.reporte ? "#C2410C" : "#2563EB",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {p.titre}
                    </div>
                  </div>
                </div>
                <Link
                  href={p.fait ? `/eleve/qcm-classement/${p.qcm_id}` : `/eleve/activite/${p.id}`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: p.fait ? "#16A34A" : p.reporte ? "#EA580C" : "#3B82F6",
                    color: "white", padding: "8px 18px",
                    borderRadius: 999, fontSize: 13, fontWeight: 700,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    textDecoration: "none",
                  }}
                >
                  {p.fait ? "Voir le classement →" : "Écouter & répondre →"}
                </Link>
                {/* Liens podiums */}
                <div style={{ display: "flex", gap: 10, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${p.fait ? "rgba(22,163,74,0.15)" : p.reporte ? "rgba(234,88,12,0.18)" : "rgba(59,130,246,0.15)"}` }}>
                  <Link
                    href={`/eleve/qcm-classement/${p.qcm_id}`}
                    style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: p.fait ? "#166534" : p.reporte ? "#9A3412" : "#1E40AF", textDecoration: "none" }}
                  >
                    <span className="ms" style={{ fontSize: 16 }}>emoji_events</span>
                    Podium podcast
                  </Link>
                  <Link
                    href="/eleve/qcm-classement/global"
                    style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: p.fait ? "#166534" : p.reporte ? "#9A3412" : "#1E40AF", textDecoration: "none" }}
                  >
                    <span className="ms" style={{ fontSize: 16 }}>leaderboard</span>
                    Classement global
                  </Link>
                </div>
              </div>
            ))}

            {/* 🏆 Classement Podcasts — toujours visible */}
            <Link
              href="/eleve/qcm-classement/global"
              className="pb-card"
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "16px 20px",
                background: "linear-gradient(135deg, #1E1B4B, #312E81)",
                border: "none",
                textDecoration: "none",
                color: "white",
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: "rgba(245,158,11,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26,
              }}>
                🏆
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Classement Podcasts
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
                  Voir le podium de la classe →
                </div>
              </div>
              <span style={{ fontSize: 22, opacity: 0.5 }}>›</span>
            </Link>

            {/* Mes chapitres (Plan Box) */}
            {progressionsSorted.length > 0 && (
              <div id="progression" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                  return ["dictee", "mots", "correction_dictee", "fichier_maths", "lecon_copier", "ecriture"].includes(b.type);
                };
                const blocsPapier = blocsAujourdhui.filter(isPapier);
                const blocsEnLigneLibres = blocsLibres.filter((b) => !isPapier(b));
                const groupesEnLigne = groupesChapitres
                  .map(([id, info]) => [id, { ...info, blocs: info.blocs.filter((b) => !isPapier(b)) }] as [string, { titre: string; matiere: string | null; blocs: PlanTravail[] }])
                  .filter(([, info]) => info.blocs.length > 0);
                const totalEnLigne = groupesEnLigne.reduce((s, [, { blocs }]) => s + blocs.length, 0) + blocsEnLigneLibres.length + (chapitresRB.length > 0 && urlRB ? 1 : 0) + chapitresAssignes.length;
                return (
              <>
              {/* ─ Header ─ */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                <div>
                  <p className="pb-section-title">À faire aujourd'hui</p>
                  <p className="pb-section-sub">
                    {blocsAujourdhui.length === 0
                      ? "Rien à faire — bravo !"
                      : `${nbFaitAujourd_hui}/${totalTaches} tâches complétées`}
                  </p>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                  {serieParcours >= 2 && (
                    <span title="Jours d'affilée où tu as avancé un parcours" style={{
                      background: "rgba(245,158,11,0.12)", color: "#B45309",
                      fontWeight: 800, fontSize: 13, padding: "4px 12px", borderRadius: 999,
                      fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: "nowrap",
                    }}>
                      🔥 {serieParcours} jours
                    </span>
                  )}
                  {totalTaches > 0 && (
                    <span style={{
                      background: nbFaitAujourd_hui === totalTaches ? "#dcfce7" : "rgba(0,80,212,0.1)",
                      color: nbFaitAujourd_hui === totalTaches ? "#166534" : "var(--pb-primary)",
                      fontWeight: 800, fontSize: 13, padding: "4px 14px", borderRadius: 999,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}>
                      {nbFaitAujourd_hui === totalTaches ? "✓ Tout fait !" : `${totalTaches - nbFaitAujourd_hui} restant${totalTaches - nbFaitAujourd_hui > 1 ? "s" : ""}`}
                    </span>
                  )}
                </div>
              </div>

              {/* ══ Ceintures de la semaine ══ */}
              {domainesSemaine.length > 0 && (
                <div
                  className="pb-card"
                  style={{
                    padding: "20px 22px", marginBottom: 24,
                    background: "linear-gradient(135deg, rgba(124,179,66,0.10), rgba(124,179,66,0.02))",
                    border: "1px solid rgba(124,179,66,0.25)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <span className="ms" style={{ fontSize: 22, color: "#7CB342" }}>workspace_premium</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
                        textTransform: "uppercase", color: "#5A8C2E",
                      }}>
                        🥋 Tes ceintures de la semaine
                      </div>
                    </div>
                    {(choixSemaine?.disponibles.length ?? 0) >= 2 && (
                      <button
                        type="button"
                        onClick={() => setModalCeintures(true)}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          fontSize: 12, fontWeight: 700, color: "#5A8C2E",
                          padding: "4px 8px", borderRadius: 8,
                        }}
                      >
                        Changer
                      </button>
                    )}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                    {domainesSemaine.map((d) => {
                      const teinte = d.couleurCourante?.hex ?? "#7CB342";
                      return (
                        <Link
                          key={d.code}
                          href={d.slug ? `/eleve/ceintures/${d.slug}` : "/eleve/ceintures"}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "14px 16px", borderRadius: 14,
                            background: "white", border: `1.5px solid ${teinte}40`,
                            textDecoration: "none", color: "inherit",
                          }}
                        >
                          <span className="ms" style={{ fontSize: 24, color: teinte, flexShrink: 0 }}>
                            {d.icone ?? "workspace_premium"}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontWeight: 800, fontSize: 15,
                              fontFamily: "'Plus Jakarta Sans', sans-serif",
                              color: "var(--pb-on-surface)",
                            }}>
                              {d.nom}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                              <span style={{ width: 9, height: 9, borderRadius: "50%", background: teinte, flexShrink: 0 }} />
                              <span style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>
                                {d.couleurCourante?.nom ? `Ceinture ${d.couleurCourante.nom.toLowerCase()}` : "Domaine terminé"}
                              </span>
                            </div>
                          </div>
                          <span className="ms" style={{ fontSize: 18, color: teinte, flexShrink: 0 }}>chevron_right</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ══ Parcours à la une / Transition après le travail du jour ══ */}
              {parcoursALaUne && (() => {
                const journeeFinie = totalTaches > 0 && nbFaitAujourd_hui === totalTaches;
                return (
                  <Link
                    href={`/eleve/chapitre/${parcoursALaUne.id}`}
                    className="pb-card"
                    style={{
                      display: "block", textDecoration: "none", color: "inherit",
                      padding: "20px 22px", marginBottom: 24,
                      background: "linear-gradient(135deg, rgba(124,58,237,0.10), rgba(124,58,237,0.02))",
                      border: "1px solid rgba(124,58,237,0.20)",
                      position: "relative", overflow: "hidden",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{
                        width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                        background: "rgba(124,58,237,0.12)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <span className="ms" style={{ fontSize: 28, color: "#7C3AED" }}>
                          {journeeFinie ? "rocket_launch" : "auto_stories"}
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
                          textTransform: "uppercase", color: "#7C3AED", marginBottom: 4,
                        }}>
                          {journeeFinie ? "🎉 Travail du jour terminé — et maintenant ?" : "⭐ Ton parcours à continuer"}
                        </div>
                        <div style={{
                          fontWeight: 800, fontSize: 16,
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                          color: "var(--pb-on-surface)",
                        }}>
                          {parcoursALaUne.titre}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", marginTop: 3 }}>
                          {parcoursALaUne.prochainExerciceTitre
                            ? <>Étape {parcoursALaUne.exerciceEnCoursOrdre} : {parcoursALaUne.prochainExerciceTitre}{parcoursALaUne.prochainExerciceMinutes ? ` · ~${parcoursALaUne.prochainExerciceMinutes} min` : ""}</>
                            : `${parcoursALaUne.nbValides}/${parcoursALaUne.nbExercices} validés`}
                        </div>
                      </div>
                      <span className="pb-btn primary-fill" style={{
                        fontSize: 14, padding: "10px 22px", borderRadius: 999, flexShrink: 0,
                        background: "#7C3AED", color: "#fff", whiteSpace: "nowrap",
                      }}>
                        {journeeFinie ? "5 min de parcours 💪" : (parcoursALaUne.nbValides > 0 ? "Continuer →" : "Commencer →")}
                      </span>
                    </div>
                  </Link>
                );
              })()}

              {/* ══ En retard ══ (uniquement s'il y a du rattrapage) */}
              {blocsEnRetard.length > 0 && (
                <div
                  className="pb-card"
                  style={{
                    padding: "18px 20px", marginBottom: 24,
                    borderLeft: "4px solid #DC2626",
                    background: "linear-gradient(135deg, rgba(220,38,38,0.06), rgba(220,38,38,0.01))",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <span className="ms" style={{ fontSize: 20, color: "#DC2626" }}>schedule</span>
                    <span style={{
                      fontSize: 13, fontWeight: 800, color: "#DC2626",
                      textTransform: "uppercase", letterSpacing: "0.06em",
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}>
                      En retard
                    </span>
                    <span style={{
                      background: "rgba(220,38,38,0.12)", color: "#DC2626", fontWeight: 700,
                      fontSize: 11, padding: "2px 8px", borderRadius: 999,
                    }}>
                      {blocsEnRetard.length}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginLeft: 4 }}>
                      À rattraper dès que tu peux
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {blocsEnRetard.map((b) => {
                      const ms = TYPE_BLOC_MS[b.type] ?? { icon: "task_alt", color: "#6B7280", bg: "rgba(107,114,128,0.1)" };
                      const jour = new Date(b.date_assignation + "T12:00:00").toLocaleDateString("fr-FR", {
                        weekday: "long", day: "numeric", month: "long",
                      });
                      return (
                        <div
                          key={b.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "12px 14px", borderRadius: 12,
                            background: "white", border: "1px solid rgba(220,38,38,0.15)",
                          }}
                        >
                          <div style={{
                            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                            background: ms.bg, display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <span className="ms" style={{ fontSize: 20, color: ms.color }}>{ms.icon}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 14, fontWeight: 700,
                              fontFamily: "'Plus Jakarta Sans', sans-serif",
                              color: "var(--pb-on-surface)",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {b.titre}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>
                              Prévu {jour}
                            </div>
                          </div>
                          {b.contenu && (
                            <Link
                              href={`/eleve/activite/${b.id}`}
                              className="pb-btn"
                              style={{
                                padding: "8px 18px", fontSize: 13, borderRadius: 999,
                                flexShrink: 0, whiteSpace: "nowrap",
                                background: "#DC2626", color: "white",
                              }}
                            >
                              Rattraper →
                            </Link>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {blocsAujourdhui.length === 0 && chapitresRB.length === 0 && blocsEnRetard.length === 0 ? (
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
                            ? `Mathématiques${page ? ` • p.${page}` : ""}`
                            : b.type === "lecon_copier"
                            ? "À copier sur ton cahier"
                            : b.type === "ecriture"
                            ? "Écriture créative • À écrire sur ton cahier"
                            : b.type === "mots"
                            ? "Mots à apprendre • Écris-les plusieurs fois sur ton cahier"
                            : b.type === "correction_dictee"
                            ? "Relis et corrige ta dictée sur ton cahier"
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
                                  {b.type === "dictee" ? `Dictée — ${b.titre}` : b.type === "correction_dictee" ? b.titre : b.type === "mots" ? `Mots — ${b.titre.replace(/^Mots — /, "")}` : b.type === "lecon_copier" ? `Leçon — ${b.titre}` : b.type === "ecriture" ? `Écriture — ${b.titre.replace("Écriture — ", "")}` : b.type === "fichier_maths" ? (page ? `Fichier de Maths P${page}` : b.titre) : b.titre}
                                </div>
                                <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>
                                  {sousTitre}
                                </div>
                              </div>

                              {/* Bouton accès activité — dictée, correction, mots, leçon à copier et écriture */}
                              {(b.type === "dictee" || b.type === "correction_dictee" || b.type === "mots" || b.type === "lecon_copier" || b.type === "ecriture") && b.contenu && !estFait && (
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
                  {(groupesEnLigne.length > 0 || blocsEnLigneLibres.length > 0 || (chapitresRB.length > 0 && urlRB) || dailyProblem || chapitresAssignes.length > 0) && (
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
                      mots:          { label: "Mots de la dictée", color: "#D97706", bg: "rgba(217,119,6,0.08)" },
                      eval:          { label: "Évaluation",      color: "#DC2626", bg: "rgba(220,38,38,0.08)" },
                      ressource:     { label: "Ressource",       color: "#0891B2", bg: "rgba(8,145,178,0.08)" },
                      libre:         { label: "Activité libre",  color: "#6B7280", bg: "rgba(107,114,128,0.08)" },
                      repetibox:     { label: "Repetibox",       color: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
                      media:         { label: "Vidéo",           color: "#059669", bg: "rgba(5,150,105,0.08)" },
                      ecriture:       { label: "Écriture",          color: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
                      texte_a_trous:  { label: "Texte à trous",    color: "#0E7490", bg: "rgba(14,116,144,0.08)" },
                      analyse_phrase: { label: "Analyse de phrase", color: "#6D28D9", bg: "rgba(109,40,217,0.08)" },
                      classement: { label: "Classement", color: "#0369A1", bg: "rgba(3,105,161,0.08)" },
                      comparaison: { label: "Comparaison", color: "#0D9488", bg: "rgba(13,148,136,0.08)" },
                      rangement: { label: "Rangement", color: "#B45309", bg: "rgba(180,83,9,0.08)" },
                      lecture: { label: "Lecture", color: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
                      probleme_maths: { label: "Problèmes de maths", color: "#0D9488", bg: "rgba(13,148,136,0.08)" },
                      ceinture_multiplication: { label: "Ceintures", color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
                    };
                    const DESC: Record<string, string> = {
                      exercice:      "Entraîne-toi sur les notions du cours.",
                      calcul_mental: "Entraîne ta rapidité de calcul.",
                      mots:          "Lis et apprends les mots de la dictée.",
                      eval:          "Évalue tes connaissances.",
                      ressource:     "Consulte la ressource en ligne.",
                      libre:         "Activité libre à réaliser.",
                      repetibox:     "Révise tes flashcards.",
                      media:         "Regarde la vidéo.",
                      ecriture:       "Atelier d'écriture de la semaine.",
                      texte_a_trous:  "Complète les mots manquants.",
                      analyse_phrase: "Identifie les fonctions grammaticales.",
                      classement: "Classe les éléments dans les bonnes catégories.",
                      comparaison: "Place le bon signe entre les deux nombres.",
                      rangement: "Range les étiquettes de gauche à droite.",
                      lecture: "Lis le texte puis réponds aux questions.",
                      probleme_maths: "Lis, calcule, puis écris ta phrase réponse.",
                      ceinture_multiplication: "Entraîne-toi sur les tables de multiplication.",
                    };
                    const TYPES_INTERACTIFS = ["exercice", "calcul_mental", "mots", "eval", "ressource", "media", "texte_a_trous", "analyse_phrase", "classement", "comparaison", "rangement", "lecture", "probleme_maths", "ceinture_multiplication"];
                    const tousBlocs = [
                      ...groupesEnLigne.flatMap(([, { blocs }]) => blocs),
                      ...blocsEnLigneLibres,
                    ].filter((b) => !(b.type === "ressource" && (b.contenu as any)?.qcm_id));
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
                          const ecritureSemaineFinalisee = isEcritureSemaine && !!(b.contenu as any)?.date_version_finale;
                          // L'écriture semaine n'est vraiment terminée qu'après la version finale
                          const visuellementFait = estFait && (!isEcritureSemaine || ecritureSemaineFinalisee);
                          const peutCommencer = (TYPES_INTERACTIFS.includes(b.type) || isEcritureSemaine) && b.contenu;
                          // Score précédent et badge 2e chance
                          const contenuBloc = (b.contenu as Record<string, unknown>) ?? {};
                          const scorePrecedent = contenuBloc.score_eleve as number | undefined;
                          const scorePrecedentTotal = contenuBloc.score_total as number | undefined;
                          const estReaffectation = !!(contenuBloc.reaffectation || contenuBloc.source_bloc_id);
                          const pctPrecedent = (scorePrecedent !== undefined && scorePrecedentTotal)
                            ? Math.round((scorePrecedent / scorePrecedentTotal) * 100)
                            : null;
                          return (
                            <div
                              key={b.id}
                              className="pb-card"
                              style={{
                                padding: "20px 22px",
                                borderLeft: `4px solid ${cat.color}`,
                                display: "flex",
                                flexDirection: "column",
                                opacity: visuellementFait ? 0.65 : 1,
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
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                                    <span style={{
                                      fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                                      textTransform: "uppercase", padding: "4px 12px",
                                      borderRadius: 999, background: cat.bg, color: cat.color,
                                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                                    }}>
                                      {cat.label}
                                    </span>
                                    {estReaffectation && (
                                      <span style={{
                                        fontSize: 10, fontWeight: 700, padding: "4px 10px",
                                        borderRadius: 999, background: "rgba(112,42,225,0.1)", color: "#702AE1",
                                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                                        display: "flex", alignItems: "center", gap: 4,
                                      }}>
                                        🔄 2e chance
                                      </span>
                                    )}
                                  </div>
                                  <div style={{
                                    fontSize: 17, fontWeight: 800,
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                    color: "var(--pb-on-surface)", marginBottom: 8,
                                    textDecoration: visuellementFait ? "line-through" : "none",
                                  }}>
                                    {b.titre}
                                  </div>
                                  <div style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", lineHeight: 1.5 }}>
                                    {desc}
                                  </div>
                                  {/* Score précédent (si déjà tenté) */}
                                  {!estFait && pctPrecedent !== null && (
                                    <div style={{
                                      marginTop: 8, fontSize: 12, fontWeight: 600,
                                      color: pctPrecedent >= 80 ? "#16A34A" : pctPrecedent >= 60 ? "#D97706" : "#DC2626",
                                      display: "flex", alignItems: "center", gap: 4,
                                    }}>
                                      <span className="ms" style={{ fontSize: 14 }}>history</span>
                                      Dernier score : {scorePrecedent}/{scorePrecedentTotal} ({pctPrecedent}%)
                                    </div>
                                  )}
                                </div>
                                <span className="ms" style={{ fontSize: 22, color: `${cat.color}66`, flexShrink: 0, marginLeft: 10 }}>
                                  {ms.icon}
                                </span>
                              </div>

                              {/* Action */}
                              {/* Écriture semaine : toujours accessible même après envoi
                                  (l'élève doit pouvoir appliquer les corrections du maître) */}
                              {(!estFait || isEcritureSemaine) && (
                                peutCommencer ? (
                                  <div style={{ marginTop: "auto", paddingTop: 16 }}>
                                    <Link
                                      href={`/eleve/activite/${b.id}`}
                                      className="pb-btn primary"
                                      style={{ padding: "10px 20px", fontSize: 14, borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0 }}
                                    >
                                      {isEcritureSemaine && estFait ? "Continuer →" : pctPrecedent !== null ? "Réessayer →" : "Commencer →"}
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

                  {/* ══ Calcul du jour ══ */}
                  {calculJour && (
                    <Link
                      href="/eleve/calcul-du-jour"
                      className="pb-card"
                      style={{
                        display: "flex", flexDirection: "column",
                        padding: "20px 22px",
                        borderLeft: `4px solid ${calculJour.deja_fait ? "#22C55E" : "#2563EB"}`,
                        textDecoration: "none", color: "inherit",
                        opacity: calculJour.deja_fait ? 0.65 : 1,
                        minHeight: 130, position: "relative", overflow: "hidden",
                      }}
                    >
                      <div style={{
                        position: "absolute", bottom: -30, right: -30,
                        width: 100, height: 100, borderRadius: "50%",
                        background: "rgba(37,99,235,0.08)", pointerEvents: "none",
                      }} />
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                              textTransform: "uppercase", padding: "4px 12px",
                              borderRadius: 999, background: "rgba(37,99,235,0.12)", color: "#2563EB",
                              fontFamily: "'Plus Jakarta Sans', sans-serif",
                            }}>
                              Calcul du jour
                            </span>
                          </div>
                          <div style={{
                            fontSize: 22, fontWeight: 800, fontFamily: "'Courier New', monospace",
                            color: "var(--pb-on-surface)", marginBottom: 8,
                            textDecoration: calculJour.deja_fait ? "line-through" : "none",
                          }}>
                            {String(calculJour.nombre1).replace(".", ",")} {calculJour.operation === "addition" ? "+" : calculJour.operation === "soustraction" ? "−" : calculJour.operation === "multiplication" ? "×" : "÷"} {String(calculJour.nombre2).replace(".", ",")}
                          </div>
                        </div>
                        <span className="ms" style={{ fontSize: 22, color: "rgba(37,99,235,0.5)", flexShrink: 0, marginLeft: 10 }}>
                          function
                        </span>
                      </div>
                      {!calculJour.deja_fait ? (
                        <div style={{ marginTop: "auto", paddingTop: 16 }}>
                          <span
                            className="pb-btn primary"
                            style={{ padding: "10px 20px", fontSize: 14, borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0 }}
                          >
                            Calculer →
                          </span>
                        </div>
                      ) : (
                        <div style={{ marginTop: "auto", paddingTop: 16, fontSize: 14, fontWeight: 700, color: "#16A34A" }}>
                          ✓ Résolu
                        </div>
                      )}
                    </Link>
                  )}

                  {/* ══ Chapitres progressifs (le livre en cours est déjà affiché en haut via le bloc "Ma lecture") ══ */}
                  {chapitresAssignes
                    .filter((ch) => !bibliothequeEnCours || ch.id !== bibliothequeEnCours.chapitre_id)
                    .filter((ch) => !parcoursALaUne || ch.id !== parcoursALaUne.id)
                    .map((ch) => (
                    <Link
                      key={`chap-${ch.id}`}
                      href={`/eleve/chapitre/${ch.id}`}
                      className="pb-card"
                      style={{
                        display: "flex", flexDirection: "column",
                        padding: "20px 22px",
                        borderLeft: `4px solid ${ch.tousValides ? "#22C55E" : "#7C3AED"}`,
                        textDecoration: "none", color: "inherit",
                        opacity: ch.tousValides ? 0.65 : 1,
                        minHeight: 130,
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      {/* Cercle déco */}
                      <div style={{
                        position: "absolute", bottom: -30, right: -30,
                        width: 100, height: 100, borderRadius: "50%",
                        background: ch.tousValides ? "rgba(34,197,94,0.08)" : "rgba(124,58,237,0.08)",
                        pointerEvents: "none",
                      }} />

                      {/* Header */}
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                              textTransform: "uppercase", padding: "4px 12px",
                              borderRadius: 999,
                              background: ch.tousValides ? "rgba(34,197,94,0.08)" : "rgba(124,58,237,0.08)",
                              color: ch.tousValides ? "#22C55E" : "#7C3AED",
                              fontFamily: "'Plus Jakarta Sans', sans-serif",
                            }}>
                              Parcours
                            </span>
                          </div>
                          <div style={{
                            fontWeight: 800, fontSize: 15,
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                            color: "var(--pb-on-surface)",
                          }}>
                            {ch.titre}
                          </div>
                          <div style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", marginTop: 4 }}>
                            {ch.tousValides
                              ? "✅ Tous les exercices validés · Évaluation disponible"
                              : ch.prochainExerciceTitre
                                ? <>
                                    <span style={{ fontWeight: 700, color: "#7C3AED" }}>Étape {ch.exerciceEnCoursOrdre} :</span>{" "}{ch.prochainExerciceTitre}
                                    {ch.prochainExerciceMinutes ? <span style={{ color: "var(--pb-on-surface-variant)" }}> · ~{ch.prochainExerciceMinutes} min</span> : null}
                                  </>
                                : ch.exerciceEnCoursOrdre != null
                                  ? `Exercice ${ch.exerciceEnCoursOrdre} sur ${ch.nbExercices}`
                                  : `${ch.nbExercices} exercice${ch.nbExercices > 1 ? "s" : ""}`}
                          </div>
                        </div>
                        <div style={{
                          width: 44, height: 44, borderRadius: 12,
                          background: ch.tousValides ? "rgba(34,197,94,0.1)" : "rgba(124,58,237,0.1)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          <span className="ms" style={{ fontSize: 24, color: ch.tousValides ? "#22C55E" : "#7C3AED" }}>
                            {ch.tousValides ? "verified" : "menu_book"}
                          </span>
                        </div>
                      </div>

                      {/* Barre de progression */}
                      <div style={{ marginTop: "auto" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: ch.tousValides ? "#22C55E" : "#7C3AED" }}>
                            {ch.nbValides}/{ch.nbExercices} validé{ch.nbValides > 1 ? "s" : ""}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: ch.tousValides ? "#22C55E" : "#7C3AED" }}>
                            {ch.pourcentage}%
                          </span>
                        </div>
                        <div style={{ height: 6, background: "rgba(0,0,0,0.06)", borderRadius: 100, overflow: "hidden", position: "relative" }}>
                          {/* Repères de paliers 25/50/75 % */}
                          {!ch.tousValides && [25, 50, 75].map((p) => (
                            <div key={p} style={{
                              position: "absolute", left: `${p}%`, top: 0, bottom: 0,
                              width: 2, background: "rgba(255,255,255,0.9)",
                            }} />
                          ))}
                          <div style={{
                            width: `${ch.pourcentage}%`, height: "100%",
                            background: ch.tousValides ? "#22C55E" : "#7C3AED",
                            borderRadius: 100, transition: "width 0.5s ease",
                          }} />
                        </div>
                        {/* Objectif de palier : prochain palier à atteindre */}
                        {!ch.tousValides && (() => {
                          const prochainPalier = [25, 50, 75, 100].find((p) => ch.pourcentage < p)!;
                          const cible = Math.ceil((prochainPalier / 100) * ch.nbExercices);
                          const restants = Math.max(1, cible - ch.nbValides);
                          return (
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", marginTop: 8 }}>
                              🎯 Plus que {restants} exercice{restants > 1 ? "s" : ""} pour atteindre {prochainPalier}&nbsp;%
                            </div>
                          );
                        })()}
                      </div>

                      {/* CTA */}
                      {!ch.tousValides && (
                        <span className="pb-btn primary-fill" style={{
                          fontSize: 13, padding: "8px 20px", borderRadius: 999,
                          alignSelf: "flex-start", marginTop: 14,
                          background: "#7C3AED", color: "#fff",
                        }}>
                          {ch.nbValides > 0 ? "Continuer" : "Commencer"} →
                        </span>
                      )}
                    </Link>
                  ))}

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
        <Link href="/eleve/bilan" className="pb-bottom-nav-item">
          <span className="ms" style={{ fontSize: 22 }}>bar_chart</span>
          Progression
        </Link>
        <button
          onClick={deconnecter}
          className="pb-bottom-nav-item"
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          <span className="ms" style={{ fontSize: 22 }}>logout</span>
          Quitter
        </button>
      </nav>

      {/* ── Choix des ceintures de la semaine ── */}
      {modalCeintures && choixSemaine && choixSemaine.disponibles.length > 0 && (
        <CeinturesSemaineModal
          disponibles={choixSemaine.disponibles}
          dejaChoisis={choixSemaine.domaines}
          onValider={enregistrerChoixSemaine}
          onFermer={() => setModalCeintures(false)}
        />
      )}

    </div>
  );
}
