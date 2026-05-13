"use client";

import { useState } from "react";
import { AssignationSelecteur, ParamsExercice } from "@/types";
import AssignationSelector from "@/components/AssignationSelector";
import MatiereChapitreSelector, { MatiereChapitreValue } from "@/components/MatiereChapitreSelector";

interface GenererExerciceFormProps {
  onGenerer: (params: ParamsExercice) => void;
  onPiocherBanque: () => void;
  chargement: boolean;
  defaultChapitreId?: string; // pré-sélectionne un chapitre (depuis la page détail)
  defaultValues?: ParamsExercice; // pré-remplit le formulaire (retour depuis l'aperçu)
}

const ASSIGNATION_VIDE: AssignationSelecteur = {
  groupeIds: [],
  eleveUids: [],
  groupeNoms: [],
};

/** Retourne la semaine courante au format "YYYY-Www" pour <input type="week"> */
function semaineCourante(): string {
  const d = new Date();
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const diff = (d.getTime() - startOfWeek1.getTime()) / (7 * 24 * 3600 * 1000);
  const week = Math.floor(diff) + 1;
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Convertit "YYYY-Www" en date ISO du lundi de cette semaine */
function lundiDeSemaine(semaine: string): string {
  const [annee, w] = semaine.split("-W");
  const numSemaine = parseInt(w, 10);
  const jan4 = new Date(parseInt(annee, 10), 0, 4);
  const lundi = new Date(jan4);
  lundi.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (numSemaine - 1) * 7);
  return lundi.toISOString().split("T")[0];
}

