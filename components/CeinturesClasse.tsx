"use client";

/**
 * La présentation de la vue enseignant des ceintures : la grille
 * couleurs × élèves, et le détail d'un élève.
 *
 * Composants purs — ils ne chargent rien et ne décident rien. La page
 * `/enseignant/ceintures` s'occupe du chargement, du filtre et de la
 * réinitialisation ; ici on ne fait que dessiner ce qu'on reçoit. C'est aussi
 * ce qui les rend vérifiables hors de la zone protégée.
 */

export interface ItemEleve {
  code: string;
  libelle: string;
  valide: boolean;
}

export interface DomaineEleve {
  courante: number;
  termine: boolean;
  validees: number[];
  diagnostics: number[];
  nbValides: number;
  nbItems: number;
  items: ItemEleve[];
}

export interface EleveCeintures {
  uid: string;
  eleveId: string | null;
  rbEleveId: number | null;
  prenom: string;
  nom: string;
  niveau: string | null;
  source: "planbox" | "repetibox";
  domaines: Record<string, DomaineEleve>;
}

export interface DomaineVue {
  code: string; nom: string; slug: string; matiere: string; icone: string;
}

export interface CouleurVue { idx: number; nom: string; hex: string; hexFond: string; }

interface GrilleProps {
  eleves: EleveCeintures[];
  domaines: DomaineVue[];
  couleurs: CouleurVue[];
  ouvert: string | null;
  enCours: string | null;
  onOuvrir: (uid: string) => void;
  onReinitialiser: (e: EleveCeintures, d: DomaineVue, idx: number) => void;
}

