"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEleveSession } from "@/hooks/useEleveSession";

interface CeintureEtat {
  idx: number;
  nom: string;
  hex: string;
  hexFond: string;
  statut: "validee" | "courante" | "a_venir";
  nbItems: number;
  nbValides: number;
}

interface DomaineEtat {
  code: string;
  slug: string;
  nom: string;
  description: string;
  icone: string;
  courante: number;
  termine: boolean;
  couleurCourante: { nom: string; hex: string; hexFond: string } | null;
  ceintures: CeintureEtat[];
}

export default function CeinturesPage() {
  const router = useRouter();
  const { session, chargement: chargementSession } = useEleveSession();

  const [domaines, setDomaines] = useState<DomaineEtat[]>([]);
  const [chargement, setChargement] = useState(true);

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
        setDomaines(json.domaines ?? []);
        setChargement(false);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        console.error("[ceintures]", err);
        setChargement(false);
      });

    return () => ctrl.abort();
  }, [chargementSession, session, router]);

  if (chargement || chargementSession) {
    return (
      <div style={{ maxWidth: 700, margin: "40px auto", padding: "0 20px" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 110, borderRadius: 20, marginBottom: 14 }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 20px 120px" }}>
      <Link
        href="/eleve/dashboard"
        style={{
          fontSize: 13, color: "var(--pb-on-surface-variant)", textDecoration: "none",
          display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 16,
        }}
      >
        <span className="ms" style={{ fontSize: 18 }}>arrow_back</span> Tableau de bord
      </Link>

      <h1 style={{
        fontSize: 24, fontWeight: 800, margin: "0 0 6px",
        fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)",
      }}>
        🥋 Mes ceintures de français
      </h1>
      <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", margin: "0 0 24px" }}>
        Neuf couleurs par domaine, du vert clair au noir. À toi de monter !
      </p>

      {domaines.length === 0 && (
        <div style={{
          padding: "30px 24px", borderRadius: 18, textAlign: "center",
          background: "var(--pb-surface-container, #fafafa)",
          border: "1px solid var(--pb-outline-variant, #eee)",
        }}>
          <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", margin: 0 }}>
            Aucune ceinture n&apos;est ouverte pour l&apos;instant.
          </p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {domaines.map((d) => {
          const c = d.couleurCourante;
          const ceintureCourante = d.ceintures[d.courante];
          const progression = ceintureCourante && ceintureCourante.nbItems > 0
            ? Math.round((ceintureCourante.nbValides / ceintureCourante.nbItems) * 100)
            : 0;

          return (
            <Link
              key={d.code}
              href={`/eleve/ceintures/${d.slug}`}
              className="pb-card"
              style={{
                display: "block", textDecoration: "none", color: "inherit",
                padding: 20,
                background: c ? `linear-gradient(135deg, ${c.hexFond}, white)` : "var(--pb-surface-container, #fafafa)",
                border: `1.5px solid ${c ? `${c.hex}40` : "var(--pb-outline-variant, #eee)"}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span className="ms" style={{ fontSize: 28, color: c?.hex ?? "var(--pb-on-surface-variant)" }}>
                  {d.icone}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 16, fontWeight: 800,
                    fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)",
                  }}>
                    {d.nom}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)" }}>
                    {d.description}
                  </div>
                </div>
              </div>

              {d.termine ? (
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>
                  🏆 Ceinture noire — domaine terminé !
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: "50%",
                      background: c?.hex, border: "2px solid rgba(255,255,255,0.7)",
                      boxShadow: `0 0 0 1px ${c?.hex}40`, flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: 13, fontWeight: 700, color: c?.hex,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}>
                      Ceinture {c?.nom.toLowerCase()}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginLeft: "auto" }}>
                      {ceintureCourante?.nbValides ?? 0}/{ceintureCourante?.nbItems ?? 0} compétences
                    </span>
                  </div>

                  <div style={{
                    height: 6, borderRadius: 100, overflow: "hidden",
                    background: "rgba(0,0,0,0.06)",
                  }}>
                    <div style={{
                      width: `${progression}%`, height: "100%",
                      background: c?.hex, borderRadius: 100, transition: "width 0.3s ease",
                    }} />
                  </div>
                </>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
