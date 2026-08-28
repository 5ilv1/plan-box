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

const TYPES_NOMBRES = [
  { value: "entiers",   label: "Nombres entiers" },
  { value: "grands",    label: "Grands nombres (milliers, millions)" },
  { value: "decimaux",  label: "Nombres décimaux" },
  { value: "fractions", label: "Fractions simples" },
  { value: "calculs",   label: "Petits calculs à comparer" },
];

export default function GenererComparaisonForm({ onGenerer, chargement, defaultValues }: Props) {
  const dv = defaultValues;

  const [niveau, setNiveau] = useState(dv?.niveau ?? "CM1");
  const [typeNombres, setTypeNombres] = useState(dv?.typeNombres ?? "entiers");
  const [nbPaires, setNbPaires] = useState(dv?.nbPaires ?? 10);
  const [avecEgalite, setAvecEgalite] = useState<boolean>(dv?.avecEgalite ?? false);
  const [description, setDescription] = useState(dv?.description ?? "");
  const [assignation, setAssignation] = useState<AssignationSelecteur>(dv?.assignation ?? ASSIGNATION_VIDE);
  const [periodicite, setPeriodicite] = useState<"jour" | "semaine">(dv?.periodicite ?? "jour");
  const [dateAssignation, setDateAssignation] = useState(dv?.dateAssignation ?? new Date().toISOString().split("T")[0]);
  const [semaineAssignation, setSemaineAssignation] = useState(semaineISO());

  const [mcv, setMcv] = useState<MatiereChapitreValue>({
    matiere: dv?.matiere ?? "",
    sousMatiere: dv?.sousMatiere ?? "",
    chapitreId: dv?.chapitreId ?? "",
    chapitreTitre: dv?.chapitreTitre ?? "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dateEff = periodicite === "semaine" ? lundiDeSemaine(semaineAssignation) : dateAssignation;

    onGenerer({
      type: "comparaison" as const,
      niveau,
      matiere: mcv.matiere,
      sousMatiere: mcv.sousMatiere,
      typeNombres,
      nbPaires,
      avecEgalite,
      description,
      chapitreId: mcv.chapitreId || null,
      chapitreTitre: mcv.chapitreId ? (mcv.chapitreTitre || "Non spécifié") : "Sans chapitre",
      assignation,
      dateAssignation: dateEff,
      dateLimite: "",
      periodicite,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <MatiereChapitreSelector value={mcv} onChange={setMcv} matiereParDefaut="Maths" />

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
          <label className="form-label">Nombre de comparaisons</label>
          <input className="form-input" type="number" min={4} max={20} value={nbPaires}
            onChange={(e) => setNbPaires(parseInt(e.target.value) || 10)} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Nombres à comparer</label>
        <select className="form-input" value={typeNombres} onChange={(e) => setTypeNombres(e.target.value)}>
          {TYPES_NOMBRES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.875rem", cursor: "pointer" }}>
          <input type="checkbox" checked={avecEgalite} onChange={(e) => setAvecEgalite(e.target.checked)} />
          Autoriser le signe <strong>=</strong> (deux écritures du même nombre)
        </label>
        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
          Sans cette option, l&apos;élève ne choisit qu&apos;entre <strong>&lt;</strong> et <strong>&gt;</strong>.
        </p>
      </div>

      <div className="form-group">
        <label className="form-label">Description / consigne pour l&apos;IA (optionnel)</label>
        <textarea className="form-input" value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder={'Ex : "Reste sous 10 000" ou "Insiste sur les décimaux avec des zéros"'}
          rows={3} style={{ resize: "vertical" }} />
      </div>

      <AssignationSelector value={assignation} onChange={setAssignation} />

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
