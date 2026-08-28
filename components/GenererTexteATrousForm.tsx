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

const ASSIGNATION_VIDE: AssignationSelecteur = {
  groupeIds: [],
  eleveUids: [],
  groupeNoms: [],
};

export default function GenererTexteATrousForm({ onGenerer, chargement, defaultValues }: Props) {
  const dv = defaultValues;

  const [mode, setMode] = useState<"ia" | "manuel">(dv?.mode ?? "ia");
  const [niveau, setNiveau] = useState(dv?.niveau ?? "CM1");
  const [objectif, setObjectif] = useState(dv?.objectif ?? "");
  const [description, setDescription] = useState(dv?.description ?? "");
  const [theme, setTheme] = useState(dv?.theme ?? "");
  const [texteManuel, setTexteManuel] = useState(dv?.texteManuel ?? "");
  const [mcv, setMcv] = useState<MatiereChapitreValue>({
    matiere: dv?.matiere ?? "",
    sousMatiere: dv?.sousMatiere ?? "",
    chapitreId: dv?.chapitreId ?? "",
    chapitreTitre: dv?.chapitreTitre ?? "",
  });
  const [pdfModele, setPdfModele] = useState<{ name: string; base64: string } | null>(null);
  const [assignation, setAssignation] = useState<AssignationSelecteur>(dv?.assignation ?? ASSIGNATION_VIDE);
  const [periodicite, setPeriodicite] = useState<"jour" | "semaine">(dv?.periodicite ?? "jour");
  const [dateAssignation, setDateAssignation] = useState(dv?.dateAssignation ?? new Date().toISOString().split("T")[0]);
  const [semaineAssignation, setSemaineAssignation] = useState(semaineISO());
  const [dateLimite, setDateLimite] = useState("");

  function handlePdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setPdfModele({ name: file.name, base64 });
    };
    reader.readAsDataURL(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (mode === "ia" && !description.trim() && !objectif.trim()) {
      alert("Précise l'objectif ou la description de l'exercice.");
      return;
    }
    if (mode === "manuel" && !texteManuel.trim()) {
      alert("Écris le texte avec les mots à masquer entre crochets.");
      return;
    }

    const dateEff = periodicite === "semaine" ? lundiDeSemaine(semaineAssignation) : dateAssignation;

    onGenerer({
      type: "texte_a_trous" as const,
      mode,
      niveau,
      matiere: mcv.matiere,
      sousMatiere: mcv.sousMatiere,
      objectif,
      description,
      theme: theme.trim() || undefined,
      texteManuel: mode === "manuel" ? texteManuel : undefined,
      pdfBase64: pdfModele?.base64,
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
      <MatiereChapitreSelector value={mcv} onChange={setMcv} matiereParDefaut="Français" />

      {/* Mode : IA ou Manuel */}
      <div className="form-group">
        <label className="form-label">Mode de création</label>
        <div style={{ display: "flex", gap: 8 }}>
          {(["ia", "manuel"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={mode === m ? "pb-btn primary" : "pb-btn"}
              style={{ flex: 1, fontSize: 13, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <span className="ms" style={{ fontSize: 16 }}>{m === "ia" ? "auto_awesome" : "edit"}</span>
              {m === "ia" ? "Générer par l'IA" : "Écrire moi-même"}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Niveau</label>
        <select className="form-input" value={niveau} onChange={(e) => setNiveau(e.target.value)}>
          <option value="CE2">CE2</option>
          <option value="CM1">CM1</option>
          <option value="CM2">CM2</option>
        </select>
      </div>

      {mode === "ia" ? (
        <>
          {/* Objectif pédagogique */}
          <div className="form-group">
            <label className="form-label">Objectif pédagogique</label>
            <select className="form-input" value={objectif} onChange={(e) => setObjectif(e.target.value)}>
              <option value="">— Choisir —</option>
              <option value="conjugaison">Conjugaison</option>
              <option value="orthographe">Orthographe</option>
              <option value="grammaire">Grammaire</option>
              <option value="vocabulaire">Vocabulaire</option>
              <option value="homophones">Homophones</option>
              <option value="accords">Accords (sujet-verbe, adj-nom)</option>
              <option value="autre">Autre (préciser ci-dessous)</option>
            </select>
          </div>

          {/* Description / consigne détaillée */}
          <div className="form-group">
            <label className="form-label">Description / consigne pour l&apos;IA</label>
            <textarea
              className="form-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='Ex : "Complète avec les homophones a/à/as" ou "Conjugue les verbes au passé composé"'
              rows={3}
              style={{ resize: "vertical" }}
            />
          </div>

          {/* Thème (optionnel) */}
          <div className="form-group">
            <label className="form-label">Thème du texte <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>(optionnel — sinon choisi aléatoirement)</span></label>
            <input
              className="form-input"
              type="text"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="Ex : la vie sous-marine, un marché africain, la montagne…"
            />
          </div>

          {/* PDF modèle optionnel */}
          <div className="form-group">
            <label className="form-label">PDF modèle (optionnel)</label>
            <input type="file" accept="application/pdf" onChange={handlePdf} style={{ fontSize: "0.8125rem" }} />
            {pdfModele && (
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
                <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>description</span> {pdfModele.name}
                <button
                  type="button"
                  onClick={() => setPdfModele(null)}
                  style={{ marginLeft: 8, color: "var(--error)", background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem" }}
                >
                  Retirer
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Mode Manuel */
        <div className="form-group">
          <label className="form-label">
            Texte avec mots à masquer entre crochets
          </label>
          <textarea
            className="form-input"
            value={texteManuel}
            onChange={(e) => setTexteManuel(e.target.value)}
            placeholder={"Le chat [mange] une souris. Les oiseaux [chantent] dans les [arbres]."}
            rows={8}
            style={{ resize: "vertical", fontFamily: "monospace", lineHeight: 1.8 }}
          />
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
            Entoure les mots à masquer avec des crochets : <code>[mot]</code>
          </p>
        </div>
      )}

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

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button
          type="submit"
          className="btn-primary"
          disabled={chargement}
          style={{ flex: 1 }}
        >
          {chargement ? "Génération en cours…" : mode === "ia" ? "✨ Générer avec l'IA" : "Aperçu"}
        </button>
      </div>
    </form>
  );
}
