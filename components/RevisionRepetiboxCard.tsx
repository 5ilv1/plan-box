"use client"

interface RevisionRepetiboxCardProps {
  chapitreNom: string
  nbCartesDues: number
  tokenUrl: string
}

export default function RevisionRepetiboxCard({
  chapitreNom,
  nbCartesDues,
  tokenUrl,
}: RevisionRepetiboxCardProps) {
  return (
    <a
      href={tokenUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 18px",
        backgroundColor: "white",
        border: "1.5px solid #E9D5FF",
        borderRadius: 12,
        textDecoration: "none",
        color: "inherit",
        gap: 12,
        transition: "box-shadow 0.15s",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 2px 12px rgba(124,58,237,0.12)"
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.boxShadow = "none"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>🃏</span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {chapitreNom}
          </div>
          <div style={{ fontSize: 12, color: "#7C3AED", marginTop: 2 }}>
            {nbCartesDues} carte{nbCartesDues > 1 ? "s" : ""} à réviser
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span
          style={{
            backgroundColor: "#F3E8FF",
            color: "#7C3AED",
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 9px",
            borderRadius: 100,
            whiteSpace: "nowrap",
          }}
        >
          🔁 Repetibox
        </span>
        <span style={{ color: "#7C3AED", fontSize: 16 }}>→</span>
      </div>
    </a>
  )
}
