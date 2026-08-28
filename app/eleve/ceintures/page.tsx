"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEleveSession } from "@/hooks/useEleveSession";
import CeinturesSemaineModal, { DomaineChoisissable } from "@/components/CeinturesSemaineModal";

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
  matiere: string;
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
  const [choix, setChoix] = useState<{
    domaines: string[];
    disponibles: DomaineChoisissable[];
    peutChanger: boolean;
  } | null>(null);
  const [modalOuverte, setModalOuverte] = useState(false);
  const [erreurChoix, setErreurChoix] = useState<string | null>(null);

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

    fetch(`/api/ceintures/choix-semaine?${param}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((json) => {
        if (ctrl.signal.aborted || json?.erreur) return;
        setChoix({
          domaines: json.domaines ?? [],
          disponibles: json.disponibles ?? [],
          peutChanger: json.peutChanger !== false,
        });
      })
      .catch(() => {});

    return () => ctrl.abort();
  }, [chargementSession, session, router]);

  async function enregistrerChoix(codes: string[]) {
    if (!session) return;
    const corps = session.source === "planbox"
      ? { eleve_id: session.id, domaines: codes }
      : { rb_eleve_id: session.id, domaines: codes };
    try {
      const res = await fetch("/api/ceintures/choix-semaine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const json = await res.json();
      if (res.ok && !json.erreur) {
        setChoix((prev) => prev ? {
          ...prev,
          domaines: json.domaines ?? codes,
          peutChanger: json.peutChanger !== false,
        } : prev);
        setErreurChoix(null);
        setModalOuverte(false);
        return;
      }
      setErreurChoix(json.erreur ?? "Impossible d'enregistrer. Réessaie.");
      if (json.peutChanger === false) {
        setChoix((prev) => prev ? { ...prev, peutChanger: false } : prev);
      }
    } catch {
      setErreurChoix("Impossible d'enregistrer. Réessaie.");
    }
  }

  if (chargement || chargementSession) {
    return (
      <div style={{ maxWidth: 700, margin: "40px auto", padding: "0 20px" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 110, borderRadius: 20, marginBottom: 14 }} />
        ))}
      </div>
    );
  }

  // Les domaines se rangent par matière : Mots, Phrases et Textes d'un côté,
  // Nombres et Calcul de l'autre — Grandeurs et mesures et Géométrie
  // viendront s'ajouter à la seconde. L'ordre de l'API est conservé.
  const MATIERES: { cle: string; titre: string; emoji: string }[] = [
    { cle: "français", titre: "Ceintures de français", emoji: "📖" },
    { cle: "maths", titre: "Ceintures de mathématiques", emoji: "🔢" },
  ];
  const groupes = MATIERES
    .map((m) => ({ ...m, domaines: domaines.filter((d) => d.matiere === m.cle) }))
    .filter((g) => g.domaines.length > 0);
  // Un domaine dont la matière ne serait pas prévue ne doit pas disparaître.
  const orphelins = domaines.filter((d) => !MATIERES.some((m) => m.cle === d.matiere));
  if (orphelins.length) groupes.push({ cle: "autres", titre: "Autres ceintures", emoji: "🥋", domaines: orphelins });

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
        🥋 Mes ceintures
      </h1>
      <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)", margin: "0 0 24px" }}>
        Neuf couleurs par domaine, du vert clair au noir. À toi de monter !
      </p>

      {/* Domaines de la semaine — rappel et changement unique */}
      {choix && choix.disponibles.length >= 2 && (
        <div
          className="pb-card"
          style={{
            padding: "16px 18px", marginBottom: 24,
            background: "linear-gradient(135deg, rgba(124,179,66,0.10), rgba(124,179,66,0.02))",
            border: "1px solid rgba(124,179,66,0.25)",
          }}
        >
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
            textTransform: "uppercase", color: "#5A8C2E", marginBottom: 8,
          }}>
            Tes domaines de la semaine
          </div>

          {choix.domaines.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {choix.domaines.map((code) => {
                const d = domaines.find((x) => x.code === code);
                if (!d) return null;
                const teinte = d.couleurCourante?.hex ?? "#7CB342";
                return (
                  <span
                    key={code}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "6px 14px", borderRadius: 999,
                      background: "white", border: `1.5px solid ${teinte}55`,
                      fontSize: 13, fontWeight: 700, color: "var(--pb-on-surface)",
                    }}
                  >
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: teinte }} />
                    {d.nom}
                  </span>
                );
              })}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", margin: "0 0 12px" }}>
              Tu n&apos;as pas encore choisi tes deux domaines pour cette semaine.
            </p>
          )}

          {choix.peutChanger ? (
            <button
              type="button"
              onClick={() => { setErreurChoix(null); setModalOuverte(true); }}
              className="pb-btn"
              style={{
                borderRadius: 999, padding: "8px 18px", fontSize: 13, fontWeight: 700,
                background: "#7CB342", color: "white", border: "none",
              }}
            >
              {choix.domaines.length > 0 ? "Changer mes domaines" : "Choisir mes domaines"}
            </button>
          ) : (
            <p style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", margin: 0 }}>
              🔒 Tu as déjà utilisé ton changement de la semaine. Tu pourras en choisir de
              nouveaux lundi prochain.
            </p>
          )}
        </div>
      )}

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

      {groupes.map((groupe) => (
        <section key={groupe.cle} style={{ marginBottom: 28 }}>
          <h2 style={{
            fontSize: 15, fontWeight: 800, margin: "0 0 12px",
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            color: "var(--pb-on-surface)",
          }}>
            <span>{groupe.emoji}</span>{groupe.titre}
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {groupe.domaines.map((d) => {
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
        </section>
      ))}

      {modalOuverte && choix && (
        <CeinturesSemaineModal
          disponibles={choix.disponibles}
          dejaChoisis={choix.domaines}
          dernierChangement={choix.domaines.length > 0 && choix.peutChanger}
          erreur={erreurChoix}
          onValider={enregistrerChoix}
          onFermer={() => { setErreurChoix(null); setModalOuverte(false); }}
        />
      )}
    </div>
  );
}
