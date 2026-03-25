"use client";

import { useState, useEffect } from "react";

interface Membre {
  uid: string;       // "pb_<uuid>" ou "rb_<int>"
  prenom: string;
  nom: string;
  source: string;
}

interface Groupe {
  id: string;
  nom: string;
  membres: Membre[];
}

interface ExerciceAAfecter {
  id: string;
  type: string;
  titre: string | null;
  contenu: Record<string, unknown>;
  chapitre_id?: string | null;
}

interface AffecterExerciceModalProps {
  exercice: ExerciceAAfecter;
  onClose: () => void;
  onSuccess?: () => void;
}

type Mode = "classe" | "groupes" | "eleve";

export default function AffecterExerciceModal({ exercice, onClose, onSuccess }: AffecterExerciceModalProps) {
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [chargement, setChargement] = useState(true);
  const [mode, setMode] = useState<Mode>("groupes");

  const [groupeIds, setGroupeIds] = useState<Set<string>>(new Set());
  const [eleveUid, setEleveUid] = useState("");

  const today = new Date().toISOString().split("T")[0];
  const [dateAssignation, setDateAssignation] = useState(today);
  const [dateLimite, setDateLimite] = useState("");

  const [enSoumission, setEnSoumission] = useState(false);
  const [succes, setSucces] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/groupes")
      .then((r) => r.json())
      .then((json) => {
        const gs: Groupe[] = json.groupes ?? [];
        setGroupes(gs);
      })
      .finally(() => setChargement(false));
  }, []);

  // Tous les élèves dédupliqués (pour mode individuel)
  const tousEleves: Membre[] = (() => {
    const seen = new Set<string>();
    const res: Membre[] = [];
    for (const g of groupes) {
      for (const m of g.membres) {
        if (!seen.has(m.uid)) { seen.add(m.uid); res.push(m); }
      }
    }
    return res.sort((a, b) => a.prenom.localeCompare(b.prenom));
  })();

  useEffect(() => {
    if (mode === "eleve" && tousEleves.length > 0 && !eleveUid) {
      setEleveUid(tousEleves[0].uid);
    }
  }, [mode, tousEleves.length]);

  function toggleGroupe(id: string) {
    setGroupeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function affecter() {
    setEnSoumission(true);
    setErreur(null);

    const body: Record<string, unknown> = {
      type: exercice.type,
      titre: exercice.titre,
      contenu: exercice.contenu,
      chapitreId: exercice.chapitre_id ?? null,
      dateAssignation,
      dateLimite: dateLimite || null,
      periodicite: "jour",
    };

    if (mode === "classe") {
      body.groupeIds = groupes.map((g) => g.id);
    } else if (mode === "groupes") {
      body.groupeIds = Array.from(groupeIds);
    } else {
      body.eleveUids = [eleveUid];
    }

    const res = await fetch("/api/affecter-exercice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    if (json.ok) {
      setSucces(`Affecté à ${json.nb} élève${json.nb > 1 ? "s" : ""} ✓`);
      onSuccess?.();
      setTimeout(onClose, 1800);
    } else {
      setErreur(json.erreur ?? "Erreur inconnue");
    }
    setEnSoumission(false);
  }

  const peutSoumettre = (() => {
    if (mode === "classe") return groupes.length > 0;
    if (mode === "groupes") return groupeIds.size > 0;
    return !!eleveUid;
  })();

  const MODES: { key: Mode; label: string }[] = [
    { key: "classe", label: "Toute la classe" },
    { key: "groupes", label: "Groupe(s)" },
    { key: "eleve", label: "Un élève" },
  ];

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24 }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 480, padding: "24px 22px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Affecter l'exercice</h3>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
              {exercice.titre ?? "Sans titre"}
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose} style={{ padding: "4px 10px" }}>✕</button>
        </div>

        {chargement ? (
          <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-secondary)" }}>Chargement…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Toggle 3 modes */}
            <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
              {MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  style={{
                    flex: 1, padding: "8px 0", fontSize: 12, fontWeight: mode === m.key ? 700 : 500,
                    background: mode === m.key ? "var(--primary)" : "white",
                    color: mode === m.key ? "white" : "var(--text-secondary)",
                    border: "none", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Toute la classe */}
            {mode === "classe" && (
              <div style={{ padding: "10px 14px", background: "var(--bg)", borderRadius: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                {groupes.length === 0
                  ? "Aucun groupe créé."
                  : `Tous les élèves de tous les groupes (${tousEleves.length} élève${tousEleves.length > 1 ? "s" : ""})`}
              </div>
            )}

            {/* Sélection multi-groupes */}
            {mode === "groupes" && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, display: "block" }}>
                  Groupes
                </label>
                {groupes.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Aucun groupe créé.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {groupes.map((g) => (
                      <label
                        key={g.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                          borderRadius: 8, border: `1px solid ${groupeIds.has(g.id) ? "var(--primary)" : "var(--border)"}`,
                          background: groupeIds.has(g.id) ? "rgba(var(--primary-rgb, 59,130,246),0.06)" : "white",
                          cursor: "pointer", fontSize: 14,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={groupeIds.has(g.id)}
                          onChange={() => toggleGroupe(g.id)}
                          style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--primary)" }}
                        />
                        <span style={{ flex: 1, fontWeight: 500 }}>{g.nom}</span>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          {g.membres.length} élève{g.membres.length > 1 ? "s" : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {groupeIds.size === 0 && groupes.length > 0 && (
                  <p style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>Sélectionnez au moins un groupe.</p>
                )}
              </div>
            )}

            {/* Sélecteur élève */}
            {mode === "eleve" && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>
                  Élève
                </label>
                {tousEleves.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Aucun élève dans les groupes.</p>
                ) : (
                  <select
                    className="form-input"
                    value={eleveUid}
                    onChange={(e) => setEleveUid(e.target.value)}
                    style={{ width: "100%", fontSize: 14 }}
                  >
                    {tousEleves.map((e) => (
                      <option key={e.uid} value={e.uid}>
                        {e.prenom} {e.nom}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Date d'assignation */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>
                Date d'assignation
              </label>
              <input
                type="date"
                className="form-input"
                value={dateAssignation}
                onChange={(e) => setDateAssignation(e.target.value)}
                style={{ width: "100%", fontSize: 14 }}
              />
            </div>

            {/* Date limite */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>
                Date limite <span style={{ fontWeight: 400 }}>(optionnel)</span>
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="date"
                  className="form-input"
                  value={dateLimite}
                  min={dateAssignation}
                  onChange={(e) => setDateLimite(e.target.value)}
                  style={{ flex: 1, fontSize: 14 }}
                />
                {dateLimite && (
                  <button className="btn-ghost" onClick={() => setDateLimite("")} style={{ padding: "4px 10px", fontSize: 13 }}>
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Erreur / Succès */}
            {erreur && (
              <div style={{ padding: "8px 12px", background: "#FEE2E2", borderRadius: 8, fontSize: 13, color: "#DC2626" }}>
                {erreur}
              </div>
            )}
            {succes && (
              <div style={{ padding: "8px 12px", background: "#D1FAE5", borderRadius: 8, fontSize: 13, color: "#065F46", fontWeight: 600 }}>
                {succes}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {!succes && (
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
            <button className="btn-ghost" onClick={onClose} style={{ fontSize: 14 }}>Annuler</button>
            <button
              className="btn-primary"
              onClick={affecter}
              disabled={enSoumission || chargement || !peutSoumettre}
              style={{ fontSize: 14 }}
            >
              {enSoumission ? "Affectation…" : "Affecter"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
