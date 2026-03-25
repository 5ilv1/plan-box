"use client";

import { TYPE_BLOC_CONFIG, TypeBloc, StatutBloc } from "@/types";

export interface EleveBloc {
  planTravailId: string;
  eleveId: string;
  prenom: string;
  nom: string;
  statut: StatutBloc | "en_retard";
  detail?: string; // info complémentaire (ex : "5 cartes" pour Repetibox)
}

export interface BlocGroupe {
  cle: string;
  type: TypeBloc;
  titre: string;
  chapitreId: string | null;
  eleves: EleveBloc[];
  dateAssignation: string;
  dateLimite: string | null;
  periodicite: "jour" | "semaine";
  groupeLabels: string[];
}

const STATUT_STYLE: Record<string, { label: string; couleur: string; bg: string; border: string; isIcon?: boolean }> = {
  fait:      { label: "check_circle",           couleur: "#16A34A", bg: "#DCFCE7", border: "#86EFAC", isIcon: true },
  en_cours:  { label: "circle",                 couleur: "#2563EB", bg: "#DBEAFE", border: "#93C5FD", isIcon: true },
  a_faire:   { label: "check_box_outline_blank", couleur: "#6B7280", bg: "#F3F4F6", border: "#D1D5DB", isIcon: true },
  en_retard: { label: "circle",                 couleur: "#DC2626", bg: "#FEE2E2", border: "#FCA5A5", isIcon: true },
};

interface BlocJourCardProps {
  bloc: BlocGroupe;
  onClickBloc: (bloc: BlocGroupe) => void;
  onClickEleve: (eleveId: string, prenom: string) => void;
}

export default function BlocJourCard({ bloc, onClickBloc, onClickEleve }: BlocJourCardProps) {
  const faits = bloc.eleves.filter((e) => e.statut === "fait").length;
  const total = bloc.eleves.length;
  const pct = total > 0 ? Math.round((faits / total) * 100) : 0;
  const toutFait = faits === total && total > 0;
  const hasRetard = bloc.eleves.some((e) => e.statut === "en_retard");

  const cfg = TYPE_BLOC_CONFIG[bloc.type] ?? { icone: "assignment", libelle: bloc.type, couleur: "#6B7280" };

  return (
    <div
      className="card"
      onClick={() => onClickBloc(bloc)}
      style={{
        padding: "12px 14px",
        cursor: "pointer",
        opacity: toutFait ? 0.72 : 1,
        width: 260,
        flexShrink: 0,
        flexGrow: 0,
        border: hasRetard
          ? "1.5px solid #FCA5A5"
          : toutFait
          ? "1.5px solid #86EFAC"
          : "1.5px solid var(--border)",
        backgroundColor: toutFait ? "#F0FDF4" : "var(--white)",
        transition: "box-shadow 0.15s ease",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.10)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = ""; }}
    >
      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
          <span className="ms" style={{ fontSize: 16, lineHeight: 1, flexShrink: 0, color: cfg.couleur }}>{cfg.icone}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: cfg.couleur, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {cfg.libelle}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {bloc.type === "fichier_maths"
                ? bloc.titre.replace("Fichier de maths — ", "")
                : bloc.titre}
            </div>
          </div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: toutFait ? "#16A34A" : "var(--text-secondary)", whiteSpace: "nowrap", flexShrink: 0 }}>
          {faits}/{total}
        </span>
      </div>

      {/* Barre de progression */}
      <div style={{ height: 4, backgroundColor: "var(--border)", borderRadius: 999, marginBottom: 10, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          backgroundColor: toutFait ? "#16A34A" : "#2563EB",
          borderRadius: 999,
          transition: "width 0.3s ease",
        }} />
      </div>

      {/* Élèves — groupe/classe ou individuel */}
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 5 }}
        onClick={(e) => e.stopPropagation()}
      >
        {bloc.type === "repetibox" ? (
          /* Bloc Repetibox : groupes activés + nb d'élèves */
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#7C3AED", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {bloc.groupeLabels.length > 0 ? bloc.groupeLabels.join(", ") : "Élèves activés"}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", background: "#EDE9FE", padding: "1px 7px", borderRadius: 999, border: "1px solid #C4B5FD", flexShrink: 0 }}>
              {total} élève{total > 1 ? "s" : ""}
            </span>
          </div>
        ) : bloc.groupeLabels.length > 0 ? (
          /* Assignation groupe/classe : afficher le(s) label(s) + compteurs de statut */
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {bloc.groupeLabels.join(", ")}
            </span>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              {(() => {
                const faitsN = bloc.eleves.filter((e) => e.statut === "fait").length;
                const enCoursN = bloc.eleves.filter((e) => e.statut === "en_cours").length;
                const retardN = bloc.eleves.filter((e) => e.statut === "en_retard").length;
                const aFaireN = total - faitsN - enCoursN - retardN;
                return (
                  <>
                    {faitsN > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", display: "inline-flex", alignItems: "center", gap: 1 }}>{faitsN}<span className="ms" style={{ fontSize: 12 }}>check_circle</span></span>}
                    {enCoursN > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#2563EB", display: "inline-flex", alignItems: "center", gap: 1 }}>{enCoursN}<span className="ms" style={{ fontSize: 12 }}>circle</span></span>}
                    {retardN > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", display: "inline-flex", alignItems: "center", gap: 1 }}>{retardN}<span className="ms" style={{ fontSize: 12 }}>circle</span></span>}
                    {aFaireN > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "inline-flex", alignItems: "center", gap: 1 }}>{aFaireN}<span className="ms" style={{ fontSize: 12 }}>check_box_outline_blank</span></span>}
                  </>
                );
              })()}
            </div>
          </div>
        ) : (
          /* Assignation individuelle : pill par élève */
          bloc.eleves.map((eleve) => {
            const s = STATUT_STYLE[eleve.statut];
            return (
              <button
                key={eleve.planTravailId}
                onClick={() => onClickEleve(eleve.eleveId, eleve.prenom)}
                title={`${eleve.prenom} ${eleve.nom}`}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: `1px solid ${s.border}`,
                  backgroundColor: s.bg,
                  color: s.couleur,
                  fontFamily: "inherit",
                  fontSize: 12, fontWeight: 600,
                  cursor: "pointer",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.7"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
              >
                <span className="ms" style={{ fontSize: 10, color: s.couleur }}>{s.label}</span>
                {eleve.prenom}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
