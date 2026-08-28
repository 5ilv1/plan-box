"use client";

import { useEffect, useState, useCallback } from "react";

interface BlocNiveau {
  type: string;
  libelle: string;
  icone: string;
  couleur: string;
  titre: string;
  nb_total: number;
  nb_faits: number;
}

interface Chapitre {
  titre: string;
  matiere: string;
  sous_matiere: string;
}

interface Niveau {
  nom: string;
  blocs: BlocNiveau[];
  chapitres: Chapitre[];
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

const MATIERE_COULEUR: Record<string, string> = {
  français:     "#7C3AED",
  maths:        "#D97706",
  sciences:     "#059669",
  histoire:     "#DC2626",
  géographie:   "#0891B2",
  arts:         "#EC4899",
};

const COULEURS_NIVEAU: Record<string, { bg: string; border: string; text: string }> = {
  CE2: { bg: "#EFF6FF", border: "#BFDBFE", text: "#1D4ED8" },
  CM1: { bg: "#F0FDF4", border: "#BBF7D0", text: "#15803D" },
  CM2: { bg: "#FFF7ED", border: "#FED7AA", text: "#C2410C" },
};

export default function VueJourPage() {
  const [niveaux, setNiveaux] = useState<Niveau[]>([]);
  const [dateSelectionnee, setDateSelectionnee] = useState(todayStr());
  const [chargement, setChargement] = useState(true);
  const [pleinEcran, setPleinEcran] = useState(false);

  const charger = useCallback(async (d: string) => {
    // Le sablier disparaît quoi qu'il arrive : sans ce `finally`, une
    // requête qui échoue laisse la page sur « Chargement… » indéfiniment.
    try {
      setChargement(true);
      const res = await fetch(`/api/admin/vue-jour?date=${d}`);
      if (!res.ok) { setChargement(false); return; }
      const json = await res.json();
      setNiveaux(json.niveaux ?? []);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(dateSelectionnee); }, [dateSelectionnee, charger]);

  useEffect(() => {
    if (dateSelectionnee !== todayStr()) return;
    const t = setInterval(() => charger(dateSelectionnee), 60_000);
    return () => clearInterval(t);
  }, [dateSelectionnee, charger]);

  const isToday = dateSelectionnee === todayStr();

  const dateLabel = new Date(dateSelectionnee + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  });

  function togglePleinEcran() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setPleinEcran(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setPleinEcran(false);
    }
  }

