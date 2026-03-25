"use client";

export type FiltreJour = "tous" | "a_faire" | "en_retard";

interface FiltresJourProps {
  filtre: FiltreJour;
  onChange: (f: FiltreJour) => void;
  comptes: { tous: number; a_faire: number; en_retard: number };
}

export default function FiltresJour({ filtre, onChange, comptes }: FiltresJourProps) {
  const boutons: { cle: FiltreJour; label: string; classeActive: string }[] = [
    { cle: "tous",      label: "Tous",      classeActive: "btn-primary" },
    { cle: "a_faire",   label: "À faire",   classeActive: "btn-warning" },
    { cle: "en_retard", label: "En retard", classeActive: "btn-error" },
  ];

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {boutons.map(({ cle, label }) => {
        const actif = filtre === cle;
        const count = comptes[cle];
        return (
          <button
            key={cle}
            onClick={() => onChange(cle)}
            className={actif ? "btn-primary" : "btn-secondary"}
            style={{
              padding: "5px 14px",
              fontSize: 13,
              fontWeight: actif ? 600 : 400,
              display: "flex",
              alignItems: "center",
              gap: 6,
              borderRadius: 999,
            }}
          >
            {label}
            {count > 0 && (
              <span
                className={`badge ${actif ? "badge-success" : "badge-primary"}`}
                style={{ fontSize: 11, padding: "1px 7px", minWidth: 20, textAlign: "center" }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
