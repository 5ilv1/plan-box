"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
}

interface DomaineEtat {
  code: string;
  slug: string;
  nom: string;
  courante: number;
  termine: boolean;
  ceintures: CeintureEtat[];
}

/**
 * L'écran de passage de ceinture, après une évaluation réussie.
 *
 * On ne s'y fie pas au score passé en paramètre : la ceinture n'est réputée
 * gagnée que si l'état serveur la donne pour validée. Un élève qui reviendrait
 * sur cette URL sans l'avoir gagnée est renvoyé sur l'échelle.
 */
export default function ReussiteCeinturePage() {
  const { chapitreId } = useParams<{ chapitreId: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { session, chargement: chargementSession } = useEleveSession();

  const [domaine, setDomaine] = useState<DomaineEtat | null>(null);
  const [gagnee, setGagnee] = useState<CeintureEtat | null>(null);
  const [chargement, setChargement] = useState(true);

  const score = params.get("score");
  const total = params.get("total");
  const pourcentage =
    score && total && Number(total) > 0
      ? Math.round((Number(score) / Number(total)) * 100)
      : null;

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
        const domaines: DomaineEtat[] = json.domaines ?? [];
        const d = domaines.find((x) => x.ceintures.some((c) => c.chapitreId === chapitreId));
        const c = d?.ceintures.find((x) => x.chapitreId === chapitreId) ?? null;

        // Pas (ou plus) gagnée : cet écran n'a rien à célébrer.
        if (!d || !c || c.statut !== "validee") {
          router.replace(d ? `/eleve/ceintures/${d.slug}` : "/eleve/ceintures");
          return;
        }

        setDomaine(d);
        setGagnee(c);
        setChargement(false);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        console.error("[reussite]", err);
        router.replace("/eleve/ceintures");
      });

    return () => ctrl.abort();
  }, [chargementSession, session, chapitreId, router]);

  if (chargement || chargementSession || !domaine || !gagnee) {
    return (
      <div style={{ maxWidth: 560, margin: "60px auto", padding: "0 20px" }}>
        <div className="skeleton" style={{ height: 300, borderRadius: 24 }} />
      </div>
    );
  }

  const suivante = domaine.termine ? null : domaine.ceintures[domaine.courante];

  return (
    <div style={{ maxWidth: 560, margin: "40px auto", padding: "0 20px 60px" }}>
      <div style={{
        padding: "36px 26px 30px", borderRadius: 24, textAlign: "center",
        background: `linear-gradient(160deg, ${gagnee.hexFond}, white 70%)`,
        border: `2px solid ${gagnee.hex}`,
        boxShadow: `0 8px 30px ${gagnee.hex}22`,
      }}>
        <div style={{ fontSize: 54, marginBottom: 6 }}>🥋</div>

        <h1 style={{
          fontSize: 24, fontWeight: 800, margin: "0 0 10px",
          fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)",
        }}>
          Bravo !
        </h1>

        {/* La ceinture gagnée */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          padding: "10px 20px", borderRadius: 999, marginBottom: 6,
          background: gagnee.hex, color: texteSur(gagnee.hex),
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: 16, fontWeight: 800,
        }}>
          <span className="ms" style={{ fontSize: 20 }}>workspace_premium</span>
          Ceinture {gagnee.nom.toLowerCase()}
        </div>

        <p style={{ fontSize: 15, color: "var(--pb-on-surface)", margin: "12px 0 4px" }}>
          Tu as réussi la ceinture {gagnee.nom.toLowerCase()} de {domaine.nom} !
        </p>
        {pourcentage != null && (
          <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", margin: 0 }}>
            {score}/{total} à l&apos;évaluation ({pourcentage} %)
          </p>
        )}

        {/* Le passage à la couleur suivante */}
        {suivante ? (
          <>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 14, margin: "26px 0 22px",
            }}>
              <span style={{
                width: 28, height: 28, borderRadius: "50%", background: gagnee.hex,
                border: "3px solid white", boxShadow: `0 0 0 1px ${gagnee.hex}55`,
              }} />
              <span className="ms" style={{ fontSize: 26, color: "var(--pb-on-surface-variant)" }}>
                arrow_forward
              </span>
              <span style={{
                width: 36, height: 36, borderRadius: "50%", background: suivante.hex,
                border: "3px solid white", boxShadow: `0 0 0 4px ${suivante.hex}33`,
              }} />
            </div>

            <p style={{
              fontSize: 16, fontWeight: 700, margin: "0 0 22px",
              fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)",
            }}>
              Tu passes à la ceinture {suivante.nom.toLowerCase()} !
            </p>

            <button
              onClick={() => router.push(`/eleve/ceintures/${domaine.slug}`)}
              style={{
                width: "100%", padding: "15px 24px", borderRadius: 14, border: "none",
                fontSize: 16, fontWeight: 800, cursor: "pointer",
                background: suivante.hex, color: texteSur(suivante.hex),
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Continuer vers la ceinture {suivante.nom.toLowerCase()} →
            </button>
          </>
        ) : (
          <>
            <p style={{
              fontSize: 17, fontWeight: 800, margin: "26px 0 22px",
              fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)",
            }}>
              🏆 Tu as terminé toutes les ceintures de {domaine.nom} !
            </p>
            <button
              onClick={() => router.push("/eleve/ceintures")}
              style={{
                width: "100%", padding: "15px 24px", borderRadius: 14, border: "none",
                fontSize: 16, fontWeight: 800, cursor: "pointer",
                background: "#1A1A1A", color: "white",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Voir mes ceintures →
            </button>
          </>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 16 }}>
        <Link
          href="/eleve/dashboard"
          style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", textDecoration: "none" }}
        >
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}
