"use client";

type TabSidebar = "blocs" | "eleves" | "matieres";

interface DashboardSidebarProps {
  activeTab: TabSidebar;
  onSelect: (tab: TabSidebar) => void;
}

const ITEMS_PRINCIPAL: { key: TabSidebar; label: string }[] = [
  { key: "blocs",  label: "Programme du jour" },
  { key: "eleves", label: "Progression élèves" },
];

const ITEMS_SETTINGS: { key: TabSidebar; label: string }[] = [
  { key: "matieres", label: "Matières" },
];

function NavButton({ item, actif, onSelect }: { item: { key: TabSidebar; label: string }; actif: boolean; onSelect: (t: TabSidebar) => void }) {
  return (
    <button
      onClick={() => onSelect(item.key)}
      style={{
        textAlign: "left",
        padding: "10px 16px",
        fontSize: 13,
        fontWeight: actif ? 700 : 500,
        color: actif ? "var(--primary)" : "var(--text)",
        background: actif ? "var(--primary-pale)" : "transparent",
        borderTop: "none",
        borderRight: "none",
        borderBottom: "none",
        borderLeft: actif ? "3px solid var(--primary)" : "3px solid transparent",
        cursor: "pointer",
        width: "100%",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => { if (!actif) (e.currentTarget as HTMLButtonElement).style.background = "var(--bg)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = actif ? "var(--primary-pale)" : "transparent"; }}
    >
      {item.label}
    </button>
  );
}

export default function DashboardSidebar({ activeTab, onSelect }: DashboardSidebarProps) {
  return (
    <aside style={{
      width: 200,
      flexShrink: 0,
      height: "calc(100vh - 48px)",
      position: "sticky",
      top: 48,
      borderRight: "1px solid var(--border)",
      backgroundColor: "var(--white)",
      display: "flex",
      flexDirection: "column",
      padding: "12px 0",
    }}>
      {/* Navigation principale */}
      {ITEMS_PRINCIPAL.map((item) => (
        <NavButton key={item.key} item={item} actif={activeTab === item.key} onSelect={onSelect} />
      ))}

      {/* Séparateur + section paramètres */}
      <div style={{ flex: 1 }} />
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "4px 16px 6px" }}>
          Paramètres
        </p>
        {ITEMS_SETTINGS.map((item) => (
          <NavButton key={item.key} item={item} actif={activeTab === item.key} onSelect={onSelect} />
        ))}
      </div>
    </aside>
  );
}
