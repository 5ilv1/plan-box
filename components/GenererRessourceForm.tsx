"use client";

import { useState } from "react";
import { AssignationSelecteur, ParamsRessource, SousTypeRessource, TacheRessource } from "@/types";
import AssignationSelector from "@/components/AssignationSelector";

const SOUS_TYPES: {
  value: SousTypeRessource;
  label: string;
  icone: string;
  hasUrl: boolean;
  urlLabel: string;
  hasReference: boolean;
}[] = [
  {
    value: "video",
    label: "Vidéo",
    icone: "🎬",
    hasUrl: true,
    urlLabel: "Lien vidéo (YouTube, Vimeo…)",
    hasReference: false,
  },
  {
    value: "podcast",
    label: "Podcast",
    icone: "🎙️",
    hasUrl: true,
    urlLabel: "Lien podcast (fichier audio ou plateforme)",
    hasReference: false,
  },
  {
    value: "exercice_en_ligne",
    label: "Exercice en ligne",
    icone: "💻",
    hasUrl: true,
    urlLabel: "URL de l'exercice (à intégrer dans la page)",
    hasReference: false,
  },
  {
    value: "exercice_papier",
    label: "Exercice papier",
    icone: "📄",
    hasUrl: false,
    urlLabel: "",
    hasReference: true,
  },
];

const MATIERES = ["français", "maths", "sciences", "histoire-géo", "anglais", "autre"];

const ASSIGNATION_VIDE: AssignationSelecteur = {
  groupeIds: [],
  eleveUids: [],
  groupeNoms: [],
};

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

const TACHE_VIDE: TacheRessource = { sous_type: "video", label: "", texte: "", url: "", reference: "" };

interface GenererRessourceFormProps {
  onGenerer: (params: ParamsRessource) => void;
  onPiocherBanque: () => void;
  chargement: boolean;
  ressourceInitiale?: {
    titre: string;
    sous_type: string;
    contenu: { taches?: TacheRessource[]; matiere?: string; sous_type?: string; url?: string; texte?: string };
    matiere: string | null;
  };
}

