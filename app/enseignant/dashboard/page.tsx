"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import EnseignantLayout from "@/components/EnseignantLayout";
import { Notification } from "@/types";
import NotifCard from "@/components/NotifCard";
import AujourdhuiSection from "@/components/dashboard/AujourdhuiSection";
import ProgrammeJourView from "@/components/dashboard/ProgrammeJourView";
import ProgressionElevesView from "@/components/dashboard/ProgressionElevesView";
import FeedbackView from "@/components/dashboard/FeedbackView";

type TabSidebar = "blocs" | "eleves" | "feedback";

interface ThemeEcriture {
  id: string;
  sujet: string;
  contrainte: string;
  affecte: boolean;
  afficher_contrainte: boolean;
  mode: "jour" | "semaine";
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
      if (data?.id) {
        setThemeJour(data);
        setAvecContrainte(data.afficher_contrainte ?? true);
        setModeEcriture(data.mode ?? "jour");
      }
    } catch { /* silencieux */ }
  }

  async function changerMode(mode: "jour" | "semaine") {
    setModeEcriture(mode);
    if (themeJour) {
      await fetch("/api/affecter-theme-ecriture", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme_id: themeJour.id, mode }),
      });
      setThemeJour((prev) => prev ? { ...prev, mode } : prev);
    }
  }

  async function regenerer() {
    setEnGeneration(true);
    try {
      const res = await fetch("/api/reinitialiser-theme-ecriture", { method: "POST" });
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
      if (data?.ok) setThemeJour((prev) => prev ? { ...prev, affecte: true } : prev);
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
          {themeJour?.affecte && (
            <span style={{ fontSize: 11, fontWeight: 700, background: "#D1FAE5", color: "#065F46", padding: "2px 8px", borderRadius: 999 }}>
              <span className="ms" style={{ fontSize: 11, verticalAlign: "middle" }}>check_circle</span> Affecté
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {themeJour && !modeEdition && (
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
          {themeJour && !modeEdition && !themeJour.affecte && (
            <button
              onClick={affecter}
              disabled={enAffectation}
              style={{ background: "#7C3AED", color: "white", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: enAffectation ? 0.6 : 1, fontFamily: "inherit" }}
            >
              {enAffectation ? "Affectation…" : "Affecter"}
            </button>
          )}
          {themeJour && !modeEdition && (
            <button
              onClick={() => { setEditSujet(themeJour.sujet); setEditContrainte(themeJour.contrainte); setModeEdition(true); }}
              style={{ background: "white", color: "#6B7280", border: "1.5px solid #E5E7EB", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>edit</span> Modifier
            </button>
          )}
          {!modeEdition && (
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
      <EnseignantLayout>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 70, borderRadius: 16, marginBottom: 12 }} />
          ))}
        </div>
      </EnseignantLayout>
    );
  }

  return (
    <EnseignantLayout>
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
          { key: "feedback" as const, label: "Feedback" },
          { key: "eleves" as const, label: "Progression élèves" },
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

      {activeTab === "feedback" && <FeedbackView />}
      {activeTab === "eleves" && <ProgressionElevesView />}
    </EnseignantLayout>
  );
}
