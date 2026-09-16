"use client";

import { useState } from "react";
import { AssignationSelecteur } from "@/types";
import AssignationSelector from "@/components/AssignationSelector";
import MatiereChapitreSelector, { MatiereChapitreValue, sousMatiereRenseignee } from "@/components/MatiereChapitreSelector";
import { lundiDeSemaine, semaineISO } from "@/lib/semaine-iso";
import type { FormeFraction, SensFraction } from "@/lib/fractions-aires";

interface Props {
  onGenerer: (params: any) => void;
  chargement: boolean;
  defaultValues?: any;
}

const ASSIGNATION_VIDE: AssignationSelecteur = { groupeIds: [], eleveUids: [], groupeNoms: [] };

/**
 * Deux façons de fabriquer un QCM :
 *  • `theme` — l'IA écrit les questions à partir d'un sujet ;
 *  • `fractions` — les questions sont CALCULÉES à partir d'un dessin
 *    (`lib/fractions-aires.ts`). Pas d'IA : sur du numérique, la bonne réponse
 *    se déduit de la figure, elle ne se demande pas à un modèle.
 */
type SourceQCM = "theme" | "fractions";

export default function GenererQCMForm({ onGenerer, chargement, defaultValues }: Props) {
  const dv = defaultValues;

  const [niveau, setNiveau] = useState(dv?.niveau ?? "CM1");
  const [mcv, setMcv] = useState<MatiereChapitreValue>({
    matiere: dv?.matiere ?? "",
    sousMatiere: dv?.sous_matiere ?? "",
    chapitreId: dv?.chapitreId ?? "",
    chapitreTitre: dv?.chapitreTitre ?? "",
  });
  const [source, setSource] = useState<SourceQCM>(dv?.source ?? "theme");
  const [formes, setFormes] = useState<FormeFraction[]>(dv?.formes ?? ["cercle", "rectangle"]);
  const [dispersees, setDispersees] = useState<boolean>(dv?.dispersees ?? false);
  const [sens, setSens] = useState<SensFraction | "les_deux">(dv?.sens ?? "lire");
  const [theme, setTheme] = useState(dv?.theme ?? "");
  const [consigne, setConsigne] = useState(dv?.consigne ?? "");
  const [titre, setTitre] = useState(dv?.titre ?? "");
  const [nbQuestions, setNbQuestions] = useState(dv?.nbQuestions ?? 10);
  const [assignation, setAssignation] = useState<AssignationSelecteur>(dv?.assignation ?? ASSIGNATION_VIDE);
  const [periodicite, setPeriodicite] = useState<"jour" | "semaine">(dv?.periodicite ?? "jour");
  const [dateAssignation, setDateAssignation] = useState(dv?.dateAssignation ?? new Date().toISOString().split("T")[0]);
  const [semaineAssignation, setSemaineAssignation] = useState(semaineISO());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sousMatiereRenseignee(mcv)) {
      alert("Choisis une sous-matière : sans elle, le suivi ne peut pas dire sur quoi revenir.");
      return;
    }
    if (source === "theme" && !theme.trim() && !consigne.trim()) {
      alert("Précise au moins un thème ou une consigne.");
      return;
    }
    if (source === "fractions" && formes.length === 0) {
      alert("Choisis au moins une forme : le disque ou le rectangle.");
      return;
    }
    const dateEff = periodicite === "semaine" ? lundiDeSemaine(semaineAssignation) : dateAssignation;
    onGenerer({
      type: "qcm" as const,
      source,
      formes,
      dispersees,
      sens,
      niveau,
      matiere: mcv.matiere,
      sous_matiere: mcv.sousMatiere,
      chapitreId: mcv.chapitreId || null,
      chapitreTitre: mcv.chapitreId ? (mcv.chapitreTitre || "Non spécifié") : "Sans chapitre",
      theme,
      consigne,
      titre: titre || undefined,
      nbQuestions,
      assignation,
      dateAssignation: dateEff,
      dateLimite: "",
      periodicite,
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: "16px 0" }}>
      <div className="form-group">
        <label className="form-label">Type de QCM</label>
        <div style={{ display: "flex", gap: 8 }}>
          {([
            { v: "theme", libelle: "À partir d'un thème", note: "écrit par l'IA" },
            { v: "fractions", libelle: "Fractions en images", note: "disques et rectangles, calculé" },
          ] as const).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setSource(o.v)}
              style={{
                flex: 1,
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 10,
                cursor: "pointer",
                border: source === o.v ? "2px solid #92400E" : "1px solid var(--border)",
                background: source === o.v ? "rgba(146,64,14,0.06)" : "white",
              }}
            >
              <span style={{ display: "block", fontWeight: 700, fontSize: "0.875rem", color: source === o.v ? "#92400E" : "var(--text)" }}>
                {o.libelle}
              </span>
              <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)" }}>{o.note}</span>
            </button>
          ))}
        </div>
      </div>

      <MatiereChapitreSelector value={mcv} onChange={setMcv} exigerSousMatiere />

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
          <input
            className="form-input"
            type="number"
            min={3}
            max={20}
            value={nbQuestions}
            onChange={(e) => setNbQuestions(parseInt(e.target.value) || 10)}
          />
        </div>
      </div>

      {source === "theme" ? (
        <>
          <div className="form-group">
            <label className="form-label">Thème / sujet du QCM</label>
            <input
              className="form-input"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="Ex : Le système solaire, la Préhistoire, les fractions simples…"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Consignes pour l&apos;IA (optionnel)</label>
            <textarea
              className="form-input"
              value={consigne}
              onChange={(e) => setConsigne(e.target.value)}
              rows={2}
              placeholder='Ex : "Insiste sur le vocabulaire" ou "Questions plutôt faciles"'
              style={{ resize: "vertical" }}
            />
          </div>
        </>
      ) : (
        <>
          <div className="form-group">
            <label className="form-label">Sens de la question</label>
            <select
              className="form-input"
              value={sens}
              onChange={(e) => setSens(e.target.value as SensFraction | "les_deux")}
            >
              <option value="lire">Un dessin → écrire la fraction</option>
              <option value="reconnaitre">Une fraction → choisir le dessin</option>
              <option value="les_deux">Les deux, une question sur deux</option>
            </select>
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "6px 0 0" }}>
              Le second sens est plus difficile : il débusque l&apos;élève qui compte des parts
              coloriées sans se figurer le tout.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">Formes</label>
            <div style={{ display: "flex", gap: 16 }}>
              {([
                { v: "cercle", libelle: "Disque" },
                { v: "rectangle", libelle: "Rectangle" },
              ] as const).map((f) => (
                <label key={f.v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.875rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={formes.includes(f.v)}
                    onChange={(e) =>
                      setFormes((prev) =>
                        e.target.checked ? [...prev, f.v] : prev.filter((x) => x !== f.v),
                      )
                    }
                  />
                  {f.libelle}
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: "0.875rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={dispersees}
                onChange={(e) => setDispersees(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                Parts coloriées dispersées
                <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Elles ne se suivent plus : il faut compter, pas regarder. C&apos;est le vrai levier
                  de difficulté, bien plus que la taille du dénominateur.
                </span>
              </span>
            </label>
          </div>

          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: -4, marginBottom: 16 }}>
            Les dénominateurs suivent le niveau choisi, et les mauvaises réponses sont les erreurs
            classiques : fraction inversée, parts blanches comptées, coloriées rapportées aux blanches.
          </p>
        </>
      )}

      <div className="form-group">
        <label className="form-label">Titre (optionnel)</label>
        <input
          className="form-input"
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Ex : QCM — Le système solaire"
        />
      </div>

      <AssignationSelector value={assignation} onChange={setAssignation} />

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Périodicité</label>
          <select
            className="form-input"
            value={periodicite}
            onChange={(e) => setPeriodicite(e.target.value as "jour" | "semaine")}
          >
            <option value="jour">Jour</option>
            <option value="semaine">Semaine</option>
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">{periodicite === "semaine" ? "Semaine" : "Date"}</label>
          {periodicite === "semaine" ? (
            <input
              className="form-input"
              type="week"
              value={semaineAssignation}
              onChange={(e) => setSemaineAssignation(e.target.value)}
            />
          ) : (
            <input
              className="form-input"
              type="date"
              value={dateAssignation}
              onChange={(e) => setDateAssignation(e.target.value)}
            />
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button type="submit" className="btn-primary" disabled={chargement} style={{ flex: 1 }}>
          {chargement
            ? "Génération du QCM…"
            : source === "fractions"
            ? "Générer le QCM de fractions"
            : "✨ Générer le QCM"}
        </button>
      </div>
    </form>
  );
}
