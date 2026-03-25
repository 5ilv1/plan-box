"use client";

import { useState } from "react";
import { ExerciceIA, CalcMentalIA, RessourceIA, TacheRessource } from "@/types";
import { TemplateCalcul } from "@/lib/calcul";
import CalcMentalStack from "./CalcMentalStack";

type ContenuPreview =
  | { type: "exercice"; data: ExerciceIA }
  | { type: "calcul_mental"; data: CalcMentalIA }
  | { type: "ressource"; data: RessourceIA };

interface ExercicePreviewProps {
  contenu: ContenuPreview;
  onValider: (contenuFinal: ContenuPreview) => void;
  onRegenerer: () => void;
  onAnnuler: () => void;
  chargement?: boolean;
}

export default function ExercicePreview({
  contenu,
  onValider,
  onRegenerer,
  onAnnuler,
  chargement = false,
}: ExercicePreviewProps) {
  const [modeEdition, setModeEdition] = useState(false);
  const [contenuEdite, setContenuEdite] = useState(contenu);

  function handleValider() {
    onValider(contenuEdite);
  }

  const titreApercu =
    contenu.type === "exercice"
      ? "📝 Aperçu de l'exercice"
      : contenu.type === "calcul_mental"
      ? "🔢 Aperçu du calcul mental"
      : "🔗 Aperçu de la ressource";

  return (
    <div>
      {/* En-tête aperçu */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{titreApercu}</h2>
          <p className="text-secondary text-sm" style={{ marginTop: 2 }}>
            Vérifiez avant d'envoyer à l'élève
          </p>
        </div>
        <span className="badge badge-warning">À valider</span>
      </div>

      {/* Contenu */}
      <div className="card" style={{ marginBottom: 16 }}>
        {contenu.type === "exercice" ? (
          <ExerciceEditView
            data={contenuEdite.type === "exercice" ? contenuEdite.data : (contenu.data as ExerciceIA)}
            editable={modeEdition}
            onChange={(data) => setContenuEdite({ type: "exercice", data })}
          />
        ) : contenu.type === "calcul_mental" ? (
          <CalcMentalPreview
            data={contenuEdite.type === "calcul_mental" ? contenuEdite.data : (contenu.data as CalcMentalIA)}
          />
        ) : (
          <RessourcePreview data={contenu.data as RessourceIA} />
        )}
      </div>

      {/* Boutons d'action */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          className="btn-primary"
          onClick={handleValider}
          disabled={chargement}
          style={{ minWidth: 130 }}
        >
          {chargement ? "Sauvegarde…" : "✅ Valider"}
        </button>

        {/* Régénérer : seulement pour exercice IA et calcul mental */}
        {contenu.type !== "ressource" && (
          <button
            className="btn-secondary"
            onClick={onRegenerer}
            disabled={chargement}
          >
            🔄 Régénérer
          </button>
        )}

        {contenu.type === "exercice" && (
          <button
            className="btn-ghost"
            onClick={() => setModeEdition((m) => !m)}
            disabled={chargement}
          >
            {modeEdition ? "👁 Voir" : "✏️ Modifier"}
          </button>
        )}

        <button
          className="btn-ghost"
          onClick={onAnnuler}
          disabled={chargement}
          style={{ marginLeft: "auto", color: "var(--error)", borderColor: "var(--error)" }}
        >
          ❌ Annuler
        </button>
      </div>
    </div>
  );
}

// ── Aperçu ressource ─────────────────────────────────────────────────────────

const ICONES_ST: Record<string, string> = {
  video: "🎬",
  podcast: "🎙️",
  exercice_en_ligne: "💻",
  exercice_papier: "📄",
};
const LABELS_ST: Record<string, string> = {
  video: "Vidéo",
  podcast: "Podcast",
  exercice_en_ligne: "Exercice en ligne",
  exercice_papier: "Exercice papier",
};

function TachePreview({ tache, numero }: { tache: TacheRessource; numero?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* En-tête tâche */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {numero !== undefined && (
          <span style={{
            width: 22, height: 22, borderRadius: "50%", background: "var(--primary)",
            color: "white", fontSize: 11, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            {numero}
          </span>
        )}
        <span style={{ fontSize: 22 }}>{ICONES_ST[tache.sous_type]}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {tache.label || LABELS_ST[tache.sous_type]}
          </div>
          {tache.label && (
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {LABELS_ST[tache.sous_type]}
            </div>
          )}
        </div>
      </div>

      {/* Consignes */}
      {tache.texte && (
        <div style={{ padding: "8px 12px", background: "var(--primary-pale)", borderRadius: 8, fontSize: 13, lineHeight: 1.6 }}>
          {tache.texte}
        </div>
      )}

      {/* Référence papier */}
      {tache.reference && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span>📄</span>
          <span style={{ fontWeight: 600 }}>Référence :</span>
          <span>{tache.reference}</span>
        </div>
      )}

      {/* URL */}
      {tache.url && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 8, fontSize: 13 }}>
          <span style={{ fontSize: 16 }}>🔗</span>
          <a href={tache.url} target="_blank" rel="noopener noreferrer"
            style={{ color: "#0369A1", wordBreak: "break-all", textDecoration: "underline" }}>
            {tache.url}
          </a>
        </div>
      )}
    </div>
  );
}

