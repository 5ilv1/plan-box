"use client";

import { useEffect, useState } from "react";

interface Eleve {
  uid: string;
  prenom: string;
  nom: string;
  source: "planbox" | "repetibox";
}
interface Groupe {
  type: string;
  titre: string;
  icone: string;
  label: string;
  faits: Eleve[];
  nonFaits: Eleve[];
}
interface RetardEleve {
  uid: string;
  prenom: string;
  nom: string;
  pct: number;
  faits: number;
  total: number;
}
interface AlertesResp {
  blocs: Groupe[];
  enRetard: RetardEleve[];
  enRetardActif: boolean;
  seuilHeure: number;
  seuilPct: number;
}

function Pastille({
  couleur,
  fond,
  nombre,
  noms,
  titre,
}: {
  couleur: string;
  fond: string;
  nombre: number;
  noms: string[];
  titre: string;
}) {
  const tooltip = noms.length > 0 ? `${titre} :\n${noms.join(", ")}` : titre;
  return (
    <span
      title={tooltip}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 30, height: 24, borderRadius: 999, padding: "0 8px",
        background: fond, color: couleur,
        fontSize: 12, fontWeight: 800,
        cursor: noms.length > 0 ? "help" : "default",
      }}
    >
      {nombre}
    </span>
  );
}

export default function AlertesJour() {
  const [data, setData] = useState<AlertesResp | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    fetch("/api/enseignant/alertes-jour")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setChargement(false));
  }, []);

  if (chargement) {
    return (
      <div style={{ padding: "12px 16px", fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
        Chargement des alertes…
      </div>
    );
  }
  if (!data || (data.blocs.length === 0 && !data.enRetardActif)) return null;

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 10,
      padding: "12px 16px",
      background: "rgba(255,255,255,0.10)",
      borderRadius: 12,
      marginTop: 14,
    }}>
      {data.blocs.length > 0 && (
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
            color: "rgba(255,255,255,0.7)", marginBottom: 8,
          }}>
            Avancement du jour
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {data.blocs.map((g) => (
              <div
                key={`${g.type}|${g.titre}`}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "rgba(0,0,0,0.18)", borderRadius: 10,
                  padding: "6px 12px",
                }}
              >
                <span className="ms" style={{ fontSize: 18, color: "rgba(255,255,255,0.9)" }}>
                  {g.icone}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "white" }}>
                  {g.titre.length > 30 ? g.titre.slice(0, 30) + "…" : g.titre}
                </span>
                <Pastille
                  couleur="#166534"
                  fond="#86EFAC"
                  nombre={g.faits.length}
                  noms={g.faits.map((e) => e.prenom)}
                  titre={`Ont fait (${g.faits.length})`}
                />
                <Pastille
                  couleur="#991B1B"
                  fond="#FCA5A5"
                  nombre={g.nonFaits.length}
                  noms={g.nonFaits.map((e) => e.prenom)}
                  titre={`N'ont pas fait (${g.nonFaits.length})`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {data.enRetardActif && (
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
            color: "rgba(255,255,255,0.7)", marginBottom: 8,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span className="ms" style={{ fontSize: 16, color: "#FCA5A5" }}>warning</span>
            Élèves en retard ({data.enRetard.length})
            <span style={{ fontWeight: 400, opacity: 0.6, textTransform: "none" }}>
              · moins de {data.seuilPct}% à {data.seuilHeure}h
            </span>
          </div>
          {data.enRetard.length === 0 ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
              ✓ Personne en retard. Bonne dynamique de classe.
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {data.enRetard.map((e) => (
                <span
                  key={e.uid}
                  title={`${e.faits}/${e.total} bloc${e.total > 1 ? "s" : ""} faits`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: "rgba(252,165,165,0.25)", border: "1px solid rgba(252,165,165,0.5)",
                    color: "white", borderRadius: 999,
                    padding: "4px 10px", fontSize: 13, fontWeight: 600,
                  }}
                >
                  {e.prenom}
                  <span style={{
                    fontSize: 10, fontWeight: 800,
                    background: "rgba(220,38,38,0.45)", color: "white",
                    padding: "1px 6px", borderRadius: 999,
                  }}>
                    {e.pct}%
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
