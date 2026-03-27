"use client";

import { useState } from "react";
import { AssignationSelecteur, DifficulteNiveau, ParamsDictee } from "@/types";
import AssignationSelector from "@/components/AssignationSelector";

// Retourne le lundi de la semaine contenant une date ISO
function getLundiDeSemaine(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const jour = d.getDay(); // 0=dim, 1=lun…6=sam
  const offset = jour === 0 ? -6 : 1 - jour;
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}

// Retourne le prochain lundi (ou lundi suivant si on est déjà après lundi de cette semaine)
function getProchainLundi(): string {
  const d = new Date();
  const jour = d.getDay();
  const offset = jour === 0 ? 1 : jour === 1 ? 7 : 8 - jour;
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
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
  const [nbDictees, setNbDictees] = useState<1 | 2 | 3 | 4>(3);
  const [difficulteParNiveau, setDifficulteParNiveau] = useState<Record<1|2|3|4, DifficulteNiveau>>({
    1: "standard",
    2: "standard",
    3: "exigeant",
    4: "exigeant",
  });
  const [tempsVerbaux, setTempsVerbaux] = useState<string[]>(["imparfait"]);
  const [pointsGram, setPointsGram] = useState<string[]>(["accords sujet/verbe"]);
  const [assignation, setAssignation] = useState<AssignationSelecteur>(ASSIGNATION_VIDE);
  const [lundiDemarrage, setLundiDemarrage] = useState(getProchainLundi());

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
    onGenerer({
      type: "dictee",
      theme: theme.trim(),
      tempsVerbaux,
      pointsGrammaticaux: pointsGram,
      nbDictees,
      difficulteParNiveau,
      assignation,
      dateAssignation: lundiDemarrage,
      dateLimite: "",
      periodicite: "semaine",
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
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
          {nbDictees === 1 && "Mardi uniquement."}
          {nbDictees === 2 && "Mardi (entraînement) + Jeudi (entraînement). Mêmes mots, textes progressifs."}
          {nbDictees === 3 && "Mardi + Jeudi (élèves) · Vendredi = dictée bilan générée pour l'enseignant, non affectée aux élèves."}
          {nbDictees === 4 && "Mardi + Jeudi + Vendredi (élèves) · Samedi = bilan enseignant uniquement."}
        </p>
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
        <label className="form-label">Lundi de démarrage</label>
        <input
          type="date"
          className="form-input"
          value={lundiDemarrage}
          onChange={(e) => {
            if (e.target.value) setLundiDemarrage(getLundiDeSemaine(e.target.value));
          }}
          required
        />
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
          Les blocs seront créés pour le lundi (mots), mardi et jeudi (entraînement) de cette semaine.
        </p>
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
