"use client";

import { useEffect, useState, useCallback } from "react";
import { TYPE_BLOC_CONFIG } from "@/types";

interface EleveLigne {
  id: string;
  source: "planbox" | "repetibox";
  prenom: string;
  nom: string;
  niveau: string;
  blocs: Array<{
    id: string;
    type: string;
    titre: string;
    statut: string;
    contenu: unknown;
    chapitre_id: string | null;
  }>;
}

interface BlocCol {
  cle: string;
  type: string;
  titre: string;
  chapitre_id: string | null;
  nbEleves: number;
}

interface DetailCellule {
  eleve: EleveLigne;
  col: BlocCol;
  bloc: EleveLigne["blocs"][number] | null;
}

function couleurStatut(type: string, statut: string, contenu: unknown): { bg: string; fg: string; label: string; icone: string } {
  if (statut === "fait") {
    const c = contenu as Record<string, unknown> | null;
    const score = c?.score_eleve as number | undefined;
    const total = c?.score_total as number | undefined;
    if (score != null && total && total > 0) {
      const pct = (score / total) * 100;
      if (pct >= 80) return { bg: "#DCFCE7", fg: "#15803D", label: `${score}/${total}`, icone: "check_circle" };
      if (pct >= 50) return { bg: "#FEF3C7", fg: "#B45309", label: `${score}/${total}`, icone: "error" };
      return { bg: "#FEE2E2", fg: "#B91C1C", label: `${score}/${total}`, icone: "cancel" };
    }
    return { bg: "#DCFCE7", fg: "#15803D", label: "Fait", icone: "check" };
  }
  if (statut === "en_cours") return { bg: "#DBEAFE", fg: "#1D4ED8", label: "En cours", icone: "hourglass_empty" };
  return { bg: "#F3F4F6", fg: "#6B7280", label: "À faire", icone: "radio_button_unchecked" };
}

