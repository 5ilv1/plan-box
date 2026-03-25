"use client";

import { Notification, TypeNotification } from "@/types";

interface NotifCardProps {
  notif: Notification;
  onMarquerLu?: (id: string) => void;
}

const NOTIF_CONFIG: Record<TypeNotification, { icone: string; couleur: string; libelle: string }> = {
  chapitre_valide: { icone: "celebration",    couleur: "var(--success)", libelle: "Chapitre validé" },
  eval_echec:      { icone: "warning",        couleur: "var(--warning)", libelle: "Échec évaluation" },
  eleve_bloque:    { icone: "block",          couleur: "var(--error)",   libelle: "Élève bloqué" },
  eval_prete:      { icone: "target",         couleur: "var(--primary)", libelle: "Évaluation prête" },
};

export default function NotifCard({ notif, onMarquerLu }: NotifCardProps) {
  const cfg = NOTIF_CONFIG[notif.type];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 16px",
        backgroundColor: notif.lu ? "var(--bg)" : "var(--primary-pale)",
        borderRadius: 10,
        borderLeft: `3px solid ${cfg.couleur}`,
        position: "relative",
      }}
    >
      <span className="ms" style={{ fontSize: 20, flexShrink: 0, color: cfg.couleur }}>{cfg.icone}</span>

      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            {cfg.libelle}
          </span>
          {!notif.lu && <span className="notif-dot" />}
        </div>

        {notif.message && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
            {notif.message}
          </p>
        )}

        <span style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, display: "block" }}>
          {new Date(notif.created_at).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {!notif.lu && onMarquerLu && (
        <button
          onClick={() => onMarquerLu(notif.id)}
          className="btn-ghost"
          style={{ padding: "4px 10px", fontSize: 12, flexShrink: 0 }}
          title="Marquer comme lu"
        >
          <span className="ms" style={{ fontSize: 12, verticalAlign: "middle" }}>check</span> Lu
        </button>
      )}
    </div>
  );
}
