"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { TypeBloc, StatutBloc, TYPE_BLOC_CONFIG } from "@/types";
import { BlocGroupe, EleveBloc } from "./BlocJourCard";
import BlocDrawer from "./BlocDrawer";
import ElevePanel from "./ElevePanel";

interface LignePlanTravail {
  id: string;
  type: TypeBloc;
  titre: string;
  statut: StatutBloc;
  date_assignation: string;
  date_limite: string | null;
  periodicite: "jour" | "semaine" | null;
  eleve_id: string | null;
  repetibox_eleve_id: number | null;
  chapitre_id: string | null;
  groupe_label: string | null;
  eleve_prenom: string;
  eleve_nom: string;
}

function statutEffectif(statut: StatutBloc, dateLimite: string | null, today: string): StatutBloc | "en_retard" {
  if (statut === "fait") return "fait";
  if (dateLimite && dateLimite < today) return "en_retard";
  return statut;
}

function grouperBlocs(lignes: LignePlanTravail[], today: string): BlocGroupe[] {
  const map = new Map<string, BlocGroupe>();
  lignes.forEach((ligne) => {
    const cle = `${ligne.type}__${ligne.titre}__${ligne.chapitre_id ?? "null"}`;
    const statut = statutEffectif(ligne.statut, ligne.date_limite, today);
    if (!map.has(cle)) {
      map.set(cle, {
        cle, type: ligne.type, titre: ligne.titre, chapitreId: ligne.chapitre_id,
        eleves: [], dateAssignation: ligne.date_assignation, dateLimite: ligne.date_limite,
        periodicite: ligne.periodicite ?? "jour", groupeLabels: [],
      });
    }
    const bloc = map.get(cle)!;
    if (ligne.groupe_label && !bloc.groupeLabels.includes(ligne.groupe_label)) {
      bloc.groupeLabels.push(ligne.groupe_label);
    }
    const eleveId = ligne.eleve_id ?? `rb_${ligne.repetibox_eleve_id}`;
    const eleve: EleveBloc = { planTravailId: ligne.id, eleveId, prenom: ligne.eleve_prenom, nom: ligne.eleve_nom, statut };
    bloc.eleves.push(eleve);
  });
  return [...map.values()];
}

const ORDRE_TYPES: TypeBloc[] = ["dictee", "mots", "calcul_mental", "exercice", "eval", "ressource", "media", "libre", "repetibox"];

