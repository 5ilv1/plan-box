"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Notification } from "@/types";
import NotifCard from "@/components/NotifCard";
import AujourdhuiSection from "@/components/dashboard/AujourdhuiSection";
import ProgrammeJourView from "@/components/dashboard/ProgrammeJourView";
import ProgressionElevesView from "@/components/dashboard/ProgressionElevesView";
import FeedbackView from "@/components/dashboard/FeedbackView";
import CeinturesView from "@/components/dashboard/CeinturesView";
import SuiviJourView from "@/components/dashboard/SuiviJourView";

type TabSidebar = "blocs" | "suivi" | "eleves" | "feedback" | "ceintures";

interface ThemeEcriture {
  id: string | null;
  sujet: string;
  contrainte: string;
  affecte: boolean;
  afficher_contrainte: boolean;
  mode: "jour" | "semaine";
  planifie?: boolean;
}

function WidgetThemeEcriture() {
  const [themeJour,      setThemeJour]      = useState<ThemeEcriture | null>(null);
  const [avecContrainte, setAvecContrainte] = useState(false);
  const [enGeneration,   setEnGeneration]   = useState(false);
  const [enAffectation,  setEnAffectation]  = useState(false);
  const [modeEdition,    setModeEdition]    = useState(false);
  const [editSujet,      setEditSujet]      = useState("");
  const [editContrainte, setEditContrainte] = useState("");
  const [enSauvegarde,   setEnSauvegarde]   = useState(false);
  const [modeEcriture,   setModeEcriture]   = useState<"jour" | "semaine">("jour");

  useEffect(() => { chargerTheme(); }, []);

  async function chargerTheme() {
    try {
      const res = await fetch("/api/generer-theme-ecriture");
      const data = await res.json();
      if (data?.id || data?.planifie) {
        setThemeJour(data);
        setAvecContrainte(data.afficher_contrainte ?? true);
        setModeEcriture(data.mode ?? "jour");
      }
    } catch { /* silencieux */ }
  }

  async function changerMode(mode: "jour" | "semaine") {
    if (modeEcriture === mode) return;
    setModeEcriture(mode);
    setEnGeneration(true);
    try {
      // Régénérer un thème adapté au nouveau mode
      const res = await fetch("/api/reinitialiser-theme-ecriture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (data?.ok && data.theme) {
        setThemeJour({ ...data.theme, affecte: true });
        setAvecContrainte(data.theme.afficher_contrainte ?? true);
        setModeEdition(false);
      }
    } finally {
      setEnGeneration(false);
    }
  }

  async function regenerer() {
    setEnGeneration(true);
    try {
      const res = await fetch("/api/reinitialiser-theme-ecriture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: modeEcriture }),
      });
      const data = await res.json();
      if (data?.ok && data.theme) {
        setThemeJour({ ...data.theme, affecte: true });
        setAvecContrainte(data.theme.afficher_contrainte ?? true);
        setModeEdition(false);
      }
    } finally {
      setEnGeneration(false);
    }
  }

  async function affecter() {
    if (!themeJour) return;
    setEnAffectation(true);
    try {
      const res = await fetch("/api/affecter-theme-ecriture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme_id: themeJour.id }),
      });
      const data = await res.json();
      if (data?.deja_planifie) {
        alert("Des blocs écriture sont déjà planifiés pour cette période (via la page Nouvelle semaine). Le thème n'a pas été affecté pour éviter les doublons.");
      } else if (data?.ok) {
        setThemeJour((prev) => prev ? { ...prev, affecte: true } : prev);
      }
    } finally {
      setEnAffectation(false);
    }
  }

  async function toggleContrainte() {
    const newVal = !avecContrainte;
    setAvecContrainte(newVal);
    if (themeJour) {
      setThemeJour((prev) => prev ? { ...prev, afficher_contrainte: newVal } : prev);
      await fetch("/api/affecter-theme-ecriture", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme_id: themeJour.id, afficher_contrainte: newVal }),
      });
    }
  }

  async function sauvegarderEdition() {
    if (!themeJour) return;
    setEnSauvegarde(true);
    try {
      const res = await fetch("/api/affecter-theme-ecriture", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme_id: themeJour.id, sujet: editSujet, contrainte: editContrainte }),
      });
      const data = await res.json();
      if (data?.ok) {
        setThemeJour((prev) => prev ? { ...prev, sujet: editSujet, contrainte: editContrainte } : prev);
        setModeEdition(false);
      }
    } finally {
      setEnSauvegarde(false);
    }
  }

  return (
    <div style={{
      background: "linear-gradient(135deg, #7C3AED08, #7C3AED14)",
      border: "1.5px solid rgba(124,58,237,0.2)",
      borderRadius: 20,
      padding: "16px 20px",
      marginBottom: 20,
    }}>
      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="ms" style={{ fontSize: 18 }}>edit</span>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#7C3AED" }}>
            {modeEcriture === "semaine" ? "Atelier d\u2019écriture (semaine)" : "Thème d\u2019écriture du jour"}
          </span>
          {/* Toggle jour/semaine */}
          {!themeJour?.planifie && (
            <div style={{ display: "flex", gap: 2, background: "rgba(124,58,237,0.1)", borderRadius: 8, padding: 2, marginLeft: 8 }}>
              {(["jour", "semaine"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => changerMode(m)}
                  style={{
                    padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                    border: "none", cursor: "pointer",
                    background: modeEcriture === m ? "#7C3AED" : "transparent",
                    color: modeEcriture === m ? "white" : "#7C3AED",
                    fontFamily: "inherit", transition: "all 0.15s",
                  }}
                >
                  {m === "jour" ? "Jour" : "Semaine"}
                </button>
              ))}
            </div>
          )}
          {themeJour?.planifie && (
            <span style={{ fontSize: 11, fontWeight: 700, background: "#DBEAFE", color: "#1E40AF", padding: "2px 8px", borderRadius: 999 }}>
              <span className="ms" style={{ fontSize: 11, verticalAlign: "middle" }}>event_available</span> Planifié
            </span>
          )}
          {themeJour?.affecte && !themeJour?.planifie && (
            <span style={{ fontSize: 11, fontWeight: 700, background: "#D1FAE5", color: "#065F46", padding: "2px 8px", borderRadius: 999 }}>
              <span className="ms" style={{ fontSize: 11, verticalAlign: "middle" }}>check_circle</span> Affecté
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {themeJour && !modeEdition && !themeJour.planifie && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: "#6B7280", fontWeight: 600 }}>
              <div
                onClick={toggleContrainte}
                style={{ width: 32, height: 18, borderRadius: 999, cursor: "pointer", background: avecContrainte ? "#7C3AED" : "#D1D5DB", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
              >
                <div style={{ position: "absolute", top: 2, left: avecContrainte ? 15 : 2, width: 14, height: 14, borderRadius: "50%", background: "white", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
              </div>
              Contrainte
            </label>
          )}
          {themeJour && !modeEdition && !themeJour.affecte && !themeJour.planifie && (
            <button
              onClick={affecter}
              disabled={enAffectation}
              style={{ background: "#7C3AED", color: "white", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: enAffectation ? 0.6 : 1, fontFamily: "inherit" }}
            >
              {enAffectation ? "Affectation…" : "Affecter"}
            </button>
          )}
          {themeJour && !modeEdition && !themeJour.planifie && (
            <button
              onClick={() => { setEditSujet(themeJour.sujet); setEditContrainte(themeJour.contrainte); setModeEdition(true); }}
              style={{ background: "white", color: "#6B7280", border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>edit</span> Modifier
            </button>
          )}
          {!modeEdition && !themeJour?.planifie && (
            <button
              onClick={regenerer}
              disabled={enGeneration}
              style={{ background: "white", color: "#7C3AED", border: "1.5px solid rgba(124,58,237,0.3)", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: enGeneration ? 0.6 : 1, fontFamily: "inherit" }}
            >
              {enGeneration ? "Génération…" : !themeJour ? "Générer" : <><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>refresh</span> Régénérer</>}
            </button>
          )}
        </div>
      </div>

      {/* Contenu */}
      {modeEdition ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 4, display: "block" }}>Sujet</label>
            <input type="text" value={editSujet} onChange={(e) => setEditSujet(e.target.value)} className="form-input" style={{ fontSize: 14, marginBottom: 0 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 4, display: "block" }}>Contrainte</label>
            <input type="text" value={editContrainte} onChange={(e) => setEditContrainte(e.target.value)} className="form-input" style={{ fontSize: 14, marginBottom: 0 }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={sauvegarderEdition} disabled={enSauvegarde} style={{ background: "#7C3AED", color: "white", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: enSauvegarde ? 0.6 : 1 }}>
              {enSauvegarde ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button onClick={() => setModeEdition(false)} style={{ background: "white", color: "#6B7280", border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Annuler
            </button>
          </div>
        </div>
      ) : themeJour ? (
        <div>
          <p style={{ fontWeight: 800, fontSize: 15, color: "#111827", fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 4, lineHeight: 1.4 }}>
            {themeJour.sujet}
          </p>
          {avecContrainte && themeJour.contrainte && (
            <p style={{ fontSize: 13, color: "#5B21B6", fontStyle: "italic", margin: 0 }}>
              <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>push_pin</span> {themeJour.contrainte}
            </p>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>Aucun thème généré aujourd&apos;hui.</p>
      )}

      {/* Info planifié */}
      {themeJour?.planifie && !modeEdition && (
        <p style={{ fontSize: 11, color: "#6B7280", margin: "8px 0 0", fontStyle: "italic" }}>
          <span className="ms" style={{ fontSize: 13, verticalAlign: "middle" }}>info</span>{" "}
          Ce thème a été planifié via la page « Nouvelle semaine ».
        </p>
      )}

      {/* Planning semaine */}
      {modeEcriture === "semaine" && themeJour && !modeEdition && (
        <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
          {[
            { label: "J1 Lundi", desc: "Premier jet", icon: "edit_note" },
            { label: "J2 Mardi", desc: "Correction 1", icon: "spellcheck" },
            { label: "J3 Jeudi", desc: "Correction 2", icon: "rate_review" },
            { label: "J4 Vendredi", desc: "Finalisation", icon: "task_alt" },
          ].map((j, i) => {
            const dayOfWeek = new Date().getDay();
            const jourMap = [1, 2, 4, 5]; // lundi, mardi, jeudi, vendredi
            const isToday = dayOfWeek === jourMap[i];
            const isPast = jourMap[i] < dayOfWeek;
            return (
              <div key={j.label} style={{
                flex: 1, padding: "8px 6px", borderRadius: 10, textAlign: "center",
                background: isToday ? "#7C3AED" : isPast ? "#D1FAE5" : "rgba(124,58,237,0.06)",
                border: isToday ? "none" : "1px solid rgba(124,58,237,0.12)",
              }}>
                <span className="ms" style={{ fontSize: 16, color: isToday ? "white" : isPast ? "#065F46" : "#7C3AED", display: "block", marginBottom: 2 }}>{j.icon}</span>
                <div style={{ fontSize: 10, fontWeight: 700, color: isToday ? "white" : isPast ? "#065F46" : "#7C3AED" }}>{j.label}</div>
                <div style={{ fontSize: 9, color: isToday ? "rgba(255,255,255,0.7)" : "var(--pb-on-surface-variant)" }}>{j.desc}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface DicteeDiffusable {
  dictee_parent_id: string;
  date_assignation: string;
  titre: string;
  niveau_etoiles: number | null;
  nb_eleves: number;
  nb_faits: number;
  correction_diffusee_le: string | null;
  blocs_ids: string[];
}

function WidgetCorrectionsDictee() {
  const [dictees, setDictees] = useState<DicteeDiffusable[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enAction, setEnAction] = useState<string | null>(null);

  async function charger() {
    setChargement(true);
    try {
      const res = await fetch("/api/enseignant/diffuser-correction-dictee?portee=semaine");
      const data = await res.json();
      setDictees(data.dictees ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => { charger(); }, []);

  async function diffuser(d: DicteeDiffusable, diffuser: boolean) {
    const key = `${d.dictee_parent_id}|${d.date_assignation}`;
    setEnAction(key);
    try {
      const res = await fetch("/api/enseignant/diffuser-correction-dictee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dictee_parent_id: d.dictee_parent_id,
          date_assignation: d.date_assignation,
          diffuser,
        }),
      });
      if (!res.ok) throw new Error("Échec diffusion");
      // Mise à jour optimiste
      setDictees((prev) =>
        prev.map((x) =>
          x.dictee_parent_id === d.dictee_parent_id && x.date_assignation === d.date_assignation
            ? { ...x, correction_diffusee_le: diffuser ? new Date().toISOString() : null }
            : x,
        ),
      );
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la diffusion");
    } finally {
      setEnAction(null);
    }
  }

  if (chargement) return null;
  if (dictees.length === 0) return null;

  // On n'affiche que les 5 plus récentes pour ne pas encombrer
  const afficher = dictees.slice(0, 5);

  return (
    <div style={{
      background: "linear-gradient(135deg, #7c3aed0a, #7c3aed14)",
      border: "1.5px solid rgba(124,58,237,0.22)",
      borderRadius: 20,
      padding: "16px 20px",
      marginBottom: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span className="ms" style={{ fontSize: 18, color: "#7c3aed" }}>spellcheck</span>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5b21b6" }}>
          Corrections de dictée
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {afficher.map((d) => {
          const key = `${d.dictee_parent_id}|${d.date_assignation}`;
          const diffusee = !!d.correction_diffusee_le;
          const enCours = enAction === key;
          const dateFr = new Date(d.date_assignation).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
          return (
            <div
              key={key}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "8px 12px", borderRadius: 12,
                background: "white",
                border: "1px solid rgba(124,58,237,0.12)",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface)" }}>
                  {d.titre}
                </div>
                <div style={{ fontSize: 11, color: "var(--pb-on-surface-variant)", marginTop: 2 }}>
                  {dateFr}
                  {d.niveau_etoiles ? ` · ${"⭐".repeat(d.niveau_etoiles)}` : ""}
                  {` · ${d.nb_faits}/${d.nb_eleves} élève${d.nb_eleves > 1 ? "s" : ""} fait${d.nb_faits > 1 ? "s" : ""}`}
                </div>
              </div>
              {diffusee ? (
                <button
                  onClick={() => diffuser(d, false)}
                  disabled={enCours}
                  style={{
                    padding: "6px 12px", borderRadius: 999, fontSize: 12,
                    fontWeight: 600, cursor: enCours ? "wait" : "pointer",
                    border: "1px solid #d1d5db", background: "white",
                    color: "#4b5563",
                    display: "flex", alignItems: "center", gap: 4,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  <span className="ms" style={{ fontSize: 14, color: "#16a34a" }}>check_circle</span>
                  Diffusée · annuler
                </button>
              ) : (
                <button
                  onClick={() => diffuser(d, true)}
                  disabled={enCours}
                  style={{
                    padding: "6px 14px", borderRadius: 999, fontSize: 12,
                    fontWeight: 700, cursor: enCours ? "wait" : "pointer",
                    border: "none", background: "#7c3aed",
                    color: "white",
                    display: "flex", alignItems: "center", gap: 4,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  <span className="ms" style={{ fontSize: 14 }}>send</span>
                  Diffuser la correction
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: "var(--pb-on-surface-variant)", marginTop: 10, marginBottom: 0 }}>
        Les élèves voient alors le texte attendu dans leur bloc dictée avec des consignes de relecture.
      </p>
    </div>
  );
}

function WidgetCeintures() {
  const [config, setConfig] = useState<{ id: string; nom: string; actif: boolean }[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      fetch(`/api/ceinture-config?enseignant_id=${data.user.id}`)
        .then((r) => r.json())
        .then((d) => setConfig(d.groupes ?? []))
        .catch(() => {});
    });
  }, []);

  async function toggle(groupeId: string, actif: boolean) {
    setConfig((prev) => prev.map((g) => g.id === groupeId ? { ...g, actif } : g));
    await fetch("/api/ceinture-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupe_id: groupeId, actif }),
    });
  }

  if (config.length === 0) return null;

  return (
    <div style={{
      background: "linear-gradient(135deg, #F59E0B08, #F59E0B14)",
      border: "1.5px solid rgba(245,158,11,0.2)",
      borderRadius: 20,
      padding: "16px 20px",
      marginBottom: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span className="ms" style={{ fontSize: 18, color: "#F59E0B" }}>military_tech</span>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#B45309" }}>
          Ceintures de multiplications
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {config.map((g) => (
          <button
            key={g.id}
            onClick={() => toggle(g.id, !g.actif)}
            style={{
              padding: "8px 16px", borderRadius: 999, fontSize: 13,
              fontWeight: 600, cursor: "pointer", border: "none",
              background: g.actif ? "#F59E0B" : "var(--pb-surface-container, #f0f0f0)",
              color: g.actif ? "white" : "var(--pb-on-surface-variant)",
              display: "flex", alignItems: "center", gap: 6,
              transition: "all 0.2s",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            <span className="ms" style={{ fontSize: 16 }}>
              {g.actif ? "check_circle" : "radio_button_unchecked"}
            </span>
            {g.nom}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 11, color: "var(--pb-on-surface-variant)", marginTop: 10, marginBottom: 0 }}>
        Les élèves des groupes activés verront un entraînement quotidien sur les tables de multiplication.
      </p>
    </div>
  );
}

export default function DashboardEnseignant() {
  const router = useRouter();
  const supabase = createClient();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [chargement, setChargement] = useState(true);
  const [activeTab, setActiveTab] = useState<TabSidebar>("blocs");

  useEffect(() => {
    async function charger() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Si cet onglet est marqué enseignant (sessionStorage), ne pas rediriger
        // car c'est probablement un conflit avec l'onglet élève
        const role = typeof window !== "undefined" ? sessionStorage.getItem("pb_role") : null;
        if (role === "enseignant") return; // Garder le contenu en cache
        router.push("/enseignant");
        return;
      }

      const { data: notifsData } = await supabase
        .from("notifications")
        .select("*, eleves(prenom, nom), chapitres(titre)")
        .eq("lu", false)
        .order("created_at", { ascending: false })
        .limit(10);

      setNotifications((notifsData ?? []) as Notification[]);
      setChargement(false);
    }
    charger();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function marquerNotifLue(id: string) {
    await supabase.from("notifications").update({ lu: true }).eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  if (chargement) {
    return (
      <>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 70, borderRadius: 16, marginBottom: 12 }} />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {/* ── Bannière Hero ── */}
      <section className="ens-hero">
        <div className="ens-hero-text">
          <h2>Bonjour 👋</h2>
          <p>Voici le programme de vos élèves pour aujourd&apos;hui.</p>
        </div>
        <AujourdhuiSection variant="hero" />
      </section>

      {/* ── Tabs ── */}
      <div className="ens-view-tabs">
        {([
          { key: "blocs" as const, label: "Programme du jour" },
          { key: "suivi" as const, label: "Suivi du jour" },
          { key: "feedback" as const, label: "Feedback" },
          { key: "eleves" as const, label: "Progression élèves" },
          { key: "ceintures" as const, label: "Ceintures" },
        ]).map(({ key, label }) => (
          <button
            key={key}
            className={`ens-view-tab${activeTab === key ? " active" : ""}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Vue active ── */}
      {activeTab === "blocs" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Programme du jour — pleine largeur */}
          <div>
            <h3 className="ens-section-title">Programme du jour</h3>
            <WidgetThemeEcriture />
            <WidgetCorrectionsDictee />
            <WidgetCeintures />
            <ProgrammeJourView />
          </div>

          {/* Notifications + Astuce côte à côte */}
          <div style={{ display: "grid", gridTemplateColumns: notifications.length > 0 ? "1fr 1fr" : "1fr", gap: 24 }}>
            {notifications.length > 0 && (
              <div className="ens-student-card">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <span className="ms" style={{ fontSize: 20, color: "var(--pb-primary)" }}>notifications</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--pb-on-surface)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Notifications
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, background: "#ef4444", color: "white", padding: "2px 8px", borderRadius: 999 }}>
                    {notifications.length}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {notifications.map((notif) => (
                    <NotifCard key={notif.id} notif={notif} onMarquerLu={marquerNotifLue} />
                  ))}
                </div>
              </div>
            )}

            <div className="ens-tip-card">
              <h4>
                <span className="ms" style={{ fontSize: 20, color: "var(--pb-primary)" }}>lightbulb</span>
                Astuce du jour
              </h4>
              <p>
                Saviez-vous que vous pouvez générer des QR codes individuels pour faciliter la connexion de vos élèves sans mot de passe ?
              </p>
              <a href="/enseignant/admin/qrcodes">En savoir plus</a>
            </div>
          </div>
        </div>
      )}

      {activeTab === "suivi" && <SuiviJourView />}
      {activeTab === "feedback" && <FeedbackView />}
      {activeTab === "eleves" && <ProgressionElevesView />}
      {activeTab === "ceintures" && <CeinturesView />}
    </>
  );
}
