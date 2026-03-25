"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { BanqueExercice } from "@/types";

interface BanqueExercicesProps {
  filtreType?: "exercice" | "calcul_mental" | "ressource";
  filtreNiveauId?: string;
  onSelectionner: (exercice: BanqueExercice) => void;
  onFermer: () => void;
}

export default function BanqueExercices({
  filtreType,
  filtreNiveauId,
  onSelectionner,
  onFermer,
}: BanqueExercicesProps) {
  const supabase = createClient();
  const [exercices, setExercices] = useState<BanqueExercice[]>([]);
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState("");

  useEffect(() => {
    async function charger() {
      let query = supabase
        .from("banque_exercices")
        .select("*, niveaux(nom), chapitres(titre)")
        .order("nb_utilisations", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);

      if (filtreType) query = query.eq("type", filtreType);
      if (filtreNiveauId) query = query.eq("niveau_id", filtreNiveauId);

      const { data } = await query;
      setExercices((data ?? []) as BanqueExercice[]);
      setChargement(false);
    }
    charger();
  }, [filtreType, filtreNiveauId]);

  const filtres = exercices.filter((e) => {
    if (!recherche) return true;
    const q = recherche.toLowerCase();
    return (
      e.titre?.toLowerCase().includes(q) ||
      e.matiere?.toLowerCase().includes(q) ||
      e.niveaux?.nom.toLowerCase().includes(q) ||
      e.chapitres?.titre.toLowerCase().includes(q)
    );
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && onFermer()}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 600,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 700 }}><span className="ms" style={{ fontSize: 20, verticalAlign: "middle" }}>folder_open</span> Banque d&apos;exercices</h2>
          <button className="btn-ghost" onClick={onFermer} style={{ padding: "4px 10px" }}>
            ✕
          </button>
        </div>

        {/* Recherche */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
          <input
            type="text"
            className="form-input"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher par titre, matière, niveau…"
            autoFocus
          />
        </div>

        {/* Liste */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
          {chargement ? (
            <div style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>
              Chargement…
            </div>
          ) : filtres.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><span className="ms" style={{ fontSize: 36 }}>inventory_2</span></div>
              <p>
                {exercices.length === 0
                  ? "La banque est vide. Génère et valide des exercices pour les y ajouter."
                  : "Aucun résultat pour cette recherche."}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtres.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => onSelectionner(ex)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "12px 14px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "border-color 0.15s, background 0.15s",
                    fontFamily: "var(--font)",
                    width: "100%",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--primary)";
                    (e.currentTarget as HTMLElement).style.background = "var(--primary-pale)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                    (e.currentTarget as HTMLElement).style.background = "var(--bg)";
                  }}
                >
                  <span className="ms" style={{ fontSize: 22, flexShrink: 0, color: ex.type === "exercice" ? "#2563EB" : "#7C3AED" }}>
                    {ex.type === "exercice" ? "edit_note" : "pin"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {ex.titre ?? "Sans titre"}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        marginTop: 4,
                        flexWrap: "wrap",
                      }}
                    >
                      {ex.niveaux && (
                        <span className={`badge badge-${ex.niveaux.nom.toLowerCase()}`}>
                          {ex.niveaux.nom}
                        </span>
                      )}
                      {ex.matiere && (
                        <span className="badge badge-primary">{ex.matiere}</span>
                      )}
                      {ex.chapitres && (
                        <span className="text-xs text-secondary">
                          {ex.chapitres.titre}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className="text-xs text-secondary"
                    style={{ flexShrink: 0, marginTop: 2 }}
                  >
                    ×{ex.nb_utilisations}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