export function GrilleClasse({
  eleves, domaines, couleurs, ouvert, enCours, onOuvrir, onReinitialiser,
}: GrilleProps) {
  const couleurDe = (idx: number) => couleurs[Math.min(Math.max(idx, 0), couleurs.length - 1)];

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{
              textAlign: "left", padding: "8px 10px", position: "sticky", left: 0,
              background: "var(--pb-surface, #fff)", zIndex: 1, fontSize: 12,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              color: "var(--pb-on-surface-variant)",
            }}>
              Élève
            </th>
            {domaines.map((d) => (
              <th key={d.code} style={{
                padding: "8px 6px", fontSize: 11, fontWeight: 700,
                color: "var(--pb-on-surface-variant)",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                // Un trait sépare le français des mathématiques.
                borderLeft: d.code === "NOMB" ? "2px solid var(--pb-outline-variant, #ddd)" : "none",
              }}>
                {d.nom}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {eleves.map((e) => {
            const estOuvert = ouvert === e.uid;
            const fond = estOuvert ? "var(--pb-surface-container, #f5f5f5)" : undefined;

            return [
              <tr
                key={e.uid}
                onClick={() => onOuvrir(e.uid)}
                style={{
                  cursor: "pointer", background: fond ?? "transparent",
                  borderTop: "1px solid var(--pb-outline-variant, #eee)",
                }}
              >
                <td style={{
                  padding: "8px 10px", position: "sticky", left: 0,
                  background: fond ?? "var(--pb-surface, #fff)",
                  fontWeight: 700, whiteSpace: "nowrap",
                }}>
                  <span className="ms" style={{ fontSize: 16, verticalAlign: "-3px", opacity: 0.5 }}>
                    {estOuvert ? "expand_more" : "chevron_right"}
                  </span>{" "}
                  {e.prenom}
                  <span style={{ fontWeight: 500, color: "var(--pb-on-surface-variant)", marginLeft: 6 }}>
                    {e.niveau ?? "—"}
                  </span>
                </td>
                {domaines.map((d) => {
                  const etat = e.domaines[d.code];
                  const c = etat && !etat.termine ? couleurDe(etat.courante) : null;
                  return (
                    <td key={d.code} style={{
                      padding: "6px", textAlign: "center",
                      borderLeft: d.code === "NOMB" ? "2px solid var(--pb-outline-variant, #ddd)" : "none",
                    }}>
                      {etat?.termine ? (
                        <span title="Domaine terminé" style={{ fontSize: 15 }}>🏆</span>
                      ) : (
                        <span
                          title={`${c?.nom} — ${etat?.nbValides ?? 0}/${etat?.nbItems ?? 0} compétences`}
                          style={{
                            display: "inline-block", width: 20, height: 20, borderRadius: "50%",
                            background: c?.hex, border: "2px solid white",
                            boxShadow: `0 0 0 1px ${c?.hex}55`,
                          }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>,

              estOuvert ? (
                <tr key={`${e.uid}-detail`}>
                  <td colSpan={domaines.length + 1} style={{
                    padding: "4px 10px 18px",
                    background: "var(--pb-surface-container, #f5f5f5)",
                  }}>
                    <DetailEleve
                      eleve={e}
                      domaines={domaines}
                      couleurs={couleurs}
                      enCours={enCours}
                      onReinitialiser={onReinitialiser}
                    />
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

interface DetailProps {
  eleve: EleveCeintures;
  domaines: DomaineVue[];
  couleurs: CouleurVue[];
  enCours: string | null;
  onReinitialiser: (e: EleveCeintures, d: DomaineVue, idx: number) => void;
}

export function DetailEleve({ eleve, domaines, couleurs, enCours, onReinitialiser }: DetailProps) {
  return (
    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
      {domaines.map((d) => {
        const etat = eleve.domaines[d.code];
        if (!etat) return null;

        return (
          <div key={d.code} style={{
            background: "var(--pb-surface, #fff)", borderRadius: 12, padding: "12px 14px",
            border: "1px solid var(--pb-outline-variant, #e8e8e8)",
          }}>
            <div style={{
              fontSize: 13, fontWeight: 800, marginBottom: 8,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              {d.nom}
              <span style={{ fontWeight: 500, color: "var(--pb-on-surface-variant)", marginLeft: 6 }}>
                {etat.termine
                  ? "terminé"
                  : `${etat.nbValides}/${etat.nbItems} dans la ${couleurs[etat.courante]?.nom.toLowerCase()}`}
              </span>
            </div>

            {/* L'échelle des neuf couleurs : pleines si validées, cerclées si en cours */}
            <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
              {couleurs.map((c) => {
                const validee = etat.validees.includes(c.idx);
                const courante = !etat.termine && c.idx === etat.courante;
                return (
                  <span
                    key={c.idx}
                    title={`${c.nom}${validee ? " — validée" : courante ? " — en cours" : ""}`}
                    style={{
                      flex: 1, height: 14, borderRadius: 3,
                      background: validee || courante ? c.hex : "var(--pb-outline-variant, #e8e8e8)",
                      opacity: validee ? 1 : courante ? 0.55 : 0.35,
                      outline: courante ? `2px solid ${c.hex}` : "none",
                      outlineOffset: 1,
                    }}
                  />
                );
              })}
            </div>

            {/* Les compétences de la ceinture en cours */}
            {etat.items.length > 0 && (
              <ul style={{ listStyle: "none", margin: "0 0 10px", padding: 0 }}>
                {etat.items.map((item) => (
                  <li key={item.code} style={{
                    display: "flex", gap: 6, alignItems: "flex-start",
                    fontSize: 12, lineHeight: 1.35, marginBottom: 4,
                    color: item.valide
                      ? "var(--pb-on-surface-variant)" : "var(--pb-on-surface)",
                  }}>
                    <span className="ms" style={{
                      fontSize: 15, flexShrink: 0, marginTop: 1,
                      color: item.valide ? "#22C55E" : "var(--pb-outline, #bbb)",
                    }}>
                      {item.valide ? "check_circle" : "radio_button_unchecked"}
                    </span>
                    <span style={{ textDecoration: item.valide ? "line-through" : "none" }}>
                      {item.libelle}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {etat.diagnostics.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>
                Aucun test de départ passé.
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--pb-on-surface-variant)" }}>
                  Réinitialiser :
                </span>
                {etat.diagnostics.map((idx) => {
                  const occupe = enCours === `${eleve.uid}-${d.code}-${idx}`;
                  return (
                    <button
                      key={idx}
                      onClick={() => onReinitialiser(eleve, d, idx)}
                      disabled={occupe}
                      title={`Réinitialiser le test de départ de la ${couleurs[idx]?.nom.toLowerCase()}`}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "4px 9px", borderRadius: 999,
                        border: "1px solid var(--pb-outline-variant, #ddd)",
                        background: "white", cursor: occupe ? "wait" : "pointer",
                        fontSize: 11, fontWeight: 700, opacity: occupe ? 0.5 : 1,
                        color: "var(--pb-on-surface-variant)",
                      }}
                    >
                      <span className="ms" style={{ fontSize: 13 }}>restart_alt</span>
                      {couleurs[idx]?.nom.toLowerCase()}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
