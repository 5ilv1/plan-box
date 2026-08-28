"use client";

import { useState } from "react";
import { AssignationSelecteur } from "@/types";
import AssignationSelector from "@/components/AssignationSelector";
import MatiereChapitreSelector, { MatiereChapitreValue } from "@/components/MatiereChapitreSelector";
import { lundiDeSemaine, semaineISO } from "@/lib/semaine-iso";

interface Props {
  onGenerer: (params: any) => void;
  chargement: boolean;
  defaultValues?: any;
}

const ASSIGNATION_VIDE: AssignationSelecteur = { groupeIds: [], eleveUids: [], groupeNoms: [] };

const THEMES_SUGGERES = [
  "problèmes de durée",
  "problèmes de monnaie",
  "problèmes de longueurs",
  "problèmes de masse",
  "problèmes de multiplication",
  "problèmes de division",
  "problèmes de proportionnalité",
  "problèmes à étapes",
];

export default function GenererProblemeMathsForm({ onGenerer, chargement, defaultValues }: Props) {
  const dv = defaultValues;

  const [theme, setTheme] = useState(dv?.theme ?? "");
  const [niveau, setNiveau] = useState(dv?.niveau ?? "CM1");
  const [description, setDescription] = useState(dv?.description ?? "");
  const [assignation, setAssignation] = useState<AssignationSelecteur>(dv?.assignation ?? ASSIGNATION_VIDE);
  const [periodicite, setPeriodicite] = useState<"jour" | "semaine">(dv?.periodicite ?? "jour");
  const [dateAssignation, setDateAssignation] = useState(dv?.dateAssignation ?? new Date().toISOString().split("T")[0]);
  const [semaineAssignation, setSemaineAssignation] = useState(semaineISO());
  const [dateLimite, setDateLimite] = useState("");

  const [mcv, setMcv] = useState<MatiereChapitreValue>({
    matiere: dv?.matiere ?? "",
    sousMatiere: dv?.sousMatiere ?? "",
    chapitreId: dv?.chapitreId ?? "",
    chapitreTitre: dv?.chapitreTitre ?? "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!theme.trim()) {
      alert("Précise un thème pour les problèmes.");
      return;
    }

    const dateEff = periodicite === "semaine" ? lundiDeSemaine(semaineAssignation) : dateAssignation;

    onGenerer({
      type: "probleme_maths" as const,
      theme: theme.trim(),
      niveau,
      matiere: mcv.matiere,
      sousMatiere: mcv.sousMatiere,
      description,
      chapitreId: mcv.chapitreId || null,
      chapitreTitre: mcv.chapitreId ? (mcv.chapitreTitre || "Non spécifié") : "Sans chapitre",
      assignation,
      dateAssignation: dateEff,
      dateLimite,
      periodicite,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <MatiereChapitreSelector value={mcv} onChange={setMcv} matiereParDefaut="Mathématiques" />

      {/* Thème */}
      <div className="form-group">
        <label className="form-label">Thème des problèmes</label>
        <input
          className="form-input"
          type="text"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="Ex : problèmes de durée, problèmes à étapes…"
          list="themes-problemes-maths"
        />
        <datalist id="themes-problemes-maths">
          {THEMES_SUGGERES.map((t) => <option key={t} value={t} />)}
        </datalist>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {THEMES_SUGGERES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              style={{
                padding: "4px 10px", borderRadius: 999, fontSize: "0.75rem",
                border: "1px solid var(--border)",
                background: theme === t ? "rgba(15,118,110,0.1)" : "white",
                color: theme === t ? "#0F766E" : "var(--text-secondary)",
                cursor: "pointer", fontWeight: 600,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Niveau */}
      <div className="form-group">
        <label className="form-label">Niveau</label>
        <select className="form-input" value={niveau} onChange={(e) => setNiveau(e.target.value)}>
          <option value="CE2">CE2</option>
          <option value="CM1">CM1</option>
          <option value="CM2">CM2</option>
        </select>
      </div>

      {/* Description optionnelle */}
      <div className="form-group">
        <label className="form-label">Précisions pour l&apos;IA (optionnel)</label>
        <textarea
          className="form-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder='Ex : "Contextes sportifs" ou "Inclure au moins un problème à deux étapes"'
          rows={3}
          style={{ resize: "vertical" }}
        />
      </div>

      {/* Info : 3 problèmes */}
      <div style={{
        background: "rgba(15,118,110,0.06)",
        border: "1px solid rgba(15,118,110,0.2)",
        borderRadius: 10, padding: "10px 14px",
        fontSize: "0.8125rem", color: "#0F766E", marginBottom: 16,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span className="ms" style={{ fontSize: 18 }}>info</span>
        L&apos;IA génère <strong>3 problèmes</strong> avec résultat, phrase réponse et indice.
      </div>

      {/* Assignation */}
      <AssignationSelector value={assignation} onChange={setAssignation} />

      {/* Périodicité + Date */}
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Périodicité</label>
          <select className="form-input" value={periodicite} onChange={(e) => setPeriodicite(e.target.value as "jour" | "semaine")}>
            <option value="jour">Jour</option>
            <option value="semaine">Semaine</option>
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">{periodicite === "semaine" ? "Semaine" : "Date"}</label>
          {periodicite === "semaine" ? (
            <input className="form-input" type="week" value={semaineAssignation} onChange={(e) => setSemaineAssignation(e.target.value)} />
          ) : (
            <input className="form-input" type="date" value={dateAssignation} onChange={(e) => setDateAssignation(e.target.value)} />
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button type="submit" className="btn-primary" disabled={chargement} style={{ flex: 1 }}>
          {chargement ? "Génération en cours…" : "✨ Générer avec l'IA"}
        </button>
      </div>
    </form>
  );
}
