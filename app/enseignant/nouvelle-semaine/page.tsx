"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import EnseignantLayout from "@/components/EnseignantLayout";
import { TYPE_BLOC_CONFIG, TypeBloc, AssignationSelecteur } from "@/types";
// AssignationSelector retiré — on utilise un sélecteur simplifié par bloc
import GenererExerciceForm from "@/components/GenererExerciceForm";
import GenererTexteATrousForm from "@/components/GenererTexteATrousForm";
import GenererClassementForm from "@/components/GenererClassementForm";
import GenererAnalysePhraseForm from "@/components/GenererAnalysePhraseForm";

// ── Types ──

interface BlocSemaine {
  id: string;
  type: TypeBloc;
  titre: string;
  jour: number; // 0=lundi, 1=mardi, 2=mercredi, 3=jeudi, 4=vendredi
  assignation: AssignationSelecteur;
  chapitreId?: string;
  contenu?: any;
}

interface StatsSemainePrecedente {
  tauxCompletion: number;
  totalBlocs: number;
  totalFaits: number;
  exercicesDifficiles: { titre: string; taux: number }[];
  elevesEnDifficulte: { prenom: string; taux: number }[];
}

// ── Config ──

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

const TYPES_DISPONIBLES: { type: TypeBloc; label: string; icon: string; color: string; description: string }[] = [
  { type: "exercice", label: "Exercice", icon: "edit_note", color: "#2563EB", description: "Questions-réponses" },
  { type: "lecture", label: "Lecture", icon: "auto_stories", color: "#7C3AED", description: "Texte + QCM" },
  { type: "dictee", label: "Dictée", icon: "headphones", color: "#DC2626", description: "Écoute et écris" },
  { type: "fichier_maths", label: "Fichier maths", icon: "calculate", color: "#0369A1", description: "Page du fichier" },
  { type: "lecon_copier", label: "Leçon à copier", icon: "menu_book", color: "#16A34A", description: "Copie sur cahier" },
  { type: "texte_a_trous", label: "Texte à trous", icon: "text_fields", color: "#D97706", description: "Compléter les trous" },
  { type: "classement", label: "Classement", icon: "category", color: "#0369A1", description: "Trier par catégories" },
  { type: "analyse_phrase", label: "Analyse phrase", icon: "schema", color: "#6D28D9", description: "Fonctions grammaticales" },
  { type: "ressource", label: "Podcast", icon: "podcasts", color: "#9333EA", description: "Audio + quiz" },
  { type: "ecriture", label: "Écriture", icon: "draw", color: "#7C3AED", description: "Rédaction libre" },
  { type: "repetibox", label: "Repetibox", icon: "style", color: "#8B5CF6", description: "Flashcards" },
];

const ASSIGNATION_VIDE: AssignationSelecteur = { groupeIds: [], eleveUids: [], groupeNoms: [] };

let nextId = 1;
function uid() { return `bloc_${nextId++}_${Date.now()}`; }

