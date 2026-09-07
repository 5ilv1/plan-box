"use client";

import { useMemo, useState } from "react";
import { FonctionGram, FONCTIONS_COULEURS } from "@/types";
import { recalerGroupes } from "@/lib/analyse-phrase";

interface Groupe {
  mots: string;
  fonction: FonctionGram;
  debut: number;
  fin: number;
}

interface Phrase {
  texte: string;
  groupes: Groupe[];
}

interface Props {
  titre: string;
  consigne: string;
  phrases: Phrase[];
  fonctionsActives: FonctionGram[];
  onTermine: (score: { bon: number; total: number }, reponsesEleve: { id: number; reponse: string; correcte: boolean | null }[]) => void;
}

/** Ce qu'on sait d'un groupe après le passage de l'élève. */
interface Trouvaille {
  debut: number;
  fin: number;
  correct: boolean;
  /** Le groupe a été montré à l'élève après trois essais infructueux. */
  montre?: boolean;
}

// Ordre progressif de recherche
const ORDRE_PROGRESSIF: FonctionGram[] = [
  "Verbe", "Sujet", "COD", "COI", "CC Lieu", "CC Temps", "CC Manière", "Attribut",
];

/**
 * Trois essais, puis on montre.
 *
 * Avant, une étape ne se franchissait QUE par la bonne réponse : un élève qui
 * ne trouvait pas — ou dont l'exercice contenait un groupe mal placé —
 * restait devant sa phrase sans aucun moyen d'avancer.
 */
const MAX_ESSAIS = 3;

function getEtapeLabel(f: FonctionGram): string {
  switch (f) {
    case "Verbe": return "Trouve le verbe conjugué";
    case "Sujet": return "Trouve le sujet";
    case "COD": return "Trouve le COD (complément d'objet direct)";
    case "COI": return "Trouve le COI (complément d'objet indirect)";
    case "CC Lieu": return "Trouve le complément circonstanciel de lieu";
    case "CC Temps": return "Trouve le complément circonstanciel de temps";
    case "CC Manière": return "Trouve le complément circonstanciel de manière";
    case "Attribut": return "Trouve l'attribut du sujet";
    default: return `Trouve ${f}`;
  }
}

