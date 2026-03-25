"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { AssignationSelecteur, FonctionGram, FONCTIONS_DEFAUT, FONCTIONS_COULEURS } from "@/types";
import AssignationSelector from "@/components/AssignationSelector";

interface Props {
  onGenerer: (params: any) => void;
  chargement: boolean;
  defaultValues?: any;
}

const ASSIGNATION_VIDE: AssignationSelecteur = { groupeIds: [], eleveUids: [], groupeNoms: [] };

const TOUTES_FONCTIONS: FonctionGram[] = [
  "Sujet", "Verbe", "COD", "COI", "CC Lieu", "CC Temps", "CC Manière", "Attribut",
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

export default function GenererAnalysePhraseForm({ onGenerer, chargement, defaultValues }: Props) {
  const dv = defaultValues;
  const supabase = createClient();

  const [mode, setMode] = useState<"ia" | "manuel">(dv?.mode ?? "ia");
  const [niveau, setNiveau] = useState(dv?.niveau ?? "CM1");
  const [nbPhrases, setNbPhrases] = useState(dv?.nbPhrases ?? 5);
  const [description, setDescription] = useState(dv?.description ?? "");
  const [texteManuel, setTexteManuel] = useState(dv?.texteManuel ?? "");
  const [fonctionsActives, setFonctionsActives] = useState<FonctionGram[]>(
    dv?.fonctionsActives ?? FONCTIONS_DEFAUT["CM1"]
  );
  const [pdfModele, setPdfModele] = useState<{ name: string; base64: string } | null>(null);
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

  // Mettre à jour les fonctions par défaut quand le niveau change
  useEffect(() => {
    setFonctionsActives(FONCTIONS_DEFAUT[niveau] ?? FONCTIONS_DEFAUT["CM1"]);
  }, [niveau]);

  function toggleFonction(f: FonctionGram) {
    setFonctionsActives((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  }

  async function creerChapitre() {
    if (!nouveauChapitreNom.trim()) return;
    setCreationEnCours(true);
    const { data, error } = await supabase
      .from("chapitres")
      .insert({ titre: nouveauChapitreNom.trim(), matiere: "Français" })
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
    if (fonctionsActives.length < 2) {
      alert("Active au moins 2 fonctions grammaticales.");
      return;
    }
    if (mode === "ia" && !description.trim() && nbPhrases < 1) {
      alert("Précise le nombre de phrases ou une description.");
      return;
    }
    if (mode === "manuel" && !texteManuel.trim()) {
      alert("Écris les phrases à analyser.");
      return;
    }

    const dateEff = periodicite === "semaine" ? lundiDeSemaine(semaineAssignation) : dateAssignation;

    onGenerer({
      type: "analyse_phrase" as const,
      mode,
      niveau,
      nbPhrases,
      description,
      texteManuel: mode === "manuel" ? texteManuel : undefined,
      fonctionsActives,
      pdfBase64: pdfModele?.base64,
      chapitreId: chapitreId || undefined,
      assignation,
      dateAssignation: dateEff,
      dateLimite,
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
            <label className="form-label">Nombre de phrases</label>
            <input className="form-input" type="number" min={1} max={10} value={nbPhrases} onChange={(e) => setNbPhrases(parseInt(e.target.value) || 5)} />
          </div>
        )}
      </div>

      {/* Fonctions grammaticales activées */}
      <div className="form-group">
        <label className="form-label">Fonctions grammaticales à identifier</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TOUTES_FONCTIONS.map((f) => {
            const actif = fonctionsActives.includes(f);
            const couleur = FONCTIONS_COULEURS[f];
            return (
              <button
                key={f}
                type="button"
                onClick={() => toggleFonction(f)}
                style={{
                  padding: "6px 14px", borderRadius: 999, fontSize: "0.8125rem",
                  fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                  border: actif ? `2px solid ${couleur}` : "1px solid var(--border)",
                  background: actif ? `${couleur}15` : "white",
                  color: actif ? couleur : "var(--text-secondary)",
                }}
              >
                {actif && <span style={{ marginRight: 4 }}>✓</span>}
                {f}
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 6 }}>
          {fonctionsActives.length} fonction{fonctionsActives.length > 1 ? "s" : ""} activée{fonctionsActives.length > 1 ? "s" : ""}
        </p>
      </div>

      {mode === "ia" ? (
        <>
          <div className="form-group">
            <label className="form-label">Description / consigne pour l&apos;IA (optionnel)</label>
            <textarea
              className="form-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='Ex : "Phrases sur le thème des animaux" ou "Utilise des compléments circonstanciels variés"'
              rows={3}
              style={{ resize: "vertical" }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">PDF modèle (optionnel)</label>
            <input type="file" accept="application/pdf" onChange={handlePdf} style={{ fontSize: "0.8125rem" }} />
            {pdfModele && (
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
                <span className="ms" style={{ fontSize: 14, verticalAlign: "middle" }}>description</span> {pdfModele.name}
                <button type="button" onClick={() => setPdfModele(null)}
                  style={{ marginLeft: 8, color: "var(--error)", background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem" }}>
                  Retirer
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="form-group">
          <label className="form-label">Phrases à analyser</label>
          <textarea
            className="form-input"
            value={texteManuel}
            onChange={(e) => setTexteManuel(e.target.value)}
            placeholder={"[Le petit chat|Sujet] [mange|Verbe] [une souris|COD] [dans le jardin|CC Lieu].\n\nOu simplement :\nLe petit chat mange une souris dans le jardin."}
            rows={8}
            style={{ resize: "vertical", fontFamily: "monospace", lineHeight: 1.8 }}
          />
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
            Écris une phrase par ligne. Optionnel : annote avec <code>[groupe|Fonction]</code>
          </p>
        </div>
      )}

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
              display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s",
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
          {chargement ? "Génération en cours…" : mode === "ia" ? "✨ Générer avec l'IA" : "Aperçu"}
        </button>
      </div>
    </form>
  );
}
