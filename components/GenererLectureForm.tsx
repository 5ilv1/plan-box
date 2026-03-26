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

export default function GenererLectureForm({ onGenerer, chargement, defaultValues }: Props) {
  const dv = defaultValues;
  const supabase = createClient();

  const [mode, setMode] = useState<"texte" | "pdf">(dv?.mode ?? "texte");
  const [niveau, setNiveau] = useState(dv?.niveau ?? "CM1");
  const [nbQuestions, setNbQuestions] = useState(dv?.nbQuestions ?? 10);
  const [texte, setTexte] = useState(dv?.texte ?? "");
  const [titre, setTitre] = useState(dv?.titre ?? "");
  const [description, setDescription] = useState(dv?.description ?? "");
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
    if (mode === "texte" && !texte.trim()) { alert("Colle le texte de lecture."); return; }
    if (mode === "pdf" && !pdfModele) { alert("Ajoute un fichier PDF."); return; }

    const dateEff = periodicite === "semaine" ? lundiDeSemaine(semaineAssignation) : dateAssignation;

    onGenerer({
      type: "lecture" as const,
      mode,
      niveau,
      nbQuestions,
      texte: mode === "texte" ? texte : undefined,
      titre: titre || undefined,
      description: description || undefined,
      pdfBase64: mode === "pdf" ? pdfModele?.base64 : undefined,
      pdfName: mode === "pdf" ? pdfModele?.name : undefined,
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
        <label className="form-label">Source du texte</label>
        <div style={{ display: "flex", gap: 8 }}>
          {([["texte", "edit_note", "Coller un texte"], ["pdf", "picture_as_pdf", "Importer un PDF"]] as const).map(([m, icon, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={mode === m ? "pb-btn primary" : "pb-btn"}
              style={{ flex: 1, fontSize: 13, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <span className="ms" style={{ fontSize: 16 }}>{icon}</span>
              {label}
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
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Nombre de questions</label>
          <input className="form-input" type="number" min={3} max={20} value={nbQuestions} onChange={(e) => setNbQuestions(parseInt(e.target.value) || 10)} />
        </div>
      </div>

      {/* Titre */}
      <div className="form-group">
        <label className="form-label">Titre de la lecture (optionnel)</label>
        <input className="form-input" value={titre} onChange={(e) => setTitre(e.target.value)}
          placeholder="Ex : Le petit prince — Chapitre 3" />
      </div>

      {/* Texte ou PDF */}
      {mode === "texte" ? (
        <div className="form-group">
          <label className="form-label">Texte de lecture</label>
          <textarea className="form-input" value={texte} onChange={(e) => setTexte(e.target.value)}
            placeholder="Colle le texte que les élèves devront lire ici..."
            rows={12} style={{ resize: "vertical", lineHeight: 1.8 }} />
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
            {texte.split(/\s+/).filter(Boolean).length} mots
          </p>
        </div>
      ) : (
        <div className="form-group">
          <label className="form-label">Fichier PDF</label>
          <input type="file" accept="application/pdf" onChange={handlePdf} style={{ fontSize: "0.8125rem" }} />
          {pdfModele && (
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
              <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>description</span> {pdfModele.name}
              <button type="button" onClick={() => setPdfModele(null)}
                style={{ marginLeft: 8, color: "var(--error)", background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem" }}>Retirer</button>
            </div>
          )}
        </div>
      )}

      {/* Description pour l'IA */}
      <div className="form-group">
        <label className="form-label">Consignes pour les questions (optionnel)</label>
        <textarea className="form-input" value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder='Ex : "Questions sur la compréhension du texte et le vocabulaire" ou "Insiste sur les inférences"'
          rows={2} style={{ resize: "vertical" }} />
      </div>

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
          {chargement ? "Génération des questions…" : "✨ Générer les questions"}
        </button>
      </div>
    </form>
  );
}
