"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { AssignationSelecteur } from "@/types";
import AssignationSelector from "@/components/AssignationSelector";

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

export default function GenererClassementForm({ onGenerer, chargement, defaultValues }: Props) {
  const dv = defaultValues;
  const supabase = createClient();

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
  const [semaineAssignation, setSemaineAssignation] = useState(semaineCourante());

  const [chapitres, setChapitres] = useState<{ id: string; titre: string; matiere: string }[]>([]);
  const [chapitreId, setChapitreId] = useState(dv?.chapitreId ?? "");
  const [showCreerChapitre, setShowCreerChapitre] = useState(false);
  const [nouveauChapitreNom, setNouveauChapitreNom] = useState("");
  const [creationEnCours, setCreationEnCours] = useState(false);

  useEffect(() => {
    supabase.from("chapitres").select("id, titre, matiere").order("matiere")
      .then(({ data }) => setChapitres(data ?? []));
  }, [supabase]);

  useEffect(() => {
    const t = THEMES_PREDIFINIS.find((p) => p.value === theme);
    if (t && t.value !== "custom") setCategories(t.categories);
  }, [theme]);

  async function creerChapitre() {
    if (!nouveauChapitreNom.trim()) return;
    setCreationEnCours(true);
    const { data, error } = await supabase
      .from("chapitres").insert({ titre: nouveauChapitreNom.trim(), matiere: "Français" })
      .select("id, titre, matiere").single();
    if (data && !error) {
      setChapitres((prev) => [...prev, data]);
      setChapitreId(data.id);
      setShowCreerChapitre(false);
      setNouveauChapitreNom("");
    }
    setCreationEnCours(false);
  }

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
      theme,
      categories: cats,
      nbItems,
      description,
      texteManuel: mode === "manuel" ? texteManuel : undefined,
      pdfBase64: pdfModele?.base64,
      chapitreId: chapitreId || undefined,
      assignation,
      dateAssignation: dateEff,
      dateLimite: "",
      periodicite,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
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

      {/* Chapitre */}
      <div className="form-group">
        <label className="form-label">Chapitre (optionnel)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="form-input" value={chapitreId} onChange={(e) => setChapitreId(e.target.value)} style={{ flex: 1 }}>
            <option value="">Sans chapitre</option>
            {chapitres.map((c) => (<option key={c.id} value={c.id}>{c.matiere} — {c.titre}</option>))}
          </select>
          <button type="button" onClick={() => setShowCreerChapitre(!showCreerChapitre)}
            style={{
              padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--primary)",
              background: showCreerChapitre ? "var(--primary)" : "transparent",
              color: showCreerChapitre ? "white" : "var(--primary)",
              cursor: "pointer", fontWeight: 700, fontSize: 18, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s",
            }} title="Créer un nouveau chapitre">+</button>
        </div>
        {showCreerChapitre && (
          <div style={{ marginTop: 10, padding: "12px 16px", background: "var(--blue-50, #EFF6FF)", border: "1.5px solid var(--blue-200, #BFDBFE)", borderRadius: 10, display: "flex", gap: 8, alignItems: "center" }}>
            <input type="text" className="form-input" placeholder="Nom du nouveau chapitre" value={nouveauChapitreNom}
              onChange={(e) => setNouveauChapitreNom(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); creerChapitre(); } }}
              style={{ flex: 1, marginBottom: 0 }} autoFocus />
            <button type="button" onClick={creerChapitre} disabled={!nouveauChapitreNom.trim() || creationEnCours}
              className="pb-btn primary" style={{ padding: "8px 16px", fontSize: 13, borderRadius: 8, whiteSpace: "nowrap" }}>
              {creationEnCours ? "…" : "Créer"}
            </button>
          </div>
        )}
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
          {chargement ? "Génération en cours…" : mode === "ia" ? "✨ Générer avec l'IA" : "Aperçu"}
        </button>
      </div>
    </form>
  );
}
