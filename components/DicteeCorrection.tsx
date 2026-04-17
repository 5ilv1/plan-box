"use client";

import { useRef, useState } from "react";

interface Erreur {
  mot_eleve: string;
  mot_attendu?: string;
  position?: number;
  kind?: "sub" | "del" | "ins" | "casse" | "ponctuation";
  type_erreur: string;
  indice: string;
}

interface ResultatCorrection {
  transcription: string;
  texte_attendu?: string;
  nb_mots_corrects: number;
  nb_mots_total: number;
  erreurs: Erreur[];
}

/** Tokenise en gardant la ponctuation comme tokens séparés — doit suivre la même logique que la route API. */
function tokenizerAffichage(s: string): string[] {
  const out: string[] = [];
  const re = /[\p{L}\p{N}'\-]+|[.,;:!?…«»"()]/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.push(m[0]);
  return out;
}

function estPonctuation(t: string): boolean {
  return /^[.,;:!?…«»"()]$/.test(t);
}

interface Props {
  blocId: string;
  onFermer: () => void;
}

const TYPE_ERREUR_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  lettre_muette:      { label: "Lettre muette",   icon: "visibility_off", color: "#D97706" },
  accord_sujet_verbe: { label: "Accord S/V",      icon: "link",           color: "#DC2626" },
  accord_adjectif:    { label: "Accord adjectif",  icon: "tune",           color: "#DC2626" },
  conjugaison:        { label: "Conjugaison",      icon: "schedule",       color: "#7C3AED" },
  homophone:          { label: "Homophone",        icon: "swap_horiz",     color: "#2563EB" },
  mot_oublie:         { label: "Mot oublié",       icon: "add_circle",     color: "#059669" },
  orthographe:        { label: "Orthographe",      icon: "spellcheck",     color: "#D97706" },
  majuscule:          { label: "Majuscule",        icon: "format_size",    color: "#6B7280" },
  ponctuation:        { label: "Ponctuation",      icon: "more_horiz",     color: "#6B7280" },
  accent:             { label: "Accent",           icon: "font_download",  color: "#D97706" },
  lettre_doublee:     { label: "Lettre doublée",   icon: "looks_two",      color: "#D97706" },
  autre:              { label: "Autre",            icon: "help_outline",   color: "#6B7280" },
};

export default function DicteeCorrection({ blocId, onFermer }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<{ url: string; base64: string }[]>([]);
  const [chargement, setChargement] = useState(false);
  const [resultat, setResultat] = useState<ResultatCorrection | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurActive, setErreurActive] = useState<number | null>(null);

  function ouvrirCamera() {
    inputRef.current?.click();
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = () => {
      setPhotos((prev) => [...prev, { url, base64: reader.result as string }]);
    };
    reader.readAsDataURL(file);

    setResultat(null);
    setErreur(null);
    setErreurActive(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function supprimerPhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setResultat(null);
    setErreur(null);
    setErreurActive(null);
  }

  function annulerTout() {
    setPhotos([]);
    setResultat(null);
    setErreur(null);
    setErreurActive(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function envoyer() {
    if (photos.length === 0) return;
    setChargement(true);
    setErreur(null);

    try {
      const res = await fetch("/api/corriger-dictee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: photos.map((p) => p.base64),
          bloc_id: blocId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de l'analyse");
      }

      const data: ResultatCorrection = await res.json();
      setResultat(data);
    } catch (err: unknown) {
      setErreur(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setChargement(false);
    }
  }

  const pct = resultat
    ? Math.round((resultat.nb_mots_corrects / resultat.nb_mots_total) * 100)
    : null;

  return (
    <div style={{ marginTop: 24 }}>
      {/* Input caché */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPhoto}
        style={{ display: "none" }}
      />

      {/* ── Pas encore de photo ── */}
      {photos.length === 0 && !resultat && (
        <button
          onClick={ouvrirCamera}
          style={{
            width: "100%",
            padding: "20px 24px",
            borderRadius: "1.25rem",
            border: "2px dashed rgba(0,80,212,0.3)",
            background: "rgba(0,80,212,0.04)",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          <span className="ms" style={{ fontSize: 40, color: "var(--pb-primary)" }}>photo_camera</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--pb-primary)" }}>
            Prendre en photo ma dictée
          </span>
          <span style={{ fontSize: 13, color: "var(--pb-on-surface-variant)" }}>
            Prends ta dictée en photo pour vérifier tes erreurs
          </span>
        </button>
      )}

      {/* ── Preview photos ── */}
      {photos.length > 0 && !resultat && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {photos.map((photo, i) => (
              <div key={i} style={{ flex: 1, position: "relative" }}>
                <div style={{
                  borderRadius: "1rem",
                  overflow: "hidden",
                  border: "1px solid rgba(0,0,0,0.08)",
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={`Page ${i + 1}`}
                    style={{ width: "100%", display: "block" }}
                  />
                </div>
                <button
                  onClick={() => supprimerPhoto(i)}
                  disabled={chargement}
                  style={{
                    position: "absolute", top: 6, right: 6,
                    width: 28, height: 28, borderRadius: "50%",
                    background: "rgba(0,0,0,0.6)", border: "none",
                    color: "white", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <span className="ms" style={{ fontSize: 16 }}>close</span>
                </button>
                <div style={{
                  position: "absolute", bottom: 6, left: 6,
                  background: "rgba(0,0,0,0.6)", color: "white",
                  borderRadius: 8, padding: "2px 8px",
                  fontSize: 12, fontWeight: 700,
                }}>
                  Page {i + 1}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            {photos.length < 2 && (
              <button
                onClick={ouvrirCamera}
                disabled={chargement}
                className="pb-btn surface"
                style={{ flex: 1 }}
              >
                <span className="ms" style={{ fontSize: 18 }}>add_photo_alternate</span>
                Page 2
              </button>
            )}
            <button
              onClick={annulerTout}
              disabled={chargement}
              className="pb-btn surface"
              style={{ flex: 1 }}
            >
              <span className="ms" style={{ fontSize: 18 }}>close</span>
              Reprendre
            </button>
            <button
              onClick={envoyer}
              disabled={chargement}
              className="pb-btn primary"
              style={{ flex: 2 }}
            >
              {chargement ? (
                <>
                  <span className="ms spin" style={{ fontSize: 18 }}>progress_activity</span>
                  Analyse en cours…
                </>
              ) : (
                <>
                  <span className="ms" style={{ fontSize: 18 }}>auto_fix_high</span>
                  Vérifier ma dictée
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Erreur ── */}
      {erreur && (
        <div style={{
          marginTop: 16,
          padding: "12px 16px",
          borderRadius: "0.75rem",
          background: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#dc2626",
          fontSize: 14,
        }}>
          {erreur}
        </div>
      )}

      {/* ── Résultat ── */}
      {resultat && (
        <div>
          {/* Score global */}
          <div style={{
            textAlign: "center",
            padding: "24px 16px",
            marginBottom: 20,
            borderRadius: "1.25rem",
            background: pct! >= 80
              ? "linear-gradient(135deg, #dcfce7, #bbf7d0)"
              : pct! >= 50
                ? "linear-gradient(135deg, #fef9c3, #fde68a)"
                : "linear-gradient(135deg, #fee2e2, #fecaca)",
          }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>
              {pct! >= 80 ? "🎉" : pct! >= 50 ? "💪" : "📝"}
            </div>
            <div style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 28,
              fontWeight: 900,
              color: pct! >= 80 ? "#166534" : pct! >= 50 ? "#854d0e" : "#991b1b",
            }}>
              {resultat.nb_mots_corrects} / {resultat.nb_mots_total} mots justes
            </div>
            <p style={{
              fontSize: 14,
              marginTop: 4,
              color: pct! >= 80 ? "#166534" : pct! >= 50 ? "#854d0e" : "#991b1b",
              opacity: 0.8,
            }}>
              {resultat.erreurs.length === 0
                ? "Parfait, aucune erreur !"
                : `${resultat.erreurs.length} erreur${resultat.erreurs.length > 1 ? "s" : ""} à corriger — lis les indices ci-dessous`}
            </p>
          </div>

          {/* Texte attendu avec erreurs surlignées + insertions élève */}
          {resultat.erreurs.length > 0 && resultat.texte_attendu && (() => {
            const tokens = tokenizerAffichage(resultat.texte_attendu);
            // index mot attendu -> index de l'erreur dans resultat.erreurs
            const erreursParPos = new Map<number, number>();
            // insertions (mot en trop écrit par l'élève, non présent dans l'attendu)
            const insertions: { i: number; err: Erreur }[] = [];
            resultat.erreurs.forEach((e, idx) => {
              if (typeof e.position === "number" && e.position >= 0) {
                erreursParPos.set(e.position, idx);
              } else {
                insertions.push({ i: idx, err: e });
              }
            });

            const active = erreurActive !== null ? resultat.erreurs[erreurActive] : null;
            const activeConfig = active
              ? TYPE_ERREUR_LABELS[active.type_erreur] || TYPE_ERREUR_LABELS.autre
              : null;

            return (
              <div>
                <h3 style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 16, fontWeight: 700,
                  color: "var(--pb-on-surface)",
                  margin: "0 0 12px",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span className="ms" style={{ fontSize: 20, color: "var(--pb-primary)" }}>edit_note</span>
                  Ta dictée corrigée
                </h3>
                <p style={{
                  fontSize: 13,
                  color: "var(--pb-on-surface-variant)",
                  margin: "0 0 16px",
                }}>
                  Les mots en rouge sont les erreurs. Touche un mot pour voir l&apos;indice.
                </p>

                {/* Texte de la dictée */}
                <div style={{
                  padding: "18px 20px",
                  borderRadius: "1rem",
                  background: "var(--pb-surface-container, #f5f5f5)",
                  fontSize: 17,
                  lineHeight: 1.9,
                  color: "var(--pb-on-surface)",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}>
                  {tokens.map((tok, idxTok) => {
                    const idxErr = erreursParPos.get(idxTok);
                    const estErreur = idxErr !== undefined;
                    const ponct = estPonctuation(tok);
                    const estActive = estErreur && idxErr === erreurActive;

                    // Espace inséré avant le token sauf s'il s'agit d'une ponctuation
                    // ou si le token précédent est une ouvrante.
                    const prev = idxTok > 0 ? tokens[idxTok - 1] : "";
                    const espaceAvant = idxTok > 0 && !ponct && prev !== "«" && prev !== "(" && prev !== "\"";

                    if (!estErreur) {
                      return (
                        <span key={idxTok}>
                          {espaceAvant ? " " : ""}
                          {tok}
                        </span>
                      );
                    }

                    const err = resultat.erreurs[idxErr!];
                    const estMotOublie = err.kind === "del";

                    return (
                      <span key={idxTok}>
                        {espaceAvant ? " " : ""}
                        <button
                          type="button"
                          onClick={() => setErreurActive(estActive ? null : idxErr!)}
                          style={{
                            display: "inline",
                            padding: "2px 6px",
                            margin: "0 1px",
                            borderRadius: 6,
                            border: estActive ? "2px solid #DC2626" : "none",
                            background: estActive ? "#fee2e2" : "transparent",
                            color: "#DC2626",
                            fontWeight: 700,
                            fontSize: "inherit",
                            fontFamily: "inherit",
                            cursor: "pointer",
                            textDecoration: estMotOublie ? "underline dashed" : "underline",
                            textDecorationColor: "#DC2626",
                            textUnderlineOffset: 3,
                          }}
                          aria-label={`Erreur sur le mot ${tok}`}
                        >
                          {tok}
                        </button>
                      </span>
                    );
                  })}
                </div>

                {/* Panneau d'indice (erreur active) */}
                {active && activeConfig && (
                  <div style={{
                    marginTop: 14,
                    padding: "14px 16px",
                    borderRadius: "1rem",
                    background: "white",
                    border: `2px solid ${activeConfig.color}`,
                    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                  }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
                    }}>
                      <span className="ms" style={{ fontSize: 20, color: activeConfig.color }}>
                        {activeConfig.icon}
                      </span>
                      <span style={{
                        fontSize: 13, fontWeight: 700,
                        color: activeConfig.color,
                        textTransform: "uppercase", letterSpacing: 0.5,
                      }}>
                        {activeConfig.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => setErreurActive(null)}
                        style={{
                          marginLeft: "auto",
                          width: 28, height: 28, borderRadius: "50%",
                          border: "none", background: "transparent",
                          cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "var(--pb-on-surface-variant)",
                        }}
                        aria-label="Fermer l'indice"
                      >
                        <span className="ms" style={{ fontSize: 20 }}>close</span>
                      </button>
                    </div>
                    {active.mot_eleve && (
                      <p style={{
                        fontSize: 14, margin: "0 0 6px",
                        color: "var(--pb-on-surface-variant)",
                      }}>
                        Tu as écrit : <strong style={{ color: "#DC2626" }}>« {active.mot_eleve} »</strong>
                      </p>
                    )}
                    {active.kind === "del" && (
                      <p style={{
                        fontSize: 14, margin: "0 0 6px",
                        color: "var(--pb-on-surface-variant)",
                      }}>
                        Tu as oublié ce mot.
                      </p>
                    )}
                    <p style={{
                      fontSize: 15, margin: 0, lineHeight: 1.5,
                      color: "var(--pb-on-surface)",
                    }}>
                      💡 {active.indice}
                    </p>
                  </div>
                )}

                {/* Mots en trop (insertions de l'élève hors du texte attendu) */}
                {insertions.length > 0 && (
                  <div style={{
                    marginTop: 14,
                    padding: "12px 16px",
                    borderRadius: "0.75rem",
                    background: "#fff7ed",
                    border: "1px solid #fed7aa",
                  }}>
                    <p style={{
                      fontSize: 13, fontWeight: 700,
                      color: "#9a3412", margin: "0 0 6px",
                      textTransform: "uppercase", letterSpacing: 0.5,
                    }}>
                      Mots en trop
                    </p>
                    <p style={{ fontSize: 14, color: "#7c2d12", margin: 0 }}>
                      {insertions.map((x, k) => (
                        <span key={k}>
                          {k > 0 ? ", " : ""}
                          <span style={{ textDecoration: "line-through" }}>« {x.err.mot_eleve} »</span>
                        </span>
                      ))}
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Fallback : si on n'a pas le texte attendu, afficher l'ancienne liste */}
          {resultat.erreurs.length > 0 && !resultat.texte_attendu && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {resultat.erreurs.map((err, i) => {
                const config = TYPE_ERREUR_LABELS[err.type_erreur] || TYPE_ERREUR_LABELS.autre;
                return (
                  <div
                    key={i}
                    style={{
                      padding: "14px 16px",
                      borderRadius: "1rem",
                      background: "var(--pb-surface-container, #f5f5f5)",
                      borderLeft: `4px solid ${config.color}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span className="ms" style={{ fontSize: 18, color: config.color }}>{config.icon}</span>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: config.color,
                        textTransform: "uppercase", letterSpacing: 0.5,
                      }}>{config.label}</span>
                      <span style={{
                        fontSize: 14, fontWeight: 600, color: "var(--pb-on-surface)", marginLeft: "auto",
                      }}>« {err.mot_eleve} »</span>
                    </div>
                    <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", margin: 0, lineHeight: 1.5 }}>
                      💡 {err.indice}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button
              onClick={() => { annulerTout(); setResultat(null); }}
              className="pb-btn surface"
              style={{ flex: 1 }}
            >
              <span className="ms" style={{ fontSize: 18 }}>photo_camera</span>
              Reprendre une photo
            </button>
            <button
              onClick={onFermer}
              className="pb-btn primary"
              style={{ flex: 1 }}
            >
              <span className="ms" style={{ fontSize: 18 }}>check</span>
              Terminer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
