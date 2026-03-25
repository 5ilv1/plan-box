"use client";

import { useState } from "react";
import { AssignationSelecteur, DifficulteNiveau, ParamsDictee } from "@/types";
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

const TEMPS_VERBAUX = [
  { label: "Présent",       value: "présent" },
  { label: "Imparfait",     value: "imparfait" },
  { label: "Passé composé", value: "passé composé" },
  { label: "Futur",         value: "futur" },
  { label: "Passé simple",  value: "passé simple" },
];

const POINTS_GRAM = [
  { label: "Accords sujet/verbe",  value: "accords sujet/verbe" },
  { label: "Accords adj/nom",      value: "accords adjectif/nom" },
  { label: "Féminin",              value: "formation du féminin" },
  { label: "Pluriel",              value: "formation du pluriel" },
  { label: "Homophones",           value: "homophones" },
  { label: "Ponctuation",          value: "ponctuation" },
  { label: "Majuscules",           value: "majuscules" },
];

const ASSIGNATION_VIDE: AssignationSelecteur = { groupeIds: [], eleveUids: [], groupeNoms: [] };

interface Props {
  onGenerer: (params: ParamsDictee) => void;
  chargement: boolean;
}

export default function GenererDicteeForm({ onGenerer, chargement }: Props) {
  const [theme, setTheme] = useState("");
  const [nbDictees, setNbDictees] = useState<1 | 2 | 3 | 4>(2);
  const [difficulteParNiveau, setDifficulteParNiveau] = useState<Record<1|2|3|4, DifficulteNiveau>>({
    1: "standard",
    2: "standard",
    3: "exigeant",
    4: "exigeant",
  });
  const [tempsVerbaux, setTempsVerbaux] = useState<string[]>(["imparfait"]);
  const [pointsGram, setPointsGram] = useState<string[]>(["accords sujet/verbe"]);
  const [assignation, setAssignation] = useState<AssignationSelecteur>(ASSIGNATION_VIDE);
  const [periodicite, setPeriodicite] = useState<"jour" | "semaine">("jour");
  const [dateAssignation, setDateAssignation] = useState(new Date().toISOString().split("T")[0]);
  const [semaineAssignation, setSemaineAssignation] = useState(semaineCourante());
  const [dateLimite, setDateLimite] = useState("");

  function toggle<T extends string>(arr: T[], val: T, set: (v: T[]) => void) {
    set(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!theme.trim()) { alert("Le thème est requis."); return; }
    if (assignation.groupeIds.length === 0 && assignation.eleveUids.length === 0) {
      alert("Veuillez sélectionner au moins un groupe ou un élève.");
      return;
    }
    const dateFinale = periodicite === "semaine" ? lundiDeSemaine(semaineAssignation) : dateAssignation;
    onGenerer({
      type: "dictee",
      theme: theme.trim(),
      tempsVerbaux,
      pointsGrammaticaux: pointsGram,
      nbDictees,
      difficulteParNiveau,
      assignation,
      dateAssignation: dateFinale,
      dateLimite,
      periodicite,
    });
  }

  const aucunAssigne = assignation.groupeIds.length === 0 && assignation.eleveUids.length === 0;

  return (
    <form onSubmit={handleSubmit}>
      {/* Thème */}
      <div className="form-group">
        <label className="form-label">Thème de la dictée</label>
        <input
          type="text"
          className="form-input"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="Ex. les animaux de la forêt, les saisons, la mer…"
          required
        />
      </div>

      {/* Nombre de dictées */}
      <div className="form-group">
        <label className="form-label">Nombre de dictées sur ce thème</label>
        <div style={{ display: "flex", gap: 8 }}>
          {([1, 2, 3, 4] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNbDictees(n)}
              style={{
                padding: "8px 18px", borderRadius: 8, fontSize: 14, cursor: "pointer",
                fontWeight: nbDictees === n ? 700 : 500,
                background: nbDictees === n ? "var(--primary)" : "white",
                color: nbDictees === n ? "white" : "var(--text-secondary)",
                border: nbDictees === n ? "none" : "1px solid var(--border)",
              }}
            >
              {n} {n === 1 ? "dictée" : "dictées"}
            </button>
          ))}
        </div>
        {nbDictees > 1 && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
            Les dictées seront espacées de 2 jours (ex. mardi + jeudi), même liste de mots, textes progressivement plus difficiles.
          </p>
        )}
      </div>

      {/* Difficulté par niveau d'étoiles */}
      <div className="form-group">
        <label className="form-label">Difficulté par niveau d'étoiles</label>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          {/* En-tête */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
            {(["📗 Standard", "📙 Exigeant", "📕 Expert"] as const).map((h) => (
              <div key={h} style={{ gridColumn: "span 1", textAlign: "center", padding: "6px 4px", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }} />
            ))}
          </div>
          {([
            { etoiles: 1 as const, label: "⭐ CE2" },
            { etoiles: 2 as const, label: "⭐⭐ CM1" },
            { etoiles: 3 as const, label: "⭐⭐⭐ CM2" },
            { etoiles: 4 as const, label: "⭐⭐⭐⭐ CM2+" },
          ]).map(({ etoiles, label }, idx) => {
            const diff = difficulteParNiveau[etoiles];
            return (
              <div
                key={etoiles}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr 1fr 1fr",
                  alignItems: "center",
                  borderBottom: idx < 3 ? "1px solid var(--border)" : "none",
                  background: "white",
                }}
              >
                {/* Étiquette niveau */}
                <div style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>
                  {label}
                </div>
                {/* Boutons difficulté */}
                {(["standard", "exigeant", "expert"] as const).map((d) => {
                  const actif = diff === d;
                  const couleurs: Record<string, { bg: string; color: string; border: string }> = {
                    standard: { bg: "#DCFCE7", color: "#166534", border: "#86EFAC" },
                    exigeant: { bg: "#FEF3C7", color: "#92400E", border: "#FCD34D" },
                    expert:   { bg: "#FEE2E2", color: "#991B1B", border: "#FCA5A5" },
                  };
                  const c = couleurs[d];
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDifficulteParNiveau((prev) => ({ ...prev, [etoiles]: d }))}
                      style={{
                        margin: "6px 4px",
                        padding: "5px 0",
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: "pointer",
                        textAlign: "center",
                        fontFamily: "var(--font)",
                        fontWeight: actif ? 700 : 400,
                        background: actif ? c.bg : "transparent",
                        color: actif ? c.color : "var(--text-secondary)",
                        border: `1.5px solid ${actif ? c.border : "var(--border)"}`,
                        transition: "all 0.15s",
                      }}
                    >
                      {d === "standard" ? "Standard" : d === "exigeant" ? "Exigeant" : "Expert"}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
          Standard : phrases simples · Exigeant : subordonnées, vocab riche · Expert : style littéraire
        </p>
      </div>

      {/* Temps verbaux */}
      <div className="form-group">
        <label className="form-label">Temps verbaux à travailler</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TEMPS_VERBAUX.map(({ label, value }) => {
            const actif = tempsVerbaux.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggle(tempsVerbaux, value, setTempsVerbaux)}
                style={{
                  padding: "7px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                  fontWeight: actif ? 700 : 500,
                  background: actif ? "var(--primary-pale)" : "white",
                  color: actif ? "var(--primary)" : "var(--text-secondary)",
                  border: `1.5px solid ${actif ? "var(--primary)" : "var(--border)"}`,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Points grammaticaux */}
      <div className="form-group">
        <label className="form-label">Points grammaticaux</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {POINTS_GRAM.map(({ label, value }) => {
            const actif = pointsGram.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggle(pointsGram, value, setPointsGram)}
                style={{
                  padding: "7px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                  fontWeight: actif ? 700 : 500,
                  background: actif ? "#FEF3C7" : "white",
                  color: actif ? "#92400E" : "var(--text-secondary)",
                  border: `1.5px solid ${actif ? "#D97706" : "var(--border)"}`,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <hr className="divider" />

      {/* Assignation */}
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: "var(--text)" }}>
        Assigner à
      </div>
      <AssignationSelector value={assignation} onChange={setAssignation} />

      {/* Planification */}
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
              {p === "jour" ? "📅 Jour précis" : "📆 Toute la semaine"}
            </button>
          ))}
        </div>

        <div className="grid-2">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">
              {periodicite === "jour" ? "Date de la 1ère dictée" : "Semaine d'assignation"}
            </label>
            {periodicite === "jour" ? (
              <input type="date" className="form-input" value={dateAssignation}
                onChange={(e) => setDateAssignation(e.target.value)} required />
            ) : (
              <input type="week" className="form-input" value={semaineAssignation}
                onChange={(e) => setSemaineAssignation(e.target.value)} required />
            )}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">
              Date limite <span className="text-secondary">(optionnel)</span>
            </label>
            <input type="date" className="form-input" value={dateLimite}
              onChange={(e) => setDateLimite(e.target.value)} />
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="btn-primary"
        disabled={chargement || aucunAssigne || !theme.trim()}
        style={{ width: "100%", marginTop: 20 }}
      >
        {chargement ? "Génération en cours…" : "🎧 Générer les dictées"}
      </button>
    </form>
  );
}
