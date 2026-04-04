"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useEleveSession } from "@/hooks/useEleveSession";

interface ExempleTableau {
  titre: string;
  colonnes: string[];
  lignes: string[][];
}

interface GrilleItem {
  etiquette: string;
  texte: string;
}

interface Grille {
  titre: string;
  items: GrilleItem[];
}

interface RevisionContenu {
  // Nouveau format structuré
  introduction?: string;
  grille?: Grille;
  contenu_html?: string;
  regle_or?: string;
  astuce?: string;
  exemples?: ExempleTableau[];
  points_cles?: string[];
  video_url?: string;
  // Ancien format (rétro-compatibilité)
  texte?: string;
}

interface ExerciceProchain {
  exercice_id: string;
  titre: string;
  type: string;
  valide: boolean;
  debloque: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  exercice: "edit_note", calcul_mental: "calculate", texte_a_trous: "text_fields",
  analyse_phrase: "schema", qcm: "quiz", classement: "category",
  ecriture_contrainte: "edit", revision: "menu_book",
};

export default function PageRevisionEleve() {
  const { id: chapitreId, exerciceId } = useParams<{ id: string; exerciceId: string }>();
  const router = useRouter();
  const { session, chargement: chargementSession } = useEleveSession();

  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState<RevisionContenu | null>(null);
  const [chargement, setChargement] = useState(true);
  const [marquage, setMarquage] = useState(false);
  const [dejaLu, setDejaLu] = useState(false);
  const [prochains, setProchains] = useState<ExerciceProchain[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (chargementSession) return;
    if (!session) { router.push("/eleve"); return; }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    charger(ctrl.signal);
    return () => { ctrl.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargementSession, session, chapitreId, exerciceId]);

  async function charger(signal: AbortSignal) {
    setChargement(true);
    try {
      const param = session!.source === "planbox"
        ? `eleve_id=${session!.id}`
        : `rb_eleve_id=${session!.id}`;

      const [exRes, progRes] = await Promise.all([
        fetch(`/api/chapitres/exercices?chapitre_id=${chapitreId}`, { signal }).then((r) => r.json()),
        fetch(`/api/chapitres/progression?chapitre_id=${chapitreId}&${param}`, { signal }).then((r) => r.json()),
      ]);

      if (signal.aborted) return;

      const exo = (exRes.exercices ?? []).find((e: any) => e.id === exerciceId);
      if (!exo || exo.type !== "revision") {
        router.push(`/eleve/chapitre/${chapitreId}`);
        return;
      }

      setTitre(exo.titre);
      setContenu(exo.contenu as RevisionContenu);

      // Progression : statut lu + prochains exercices
      const allProg = progRes.exercices ?? [];
      const exoProg = allProg.find((e: any) => e.exercice_id === exerciceId);
      if (exoProg?.valide) setDejaLu(true);

      // Trouver les 2 exercices suivants dans le parcours
      const currentIdx = allProg.findIndex((e: any) => e.exercice_id === exerciceId);
      if (currentIdx >= 0) {
        const suivants = allProg.slice(currentIdx + 1, currentIdx + 3);
        setProchains(suivants);
      }
    } catch (err) {
      if (signal.aborted) return;
      console.error("[charger revision]", err);
      router.push(`/eleve/chapitre/${chapitreId}`);
    } finally {
      if (!signal.aborted) setChargement(false);
    }
  }

  async function marquerLu() {
    if (!session || marquage) return;
    setMarquage(true);
    try {
      const body: Record<string, unknown> = { exercice_id: exerciceId };
      if (session.source === "planbox") body.eleve_id = session.id;
      else body.rb_eleve_id = session.id;

      await fetch("/api/chapitres/exercices/marquer-lu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setDejaLu(true);
      setTimeout(() => router.push(`/eleve/chapitre/${chapitreId}`), 600);
    } catch {
      setMarquage(false);
    }
  }

  function getYoutubeEmbed(url: string): string | null {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  }

  if (chargement || chargementSession) {
    return (
      <div style={{ maxWidth: 900, margin: "40px auto", padding: "0 20px" }}>
        <div className="skeleton" style={{ height: 80, borderRadius: 16, marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 300, borderRadius: 20, marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 200, borderRadius: 16 }} />
      </div>
    );
  }

  if (!contenu) return null;

  const embedUrl = contenu.video_url ? getYoutubeEmbed(contenu.video_url) : null;
  // Rétro-compatibilité : utiliser texte si contenu_html n'existe pas
  const corpsHtml = contenu.contenu_html || contenu.texte || "";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px 120px" }}>

      {/* Navigation */}
      <div style={{ padding: "16px 0" }}>
        <Link href={`/eleve/chapitre/${chapitreId}`} style={{
          fontSize: 13, color: "var(--pb-on-surface-variant)", textDecoration: "none",
          display: "inline-flex", alignItems: "center", gap: 4,
        }}>
          <span className="ms" style={{ fontSize: 18 }}>arrow_back</span> Retour au parcours
        </Link>
      </div>

      {/* ── Bannière titre ── */}
      <div style={{
        background: "linear-gradient(135deg, #0050D4, #0046BB)",
        borderRadius: 16, padding: "24px 28px", marginBottom: 24,
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", right: -40, top: -40, width: 160, height: 160,
          background: "rgba(255,255,255,0.08)", borderRadius: "50%", filter: "blur(40px)",
        }} />
        <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative", zIndex: 1 }}>
          <div style={{
            background: "rgba(255,255,255,0.15)", padding: 12, borderRadius: 14,
            backdropFilter: "blur(12px)",
          }}>
            <span className="ms" style={{ fontSize: 28, color: "white" }}>menu_book</span>
          </div>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
              color: "rgba(123,156,255,1)", marginBottom: 4,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              Rappel de la leçon
            </div>
            <h1 style={{
              fontSize: 20, fontWeight: 800, color: "white", margin: 0,
              fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.3,
            }}>
              {titre}
            </h1>
          </div>
        </div>
        {dejaLu && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700,
            background: "rgba(255,255,255,0.15)", color: "white",
            marginTop: 12, position: "relative", zIndex: 1,
          }}>
            <span className="ms" style={{ fontSize: 14 }}>check_circle</span> Déjà consultée
          </div>
        )}
      </div>

      {/* ── Vidéo ── */}
      {embedUrl && (
        <div style={{
          borderRadius: 20, overflow: "hidden", marginBottom: 28,
          boxShadow: "0 4px 24px rgba(0,0,0,0.1)",
          aspectRatio: "16/9", background: "#000",
        }}>
          <iframe
            src={embedUrl}
            style={{ width: "100%", height: "100%", border: "none" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Vidéo de révision"
          />
        </div>
      )}
      {contenu.video_url && !embedUrl && (
        <a href={contenu.video_url} target="_blank" rel="noopener noreferrer" style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "16px 20px", borderRadius: 16, marginBottom: 28,
          background: "linear-gradient(135deg, #EFF6FF, #DBEAFE)",
          border: "1px solid #93C5FD",
          color: "#1E40AF", fontSize: 14, fontWeight: 700,
          textDecoration: "none", fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>
          <span className="ms" style={{ fontSize: 22 }}>play_circle</span>
          Voir la vidéo
          <span className="ms" style={{ fontSize: 16, marginLeft: "auto" }}>open_in_new</span>
        </a>
      )}

      {/* ── Grille : contenu principal + sidebar ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: prochains.length > 0 || contenu.astuce ? "1fr 280px" : "1fr",
        gap: 24, alignItems: "start",
      }}>

        {/* ── Colonne principale ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Introduction */}
          {contenu.introduction && (
            <p style={{
              fontSize: 15, color: "var(--pb-on-surface-variant, #555)",
              lineHeight: 1.7, margin: 0, fontStyle: "italic",
            }}>
              {contenu.introduction}
            </p>
          )}

          {/* Grille de badges visuels */}
          {contenu.grille && contenu.grille.items?.length > 0 && (
            <div style={{
              background: "var(--pb-surface-container, #F3F4F8)", borderRadius: 20,
              padding: "24px 28px",
            }}>
              <h4 style={{
                fontSize: 16, fontWeight: 800, margin: "0 0 16px",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                color: "var(--pb-on-surface, #282b51)",
              }}>
                {contenu.grille.titre}
              </h4>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 10,
              }}>
                {contenu.grille.items.map((item, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: "white", borderRadius: 12, padding: "10px 14px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      background: "#E8EAFF", color: "#4F5AE5", fontWeight: 800,
                      fontSize: 14, borderRadius: 8, padding: "4px 10px",
                      minWidth: 36, textAlign: "center",
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}>
                      {item.etiquette}
                    </span>
                    <span style={{
                      fontSize: 14, color: "var(--pb-on-surface, #282b51)",
                      fontWeight: 500,
                    }}>
                      {item.texte}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contenu HTML (rétro-compatibilité ancien format) */}
          {!contenu.grille && corpsHtml && (
            <div style={{
              background: "white", borderRadius: 20, padding: "28px 32px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}>
              <div
                dangerouslySetInnerHTML={{ __html: corpsHtml }}
                style={{
                  fontSize: 15, lineHeight: 1.8,
                  color: "var(--pb-on-surface, #282b51)",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  wordBreak: "break-word",
                }}
              />
            </div>
          )}

          {/* Règle d'Or */}
          {contenu.regle_or && (
            <div style={{
              padding: "20px 24px", borderRadius: 14,
              background: "linear-gradient(135deg, #F8F5FF, #F1EFFF)",
              borderLeft: "4px solid #0050D4",
            }}>
              <div style={{
                fontSize: 13, fontWeight: 800, color: "#0050D4", marginBottom: 8,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>
                La Règle d&apos;Or
              </div>
              <p style={{
                fontSize: 15, fontWeight: 500, color: "var(--pb-on-surface, #282b51)",
                margin: 0, lineHeight: 1.6,
              }}>
                {contenu.regle_or}
              </p>
            </div>
          )}

          {/* Tableau d'exemples */}
          {contenu.exemples && contenu.exemples.length > 0 && contenu.exemples.map((ex, i) => (
            ex.colonnes && ex.lignes && ex.lignes.length > 0 && (
              <div key={i} style={{
                background: "white", borderRadius: 20, padding: "24px 28px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                borderTop: "4px solid #F8A010",
              }}>
                <h4 style={{
                  fontSize: 17, fontWeight: 800, marginBottom: 16, margin: "0 0 16px",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  color: "var(--pb-on-surface, #282b51)",
                }}>
                  {ex.titre}
                </h4>
                <div style={{ overflowX: "auto" }}>
                  <table style={{
                    width: "100%", borderCollapse: "collapse",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #E7E6FF" }}>
                        {ex.colonnes.map((col, ci) => (
                          <th key={ci} style={{
                            padding: "10px 14px", textAlign: "left",
                            fontSize: 13, fontWeight: 700,
                            color: "var(--pb-on-surface-variant, #555)",
                          }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ex.lignes.map((ligne, li) => (
                        <tr key={li} style={{ borderBottom: "1px solid #F1EFFF" }}>
                          {ligne.map((cell, ci) => (
                            <td key={ci} style={{
                              padding: "12px 14px", fontSize: 14,
                              color: ci === 1 ? "#0050D4" : "var(--pb-on-surface, #282b51)",
                              fontWeight: ci === 1 ? 700 : 400,
                            }}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ))}

          {/* Points clés — À retenir */}
          {contenu.points_cles && contenu.points_cles.length > 0 && (
            <div style={{
              background: "linear-gradient(135deg, #EFF6FF, #F0FDF4)",
              border: "1.5px solid #93C5FD",
              borderRadius: 20, padding: "22px 28px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span className="ms" style={{ fontSize: 22, color: "#2563EB" }}>lightbulb</span>
                <span style={{
                  fontSize: 14, fontWeight: 800, color: "#1E40AF",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}>
                  À retenir
                </span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 10 }}>
                {contenu.points_cles.map((pt, i) => (
                  <li key={i} style={{
                    fontSize: 14, fontWeight: 600,
                    color: "var(--pb-on-surface, #282b51)", lineHeight: 1.5,
                  }}>
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        {(contenu.astuce || prochains.length > 0) && (
          <aside style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Astuce Pro */}
            {contenu.astuce && (
              <div style={{
                background: "rgba(112,42,225,0.06)",
                border: "1px solid rgba(112,42,225,0.12)",
                borderRadius: 20, padding: "20px 22px",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
                }}>
                  <span className="ms" style={{ fontSize: 20, color: "#702AE1" }}>lightbulb</span>
                  <span style={{
                    fontSize: 13, fontWeight: 800, color: "#5B00C7",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}>
                    Astuce Pro
                  </span>
                </div>
                <p style={{
                  fontSize: 13, lineHeight: 1.6, margin: 0,
                  color: "rgba(91,0,199,0.75)", fontWeight: 500,
                }}>
                  {contenu.astuce}
                </p>
              </div>
            )}

            {/* Prochaines étapes */}
            {prochains.length > 0 && (
              <div style={{
                background: "#F1EFFF", borderRadius: 20, padding: "20px 22px",
              }}>
                <h5 style={{
                  fontSize: 14, fontWeight: 800, margin: "0 0 14px",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  color: "var(--pb-on-surface, #282b51)",
                }}>
                  Prochaines étapes
                </h5>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {prochains.map((ex) => (
                    <div key={ex.exercice_id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", background: "white", borderRadius: 14,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                      opacity: 0.6,
                    }}>
                      <span className="ms" style={{
                        fontSize: 18, color: "var(--pb-on-surface-variant, #94A3B8)",
                      }}>
                        {TYPE_ICONS[ex.type] ?? "assignment"}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        {ex.titre}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* ── Bouton CTA fixe ── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        padding: "16px 20px",
        background: "linear-gradient(to top, white 80%, transparent)",
        zIndex: 10,
      }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          {dejaLu ? (
            <button
              onClick={() => router.push(`/eleve/chapitre/${chapitreId}`)}
              style={{
                width: "100%", padding: "16px 24px", borderRadius: 999,
                background: "#0050D4", color: "white",
                fontSize: 16, fontWeight: 800, border: "none", cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                boxShadow: "0 4px 20px rgba(0,80,212,0.3)",
                transition: "transform 0.2s",
              }}
            >
              Continuer le parcours
              <span className="ms" style={{ fontSize: 22 }}>arrow_forward</span>
            </button>
          ) : (
            <button
              onClick={marquerLu}
              disabled={marquage}
              style={{
                width: "100%", padding: "16px 24px", borderRadius: 999,
                background: marquage ? "#9CA3AF" : "#0050D4",
                color: "white",
                fontSize: 16, fontWeight: 800, border: "none", cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                boxShadow: "0 4px 20px rgba(0,80,212,0.3)",
                transition: "all 0.3s",
              }}
            >
              {marquage ? (
                "Enregistrement…"
              ) : (
                <>
                  J&apos;ai lu cette leçon
                  <span className="ms" style={{ fontSize: 22 }}>check_circle</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Responsive : grille 1 colonne sur mobile ── */}
      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