export default function ProgrammeJourView() {
  const [blocs, setBlocs] = useState<BlocGroupe[]>([]);
  const [chargement, setChargement] = useState(true);
  const [selectedBloc, setSelectedBloc] = useState<BlocGroupe | null>(null);
  const [selectedEleve, setSelectedEleve] = useState<{ id: string; prenom: string } | null>(null);
  const [suppression, setSuppression] = useState<string | null>(null); // cle du bloc en cours de suppression

  const today = new Date().toISOString().split("T")[0];

  const charger = useCallback(async () => {
    const [resPT, resRB] = await Promise.all([
      fetch("/api/admin/dashboard-aujourd-hui"),
      fetch("/api/admin/repetibox-blocs-jour"),
    ]);

    const jsonPT = resPT.ok ? await resPT.json() : { blocs: [] };
    const jsonRB = resRB.ok ? await resRB.json() : { groupeLabels: [], eleves: [] };

    // Blocs plan_travail normaux
    const grouped = grouperBlocs(jsonPT.blocs ?? [], today);

    // Un seul bloc Repetibox global si des élèves ont des cartes dues
    if ((jsonRB.eleves ?? []).length > 0) {
      grouped.push({
        cle:             "repetibox__global",
        type:            "repetibox",
        titre:           "Révisions Repetibox",
        chapitreId:      null,
        groupeLabels:    jsonRB.groupeLabels ?? [],
        dateAssignation: today,
        dateLimite:      null,
        periodicite:     "jour",
        eleves: (jsonRB.eleves ?? []).map((e: { rb_eleve_id: number; prenom: string; nom: string; total_cartes_dues: number; statut: string }) => ({
          planTravailId: `rb_${e.rb_eleve_id}`,
          eleveId:       `rb_${e.rb_eleve_id}`,
          prenom:        e.prenom,
          nom:           e.nom,
          statut:        "a_faire" as const,
          detail:        e.statut === "nouveau" ? "nouveau" : e.total_cartes_dues === 0 ? "0 carte" : `${e.total_cartes_dues} carte${e.total_cartes_dues > 1 ? "s" : ""}`,
        })),
      });
    }

    grouped.sort((a, b) => ORDRE_TYPES.indexOf(a.type) - ORDRE_TYPES.indexOf(b.type));
    setBlocs(grouped);
    setChargement(false);
  }, [today]);

  useEffect(() => { charger(); }, [charger]);

  async function supprimerBloc(e: React.MouseEvent, bloc: BlocGroupe) {
    e.stopPropagation();
    setSuppression(bloc.cle);
    try {
      const ids = bloc.eleves
        .map((el) => el.planTravailId)
        .filter((id) => !id.startsWith("rb_")); // exclure les IDs virtuels Repetibox
      if (ids.length > 0) {
        await fetch("/api/admin/supprimer-blocs", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
      }
      setBlocs((prev) => prev.filter((b) => b.cle !== bloc.cle));
    } finally {
      setSuppression(null);
    }
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("programme_jour")
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_travail" }, charger)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [charger]);

  if (chargement) {
    return (
      <div style={{ padding: 20, display: "flex", flexWrap: "wrap", gap: 12 }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="skeleton" style={{ width: 180, height: 100, borderRadius: 10 }} />
        ))}
      </div>
    );
  }

  if (blocs.length === 0) {
    return (
      <div style={{ padding: 40, color: "var(--text-secondary)", fontSize: 14, textAlign: "center" }}>
        Aucun bloc programmé aujourd'hui.
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: 20, display: "flex", flexWrap: "wrap", gap: 12, alignContent: "flex-start" }}>
        {blocs.map((bloc) => {
          const cfg = TYPE_BLOC_CONFIG[bloc.type] ?? { icone: "assignment", libelle: bloc.type, couleur: "#6B7280" };
          const faits = bloc.eleves.filter((e) => e.statut === "fait").length;
          const total = bloc.eleves.length;
          const pct = total > 0 ? (faits / total) * 100 : 0;
          const toutFait = faits === total;
          const hasRetard = bloc.eleves.some((e) => e.statut === "en_retard");

          const enSuppression = suppression === bloc.cle;
          return (
            <div
              key={bloc.cle}
              onClick={() => !enSuppression && setSelectedBloc(bloc)}
              style={{
                width: 180,
                borderRadius: 10,
                border: "1px solid var(--border)",
                backgroundColor: "var(--white)",
                cursor: enSuppression ? "default" : "pointer",
                overflow: "hidden",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                transition: "box-shadow 0.15s, transform 0.1s, opacity 0.15s",
                position: "relative",
                opacity: enSuppression ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (enSuppression) return;
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)";
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
              }}
            >
              {/* Bouton × suppression — masqué pour Repetibox */}
              {bloc.type !== "repetibox" && (
                <button
                  onClick={(e) => supprimerBloc(e, bloc)}
                  disabled={enSuppression}
                  title="Supprimer et désaffecter"
                  style={{
                    position: "absolute", top: 5, right: 5,
                    width: 20, height: 20, borderRadius: "50%",
                    background: "#FEE2E2", border: "none",
                    color: "#DC2626", fontSize: 13, lineHeight: 1,
                    cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    fontWeight: 700, zIndex: 2,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#DC2626", e.currentTarget.style.color = "white")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#FEE2E2", e.currentTarget.style.color = "#DC2626")}
                >
                  ×
                </button>
              )}

              <div style={{
                padding: "8px 12px",
                backgroundColor: cfg.couleur + "18",
                borderBottom: `2px solid ${cfg.couleur}`,
                display: "flex",
                alignItems: "center",
                gap: 6,
                paddingRight: bloc.type !== "repetibox" ? 28 : 12,
              }}>
                <span className="ms" style={{ fontSize: 14 }}>{cfg.icone}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: cfg.couleur, textTransform: "uppercase", letterSpacing: "0.05em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {cfg.libelle}
                </span>
              </div>

              <div style={{ padding: "10px 12px" }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: "var(--text)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  marginBottom: bloc.groupeLabels.length > 0 ? 4 : 8,
                }}>
                  {bloc.type === "fichier_maths"
                    ? bloc.titre.replace("Fichier de maths — ", "")
                    : bloc.titre || cfg.libelle}
                </div>

                {bloc.groupeLabels.length > 0 && (
                  <div style={{
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginBottom: 8,
                  }}>
                    {bloc.groupeLabels.join(", ")}
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: "var(--border)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${pct}%`,
                      borderRadius: 3,
                      backgroundColor: toutFait ? "#16A34A" : hasRetard ? "#DC2626" : cfg.couleur,
                      transition: "width 0.3s",
                    }} />
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: toutFait ? "#16A34A" : hasRetard ? "#DC2626" : "var(--text-secondary)",
                    whiteSpace: "nowrap",
                  }}>
                    {faits}/{total}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedBloc && (
        <BlocDrawer
          bloc={selectedBloc}
          onClose={() => setSelectedBloc(null)}
          onClickEleve={(id, prenom) => { setSelectedBloc(null); setSelectedEleve({ id, prenom }); }}
          onRefresh={charger}
        />
      )}

      {selectedEleve && (
        <ElevePanel
          eleveId={selectedEleve.id}
          prenom={selectedEleve.prenom}
          onClose={() => setSelectedEleve(null)}
        />
      )}
    </>
  );
}
