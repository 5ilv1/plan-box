"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import EnseignantLayout from "@/components/EnseignantLayout";

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Groupe { id: string; nom: string }
interface ElevePB {
  id: string; prenom: string; nom: string; source: "planbox";
  niveaux?: { nom: string }; niveau_id: string;
  niveau_etoiles: number | null;
  repetibox_eleve_id: number | null;
  groupes: Groupe[];
}
interface EleveRB {
  id: number; prenom: string; nom: string; source: "repetibox";
  identifiant: string; classe_id: number | null;
  niveau_etoiles: number | null; groupes: Groupe[];
}
type EleveUnifie = (ElevePB | EleveRB) & { uid: string };

interface MembreGroupe {
  uid: string; prenom: string; nom: string;
  source: "planbox" | "repetibox"; info: string;
}
interface GroupeComplet {
  id: string; nom: string; created_at: string; membres: MembreGroupe[];
}

interface RepetiboxConfig {
  id: string;
  groupe_id: string | null;
  eleve_id: string | null;
  repetibox_eleve_id: number | null;
  actif: boolean;
}

interface BlocJour {
  id: string; type: string; titre: string | null;
  statut: "a_faire" | "en_cours" | "fait";
  date_limite: string | null; contenu: Record<string, unknown>;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const ETOILES = ["", "CE2", "CM1", "CM2", "CM2+"];
const FORM_VIDE = { prenom: "", nom: "", email: "", password: "", niveau_id: "", groupeIds: [] as string[] };
const STATUT_CONF: Record<string, { label: string; color: string; bg: string; bord: string }> = {
  fait:     { label: "Fait",     color: "#065F46", bg: "#D1FAE5", bord: "#10B981" },
  en_cours: { label: "En cours", color: "#1E40AF", bg: "#DBEAFE", bord: "#3B82F6" },
  a_faire:  { label: "À faire",  color: "#92400E", bg: "#FEF3C7", bord: "#F59E0B" },
};
const TYPE_ICONE: Record<string, string> = {
  exercice: "edit_note", calcul_mental: "pin", mots: "abc",
  dictee: "headphones", media: "play_circle", eval: "quiz", libre: "edit",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addJours(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return formatISO(d);
}
function formatJourFR(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
const TODAY = formatISO(new Date());

// ── Composant Toggle ──────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      title={checked ? "Désactiver Repetibox" : "Activer Repetibox"}
      style={{
        width: 40, height: 22, borderRadius: 11,
        background: checked ? "#7C3AED" : "#D1D5DB",
        border: "none", cursor: disabled ? "default" : "pointer",
        position: "relative", transition: "background 0.2s",
        padding: 0, flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 3,
        left: checked ? 21 : 3,
        width: 16, height: 16, borderRadius: "50%",
        background: "white", transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)", display: "block",
      }} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function PageAdminEleves() {
  const router = useRouter();
  const supabase = createClient();

  const [onglet, setOnglet] = useState<"eleves" | "groupes">("eleves");

  // ── Données partagées ─────────────────────────────────────────────────────
  const [eleves, setEleves] = useState<EleveUnifie[]>([]);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [groupesComplets, setGroupesComplets] = useState<GroupeComplet[]>([]);
  const [niveaux, setNiveaux] = useState<{ id: string; nom: string }[]>([]);
  const [repetiboxConfigs, setRepetiboxConfigs] = useState<RepetiboxConfig[]>([]);
  const [chargement, setChargement] = useState(true);

  // ── Onglet Élèves ─────────────────────────────────────────────────────────
  const [filtre, setFiltre] = useState<"tous" | "planbox" | "repetibox">("tous");
  const [recherche, setRecherche] = useState("");
  const [formPB, setFormPB] = useState(FORM_VIDE);
  const [formVisible, setFormVisible] = useState(false);
  const [enSauvegarde, setEnSauvegarde] = useState(false);
  const [erreurForm, setErreurForm] = useState("");
  const [messageSucces, setMessageSucces] = useState("");
  const [editRB, setEditRB] = useState<{ id: number; groupeIds: string[] } | null>(null);
  const [aSupprimer, setASupprimer] = useState<EleveUnifie | null>(null);
  const [panelEleve, setPanelEleve] = useState<EleveUnifie | null>(null);
  const [panelDate, setPanelDate] = useState(TODAY);
  const [panelBlocs, setPanelBlocs] = useState<BlocJour[]>([]);
  const [chargementPlan, setChargementPlan] = useState(false);

  // ── Onglet Groupes ────────────────────────────────────────────────────────
  const [groupeOuvert, setGroupeOuvert] = useState<string | null>(null);
  const [nomNouveau, setNomNouveau] = useState("");
  const [elevesCrees, setElevesCrees] = useState<string[]>([]);
  const [enCreation, setEnCreation] = useState(false);
  const [enEditionGroupe, setEnEditionGroupe] = useState<string | null>(null);
  const [nomEdition, setNomEdition] = useState("");
  const [eleveAAjouter, setEleveAAjouter] = useState<Record<string, string>>({});
  const [groupeASupprimer, setGroupeASupprimer] = useState<string | null>(null);
  const [feedbackGroupe, setFeedbackGroupe] = useState<string | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { const r = typeof window !== "undefined" ? sessionStorage.getItem("pb_role") : null; if (r === "enseignant") return; router.push("/enseignant"); return; }
      charger();
    });
  }, []);

  useEffect(() => {
    if (panelEleve) chargerJour(panelDate, panelEleve);
  }, [panelDate, panelEleve]);

  async function charger() {
    setChargement(true);
    const [eleveRes, niveauRes, groupeRes, configRes] = await Promise.all([
      fetch("/api/admin/eleves").then((r) => r.json()),
      supabase.from("niveaux").select("*").order("nom"),
      fetch("/api/admin/groupes").then((r) => r.json()),
      fetch("/api/admin/repetibox-config").then((r) => r.json()),
    ]);

    const pb: EleveUnifie[] = (eleveRes.planbox ?? []).map((e: any) => ({ ...e, uid: `pb_${e.id}` }));
    const rb: EleveUnifie[] = (eleveRes.repetibox ?? []).map((e: any) => ({ ...e, uid: `rb_${e.id}` }));
    setEleves([...pb, ...rb].sort((a, b) => a.nom.localeCompare(b.nom, "fr")));
    setGroupes(eleveRes.groupes ?? []);
    setGroupesComplets(groupeRes.groupes ?? []);
    setNiveaux(niveauRes.data ?? []);
    setRepetiboxConfigs(configRes.configs ?? []);
    setChargement(false);
  }

  async function chargerConfigs() {
    const res = await fetch("/api/admin/repetibox-config");
    const json = await res.json();
    setRepetiboxConfigs(json.configs ?? []);
  }

  async function chargerJour(date: string, eleve: EleveUnifie) {
    setChargementPlan(true);
    try {
      const res = await fetch(`/api/admin/planning?debut=${date}&fin=${date}`);
      const json = await res.json();
      const uid = eleve.uid;
      const filtres = (json.blocs ?? []).filter((b: any) => {
        if (uid.startsWith("pb_")) return b.eleve_id === uid.replace("pb_", "");
        return b.repetibox_eleve_id === parseInt(uid.replace("rb_", ""), 10);
      });
      setPanelBlocs(filtres);
    } catch { setPanelBlocs([]); }
    finally { setChargementPlan(false); }
  }

  // ── Logique Repetibox config ──────────────────────────────────────────────

  function getConfigGroupe(groupeId: string): boolean {
    return repetiboxConfigs.some((c) => c.groupe_id === groupeId && c.actif);
  }

  function getConfigEleve(eleveId: string, groupes: Groupe[]): {
    actif: boolean; source: "individuel" | "groupe" | "defaut"; config?: RepetiboxConfig;
  } {
    const indiv = repetiboxConfigs.find((c) => c.eleve_id === eleveId);
    if (indiv !== undefined) return { actif: indiv.actif, source: "individuel", config: indiv };
    const groupeActif = groupes.some((g) => getConfigGroupe(g.id));
    if (groupeActif) return { actif: true, source: "groupe" };
    return { actif: false, source: "defaut" };
  }

  async function toggleGroupe(groupeId: string) {
    const actuelActif = getConfigGroupe(groupeId);
    if (actuelActif) {
      await fetch(`/api/admin/repetibox-config?groupe_id=${groupeId}`, { method: "DELETE" });
    } else {
      await fetch("/api/admin/repetibox-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupe_id: groupeId, actif: true }),
      });
    }
    await chargerConfigs();
  }

  async function toggleEleve(eleveId: string, groupes: Groupe[]) {
    const { actif, source, config } = getConfigEleve(eleveId, groupes);
    if (source === "individuel") {
      // A une config individuelle → flipper
      await fetch("/api/admin/repetibox-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eleve_id: eleveId, actif: !actif }),
      });
    } else {
      // Pas de config individuelle → créer une (inverse de l'état effectif)
      await fetch("/api/admin/repetibox-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eleve_id: eleveId, actif: !actif }),
      });
    }
    await chargerConfigs();
  }

  async function reinitialiserEleve(eleveId: string) {
    await fetch(`/api/admin/repetibox-config?eleve_id=${eleveId}`, { method: "DELETE" });
    await chargerConfigs();
  }

  // ── Actions élèves ────────────────────────────────────────────────────────

  async function creerElevePB() {
    if (!formPB.prenom.trim() || !formPB.nom.trim() || !formPB.email.trim() || !formPB.password || !formPB.niveau_id) {
      setErreurForm("Tous les champs sont obligatoires."); return;
    }
    setEnSauvegarde(true); setErreurForm("");
    const res = await fetch("/api/admin/eleves", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formPB),
    });
    const json = await res.json();
    setEnSauvegarde(false);
    if (!res.ok) { setErreurForm(json.erreur ?? "Erreur"); return; }
    setFormVisible(false); setFormPB(FORM_VIDE);
    setMessageSucces(`${formPB.prenom} ${formPB.nom} créé avec succès !`);
    setTimeout(() => setMessageSucces(""), 4000);
    await charger();
  }

  async function setEtoilesRapide(eleve: EleveUnifie, val: number | null) {
    setEleves((prev) => prev.map((e) => e.uid === eleve.uid ? { ...e, niveau_etoiles: val } : e));
    const isPB = eleve.source === "planbox";
    const id = isPB ? (eleve as ElevePB).id : String((eleve as EleveRB).id);
    await fetch("/api/admin/eleves", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, source: eleve.source, niveau_etoiles: val, ...(isPB ? {} : { groupeIds: (eleve as EleveRB).groupes.map((g) => g.id) }) }),
    });
  }

  async function sauvegarderRB() {
    if (!editRB) return;
    const eleve = eleves.find((e) => !e.uid.startsWith("pb_") && (e as EleveRB).id === editRB.id) as (EleveRB & EleveUnifie) | undefined;
    await fetch("/api/admin/eleves", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: String(editRB.id), source: "repetibox", niveau_etoiles: eleve?.niveau_etoiles ?? null, groupeIds: editRB.groupeIds }),
    });
    setEditRB(null); await charger();
  }

  async function supprimerEleve(e: EleveUnifie) {
    const id = e.source === "planbox" ? (e as ElevePB).id : String((e as EleveRB).id);
    await fetch(`/api/admin/eleves?id=${id}&source=${e.source}`, { method: "DELETE" });
    setASupprimer(null); await charger();
  }

  // ── Actions groupes ───────────────────────────────────────────────────────

  async function creerGroupe(ev: React.FormEvent) {
    ev.preventDefault();
    const nom = nomNouveau.trim(); if (!nom) return;
    setEnCreation(true);
    await fetch("/api/admin/groupes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom, eleveUids: elevesCrees }),
    });
    setNomNouveau(""); setElevesCrees([]); await charger(); setEnCreation(false);
  }

  async function renommerGroupe(id: string) {
    const nom = nomEdition.trim(); if (!nom) return;
    await fetch("/api/admin/groupes", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, nom }),
    });
    setEnEditionGroupe(null); await charger();
  }

  async function supprimerGroupe(id: string) {
    await fetch(`/api/admin/groupes?id=${id}`, { method: "DELETE" });
    setGroupeASupprimer(null);
    if (groupeOuvert === id) setGroupeOuvert(null);
    await charger();
  }

  async function ajouterMembre(groupeId: string) {
    const uid = eleveAAjouter[groupeId]; if (!uid) return;
    const res = await fetch(`/api/admin/groupes/${groupeId}/membres`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eleveUid: uid }),
    });
    const json = await res.json().catch(() => ({}));
    setEleveAAjouter((prev) => ({ ...prev, [groupeId]: "" }));
    await charger();
    if (json.exercicesAssignes > 0) {
      setFeedbackGroupe(`${json.exercicesAssignes} exercice${json.exercicesAssignes > 1 ? "s" : ""} assigné${json.exercicesAssignes > 1 ? "s" : ""}.`);
      setTimeout(() => setFeedbackGroupe(null), 4000);
    }
  }

  async function retirerMembre(groupeId: string, uid: string) {
    await fetch(`/api/admin/groupes/${groupeId}/membres?uid=${uid}`, { method: "DELETE" });
    await charger();
    setFeedbackGroupe("Élève retiré du groupe.");
    setTimeout(() => setFeedbackGroupe(null), 4000);
  }

  function horsGroupe(groupe: GroupeComplet): EleveUnifie[] {
    const membreUids = new Set(groupe.membres.map((m) => m.uid));
    return eleves.filter((e) => !membreUids.has(e.uid));
  }

  // ── Filtrage élèves ───────────────────────────────────────────────────────

  const elevesFiltrés = eleves
    .filter((e) => filtre === "tous" || e.source === filtre)
    .filter((e) => {
      if (!recherche.trim()) return true;
      return (e.prenom + " " + e.nom).toLowerCase().includes(recherche.toLowerCase());
    });

  // ─────────────────────────────────────────────────────────────────────────
  // Rendu
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <EnseignantLayout>
      {/* Toast groupes */}
      {feedbackGroupe && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#065F46", color: "white", padding: "12px 20px", borderRadius: 12,
          fontSize: 14, fontWeight: 600, fontFamily: "var(--font)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)", zIndex: 999, whiteSpace: "nowrap",
        }}>
          {feedbackGroupe}
        </div>
      )}

      <div className="page">
        <div className="container" style={{ maxWidth: 820 }}>

          {/* Titre + onglets */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div className="tabs">
              <button className={`tab${onglet === "eleves" ? " active" : ""}`} onClick={() => setOnglet("eleves")}>
                <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>person</span> Élèves ({eleves.length})
              </button>
              <button className={`tab${onglet === "groupes" ? " active" : ""}`} onClick={() => setOnglet("groupes")}>
                <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>group</span> Groupes ({groupesComplets.length})
              </button>
            </div>
            {onglet === "eleves" && (
              <button className="btn-primary" onClick={() => { setFormVisible(true); setErreurForm(""); setFormPB({ ...FORM_VIDE, niveau_id: niveaux[0]?.id ?? "" }); }}>
                + Nouvel élève
              </button>
            )}
          </div>

          {messageSucces && (
            <div style={{ background: "#D1FAE5", color: "#065F46", padding: "10px 16px", borderRadius: 10, marginBottom: 16, fontWeight: 600, fontSize: 14 }}>
              <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>check_circle</span> {messageSucces}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* ONGLET ÉLÈVES                                                   */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {onglet === "eleves" && (
            <>
              {/* Filtres */}
              <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                <div className="tabs" style={{ flex: 1 }}>
                  {(["tous", "planbox", "repetibox"] as const).map((f) => (
                    <button key={f} className={`tab${filtre === f ? " active" : ""}`} onClick={() => setFiltre(f)}>
                      {f === "tous" ? `Tous (${eleves.length})` : f === "planbox" ? <><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>assignment</span> Plan Box ({eleves.filter((e) => e.source === "planbox").length})</> : <><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>style</span> Repetibox ({eleves.filter((e) => e.source === "repetibox").length})</>}
                    </button>
                  ))}
                </div>
                <input
                  type="text" className="form-input" placeholder="Rechercher…"
                  value={recherche} onChange={(e) => setRecherche(e.target.value)}
                  style={{ maxWidth: 200, fontSize: 13 }}
                />
              </div>

              {chargement ? (
                <div style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>Chargement…</div>
              ) : elevesFiltrés.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "32px 20px", color: "var(--text-secondary)" }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}><span className="ms" style={{ fontSize: 36 }}>person</span></div>
                  <p>Aucun élève{recherche ? " correspondant" : ""}.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {elevesFiltrés.map((eleve) => {
                    const isPB = eleve.source === "planbox";
                    const ePB = eleve as ElevePB & EleveUnifie;
                    const eRB = eleve as EleveRB;
                    const isEditingRB = editRB?.id === eRB.id && !isPB;
                    const panelOuvert = panelEleve?.uid === eleve.uid;
                    const etoilesCourantes = eleve.niveau_etoiles;

                    // Config Repetibox pour les élèves PB avec repetibox_eleve_id
                    const hasPBRBLink = isPB && ePB.repetibox_eleve_id !== null;
                    const rbConfig = hasPBRBLink ? getConfigEleve(ePB.id, ePB.groupes) : null;

                    return (
                      <div
                        key={eleve.uid}
                        className="card"
                        style={{
                          padding: "14px 18px",
                          borderLeft: panelOuvert ? "3px solid var(--primary)" : "3px solid transparent",
                          transition: "border-color 0.15s",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                          {/* Avatar */}
                          <div style={{
                            width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                            background: isPB ? "var(--primary-pale)" : "#FEF3C7",
                          }}>
                            <span className="ms" style={{ fontSize: 18 }}>{isPB ? "assignment" : "style"}</span>
                          </div>

                          {/* Infos */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span
                                onClick={() => panelOuvert ? setPanelEleve(null) : (setPanelEleve(eleve), setPanelDate(TODAY))}
                                style={{ fontWeight: 700, fontSize: 15, cursor: "pointer", color: panelOuvert ? "var(--primary)" : "var(--text)", textDecoration: panelOuvert ? "underline" : "none" }}
                              >
                                {eleve.prenom} {eleve.nom}
                              </span>
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, fontWeight: 600, background: isPB ? "var(--primary-pale)" : "#FEF3C7", color: isPB ? "var(--primary)" : "#92400E" }}>
                                {isPB ? "Plan Box" : "Repetibox"}
                              </span>
                              {isPB && ePB.niveaux?.nom && (
                                <span className="badge badge-primary" style={{ fontSize: 11 }}>{ePB.niveaux.nom}</span>
                              )}
                              {/* Étoiles */}
                              <div style={{ display: "flex", gap: 1, alignItems: "center" }}>
                                {[1, 2, 3, 4].map((n) => (
                                  <button key={n} title={ETOILES[n]} onClick={() => setEtoilesRapide(eleve, etoilesCourantes === n ? null : n)}
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "1px 2px", opacity: (etoilesCourantes ?? 0) >= n ? 1 : 0.2 }}
                                  ><span className="ms" style={{ fontSize: 14 }}>star</span></button>
                                ))}
                              </div>
                            </div>

                            {!isPB && (
                              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                                Identifiant : <code style={{ fontSize: 11 }}>{eRB.identifiant}</code>
                              </div>
                            )}

                            {/* Groupes */}
                            {eleve.groupes.length > 0 && (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                                {eleve.groupes.map((g) => (
                                  <span key={g.id} style={{ fontSize: 11, padding: "2px 8px", background: "#EDE9FE", color: "#5B21B6", borderRadius: 20, fontWeight: 500 }}>
                                    <span className="ms" style={{ fontSize: 11, verticalAlign: "middle" }}>group</span> {g.nom}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Toggle Repetibox — élèves PB avec compte RB lié */}
                            {hasPBRBLink && rbConfig && (
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                                <Toggle
                                  checked={rbConfig.actif}
                                  onChange={() => toggleEleve(ePB.id, ePB.groupes)}
                                />
                                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                                  {rbConfig.actif ? "Révisions Repetibox activées" : "Révisions Repetibox désactivées"}
                                </span>
                                {rbConfig.source === "individuel" && (
                                  <span
                                    style={{ fontSize: 11, color: "#7C3AED", padding: "2px 7px", background: "#F3E8FF", borderRadius: 20, fontWeight: 600 }}
                                  >
                                    individuel
                                  </span>
                                )}
                                {rbConfig.source === "groupe" && (
                                  <span style={{ fontSize: 11, color: "#5B21B6", padding: "2px 7px", background: "#EDE9FE", borderRadius: 20, fontWeight: 500 }}>
                                    via groupe
                                  </span>
                                )}
                                {/* Bouton réinitialiser si override individuel */}
                                {rbConfig.source === "individuel" && (
                                  <button
                                    onClick={() => reinitialiserEleve(ePB.id)}
                                    title="Supprimer le réglage individuel (revenir au réglage du groupe)"
                                    style={{ fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "2px 4px", textDecoration: "underline" }}
                                  >
                                    réinit.
                                  </button>
                                )}
                              </div>
                            )}

                            {/* RB students : config individuelle > groupe */}
                            {!isPB && (() => {
                              const rbId = eRB.id;
                              const configIndiv = repetiboxConfigs.find((c) => c.repetibox_eleve_id === rbId);
                              const groupeActif = eleve.groupes.some((g) => getConfigGroupe(g.id));
                              const effectif = configIndiv !== undefined ? configIndiv.actif : groupeActif;
                              const source = configIndiv !== undefined ? "individuel" : groupeActif ? "groupe" : "defaut";

                              return (
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                                  <Toggle
                                    checked={effectif}
                                    onChange={async () => {
                                      if (configIndiv !== undefined) {
                                        // Flip l'override individuel
                                        await fetch("/api/admin/repetibox-config", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ repetibox_eleve_id: rbId, actif: !effectif }),
                                        });
                                      } else {
                                        // Créer un override individuel inverse de l'état effectif
                                        await fetch("/api/admin/repetibox-config", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ repetibox_eleve_id: rbId, actif: !effectif }),
                                        });
                                      }
                                      await chargerConfigs();
                                    }}
                                  />
                                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                                    {effectif ? "Révisions Repetibox activées" : "Révisions Repetibox désactivées"}
                                  </span>
                                  {source === "individuel" && (
                                    <span style={{ fontSize: 11, color: "#7C3AED", padding: "2px 7px", background: "#F3E8FF", borderRadius: 20, fontWeight: 600 }}>
                                      individuel
                                    </span>
                                  )}
                                  {source === "groupe" && (
                                    <span style={{ fontSize: 11, color: "#5B21B6", padding: "2px 7px", background: "#EDE9FE", borderRadius: 20, fontWeight: 500 }}>
                                      via groupe
                                    </span>
                                  )}
                                  {source === "individuel" && (
                                    <button
                                      onClick={async () => {
                                        await fetch(`/api/admin/repetibox-config?repetibox_eleve_id=${rbId}`, { method: "DELETE" });
                                        await chargerConfigs();
                                      }}
                                      title="Supprimer le réglage individuel"
                                      style={{ fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "2px 4px", textDecoration: "underline" }}
                                    >
                                      réinit.
                                    </button>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Édition groupes RB */}
                            {isEditingRB && (
                              <div style={{ marginTop: 10, padding: "12px 14px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border)" }}>
                                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Groupes</label>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                                  {groupes.map((g) => {
                                    const selected = editRB.groupeIds.includes(g.id);
                                    return (
                                      <button key={g.id}
                                        onClick={() => setEditRB((prev) => prev ? { ...prev, groupeIds: selected ? prev.groupeIds.filter((id) => id !== g.id) : [...prev.groupeIds, g.id] } : null)}
                                        style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: "1px solid", background: selected ? "#EDE9FE" : "white", color: selected ? "#5B21B6" : "var(--text)", borderColor: selected ? "#A78BFA" : "var(--border)" }}
                                      >
                                        {selected ? <><span className="ms" style={{ fontSize: 12, verticalAlign: "middle" }}>check</span> </> : ""}{g.nom}
                                      </button>
                                    );
                                  })}
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button className="btn-primary" onClick={sauvegarderRB} style={{ fontSize: 13, padding: "6px 16px" }}><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>check</span> Enregistrer</button>
                                  <button className="btn-ghost" onClick={() => setEditRB(null)} style={{ fontSize: 13, padding: "6px 12px" }}>Annuler</button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            {!isPB && (
                              <button className="btn-ghost"
                                onClick={() => setEditRB(isEditingRB ? null : { id: eRB.id, groupeIds: eRB.groupes.map((g) => g.id) })}
                                title="Modifier les groupes"
                                style={{ fontSize: 12, padding: "4px 10px", background: isEditingRB ? "var(--primary-pale)" : undefined }}
                              ><span className="ms" style={{ fontSize: 16 }}>group</span></button>
                            )}
                            {aSupprimer?.uid === eleve.uid ? (
                              <>
                                <button onClick={() => supprimerEleve(eleve)} style={{ fontSize: 12, padding: "4px 10px", background: "var(--error)", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>
                                  {isPB ? "Supprimer" : "Détacher"}
                                </button>
                                <button className="btn-ghost" onClick={() => setASupprimer(null)} style={{ fontSize: 12, padding: "4px 8px" }}>✕</button>
                              </>
                            ) : (
                              <button className="btn-ghost" onClick={() => setASupprimer(eleve)} style={{ fontSize: 12, padding: "4px 10px", color: "var(--text-secondary)" }}><span className="ms" style={{ fontSize: 16 }}>delete</span></button>
                            )}
                          </div>
                        </div>

                        {/* Avertissements suppression */}
                        {aSupprimer?.uid === eleve.uid && !isPB && (
                          <div style={{ marginTop: 10, padding: "8px 12px", background: "#FEF3C7", borderRadius: 8, fontSize: 12, color: "#92400E" }}>
                            <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>warning</span> Cela supprimera uniquement l&apos;association Plan Box. Le compte Repetibox ne sera pas modifié.
                          </div>
                        )}
                        {aSupprimer?.uid === eleve.uid && isPB && (
                          <div style={{ marginTop: 10, padding: "8px 12px", background: "#FEE2E2", borderRadius: 8, fontSize: 12, color: "#991B1B" }}>
                            <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>warning</span> Le compte élève sera définitivement supprimé (plan de travail + progression inclus).
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* ONGLET GROUPES                                                  */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {onglet === "groupes" && (
            <>
              {/* Créer un groupe */}
              <div className="card" style={{ marginBottom: 24, padding: "18px 20px" }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>➕ Nouveau groupe</h2>
                <form onSubmit={creerGroupe} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <input
                    type="text" className="form-input" autoFocus
                    value={nomNouveau} onChange={(e) => setNomNouveau(e.target.value)}
                    placeholder="Ex. Groupe lecture, CE2-CM1, Avancés…"
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="btn-primary" disabled={enCreation || !nomNouveau.trim()} style={{ flexShrink: 0 }}>
                    {enCreation ? "…" : "Créer"}
                  </button>
                </form>
                {eleves.length > 0 && nomNouveau.trim() && (
                  <div>
                    <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Ajouter des élèves (optionnel)</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {eleves.map((e) => {
                        const sel = elevesCrees.includes(e.uid);
                        return (
                          <button key={e.uid} type="button"
                            onClick={() => setElevesCrees((prev) => sel ? prev.filter((u) => u !== e.uid) : [...prev, e.uid])}
                            style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: "1px solid", background: sel ? (e.source === "planbox" ? "var(--primary-pale)" : "#FEF3C7") : "white", color: sel ? (e.source === "planbox" ? "var(--primary)" : "#92400E") : "var(--text)", borderColor: sel ? (e.source === "planbox" ? "var(--primary)" : "#FCD34D") : "var(--border)" }}
                          >
                            {sel ? <><span className="ms" style={{ fontSize: 12, verticalAlign: "middle" }}>check</span> </> : ""}{e.prenom} {e.nom}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Liste des groupes */}
              {chargement ? (
                <div style={{ textAlign: "center", padding: 48, color: "var(--text-secondary)" }}>Chargement…</div>
              ) : groupesComplets.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "32px 20px", color: "var(--text-secondary)" }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}><span className="ms" style={{ fontSize: 36 }}>group</span></div>
                  <p>Aucun groupe. Créez-en un ci-dessus.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {groupesComplets.map((groupe) => {
                    const estOuvert = groupeOuvert === groupe.id;
                    const estEdition = enEditionGroupe === groupe.id;
                    const hors = horsGroupe(groupe);
                    const pbHors = hors.filter((e) => e.source === "planbox");
                    const rbHors = hors.filter((e) => e.source === "repetibox");
                    const rbActif = getConfigGroupe(groupe.id);

                    return (
                      <div key={groupe.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                        {/* En-tête */}
                        <div
                          style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer", background: estOuvert ? "var(--primary-pale)" : "var(--white)", borderBottom: estOuvert ? "1px solid var(--primary-mid)" : "none" }}
                          onClick={() => setGroupeOuvert(estOuvert ? null : groupe.id)}
                        >
                          <span className="ms" style={{ fontSize: 18 }}>group</span>

                          {estEdition ? (
                            <input
                              type="text" className="form-input" value={nomEdition}
                              onChange={(e) => setNomEdition(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => { if (e.key === "Enter") renommerGroupe(groupe.id); if (e.key === "Escape") setEnEditionGroupe(null); }}
                              autoFocus style={{ flex: 1, fontWeight: 600, fontSize: 15 }}
                            />
                          ) : (
                            <span style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>{groupe.nom}</span>
                          )}

                          <span className="badge badge-primary" style={{ fontSize: 12 }}>
                            {groupe.membres.length} élève{groupe.membres.length !== 1 ? "s" : ""}
                          </span>

                          {/* Toggle Repetibox du groupe */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                            <Toggle checked={rbActif} onChange={() => toggleGroupe(groupe.id)} />
                            <span style={{ fontSize: 12, color: rbActif ? "#7C3AED" : "var(--text-secondary)", fontWeight: rbActif ? 600 : 400, whiteSpace: "nowrap" }}>
                              <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>sync</span> Repetibox
                            </span>
                          </div>

                          <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                            {estEdition ? (
                              <>
                                <button className="btn-primary" onClick={() => renommerGroupe(groupe.id)} style={{ padding: "4px 12px", fontSize: 13 }}><span className="ms" style={{ fontSize: 14 }}>check</span></button>
                                <button className="btn-ghost" onClick={() => setEnEditionGroupe(null)} style={{ padding: "4px 10px", fontSize: 13 }}>✕</button>
                              </>
                            ) : (
                              <>
                                <button className="btn-ghost" onClick={() => { setNomEdition(groupe.nom); setEnEditionGroupe(groupe.id); setGroupeOuvert(groupe.id); }} style={{ padding: "4px 10px", fontSize: 13 }}><span className="ms" style={{ fontSize: 16 }}>edit</span></button>
                                {groupeASupprimer === groupe.id ? (
                                  <>
                                    <button onClick={() => supprimerGroupe(groupe.id)} style={{ padding: "4px 10px", fontSize: 13, background: "var(--error)", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>Confirmer</button>
                                    <button className="btn-ghost" onClick={() => setGroupeASupprimer(null)} style={{ padding: "4px 8px", fontSize: 13 }}>✕</button>
                                  </>
                                ) : (
                                  <button className="btn-ghost" onClick={() => setGroupeASupprimer(groupe.id)} style={{ padding: "4px 10px", fontSize: 13, color: "var(--text-secondary)" }}><span className="ms" style={{ fontSize: 16 }}>delete</span></button>
                                )}
                              </>
                            )}
                          </div>

                          <span style={{ color: "var(--text-secondary)", fontSize: 13, flexShrink: 0 }}>{estOuvert ? "▲" : "▼"}</span>
                        </div>

                        {/* Corps */}
                        {estOuvert && (
                          <div style={{ padding: "16px 18px" }}>
                            {/* Info Repetibox */}
                            {rbActif && (
                              <div style={{ marginBottom: 12, padding: "8px 12px", background: "#F3E8FF", borderRadius: 8, fontSize: 12, color: "#7C3AED", fontWeight: 600 }}>
                                <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>sync</span> Les révisions Repetibox apparaissent dans le plan des élèves de ce groupe.
                              </div>
                            )}

                            {groupe.membres.length === 0 ? (
                              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>Aucun élève dans ce groupe.</p>
                            ) : (
                              <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                                {groupe.membres.map((m) => {
                                  // Config individuelle de cet élève dans ce groupe
                                  const isPBMembre = m.uid.startsWith("pb_");
                                  const pbId = isPBMembre ? m.uid.replace("pb_", "") : null;
                                  const membreEleve = isPBMembre ? eleves.find(e => e.uid === m.uid) as (ElevePB & EleveUnifie) | undefined : undefined;
                                  const hasRBLink = membreEleve && (membreEleve as ElevePB).repetibox_eleve_id !== null;
                                  const membreConfig = (pbId && hasRBLink) ? getConfigEleve(pbId, membreEleve!.groupes) : null;
                                  const membreExempte = membreConfig?.source === "individuel" && !membreConfig.actif;

                                  return (
                                    <div key={m.uid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)" }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <span className="ms" style={{ fontSize: 16 }}>person</span>
                                        <span style={{ fontWeight: 600, fontSize: 14 }}>{m.prenom} {m.nom}</span>
                                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: m.source === "planbox" ? "var(--primary-pale)" : "#FEF3C7", color: m.source === "planbox" ? "var(--primary)" : "#92400E" }}>
                                          <span className="ms" style={{ fontSize: 12, verticalAlign: "middle" }}>{m.source === "planbox" ? "assignment" : "style"}</span> {m.info}
                                        </span>
                                        {membreExempte && (
                                          <span style={{ fontSize: 11, padding: "2px 7px", background: "#FEE2E2", color: "#991B1B", borderRadius: 20, fontWeight: 600 }}>
                                            exempté
                                          </span>
                                        )}
                                      </div>
                                      <button className="btn-ghost" onClick={() => retirerMembre(groupe.id, m.uid)} style={{ padding: "3px 10px", fontSize: 12, color: "var(--text-secondary)" }}>✕</button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Ajouter un membre */}
                            {hors.length > 0 && (
                              <div style={{ display: "flex", gap: 8 }}>
                                <select
                                  className="form-input"
                                  value={eleveAAjouter[groupe.id] ?? ""}
                                  onChange={(e) => setEleveAAjouter((prev) => ({ ...prev, [groupe.id]: e.target.value }))}
                                  style={{ flex: 1, fontSize: 13 }}
                                >
                                  <option value="">— Ajouter un élève —</option>
                                  {pbHors.length > 0 && <optgroup label="Plan Box">{pbHors.map((e) => <option key={e.uid} value={e.uid}>{e.prenom} {e.nom}</option>)}</optgroup>}
                                  {rbHors.length > 0 && <optgroup label="Repetibox">{rbHors.map((e) => <option key={e.uid} value={e.uid}>{e.prenom} {e.nom}</option>)}</optgroup>}
                                </select>
                                <button className="btn-primary" onClick={() => ajouterMembre(groupe.id)} disabled={!eleveAAjouter[groupe.id]} style={{ flexShrink: 0, fontSize: 13 }}>Ajouter</button>
                              </div>
                            )}
                            {hors.length === 0 && groupe.membres.length > 0 && (
                              <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Tous les élèves sont dans ce groupe.</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Panneau plan de travail ──────────────────────────────────────────── */}
      {panelEleve && (
        <div style={{
          position: "fixed", top: 48, right: 0, bottom: 0, width: 380,
          background: "white", borderLeft: "1px solid var(--border)",
          boxShadow: "-6px 0 24px rgba(0,0,0,0.08)", zIndex: 40,
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{panelEleve.prenom} {panelEleve.nom}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Plan de travail</div>
              </div>
              <button onClick={() => setPanelEleve(null)} className="btn-ghost" style={{ padding: "4px 10px", fontSize: 14 }}>✕</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => setPanelDate(addJours(panelDate, -1))} className="btn-ghost" style={{ padding: "5px 12px", fontSize: 16, lineHeight: 1 }}>←</button>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: "capitalize" }}>{formatJourFR(panelDate)}</div>
              </div>
              <button onClick={() => setPanelDate(addJours(panelDate, +1))} className="btn-ghost" style={{ padding: "5px 12px", fontSize: 16, lineHeight: 1 }}>→</button>
            </div>
            {panelDate !== TODAY && (
              <button onClick={() => setPanelDate(TODAY)} style={{ display: "block", margin: "8px auto 0", fontSize: 11, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font)", textDecoration: "underline" }}>
                Revenir à aujourd'hui
              </button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
            {chargementPlan ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>Chargement…</div>
            ) : panelBlocs.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}><span className="ms" style={{ fontSize: 36 }}>inbox</span></div>
                <div style={{ fontSize: 13 }}>Aucune activité ce jour</div>
                <Link href="/enseignant/generer" className="btn-primary" style={{ display: "inline-block", marginTop: 16, fontSize: 12 }}>
                  + Planifier une activité
                </Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                  {(["fait", "en_cours", "a_faire"] as const).map((s) => {
                    const n = panelBlocs.filter((b) => b.statut === s).length;
                    if (n === 0) return null;
                    const conf = STATUT_CONF[s];
                    return (
                      <span key={s} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: 700, background: conf.bg, color: conf.color }}>
                        {conf.label} ({n})
                      </span>
                    );
                  })}
                </div>
                {panelBlocs.map((b) => {
                  const stat = STATUT_CONF[b.statut] ?? STATUT_CONF.a_faire;
                  return (
                    <div key={b.id} style={{ padding: "12px 14px", background: "white", border: "1px solid var(--border)", borderLeft: `4px solid ${stat.bord}`, borderRadius: 10 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                            <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>{TYPE_ICONE[b.type] ?? "assignment"}</span> {b.titre ?? `(${b.type})`}
                          </div>
                          {b.date_limite && (
                            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                              Limite : {new Date(b.date_limite + "T12:00:00").toLocaleDateString("fr-FR")}
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 12, fontWeight: 700, background: stat.bg, color: stat.color, whiteSpace: "nowrap", flexShrink: 0 }}>
                          {stat.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Formulaire création élève PB ──────────────────────────────────── */}
      {formVisible && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }}>
          <div className="card" style={{ width: "100%", maxWidth: 480, padding: "28px 24px", maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>➕ Nouvel élève Plan Box</h2>
            {erreurForm && (
              <div style={{ background: "#FEE2E2", color: "#DC2626", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{erreurForm}</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Prénom *</label>
                  <input type="text" className="form-input" value={formPB.prenom} onChange={(e) => setFormPB((f) => ({ ...f, prenom: e.target.value }))} autoFocus />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Nom *</label>
                  <input type="text" className="form-input" value={formPB.nom} onChange={(e) => setFormPB((f) => ({ ...f, nom: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Email *</label>
                <input type="email" className="form-input" value={formPB.email} onChange={(e) => setFormPB((f) => ({ ...f, email: e.target.value }))} placeholder="eleve@ecole.fr" />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Mot de passe *</label>
                <input type="text" className="form-input" value={formPB.password} onChange={(e) => setFormPB((f) => ({ ...f, password: e.target.value }))} placeholder="Minimum 6 caractères" />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Niveau *</label>
                <select className="form-input" value={formPB.niveau_id} onChange={(e) => setFormPB((f) => ({ ...f, niveau_id: e.target.value }))}>
                  <option value="">— Choisir —</option>
                  {niveaux.map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
                </select>
              </div>
              {groupes.length > 0 && (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Groupes</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {groupes.map((g) => {
                      const sel = formPB.groupeIds.includes(g.id);
                      return (
                        <button key={g.id} type="button"
                          onClick={() => setFormPB((f) => ({ ...f, groupeIds: sel ? f.groupeIds.filter((id) => id !== g.id) : [...f.groupeIds, g.id] }))}
                          style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: "1px solid", background: sel ? "#EDE9FE" : "white", color: sel ? "#5B21B6" : "var(--text)", borderColor: sel ? "#A78BFA" : "var(--border)" }}
                        >
                          {sel ? <><span className="ms" style={{ fontSize: 12, verticalAlign: "middle" }}>check</span> </> : ""}{g.nom}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button className="btn-primary" onClick={creerElevePB} disabled={enSauvegarde} style={{ flex: 1 }}>
                  {enSauvegarde ? "Création…" : <><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>check</span> Créer l&apos;élève</>}
                </button>
                <button className="btn-ghost" onClick={() => setFormVisible(false)} style={{ flex: 1 }}>Annuler</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </EnseignantLayout>
  );
}
