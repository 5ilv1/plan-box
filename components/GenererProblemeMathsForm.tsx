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

export default function GenererProblemeMathsForm({ onGenerer, chargement, defaultValues }: Props) {
  const dv = defaultValues;
  const supabase = createClient();

  const [theme, setTheme] = useState(dv?.theme ?? "");
  const [niveau, setNiveau] = useState(dv?.niveau ?? "CM1");
  const [description, setDescription] = useState(dv?.description ?? "");
  const [assignation, setAssignation] = useState<AssignationSelecteur>(dv?.assignation ?? ASSIGNATION_VIDE);
  const [periodicite, setPeriodicite] = useState<"jour" | "semaine">(dv?.periodicite ?? "jour");
  const [dateAssignation, setDateAssignation] = useState(dv?.dateAssignation ?? new Date().toISOString().split("T")[0]);
  const [semaineAssignation, setSemaineAssignation] = useState(semaineCourante());
  const [dateLimite, setDateLimite] = useState("");

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
      .from("chapitres")
      .insert({ titre: nouveauChapitreNom.trim(), matiere: "Mathématiques" })
      .select("id, titre, matiere")
      .single();
    if (data && !error) {
      setChapitres((prev) => [...prev, data]);
      setChapitreId(data.id);
      setShowCreerChapitre(false);
      setNouveauChapitreNom("");
    }
    setCreationEnCours(false);
  }

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
      description,
      chapitreId: chapitreId || undefined,
      assignation,
      dateAssignation: dateEff,
      dateLimite,
      periodicite,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
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

      {/* Chapitre */}
      <div className="form-group">
        <label className="form-label">Chapitre (optionnel)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="form-input" value={chapitreId} onChange={(e) => setChapitreId(e.target.value)} style={{ flex: 1 }}>
            <option value="">Sans chapitre</option>
            {chapitres.map((c) => (
              <option key={c.id} value={c.id}>{c.matiere} — {c.titre}</option>
            ))}
          </select>
          <button type="button" onClick={() => setShowCreerChapitre(!showCreerChapitre)}
            style={{
              padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--primary)",
              background: showCreerChapitre ? "var(--primary)" : "transparent",
              color: showCreerChapitre ? "white" : "var(--primary)",
              cursor: "pointer", fontWeight: 700, fontSize: 18, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            title="Créer un nouveau chapitre"
          >+</button>
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
