"use client";

import { useState } from "react";
import { AssignationSelecteur, ParamsCalcMental } from "@/types";
import AssignationSelector from "@/components/AssignationSelector";

function semaineCourante(): string {
  const d = new Date();
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const diff = (d.getTime() - startOfWeek1.getTime()) / (7 * 24 * 3600 * 1000);
  const week = Math.floor(diff) + 1;
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function lundiDeSemaine(semaine: string): string {
  const [annee, w] = semaine.split("-W");
  const numSemaine = parseInt(w, 10);
  const jan4 = new Date(parseInt(annee, 10), 0, 4);
  const lundi = new Date(jan4);
  lundi.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (numSemaine - 1) * 7);
  return lundi.toISOString().split("T")[0];
}

const OPERATIONS = [
  { label: "+ Addition",       value: "+" },
  { label: "− Soustraction",   value: "-" },
  { label: "× Multiplication", value: "×" },
  { label: "÷ Division",       value: "÷" },
];

interface GenererCalcMentalFormProps {
  onGenerer: (params: ParamsCalcMental) => void;
  onPiocherBanque: () => void;
  chargement: boolean;
}

const ASSIGNATION_VIDE: AssignationSelecteur = {
  groupeIds: [],
  eleveUids: [],
  groupeNoms: [],
};

export default function GenererCalcMentalForm({
  onGenerer,
  onPiocherBanque,
  chargement,
}: GenererCalcMentalFormProps) {
  const [operations, setOperations] = useState<string[]>(["+"]);
  const [table, setTable] = useState("");
  const [nbCalculs, setNbCalculs] = useState(10);
  const [difficulte, setDifficulte] = useState<"facile" | "moyen" | "difficile">("moyen");
  const [assignation, setAssignation] = useState<AssignationSelecteur>(ASSIGNATION_VIDE);
  const [periodicite, setPeriodicite] = useState<"jour" | "semaine">("jour");
  const [dateAssignation, setDateAssignation] = useState(new Date().toISOString().split("T")[0]);
  const [semaineAssignation, setSemaineAssignation] = useState(semaineCourante());
  const [dateLimite, setDateLimite] = useState("");

  function toggleOperation(op: string) {
    setOperations((prev) =>
      prev.includes(op) ? prev.filter((o) => o !== op) : [...prev, op]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (operations.length === 0) return;
    if (assignation.groupeIds.length === 0 && assignation.eleveUids.length === 0) {
      alert("Veuillez sélectionner au moins un groupe ou un élève.");
      return;
    }
    const niveauNom = assignation.groupeNoms.join(", ") || "École primaire";
    const dateFinale = periodicite === "semaine" ? lundiDeSemaine(semaineAssignation) : dateAssignation;
    onGenerer({
      type: "calcul_mental",
      niveauNom,
      operations,
      table,
      nbCalculs,
      difficulte,
      assignation,
      dateAssignation: dateFinale,
      dateLimite,
      periodicite,
    });
  }

  const aucunAssigne = assignation.groupeIds.length === 0 && assignation.eleveUids.length === 0;

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid-2" style={{ marginBottom: 16 }}>
        {/* Nombre de calculs */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Nombre de calculs</label>
          <select
            className="form-input"
            value={nbCalculs}
            onChange={(e) => setNbCalculs(Number(e.target.value))}
          >
            {[5, 8, 10].map((n) => (
              <option key={n} value={n}>{n} calculs</option>
            ))}
          </select>
        </div>

        {/* Difficulté */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Difficulté</label>
          <select
            className="form-input"
            value={difficulte}
            onChange={(e) => setDifficulte(e.target.value as "facile" | "moyen" | "difficile")}
          >
            <option value="facile">Facile</option>
            <option value="moyen">Moyen</option>
            <option value="difficile">Difficile</option>
          </select>
        </div>
      </div>

      {/* Opérations */}
      <div className="form-group">
        <label className="form-label">Opérations</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {OPERATIONS.map(({ label, value }) => {
            const actif = operations.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleOperation(value)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: `1.5px solid ${actif ? "var(--primary)" : "var(--border)"}`,
                  background: actif ? "var(--primary-pale)" : "var(--white)",
                  color: actif ? "var(--primary)" : "var(--text-secondary)",
                  fontWeight: actif ? 700 : 400,
                  cursor: "pointer",
                  fontSize: 14,
                  fontFamily: "var(--font)",
                  transition: "all 0.15s ease",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        {operations.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--error)", marginTop: 4 }}>
            Sélectionne au moins une opération
          </p>
        )}
      </div>

      {/* Table ciblée */}
      <div className="form-group">
        <label className="form-label">
          Table ciblée <span className="text-secondary">(optionnel)</span>
        </label>
        <input
          type="text"
          className="form-input"
          value={table}
          onChange={(e) => setTable(e.target.value)}
          placeholder="Ex. table de 7"
        />
      </div>

      <hr className="divider" />

      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: "var(--text)" }}>
        Assigner à
      </div>

      <AssignationSelector value={assignation} onChange={setAssignation} />

      {/* Toggle Jour / Semaine */}
      <div style={{ marginTop: 16 }}>
        <label className="form-label">Planification</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(["jour", "semaine"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriodicite(p)}
              style={{
                padding: "7px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                fontWeight: periodicite === p ? 700 : 500,
                background: periodicite === p ? "var(--primary)" : "white",
                color: periodicite === p ? "white" : "var(--text-secondary)",
                border: periodicite === p ? "none" : "1px solid var(--border)",
              }}
            >
              {p === "jour" ? <><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>calendar_today</span> Jour précis</> : <><span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>date_range</span> Toute la semaine</>}
            </button>
          ))}
        </div>

        <div className="grid-2">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">
              {periodicite === "jour" ? "Date d'assignation" : "Semaine d'assignation"}
            </label>
            {periodicite === "jour" ? (
              <input
                type="date"
                className="form-input"
                value={dateAssignation}
                onChange={(e) => setDateAssignation(e.target.value)}
                required
              />
            ) : (
              <input
                type="week"
                className="form-input"
                value={semaineAssignation}
                onChange={(e) => setSemaineAssignation(e.target.value)}
                required
              />
            )}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">
              Date limite <span className="text-secondary">(optionnel)</span>
            </label>
            <input
              type="date"
              className="form-input"
              value={dateLimite}
              onChange={(e) => setDateLimite(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button
          type="submit"
          className="btn-primary"
          disabled={chargement || aucunAssigne || operations.length === 0}
          style={{ flex: 1 }}
        >
          {chargement ? "Génération en cours…" : <><span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>pin</span> Générer le calcul mental</>}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={onPiocherBanque}
          disabled={chargement}
        >
          <span className="ms" style={{ fontSize: 16, verticalAlign: "middle" }}>folder_open</span> Banque
        </button>
      </div>
    </form>
  );
}