  useEffect(() => {
    const handler = () => setPleinEcran(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return (
    <div style={{ padding: "0 0 40px" }}>

      {/* ── Barre de navigation ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 28, flexWrap: "wrap", gap: 12,
      }}>
        {/* Titre + date */}
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 2 }}>
            <span className="ms" style={{ fontSize: 24, verticalAlign: "middle", marginRight: 8 }}>today</span>
            Vue du jour
          </h1>
          <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", textTransform: "capitalize" }}>
            {dateLabel}
            {isToday && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "var(--pb-primary)", background: "rgba(0,80,212,0.08)", padding: "2px 8px", borderRadius: 999 }}>Aujourd'hui</span>}
          </p>
        </div>

        {/* Contrôles */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => setDateSelectionnee((d) => addDays(d, -1))} className="btn-ghost" style={{ padding: "6px 10px" }} title="Jour précédent">
            <span className="ms" style={{ fontSize: 20 }}>chevron_left</span>
          </button>
          <button onClick={() => setDateSelectionnee((d) => addDays(d, 1))} className="btn-ghost" style={{ padding: "6px 10px" }} title="Jour suivant">
            <span className="ms" style={{ fontSize: 20 }}>chevron_right</span>
          </button>
          {!isToday && (
            <button onClick={() => setDateSelectionnee(todayStr())} className="btn-ghost" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <span className="ms" style={{ fontSize: 16 }}>today</span>
              Aujourd'hui
            </button>
          )}
          <div style={{ width: 1, height: 20, background: "var(--pb-outline-variant, #E0E0FF)" }} />
          <button onClick={() => charger(dateSelectionnee)} className="btn-ghost" style={{ padding: "6px 10px" }} title="Actualiser">
            <span className="ms" style={{ fontSize: 18 }}>refresh</span>
          </button>
          <button onClick={togglePleinEcran} className="btn-secondary" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
            <span className="ms" style={{ fontSize: 18 }}>{pleinEcran ? "fullscreen_exit" : "fullscreen"}</span>
            {pleinEcran ? "Quitter" : "Plein écran"}
          </button>
        </div>
      </div>

      {/* ── Skeleton ── */}
      {chargement && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 400, borderRadius: "1rem" }} />
          ))}
        </div>
      )}

      {/* ── Vide ── */}
      {!chargement && niveaux.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "var(--pb-on-surface-variant)" }}>
          <span className="ms" style={{ fontSize: 48, display: "block", marginBottom: 16, opacity: 0.3 }}>event_busy</span>
          <p style={{ fontSize: 16, fontWeight: 600 }}>Aucun bloc programmé ce jour.</p>
        </div>
      )}

      {/* ── Colonnes par niveau ── */}
      {!chargement && niveaux.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${niveaux.length}, 1fr)`,
          gap: 16,
          alignItems: "start",
        }}>
          {niveaux.map((niveau) => {
            const cfg = COULEURS_NIVEAU[niveau.nom] ?? { bg: "#F5F5FF", border: "#E0E0FF", text: "#4B5563" };
            const nbFaits = niveau.blocs.reduce((s, b) => s + b.nb_faits, 0);
            const nbTotal = niveau.blocs.reduce((s, b) => s + b.nb_total, 0);
            const pct = nbTotal > 0 ? Math.round((nbFaits / nbTotal) * 100) : 0;

            return (
              <div key={niveau.nom} style={{
                borderRadius: "1.25rem",
                border: `2px solid ${cfg.border}`,
                background: cfg.bg,
                overflow: "hidden",
              }}>
                {/* En-tête niveau */}
                <div style={{
                  padding: "16px 20px",
                  background: cfg.border,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{
                    fontSize: 20, fontWeight: 900,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    color: cfg.text,
                  }}>
                    {niveau.nom}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ height: 6, width: 80, background: "rgba(255,255,255,0.6)", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", width: `${pct}%`,
                        background: pct === 100 ? "#16A34A" : cfg.text,
                        borderRadius: 999, transition: "width 0.4s",
                      }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: cfg.text }}>{pct}%</span>
                  </div>
                </div>

                {/* Liste des blocs */}
                <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                  {niveau.blocs.length === 0 && (
                    <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", textAlign: "center", padding: "12px 0" }}>
                      Aucun bloc prévu ce jour
                    </p>
                  )}
                  {niveau.blocs.map((bloc, i) => {
                    const pctBloc = bloc.nb_total > 0 ? Math.round((bloc.nb_faits / bloc.nb_total) * 100) : 0;
                    const toutFait = bloc.nb_faits === bloc.nb_total && bloc.nb_total > 0;
                    return (
                      <div
                        key={i}
                        style={{
                          background: "white",
                          borderRadius: 10,
                          padding: "7px 10px",
                          borderLeft: `3px solid ${toutFait ? "#22C55E" : bloc.couleur}`,
                          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                          opacity: toutFait ? 0.75 : 1,
                          transition: "opacity 0.2s",
                        }}
                      >
                        {/* Type */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                          <span className="ms" style={{ fontSize: 12, color: toutFait ? "#22C55E" : bloc.couleur }}>
                            {toutFait ? "check_circle" : bloc.icone}
                          </span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: toutFait ? "#16A34A" : bloc.couleur,
                          }}>
                            {bloc.libelle}
                          </span>
                        </div>

                        {/* Titre + Progression sur une ligne */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{
                            fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0,
                            color: "var(--pb-on-surface)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {bloc.titre || bloc.libelle}
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: 700, flexShrink: 0,
                            color: toutFait ? "#16A34A" : "var(--pb-on-surface-variant)",
                          }}>
                            {bloc.nb_faits}/{bloc.nb_total}
                          </span>
                        </div>

                        {/* Barre de progression */}
                        <div style={{ height: 3, background: "var(--pb-outline-variant, #E8E8F4)", borderRadius: 999, overflow: "hidden", marginTop: 4 }}>
                          <div style={{
                            height: "100%", width: `${pctBloc}%`,
                            background: toutFait ? "#22C55E" : bloc.couleur,
                            borderRadius: 999, transition: "width 0.4s",
                          }} />
                        </div>
                      </div>
                    );
                  })}
                  {/* ── Chapitres en cours ── */}
                  {niveau.chapitres?.length > 0 && (
                    <div style={{ marginTop: niveau.blocs.length > 0 ? 8 : 0 }}>
                      <div style={{
                        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: "0.08em", color: "var(--pb-on-surface-variant)",
                        padding: "6px 2px 4px",
                      }}>
                        Chapitres en cours
                      </div>
                      {niveau.chapitres.map((ch, i) => (
                        <div key={i} style={{
                          background: "white",
                          borderRadius: 10,
                          padding: "9px 12px",
                          marginBottom: 6,
                          borderLeft: `3px solid ${ch.sous_matiere === "rituel-orthographe" ? "#D97706" : (MATIERE_COULEUR[ch.matiere] ?? "#9CA3AF")}`,
                          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              color: ch.sous_matiere === "rituel-orthographe" ? "#D97706" : (MATIERE_COULEUR[ch.matiere] ?? "#9CA3AF"),
                            }}>
                              {ch.sous_matiere === "rituel-orthographe" ? "Ma P'tite Règle" : (ch.sous_matiere || ch.matiere)}
                            </span>
                          </div>
                          <div style={{
                            fontSize: 13, fontWeight: 600,
                            color: "var(--pb-on-surface)",
                            marginTop: 2, lineHeight: 1.3,
                          }}>
                            {ch.titre}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
