"use client";

/**
 * La leçon courte d'un item de ceinture : la règle, la procédure, deux
 * exemples travaillés et le piège. Format : docs/ceintures/SPEC-LECONS.md.
 *
 * Deux usages :
 *  • `mode="avant"` — écran plein avant l'exercice d'entraînement, avec le
 *    bouton « J'ai compris, je commence ».
 *  • `mode="rappel"` — panneau rouvert pendant l'entraînement, avec « Fermer ».
 *
 * Jamais rendu par la page évaluation : la leçon donnerait la règle au moment
 * précis où l'on vérifie qu'elle est acquise.
 */

export interface ExempleLecon {
  phrase: string;
  demonstration: string;
}

/**
 * Renvoi vers un module existant. Aujourd'hui un seul : les ceintures de
 * multiplications, pour les quatre items de Calcul qui sont des contrôles
 * courts (C10 Jaune, C17 Vert clair, C22 Bleu foncé, C32 Mauve).
 */
export interface LienLecon {
  module: string;
  ceinture: string;
}

export interface Lecon {
  titre: string;
  regle: string;
  procedure: string[];
  exemples: ExempleLecon[];
  piege?: string;
  lien?: LienLecon;
}

/** Destination d'un `lien` de leçon. `null` si le module est inconnu. */
function urlDuLien(lien: LienLecon): string | null {
  if (lien.module === "ceinture-multiplication") {
    // Le module s'ouvre directement sur la couleur nommée : l'élève de C10
    // arrive sur la Jaune, pas sur l'accueil.
    return `/eleve/activite/ceinture?ceinture=${encodeURIComponent(lien.ceinture)}`;
  }
  return null;
}

interface Props {
  lecon: Lecon;
  /** Libellé de la compétence, affiché en surtitre. */
  itemLibelle?: string | null;
  mode: "avant" | "rappel";
  onFermer: () => void;
}

export default function LeconCeinture({ lecon, itemLibelle, mode, onFermer }: Props) {
  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 20px 40px" }}>
      <div
        className="pb-card"
        style={{
          padding: "26px 24px",
          background: "linear-gradient(160deg, #EFF6FF, white 60%)",
          border: "2px solid #93C5FD",
        }}
      >
        {/* En-tête */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span className="ms" style={{ fontSize: 20, color: "#3B82F6" }}>menu_book</span>
          <span style={{
            fontSize: 12, fontWeight: 700, color: "#1D4ED8",
            textTransform: "uppercase", letterSpacing: 0.5,
          }}>
            La leçon
          </span>
        </div>

        <h1 style={{
          fontSize: 21, fontWeight: 800, margin: "0 0 4px",
          fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)",
        }}>
          {lecon.titre}
        </h1>

        {itemLibelle && (
          <p style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", margin: "0 0 18px" }}>
            {itemLibelle}
          </p>
        )}

        {/* La règle */}
        <div style={{
          padding: "14px 16px", borderRadius: 12, marginBottom: 18,
          background: "white", border: "1px solid rgba(59,130,246,0.25)",
        }}>
          <p style={{
            fontSize: 15, fontWeight: 700, margin: 0, lineHeight: 1.45,
            color: "var(--pb-on-surface)",
          }}>
            {lecon.regle}
          </p>
        </div>

        {/* La procédure */}
        <p style={{
          fontSize: 12, fontWeight: 700, color: "#1D4ED8", margin: "0 0 8px",
          textTransform: "uppercase", letterSpacing: 0.4,
        }}>
          Comment faire
        </p>
        <ol style={{ margin: "0 0 18px", padding: 0, listStyle: "none" }}>
          {lecon.procedure.map((etape, i) => (
            <li key={i} style={{
              display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8,
              fontSize: 14, lineHeight: 1.45, color: "var(--pb-on-surface)",
            }}>
              <span style={{
                flexShrink: 0, width: 22, height: 22, borderRadius: "50%",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: "#3B82F6", color: "white", fontSize: 12, fontWeight: 800,
              }}>
                {i + 1}
              </span>
              {etape}
            </li>
          ))}
        </ol>

        {/* Les exemples travaillés */}
        <p style={{
          fontSize: 12, fontWeight: 700, color: "#1D4ED8", margin: "0 0 8px",
          textTransform: "uppercase", letterSpacing: 0.4,
        }}>
          Exemples
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: lecon.piege ? 18 : 22 }}>
          {lecon.exemples.map((ex, i) => (
            <div key={i} style={{
              padding: "12px 14px", borderRadius: 11,
              background: "white", border: "1px solid var(--pb-outline-variant, #e8e8e8)",
            }}>
              <p style={{
                fontSize: 14, fontWeight: 700, margin: "0 0 6px",
                color: "var(--pb-on-surface)", fontStyle: "italic",
              }}>
                « {ex.phrase} »
              </p>
              <p style={{
                fontSize: 13, margin: 0, lineHeight: 1.5,
                color: "var(--pb-on-surface-variant)",
              }}>
                {ex.demonstration}
              </p>
            </div>
          ))}
        </div>

        {/* Le piège */}
        {lecon.piege && (
          <div style={{
            display: "flex", gap: 10, alignItems: "flex-start",
            padding: "12px 14px", borderRadius: 11, marginBottom: 22,
            background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
          }}>
            <span className="ms" style={{ fontSize: 18, color: "#B45309", flexShrink: 0 }}>
              warning
            </span>
            <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5, color: "#92400E" }}>
              {lecon.piege}
            </p>
          </div>
        )}

        {lecon.lien && urlDuLien(lecon.lien) && (
          <a
            href={urlDuLien(lecon.lien)!}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              width: "100%", padding: "13px 20px", borderRadius: 13, marginBottom: 10,
              background: "linear-gradient(135deg, #FFF7ED, #FEF3C7)",
              border: "1.5px solid rgba(245,158,11,0.35)",
              color: "#92400E", textDecoration: "none",
              fontSize: 15, fontWeight: 800,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            <span className="ms" style={{ fontSize: 20 }}>military_tech</span>
            M&apos;entraîner sur la ceinture {lecon.lien.ceinture.toLowerCase()} →
          </a>
        )}

        <button
          onClick={onFermer}
          style={{
            width: "100%", padding: "15px 24px", borderRadius: 14, border: "none",
            fontSize: 16, fontWeight: 800, cursor: "pointer",
            background: "var(--pb-primary)", color: "white",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {mode === "avant" ? "J'ai compris, je commence →" : "Fermer et reprendre"}
        </button>
      </div>
    </div>
  );
}
