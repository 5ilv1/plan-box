"use client";

import Link from "next/link";
import { PlanTravail, TYPE_BLOC_CONFIG, STATUT_BLOC_CONFIG } from "@/types";

const TYPES_INTERACTIFS: PlanTravail["type"][] = ["exercice", "calcul_mental", "ressource", "dictee", "mots"];

const TYPE_BLOC_MS: Record<string, { icon: string; color: string; bg: string }> = {
  exercice:      { icon: "edit_note",    color: "#2563EB", bg: "rgba(37,99,235,0.1)" },
  calcul_mental: { icon: "calculate",    color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
  mots:          { icon: "abc",          color: "#0369A1", bg: "rgba(3,105,161,0.1)" },
  dictee:        { icon: "headphones",   color: "#D97706", bg: "rgba(217,119,6,0.1)" },
  media:         { icon: "play_circle",  color: "#059669", bg: "rgba(5,150,105,0.1)" },
  eval:          { icon: "quiz",         color: "#DC2626", bg: "rgba(220,38,38,0.1)" },
  libre:         { icon: "draw",         color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
  ressource:     { icon: "open_in_new",  color: "#0891B2", bg: "rgba(8,145,178,0.1)" },
  repetibox:     { icon: "style",         color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
  fichier_maths: { icon: "square_foot",  color: "#0F766E", bg: "rgba(15,118,110,0.1)" },
};

interface ActivityCardProps {
  bloc: PlanTravail;
  onMarquerFait?: (id: string) => void;
}

export default function ActivityCard({ bloc, onMarquerFait }: ActivityCardProps) {
  const typeConfig = TYPE_BLOC_CONFIG[bloc.type];
  const statutConfig = STATUT_BLOC_CONFIG[bloc.statut];
  const estFait = bloc.statut === "fait";
  const ms = TYPE_BLOC_MS[bloc.type] ?? { icon: "task_alt", color: "#6B7280", bg: "rgba(107,114,128,0.1)" };

  return (
    <div
      className="card"
      style={{
        opacity: estFait ? 0.7 : 1,
        borderLeft: `4px solid ${estFait ? "var(--success)" : typeConfig.couleur}`,
        padding: "16px 20px",
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        transition: "opacity 0.2s ease",
      }}
    >
      {/* Icône */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          backgroundColor: estFait ? "rgba(34,197,94,0.12)" : ms.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span
          className="ms"
          style={{ fontSize: 22, color: estFait ? "#22c55e" : ms.color, lineHeight: 1 }}
        >
          {estFait ? "check_circle" : ms.icon}
        </span>
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
            {bloc.titre}
          </span>
          <span
            className={`badge ${statutConfig.classe}`}
            style={{ marginLeft: "auto", flexShrink: 0 }}
          >
            {statutConfig.libelle}
          </span>
        </div>

        <span className="text-xs text-secondary">{typeConfig.libelle}</span>

        {bloc.chapitres && (
          <span
            className="text-xs text-secondary"
            style={{ marginLeft: 8 }}
          >
            · {bloc.chapitres.titre}
          </span>
        )}

        {bloc.date_limite && !estFait && (
          <div className="mt-1" style={{ fontSize: 12, color: "var(--warning)" }}>
            <span className="ms" style={{ fontSize: 12, verticalAlign: "middle", marginRight: 3 }}>schedule</span>
          Avant le {new Date(bloc.date_limite).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
          </div>
        )}
      </div>

      {/* Actions */}
      {!estFait && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
          {TYPES_INTERACTIFS.includes(bloc.type) && bloc.contenu ? (
            <Link
              href={`/eleve/activite/${bloc.id}`}
              className="btn-primary"
              style={{ padding: "6px 14px", fontSize: 13 }}
            >
              Commencer →
            </Link>
          ) : (
            onMarquerFait && (
              <button
                onClick={() => onMarquerFait(bloc.id)}
                className="btn-ghost"
                style={{ padding: "6px 12px", fontSize: 13 }}
                title="Marquer comme fait"
              >
                ✓
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