// ── Utilitaires dates ──

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Retourne la date du lundi (YYYY-MM-DD) pour la semaine courante + offset */
function getLundiSemaine(offset = 0): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff + offset * 7);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Formate une date string YYYY-MM-DD en "27 mars" */
function formatDateStr(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

/** Retourne la date YYYY-MM-DD pour un jour donné (0=lundi..4=vendredi) à partir du lundi */
function dateForJour(lundiStr: string, jour: number): string {
  const d = new Date(lundiStr + "T12:00:00");
  d.setDate(d.getDate() + jour);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// ── Composant principal ──

export default function NouvelleSemainePage() {
  const router = useRouter();
  const supabase = createClient();

  const [etape, setEtape] = useState<"resume" | "planifier" | "assignation" | "confirmation">("resume");
  const [blocs, setBlocs] = useState<BlocSemaine[]>([]);
  const [draggedType, setDraggedType] = useState<TypeBloc | null>(null);
  const [dragOverJour, setDragOverJour] = useState<number | null>(null);
  const [draggedBloc, setDraggedBloc] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsSemainePrecedente | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingBloc, setEditingBloc] = useState<string | null>(null);
  const [editTitre, setEditTitre] = useState("");
  const [assignationGlobale] = useState<AssignationSelecteur>(ASSIGNATION_VIDE);
  const [groupesPB, setGroupesPB] = useState<{ id: string; nom: string }[]>([]);
  const [modalBloc, setModalBloc] = useState<BlocSemaine | null>(null);
  const [modalAssignation, setModalAssignation] = useState<"classe" | string[]>("classe"); // "classe" ou tableau d'IDs de groupes
  const [modalTitre, setModalTitre] = useState("");
  const [modalReference, setModalReference] = useState("");
  const [modalContenu, setModalContenu] = useState("");
  const [modalUrl, setModalUrl] = useState("");
  const [chapitres, setChapitres] = useState<{ id: string; titre: string; matiere: string }[]>([]);
  const [modalChapitreId, setModalChapitreId] = useState("");
  const [banqueExos, setBanqueExos] = useState<{ id: string; titre: string; type: string; matiere?: string }[]>([]);
  const [showExoBanquePicker, setShowExoBanquePicker] = useState(false);
  const [showExoGenerateur, setShowExoGenerateur] = useState(false);
  const [exoRecherche, setExoRecherche] = useState("");
  const [exoFiltreMatiere, setExoFiltreMatiere] = useState("toutes");
  const [exoGenChargement, setExoGenChargement] = useState(false);
  const [exoGenErreur, setExoGenErreur] = useState("");
  const [modalBanqueId, setModalBanqueId] = useState("");
  const [dictees, setDictees] = useState<{ id: string; titre: string; theme: string; dictee_parent_id: string | null; batch_id: string | null; niveau_etoiles: number }[]>([]);
  const [dicteesBatches, setDicteesBatches] = useState<{ batchId: string; theme: string; nbJours: number; parentIds: string[] }[]>([]);
  const [modalDicteeBatchId, setModalDicteeBatchId] = useState("");
  const [modalDicteeTheme, setModalDicteeTheme] = useState("");
  const [modalDicteeId, setModalDicteeId] = useState("");
  const [lecons, setLecons] = useState<{ id: string; titre: string; matiere: string; url: string; annee: number | null }[]>([]);
  const [modalLeconId, setModalLeconId] = useState("");
  const [showLeconPicker, setShowLeconPicker] = useState(false);
  const [leconRecherche, setLeconRecherche] = useState("");
  const [leconFiltreMatiere, setLeconFiltreMatiere] = useState("toutes");
  const [leconFiltreAnnee, setLeconFiltreAnnee] = useState<0 | 1 | 2>(0);

  const [lundiProchain, setLundiProchain] = useState(() => getLundiSemaine(0));

  function semainePrecedente() {
    const d = new Date(lundiProchain + "T12:00:00");
    d.setDate(d.getDate() - 7);
    setLundiProchain(d.toISOString().split("T")[0]);
    setBlocs([]);
  }
  function semaineSuivante() {
    const d = new Date(lundiProchain + "T12:00:00");
    d.setDate(d.getDate() + 7);
    setLundiProchain(d.toISOString().split("T")[0]);
    setBlocs([]);
  }

  // ── Chargement données de référence ──
  useEffect(() => {
    supabase.from("chapitres").select("id, titre, matiere").order("matiere")
      .then(({ data }) => setChapitres(data ?? []));
    supabase.from("banque_exercices").select("id, titre, type, matiere").order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => setBanqueExos(data ?? []));
    fetch("/api/list-dictees").then((r) => r.json())
      .then((all: any[]) => {
        if (!Array.isArray(all)) return;
        setDictees(all);
        // Grouper par batch_id → compter les jours (parent_ids distincts)
        const batchMap = new Map<string, { theme: string; parentIds: Set<string> }>();
        for (const d of all) {
          const bid = d.batch_id ?? d.dictee_parent_id ?? d.id;
          if (!batchMap.has(bid)) {
            batchMap.set(bid, { theme: d.theme || d.titre, parentIds: new Set() });
          }
          batchMap.get(bid)!.parentIds.add(d.dictee_parent_id ?? d.id);
        }
        setDicteesBatches([...batchMap.entries()].map(([batchId, v]) => ({
          batchId,
          theme: v.theme,
          nbJours: v.parentIds.size,
          parentIds: [...v.parentIds],
        })));
      })
      .catch(() => {});
    fetch("/api/banque-lecons").then((r) => r.json())
      .then((data) => setLecons(Array.isArray(data) ? data : data.lecons ?? []))
      .catch(() => {});
    fetch("/api/admin/groupes").then((r) => r.json())
      .then((data) => {
        const grps = Array.isArray(data) ? data : data.groupes ?? [];
        setGroupesPB(grps.map((g: any) => ({ id: g.id, nom: g.nom })));
      })
      .catch(() => {});
  }, [supabase]);

  // ── Chargement stats + blocs existants ──
  useEffect(() => {
    async function charger() {
      await Promise.all([
        // Stats
        fetch(`/api/feedback?periode=semaine`)
          .then((r) => r.json())
          .then((data) => {
            setStats({
              tauxCompletion: data.stats?.tauxCompletion ?? 0,
              totalBlocs: data.stats?.totalBlocs ?? 0,
              totalFaits: data.stats?.totalFaits ?? 0,
              exercicesDifficiles: (data.exercices ?? [])
                .filter((e: any) => e.scoreMoyen !== null && e.scoreMoyen < 50)
                .map((e: any) => ({ titre: e.titre, taux: e.scoreMoyen }))
                .slice(0, 3),
              elevesEnDifficulte: [],
            });
          })
          .catch(() => {}),

        // Blocs de la semaine
        fetch(`/api/blocs-semaine?lundi=${lundiProchain}`)
          .then((r) => r.json())
          .then((blocsData) => {
            if (Array.isArray(blocsData.blocs) && blocsData.blocs.length > 0) {
              const existants = blocsData.blocs.map((b: any) => ({
                id: `existant_${b.type}_${b.titre}_${b.jour}`,
                type: b.type,
                titre: b.titre,
                jour: b.jour,
                assignation: { groupeIds: [], eleveUids: [], groupeNoms: [b.groupeLabel] },
                contenu: b.contenu,
                chapitreId: b.chapitreId,
                _existant: true,
                _date: b.date,
                _nbEleves: b.nbEleves,
                _nbFaits: b.nbFaits,
              }));
              setBlocs((prev) => {
                const existantIds = new Set(prev.filter((b: any) => b._existant).map((b: any) => b.id));
                const nouveaux = existants.filter((b: any) => !existantIds.has(b.id));
                return [...prev.filter((b: any) => !b._existant), ...nouveaux];
              });
            }
          })
          .catch(() => {}),
      ]);

      setLoading(false);
    }
    charger();
  }, [lundiProchain]);

  // ── Drag & Drop ──

  function handleDropOnJour(jour: number) {
    if (draggedType) {
      // Nouveau bloc depuis la bibliothèque
      const cfg = TYPE_BLOC_CONFIG[draggedType];
      setBlocs((prev) => [...prev, {
        id: uid(),
        type: draggedType,
        titre: cfg?.libelle ?? draggedType,
        jour,
        assignation: { groupeIds: groupesPB.map((g) => g.id), eleveUids: [], groupeNoms: groupesPB.map((g) => g.nom) },
      }]);
      setDraggedType(null);
    } else if (draggedBloc) {
      // Déplacer un bloc
      const blocOriginal = blocs.find((b) => b.id === draggedBloc);
      setBlocs((prev) => prev.map((b) => b.id === draggedBloc ? { ...b, jour } : b));

      // Si bloc existant en base, mettre à jour la date_assignation
      if (blocOriginal && (blocOriginal as any)._existant) {
        const dateStr = dateForJour(lundiProchain, jour);
        const ancienneDate = (blocOriginal as any)._date ?? "";

        console.log("[déplacer]", { jour, lundi: lundiProchain, type: blocOriginal.type, titre: blocOriginal.titre, ancienneDate, nouvelleDate: dateStr });
        fetch("/api/deplacer-bloc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: blocOriginal.type,
            titre: blocOriginal.titre,
            ancienneDate,
            nouvelleDate: dateStr,
          }),
        }).then(r => r.json()).then(j => console.log("[déplacer] résultat:", j)).catch(console.error);

        // Mettre à jour _date localement pour les prochains déplacements
        setBlocs((prev) => prev.map((b) =>
          b.id === draggedBloc ? { ...b, jour, _date: dateStr } as any : b
        ));
      }

      setDraggedBloc(null);
    }
    setDragOverJour(null);
  }

  async function supprimerBloc(id: string) {
    const bloc = blocs.find((b) => b.id === id);
    if (!bloc) return;

    // Si le bloc est déjà en base, le supprimer côté serveur
    if ((bloc as any)._existant && (bloc as any)._date) {
      await fetch("/api/admin/supprimer-bloc-planning", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: bloc.type, titre: bloc.titre, date: (bloc as any)._date }),
      });
    }

    setBlocs((prev) => prev.filter((b) => b.id !== id));
  }

  function dupliquerBloc(bloc: BlocSemaine) {
    setBlocs((prev) => [...prev, { ...bloc, id: uid() }]);
  }

  function startEditTitre(bloc: BlocSemaine) {
    setEditingBloc(bloc.id);
    setEditTitre(bloc.titre);
  }

  function saveEditTitre() {
    if (editingBloc && editTitre.trim()) {
      setBlocs((prev) => prev.map((b) => b.id === editingBloc ? { ...b, titre: editTitre.trim() } : b));
    }
    setEditingBloc(null);
  }

  // ── Modale édition bloc ──

  function ouvrirModale(bloc: BlocSemaine) {
    setModalBloc(bloc);
    setModalTitre(bloc.titre);
    setModalReference(bloc.contenu?.reference ?? bloc.contenu?.page ?? "");
    setModalContenu(bloc.contenu?.description ?? bloc.contenu?.texte ?? "");
    setModalUrl(bloc.contenu?.url ?? "");
    setModalChapitreId(bloc.chapitreId ?? "");
    setModalBanqueId("");
    setModalDicteeId(bloc.contenu?.dictee_id ?? "");
    setModalDicteeTheme(bloc.contenu?.theme ?? "");
    setModalDicteeBatchId(bloc.contenu?.batch_id ?? "");
    setModalLeconId(bloc.contenu?.lecon_id ?? "");
    // Initialiser l'assignation
    if (bloc.assignation.groupeIds.length > 0) {
      setModalAssignation(bloc.assignation.groupeIds);
    } else {
      setModalAssignation("classe");
    }
  }

  async function sauverModale() {
    if (!modalBloc) return;

    // Cas spécial dictée : Lundi=mots, Mardi=dictée, Jeudi=dictée, Vendredi=bilan (pas de bloc)
    if (modalBloc.type === "dictee" && modalDicteeBatchId) {
      const batch = dicteesBatches.find((b) => b.batchId === modalDicteeBatchId);
      if (!batch) { setModalBloc(null); return; }

      const titre = batch.theme;

      // Assignation
      const assignation: AssignationSelecteur = modalAssignation === "classe"
        ? { groupeIds: groupesPB.map((g) => g.id), eleveUids: [], groupeNoms: groupesPB.map((g) => g.nom) }
        : { groupeIds: modalAssignation as string[], eleveUids: [], groupeNoms: groupesPB.filter((g) => (modalAssignation as string[]).includes(g.id)).map((g) => g.nom) };

      // Charger les mots du premier parent pour le bloc Lundi
      let motsUniques: { mot: string; definition: string }[] = [];
      if (batch.parentIds[0]) {
        try {
          const res = await fetch(`/api/dictee-mots?parent_id=${batch.parentIds[0]}`);
          const data = await res.json();
          if (Array.isArray(data.mots)) motsUniques = data.mots;
        } catch { /* fallback : pas de mots */ }
      }

      // Créer les blocs : Lundi (mots), Mardi (dictée), Jeudi (dictée) — pas de vendredi
      setBlocs((prev) => {
        const without = prev.filter((b) => b.id !== modalBloc.id);
        const newBlocs: typeof prev = [];

        // Lundi — Mots de la semaine (premier parent)
        if (batch.parentIds[0]) {
          newBlocs.push({
            id: uid(),
            type: "mots" as TypeBloc,
            titre: `${titre} — Mots`,
            jour: 0, // lundi
            assignation,
            contenu: {
              dictee_parent_id: batch.parentIds[0],
              batch_id: batch.batchId,
              theme: batch.theme,
              mots_semaine: true,
              mots: motsUniques,
              titre_dictee: batch.theme,
            },
            chapitreId: modalChapitreId || undefined,
          });
        }

        // Mardi — Dictée d'entraînement (deuxième parent)
        if (batch.parentIds[1]) {
          newBlocs.push({
            id: uid(),
            type: "dictee" as TypeBloc,
            titre: `${titre} — Mardi`,
            jour: 1, // mardi
            assignation,
            contenu: {
              dictee_parent_id: batch.parentIds[1],
              batch_id: batch.batchId,
              theme: batch.theme,
            },
            chapitreId: modalChapitreId || undefined,
          });
        }

        // Jeudi — Dictée d'entraînement (troisième parent)
        if (batch.parentIds[2]) {
          newBlocs.push({
            id: uid(),
            type: "dictee" as TypeBloc,
            titre: `${titre} — Jeudi`,
            jour: 3, // jeudi
            assignation,
            contenu: {
              dictee_parent_id: batch.parentIds[2],
              batch_id: batch.batchId,
              theme: batch.theme,
            },
            chapitreId: modalChapitreId || undefined,
          });
        }

        // Vendredi — Dictée bilan : pas de bloc élève (en classe)

        return [...without, ...newBlocs];
      });
      setModalBloc(null);
      return;
    }

    setBlocs((prev) => prev.map((b) => {
      if (b.id !== modalBloc.id) return b;

      const contenu: any = { ...(b.contenu ?? {}) };

      switch (b.type) {
        case "fichier_maths":
          contenu.page = modalReference;
          break;
        case "lecon_copier":
          contenu.reference = modalReference;
          contenu.description = modalContenu;
          if (modalLeconId) {
            contenu.lecon_id = modalLeconId;
            const lecon = lecons.find((l) => l.id === modalLeconId);
            if (lecon?.url) contenu.url = lecon.url;
          }
          break;
        case "dictee":
          if (modalDicteeId) contenu.dictee_id = modalDicteeId;
          break;
        case "ressource":
          contenu.url = modalUrl;
          contenu.description = modalContenu;
          break;
        case "ecriture":
          contenu.description = modalContenu;
          break;
        default:
          contenu.description = modalContenu;
          break;
      }

      // Assignation
      const assignation: AssignationSelecteur = modalAssignation === "classe"
        ? { groupeIds: groupesPB.map((g) => g.id), eleveUids: [], groupeNoms: groupesPB.map((g) => g.nom) }
        : { groupeIds: modalAssignation, eleveUids: [], groupeNoms: groupesPB.filter((g) => (modalAssignation as string[]).includes(g.id)).map((g) => g.nom) };

      return {
        ...b,
        titre: modalTitre.trim() || b.titre,
        contenu,
        chapitreId: modalChapitreId || undefined,
        assignation,
      };
    }));
    setModalBloc(null);
  }

  function chargerDepuisBanque(exoId: string) {
    const exo = banqueExos.find((e) => e.id === exoId);
    if (exo) {
      setModalTitre(exo.titre ?? "");
      setModalBanqueId(exoId);
    }
  }

  async function genererEtSauvegarder(params: any) {
    setExoGenChargement(true);
    setExoGenErreur("");
    try {
      const type = params.type as string;
      let contenuData: any;

      // ── Manuel : texte à trous ──
      if (type === "texte_a_trous" && params.mode === "manuel" && params.texteManuel) {
        const regex = /\[([^\]]+)\]/g;
        const texteComplet = params.texteManuel.replace(regex, "$1");
        const mots = texteComplet.split(/\s+/);
        const trous: { position: number; mot: string }[] = [];
        let motIdx = 0;
        for (const part of params.texteManuel.split(/(\[[^\]]+\])/)) {
          if (part.startsWith("[") && part.endsWith("]")) {
            trous.push({ position: motIdx, mot: part.slice(1, -1) });
            motIdx++;
          } else {
            motIdx += part.trim().split(/\s+/).filter(Boolean).length;
          }
        }
        contenuData = { titre: "Texte à trous", consigne: "Complète les mots manquants.", texte_complet: texteComplet, trous };
      }
      // ── Manuel : classement ──
      else if (type === "classement" && params.mode === "manuel" && params.texteManuel) {
        const items = params.texteManuel.split("\n").filter((l: string) => l.trim()).map((l: string) => {
          const [texte, categorie] = l.split("|").map((s: string) => s.trim());
          return { texte: texte || l.trim(), categorie: categorie || "" };
        }).filter((i: any) => i.texte && i.categorie);
        if (items.length === 0) { setExoGenErreur("Format invalide. Utilise : élément | catégorie"); setExoGenChargement(false); return; }
        contenuData = { titre: "Classement", consigne: "Classe chaque élément dans la bonne catégorie.", categories: params.categories, items };
      }
      // ── Manuel : analyse de phrase ──
      else if (type === "analyse_phrase" && params.mode === "manuel" && params.texteManuel) {
        const lignes = params.texteManuel.split("\n").filter((l: string) => l.trim());
        const phrases = lignes.map((ligne: string) => {
          const groupes: { mots: string; fonction: string; debut: number; fin: number }[] = [];
          const texteComplet = ligne.replace(/\[([^|]+)\|([^\]]+)\]/g, "$1");
          const mots = texteComplet.split(/\s+/);
          const regex = /\[([^|]+)\|([^\]]+)\]/g;
          let match;
          while ((match = regex.exec(ligne)) !== null) {
            const motsDuGroupe = match[1].trim();
            const debut = mots.findIndex((m: string, i: number) => mots.slice(i, i + motsDuGroupe.split(/\s+/).length).join(" ").replace(/[.,;:!?]/g, "") === motsDuGroupe.replace(/[.,;:!?]/g, ""));
            if (debut >= 0) groupes.push({ mots: motsDuGroupe, fonction: match[2].trim(), debut, fin: debut + motsDuGroupe.split(/\s+/).length - 1 });
          }
          return { texte: texteComplet, groupes };
        });
        contenuData = { titre: "Analyse grammaticale", consigne: "Identifie les fonctions des groupes de mots.", phrases };
      }
      // ── Mode IA ──
      else {
        const endpoints: Record<string, string> = {
          exercice: "/api/generer-exercice",
          texte_a_trous: "/api/generer-texte-a-trous",
          classement: "/api/generer-classement",
          analyse_phrase: "/api/generer-analyse-phrase",
          lecture: "/api/generer-lecture",
        };
        const endpoint = endpoints[type];
        if (!endpoint) { setExoGenErreur("Type non supporté."); setExoGenChargement(false); return; }
        const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) });
        const json = await res.json();
        if (!res.ok || json.erreur) { setExoGenErreur(json.erreur ?? "Erreur lors de la génération."); setExoGenChargement(false); return; }
        contenuData = json.resultat;
      }

      // ── Sauvegarde dans la banque ──
      const titre = params.titre || TYPE_BLOC_CONFIG[type as TypeBloc]?.libelle || type;
      const resB = await fetch("/api/admin/exercices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, matiere: params.matiere ?? null, titre: type === "exercice" ? titre : titre, contenu: contenuData }),
      });
      const jsonB = await resB.json();
      if (!resB.ok || !jsonB.id) { setExoGenErreur("Exercice généré, mais erreur de sauvegarde."); setExoGenChargement(false); return; }

      // ── Sélection dans la modale ──
      const nouvelExo = { id: jsonB.id, titre, type, matiere: params.matiere };
      setBanqueExos((prev) => [nouvelExo, ...prev]);
      setModalBanqueId(jsonB.id);
      setModalTitre(titre);
      setShowExoGenerateur(false);
    } catch {
      setExoGenErreur("Erreur réseau.");
    } finally {
      setExoGenChargement(false);
    }
  }

  // ── Ajout rapide ──

  function ajouterBloc(jour: number, type: TypeBloc) {
    const cfg = TYPE_BLOC_CONFIG[type];
    setBlocs((prev) => [...prev, {
      id: uid(),
      type,
      titre: cfg?.libelle ?? type,
      jour,
      assignation: { groupeIds: groupesPB.map((g) => g.id), eleveUids: [], groupeNoms: groupesPB.map((g) => g.nom) },
    }]);
  }

  // ── Sauvegarde ──

  const sauvegarder = useCallback(async () => {
    if (blocs.length === 0) return;
    setSaving(true);

    try {
      const res = await fetch("/api/planifier-semaine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lundi: lundiProchain,
          blocs: blocs
            .filter((b) => !(b as any)._existant) // Ne pas renvoyer les blocs déjà en base
            .map((b) => ({
              type: b.type,
              titre: b.titre,
              jour: b.jour,
              assignation: b.assignation.groupeIds.length > 0 || b.assignation.eleveUids.length > 0
                ? b.assignation
                : assignationGlobale,
              chapitreId: b.chapitreId,
              contenu: b.contenu,
            })),
        }),
      });

      if (res.ok) {
        setEtape("confirmation");
      } else {
        const data = await res.json();
        alert(`Erreur : ${data.error ?? "Impossible de planifier"}`);
      }
    } catch {
      alert("Erreur réseau");
    }
    setSaving(false);
  }, [blocs, lundiProchain, assignationGlobale]);

  // ── Rendu ──

  if (loading) {
    return (
      <EnseignantLayout>
        <div className="page">
          <div className="container" style={{ padding: 40, textAlign: "center" }}>
            <div className="skeleton" style={{ height: 200, borderRadius: 16 }} />
          </div>
        </div>
      </EnseignantLayout>
    );
  }

  return (
    <EnseignantLayout>
      <div className="page">
        <div className="container" style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1200 }}>

          {/* ── Header ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", display: "flex", alignItems: "center", gap: 10 }}>
                <span className="ms" style={{ fontSize: 28, color: "var(--pb-primary)" }}>date_range</span>
                Planifier la semaine
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <button onClick={semainePrecedente} style={{ background: "none", border: "1px solid var(--pb-outline-variant,#ddd)", borderRadius: 6, cursor: "pointer", padding: "2px 8px", fontSize: 16, lineHeight: 1 }}>‹</button>
                <span style={{ color: "var(--pb-on-surface-variant)", fontSize: "0.875rem" }}>
                  Semaine du {formatDateStr(lundiProchain)} au {formatDateStr(dateForJour(lundiProchain, 4))}
                </span>
                <button onClick={semaineSuivante} style={{ background: "none", border: "1px solid var(--pb-outline-variant,#ddd)", borderRadius: 6, cursor: "pointer", padding: "2px 8px", fontSize: 16, lineHeight: 1 }}>›</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => router.push("/enseignant/dashboard")} className="pb-btn"
                style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="ms" style={{ fontSize: 18 }}>arrow_back</span> Retour
              </button>
            </div>
          </div>

          {/* ── Étape 1 : Résumé ── */}
          {etape === "resume" && stats && (
            <div className="ens-student-card" style={{ padding: 24 }}>
              <h2 style={{ fontWeight: 700, fontSize: "1.125rem", fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <span className="ms" style={{ fontSize: 22, color: "var(--pb-primary)" }}>analytics</span>
                Bilan de cette semaine
              </h2>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
                <div style={{ textAlign: "center", padding: 16, background: "rgba(0,80,212,0.04)", borderRadius: 12 }}>
                  <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-primary)" }}>
                    {stats.tauxCompletion}%
                  </div>
                  <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", fontWeight: 600 }}>Complétion</div>
                </div>
                <div style={{ textAlign: "center", padding: 16, background: "rgba(22,163,74,0.04)", borderRadius: 12 }}>
                  <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#16A34A" }}>
                    {stats.totalFaits}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", fontWeight: 600 }}>Blocs terminés</div>
                </div>
                <div style={{ textAlign: "center", padding: 16, background: "rgba(217,119,6,0.04)", borderRadius: 12 }}>
                  <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#D97706" }}>
                    {stats.totalBlocs}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", fontWeight: 600 }}>Total assignés</div>
                </div>
              </div>

              {stats.exercicesDifficiles.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#DC2626", marginBottom: 8 }}>
                    <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>warning</span> Exercices à retravailler
                  </p>
                  {stats.exercicesDifficiles.map((ex, i) => (
                    <div key={i} style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", padding: "4px 0" }}>
                      • {ex.titre} — {ex.taux}% de réussite
                    </div>
                  ))}
                </div>
              )}

              <button onClick={() => { setEtape("planifier"); semaineSuivante(); }} className="pb-btn primary"
                style={{ width: "100%", padding: "14px", fontSize: "1rem", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span className="ms" style={{ fontSize: 20 }}>arrow_forward</span>
                Planifier la semaine prochaine
              </button>
            </div>
          )}

          {/* ── Étape 2 : Planificateur ── */}
          {etape === "planifier" && (
            <>
              <div style={{ display: "flex", gap: 16 }}>
                {/* ── Bibliothèque (gauche) ── */}
                <div style={{ width: 200, flexShrink: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--pb-on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                    Bibliothèque
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {TYPES_DISPONIBLES.map((t) => (
                      <div
                        key={t.type}
                        draggable
                        onDragStart={() => setDraggedType(t.type)}
                        onDragEnd={() => setDraggedType(null)}
                        style={{
                          padding: "8px 10px", borderRadius: 10,
                          background: "white", border: "1px solid var(--pb-outline-variant, #ddd)",
                          cursor: "grab", display: "flex", alignItems: "center", gap: 8,
                          fontSize: 13, fontWeight: 600, color: "var(--pb-on-surface)",
                          transition: "all 0.15s", userSelect: "none",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = t.color; e.currentTarget.style.boxShadow = `0 2px 8px ${t.color}20`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--pb-outline-variant, #ddd)"; e.currentTarget.style.boxShadow = "none"; }}
                      >
                        <span className="ms" style={{ fontSize: 18, color: t.color }}>{t.icon}</span>
                        <div>
                          <div>{t.label}</div>
                          <div style={{ fontSize: 10, fontWeight: 400, color: "var(--pb-on-surface-variant)" }}>{t.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Grille semaine (droite) ── */}
                <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10, minWidth: 0 }}>
                  {JOURS.map((jour, ji) => {
                    const blocsJour = blocs.filter((b) => b.jour === ji);
                    const isOver = dragOverJour === ji;
                    const dateJourStr = dateForJour(lundiProchain, ji);
                    const dateJour = new Date(dateJourStr + "T12:00:00");

                    return (
                      <div
                        key={ji}
                        onDragOver={(e) => { e.preventDefault(); setDragOverJour(ji); }}
                        onDragLeave={() => setDragOverJour(null)}
                        onDrop={(e) => { e.preventDefault(); handleDropOnJour(ji); }}
                        style={{
                          minHeight: 300,
                          borderRadius: 14,
                          border: isOver ? "2px solid var(--pb-primary)" : "1px solid var(--pb-outline-variant, #ddd)",
                          background: isOver ? "rgba(0,80,212,0.04)" : "var(--pb-surface-container-lowest, white)",
                          transition: "all 0.2s",
                          display: "flex", flexDirection: "column",
                        }}
                      >
                        {/* Header jour */}
                        <div style={{
                          padding: "10px 12px",
                          borderBottom: "1px solid var(--pb-outline-variant, #eee)",
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                        }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)" }}>{jour}</div>
                            <div style={{ fontSize: 11, color: "var(--pb-on-surface-variant)" }}>{dateJour.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
                          </div>
                          <span style={{
                            fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "2px 8px",
                            background: blocsJour.length > 0 ? "rgba(0,80,212,0.1)" : "transparent",
                            color: blocsJour.length > 0 ? "var(--pb-primary)" : "var(--pb-on-surface-variant)",
                          }}>
                            {blocsJour.length > 0 ? blocsJour.length : ""}
                          </span>
                        </div>

                        {/* Blocs */}
                        <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                          {blocsJour.map((bloc) => {
                            const cfg = TYPE_BLOC_CONFIG[bloc.type];
                            const isExistant = (bloc as any)._existant === true;
                            const nbEleves = (bloc as any)._nbEleves ?? 0;
                            const nbFaits = (bloc as any)._nbFaits ?? 0;
                            return (
                              <div
                                key={bloc.id}
                                draggable
                                onDragStart={() => setDraggedBloc(bloc.id)}
                                onDragEnd={() => setDraggedBloc(null)}
                                style={{
                                  padding: "8px 10px", borderRadius: 8,
                                  background: isExistant ? `${cfg?.couleur ?? "#666"}08` : `${cfg?.couleur ?? "#666"}10`,
                                  border: isExistant ? `1.5px solid ${cfg?.couleur ?? "#666"}25` : `1px solid ${cfg?.couleur ?? "#666"}30`,
                                  cursor: "grab", position: "relative",
                                  opacity: draggedBloc === bloc.id ? 0.4 : isExistant ? 0.85 : 1,
                                  transition: "opacity 0.15s",
                                  borderLeft: isExistant ? `3px solid ${cfg?.couleur ?? "#666"}` : undefined,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                  <span className="ms" style={{ fontSize: 14, color: cfg?.couleur }}>{cfg?.icone}</span>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: cfg?.couleur, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                    {cfg?.libelle}
                                  </span>
                                </div>

                                {editingBloc === bloc.id ? (
                                  <input
                                    value={editTitre}
                                    onChange={(e) => setEditTitre(e.target.value)}
                                    onBlur={saveEditTitre}
                                    onKeyDown={(e) => { if (e.key === "Enter") saveEditTitre(); }}
                                    autoFocus
                                    style={{ fontSize: 12, fontWeight: 600, border: "1px solid var(--pb-primary)", borderRadius: 4, padding: "2px 4px", width: "100%" }}
                                  />
                                ) : (
                                  <div
                                    onClick={(e) => { e.stopPropagation(); ouvrirModale(bloc); }}
                                    style={{ fontSize: 12, fontWeight: 600, color: "var(--pb-on-surface)", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                    title="Cliquer pour configurer"
                                  >
                                    {bloc.titre}
                                    {(bloc.contenu?.reference || bloc.contenu?.page) && (
                                      <span style={{ fontSize: 10, color: "var(--pb-on-surface-variant)", display: "block", fontWeight: 400 }}>
                                        {bloc.contenu?.reference ?? bloc.contenu?.page}
                                      </span>
                                    )}
                                    <span style={{ fontSize: 9, color: "var(--pb-on-surface-variant)", display: "block", fontWeight: 500, marginTop: 2, opacity: 0.7 }}>
                                      {bloc.assignation.groupeNoms.length > 0 ? bloc.assignation.groupeNoms.join(", ") : "Classe entière"}
                                    </span>
                                    {isExistant && nbEleves > 0 && (
                                      <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                                        <div style={{ flex: 1, height: 3, background: "var(--pb-outline-variant, #ddd)", borderRadius: 999 }}>
                                          <div style={{ height: "100%", borderRadius: 999, background: cfg?.couleur ?? "#666", width: `${(nbFaits / nbEleves) * 100}%` }} />
                                        </div>
                                        <span style={{ fontSize: 9, color: "var(--pb-on-surface-variant)", fontWeight: 600, whiteSpace: "nowrap" }}>
                                          {nbFaits}/{nbEleves}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Actions */}
                                <div style={{ position: "absolute", top: -6, right: -6, display: "flex", gap: 2 }}>
                                  {!isExistant && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); dupliquerBloc(bloc); }}
                                      title="Dupliquer"
                                      style={{ background: "none", border: "none", cursor: "pointer", padding: 2, borderRadius: 4, display: "flex" }}
                                    >
                                      <span className="ms" style={{ fontSize: 14, color: "var(--pb-on-surface-variant)" }}>content_copy</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); supprimerBloc(bloc.id); }}
                                    title="Supprimer ce bloc"
                                    style={{
                                      width: 18, height: 18, borderRadius: "50%",
                                      background: "#DC2626", border: "2px solid white",
                                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                                      boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                                      transition: "transform 0.15s, background 0.15s",
                                      padding: 0,
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.2)"; e.currentTarget.style.background = "#B91C1C"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = "#DC2626"; }}
                                  >
                                    <span className="ms" style={{ fontSize: 11, color: "white", lineHeight: 1 }}>close</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {/* Zone vide */}
                          {blocsJour.length === 0 && !isOver && (
                            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--pb-on-surface-variant)", fontSize: 12, opacity: 0.5, textAlign: "center", padding: 16 }}>
                              Glisse un bloc ici
                            </div>
                          )}

                          {/* Bouton + rapide */}
                          <div style={{ position: "relative" }}>
                            <button
                              onClick={(e) => {
                                const menu = e.currentTarget.nextElementSibling as HTMLElement;
                                if (menu) menu.style.display = menu.style.display === "none" ? "flex" : "none";
                              }}
                              style={{
                                width: "100%", padding: "6px", borderRadius: 8,
                                border: "1px dashed var(--pb-outline-variant, #ccc)",
                                background: "transparent", cursor: "pointer",
                                fontSize: 18, color: "var(--pb-on-surface-variant)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                transition: "all 0.15s",
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--pb-primary)"; e.currentTarget.style.color = "var(--pb-primary)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--pb-outline-variant, #ccc)"; e.currentTarget.style.color = "var(--pb-on-surface-variant)"; }}
                            >
                              +
                            </button>
                            <div style={{
                              display: "none", flexDirection: "column", gap: 2,
                              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                              background: "white", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                              padding: 6, marginTop: 4, maxHeight: 250, overflowY: "auto",
                            }}>
                              {TYPES_DISPONIBLES.map((t) => (
                                <button
                                  key={t.type}
                                  onClick={(e) => {
                                    ajouterBloc(ji, t.type);
                                    const menu = (e.currentTarget.parentElement as HTMLElement);
                                    menu.style.display = "none";
                                  }}
                                  style={{
                                    padding: "6px 8px", borderRadius: 6, border: "none",
                                    background: "transparent", cursor: "pointer",
                                    display: "flex", alignItems: "center", gap: 6,
                                    fontSize: 12, fontWeight: 500, color: "var(--pb-on-surface)",
                                    transition: "background 0.1s",
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = `${t.color}10`)}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                >
                                  <span className="ms" style={{ fontSize: 16, color: t.color }}>{t.icon}</span>
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Barre d'action */}
              <div style={{
                position: "sticky", bottom: 0, zIndex: 20,
                background: "white", borderTop: "1px solid var(--pb-outline-variant, #eee)",
                padding: "16px 0", display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ fontSize: 14, color: "var(--pb-on-surface-variant)" }}>
                  <strong style={{ color: "var(--pb-on-surface)" }}>{blocs.length}</strong> blocs planifiés sur{" "}
                  <strong style={{ color: "var(--pb-on-surface)" }}>{new Set(blocs.map((b) => b.jour)).size}</strong> jours
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setEtape("resume")} className="pb-btn">
                    ← Retour
                  </button>
                  <button
                    onClick={sauvegarder}
                    disabled={blocs.length === 0 || saving}
                    className="pb-btn primary"
                    style={{ padding: "10px 28px", fontSize: "0.9375rem", borderRadius: 10, display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span className="ms" style={{ fontSize: 18 }}>check_circle</span>
                    {saving ? "Planification..." : "Planifier la semaine"}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── Étape 4 : Confirmation ── */}
          {etape === "confirmation" && (
            <div style={{ textAlign: "center", padding: "3rem 0" }}>
              <span className="ms" style={{ fontSize: 64, color: "#16A34A" }}>check_circle</span>
              <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "1.5rem", marginTop: 16, color: "var(--pb-on-surface)" }}>
                Semaine planifiée !
              </h2>
              <p style={{ color: "var(--pb-on-surface-variant)", marginTop: 8, fontSize: "0.9375rem" }}>
                {blocs.length} blocs ont été assignés pour la semaine du {formatDateStr(lundiProchain)}.
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24 }}>
                <button onClick={() => router.push("/enseignant/dashboard")} className="pb-btn primary"
                  style={{ padding: "12px 24px", borderRadius: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="ms" style={{ fontSize: 18 }}>dashboard</span>
                  Retour au tableau de bord
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Modale édition bloc ── */}
        {modalBloc && (() => {
          const cfg = TYPE_BLOC_CONFIG[modalBloc.type];
          const t = modalBloc.type;
          const isExoType = ["exercice", "texte_a_trous", "analyse_phrase", "classement", "lecture"].includes(t);

          return (
            <div
              onClick={() => setModalBloc(null)}
              style={{
                position: "fixed", inset: 0, zIndex: 100,
                background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 24,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: "white", borderRadius: 20,
                  width: "100%", maxWidth: 560, maxHeight: "85vh",
                  overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
                }}
              >
                {/* Header */}
                <div style={{
                  padding: "20px 24px", borderBottom: "1px solid var(--pb-outline-variant, #eee)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="ms" style={{ fontSize: 24, color: cfg?.couleur }}>{cfg?.icone}</span>
                    <div>
                      <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "1.125rem", margin: 0 }}>
                        Configurer le bloc
                      </h3>
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                        color: cfg?.couleur, background: `${cfg?.couleur}15`, padding: "2px 8px", borderRadius: 999,
                      }}>
                        {cfg?.libelle}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => setModalBloc(null)} style={{
                    width: 36, height: 36, borderRadius: "50%", background: "var(--pb-surface-container, #f3f4f6)",
                    border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span className="ms" style={{ fontSize: 20 }}>close</span>
                  </button>
                </div>

                {/* Contenu */}
                <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

                  {/* Titre */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface)", display: "block", marginBottom: 6 }}>
                      Titre
                    </label>
                    <input
                      className="form-input"
                      value={modalTitre}
                      onChange={(e) => setModalTitre(e.target.value)}
                      placeholder={cfg?.libelle}
                      style={{ marginBottom: 0 }}
                    />
                  </div>

                  {/* ── Champs selon le type ── */}

                  {/* Fichier de maths → Page */}
                  {t === "fichier_maths" && (
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface)", display: "block", marginBottom: 6 }}>
                        Page du fichier
                      </label>
                      <input
                        className="form-input"
                        value={modalReference}
                        onChange={(e) => setModalReference(e.target.value)}
                        placeholder="Ex : Page 143"
                        style={{ marginBottom: 0 }}
                      />
                    </div>
                  )}

                  {/* Leçon à copier → Banque + Référence + description */}
                  {t === "lecon_copier" && (
                    <>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface)", display: "block", marginBottom: 6 }}>
                          Leçon
                        </label>
                        {modalLeconId ? (
                          <div style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "10px 14px", borderRadius: 10, background: "rgba(22,163,74,0.06)",
                            border: "1px solid rgba(22,163,74,0.2)",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span className="ms" style={{ fontSize: 18, color: "#16A34A" }}>check_circle</span>
                              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--pb-on-surface)" }}>
                                {lecons.find((l) => l.id === modalLeconId)?.titre ?? modalReference}
                              </span>
                            </div>
                            <button onClick={() => { setModalLeconId(""); setShowLeconPicker(true); }}
                              style={{ fontSize: 12, color: "var(--pb-primary)", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>
                              Changer
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setLeconRecherche(""); setLeconFiltreMatiere("toutes"); setLeconFiltreAnnee(0); setShowLeconPicker(true); }}
                            className="pb-btn"
                            style={{ width: "100%", padding: "12px", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                          >
                            <span className="ms" style={{ fontSize: 18, color: "var(--pb-primary)" }}>menu_book</span>
                            Choisir dans la banque de leçons
                          </button>
                        )}
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface)", display: "block", marginBottom: 6 }}>
                          {modalLeconId ? "Référence affichée" : "Ou saisir une référence manuellement"}
                        </label>
                        <input
                          className="form-input"
                          value={modalReference}
                          onChange={(e) => setModalReference(e.target.value)}
                          placeholder="Ex : H3 - Les grandes découvertes"
                          style={{ marginBottom: 0 }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface)", display: "block", marginBottom: 6 }}>
                          Consigne (optionnel)
                        </label>
                        <textarea
                          className="form-input"
                          value={modalContenu}
                          onChange={(e) => setModalContenu(e.target.value)}
                          placeholder="Ex : Copier la leçon dans le cahier bleu"
                          rows={2}
                          style={{ marginBottom: 0, resize: "vertical" }}
                        />
                      </div>
                    </>
                  )}

                  {/* Dictée → Choix du thème + répartition automatique */}
                  {t === "dictee" && (
                    <>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface)", display: "block", marginBottom: 6 }}>
                          Thème de la dictée
                        </label>
                        {dicteesBatches.length > 0 ? (
                          <>
                            <select className="form-input" value={modalDicteeBatchId} onChange={(e) => {
                              const bid = e.target.value;
                              setModalDicteeBatchId(bid);
                              const batch = dicteesBatches.find((b) => b.batchId === bid);
                              if (batch) {
                                setModalDicteeTheme(batch.theme);
                                setModalTitre(batch.theme);
                              }
                            }} style={{ marginBottom: 0 }}>
                              <option value="">Sélectionner un thème...</option>
                              {dicteesBatches.map((b) => (
                                <option key={b.batchId} value={b.batchId}>
                                  {b.theme} ({b.nbJours} jour{b.nbJours > 1 ? "s" : ""})
                                </option>
                              ))}
                            </select>
                            <div style={{
                              marginTop: 10, padding: "10px 14px", borderRadius: 10,
                              background: "rgba(0,80,212,0.04)", border: "1px solid rgba(0,80,212,0.1)",
                              fontSize: 12, color: "var(--pb-on-surface-variant)", lineHeight: 1.6,
                              display: "flex", alignItems: "flex-start", gap: 8,
                            }}>
                              <span className="ms" style={{ fontSize: 16, color: "var(--pb-primary)", flexShrink: 0, marginTop: 1 }}>info</span>
                              <span>
                                {(() => {
                                  const batch = dicteesBatches.find((b) => b.batchId === modalDicteeBatchId);
                                  const nbJ = batch?.nbJours ?? 0;
                                  return nbJ > 0
                                    ? `Lundi : dictée de mots · Mardi : dictée d'entraînement · Jeudi : dictée d'entraînement · Vendredi : dictée bilan (en classe). Chaque élève reçoit sa dictée au bon niveau (⭐).`
                                    : "Sélectionne un thème ci-dessus.";
                                })()}
                              </span>
                            </div>
                          </>
                        ) : (
                          <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)" }}>
                            Aucune dictée créée. Crée-en une dans la section Dictées.
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  {/* Podcast / Ressource → URL + description */}
                  {t === "ressource" && (
                    <>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface)", display: "block", marginBottom: 6 }}>
                          URL de la ressource
                        </label>
                        <input
                          className="form-input"
                          type="url"
                          value={modalUrl}
                          onChange={(e) => setModalUrl(e.target.value)}
                          placeholder="https://..."
                          style={{ marginBottom: 0 }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface)", display: "block", marginBottom: 6 }}>
                          Description (optionnel)
                        </label>
                        <textarea
                          className="form-input"
                          value={modalContenu}
                          onChange={(e) => setModalContenu(e.target.value)}
                          placeholder="Décris ce que les élèves doivent faire..."
                          rows={2}
                          style={{ marginBottom: 0, resize: "vertical" }}
                        />
                      </div>
                    </>
                  )}

                  {/* Écriture → Description du thème */}
                  {t === "ecriture" && (
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface)", display: "block", marginBottom: 6 }}>
                        Thème d&apos;écriture
                      </label>
                      <textarea
                        className="form-input"
                        value={modalContenu}
                        onChange={(e) => setModalContenu(e.target.value)}
                        placeholder="Ex : Raconte l'histoire d'un animal qui parle..."
                        rows={3}
                        style={{ marginBottom: 0, resize: "vertical" }}
                      />
                    </div>
                  )}

                  {/* Exercices interactifs → Banque ou Générateur IA */}
                  {isExoType && (
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface)", display: "block", marginBottom: 8 }}>
                        Contenu de l&apos;exercice
                      </label>
                      {modalBanqueId ? (
                        <div style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "10px 14px", borderRadius: 10,
                          background: "rgba(22,163,74,0.06)", border: "1px solid rgba(22,163,74,0.2)",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span className="ms" style={{ fontSize: 18, color: "#16A34A" }}>check_circle</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--pb-on-surface)" }}>
                              {banqueExos.find((e) => e.id === modalBanqueId)?.titre ?? modalTitre}
                            </span>
                          </div>
                          <button
                            onClick={() => { setModalBanqueId(""); setExoRecherche(""); setExoFiltreMatiere("toutes"); setShowExoBanquePicker(true); }}
                            style={{ fontSize: 12, color: "var(--pb-primary)", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}
                          >
                            Changer
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <button
                            onClick={() => { setExoRecherche(""); setExoFiltreMatiere("toutes"); setShowExoBanquePicker(true); }}
                            className="pb-btn"
                            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 10, width: "100%" }}
                          >
                            <span className="ms" style={{ fontSize: 18, color: "var(--pb-primary)" }}>library_books</span>
                            Choisir dans la banque
                          </button>
                          <button
                            onClick={() => { setExoGenErreur(""); setShowExoGenerateur(true); }}
                            className="pb-btn"
                            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 10, width: "100%" }}
                          >
                            <span className="ms" style={{ fontSize: 18, color: "#7C3AED" }}>auto_awesome</span>
                            Créer avec l&apos;IA
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Repetibox — pas de config */}
                  {t === "repetibox" && (
                    <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", fontStyle: "italic" }}>
                      Les révisions Repetibox sont automatiquement configurées pour chaque élève.
                    </p>
                  )}

                  {/* Assignation */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface)", display: "block", marginBottom: 8 }}>
                      Assigner à
                    </label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => setModalAssignation("classe")}
                        style={{
                          padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                          border: modalAssignation === "classe" ? "2px solid var(--pb-primary)" : "1.5px solid var(--pb-outline-variant, #ddd)",
                          background: modalAssignation === "classe" ? "rgba(0,80,212,0.08)" : "white",
                          color: modalAssignation === "classe" ? "var(--pb-primary)" : "var(--pb-on-surface-variant)",
                          cursor: "pointer", transition: "all 0.15s",
                          display: "flex", alignItems: "center", gap: 6,
                        }}
                      >
                        <span className="ms" style={{ fontSize: 16 }}>groups</span>
                        Classe entière
                      </button>
                      {groupesPB.map((g) => {
                        const isSelected = Array.isArray(modalAssignation) && modalAssignation.includes(g.id);
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => {
                              if (modalAssignation === "classe") {
                                setModalAssignation([g.id]);
                              } else {
                                const arr = modalAssignation as string[];
                                if (isSelected) {
                                  const next = arr.filter((id) => id !== g.id);
                                  setModalAssignation(next.length === 0 ? "classe" : next);
                                } else {
                                  setModalAssignation([...arr, g.id]);
                                }
                              }
                            }}
                            style={{
                              padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                              border: isSelected ? "2px solid var(--pb-primary)" : "1.5px solid var(--pb-outline-variant, #ddd)",
                              background: isSelected ? "rgba(0,80,212,0.08)" : "white",
                              color: isSelected ? "var(--pb-primary)" : "var(--pb-on-surface-variant)",
                              cursor: "pointer", transition: "all 0.15s",
                            }}
                          >
                            {g.nom}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Chapitre */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface)", display: "block", marginBottom: 6 }}>
                      Chapitre (optionnel)
                    </label>
                    <select className="form-input" value={modalChapitreId} onChange={(e) => setModalChapitreId(e.target.value)} style={{ marginBottom: 0 }}>
                      <option value="">Sans chapitre</option>
                      {chapitres.map((c) => (
                        <option key={c.id} value={c.id}>{c.matiere} — {c.titre}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Footer */}
                <div style={{
                  padding: "16px 24px", borderTop: "1px solid var(--pb-outline-variant, #eee)",
                  display: "flex", justifyContent: "flex-end", gap: 10,
                }}>
                  <button onClick={() => setModalBloc(null)} className="pb-btn">
                    Annuler
                  </button>
                  <button onClick={sauverModale} className="pb-btn primary"
                    style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="ms" style={{ fontSize: 16 }}>check</span>
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
        {/* ── Sous-modale sélection leçon ── */}
        {showLeconPicker && (() => {
          const matieresDispo = [...new Set(lecons.map((l) => l.matiere).filter(Boolean))].sort();
          const filtered = lecons.filter((l) => {
            const matOk = leconFiltreMatiere === "toutes" || l.matiere === leconFiltreMatiere;
            const anneeOk = leconFiltreAnnee === 0 || l.annee === leconFiltreAnnee;
            const rechOk = !leconRecherche.trim() || l.titre.toLowerCase().includes(leconRecherche.toLowerCase());
            return matOk && anneeOk && rechOk;
          });

          return (
            <div
              onClick={() => setShowLeconPicker(false)}
              style={{
                position: "fixed", inset: 0, zIndex: 200,
                background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 24,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: "white", borderRadius: 20,
                  width: "100%", maxWidth: 800, maxHeight: "85vh",
                  display: "flex", flexDirection: "column",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
                  overflow: "hidden",
                }}
              >
                {/* Header */}
                <div style={{
                  padding: "20px 24px", borderBottom: "1px solid var(--pb-outline-variant, #eee)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "1.25rem", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="ms" style={{ fontSize: 24, color: "#16A34A" }}>menu_book</span>
                    Banque de leçons
                  </h3>
                  <button onClick={() => setShowLeconPicker(false)} style={{
                    width: 36, height: 36, borderRadius: "50%", background: "var(--pb-surface-container, #f3f4f6)",
                    border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span className="ms" style={{ fontSize: 20 }}>close</span>
                  </button>
                </div>

                {/* Filtres */}
                <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--pb-outline-variant, #eee)", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  {/* Recherche */}
                  <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                    <span className="ms" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 18, color: "var(--pb-on-surface-variant)" }}>search</span>
                    <input
                      className="form-input"
                      value={leconRecherche}
                      onChange={(e) => setLeconRecherche(e.target.value)}
                      placeholder="Rechercher une leçon..."
                      style={{ paddingLeft: 36, marginBottom: 0, fontSize: 13 }}
                    />
                  </div>
                  {/* Filtre matière */}
                  <select
                    className="form-input"
                    value={leconFiltreMatiere}
                    onChange={(e) => setLeconFiltreMatiere(e.target.value)}
                    style={{ marginBottom: 0, width: "auto", fontSize: 13 }}
                  >
                    <option value="toutes">Toutes les matières</option>
                    {matieresDispo.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  {/* Filtre année */}
                  <div style={{ display: "flex", gap: 4 }}>
                    {([0, 1, 2] as const).map((a) => (
                      <button
                        key={a}
                        onClick={() => setLeconFiltreAnnee(a)}
                        style={{
                          padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                          border: "1px solid var(--pb-outline-variant, #ddd)", cursor: "pointer",
                          background: leconFiltreAnnee === a ? "var(--pb-primary)" : "white",
                          color: leconFiltreAnnee === a ? "white" : "var(--pb-on-surface-variant)",
                          transition: "all 0.15s",
                        }}
                      >
                        {a === 0 ? "Toutes" : `Année ${a}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Liste des leçons */}
                <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px" }}>
                  {filtered.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "2rem", color: "var(--pb-on-surface-variant)" }}>
                      <span className="ms" style={{ fontSize: 40, opacity: 0.3, display: "block", marginBottom: 8 }}>search_off</span>
                      <p style={{ fontWeight: 600 }}>Aucune leçon trouvée</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {filtered.map((lecon) => (
                        <button
                          key={lecon.id}
                          onClick={() => {
                            setModalLeconId(lecon.id);
                            setModalTitre(lecon.titre);
                            setModalReference(lecon.titre);
                            setShowLeconPicker(false);
                          }}
                          style={{
                            padding: "12px 16px", borderRadius: 12,
                            border: modalLeconId === lecon.id ? "2px solid #16A34A" : "1px solid var(--pb-outline-variant, #ddd)",
                            background: modalLeconId === lecon.id ? "rgba(22,163,74,0.06)" : "white",
                            cursor: "pointer", textAlign: "left",
                            display: "flex", alignItems: "center", gap: 12,
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={(e) => { if (modalLeconId !== lecon.id) e.currentTarget.style.background = "rgba(0,0,0,0.02)"; }}
                          onMouseLeave={(e) => { if (modalLeconId !== lecon.id) e.currentTarget.style.background = "white"; }}
                        >
                          <span className="ms" style={{ fontSize: 22, color: "#16A34A", flexShrink: 0 }}>description</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--pb-on-surface)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {lecon.titre}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginTop: 2, display: "flex", gap: 8 }}>
                              {lecon.matiere && <span>{lecon.matiere}</span>}
                              {lecon.annee && <span>· Année {lecon.annee}</span>}
                            </div>
                          </div>
                          <span className="ms" style={{ fontSize: 18, color: "var(--pb-on-surface-variant)" }}>chevron_right</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div style={{ padding: "12px 24px", borderTop: "1px solid var(--pb-outline-variant, #eee)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>
                    {filtered.length} leçon{filtered.length > 1 ? "s" : ""}
                  </span>
                  <button onClick={() => setShowLeconPicker(false)} className="pb-btn">
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Sous-modale : banque d'exercices ── */}
        {showExoBanquePicker && (() => {
          const typeBloc = modalBloc?.type ?? "";
          const exosFiltres = banqueExos.filter((e) => {
            const typeOk = e.type === typeBloc;
            const matOk = exoFiltreMatiere === "toutes" || e.matiere === exoFiltreMatiere;
            const rechOk = !exoRecherche.trim() || (e.titre ?? "").toLowerCase().includes(exoRecherche.toLowerCase());
            return typeOk && matOk && rechOk;
          });
          const matieresDispo = [...new Set(banqueExos.filter((e) => e.type === typeBloc).map((e) => e.matiere).filter(Boolean))].sort() as string[];

          return (
            <div
              onClick={() => setShowExoBanquePicker(false)}
              style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
            >
              <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 20, width: "100%", maxWidth: 700, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", overflow: "hidden" }}>
                {/* Header */}
                <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--pb-outline-variant, #eee)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="ms" style={{ fontSize: 24, color: "var(--pb-primary)" }}>library_books</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Banque d&apos;exercices</div>
                      <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginTop: 2 }}>{TYPE_BLOC_CONFIG[typeBloc as TypeBloc]?.libelle}</div>
                    </div>
                  </div>
                  <button onClick={() => setShowExoBanquePicker(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 8 }}>
                    <span className="ms" style={{ fontSize: 20, color: "var(--pb-on-surface-variant)" }}>close</span>
                  </button>
                </div>

                {/* Filtres */}
                <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--pb-outline-variant, #eee)", display: "flex", flexDirection: "column", gap: 10 }}>
                  <input
                    className="form-input"
                    value={exoRecherche}
                    onChange={(e) => setExoRecherche(e.target.value)}
                    placeholder="Rechercher un exercice…"
                    style={{ marginBottom: 0 }}
                    autoFocus
                  />
                  {matieresDispo.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {["toutes", ...matieresDispo].map((m) => (
                        <button key={m} onClick={() => setExoFiltreMatiere(m)}
                          style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1.5px solid", transition: "all 0.15s",
                            borderColor: exoFiltreMatiere === m ? "var(--pb-primary)" : "var(--pb-outline-variant, #ddd)",
                            background: exoFiltreMatiere === m ? "rgba(0,80,212,0.08)" : "white",
                            color: exoFiltreMatiere === m ? "var(--pb-primary)" : "var(--pb-on-surface-variant)",
                          }}>
                          {m === "toutes" ? "Toutes les matières" : m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Liste */}
                <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {exosFiltres.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "var(--pb-on-surface-variant)" }}>
                      <span className="ms" style={{ fontSize: 40, display: "block", marginBottom: 8 }}>inbox</span>
                      Aucun exercice trouvé
                    </div>
                  ) : exosFiltres.map((exo) => (
                    <div
                      key={exo.id}
                      onClick={() => { chargerDepuisBanque(exo.id); setShowExoBanquePicker(false); }}
                      style={{
                        padding: "12px 16px", borderRadius: 12, cursor: "pointer", transition: "all 0.15s",
                        border: modalBanqueId === exo.id ? "2px solid #16A34A" : "1.5px solid var(--pb-outline-variant, #eee)",
                        background: modalBanqueId === exo.id ? "rgba(22,163,74,0.06)" : "white",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                      }}
                      onMouseEnter={(e) => { if (modalBanqueId !== exo.id) e.currentTarget.style.background = "var(--bg, #F7F8FA)"; }}
                      onMouseLeave={(e) => { if (modalBanqueId !== exo.id) e.currentTarget.style.background = "white"; }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--pb-on-surface)" }}>{exo.titre || "(Sans titre)"}</div>
                        {exo.matiere && <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginTop: 2 }}>{exo.matiere}</div>}
                      </div>
                      {modalBanqueId === exo.id && <span className="ms" style={{ fontSize: 20, color: "#16A34A" }}>check_circle</span>}
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div style={{ padding: "12px 24px", borderTop: "1px solid var(--pb-outline-variant, #eee)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>{exosFiltres.length} exercice{exosFiltres.length > 1 ? "s" : ""}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setShowExoBanquePicker(false); setExoGenErreur(""); setShowExoGenerateur(true); }} className="pb-btn" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="ms" style={{ fontSize: 16, color: "#7C3AED" }}>auto_awesome</span>
                      Créer avec l&apos;IA
                    </button>
                    <button onClick={() => setShowExoBanquePicker(false)} className="pb-btn">Fermer</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Sous-modale : générateur IA ── */}
        {showExoGenerateur && (() => {
          const typeBloc = modalBloc?.type ?? "";
          return (
            <div
              onClick={() => setShowExoGenerateur(false)}
              style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
            >
              <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 20, width: "100%", maxWidth: 1000, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", overflow: "hidden" }}>
                {/* Header */}
                <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--pb-outline-variant, #eee)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="ms" style={{ fontSize: 24, color: "#7C3AED" }}>auto_awesome</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Créer avec l&apos;IA</div>
                      <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginTop: 2 }}>{TYPE_BLOC_CONFIG[typeBloc as TypeBloc]?.libelle}</div>
                    </div>
                  </div>
                  <button onClick={() => setShowExoGenerateur(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 8 }}>
                    <span className="ms" style={{ fontSize: 20, color: "var(--pb-on-surface-variant)" }}>close</span>
                  </button>
                </div>

                {/* Formulaire */}
                <div style={{ flex: 1, overflowY: "auto", padding: "0 20px", position: "relative" }}>
                  {exoGenErreur && (
                    <div style={{ margin: "16px 20px 0", padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", fontSize: 13 }}>
                      {exoGenErreur}
                    </div>
                  )}
                  {exoGenChargement && (
                    <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.85)", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
                      <div style={{ width: 48, height: 48, borderRadius: "50%", border: "4px solid #EDE9FE", borderTopColor: "#7C3AED", animation: "spin 0.9s linear infinite" }} />
                      <p style={{ fontWeight: 600, color: "var(--pb-on-surface)" }}>Génération en cours…</p>
                      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                  )}
                  {typeBloc === "exercice" && (
                    <GenererExerciceForm
                      onGenerer={(p) => genererEtSauvegarder({ ...p, type: "exercice" })}
                      onPiocherBanque={() => { setShowExoGenerateur(false); setShowExoBanquePicker(true); }}
                      chargement={exoGenChargement}
                    />
                  )}
                  {typeBloc === "texte_a_trous" && (
                    <GenererTexteATrousForm
                      onGenerer={(p) => genererEtSauvegarder({ ...p, type: "texte_a_trous" })}
                      chargement={exoGenChargement}
                    />
                  )}
                  {typeBloc === "classement" && (
                    <GenererClassementForm
                      onGenerer={(p) => genererEtSauvegarder({ ...p, type: "classement" })}
                      chargement={exoGenChargement}
                    />
                  )}
                  {typeBloc === "analyse_phrase" && (
                    <GenererAnalysePhraseForm
                      onGenerer={(p) => genererEtSauvegarder({ ...p, type: "analyse_phrase" })}
                      chargement={exoGenChargement}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </EnseignantLayout>
  );
}
