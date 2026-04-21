"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type Statut = "valide" | "corrige" | "rejete" | null;
type Kind = "sub" | "del" | "ins" | "casse" | "ponctuation";

interface FeedbackRow {
  id: string;
  created_at: string;
  bloc_id: string | null;
  eleve_id: string | null;
  eleve_prenom: string | null;
  eleve_nom: string | null;
  niveau: "CE2" | "CM1" | "CM2" | null;

  mot_attendu: string;
  mot_eleve: string;
  contexte: string | null;
  kind: Kind | null;

  type_erreur_ia: string | null;
  indice_ia: string | null;

  statut: Statut;
  type_erreur_corrige: string | null;
  indice_corrige: string | null;
  commentaire_enseignant: string | null;

  bloc_type: string | null;
  bloc_titre: string | null;
  bloc_etoiles: number | null;
}

const TYPES_ERREUR = [
  "lettre_muette",
  "accord_sujet_verbe",
  "accord_adjectif",
  "conjugaison",
  "homophone",
  "mot_oublie",
  "orthographe",
  "majuscule",
  "ponctuation",
  "accent",
  "lettre_doublee",
  "autre",
];

const TYPE_LABELS: Record<string, string> = {
  lettre_muette:      "Lettre muette",
  accord_sujet_verbe: "Accord S/V",
  accord_adjectif:    "Accord adjectif",
  conjugaison:        "Conjugaison",
  homophone:          "Homophone",
  mot_oublie:         "Mot oublié",
  orthographe:        "Orthographe",
  majuscule:          "Majuscule",
  ponctuation:        "Ponctuation",
  accent:             "Accent",
  lettre_doublee:     "Lettre doublée",
  autre:              "Autre",
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RevueIAPage() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [chargement, setChargement] = useState(true);
  const [onglet, setOnglet] = useState<"pending" | "all">("pending");
  const [editing, setEditing] = useState<string | null>(null);
  const [editType, setEditType] = useState("");
  const [editIndice, setEditIndice] = useState("");
  const [editCommentaire, setEditCommentaire] = useState("");
  const [enCoursId, setEnCoursId] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const res = await fetch(`/api/enseignant/dictee-feedback?statut=${onglet}&limit=100`);
      if (!res.ok) throw new Error("Chargement échoué");
      const data: { rows: FeedbackRow[] } = await res.json();
      setRows(data.rows);
    } catch (err) {
      console.error(err);
    } finally {
      setChargement(false);
    }
  }, [onglet]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function decider(
    id: string,
    statut: "valide" | "corrige" | "rejete",
    extras?: { type_erreur_corrige?: string; indice_corrige?: string; commentaire_enseignant?: string },
  ) {
    setEnCoursId(id);
    try {
      const res = await fetch("/api/enseignant/dictee-feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, statut, ...extras }),
      });
      if (!res.ok) throw new Error("Mise à jour échouée");
      // Retire la ligne de la vue "pending", sinon rafraîchit le statut
      if (onglet === "pending") {
        setRows((prev) => prev.filter((r) => r.id !== id));
      } else {
        setRows((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  statut,
                  type_erreur_corrige: extras?.type_erreur_corrige ?? r.type_erreur_corrige,
                  indice_corrige: extras?.indice_corrige ?? r.indice_corrige,
                  commentaire_enseignant: extras?.commentaire_enseignant ?? r.commentaire_enseignant,
                }
              : r,
          ),
        );
      }
      setEditing(null);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la mise à jour");
    } finally {
      setEnCoursId(null);
    }
  }

  function ouvrirEdition(row: FeedbackRow) {
    setEditing(row.id);
    setEditType(row.type_erreur_corrige ?? row.type_erreur_ia ?? "orthographe");
    setEditIndice(row.indice_corrige ?? row.indice_ia ?? "");
    setEditCommentaire(row.commentaire_enseignant ?? "");
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px 80px" }}>
      {/* Titre */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <Link
          href="/enseignant/dictees"
          className="pb-btn surface"
          style={{ padding: "6px 12px", fontSize: 13 }}
        >
          <span className="ms" style={{ fontSize: 18 }}>arrow_back</span>
          Dictées
        </Link>
      </div>
      <h1 style={{
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontSize: 28,
        fontWeight: 900,
        margin: "12px 0 4px",
      }}>
        Revue IA
      </h1>
      <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", margin: "0 0 20px" }}>
        Valide ou corrige les classifications de l&apos;IA. Chaque décision enrichit les prompts des prochaines corrections.
      </p>

      {/* Onglets */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {(["pending", "all"] as const).map((o) => (
          <button
            key={o}
            onClick={() => setOnglet(o)}
            className={onglet === o ? "pb-btn primary" : "pb-btn surface"}
            style={{ padding: "8px 16px", fontSize: 13 }}
          >
            {o === "pending" ? "À relire" : "Tout l'historique"}
          </button>
        ))}
        <button
          onClick={charger}
          disabled={chargement}
          className="pb-btn surface"
          style={{ padding: "8px 16px", fontSize: 13, marginLeft: "auto" }}
        >
          <span className={`ms ${chargement ? "spin" : ""}`} style={{ fontSize: 16 }}>refresh</span>
          Actualiser
        </button>
      </div>

      {/* Liste */}
      {chargement && rows.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--pb-on-surface-variant)", padding: 40 }}>
          Chargement…
        </p>
      ) : rows.length === 0 ? (
        <div style={{
          padding: 40,
          textAlign: "center",
          borderRadius: "1rem",
          background: "var(--pb-surface-container, #f5f5f5)",
          border: "1px dashed rgba(0,0,0,0.12)",
        }}>
          <span className="ms" style={{ fontSize: 48, color: "var(--pb-primary)", opacity: 0.4, display: "block", marginBottom: 10 }}>
            {onglet === "pending" ? "task_alt" : "inbox"}
          </span>
          <p style={{ margin: 0, fontSize: 15, color: "var(--pb-on-surface-variant)" }}>
            {onglet === "pending"
              ? "Aucune correction à relire."
              : "Aucune correction enregistrée pour le moment."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((r) => {
            const typeIA = r.type_erreur_ia ?? "autre";
            const labelIA = TYPE_LABELS[typeIA] ?? typeIA;
            const nomEleve = [r.eleve_prenom, r.eleve_nom].filter(Boolean).join(" ");
            const estEnEdition = editing === r.id;
            const estEnCours = enCoursId === r.id;
            const estDecide = r.statut !== null;

            return (
              <div
                key={r.id}
                style={{
                  padding: "14px 16px",
                  borderRadius: "1rem",
                  background: "white",
                  border: "1px solid rgba(0,0,0,0.08)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  opacity: estDecide && onglet === "all" ? 0.7 : 1,
                }}
              >
                {/* Header : élève + dictée + niveau */}
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  fontSize: 12,
                  color: "var(--pb-on-surface-variant)",
                  marginBottom: 10,
                  alignItems: "center",
                }}>
                  {nomEleve && (
                    <span style={{ fontWeight: 700, color: "var(--pb-on-surface)" }}>{nomEleve}</span>
                  )}
                  {r.niveau && (
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: "rgba(0,80,212,0.08)",
                      color: "var(--pb-primary)",
                      fontWeight: 700,
                    }}>{r.niveau}</span>
                  )}
                  {r.bloc_titre && <span>· {r.bloc_titre}</span>}
                  {r.bloc_etoiles && <span>· {"⭐".repeat(r.bloc_etoiles)}</span>}
                  <span style={{ marginLeft: "auto", fontSize: 11 }}>
                    {new Date(r.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  </span>
                </div>

                {/* Erreur : mot attendu vs mot écrit */}
                <div style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 12,
                  marginBottom: 10,
                  fontSize: 16,
                }}>
                  {r.kind === "del" ? (
                    <>
                      <span style={{ fontWeight: 700, color: "#059669" }}>
                        « {r.mot_attendu} »
                      </span>
                      <span style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>mot oublié</span>
                    </>
                  ) : r.kind === "ins" ? (
                    <>
                      <span style={{ fontWeight: 700, color: "#DC2626", textDecoration: "line-through" }}>
                        « {r.mot_eleve} »
                      </span>
                      <span style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>mot en trop</span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontWeight: 700, color: "#059669" }}>
                        « {r.mot_attendu} »
                      </span>
                      <span style={{ color: "var(--pb-on-surface-variant)", fontSize: 14 }}>→</span>
                      <span style={{ fontWeight: 700, color: "#DC2626" }}>
                        « {r.mot_eleve} »
                      </span>
                    </>
                  )}
                </div>

                {/* Contexte */}
                {r.contexte && (
                  <p style={{
                    fontSize: 13,
                    color: "var(--pb-on-surface-variant)",
                    margin: "0 0 10px",
                    fontStyle: "italic",
                  }}>
                    {r.contexte}
                  </p>
                )}

                {/* Proposition IA */}
                <div style={{
                  padding: "10px 12px",
                  borderRadius: "0.75rem",
                  background: "rgba(0,80,212,0.04)",
                  border: "1px solid rgba(0,80,212,0.12)",
                  marginBottom: 12,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--pb-primary)", marginBottom: 4 }}>
                    Proposition IA : {labelIA}
                  </div>
                  <div style={{ fontSize: 14, color: "var(--pb-on-surface)" }}>
                    💡 {r.indice_ia}
                  </div>
                </div>

                {/* Si déjà décidé : afficher la décision */}
                {estDecide && !estEnEdition && (
                  <div style={{
                    padding: "8px 12px",
                    borderRadius: "0.75rem",
                    background: r.statut === "valide" ? "#dcfce7" : r.statut === "corrige" ? "#fef3c7" : "#fee2e2",
                    border: `1px solid ${r.statut === "valide" ? "#86efac" : r.statut === "corrige" ? "#fcd34d" : "#fca5a5"}`,
                    fontSize: 13,
                    marginBottom: editing === r.id ? 0 : 0,
                  }}>
                    <strong>
                      {r.statut === "valide" ? "✓ Validée" : r.statut === "corrige" ? "✏️ Corrigée" : "❌ Rejetée"}
                    </strong>
                    {r.statut === "corrige" && r.type_erreur_corrige && (
                      <> → {TYPE_LABELS[r.type_erreur_corrige] ?? r.type_erreur_corrige}
                        {r.indice_corrige && <div style={{ marginTop: 4, fontStyle: "italic" }}>{r.indice_corrige}</div>}
                      </>
                    )}
                    {r.statut === "rejete" && r.commentaire_enseignant && (
                      <div style={{ marginTop: 4, fontStyle: "italic" }}>Raison : {r.commentaire_enseignant}</div>
                    )}
                  </div>
                )}

                {/* Form d'édition */}
                {estEnEdition && (
                  <div style={{
                    padding: "12px 14px",
                    borderRadius: "0.75rem",
                    background: "#fef3c7",
                    border: "1px solid #fcd34d",
                    marginBottom: 10,
                  }}>
                    <div style={{ display: "grid", gap: 10 }}>
                      <label style={{ fontSize: 12, fontWeight: 700 }}>
                        Type d&apos;erreur
                        <select
                          value={editType}
                          onChange={(e) => setEditType(e.target.value)}
                          style={{
                            display: "block",
                            width: "100%",
                            marginTop: 4,
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #ccc",
                            fontSize: 14,
                            background: "white",
                          }}
                        >
                          {TYPES_ERREUR.map((t) => (
                            <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>
                          ))}
                        </select>
                      </label>
                      <label style={{ fontSize: 12, fontWeight: 700 }}>
                        Indice pédagogique
                        <textarea
                          value={editIndice}
                          onChange={(e) => setEditIndice(e.target.value)}
                          rows={2}
                          style={{
                            display: "block",
                            width: "100%",
                            marginTop: 4,
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid #ccc",
                            fontSize: 14,
                            fontFamily: "inherit",
                            resize: "vertical",
                            background: "white",
                          }}
                        />
                      </label>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button
                        onClick={() => setEditing(null)}
                        className="pb-btn surface"
                        style={{ flex: 1, padding: "6px 12px", fontSize: 13 }}
                      >
                        Annuler
                      </button>
                      <button
                        onClick={() =>
                          decider(r.id, "corrige", {
                            type_erreur_corrige: editType,
                            indice_corrige: editIndice,
                          })
                        }
                        disabled={estEnCours}
                        className="pb-btn primary"
                        style={{ flex: 2, padding: "6px 12px", fontSize: 13 }}
                      >
                        Enregistrer
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions principales */}
                {!estEnEdition && (!estDecide || onglet === "all") && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => decider(r.id, "valide")}
                      disabled={estEnCours}
                      className="pb-btn surface"
                      style={{
                        flex: 1, padding: "8px 12px", fontSize: 13,
                        background: r.statut === "valide" ? "#dcfce7" : undefined,
                      }}
                    >
                      👍 Valider
                    </button>
                    <button
                      onClick={() => ouvrirEdition(r)}
                      disabled={estEnCours}
                      className="pb-btn surface"
                      style={{ flex: 1, padding: "8px 12px", fontSize: 13 }}
                    >
                      ✏️ Corriger
                    </button>
                    <button
                      onClick={() => {
                        const raison = window.prompt("Pourquoi ce n'est pas une faute ? (optionnel)") ?? "";
                        decider(r.id, "rejete", { commentaire_enseignant: raison || undefined });
                      }}
                      disabled={estEnCours}
                      className="pb-btn surface"
                      style={{
                        flex: 1, padding: "8px 12px", fontSize: 13,
                        background: r.statut === "rejete" ? "#fee2e2" : undefined,
                      }}
                    >
                      ❌ Rejeter
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
