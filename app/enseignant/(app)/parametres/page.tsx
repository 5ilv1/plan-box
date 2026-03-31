"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import MatieresView from "@/components/dashboard/MatieresView";

interface JourSansEcole {
  id: string;
  label: string;
  date_debut: string;
  date_fin: string;
}

export default function ParametresPage() {
  const supabase = createClient();

  // Zone scolaire
  const [zone, setZone] = useState<"A" | "B" | "C">("A");
  const [zoneSaving, setZoneSaving] = useState(false);
  const [zoneMsg, setZoneMsg] = useState("");

  // Jours sans école
  const [jours, setJours] = useState<JourSansEcole[]>([]);
  const [jourLabel, setJourLabel] = useState("");
  const [jourDebut, setJourDebut] = useState("");
  const [jourFin, setJourFin] = useState("");
  const [jourSaving, setJourSaving] = useState(false);
  const [jourMsg, setJourMsg] = useState("");
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    async function charger() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Charger zone scolaire depuis la table enseignant (mono-enseignant)
      const { data: ensData } = await supabase
        .from("enseignant")
        .select("zone_scolaire")
        .limit(1)
        .single();

      if (ensData?.zone_scolaire) setZone(ensData.zone_scolaire as "A" | "B" | "C");

      // Charger les jours sans école
      const { data: joursData } = await (supabase as any)
        .from("jours_sans_ecole")
        .select("*")
        .order("date_debut");

      setJours(joursData ?? []);
      setChargement(false);
    }
    charger();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sauvegarderZone() {
    setZoneSaving(true);
    setZoneMsg("");
    const res = await fetch("/api/admin/parametres/zone", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zone }),
    });
    setZoneSaving(false);
    setZoneMsg(res.ok ? "✓ Zone enregistrée" : "Erreur lors de la sauvegarde");
    setTimeout(() => setZoneMsg(""), 3000);
  }

  async function ajouterJour(e: React.FormEvent) {
    e.preventDefault();
    if (!jourLabel || !jourDebut || !jourFin) return;
    setJourSaving(true);
    setJourMsg("");

    const res = await fetch("/api/admin/parametres/jours-sans-ecole", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: jourLabel, date_debut: jourDebut, date_fin: jourFin }),
    });

    if (res.ok) {
      const { jour } = await res.json();
      setJours(prev => [...prev, jour].sort((a, b) => a.date_debut.localeCompare(b.date_debut)));
      setJourLabel("");
      setJourDebut("");
      setJourFin("");
      setJourMsg("✓ Ajouté");
    } else {
      setJourMsg("Erreur lors de l'ajout");
    }

    setJourSaving(false);
    setTimeout(() => setJourMsg(""), 3000);
  }

  async function supprimerJour(id: string) {
    const res = await fetch(`/api/admin/parametres/jours-sans-ecole?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setJours(prev => prev.filter(j => j.id !== id));
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: "9px 14px",
    borderRadius: "0.75rem",
    border: "1.5px solid var(--ens-outline-variant)",
    fontSize: 13,
    fontFamily: "inherit",
    background: "white",
    color: "var(--ens-on-surface)",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--ens-on-surface-variant)",
    marginBottom: 6,
    display: "block",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  return (
    <>
      <h2 className="ens-page-title">Paramètres</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 32, marginTop: 24 }}>

        {/* ── Section : Zone scolaire ── */}
        <section style={{ background: "white", borderRadius: "1.25rem", padding: "24px 28px", border: "1px solid var(--ens-outline-variant)", boxShadow: "0 1px 4px rgba(0,0,48,0.05)" }}>
          <h3 className="ens-section-title" style={{ marginBottom: 6 }}>
            <span className="ms" style={{ fontSize: 20, verticalAlign: "middle", marginRight: 8 }}>school</span>
            Zone scolaire
          </h3>
          <p style={{ fontSize: 13, color: "var(--ens-on-surface-variant)", marginBottom: 20 }}>
            Utilisée pour calculer les vacances scolaires lors de la réaffectation automatique des exercices échoués.
          </p>

          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            {(["A", "B", "C"] as const).map(z => (
              <button
                key={z}
                onClick={() => setZone(z)}
                style={{
                  padding: "10px 28px",
                  borderRadius: "0.75rem",
                  border: `2px solid ${zone === z ? "var(--ens-primary)" : "var(--ens-outline-variant)"}`,
                  background: zone === z ? "var(--ens-primary)" : "white",
                  color: zone === z ? "white" : "var(--ens-on-surface-variant)",
                  fontWeight: 700,
                  fontSize: 16,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                Zone {z}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              className="ens-btn primary"
              onClick={sauvegarderZone}
              disabled={zoneSaving}
            >
              {zoneSaving ? "Enregistrement…" : "Enregistrer"}
            </button>
            {zoneMsg && (
              <span style={{ fontSize: 13, fontWeight: 600, color: zoneMsg.startsWith("✓") ? "#16A34A" : "#DC2626" }}>
                {zoneMsg}
              </span>
            )}
          </div>
        </section>

        {/* ── Section : Jours sans école ── */}
        <section style={{ background: "white", borderRadius: "1.25rem", padding: "24px 28px", border: "1px solid var(--ens-outline-variant)", boxShadow: "0 1px 4px rgba(0,0,48,0.05)" }}>
          <h3 className="ens-section-title" style={{ marginBottom: 6 }}>
            <span className="ms" style={{ fontSize: 20, verticalAlign: "middle", marginRight: 8 }}>event_busy</span>
            Jours sans école
          </h3>
          <p style={{ fontSize: 13, color: "var(--ens-on-surface-variant)", marginBottom: 20 }}>
            Ajoutez des périodes spécifiques (journées pédagogiques, sorties de classe, etc.)
            qui seront exclues lors du calcul du prochain jour d'école.
          </p>

          {/* Formulaire ajout */}
          <form onSubmit={ajouterJour} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 12, alignItems: "end", marginBottom: 24 }}>
            <div>
              <label style={labelStyle}>Libellé</label>
              <input
                type="text"
                value={jourLabel}
                onChange={e => setJourLabel(e.target.value)}
                placeholder="Ex : Journée pédagogique"
                style={{ ...inputStyle, width: "100%" }}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Du</label>
              <input
                type="date"
                value={jourDebut}
                onChange={e => setJourDebut(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Au</label>
              <input
                type="date"
                value={jourFin}
                onChange={e => setJourFin(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <button
              type="submit"
              className="ens-btn primary"
              disabled={jourSaving}
              style={{ height: 40 }}
            >
              <span className="ms" style={{ fontSize: 18 }}>add</span>
              Ajouter
            </button>
          </form>

          {jourMsg && (
            <p style={{ fontSize: 13, fontWeight: 600, color: jourMsg.startsWith("✓") ? "#16A34A" : "#DC2626", marginBottom: 16 }}>
              {jourMsg}
            </p>
          )}

          {/* Liste */}
          {chargement ? (
            <p style={{ color: "var(--ens-on-surface-variant)", fontSize: 13 }}>Chargement…</p>
          ) : jours.length === 0 ? (
            <p style={{ color: "var(--ens-on-surface-variant)", fontSize: 13 }}>Aucune exception définie.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {jours.map(j => (
                <div
                  key={j.id}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px", borderRadius: "0.75rem",
                    background: "var(--ens-surface-container-low)",
                    border: "1px solid var(--ens-outline-variant)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ens-on-surface)" }}>{j.label}</div>
                    <div style={{ fontSize: 12, color: "var(--ens-on-surface-variant)", marginTop: 2 }}>
                      {new Date(j.date_debut + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                      {j.date_debut !== j.date_fin && (
                        <> → {new Date(j.date_fin + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => supprimerJour(j.id)}
                    style={{
                      padding: "6px 12px", borderRadius: "0.5rem",
                      border: "1px solid #FECACA", background: "#FEF2F2",
                      color: "#DC2626", cursor: "pointer", fontSize: 12, fontWeight: 600,
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Section : Matières ── */}
        <section style={{ background: "white", borderRadius: "1.25rem", padding: "24px 28px", border: "1px solid var(--ens-outline-variant)", boxShadow: "0 1px 4px rgba(0,0,48,0.05)" }}>
          <h3 className="ens-section-title" style={{ marginBottom: 16 }}>
            <span className="ms" style={{ fontSize: 20, verticalAlign: "middle", marginRight: 8 }}>palette</span>
            Matières
          </h3>
          <MatieresView />
        </section>

      </div>
    </>
  );
}
