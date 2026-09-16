"use client";

import { TYPE_BLOC_CONFIG } from "@/types";
import type { TypeBloc } from "@/types";
import { EtatVide } from "./Carte";
import { ENCRE, ENCRE_DOUCE, ETAT, couleurNiveau } from "./theme-charts";

/* ────────────────────────────────────────────────────────────────────────────
   Élèves à surveiller
   ──────────────────────────────────────────────────────────────────────────── */

export interface EleveAlerte {
  uid: string;
  prenom: string;
  nom: string;
  niveau: string;
  motifs: string[];
  score: number;
}

/**
 * Les élèves à regarder, et **pourquoi**.
 *
 * Un classement sans motif se lit comme un jugement. Chaque ligne dit ce qui
 * l'a fait remonter — c'est le motif qui est actionnable, pas le rang.
 */
export function ElevesASurveiller({
  eleves,
  onSelection,
}: {
  eleves: EleveAlerte[];
  onSelection?: (uid: string) => void;
}) {
  if (eleves.length === 0) {
    return <EtatVide message="Personne ne décroche sur cette période." />;
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {eleves.map((e) => (
        <li key={e.uid}>
          <button
            onClick={() => onSelection?.(e.uid)}
            style={{
              width: "100%", textAlign: "left", background: "none", cursor: onSelection ? "pointer" : "default",
              border: "1px solid var(--pb-outline-variant)", borderRadius: 14, padding: "10px 12px",
              display: "flex", alignItems: "flex-start", gap: 10, font: "inherit",
            }}
          >
            <span
              style={{
                width: 8, height: 8, borderRadius: 999, marginTop: 6, flexShrink: 0,
                background: couleurNiveau(e.niveau),
              }}
              aria-hidden
            />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: ENCRE }}>
                {e.prenom} {e.nom}
                <span style={{ fontWeight: 500, color: ENCRE_DOUCE }}> · {e.niveau}</span>
              </span>
              <span style={{ display: "block", fontSize: 12, color: ENCRE_DOUCE, marginTop: 2 }}>
                {e.motifs.join(" · ")}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Questions les plus ratées
   ──────────────────────────────────────────────────────────────────────────── */

export interface QuestionRatee {
  enonce: string;
  titre: string;
  type: string;
  nbEleves: number;
}

/** Ce qu'il faut reprendre au tableau demain matin. */
export function QuestionsRatees({ questions }: { questions: QuestionRatee[] }) {
  if (questions.length === 0) {
    return <EtatVide message="Aucune question ratée par plusieurs élèves sur cette période." />;
  }

  const max = Math.max(...questions.map((q) => q.nbEleves));

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {questions.map((q, i) => (
        <li key={`${q.titre}-${i}`} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "block", fontSize: 13, color: ENCRE, lineHeight: 1.35 }}>{q.enonce}</span>
            <span style={{ display: "block", fontSize: 11, color: ENCRE_DOUCE, marginTop: 2 }}>
              {TYPE_BLOC_CONFIG[q.type as TypeBloc]?.libelle ?? q.type} · {q.titre}
            </span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ width: 54, height: 6, background: "var(--pb-surface-container)", borderRadius: 999 }}>
              <span
                style={{
                  display: "block", height: "100%", borderRadius: 999,
                  width: `${Math.round((q.nbEleves / max) * 100)}%`,
                  background: ETAT.serieux,
                }}
              />
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: ENCRE, fontVariantNumeric: "tabular-nums", minWidth: 58 }}>
              {q.nbEleves} élèves
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Ceintures de multiplications
   ──────────────────────────────────────────────────────────────────────────── */

export interface PartCeinture { index: number; nom: string; couleur: string; count: number }

/**
 * Répartition de la classe sur les ceintures de multiplications.
 *
 * Les couleurs sont celles des ceintures elles-mêmes : c'est l'encodage du
 * domaine, pas un choix de palette. Le blanc et le jaune étant invisibles sur
 * fond blanc, chaque pastille porte un liseré.
 */
export function RepartitionCeintures({ repartition }: { repartition: PartCeinture[] }) {
  const presentes = repartition.filter((c) => c.count > 0);
  if (presentes.length === 0) {
    return <EtatVide message="Aucun élève n'a encore passé de ceinture de multiplications." />;
  }
  const max = Math.max(...repartition.map((c) => c.count));

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 130 }}>
      {repartition.map((c) => (
        <div key={c.index} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: c.count > 0 ? ENCRE : ENCRE_DOUCE }}>
            {c.count}
          </span>
          <div
            title={`${c.nom} — ${c.count} élève${c.count > 1 ? "s" : ""}`}
            style={{
              width: "100%",
              height: `${Math.max(4, (c.count / max) * 82)}px`,
              background: c.couleur,
              border: "1px solid var(--pb-outline-variant)",
              borderRadius: "4px 4px 0 0",
            }}
          />
          <span style={{ fontSize: 9, color: ENCRE_DOUCE, textAlign: "center", lineHeight: 1.1, overflowWrap: "anywhere" }}>
            {c.nom}
          </span>
        </div>
      ))}
    </div>
  );
}
