"use client";

import { Eleve, Progression, Chapitre, NIVEAU_CLASSE } from "@/types";
import ProgressBar from "./ProgressBar";

interface StudentRowProps {
  eleve: Eleve & { niveaux?: { nom: string } };
  progression?: Progression & { chapitres?: Chapitre };
}

const STATUT_CONFIG = {
  en_cours:    { libelle: "En cours",    classe: "badge-primary" },
  valide:      { libelle: "Validé ✓",    classe: "badge-success" },
  remediation: { libelle: "Remédiation", classe: "badge-error" },
};

export default function StudentRow({ eleve, progression }: StudentRowProps) {
  const niveauNom = eleve.niveaux?.nom ?? "";
  const niveauClasse = NIVEAU_CLASSE[niveauNom] ?? "badge-primary";
  const statut = progression?.statut ?? "en_cours";
  const statutCfg = STATUT_CONFIG[statut];

  return (
    <div
      className="card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 20px",
      }}
    >
      {/* Avatar initiales */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          backgroundColor: "var(--primary-pale)",
          color: "var(--primary)",
          fontWeight: 700,
          fontSize: 15,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {eleve.prenom[0]}{eleve.nom[0]}
      </div>

      {/* Prénom + niveau */}
      <div style={{ minWidth: 130, flexShrink: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>
          {eleve.prenom} {eleve.nom}
        </div>
        <span className={`badge ${niveauClasse}`} style={{ marginTop: 2 }}>
          {niveauNom}
        </span>
      </div>

      {/* Chapitre en cours */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {progression?.chapitres ? (
          <>
            <div
              className="text-sm"
              style={{
                fontWeight: 500,
                color: "var(--text)",
                marginBottom: 6,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {progression.chapitres.titre}
            </div>
            <ProgressBar pourcentage={progression.pourcentage} />
          </>
        ) : (
          <span className="text-secondary text-sm">Aucun chapitre assigné</span>
        )}
      </div>

      {/* % */}
      {progression && (
        <div
          style={{
            fontWeight: 700,
            fontSize: 16,
            color: "var(--primary)",
            minWidth: 42,
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          {progression.pourcentage}%
        </div>
      )}

      {/* Statut */}
      <div style={{ flexShrink: 0 }}>
        <span className={`badge ${statutCfg.classe}`}>{statutCfg.libelle}</span>
      </div>
    </div>
  );
}
