"use client";

import { useState, useEffect } from "react";
import { Matiere, PALETTE_COULEURS, couleurMatiere, invalidateMatieres } from "@/lib/matieres";

const ICONES_DISPONIBLES = [
  "menu_book", "pin", "science", "public", "translate", "balance", "assignment", "palette", "music_note", "sports_soccer",
  "directions_run", "computer", "history_edu", "straighten", "edit", "map", "biotech", "theater_comedy", "account_balance", "eco",
];

export default function MatieresView() {
  const [matieres, setMatieres] = useState<Matiere[]>([]);
  const [chargement, setChargement] = useState(true);

  /* ── Edition inline ── */
  const [enEdition, setEnEdition] = useState<string | null>(null); // id en cours d'édition
  const [editNom, setEditNom] = useState("");
  const [editIcone, setEditIcone] = useState("");
  const [enSauvegarde, setEnSauvegarde] = useState(false);

  /* ── Ajout ── */
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouvelleIcone, setNouvelleIcone] = useState("assignment");
  const [enAjout, setEnAjout] = useState(false);
  const [erreur, setErreur] = useState("");

  /* ── Suppression ── */
  const [enSuppression, setEnSuppression] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/matieres")
      .then((r) => r.json())
      .then((j) => { setMatieres(j.matieres ?? []); setChargement(false); });
  }, []);

  function ouvrirEdition(m: Matiere) {
    setEnEdition(m.id);
    setEditNom(m.nom);
    setEditIcone(m.icone);
    setErreur("");
  }

  function annulerEdition() {
    setEnEdition(null);
    setErreur("");
  }

  async function sauvegarder(id: string) {
    if (!editNom.trim()) { setErreur("Le nom ne peut pas être vide."); return; }
    setEnSauvegarde(true);
    setErreur("");
    try {
      const res = await fetch("/api/matieres", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, nom: editNom, icone: editIcone }),
      });
      const json = await res.json();
      if (!res.ok) { setErreur(json.erreur ?? "Erreur"); return; }
      setMatieres((prev) => prev.map((m) => m.id === id ? json.matiere : m));
      setEnEdition(null);
      invalidateMatieres();
    } finally {
      setEnSauvegarde(false);
    }
  }

  async function supprimer(id: string) {
    setEnSuppression(id);
    try {
      await fetch("/api/matieres", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setMatieres((prev) => prev.filter((m) => m.id !== id));
      invalidateMatieres();
    } finally {
      setEnSuppression(null);
    }
  }

  async function ajouter() {
    if (!nouveauNom.trim()) { setErreur("Le nom est requis."); return; }
    setEnAjout(true);
    setErreur("");
    try {
      const res = await fetch("/api/matieres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: nouveauNom, icone: nouvelleIcone }),
      });
      const json = await res.json();
      if (!res.ok) { setErreur(json.erreur ?? "Erreur"); return; }
      setMatieres((prev) => [...prev, json.matiere]);
      setNouveauNom("");
      setNouvelleIcone("assignment");
      invalidateMatieres();
    } finally {
      setEnAjout(false);
    }
  }

  if (chargement) {
    return (
      <div style={{ padding: "24px 20px" }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: 48, borderRadius: 8, marginBottom: 8 }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 16px", overflowY: "auto", height: "100%" }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 4px" }}><span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>settings</span> Matières</h2>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 20px", lineHeight: 1.4 }}>
        Modifie ou ajoute des matières. Les changements s&apos;appliquent sur tout le site.
      </p>

      {/* ── Liste ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
        {matieres.map((m, idx) => {
          const { bg, texte } = couleurMatiere(idx);
          const estEnEdition = enEdition === m.id;
          const enSuppr = enSuppression === m.id;

          return (
            <div
              key={m.id}
              style={{
                border: `1px solid ${estEnEdition ? "var(--primary)" : "var(--border)"}`,
                borderRadius: 10,
                background: estEnEdition ? "var(--primary-pale)" : "white",
                opacity: enSuppr ? 0.5 : 1,
                transition: "all 0.15s",
                overflow: "hidden",
              }}
            >
              {estEnEdition ? (
                /* ── Mode édition ── */
                <div style={{ padding: "10px 12px" }}>
                  {/* Picker icônes */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                    {ICONES_DISPONIBLES.map((ic) => (
                      <button
                        key={ic}
                        onClick={() => setEditIcone(ic)}
                        style={{
                          width: 30, height: 30, borderRadius: 6, fontSize: 16, border: "none",
                          background: editIcone === ic ? "var(--primary)" : "var(--bg)",
                          color: editIcone === ic ? "white" : "var(--text)",
                          cursor: "pointer", transition: "background 0.1s",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <span className="ms" style={{ fontSize: 18 }}>{ic}</span>
                      </button>
                    ))}
                  </div>
                  {/* Nom */}
                  <input
                    className="form-input"
                    value={editNom}
                    onChange={(e) => setEditNom(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") sauvegarder(m.id); if (e.key === "Escape") annulerEdition(); }}
                    autoFocus
                    style={{ width: "100%", fontSize: 13, marginBottom: 8 }}
                  />
                  {erreur && enEdition === m.id && (
                    <div style={{ fontSize: 12, color: "#DC2626", marginBottom: 6 }}>{erreur}</div>
                  )}
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button
                      onClick={annulerEdition}
                      style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "white", cursor: "pointer" }}
                    >
                      Annuler
                    </button>
                    <button
                      onClick={() => sauvegarder(m.id)}
                      disabled={enSauvegarde}
                      style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "none", background: "var(--primary)", color: "white", cursor: "pointer", fontWeight: 700 }}
                    >
                      {enSauvegarde ? "…" : "Enregistrer"}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Mode lecture ── */
                <div style={{ display: "flex", alignItems: "center", padding: "10px 12px", gap: 8 }}>
                  <span style={{
                    fontSize: 12, padding: "3px 8px", borderRadius: 999,
                    background: bg + "99", color: texte, fontWeight: 700, flexShrink: 0,
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}>
                    <span className="ms" style={{ fontSize: 14 }}>{m.icone}</span> {m.nom}
                  </span>
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => ouvrirEdition(m)}
                    disabled={enSuppr}
                    title="Modifier"
                    style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid var(--border)", background: "white", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <span className="ms" style={{ fontSize: 16 }}>edit</span>
                  </button>
                  <button
                    onClick={() => supprimer(m.id)}
                    disabled={enSuppr}
                    title="Supprimer"
                    style={{ width: 26, height: 26, borderRadius: "50%", background: "#FEE2E2", border: "none", color: "#DC2626", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, transition: "background 0.15s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#DC2626"; e.currentTarget.style.color = "white"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#FEE2E2"; e.currentTarget.style.color = "#DC2626"; }}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Palette couleurs (info) ── */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6, fontWeight: 600 }}>
          PALETTE DE COULEURS
        </p>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {PALETTE_COULEURS.map((c, i) => (
            <div
              key={i}
              title={`Couleur ${i + 1}`}
              style={{ width: 20, height: 20, borderRadius: 4, background: c.bg, border: `2px solid ${c.texte}33` }}
            />
          ))}
        </div>
        <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
          Les couleurs sont attribuées automatiquement selon l&apos;ordre.
        </p>
      </div>

      {/* ── Ajouter une matière ── */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Ajouter une matière
        </p>

        {/* Picker icône */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {ICONES_DISPONIBLES.map((ic) => (
            <button
              key={ic}
              onClick={() => setNouvelleIcone(ic)}
              style={{
                width: 30, height: 30, borderRadius: 6, fontSize: 16, border: "none",
                background: nouvelleIcone === ic ? "var(--primary)" : "var(--bg)",
                color: nouvelleIcone === ic ? "white" : "var(--text)",
                cursor: "pointer", transition: "background 0.1s",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <span className="ms" style={{ fontSize: 18 }}>{ic}</span>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="form-input"
            placeholder="Nom de la matière…"
            value={nouveauNom}
            onChange={(e) => { setNouveauNom(e.target.value); setErreur(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") ajouter(); }}
            style={{ flex: 1, fontSize: 13 }}
          />
          <button
            onClick={ajouter}
            disabled={enAjout || !nouveauNom.trim()}
            style={{
              padding: "0 14px", borderRadius: 8, border: "none",
              background: "var(--primary)", color: "white", fontWeight: 700,
              fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
              opacity: !nouveauNom.trim() ? 0.5 : 1,
            }}
          >
            {enAjout ? "…" : "+ Ajouter"}
          </button>
        </div>
        {erreur && !enEdition && (
          <div style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>{erreur}</div>
        )}
      </div>
    </div>
  );
}