export default function GenererExerciceForm({
  onGenerer,
  onPiocherBanque,
  chargement,
  defaultChapitreId,
  defaultValues,
}: GenererExerciceFormProps) {
  const dv = defaultValues;

  const [mcv, setMcv] = useState<MatiereChapitreValue>({
    matiere: dv?.matiere ?? "",
    sousMatiere: "",
    chapitreId: dv?.chapitreId ?? "",
    chapitreTitre: dv?.chapitreTitre ?? "",
  });
  const [nbQuestions, setNbQuestions] = useState(dv?.nbQuestions ?? 5);
  const [difficulte, setDifficulte] = useState<"facile" | "moyen" | "difficile">(dv?.difficulte ?? "moyen");
  const [contexte, setContexte] = useState(dv?.contexte ?? "");
  const [consigneDetaillee, setConsigneDetaillee] = useState(dv?.consigneDetaillee ?? "");
  const [modele, setModele] = useState(dv?.modele ?? "");
  const [pdfModele, setPdfModele] = useState<{ name: string; base64: string } | null>(null);
  const [assignation, setAssignation] = useState<AssignationSelecteur>(dv?.assignation ?? ASSIGNATION_VIDE);
  const [periodicite, setPeriodicite] = useState<"jour" | "semaine">(dv?.periodicite ?? "jour");
  const [dateAssignation, setDateAssignation] = useState(dv?.dateAssignation ?? new Date().toISOString().split("T")[0]);
  const [semaineAssignation, setSemaineAssignation] = useState(semaineCourante());
  const [dateLimite, setDateLimite] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (assignation.groupeIds.length === 0 && assignation.eleveUids.length === 0) {
      alert("Veuillez sélectionner au moins un groupe ou un élève.");
      return;
    }
    const niveauNom = assignation.groupeNoms.join(", ") || "École primaire";
    const dateFinale = periodicite === "semaine" ? lundiDeSemaine(semaineAssignation) : dateAssignation;
    onGenerer({
      type: "exercice",
      matiere: mcv.matiere,
      niveauNom,
      chapitreId: mcv.chapitreId || null,
      chapitreTitre: mcv.chapitreId ? (mcv.chapitreTitre || "Non spécifié") : "Sans chapitre",
      nbQuestions,
      difficulte,
      contexte,
      consigneDetaillee,
      modele,
      pdfModeleBase64: pdfModele?.base64 ?? undefined,
      assignation,
      dateAssignation: dateFinale,
      dateLimite,
      periodicite,
    });
  }

  const aucunAssigne = assignation.groupeIds.length === 0 && assignation.eleveUids.length === 0;

  return (
    <form onSubmit={handleSubmit}>
      <MatiereChapitreSelector
        value={mcv}
        onChange={setMcv}
        defaultChapitreId={defaultChapitreId}
      />

      <div className="grid-2" style={{ marginBottom: 16 }}>
        {/* Nb questions */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Nombre de questions</label>
          <select
            className="form-input"
            value={nbQuestions}
            onChange={(e) => setNbQuestions(Number(e.target.value))}
          >
            {[3, 5, 8, 10].map((n) => (
              <option key={n} value={n}>{n} questions</option>
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

      {/* Contexte */}
      <div className="form-group">
        <label className="form-label">
          Contexte / thème <span className="text-secondary">(optionnel)</span>
        </label>
        <input
          type="text"
          className="form-input"
          value={contexte}
          onChange={(e) => setContexte(e.target.value)}
          placeholder="Ex. les animaux, la ferme…"
        />
      </div>

      {/* Consigne détaillée */}
      <div className="form-group">
        <label className="form-label">
          Consigne détaillée <span className="text-secondary">(optionnel)</span>
        </label>
        <textarea
          className="form-input"
          value={consigneDetaillee}
          onChange={(e) => setConsigneDetaillee(e.target.value)}
          placeholder="Décrivez précisément l'exercice attendu. Ex : Je veux des problèmes de partage avec des nombres à 3 chiffres, les élèves doivent poser la division…"
          rows={3}
          style={{ resize: "vertical", lineHeight: 1.5 }}
        />
      </div>

      {/* Modèle */}
      <div className="form-group">
        <label className="form-label">
          Exercice modèle <span className="text-secondary">(optionnel — l'IA s'en inspire)</span>
        </label>
        <textarea
          className="form-input"
          rows={3}
          value={modele}
          onChange={(e) => setModele(e.target.value)}
          placeholder="Colle ici un exercice existant pour que l'IA génère dans le même style…"
          style={{ resize: "vertical" }}
        />

        {/* Upload PDF modèle */}
        <div style={{ marginTop: 10 }}>
          <label
            htmlFor="pdf-modele"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 8,
              border: "1.5px dashed var(--border)",
              background: "var(--bg-secondary, #F9FAFB)",
              cursor: "pointer", fontSize: 13, fontWeight: 600,
              color: "var(--text-secondary)",
              transition: "border-color 0.15s, background 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.background = "var(--blue-50, #EFF6FF)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-secondary, #F9FAFB)"; }}
          >
            <span className="ms" style={{ fontSize: 18, color: "var(--primary)" }}>upload_file</span>
            {pdfModele ? pdfModele.name : "Joindre un PDF comme modèle"}
          </label>
          <input
            id="pdf-modele"
            type="file"
            accept=".pdf"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 10 * 1024 * 1024) {
                alert("Le fichier est trop volumineux (max 10 Mo)");
                return;
              }
              const buffer = await file.arrayBuffer();
              const base64 = btoa(
                new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
              );
              setPdfModele({ name: file.name, base64 });
            }}
          />
          {pdfModele && (
            <button
              type="button"
              onClick={() => { setPdfModele(null); const el = document.getElementById("pdf-modele") as HTMLInputElement; if (el) el.value = ""; }}
              style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", color: "var(--error)", fontSize: 13, fontWeight: 600 }}
            >
              ✕ Retirer
            </button>
          )}
        </div>
      </div>

      <hr className="divider" />

      {/* Assignation */}
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

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button
          type="submit"
          className="btn-primary"
          disabled={chargement || aucunAssigne}
          style={{ flex: 1 }}
        >
          {chargement ? "Génération en cours…" : "✨ Générer l'exercice"}
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
