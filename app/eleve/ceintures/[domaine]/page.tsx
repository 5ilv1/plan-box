"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEleveSession } from "@/hooks/useEleveSession";
import { texteSur } from "@/lib/ceintures-competences";

interface CeintureEtat {
  idx: number;
  nom: string;
  hex: string;
  hexFond: string;
  statut: "validee" | "courante" | "a_venir";
  chapitreId: string | null;
  nbItems: number;
  nbValides: number;
  diagnosticFait: boolean;
}

interface DomaineEtat {
  code: string;
  slug: string;
  nom: string;
  description: string;
  courante: number;
  termine: boolean;
  ceintures: CeintureEtat[];
}

export default function EchelleCeinturesPage() {
  const { domaine: slug } = useParams<{ domaine: string }>();
  const router = useRouter();
  const { session, chargement: chargementSession } = useEleveSession();

  const [etat, setEtat] = useState<DomaineEtat | null>(null);
  const [chargement, setChargement] = useState(true);
  const [entree, setEntree] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (chargementSession) return;
    if (!session) { router.push("/eleve"); return; }

    const ctrl = new AbortController();
    const param = session.source === "planbox"
      ? `eleve_id=${session.id}`
      : `rb_eleve_id=${session.id}`;

    fetch(`/api/ceintures/etat?${param}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((json) => {
        const d = (json.domaines ?? []).find((x: DomaineEtat) => x.slug === slug);
        setEtat(d ?? null);
        setChargement(false);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        console.error("[ceintures/domaine]", err);
        setChargement(false);
      });

    return () => ctrl.abort();
  }, [chargementSession, session, slug, router]);

  async function entrer() {
    if (!session || !etat || entree) return;
    setEntree(true);
    setErreur(null);
    try {
      const res = await fetch("/api/ceintures/entrer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domaine: etat.code,
          eleve_id: session.source === "planbox" ? session.id : undefined,
          rb_eleve_id: session.source === "repetibox" ? parseInt(session.id, 10) : undefined,
        }),
      });
      const json = await res.json();
      if (json.destination) {
        router.push(json.destination);
        return;
      }
      setErreur(json.erreur ?? "Impossible d'ouvrir cette ceinture.");
    } catch (err) {
      console.error("[ceintures/entrer]", err);
      setErreur("Impossible d'ouvrir cette ceinture.");
    } finally {
      setEntree(false);
    }
  }

  if (chargement || chargementSession) {
    return (
      <div style={{ maxWidth: 620, margin: "40px auto", padding: "0 20px" }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton" style={{ height: 60, borderRadius: 16, marginBottom: 10 }} />
        ))}
      </div>
    );
  }

  if (!etat) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p>Ce domaine n&apos;est pas ouvert.</p>
        <Link href="/eleve/ceintures">← Mes ceintures</Link>
      </div>
    );
  }

  const courante = etat.ceintures[etat.courante];

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "20px 20px 120px" }}>
      <Link
        href="/eleve/ceintures"
        style={{
          fontSize: 13, color: "var(--pb-on-surface-variant)", textDecoration: "none",
          display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 16,
        }}
      >
        <span className="ms" style={{ fontSize: 18 }}>arrow_back</span> Mes ceintures
      </Link>

      <h1 style={{
        fontSize: 24, fontWeight: 800, margin: "0 0 6px",
        fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)",
      }}>
        {etat.nom}
      </h1>
      <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", margin: "0 0 24px" }}>
        {etat.description}
      </p>

      {/* L'échelle, du noir en haut au vert clair en bas : on monte. */}
      <div style={{ display: "flex", flexDirection: "column-reverse", gap: 8, marginBottom: 24 }}>
        {etat.ceintures.map((c) => {
          const estCourante = c.statut === "courante";
          const estValidee = c.statut === "validee";
          const progression = c.nbItems > 0 ? Math.round((c.nbValides / c.nbItems) * 100) : 0;

          return (
            <div
              key={c.idx}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: estCourante ? "16px 16px" : "11px 16px",
                borderRadius: 14,
                background: estCourante
                  ? `linear-gradient(135deg, ${c.hexFond}, white)`
                  : estValidee
                    ? "var(--pb-surface-container, #fafafa)"
                    : "transparent",
                border: estCourante
                  ? `2px solid ${c.hex}`
                  : `1px solid var(--pb-outline-variant, #eee)`,
                boxShadow: estCourante ? `0 0 0 4px ${c.hex}18` : "none",
                opacity: c.statut === "a_venir" ? 0.45 : 1,
              }}
            >
              <span style={{
                width: estCourante ? 26 : 18,
                height: estCourante ? 26 : 18,
                borderRadius: "50%",
                background: c.hex,
                border: "2px solid rgba(255,255,255,0.7)",
                boxShadow: `0 0 0 1px ${c.hex}40`,
                flexShrink: 0,
              }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: estCourante ? 15 : 13,
                  fontWeight: estCourante ? 800 : 600,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  color: "var(--pb-on-surface)",
                }}>
                  Ceinture {c.nom.toLowerCase()}
                </div>
                {estCourante && (
                  <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginTop: 2 }}>
                    {c.nbValides}/{c.nbItems} compétences · {progression}%
                  </div>
                )}
              </div>

              <span className="ms" style={{
                fontSize: 20,
                color: estValidee ? "#22C55E" : estCourante ? c.hex : "var(--pb-outline)",
              }}>
                {estValidee ? "check_circle" : estCourante ? "play_circle" : "lock"}
              </span>
            </div>
          );
        })}
      </div>

      {erreur && (
        <p style={{ fontSize: 13, color: "#DC2626", textAlign: "center", marginBottom: 12 }}>
          {erreur}
        </p>
      )}

      {etat.termine ? (
        <div style={{
          padding: "24px", borderRadius: 18, textAlign: "center",
          background: "linear-gradient(135deg, #ECECEC, white)",
          border: "2px solid #1A1A1A",
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
          <p style={{ fontSize: 15, fontWeight: 800, margin: 0, color: "var(--pb-on-surface)" }}>
            Ceinture noire ! Tu as terminé {etat.nom}.
          </p>
        </div>
      ) : (
        <button
          onClick={entrer}
          disabled={entree}
          style={{
            width: "100%", padding: "16px 24px", borderRadius: 14,
            fontSize: 16, fontWeight: 800, border: "none",
            background: courante?.hex ?? "var(--pb-primary)",
            color: courante ? texteSur(courante.hex) : "white",
            cursor: entree ? "default" : "pointer",
            opacity: entree ? 0.6 : 1,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {entree
            ? "Ouverture…"
            : courante?.diagnosticFait
              ? `Continuer la ceinture ${courante?.nom.toLowerCase()} →`
              : `Commencer le test de départ →`}
        </button>
      )}

      {!etat.termine && !courante?.diagnosticFait && (
        <p style={{
          fontSize: 12, color: "var(--pb-on-surface-variant)",
          textAlign: "center", marginTop: 12,
        }}>
          Un court test pour voir ce que tu sais déjà : ce que tu réussis, tu n&apos;auras pas à le refaire.
        </p>
      )}
    </div>
  );
}