function RessourcePreview({ data }: { data: RessourceIA }) {
  // Nouveau format multi-tâches
  if (data.taches && data.taches.length > 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {data.matiere && (
          <span className="badge badge-primary" style={{ fontSize: 11, alignSelf: "flex-start" }}>
            {data.matiere}
          </span>
        )}
        {data.taches.map((tache, i) => (
          <div key={i} style={{
            padding: "12px 14px", background: "var(--bg)",
            border: "1px solid var(--border)", borderRadius: 10,
          }}>
            <TachePreview tache={tache} numero={data.taches!.length > 1 ? i + 1 : undefined} />
          </div>
        ))}
      </div>
    );
  }

  // Ancien format (backward compat)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 32 }}>{ICONES_ST[data.sous_type!]}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{LABELS_ST[data.sous_type!]}</div>
          {data.matiere && (
            <span className="badge badge-primary" style={{ fontSize: 11, marginTop: 4 }}>
              {data.matiere}
            </span>
          )}
        </div>
      </div>
      {data.texte && (
        <div style={{ padding: "10px 14px", background: "var(--primary-pale)", borderRadius: 8, fontSize: 14, lineHeight: 1.6 }}>
          {data.texte}
        </div>
      )}
      {data.reference && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <span>📄</span><span style={{ fontWeight: 600 }}>Référence :</span><span>{data.reference}</span>
        </div>
      )}
      {data.url && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 8, fontSize: 13 }}>
          <span style={{ fontSize: 18 }}>🔗</span>
          <a href={data.url} target="_blank" rel="noopener noreferrer"
            style={{ color: "#0369A1", wordBreak: "break-all", textDecoration: "underline" }}>
            {data.url}
          </a>
        </div>
      )}
    </div>
  );
}

// ── Aperçu calcul mental ─────────────────────────────────────────────────────

function CalcMentalPreview({ data }: { data: CalcMentalIA }) {
  return (
    <CalcMentalStack
      calculs={data.calculs}
      modeles={data.modeles as TemplateCalcul[] | undefined}
      nbCalculs={data.nb_calculs}
      readOnly
    />
  );
}

// ── Vue éditable exercice ────────────────────────────────────────────────────

function ExerciceEditView({
  data,
  editable,
  onChange,
}: {
  data: ExerciceIA;
  editable: boolean;
  onChange: (d: ExerciceIA) => void;
}) {
  function updateQuestion(
    i: number,
    champ: "enonce" | "reponse_attendue" | "indice",
    val: string
  ) {
    const qs = [...data.questions];
    qs[i] = { ...qs[i], [champ]: val };
    onChange({ ...data, questions: qs });
  }

  return (
    <div>
      {/* Titre + consigne */}
      {editable ? (
        <>
          <div className="form-group">
            <label className="form-label">Titre</label>
            <input
              className="form-input"
              value={data.titre}
              onChange={(e) => onChange({ ...data, titre: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Consigne</label>
            <textarea
              className="form-input"
              rows={2}
              value={data.consigne}
              onChange={(e) => onChange({ ...data, consigne: e.target.value })}
              style={{ resize: "vertical" }}
            />
          </div>
        </>
      ) : (
        <>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
            {data.titre}
          </h3>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              marginBottom: 16,
              fontStyle: "italic",
              borderLeft: "3px solid var(--primary-mid)",
              paddingLeft: 10,
            }}
          >
            {data.consigne}
          </p>
        </>
      )}

      {/* Questions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {data.questions.map((q, i) => (
          <div
            key={q.id}
            style={{
              padding: "12px 14px",
              background: "var(--bg)",
              borderRadius: 10,
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                marginBottom: editable ? 8 : 0,
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "var(--primary)",
                  color: "white",
                  fontSize: 12,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                {i + 1}
              </span>
              {editable ? (
                <textarea
                  className="form-input"
                  rows={2}
                  value={q.enonce}
                  onChange={(e) => updateQuestion(i, "enonce", e.target.value)}
                  style={{ flex: 1, resize: "vertical" }}
                />
              ) : (
                <span style={{ fontSize: 14, flex: 1 }}>{q.enonce}</span>
              )}
            </div>

            {/* Réponse attendue */}
            <div
              style={{
                marginLeft: editable ? 0 : 34,
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: editable ? 0 : 6,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--success)",
                  textTransform: "uppercase",
                }}
              >
                Réponse :
              </span>
              {editable ? (
                <input
                  className="form-input"
                  value={q.reponse_attendue}
                  onChange={(e) => updateQuestion(i, "reponse_attendue", e.target.value)}
                  style={{ flex: 1 }}
                />
              ) : (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--success)",
                    background: "#D1FAE5",
                    padding: "2px 8px",
                    borderRadius: 6,
                  }}
                >
                  {q.reponse_attendue}
                </span>
              )}
            </div>

            {/* Indice */}
            {(q.indice || editable) && (
              <div
                style={{
                  marginLeft: editable ? 0 : 34,
                  marginTop: 4,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                  }}
                >
                  Indice :
                </span>
                {editable ? (
                  <input
                    className="form-input"
                    value={q.indice ?? ""}
                    onChange={(e) => updateQuestion(i, "indice", e.target.value)}
                    style={{ flex: 1 }}
                    placeholder="Optionnel"
                  />
                ) : (
                  q.indice && (
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--text-secondary)",
                        fontStyle: "italic",
                      }}
                    >
                      💡 {q.indice}
                    </span>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