export default function GenererRessourceForm({
  onGenerer,
  onPiocherBanque,
  chargement,
  ressourceInitiale,
}: GenererRessourceFormProps) {
  const tachesInitiales: TacheRessource[] = ressourceInitiale?.contenu?.taches?.length
    ? ressourceInitiale.contenu.taches
    : ressourceInitiale
    ? [{ sous_type: (ressourceInitiale.sous_type as SousTypeRessource) ?? "video", url: ressourceInitiale.contenu?.url ?? "", texte: ressourceInitiale.contenu?.texte ?? "", label: "", reference: "" }]
    : [{ ...TACHE_VIDE }];

  const [taches, setTaches] = useState<TacheRessource[]>(tachesInitiales);
  const [titre, setTitre] = useState(ressourceInitiale?.titre ?? "");
  const [matiere, setMatiere] = useState(ressourceInitiale?.matiere ?? "");
  const [assignation, setAssignation] = useState<AssignationSelecteur>(ASSIGNATION_VIDE);
  const [periodicite, setPeriodicite] = useState<"jour" | "semaine">("jour");
  const [dateAssignation, setDateAssignation] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [semaineAssignation, setSemaineAssignation] = useState(semaineCourante());
  const [dateLimite, setDateLimite] = useState("");

  const aucunAssigne =
    assignation.groupeIds.length === 0 && assignation.eleveUids.length === 0;

  // ── Gestion des tâches ──────────────────────────────────────────────────

  function updateTache(idx: number, champ: keyof TacheRessource, val: string) {
    setTaches((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [champ]: val };
      return next;
    });
  }

  function ajouterTache() {
    setTaches((prev) => [...prev, { ...TACHE_VIDE }]);
  }

  function supprimerTache(idx: number) {
    setTaches((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Soumission ──────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (aucunAssigne) {
      alert("Veuillez sélectionner au moins un groupe ou un élève.");
      return;
    }
    const premierType = SOUS_TYPES.find((s) => s.value === taches[0]?.sous_type);
    const titreAuto = titre.trim() || (taches.length === 1
      ? `${premierType?.icone ?? ""} ${premierType?.label ?? "Ressource"}`
      : `📚 Activité (${taches.length} étapes)`);

    const dateFinale = periodicite === "semaine" ? lundiDeSemaine(semaineAssignation) : dateAssignation;

    onGenerer({
      type: "ressource",
      titre: titreAuto,
      assignation,
      dateAssignation: dateFinale,
      dateLimite,
      periodicite,
      contenu: {
        taches: taches.map((t) => ({
          sous_type: t.sous_type,
          label: t.label?.trim() || undefined,
          texte: t.texte?.trim() || undefined,
          url: t.url?.trim() || undefined,
          reference: t.reference?.trim() || undefined,
          transcription: t.transcription?.trim() || undefined,
        })),
        matiere: matiere || undefined,
      },
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Titre global */}
      <div className="form-group">
        <label className="form-label">
          Titre <span className="text-secondary">(optionnel)</span>
        </label>
        <input
          type="text"
          className="form-input"
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Ex. Découverte des fractions — chapitre 3"
        />
      </div>

      {/* Matière */}
      <div className="form-group">
        <label className="form-label">
          Matière <span className="text-secondary">(optionnel)</span>
        </label>
        <select
          className="form-input"
          value={matiere}
          onChange={(e) => setMatiere(e.target.value)}
        >
          <option value="">— Sélectionner —</option>
          {MATIERES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* ── Liste des tâches ───────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 12 }}>
        {taches.map((tache, idx) => {
          const config = SOUS_TYPES.find((s) => s.value === tache.sous_type)!;
          return (
            <div
              key={idx}
              style={{
                border: "1.5px solid var(--border)",
                borderRadius: 12,
                padding: "16px 16px 12px",
                background: "var(--bg)",
              }}
            >
              {/* En-tête étape */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{
                  fontWeight: 700, fontSize: 13, color: "var(--primary)",
                  background: "var(--primary-pale)", padding: "2px 10px", borderRadius: 20,
                }}>
                  Étape {idx + 1}
                </span>
                {taches.length > 1 && (
                  <button
                    type="button"
                    onClick={() => supprimerTache(idx)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--text-secondary)", fontSize: 16, padding: "2px 6px",
                    }}
                    title="Supprimer cette étape"
                  >
                    🗑
                  </button>
                )}
              </div>

              {/* Type de ressource */}
              <div className="form-group">
                <label className="form-label">Type</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {SOUS_TYPES.map((st) => (
                    <button
                      key={st.value}
                      type="button"
                      onClick={() => updateTache(idx, "sous_type", st.value)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: `2px solid ${tache.sous_type === st.value ? "var(--primary)" : "var(--border)"}`,
                        background: tache.sous_type === st.value ? "var(--primary-pale)" : "white",
                        color: tache.sous_type === st.value ? "var(--primary)" : "var(--text)",
                        fontWeight: tache.sous_type === st.value ? 700 : 400,
                        cursor: "pointer",
                        fontSize: 13,
                        fontFamily: "var(--font)",
                        textAlign: "left",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        transition: "all 0.15s",
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{st.icone}</span>
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Label de l'étape */}
              <div className="form-group">
                <label className="form-label">
                  Étiquette <span className="text-secondary">(optionnel)</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={tache.label ?? ""}
                  onChange={(e) => updateTache(idx, "label", e.target.value)}
                  placeholder={`Ex. "${config.label} à regarder avant l'exercice"`}
                />
              </div>

              {/* URL */}
              {config.hasUrl && (
                <div className="form-group">
                  <label className="form-label">{config.urlLabel}</label>
                  <input
                    type="url"
                    className="form-input"
                    value={tache.url ?? ""}
                    onChange={(e) => updateTache(idx, "url", e.target.value)}
                    placeholder="https://…"
                  />
                  {tache.sous_type === "exercice_en_ligne" && (
                    <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                      La page sera intégrée directement (iframe). Si elle bloque l'intégration, un lien s'affichera à la place.
                    </p>
                  )}
                </div>
              )}

              {/* Référence papier */}
              {config.hasReference && (
                <div className="form-group">
                  <label className="form-label">Numéro et page</label>
                  <input
                    type="text"
                    className="form-input"
                    value={tache.reference ?? ""}
                    onChange={(e) => updateTache(idx, "reference", e.target.value)}
                    placeholder="Ex. Exercice 3 p.42 — manuel Maths CM2"
                  />
                </div>
              )}

              {/* Texte / consignes */}
              <div className="form-group">
                <label className="form-label">
                  Consignes <span className="text-secondary">(optionnel)</span>
                </label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={tache.texte ?? ""}
                  onChange={(e) => updateTache(idx, "texte", e.target.value)}
                  placeholder="Instructions pour l'élève…"
                  style={{ resize: "vertical" }}
                />
              </div>

              {/* Transcription (podcast uniquement) → génère un QCM */}
              {tache.sous_type === "podcast" && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    🎯 Transcription du podcast{" "}
                    <span className="text-secondary">(optionnel — génère un QCM automatique)</span>
                  </label>
                  <textarea
                    className="form-input"
                    rows={4}
                    value={tache.transcription ?? ""}
                    onChange={(e) => updateTache(idx, "transcription", e.target.value)}
                    placeholder="Colle ici la transcription ou un résumé du podcast. Un questionnaire à choix multiple sera généré automatiquement par l'IA pour tes élèves…"
                    style={{ resize: "vertical", fontSize: 13 }}
                  />
                  {(tache.transcription?.length ?? 0) > 50 && (
                    <p style={{ fontSize: 11, color: "#065F46", marginTop: 4, background: "#D1FAE5", padding: "4px 10px", borderRadius: 6 }}>
                      ✨ Un QCM de 10 questions sera généré automatiquement lors de la validation.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bouton ajouter étape */}
      <button
        type="button"
        className="btn-ghost"
        onClick={ajouterTache}
        style={{ width: "100%", marginBottom: 16, fontSize: 13 }}
      >
        + Ajouter une étape
      </button>

      <hr className="divider" />

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
              {p === "jour" ? "📅 Jour précis" : "📆 Toute la semaine"}
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

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button
          type="submit"
          className="btn-primary"
          disabled={chargement || aucunAssigne}
          style={{ flex: 1 }}
        >
          {chargement ? "En cours…" : "📚 Aperçu et valider"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={onPiocherBanque}
          disabled={chargement}
        >
          🗂 Banque
        </button>
      </div>
    </form>
  );
}