export default function AnalysePhraseEleve({ titre, consigne, phrases, fonctionsActives, onTermine }: Props) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [etapeIdx, setEtapeIdx] = useState(0);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [reponses, setReponses] = useState<Record<number, Record<string, Trouvaille>>>({});
  const [essais, setEssais] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<"correct" | "incorrect" | null>(null);
  const [termine, setTermine] = useState(false);
  const [scoreTotal, setScoreTotal] = useState({ bon: 0, total: 0 });

  // Les positions annoncées par le contenu ne sont pas fiables : elles sont
  // recalculées à partir du texte des groupes, et un groupe qu'on ne retrouve
  // pas dans la phrase est retiré plutôt que rendu impossible à trouver.
  const phrasesSaines = useMemo(
    () => (Array.isArray(phrases) ? phrases : [])
      .filter((p) => p && typeof p.texte === "string" && Array.isArray(p.groupes))
      .map((p) => ({ ...p, groupes: recalerGroupes(p.texte, p.groupes) as Groupe[] }))
      .filter((p) => p.groupes.length > 0),
    [phrases],
  );

  const phrase = phrasesSaines[phraseIdx];

  // Aucune phrase exploitable : on le dit, plutôt que d'afficher une carte vide
  // devant laquelle l'élève attendrait quelque chose qui ne viendra pas.
  if (!phrase) {
    return (
      <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--text-secondary)" }}>
        <span className="ms" style={{ fontSize: 40, opacity: 0.5 }}>report</span>
        <p style={{ fontWeight: 700, marginTop: 8 }}>Cet exercice n'est pas lisible.</p>
        <p style={{ fontSize: "0.875rem" }}>Préviens ton maître ou ta maîtresse, il sera corrigé.</p>
      </div>
    );
  }

  const mots = phrase.texte.split(/\s+/);

  // Fonctions à trouver dans cette phrase, filtrées par fonctionsActives
  const fonctionsDansPhrase = ORDRE_PROGRESSIF.filter(
    (f) => fonctionsActives.includes(f) && phrase.groupes.some((g) => g.fonction === f)
  );

  const etapeCourante = fonctionsDansPhrase[etapeIdx];
  const groupeAttendu = etapeCourante ? phrase.groupes.find((g) => g.fonction === etapeCourante) : null;

  // Groupes déjà traités pour cette phrase
  const reponsesPhrase = reponses[phraseIdx] ?? {};

  function toggleMot(index: number) {
    if (!etapeCourante || feedback) return;
    // Un mot déjà attribué à un groupe n'est plus disponible.
    for (const key of Object.keys(reponsesPhrase)) {
      const r = reponsesPhrase[key];
      if ((r.correct || r.montre) && index >= r.debut && index <= r.fin) return;
    }
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  /** Passe à l'étape suivante — ou à la phrase suivante, ou à l'écran de fin. */
  function avancer(trouvailles: Record<number, Record<string, Trouvaille>>, score: { bon: number; total: number }) {
    setSelection(new Set());
    setEssais(0);

    if (etapeIdx + 1 < fonctionsDansPhrase.length) {
      setEtapeIdx(etapeIdx + 1);
      return;
    }
    if (phraseIdx + 1 < phrasesSaines.length) {
      setPhraseIdx(phraseIdx + 1);
      setEtapeIdx(0);
      return;
    }

    setTermine(true);
    // Le résumé se construit sur les trouvailles à jour : celles de l'état
    // React ne contiendraient pas la dernière réponse.
    const repEleve = phrasesSaines.flatMap((ph, pi) => {
      const rph = trouvailles[pi] ?? {};
      return Object.entries(rph).map(([fn, r], qi) => ({
        id: pi * 10 + qi + 1,
        reponse: `${fn} : ${ph.texte.split(/\s+/).slice(r.debut, r.fin + 1).join(" ")}`,
        correcte: r.correct,
      }));
    });
    onTermine(score, repEleve);
  }

  /** Trois essais ratés : on montre le groupe et on passe, l'étape est perdue. */
  function montrerLaReponse() {
    if (!groupeAttendu || !etapeCourante) return;

    const trouvailles = {
      ...reponses,
      [phraseIdx]: {
        ...(reponses[phraseIdx] ?? {}),
        [etapeCourante]: { debut: groupeAttendu.debut, fin: groupeAttendu.fin, correct: false, montre: true },
      },
    };
    const score = { bon: scoreTotal.bon, total: scoreTotal.total + 1 };

    setReponses(trouvailles);
    setScoreTotal(score);
    setFeedback(`C'était « ${groupeAttendu.mots} ». On continue !`);
    setFeedbackType("incorrect");

    setTimeout(() => {
      setFeedback(null);
      setFeedbackType(null);
      avancer(trouvailles, score);
    }, 2600);
  }

  function validerSelection() {
    if (!groupeAttendu || !etapeCourante || selection.size === 0) return;

    const selectionArr = Array.from(selection).sort((a, b) => a - b);
    const debut = selectionArr[0];
    const fin = selectionArr[selectionArr.length - 1];

    // Vérifier que la sélection est contiguë
    const estContigue = selectionArr.every((v, i) => i === 0 || v === selectionArr[i - 1] + 1);
    if (!estContigue) {
      setFeedback("Sélectionne des mots qui se suivent !");
      setFeedbackType("incorrect");
      setTimeout(() => { setFeedback(null); setFeedbackType(null); }, 2000);
      return;
    }

    const correct = debut === groupeAttendu.debut && fin === groupeAttendu.fin;

    if (correct) {
      const trouvailles = {
        ...reponses,
        [phraseIdx]: {
          ...(reponses[phraseIdx] ?? {}),
          [etapeCourante]: { debut, fin, correct: true },
        },
      };
      // Un point par groupe, quel que soit le nombre d'essais : le score dit
      // ce que l'élève a trouvé, pas combien de fois il a cliqué.
      const score = { bon: scoreTotal.bon + 1, total: scoreTotal.total + 1 };

      setReponses(trouvailles);
      setScoreTotal(score);
      setFeedback("Bravo !");
      setFeedbackType("correct");

      setTimeout(() => {
        setFeedback(null);
        setFeedbackType(null);
        avancer(trouvailles, score);
      }, 1200);
      return;
    }

    const essaisFaits = essais + 1;
    setEssais(essaisFaits);

    if (essaisFaits >= MAX_ESSAIS) {
      montrerLaReponse();
      return;
    }

    setFeedback(`Ce n'est pas le bon groupe. Il te reste ${MAX_ESSAIS - essaisFaits} essai${MAX_ESSAIS - essaisFaits > 1 ? "s" : ""}.`);
    setFeedbackType("incorrect");
    setTimeout(() => {
      setFeedback(null);
      setFeedbackType(null);
      setSelection(new Set());
    }, 2000);
  }

  function getFonctionMot(index: number): { fonction: FonctionGram; couleur: string; montre: boolean } | null {
    for (const [fn, r] of Object.entries(reponsesPhrase)) {
      if ((r.correct || r.montre) && index >= r.debut && index <= r.fin) {
        return { fonction: fn as FonctionGram, couleur: FONCTIONS_COULEURS[fn as FonctionGram], montre: !!r.montre };
      }
    }
    return null;
  }

  if (termine) {
    const pct = scoreTotal.total > 0 ? Math.round((scoreTotal.bon / scoreTotal.total) * 100) : 0;
    return (
      <div style={{ padding: "2rem 0", textAlign: "center" }}>
        <span className="ms" style={{ fontSize: 56, color: pct >= 80 ? "#16A34A" : "#D97706" }}>
          {pct >= 80 ? "emoji_events" : "sentiment_neutral"}
        </span>
        <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "1.5rem", marginTop: 12 }}>
          Analyse terminée !
        </h2>
        <p style={{ fontSize: "1.125rem", fontWeight: 700, color: pct >= 80 ? "#16A34A" : "#D97706", marginTop: 8 }}>
          Score : {scoreTotal.bon} / {scoreTotal.total} ({pct}%)
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "1rem 0" }}>
      {/* Progression */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
          Phrase {phraseIdx + 1} / {phrasesSaines.length}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {phrasesSaines.map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: "50%",
              background: i < phraseIdx ? "#16A34A" : i === phraseIdx ? "var(--primary)" : "var(--border)",
            }} />
          ))}
        </div>
      </div>

      {/* Instruction */}
      {etapeCourante && (
        <div style={{
          background: `${FONCTIONS_COULEURS[etapeCourante]}10`,
          border: `1.5px solid ${FONCTIONS_COULEURS[etapeCourante]}30`,
          borderRadius: 14, padding: "0.875rem 1.25rem", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span className="ms" style={{ fontSize: 22, color: FONCTIONS_COULEURS[etapeCourante] }}>
            {etapeCourante === "Verbe" ? "menu_book" : etapeCourante === "Sujet" ? "person" : "arrow_forward"}
          </span>
          <div>
            <p style={{ fontWeight: 700, fontSize: "0.9375rem", color: FONCTIONS_COULEURS[etapeCourante], margin: 0 }}>
              {getEtapeLabel(etapeCourante)}
            </p>
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "2px 0 0" }}>
              Clique sur les mots qui forment ce groupe
            </p>
          </div>
        </div>
      )}

      {/* Phrase avec mots cliquables */}
      <div style={{
        background: "white", borderRadius: 16, padding: "1.5rem 2rem",
        border: "1px solid var(--border)", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        lineHeight: 2.8, fontSize: "1.25rem",
      }}>
        {mots.map((mot, i) => {
          const trouve = getFonctionMot(i);
          const selected = selection.has(i);
          const estAssigne = !!trouve;

          return (
            <span
              key={i}
              onClick={() => toggleMot(i)}
              style={{
                display: "inline-block",
                padding: "4px 6px",
                margin: "2px 1px",
                borderRadius: 8,
                cursor: estAssigne ? "default" : "pointer",
                fontWeight: trouve || selected ? 700 : 400,
                background: trouve
                  ? `${trouve.couleur}18`
                  : selected
                    ? `${etapeCourante ? FONCTIONS_COULEURS[etapeCourante] : "#888"}25`
                    : "transparent",
                color: trouve ? trouve.couleur : "var(--text)",
                border: selected && !trouve
                  ? `2px solid ${etapeCourante ? FONCTIONS_COULEURS[etapeCourante] : "#888"}`
                  : trouve
                    ? `2px ${trouve.montre ? "dashed" : "solid"} ${trouve.couleur}40`
                    : "2px solid transparent",
                transition: "all 0.15s",
                userSelect: "none",
                position: "relative",
              }}
            >
              {mot}
              {/* Badge fonction sous le premier mot du groupe */}
              {trouve && reponsesPhrase[trouve.fonction]?.debut === i && (
                <span style={{
                  position: "absolute", bottom: -14, left: "50%", transform: "translateX(-50%)",
                  fontSize: "0.5625rem", fontWeight: 800, color: trouve.couleur,
                  whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  {trouve.fonction}
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* Légende des fonctions traitées */}
      {Object.keys(reponsesPhrase).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {Object.entries(reponsesPhrase).map(([fn, r]) => (
            <span key={fn} style={{
              fontSize: "0.6875rem", fontWeight: 700, padding: "3px 10px",
              borderRadius: 999, background: `${FONCTIONS_COULEURS[fn as FonctionGram]}15`,
              color: FONCTIONS_COULEURS[fn as FonctionGram],
              border: `1px ${r.montre ? "dashed" : "solid"} ${FONCTIONS_COULEURS[fn as FonctionGram]}30`,
            }}>
              {fn}{r.montre ? " (montré)" : ""}
            </span>
          ))}
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div style={{
          marginTop: 16, padding: "0.75rem 1rem", borderRadius: 12, textAlign: "center",
          fontWeight: 700, fontSize: "0.9375rem",
          background: feedbackType === "correct" ? "#DCFCE7" : "#FEE2E2",
          color: feedbackType === "correct" ? "#16A34A" : "#DC2626",
          border: feedbackType === "correct" ? "1px solid #BBF7D0" : "1px solid #FECACA",
        }}>
          {feedbackType === "correct" ? "🎉 " : ""}{feedback}
        </div>
      )}

      {/* Bouton valider */}
      {selection.size > 0 && !feedback && (
        <button
          onClick={validerSelection}
          style={{
            marginTop: 16, width: "100%", padding: "0.875rem",
            borderRadius: 999, border: "none",
            background: etapeCourante ? FONCTIONS_COULEURS[etapeCourante] : "var(--primary)",
            color: "white", fontWeight: 700, fontSize: "1rem",
            cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          Valider ma sélection
        </button>
      )}

      {/* Sortie de secours : proposée dès le premier essai raté. */}
      {essais > 0 && !feedback && (
        <button
          onClick={montrerLaReponse}
          style={{
            marginTop: 10, width: "100%", padding: "0.75rem",
            borderRadius: 999, background: "transparent",
            border: "1.5px solid var(--border)",
            color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.875rem",
            cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          Je ne trouve pas — montre-moi le groupe
        </button>
      )}
    </div>
  );
}
