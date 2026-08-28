"use client";

import { useEffect, useState } from "react";
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

const THEMES_PREDIFINIS = [
  { label: "Genre et nombre (MS/FS/MP/FP)", value: "genre_nombre", categories: ["Masculin Singulier", "Féminin Singulier", "Masculin Pluriel", "Féminin Pluriel"] },
  { label: "Nature des mots", value: "nature", categories: ["Nom", "Verbe", "Adjectif", "Adverbe"] },
  { label: "Temps de conjugaison", value: "temps", categories: ["Présent", "Imparfait", "Futur", "Passé composé"] },
  { label: "Groupe verbal (1er, 2e, 3e)", value: "groupe_verbal", categories: ["1er groupe", "2e groupe", "3e groupe"] },
  { label: "Personnalisé", value: "custom", categories: [] },
];

export default function GenererClassementForm({ onGenerer, chargement, defaultValues }: Props) {
  const dv = defaultValues;

  const [mode, setMode] = useState<"ia" | "manuel">(dv?.mode ?? "ia");
  const [niveau, setNiveau] = useState(dv?.niveau ?? "CM1");
  const [theme, setTheme] = useState(dv?.theme ?? "genre_nombre");
  const [categories, setCategories] = useState<string[]>(dv?.categories ?? THEMES_PREDIFINIS[0].categories);
  const [customCategories, setCustomCategories] = useState("");
  const [nbItems, setNbItems] = useState(dv?.nbItems ?? 12);
  const [description, setDescription] = useState(dv?.description ?? "");
  const [texteManuel, setTexteManuel] = useState(dv?.texteManuel ?? "");
  const [pdfModele, setPdfModele] = useState<{ name: string; base64: string } | null>(null);
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

  useEffect(() => {
    const t = THEMES_PREDIFINIS.find((p) => p.value === theme);
    if (t && t.value !== "custom") setCategories(t.categories);
  }, [theme]);

  function handlePdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPdfModele({ name: file.name, base64: (reader.result as string).split(",")[1] });
    reader.readAsDataURL(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cats = theme === "custom"
      ? customCategories.split(/[,;\n]/).map((c) => c.trim()).filter(Boolean)
      : categories;

    if (cats.length < 2) { alert("Il faut au moins 2 catégories."); return; }
    if (mode === "manuel" && !texteManuel.trim()) { alert("Écris les éléments à classer."); return; }

    const dateEff = periodicite === "semaine" ? lundiDeSemaine(semaineAssignation) : dateAssignation;

    onGenerer({
      type: "classement" as const,
      mode,
      niveau,
      matiere: mcv.matiere,
      sousMatiere: mcv.sousMatiere,
      theme,
      categories: cats,
      nbItems,
      description,
      texteManuel: mode === "manuel" ? texteManuel : undefined,
      pdfBase64: pdfModele?.base64,
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
      <MatiereChapitreSelector value={mcv} onChange={setMcv} matiereParDefaut="Français" />

      {/* Mode */}
      <div className="form-group">
        <label className="form-label">Mode de création</label>
        <div style={{ display: "flex", gap: 8 }}>
          {(["ia", "manuel"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={mode === m ? "pb-btn primary" : "pb-btn"}
              style={{ flex: 1, fontSize: 13, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <span className="ms" style={{ fontSize: 16 }}>{m === "ia" ? "auto_awesome" : "edit"}</span>
              {m === "ia" ? "Générer par l'IA" : "Écrire moi-même"}
            </button>
          ))}
        </div>
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
        {mode === "ia" && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Nombre d&apos;éléments</label>
            <input className="form-input" type="number" min={4} max={20} value={nbItems} onChange={(e) => setNbItems(parseInt(e.target.value) || 12)} />
          </div>
        )}
      </div>

      {/* Thème / catégories */}
      <div className="form-group">
        <label className="form-label">Thème de classement</label>
        <select className="form-input" value={theme} onChange={(e) => setTheme(e.target.value)}>
          {THEMES_PREDIFINIS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {theme === "custom" && (
        <div className="form-group">
          <label className="form-label">Catégories (séparées par des virgules)</label>
          <input className="form-input" value={customCategories} onChange={(e) => setCustomCategories(e.target.value)}
            placeholder="Ex : Fruits, Légumes, Céréales" />
        </div>
      )}

      {theme !== "custom" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {categories.map((c, i) => (
            <span key={i} style={{
              fontSize: "0.75rem", fontWeight: 700, padding: "4px 12px", borderRadius: 999,
              background: "rgba(3,105,161,0.1)", color: "#0369A1",
            }}>{c}</span>
          ))}
        </div>
      )}

      {mode === "ia" ? (
        <>
          <div className="form-group">
            <label className="form-label">Description / consigne pour l&apos;IA (optionnel)</label>
            <textarea className="form-input" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder='Ex : "Utilise des GN avec des adjectifs" ou "Verbes du quotidien uniquement"'
              rows={3} style={{ resize: "vertical" }} />
          </div>
          <div className="form-group">
            <label className="form-label">PDF modèle (optionnel)</label>
            <input type="file" accept="application/pdf" onChange={handlePdf} style={{ fontSize: "0.8125rem" }} />
            {pdfModele && (
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
                <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>description</span> {pdfModele.name}
                <button type="button" onClick={() => setPdfModele(null)}
                  style={{ marginLeft: 8, color: "var(--error)", background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem" }}>Retirer</button>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="form-group">
          <label className="form-label">Éléments à classer (un par ligne, format : élément | catégorie)</label>
          <textarea className="form-input" value={texteManuel} onChange={(e) => setTexteManuel(e.target.value)}
            placeholder={"un livre intéressant | Masculin Singulier\nune belle matinée | Féminin Singulier\ndes hivers froids | Masculin Pluriel"}
            rows={8} style={{ resize: "vertical", fontFamily: "monospace", lineHeight: 1.8 }} />
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
            Format : <code>élément | catégorie</code> (un par ligne)
          </p>
        </div>
      )}

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
          {chargement ? "Génération en cours…" : mode === "ia" ? "✨ Générer avec l'IA" : "Aperçu"}
        </button>
      </div>
    </form>
  );
}
