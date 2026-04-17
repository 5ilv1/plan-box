"use client";

import { useState } from "react";
import { AssignationSelecteur } from "@/types";
import AssignationSelector from "@/components/AssignationSelector";

interface Props {
  onGenerer: (params: any) => void;
  chargement: boolean;
  defaultValues?: any;
}

const ASSIGNATION_VIDE: AssignationSelecteur = { groupeIds: [], eleveUids: [], groupeNoms: [] };

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

export default function GenererQCMForm({ onGenerer, chargement, defaultValues }: Props) {
  const dv = defaultValues;

  const [niveau, setNiveau] = useState(dv?.niveau ?? "CM1");
  const [matiere, setMatiere] = useState(dv?.matiere ?? "");
  const [sousMatiere, setSousMatiere] = useState(dv?.sous_matiere ?? "");
  const [theme, setTheme] = useState(dv?.theme ?? "");
  const [consigne, setConsigne] = useState(dv?.consigne ?? "");
  const [titre, setTitre] = useState(dv?.titre ?? "");
  const [nbQuestions, setNbQuestions] = useState(dv?.nbQuestions ?? 10);
  const [assignation, setAssignation] = useState<AssignationSelecteur>(dv?.assignation ?? ASSIGNATION_VIDE);
  const [periodicite, setPeriodicite] = useState<"jour" | "semaine">(dv?.periodicite ?? "jour");
  const [dateAssignation, setDateAssignation] = useState(dv?.dateAssignation ?? new Date().toISOString().split("T")[0]);
  const [semaineAssignation, setSemaineAssignation] = useState(semaineCourante());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!theme.trim() && !sousMatiere.trim() && !consigne.trim()) {
      alert("Précise au moins un thème, une sous-matière ou une consigne.");
      return;
    }
    const dateEff = periodicite === "semaine" ? lundiDeSemaine(semaineAssignation) : dateAssignation;
    onGenerer({
      type: "qcm" as const,
      niveau,
      matiere,
      sous_matiere: sousMatiere,
      theme,
      consigne,
      titre: titre || undefined,
      nbQuestions,
      assignation,
      dateAssignation: dateEff,
      dateLimite: "",
      periodicite,
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: "16px 0" }}>
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Niveau</label>
          <select className="form-input" value={niveau} onChange={(e) => setNiveau(e.target.value)}>
            <option value="CE2">CE2</option>
            <option value="CM1">CM1</option>
            <option value="CM2">CM2</option>
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Nombre de questions</label>
          <input
            className="form-input"
            type="number"
            min={3}
            max={20}
            value={nbQuestions}
            onChange={(e) => setNbQuestions(parseInt(e.target.value) || 10)}
          />
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Matière (optionnel)</label>
          <input
            className="form-input"
            value={matiere}
            onChange={(e) => setMatiere(e.target.value)}
            placeholder="Ex : Sciences, Histoire…"
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Sous-matière / notion (optionnel)</label>
          <input
            className="form-input"
            value={sousMatiere}
            onChange={(e) => setSousMatiere(e.target.value)}
            placeholder="Ex : les volcans, la Gaule…"
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Thème / sujet du QCM</label>
        <input
          className="form-input"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="Ex : Le système solaire, la Préhistoire, les fractions simples…"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Consignes pour l&apos;IA (optionnel)</label>
        <textarea
          className="form-input"
          value={consigne}
          onChange={(e) => setConsigne(e.target.value)}
          rows={2}
          placeholder='Ex : "Insiste sur le vocabulaire" ou "Questions plutôt faciles"'
          style={{ resize: "vertical" }}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Titre (optionnel)</label>
        <input
          className="form-input"
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Ex : QCM — Le système solaire"
        />
      </div>

      <AssignationSelector value={assignation} onChange={setAssignation} />

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Périodicité</label>
          <select
            className="form-input"
            value={periodicite}
            onChange={(e) => setPeriodicite(e.target.value as "jour" | "semaine")}
          >
            <option value="jour">Jour</option>
            <option value="semaine">Semaine</option>
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">{periodicite === "semaine" ? "Semaine" : "Date"}</label>
          {periodicite === "semaine" ? (
            <input
              className="form-input"
              type="week"
              value={semaineAssignation}
              onChange={(e) => setSemaineAssignation(e.target.value)}
            />
          ) : (
            <input
              className="form-input"
              type="date"
              value={dateAssignation}
              onChange={(e) => setDateAssignation(e.target.value)}
            />
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button type="submit" className="btn-primary" disabled={chargement} style={{ flex: 1 }}>
          {chargement ? "Génération du QCM…" : "✨ Générer le QCM"}
        </button>
      </div>
    </form>
  );
}
