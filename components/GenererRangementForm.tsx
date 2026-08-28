"use client";

import { useState } from "react";
import { AssignationSelecteur } from "@/types";
import AssignationSelector from "@/components/AssignationSelector";
import MatiereChapitreSelector, { MatiereChapitreValue } from "@/components/MatiereChapitreSelector";
import { lundiDeSemaine, semaineISO } from "@/lib/semaine-iso";
import { CRITERES } from "@/lib/rangement";

interface Props {
  onGenerer: (params: any) => void;
  chargement: boolean;
  defaultValues?: any;
}

const ASSIGNATION_VIDE: AssignationSelecteur = { groupeIds: [], eleveUids: [], groupeNoms: [] };

export default function GenererRangementForm({ onGenerer, chargement, defaultValues }: Props) {
  const dv = defaultValues;

  const [niveau, setNiveau] = useState(dv?.niveau ?? "CM1");
  const [critere, setCritere] = useState(dv?.critere ?? "alphabetique");
  const [nbSeries, setNbSeries] = useState(dv?.nbSeries ?? 4);
  const [nbElements, setNbElements] = useState(dv?.nbElements ?? 5);
  const [description, setDescription] = useState(dv?.description ?? "");
  const [assignation, setAssignation] = useState<AssignationSelecteur>(dv?.assignation ?? ASSIGNATION_VIDE);
  const [periodicite, setPeriodicite] = useState<"jour" | "semaine">(dv?.periodicite ?? "jour");
  const [dateAssignation, setDateAssignation] = useState(dv?.dateAssignation ?? new Date().toISOString().split("T")[0]);
  const [semaineAssignation, setSemaineAssignation] = useState(semaineISO());

  const estFrancais = critere === "alphabetique" || critere === "phrase";

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
      type: "rangement" as const,
      niveau,
      matiere: mcv.matiere,
      sousMatiere: mcv.sousMatiere,
      critere,
      nbSeries,
      nbElements,
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
      <MatiereChapitreSelector value={mcv} onChange={setMcv} matiereParDefaut={estFrancais ? "Français" : "Maths"} />

      <div className="form-group">
        <label className="form-label">Critère de rangement</label>
        <select className="form-input" value={critere} onChange={(e) => setCritere(e.target.value)}>
          {Object.entries(CRITERES).map(([cle, c]) => (
            <option key={cle} value={cle}>{c.label}</option>
          ))}
        </select>
      </div>

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
          <label className="form-label">Nombre de séries</label>
          <input className="form-input" type="number" min={1} max={10} value={nbSeries}
            onChange={(e) => setNbSeries(parseInt(e.target.value) || 4)} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Étiquettes par série</label>
        <input className="form-input" type="number" min={3} max={8} value={nbElements}
          onChange={(e) => setNbElements(parseInt(e.target.value) || 5)} />
        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
          Entre 3 et 8. Au-delà de 6, la ligne passe à la ligne suivante sur les petits écrans.
        </p>
      </div>

      <div className="form-group">
        <label className="form-label">Description / consigne pour l&apos;IA (optionnel)</label>
        <textarea className="form-input" value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder={'Ex : "Vocabulaire de la météo" ou "Nombres décimaux au centième"'}
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
