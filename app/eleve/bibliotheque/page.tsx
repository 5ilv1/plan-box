"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEleveSession } from "@/hooks/useEleveSession";

interface Livre {
  id: string;
  titre: string;
  auteur: string | null;
  resume: string | null;
  couverture_url: string | null;
  niveau?: { nom: string } | null;
  nb_chapitres: number;
  duree_lecture: string | null;
  deja_choisi: boolean;
}

interface LivreEnCours {
  chapitre_id: string;
  titre: string;
  auteur: string | null;
  couverture_url: string | null;
  pourcentage: number;
}

export default function PageBibliotheque() {
  const router = useRouter();
  const { session, chargement: chargementSession } = useEleveSession();

  interface LivreLu {
    chapitre_id: string;
    titre: string;
    auteur: string | null;
    couverture_url: string | null;
    termine_le: string;
    score: number | null;
    total: number | null;
  }

  const [livres, setLivres] = useState<Livre[]>([]);
  const [livresLus, setLivresLus] = useState<LivreLu[]>([]);
  const [enCours, setEnCours] = useState<LivreEnCours | null>(null);
  const [peutChoisir, setPeutChoisir] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [detail, setDetail] = useState<Livre | null>(null);
  const [enChoix, setEnChoix] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (chargementSession) return;
    if (!session) { router.push("/eleve"); return; }
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargementSession, session]);

  async function charger() {
    if (!session) return;
    setChargement(true);
    const qs = session.source === "planbox"
      ? `eleve_id=${session.id}`
      : `rb_id=${session.id}`;
    const [livresRes, statutRes, lusRes] = await Promise.all([
      fetch(`/api/bibliotheque?${qs}`).then((r) => r.json()),
      fetch(`/api/bibliotheque/statut?${qs}`).then((r) => r.json()),
      fetch(`/api/bibliotheque/lus?${qs}`).then((r) => r.json()),
    ]);
    setLivres(livresRes.livres ?? []);
    setLivresLus(lusRes.livres ?? []);
    setEnCours(statutRes.livre_en_cours ?? null);
    setPeutChoisir(statutRes.peut_choisir ?? false);
    setChargement(false);
  }

  async function choisir(livre: Livre) {
    if (!session || enChoix) return;
    setEnChoix(true);
    setErreur("");
    try {
      const res = await fetch("/api/bibliotheque/choisir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapitre_id: livre.id,
          eleve_id: session.source === "planbox" ? session.id : undefined,
          rb_eleve_id: session.source === "repetibox" ? parseInt(session.id, 10) : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      router.push(`/eleve/chapitre/${livre.id}`);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur");
      setEnChoix(false);
    }
  }

  if (chargement) {
    return (
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 20px 80px" }}>
        <div style={{ textAlign: "center", padding: 60, color: "var(--pb-on-surface-variant)" }}>
          Chargement de la bibliothèque…
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 20px 80px" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.push("/eleve/dashboard")}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pb-on-surface-variant)", fontSize: 13, marginBottom: 8 }}
        >
          ← Retour
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 30 }}>📚</span>
          <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", margin: 0 }}>
            Bibliothèque
          </h1>
        </div>
        <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", marginTop: 6 }}>
          Choisis ton prochain livre à lire.
        </p>
      </div>

      {/* Livre en cours */}
      {enCours && (
        <div
          style={{
            background: "linear-gradient(135deg, #F3E8FF 0%, #E9D5FF 100%)",
            border: "1px solid rgba(124,58,237,0.25)",
            borderRadius: 16, padding: 16,
            marginBottom: 24,
            display: "flex", alignItems: "center", gap: 14,
          }}
        >
          <div
            style={{
              width: 70, height: 96, borderRadius: 8, flexShrink: 0,
              background: enCours.couverture_url
                ? `url(${enCours.couverture_url}) center / cover`
                : "linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontSize: 28,
            }}
          >
            {!enCours.couverture_url && <span className="ms">menu_book</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", letterSpacing: 0.5, marginBottom: 2 }}>
              LIVRE EN COURS
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#4C1D95", lineHeight: 1.2, marginBottom: 2 }}>
              {enCours.titre}
            </div>
            {enCours.auteur && (
              <div style={{ fontSize: 13, color: "#5B21B6", marginBottom: 6 }}>
                {enCours.auteur}
              </div>
            )}
            <div style={{ height: 6, background: "rgba(124,58,237,0.2)", borderRadius: 999, overflow: "hidden", marginTop: 6 }}>
              <div style={{
                height: "100%", background: "#7C3AED",
                width: `${enCours.pourcentage}%`, transition: "width 0.3s",
              }} />
            </div>
            <div style={{ fontSize: 12, color: "#5B21B6", marginTop: 4, fontWeight: 600 }}>
              {enCours.pourcentage}% lu
            </div>
          </div>
          <button
            onClick={() => router.push(`/eleve/chapitre/${enCours.chapitre_id}`)}
            style={{
              padding: "10px 18px", borderRadius: 999,
              background: "#7C3AED", color: "white", border: "none",
              fontWeight: 700, fontSize: 13, cursor: "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              whiteSpace: "nowrap",
            }}
          >
            Continuer →
          </button>
        </div>
      )}

      {/* Message si choix impossible */}
      {!peutChoisir && enCours && (
        <div
          style={{
            background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 12,
            padding: "12px 16px", marginBottom: 20,
            fontSize: 13, color: "#92400E",
          }}
        >
          Tu as déjà un livre en cours. Termine-le (avec l'évaluation finale) avant d'en choisir un autre.
        </div>
      )}

      {/* Grille livres */}
      {livres.length === 0 ? (
        <div
          style={{
            background: "white", borderRadius: 16, padding: "48px 24px",
            textAlign: "center", color: "var(--pb-on-surface-variant)",
            border: "1px dashed var(--pb-outline)",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 10 }}>📖</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Aucun livre disponible pour le moment</div>
          <div style={{ fontSize: 13 }}>Reviens plus tard, ton maître ajoutera de nouveaux livres.</div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 18,
          }}
        >
          {livres.map((l) => {
            const indisponible = !peutChoisir && !l.deja_choisi;
            return (
              <button
                key={l.id}
                onClick={() => setDetail(l)}
                disabled={indisponible}
                style={{
                  background: "transparent", border: "none", padding: 0,
                  cursor: indisponible ? "not-allowed" : "pointer",
                  textAlign: "center",
                  opacity: indisponible ? 0.45 : 1,
                  transition: "transform 0.15s",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  if (!indisponible) e.currentTarget.style.transform = "translateY(-4px)";
                }}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
              >
                <div
                  style={{
                    position: "relative",
                    width: "100%", aspectRatio: "2 / 3",
                    borderRadius: 10,
                    background: l.couverture_url
                      ? `url(${l.couverture_url}) center / cover`
                      : "linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)",
                    boxShadow: "0 8px 20px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.08)",
                    marginBottom: 10,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "white",
                    overflow: "hidden",
                  }}
                >
                  {!l.couverture_url && (
                    <div style={{ padding: 12, fontSize: 13, fontWeight: 700, lineHeight: 1.3, textAlign: "center" }}>
                      {l.titre}
                    </div>
                  )}
                  {l.deja_choisi && (
                    <span
                      style={{
                        position: "absolute", top: 8, right: 8,
                        background: "rgba(255,255,255,0.95)", color: "#7C3AED",
                        fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                        padding: "3px 8px", borderRadius: 999,
                        textTransform: "uppercase",
                      }}
                    >
                      En cours
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface)",
                  lineHeight: 1.25, marginBottom: 2,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}>
                  {l.titre}
                </div>
                {l.auteur && (
                  <div style={{ fontSize: 11, color: "var(--pb-on-surface-variant)" }}>
                    {l.auteur}
                  </div>
                )}
                {l.duree_lecture && (
                  <div style={{
                    // Titre et auteur héritent du centrage du bouton ; une ligne
                    // flex ne l'hérite pas, il faut le lui dire.
                    display: "flex", alignItems: "center", justifyContent: "center",
                    gap: 3, marginTop: 3,
                    fontSize: 11, color: "var(--pb-on-surface-variant)",
                  }}>
                    <span className="ms" style={{ fontSize: 13 }}>schedule</span>
                    {l.duree_lecture}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Mes livres lus */}
      {livresLus.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <h2 style={{
            fontSize: 20, fontWeight: 800, color: "var(--pb-on-surface)",
            marginBottom: 6, display: "flex", alignItems: "center", gap: 8,
          }}>
            <span className="ms" style={{ fontSize: 24, color: "#16A34A" }}>verified</span>
            Mes livres lus
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--pb-on-surface-variant)", marginLeft: 4 }}>
              ({livresLus.length})
            </span>
          </h2>
          <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", marginBottom: 16 }}>
            Tu as terminé {livresLus.length > 1 ? "ces livres" : "ce livre"}. Bravo ! 🎉
          </p>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 14,
          }}>
            {livresLus.map((l) => {
              const date = new Date(l.termine_le).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
              const pct = l.score != null && l.total ? Math.round((l.score / l.total) * 100) : null;
              return (
                <div
                  key={l.chapitre_id}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    padding: 8, opacity: 0.95,
                  }}
                >
                  <div
                    style={{
                      position: "relative", width: "100%", aspectRatio: "2/3",
                      borderRadius: 10,
                      background: l.couverture_url
                        ? `url(${l.couverture_url}) center / cover`
                        : "linear-gradient(135deg, #16A34A 0%, #15803D 100%)",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                      marginBottom: 8,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "white",
                      overflow: "hidden",
                    }}
                  >
                    {!l.couverture_url && (
                      <div style={{ padding: 10, fontSize: 12, fontWeight: 700, textAlign: "center", lineHeight: 1.3 }}>
                        {l.titre}
                      </div>
                    )}
                    <span style={{
                      position: "absolute", top: 6, right: 6,
                      background: "rgba(22,163,74,0.95)", color: "white",
                      fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                      padding: "3px 8px", borderRadius: 999,
                      display: "flex", alignItems: "center", gap: 3,
                    }}>
                      <span className="ms" style={{ fontSize: 12 }}>check</span>
                      lu
                    </span>
                  </div>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: "var(--pb-on-surface)",
                    lineHeight: 1.25, textAlign: "center", marginBottom: 2,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>
                    {l.titre}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--pb-on-surface-variant)", textAlign: "center" }}>
                    terminé le {date}
                    {pct !== null && <> · {pct}%</>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal détail livre */}
      {detail && (
        <div
          onClick={() => !enChoix && setDetail(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20, animation: "fadeIn 0.2s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white", borderRadius: 20,
              width: "100%", maxWidth: 620,
              padding: 24,
              maxHeight: "90vh", overflowY: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ display: "flex", gap: 18, marginBottom: 16, flexWrap: "wrap" }}>
              <div
                style={{
                  width: 130, height: 190, borderRadius: 10, flexShrink: 0,
                  background: detail.couverture_url
                    ? `url(${detail.couverture_url}) center / cover`
                    : "linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)",
                  boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "white", fontSize: 14, fontWeight: 700, padding: 12,
                  textAlign: "center", lineHeight: 1.3,
                }}
              >
                {!detail.couverture_url && detail.titre}
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", margin: 0, marginBottom: 4 }}>
                  {detail.titre}
                </h2>
                {detail.auteur && (
                  <div style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", marginBottom: 10 }}>
                    par <strong>{detail.auteur}</strong>
                  </div>
                )}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--pb-on-surface-variant)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span className="ms" style={{ fontSize: 16 }}>bookmark</span>
                    {detail.nb_chapitres} chapitre{detail.nb_chapitres > 1 ? "s" : ""}
                  </div>
                  {detail.duree_lecture && (
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                      title="Estimation à partir de la longueur du texte"
                    >
                      <span className="ms" style={{ fontSize: 16 }}>schedule</span>
                      {detail.duree_lecture} de lecture
                    </div>
                  )}
                  {detail.niveau?.nom && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span className="ms" style={{ fontSize: 16 }}>school</span>
                      {detail.niveau.nom}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {detail.resume && (
              <div style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--pb-on-surface-variant)", marginBottom: 6 }}>
                  Résumé
                </h3>
                <p style={{
                  fontSize: 14, lineHeight: 1.6, color: "var(--pb-on-surface)",
                  fontFamily: "'Lora', 'Georgia', serif",
                  whiteSpace: "pre-wrap", margin: 0,
                }}>
                  {detail.resume}
                </p>
              </div>
            )}

            {erreur && (
              <div style={{ background: "#FEE2E2", color: "#DC2626", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                {erreur}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              {detail.deja_choisi ? (
                <button
                  onClick={() => router.push(`/eleve/chapitre/${detail.id}`)}
                  style={{
                    flex: 1, padding: "14px 20px", borderRadius: 999,
                    background: "#7C3AED", color: "white", border: "none",
                    fontWeight: 700, fontSize: 15, cursor: "pointer",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  Continuer la lecture →
                </button>
              ) : (
                <button
                  onClick={() => choisir(detail)}
                  disabled={!peutChoisir || enChoix}
                  style={{
                    flex: 1, padding: "14px 20px", borderRadius: 999,
                    background: peutChoisir ? "#7C3AED" : "var(--pb-outline)",
                    color: "white", border: "none",
                    fontWeight: 700, fontSize: 15,
                    cursor: peutChoisir && !enChoix ? "pointer" : "not-allowed",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    boxShadow: peutChoisir ? "0 4px 12px rgba(124,58,237,0.3)" : "none",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  <span className="ms" style={{ fontSize: 20 }}>auto_stories</span>
                  {enChoix ? "Ajout en cours…" : peutChoisir ? "Choisir ce livre" : "Livre en cours à terminer"}
                </button>
              )}
              <button
                onClick={() => setDetail(null)}
                disabled={enChoix}
                style={{
                  padding: "14px 20px", borderRadius: 999,
                  background: "var(--pb-surface-container, #F3F4F6)",
                  color: "var(--pb-on-surface)", border: "none",
                  fontWeight: 700, fontSize: 14, cursor: "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
