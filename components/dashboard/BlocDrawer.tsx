"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { TYPE_BLOC_CONFIG, STATUT_BLOC_CONFIG, StatutBloc } from "@/types";
import { BlocGroupe } from "./BlocJourCard";

interface BlocDrawerProps {
  bloc: BlocGroupe | null;
  onClose: () => void;
  onClickEleve: (eleveId: string, prenom: string) => void;
  onRefresh: () => void;
  inline?: boolean;
}

function getISOWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const diff = (d.getTime() - startOfWeek1.getTime()) / (7 * 24 * 3600 * 1000);
  const week = Math.floor(diff) + 1;
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function lundiDeSemaine(semaine: string): string {
  const [annee, w] = semaine.split("-W");
  const numSemaine = parseInt(w, 10);
  const jan4 = new Date(parseInt(annee, 10), 0, 4);
  const lundi = new Date(jan4);
  lundi.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (numSemaine - 1) * 7);
  const y = lundi.getFullYear();
  const m = String(lundi.getMonth() + 1).padStart(2, "0");
  const day = String(lundi.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function InfoPill({ label, value, couleur }: { label: string; value: string; couleur?: string }) {
  return (
    <div style={{ backgroundColor: "var(--bg)", borderRadius: 10, padding: "8px 14px" }}>
      <div className="text-xs text-secondary" style={{ marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: couleur ?? "var(--text)" }}>{value}</div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "var(--text-secondary)",
  textTransform: "uppercase", letterSpacing: "0.05em",
  display: "block", marginBottom: 6,
};

export default function BlocDrawer({ bloc, onClose, onClickEleve, onRefresh, inline = false }: BlocDrawerProps) {
  const supabase = createClient();

  const [modeEdition, setModeEdition] = useState(false);
  const [confirmationSuppr, setConfirmationSuppr] = useState(false);
  const [suppression, setSuppression] = useState(false);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [enregistrementBiblio, setEnregistrementBiblio] = useState(false);
  const [messageSucces, setMessageSucces] = useState("");

  const [titre, setTitre] = useState("");
  const [periodicite, setPeriodicite] = useState<"jour" | "semaine">("jour");
  const [dateAssignation, setDateAssignation] = useState("");
  const [semaineAssignation, setSemaineAssignation] = useState("");
  const [dateLimite, setDateLimite] = useState("");

  useEffect(() => {
    if (bloc) {
      setModeEdition(false);
      setConfirmationSuppr(false);
      setMessageSucces("");
      setTitre(bloc.titre);
      setPeriodicite(bloc.periodicite ?? "jour");
      setDateAssignation(bloc.dateAssignation);
      setSemaineAssignation(getISOWeek(bloc.dateAssignation));
      setDateLimite(bloc.dateLimite ?? "");
    }
  }, [bloc]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function sauvegarderModifications() {
    if (!bloc) return;
    setSauvegarde(true);
    const ids = bloc.eleves.map((e) => e.planTravailId);
    const dateFinale = periodicite === "semaine" ? lundiDeSemaine(semaineAssignation) : dateAssignation;

    await supabase
      .from("plan_travail")
      .update({ titre, periodicite, date_assignation: dateFinale, date_limite: dateLimite || null })
      .in("id", ids);

    setSauvegarde(false);
    setMessageSucces("Modifications enregistrées");
    setTimeout(() => setMessageSucces(""), 3000);
    setModeEdition(false);
    onRefresh();
  }

  async function supprimerBloc() {
    if (!bloc) return;
    setSuppression(true);
    const ids = bloc.eleves.map((e) => e.planTravailId);
    await fetch("/api/supprimer-plan-travail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setSuppression(false);
    onClose();
    onRefresh();
  }

  async function enregistrerDansBibliotheque() {
    if (!bloc) return;
    setEnregistrementBiblio(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setEnregistrementBiblio(false); return; }

    const premierPlanId = bloc.eleves[0]?.planTravailId;
    if (!premierPlanId) { setEnregistrementBiblio(false); return; }

    const { data: pt } = await supabase
      .from("plan_travail").select("contenu").eq("id", premierPlanId).single();

    const contenu = (pt?.contenu ?? {}) as Record<string, unknown>;
    const taches = contenu?.taches as { sous_type?: string }[] | undefined;
    const premierSousType = taches?.[0]?.sous_type ?? (contenu?.sous_type as string) ?? "ressource";

    const res = await fetch("/api/bibliotheque-ressources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enseignant_id: user.id,
        titre: bloc.titre,
        sous_type: premierSousType,
        contenu,
        matiere: (contenu?.matiere as string) ?? null,
      }),
    });

    setEnregistrementBiblio(false);
    if (res.ok) {
      setMessageSucces("Enregistré dans la bibliothèque !");
      setTimeout(() => setMessageSucces(""), 4000);
    }
  }

  if (!bloc) return null;

  const cfg = TYPE_BLOC_CONFIG[bloc.type] ?? { icone: "assignment", libelle: bloc.type, couleur: "#6B7280" };
  const faits = bloc.eleves.filter((e) => e.statut === "fait").length;
  const estRessource  = bloc.type === "ressource" || bloc.type === "media";
  const estRepetibox  = bloc.type === "repetibox";

  const Wrapper = ({ children }: { children: React.ReactNode }) => inline ? (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: "var(--white)" }}>
      {children}
    </div>
  ) : (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 200, backdropFilter: "blur(2px)" }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(520px, 100vw)", backgroundColor: "var(--white)", boxShadow: "-8px 0 40px rgba(0,0,0,0.12)", zIndex: 201, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {children}
      </div>
    </>
  );

  return (
    <Wrapper>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, backgroundColor: "var(--bg)" }}>
          <span className="ms" style={{ fontSize: 24, lineHeight: 1, color: cfg.couleur }}>{cfg.icone}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: cfg.couleur, textTransform: "uppercase", letterSpacing: "0.05em" }}>{cfg.libelle}</div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {modeEdition ? (titre || bloc.titre) : bloc.titre}
            </h2>
          </div>
          {!estRepetibox && (
            <button
              onClick={() => { setModeEdition((v) => !v); setMessageSucces(""); }}
              style={{
                padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, flexShrink: 0,
                background: modeEdition ? "#FEE2E2" : "var(--bg)",
                color: modeEdition ? "#DC2626" : "var(--text-secondary)",
                border: modeEdition ? "1px solid #FCA5A5" : "1px solid var(--border)",
                fontFamily: "var(--font)",
              }}
            >
              {modeEdition ? "✕ Annuler" : <><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>edit</span> Modifier</>}
            </button>
          )}
          <button onClick={onClose} className="btn-ghost" style={{ width: 36, height: 36, borderRadius: "50%", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>×</button>
        </div>

        {/* Corps */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

          {messageSucces && (
            <div style={{ background: "#D1FAE5", color: "#065F46", padding: "10px 14px", borderRadius: 8, fontWeight: 600, fontSize: 13 }}>
              {messageSucces}
            </div>
          )}

          {/* ── MODE ÉDITION ── */}
          {modeEdition && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              <div>
                <label style={labelStyle}>Titre</label>
                <input type="text" value={titre} onChange={(e) => setTitre(e.target.value)} className="form-input" style={{ marginBottom: 0 }} />
              </div>

              <div>
                <label style={labelStyle}>Planification</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["jour", "semaine"] as const).map((p) => (
                    <button key={p} type="button" onClick={() => setPeriodicite(p)} style={{
                      flex: 1, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: "var(--font)",
                      fontWeight: periodicite === p ? 700 : 500,
                      background: periodicite === p ? "var(--primary)" : "white",
                      color: periodicite === p ? "white" : "var(--text-secondary)",
                      border: periodicite === p ? "none" : "1px solid var(--border)",
                    }}>
                      {p === "jour" ? <><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>calendar_today</span> Jour précis</> : <><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>date_range</span> Toute la semaine</>}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>{periodicite === "jour" ? "Date d'assignation" : "Semaine d'assignation"}</label>
                {periodicite === "jour" ? (
                  <input type="date" value={dateAssignation} onChange={(e) => setDateAssignation(e.target.value)} className="form-input" style={{ marginBottom: 0 }} />
                ) : (
                  <input type="week" value={semaineAssignation} onChange={(e) => setSemaineAssignation(e.target.value)} className="form-input" style={{ marginBottom: 0 }} />
                )}
              </div>

              <div>
                <label style={labelStyle}>Date limite <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optionnel)</span></label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="date" value={dateLimite} onChange={(e) => setDateLimite(e.target.value)} className="form-input" style={{ marginBottom: 0, flex: 1 }} />
                  {dateLimite && (
                    <button onClick={() => setDateLimite("")} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "white", cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}>✕</button>
                  )}
                </div>
              </div>

              <button className="btn-primary" onClick={sauvegarderModifications} disabled={sauvegarde || !titre.trim()} style={{ width: "100%", padding: "11px 16px" }}>
                {sauvegarde ? "Enregistrement…" : <><span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>save</span> Enregistrer les modifications</>}
              </button>

              {estRessource && (
                <button onClick={enregistrerDansBibliotheque} disabled={enregistrementBiblio} style={{
                  width: "100%", padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontFamily: "var(--font)",
                  background: "var(--primary-pale)", color: "var(--primary)",
                  border: "1.5px dashed var(--primary)", fontWeight: 600, fontSize: 13,
                }}>
                  {enregistrementBiblio ? "Enregistrement…" : <><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>library_books</span> Enregistrer dans la bibliothèque</>}
                </button>
              )}

            </div>
          )}

          {/* ── MODE LECTURE ── */}
          {!modeEdition && (
            <>
              {/* Infos générales — masquées pour Repetibox (pas de date d'assignation manuelle) */}
              {!estRepetibox && (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <InfoPill label="Assigné le" value={formatDate(bloc.dateAssignation)} />
                  <InfoPill label="Planification" value={bloc.periodicite === "semaine" ? "Semaine" : "Jour"} />
                  {bloc.dateLimite && <InfoPill label="Date limite" value={formatDate(bloc.dateLimite)} />}
                  <InfoPill label="Avancement" value={`${faits}/${bloc.eleves.length} faits`} couleur="var(--primary)" />
                </div>
              )}

              {/* Bandeau info Repetibox */}
              {estRepetibox && (
                <div style={{ background: "#EDE9FE", border: "1px solid #C4B5FD", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#5B21B6", fontWeight: 500 }}>
                  🔁 Cartes dues aujourd'hui dans Repetibox — {bloc.eleves.length} élève{bloc.eleves.length > 1 ? "s" : ""} concerné{bloc.eleves.length > 1 ? "s" : ""}
                </div>
              )}

              <div>
                <p style={labelStyle}>{estRepetibox ? "Élèves avec cartes à réviser" : "Élèves assignés"}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {bloc.eleves.map((eleve) => {
                    const statutKey: StatutBloc = (eleve.statut === "en_retard" ? "a_faire" : eleve.statut) as StatutBloc;
                    const statutCfg = STATUT_BLOC_CONFIG[statutKey] ?? STATUT_BLOC_CONFIG.a_faire;
                    return (
                      <div key={eleve.planTravailId} className="card" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{eleve.prenom} {eleve.nom}</span>
                        </div>
                        {estRepetibox ? (
                          eleve.detail === "nouveau" ? (
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#92400E", background: "#FEF3C7", padding: "2px 8px", borderRadius: 999, border: "1px solid #FDE68A" }}>
                              Jamais commencé
                            </span>
                          ) : eleve.detail === "0 carte" ? (
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#16A34A", background: "#DCFCE7", padding: "2px 8px", borderRadius: 999, border: "1px solid #86EFAC" }}>
                              <span className="ms" style={{ fontSize: 12, verticalAlign: "middle" }}>check</span> À jour
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#7C3AED", background: "#EDE9FE", padding: "2px 8px", borderRadius: 999, border: "1px solid #C4B5FD" }}>
                              {eleve.detail}
                            </span>
                          )
                        ) : (
                          <span className={`badge ${eleve.statut === "en_retard" ? "badge-error" : statutCfg.classe}`}>
                            {eleve.statut === "en_retard" ? "En retard" : statutCfg.libelle}
                          </span>
                        )}
                        {!estRepetibox && (
                          <button className="btn-ghost" onClick={() => { onClose(); onClickEleve(eleve.eleveId, eleve.prenom); }} style={{ fontSize: 13, padding: "4px 10px", borderRadius: 8 }}>
                            Voir →
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Suppression : uniquement pour les blocs plan_travail */}
              {!estRepetibox && (
                <div>
                  {!confirmationSuppr ? (
                    <button onClick={() => setConfirmationSuppr(true)} style={{ width: "100%", padding: "10px 16px", border: "1.5px solid #FCA5A5", borderRadius: 10, background: "#FFF1F2", color: "#DC2626", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                      <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>delete</span> Supprimer l&apos;assignation pour tous
                    </button>
                  ) : (
                    <div style={{ backgroundColor: "#FFF1F2", border: "1.5px solid #FCA5A5", borderRadius: 10, padding: 16 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#DC2626", marginBottom: 10 }}>
                        Supprimer pour les {bloc.eleves.length} élève{bloc.eleves.length > 1 ? "s" : ""} ?
                      </p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={supprimerBloc} disabled={suppression} className="btn-primary" style={{ flex: 1, padding: "8px 16px", backgroundColor: "#DC2626", borderColor: "#DC2626" }}>
                          {suppression ? "Suppression..." : "Confirmer"}
                        </button>
                        <button onClick={() => setConfirmationSuppr(false)} className="btn-secondary" style={{ flex: 1, padding: "8px 16px" }}>
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </Wrapper>
  );
}