export default function SuiviJourView() {
  const [date, setDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [eleves, setEleves] = useState<EleveLigne[]>([]);
  const [blocsCols, setBlocsCols] = useState<BlocCol[]>([]);
  const [chargement, setChargement] = useState(true);
  const [detail, setDetail] = useState<DetailCellule | null>(null);
  const [detailEleve, setDetailEleve] = useState<EleveLigne | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    const res = await fetch(`/api/admin/suivi-jour?date=${date}`);
    const json = await res.json();
    setEleves(json.eleves ?? []);
    setBlocsCols(json.blocsUniques ?? []);
    setChargement(false);
  }, [date]);

  useEffect(() => { charger(); }, [charger]);

  async function toggleStatut() {
    if (!detail?.bloc) return;
    const nouveauStatut = detail.bloc.statut === "fait" ? "a_faire" : "fait";
    if (detail.eleve.source === "repetibox") {
      const rbId = parseInt(detail.eleve.id.replace("rb_", ""), 10);
      await fetch("/api/mon-plan-travail", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocId: detail.bloc.id, statut: nouveauStatut, eleveRbId: rbId }),
      });
    } else {
      const { createClient } = await import("@/lib/supabase");
      const supa = createClient();
      await supa.from("plan_travail").update({ statut: nouveauStatut }).eq("id", detail.bloc.id);
    }
    setDetail(null);
    await charger();
  }

  return (
    <div>
      {/* En-tête avec sélecteur de date */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <h3 className="ens-section-title" style={{ marginBottom: 4 }}>Suivi du jour</h3>
          <p className="text-secondary text-sm" style={{ margin: 0 }}>
            Avancement de chaque élève sur les blocs assignés pour cette journée.
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="form-input"
            style={{ padding: "8px 12px", fontSize: 14, marginBottom: 0 }}
          />
          <button
            onClick={() => setDate(new Date().toISOString().split("T")[0])}
            className="btn-ghost"
            style={{ padding: "8px 14px", fontSize: 13 }}
          >
            Aujourd&apos;hui
          </button>
        </div>
      </div>

      {!chargement && eleves.length > 0 && (() => {
        const totalAssignes = eleves.reduce((s, e) => s + e.blocs.length, 0);
        const nbFaits = eleves.reduce((s, e) => s + e.blocs.filter((b) => b.statut === "fait").length, 0);
        const nbEnCours = eleves.reduce((s, e) => s + e.blocs.filter((b) => b.statut === "en_cours").length, 0);
        const nbAFaire = totalAssignes - nbFaits - nbEnCours;
        const pct = totalAssignes > 0 ? (nbFaits / totalAssignes) * 100 : 0;
        // Arc SVG : circonférence = 2πr avec r=42 → 263.89
        const r = 42;
        const circ = 2 * Math.PI * r;
        const dashFait = (pct / 100) * circ;
        return (
          <div className="card" style={{
            padding: 20, marginBottom: 20, display: "flex", alignItems: "center",
            gap: 24, flexWrap: "wrap",
          }}>
            {/* Graphique circulaire */}
            <div style={{ position: "relative", width: 120, height: 120, flexShrink: 0 }}>
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={r} fill="none" stroke="#F3F4F6" strokeWidth="14" />
                <circle
                  cx="60" cy="60" r={r} fill="none" stroke="#16A34A" strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={`${dashFait} ${circ}`}
                  transform="rotate(-90 60 60)"
                  style={{ transition: "stroke-dasharray 0.6s ease" }}
                />
              </svg>
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#15803D", lineHeight: 1 }}>
                  {Math.round(pct)}%
                </div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 600, marginTop: 2 }}>
                  complétés
                </div>
              </div>
            </div>

            {/* Stats détaillées */}
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                Taux de complétion
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#16A34A", display: "inline-block" }} />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{nbFaits}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Faits</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#1D4ED8", display: "inline-block" }} />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{nbEnCours}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>En cours</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#9CA3AF", display: "inline-block" }} />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{nbAFaire}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>À faire</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 12, borderLeft: "1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{eleves.length}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Élève{eleves.length > 1 ? "s" : ""}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{blocsCols.length}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Bloc{blocsCols.length > 1 ? "s" : ""}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {chargement ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)" }}>Chargement…</div>
      ) : eleves.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
          Aucun bloc assigné pour cette date.
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12, background: "white" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{
                  position: "sticky", left: 0, zIndex: 2,
                  background: "white", textAlign: "left", padding: "10px 14px",
                  borderBottom: "2px solid var(--border)", borderRight: "1px solid var(--border)",
                  fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)",
                  minWidth: 160,
                }}>
                  Élève
                </th>
                {blocsCols.map((col) => {
                  const cfg = (TYPE_BLOC_CONFIG as Record<string, { icone: string; libelle: string; couleur: string }>)[col.type] ?? { icone: "assignment", libelle: col.type, couleur: "#6B7280" };
                  return (
                    <th
                      key={col.cle}
                      style={{
                        padding: "10px 8px", textAlign: "center", minWidth: 120,
                        borderBottom: "2px solid var(--border)",
                        background: "white",
                      }}
                      title={col.titre}
                    >
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <span className="ms" style={{ fontSize: 18, color: cfg.couleur }}>{cfg.icone}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: "var(--text)",
                          maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {col.titre}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {eleves.map((eleve, idx) => {
                const nbFaits = eleve.blocs.filter((b) => b.statut === "fait").length;
                const nbBlocs = eleve.blocs.length;
                return (
                  <tr key={eleve.id} style={{ background: idx % 2 === 0 ? "white" : "#F9FAFB" }}>
                    <td style={{
                      position: "sticky", left: 0, zIndex: 1,
                      background: idx % 2 === 0 ? "white" : "#F9FAFB",
                      padding: 0, borderRight: "1px solid var(--border)",
                      borderBottom: "1px solid var(--border)",
                      whiteSpace: "nowrap",
                    }}>
                      <button
                        onClick={() => setDetailEleve(eleve)}
                        title={`Voir le détail de ${eleve.prenom}`}
                        style={{
                          width: "100%", padding: "10px 14px",
                          background: "transparent", border: "none", cursor: "pointer",
                          textAlign: "left", fontFamily: "inherit",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)" }}>
                          {eleve.prenom}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                          {eleve.niveau} · {nbFaits}/{nbBlocs}
                        </div>
                      </button>
                    </td>
                    {blocsCols.map((col) => {
                      const bloc = eleve.blocs.find((b) => b.type === col.type && b.titre === col.titre && (b.chapitre_id ?? "") === (col.chapitre_id ?? ""));
                      const estAssigne = !!bloc;
                      return (
                        <td
                          key={col.cle}
                          style={{
                            padding: "8px", textAlign: "center",
                            borderBottom: "1px solid var(--border)",
                            opacity: estAssigne ? 1 : 0.25,
                          }}
                        >
                          {bloc ? (
                            (() => {
                              const c = couleurStatut(bloc.type, bloc.statut, bloc.contenu);
                              return (
                                <button
                                  onClick={() => setDetail({ eleve, col, bloc })}
                                  title={`${c.label} — clique pour détails`}
                                  style={{
                                    background: c.bg, color: c.fg, border: "none",
                                    padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                                    fontWeight: 700, fontSize: 11,
                                    display: "inline-flex", alignItems: "center", gap: 4,
                                  }}
                                >
                                  <span className="ms" style={{ fontSize: 14 }}>{c.icone}</span>
                                  {c.label}
                                </button>
                              );
                            })()
                          ) : (
                            <span style={{ fontSize: 16, color: "#D1D5DB" }}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Drawer de détail cellule */}
      {detail && detail.bloc && (
        <DetailDrawer detail={detail} onClose={() => setDetail(null)} onToggleStatut={toggleStatut} />
      )}

      {/* Drawer de détail élève (au clic sur le prénom) */}
      {detailEleve && (
        <DetailEleveDrawer
          eleve={detailEleve}
          onClose={() => setDetailEleve(null)}
          onOuvrirBloc={(bloc) => {
            const col = blocsCols.find((c) => c.type === bloc.type && c.titre === bloc.titre && (c.chapitre_id ?? "") === (bloc.chapitre_id ?? ""));
            if (col) {
              setDetailEleve(null);
              setDetail({ eleve: detailEleve, col, bloc });
            }
          }}
        />
      )}
    </div>
  );
}

function DetailDrawer({
  detail, onClose, onToggleStatut,
}: {
  detail: DetailCellule;
  onClose: () => void;
  onToggleStatut: () => void;
}) {
  const bloc = detail.bloc!;
  const c = (bloc.contenu ?? {}) as Record<string, unknown>;
  const cfg = (TYPE_BLOC_CONFIG as Record<string, { icone: string; libelle: string; couleur: string }>)[bloc.type] ?? { icone: "assignment", libelle: bloc.type, couleur: "#6B7280" };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        padding: 0,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white", borderRadius: "20px 20px 0 0",
          width: "100%", maxWidth: 720, maxHeight: "85vh", overflowY: "auto",
          padding: 24, boxShadow: "0 -20px 60px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <span className="ms" style={{ fontSize: 20, color: cfg.couleur }}>{cfg.icone}</span>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{bloc.titre}</h3>
              <span style={{
                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                padding: "3px 8px", borderRadius: 999,
                background: `${cfg.couleur}1A`, color: cfg.couleur,
              }}>
                {cfg.libelle}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {detail.eleve.prenom} {detail.eleve.nom} · {detail.eleve.niveau}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: "4px 10px" }}>✕</button>
        </div>

        {/* Statut */}
        <div style={{ marginBottom: 16 }}>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 999,
            background: bloc.statut === "fait" ? "#DCFCE7" : bloc.statut === "en_cours" ? "#DBEAFE" : "#F3F4F6",
            color: bloc.statut === "fait" ? "#15803D" : bloc.statut === "en_cours" ? "#1D4ED8" : "#6B7280",
          }}>
            {bloc.statut === "fait" ? "✓ Fait" : bloc.statut === "en_cours" ? "⏳ En cours" : "○ À faire"}
          </span>
        </div>

        {/* Contenu spécifique par type */}
        <DetailContenu bloc={bloc} />

        {/* Bouton toggle statut */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <button
            onClick={onToggleStatut}
            className="btn-primary"
            style={{
              width: "100%", padding: "10px 16px",
              background: bloc.statut === "fait" ? "#F59E0B" : "#16A34A",
              borderColor: bloc.statut === "fait" ? "#F59E0B" : "#16A34A",
              fontWeight: 700,
            }}
          >
            {bloc.statut === "fait" ? "↺ Remettre à faire" : "✓ Marquer comme fait"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailContenu({ bloc }: { bloc: DetailCellule["bloc"] }) {
  if (!bloc) return null;
  const c = (bloc.contenu ?? {}) as Record<string, unknown>;

  // QCM / Exercice / Texte à trous / Calcul mental — uniquement les réponses élèves
  // Les réponses sont toutes stockées dans c.reponses_eleve (tableau {id, reponse, correcte})
  if (bloc.type === "qcm" || bloc.type === "exercice" || bloc.type === "texte_a_trous" || bloc.type === "calcul_mental") {
    const reponsesEleve = Array.isArray(c.reponses_eleve)
      ? (c.reponses_eleve as Array<{ id?: number; reponse?: string | number; correcte?: boolean | null }>)
      : [];

    // Source pour les attendus
    const questions = Array.isArray(c.questions)
      ? (c.questions as Array<{ id?: number; enonce?: string; reponse_attendue?: string; options?: string[]; reponse_correcte?: number }>)
      : [];
    const trous = Array.isArray(c.trous)
      ? (c.trous as Array<{ position?: number; mot?: string }>)
      : [];
    const calculs = Array.isArray(c.calculs)
      ? (c.calculs as Array<{ id?: number; enonce?: string; reponse?: string | number }>)
      : [];

    function getAttendu(rep: { id?: number }, idx: number): string | null {
      if (bloc!.type === "qcm") {
        const q = questions[idx];
        if (q?.options && q.reponse_correcte != null) return q.options[q.reponse_correcte] ?? null;
        return null;
      }
      if (bloc!.type === "exercice") {
        const q = questions.find((qq) => qq.id === rep.id) ?? questions[idx];
        return q?.reponse_attendue ?? null;
      }
      if (bloc!.type === "texte_a_trous") {
        const t = trous[idx];
        return t?.mot ? t.mot.replace(/[.,;:!?'"()]/g, "") : null;
      }
      if (bloc!.type === "calcul_mental") {
        const q = calculs.find((c) => c.id === rep.id) ?? calculs[idx];
        return q?.reponse != null ? String(q.reponse) : null;
      }
      return null;
    }

    if (reponsesEleve.length === 0) {
      return (
        <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: 12, background: "#F9FAFB", borderRadius: 8, textAlign: "center" }}>
          L&apos;élève n&apos;a pas encore enregistré de réponse.
        </div>
      );
    }

    const grille = bloc.type === "calcul_mental";

    return (
      <div style={grille
        ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6 }
        : { display: "flex", flexDirection: "column", gap: 6 }
      }>
        {reponsesEleve.map((rep, i) => {
          const aRepondu = rep.reponse != null && String(rep.reponse).trim() !== "";
          const attendu = getAttendu(rep, i);
          return (
            <div key={i} style={{
              padding: "8px 12px", borderRadius: 8, fontSize: 13,
              background: !aRepondu ? "#F9FAFB" : rep.correcte ? "#DCFCE7" : "#FEE2E2",
              border: "1px solid var(--border)",
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            }}>
              <span style={{ fontWeight: 700, color: "var(--text-secondary)", minWidth: 22 }}>{i + 1}.</span>
              {!aRepondu ? (
                <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>Pas de réponse</span>
              ) : (
                <>
                  <span style={{
                    fontWeight: 700,
                    color: rep.correcte ? "#15803D" : "#B91C1C",
                  }}>
                    {rep.correcte ? "✓" : "✗"} {String(rep.reponse)}
                  </span>
                  {!rep.correcte && attendu && (
                    <span style={{ fontSize: 12, color: "#15803D", fontWeight: 600 }}>
                      → attendu : {attendu}
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Écriture — sujet, contrainte, et texte(s) produit(s) par l'élève
  if (bloc.type === "ecriture") {
    const sujet = c.sujet as string | undefined;
    const contrainte = c.contrainte as string | undefined;
    const afficherContrainte = c.afficher_contrainte !== false;
    const estSemaine = c.mode === "semaine";

    // Mode semaine : texte_courant + historique (nouveau modèle) avec fallback sur texte_jour1..3
    const textes: Array<{ label: string; texte: string }> = [];
    if (estSemaine) {
      const historique = Array.isArray(c.historique) ? (c.historique as Array<{ date: string; texte: string }>) : [];
      for (const h of historique) {
        if (h.texte?.trim()) {
          const label = new Date(h.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
          textes.push({ label: label.charAt(0).toUpperCase() + label.slice(1), texte: h.texte });
        }
      }
      // Fallback ancien format
      if (textes.length === 0) {
        for (let i = 1; i <= 3; i++) {
          const t = c[`texte_jour${i}`] as string | undefined;
          if (t && t.trim()) textes.push({ label: `Jour ${i}`, texte: t });
        }
      }
      // Texte courant en cours d'édition (distinct de l'historique daté)
      const courant = (c.texte_courant as string | undefined)?.trim();
      if (courant && (textes.length === 0 || textes[textes.length - 1]?.texte !== courant)) {
        textes.push({ label: "Texte actuel", texte: courant });
      }
      const final = c.texte_final as string | undefined;
      if (final && final.trim()) textes.push({ label: "Version envoyée", texte: final });
    } else {
      // Mode jour ou autre : on affiche le texte courant / final
      const single = ((c.texte_courant as string) || (c.texte_final as string) || "").trim();
      if (single) textes.push({ label: "Texte", texte: single });
    }

    const annotations = Array.isArray(c.annotations) ? (c.annotations as Array<{ statut: string }>) : [];
    const nbAnnot = annotations.length;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sujet && (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "#EEF2FF", border: "1px solid #C7D2FE" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#4338CA", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              Sujet
            </div>
            <div style={{ fontSize: 14 }}>{sujet}</div>
          </div>
        )}
        {afficherContrainte && contrainte && (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FEF3C7", border: "1px solid #FDE68A" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              Contrainte
            </div>
            <div style={{ fontSize: 14 }}>{contrainte}</div>
          </div>
        )}

        {estSemaine && (
          <a
            href={`/enseignant/atelier-ecriture/${bloc.id}`}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", borderRadius: 10,
              background: "linear-gradient(135deg, #7C3AED, #4338CA)",
              color: "white", textDecoration: "none", fontWeight: 700, fontSize: 13,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="ms" style={{ fontSize: 18 }}>edit_note</span>
              Annoter le texte · proposer des corrections
              {nbAnnot > 0 && <span style={{ opacity: 0.85, fontWeight: 500 }}>({nbAnnot})</span>}
            </span>
            <span className="ms" style={{ fontSize: 18 }}>arrow_forward</span>
          </a>
        )}

        {textes.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: 12, background: "#F9FAFB", borderRadius: 8, textAlign: "center" }}>
            L&apos;élève n&apos;a encore rien écrit.
          </div>
        ) : (
          textes.map((t, i) => {
            const nbMots = t.texte.split(/\s+/).filter(Boolean).length;
            return (
              <div key={i} style={{ padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "white" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 999, background: "#EEF2FF", color: "#4338CA" }}>
                    {t.label}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    {nbMots} mot{nbMots > 1 ? "s" : ""}
                  </span>
                </div>
                <div style={{
                  fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap",
                  fontFamily: "'Lora', Georgia, serif",
                  color: "var(--text)",
                }}>
                  {t.texte}
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  }

  // Écriture à contraintes — consigne + texte produit
  if (bloc.type === "ecriture_contrainte") {
    const consigne = c.consigne as string | undefined;
    const contraintes = c.contraintes as string[] | undefined;
    const texte = (c.texte_eleve ?? c.texte_final ?? c.reponse_eleve) as string | undefined;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {consigne && (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "#EEF2FF", border: "1px solid #C7D2FE" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#4338CA", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              Consigne
            </div>
            <div style={{ fontSize: 14 }}>{consigne}</div>
          </div>
        )}
        {contraintes && contraintes.length > 0 && (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FEF3C7", border: "1px solid #FDE68A" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              Contraintes
            </div>
            <ul style={{ fontSize: 13, paddingLeft: 18, margin: 0 }}>
              {contraintes.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}
        {texte && texte.trim() ? (
          <div style={{ padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "white" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#4338CA", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
              Texte de l&apos;élève
            </div>
            <div style={{
              fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap",
              fontFamily: "'Lora', Georgia, serif",
            }}>
              {texte}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: 12, background: "#F9FAFB", borderRadius: 8, textAlign: "center" }}>
            L&apos;élève n&apos;a encore rien écrit.
          </div>
        )}
      </div>
    );
  }

  // Score simple
  const score = c.score_eleve as number | undefined;
  const total = c.score_total as number | undefined;
  if (score != null && total != null) {
    return (
      <div style={{ padding: 16, borderRadius: 10, background: "#F3F4F6", textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: "var(--primary)" }}>
          {score} / {total}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
          Score obtenu
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: 12, background: "#F9FAFB", borderRadius: 8 }}>
      Pas de détail à afficher pour ce type de bloc.
    </div>
  );
}

// ── Drawer du détail d'un élève — panel latéral droit avec tous ses blocs ──
function DetailEleveDrawer({
  eleve,
  onClose,
  onOuvrirBloc,
}: {
  eleve: EleveLigne;
  onClose: () => void;
  onOuvrirBloc: (bloc: EleveLigne["blocs"][number]) => void;
}) {
  // Statistiques globales pour cet élève
  const nbFaits = eleve.blocs.filter((b) => b.statut === "fait").length;
  const nbEnCours = eleve.blocs.filter((b) => b.statut === "en_cours").length;
  const nbTotal = eleve.blocs.length;
  const pct = nbTotal > 0 ? (nbFaits / nbTotal) * 100 : 0;

  // Moyenne des scores (pour les blocs avec score)
  const blocsScorés = eleve.blocs
    .map((b) => {
      const c = (b.contenu ?? {}) as Record<string, unknown>;
      const score = c.score_eleve as number | undefined;
      const total = c.score_total as number | undefined;
      if (score != null && total && total > 0) return { bloc: b, pct: (score / total) * 100, score, total };
      return null;
    })
    .filter((x): x is { bloc: EleveLigne["blocs"][number]; pct: number; score: number; total: number } => x !== null);

  const moyenneScore = blocsScorés.length > 0
    ? Math.round(blocsScorés.reduce((s, b) => s + b.pct, 0) / blocsScorés.length)
    : null;

  const alertes = blocsScorés.filter((b) => b.pct < 50);
  const nonFaits = nbTotal - nbFaits - nbEnCours;

  const r = 46;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const dashMoyenne = moyenneScore != null ? (moyenneScore / 100) * circ : 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
        display: "flex", justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white", width: "100%", maxWidth: 560, height: "100vh",
          overflowY: "auto", padding: 24,
          boxShadow: "-20px 0 60px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{eleve.prenom} {eleve.nom}</h2>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
              {eleve.niveau} · {nbTotal} bloc{nbTotal > 1 ? "s" : ""} aujourd&apos;hui
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: "4px 10px" }}>✕</button>
        </div>

        {/* Alerte si scores faibles */}
        {alertes.length > 0 && (
          <div style={{
            padding: "12px 14px", borderRadius: 10, marginBottom: 16,
            background: "#FEE2E2", border: "1px solid #FCA5A5",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span className="ms" style={{ fontSize: 22, color: "#DC2626" }}>warning</span>
            <div style={{ fontSize: 13, color: "#991B1B" }}>
              <strong>{alertes.length} exercice{alertes.length > 1 ? "s" : ""} en difficulté</strong>
              {" "}(score &lt; 50%). À revoir avec l&apos;élève.
            </div>
          </div>
        )}

        {/* Graphiques ronds : complétion + moyenne score */}
        <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
          {/* Taux de complétion */}
          <div style={{
            flex: 1, padding: 16, borderRadius: 12, background: "#F9FAFB",
            border: "1px solid var(--border)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          }}>
            <div style={{ position: "relative", width: 110, height: 110 }}>
              <svg width="110" height="110" viewBox="0 0 110 110">
                <circle cx="55" cy="55" r={r} fill="none" stroke="#E5E7EB" strokeWidth="10" />
                <circle
                  cx="55" cy="55" r={r} fill="none" stroke="#16A34A" strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${circ}`}
                  transform="rotate(-90 55 55)"
                />
              </svg>
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#15803D", lineHeight: 1 }}>{Math.round(pct)}%</div>
                <div style={{ fontSize: 9, color: "var(--text-secondary)", fontWeight: 600, marginTop: 2 }}>complétés</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "center" }}>
              {nbFaits} fait{nbFaits > 1 ? "s" : ""} · {nbEnCours} en cours · {nonFaits} à faire
            </div>
          </div>

          {/* Moyenne de score */}
          {moyenneScore != null && (
            <div style={{
              flex: 1, padding: 16, borderRadius: 12, background: "#F9FAFB",
              border: "1px solid var(--border)",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            }}>
              <div style={{ position: "relative", width: 110, height: 110 }}>
                <svg width="110" height="110" viewBox="0 0 110 110">
                  <circle cx="55" cy="55" r={r} fill="none" stroke="#E5E7EB" strokeWidth="10" />
                  <circle
                    cx="55" cy="55" r={r} fill="none"
                    stroke={moyenneScore >= 80 ? "#16A34A" : moyenneScore >= 50 ? "#F59E0B" : "#DC2626"}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${dashMoyenne} ${circ}`}
                    transform="rotate(-90 55 55)"
                  />
                </svg>
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{
                    fontSize: 24, fontWeight: 800, lineHeight: 1,
                    color: moyenneScore >= 80 ? "#15803D" : moyenneScore >= 50 ? "#B45309" : "#B91C1C",
                  }}>
                    {moyenneScore}%
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text-secondary)", fontWeight: 600, marginTop: 2 }}>réussite</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "center" }}>
                moyenne sur {blocsScorés.length} exercice{blocsScorés.length > 1 ? "s" : ""} noté{blocsScorés.length > 1 ? "s" : ""}
              </div>
            </div>
          )}
        </div>

        {/* Liste des blocs */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
          Blocs du jour
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {eleve.blocs.map((bloc) => {
            const c = (bloc.contenu ?? {}) as Record<string, unknown>;
            const score = c.score_eleve as number | undefined;
            const total = c.score_total as number | undefined;
            const pctBloc = score != null && total && total > 0 ? Math.round((score / total) * 100) : null;
            const enDifficulte = pctBloc != null && pctBloc < 50;
            const cfg = (TYPE_BLOC_CONFIG as Record<string, { icone: string; libelle: string; couleur: string }>)[bloc.type] ?? { icone: "assignment", libelle: bloc.type, couleur: "#6B7280" };
            const statutCouleur = bloc.statut === "fait"
              ? (pctBloc != null && pctBloc < 50 ? "#DC2626" : pctBloc != null && pctBloc < 80 ? "#F59E0B" : "#16A34A")
              : bloc.statut === "en_cours" ? "#1D4ED8" : "#9CA3AF";
            return (
              <button
                key={bloc.id}
                onClick={() => onOuvrirBloc(bloc)}
                style={{
                  width: "100%", padding: "12px 14px", borderRadius: 10,
                  border: enDifficulte ? "1.5px solid #FCA5A5" : "1px solid var(--border)",
                  background: enDifficulte ? "#FEF2F2" : "white",
                  cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 12,
                }}
              >
                <span className="ms" style={{ fontSize: 22, color: cfg.couleur, flexShrink: 0 }}>{cfg.icone}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {bloc.titre}
                    {enDifficulte && <span className="ms" style={{ fontSize: 14, color: "#DC2626", marginLeft: 6, verticalAlign: "middle" }}>warning</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    {cfg.libelle} · {bloc.statut === "fait" ? "Fait" : bloc.statut === "en_cours" ? "En cours" : "À faire"}
                  </div>
                </div>
                {pctBloc != null ? (
                  <div style={{
                    flexShrink: 0, minWidth: 48, textAlign: "center",
                    padding: "4px 10px", borderRadius: 999,
                    background: pctBloc >= 80 ? "#DCFCE7" : pctBloc >= 50 ? "#FEF3C7" : "#FEE2E2",
                    color: pctBloc >= 80 ? "#15803D" : pctBloc >= 50 ? "#B45309" : "#B91C1C",
                    fontWeight: 800, fontSize: 12,
                  }}>
                    {pctBloc}%
                  </div>
                ) : (
                  <span style={{
                    width: 10, height: 10, borderRadius: "50%", background: statutCouleur,
                    flexShrink: 0,
                  }} />
                )}
                <span className="ms" style={{ fontSize: 18, color: "var(--text-secondary)", flexShrink: 0 }}>chevron_right</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
