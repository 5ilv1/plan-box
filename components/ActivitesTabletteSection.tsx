"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NIVEAUX_ACTIVITES, type ActiviteTablette, type NiveauActivite } from "@/lib/activites-niveau";

/**
 * Activités sur tablette, par niveau (lib/activites-niveau.ts). Éteinte, une
 * activité n'apparaît plus sur le tableau de bord des élèves de ce niveau :
 * ils la font sur leur cahier.
 */
type Grille = Record<ActiviteTablette, Record<NiveauActivite, boolean | null>>;

const LIGNES: Array<{ activite: ActiviteTablette; libelle: string; icone: string; effet: string }> = [
  { activite: "probleme_du_jour", libelle: "Problème du jour", icone: "functions", effet: "La carte disparaît du tableau de bord." },
  { activite: "ecriture", libelle: "Écriture", icone: "edit_note", effet: "Le thème n'est plus affecté aux élèves de ce niveau (dès la prochaine affectation)." },
  { activite: "calcul_du_jour", libelle: "Calcul du jour", icone: "calculate", effet: "Le même interrupteur que sur la page du calcul du jour." },
];

export default function ActivitesTabletteSection() {
  const [grille, setGrille] = useState<Grille | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/enseignant/reglages")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setGrille(j?.activites_tablette ?? null))
      .catch(() => setGrille(null));
  }, []);

  async function basculer(activite: ActiviteTablette, niveau: NiveauActivite) {
    const actuel = grille?.[activite]?.[niveau];
    if (!grille || actuel === null || actuel === undefined) return;
    const allume = !actuel;
    const cle = `${activite}|${niveau}`;
    setEnCours(cle);
    setMessage(null);
    try {
      const r = await fetch("/api/enseignant/reglages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cle: "activites_tablette", activite, niveau, allume }),
      });
      if (!r.ok) throw new Error();
      setGrille({ ...grille, [activite]: { ...grille[activite], [niveau]: allume } });
      const libelle = LIGNES.find((l) => l.activite === activite)?.libelle;
      setMessage(`✓ ${libelle} ${allume ? "rallumé" : "éteint"} pour les ${niveau}`);
    } catch {
      setMessage("Impossible d'enregistrer. Réessaie.");
    } finally {
      setEnCours(null);
    }
  }

  return (
    <section style={{ background: "white", borderRadius: "1.25rem", padding: "24px 28px", border: "1px solid var(--pb-outline-variant)", boxShadow: "0 1px 4px rgba(0,0,48,0.05)" }}>
      <h3 className="ens-section-title" style={{ marginBottom: 6 }}>
        <span className="ms" style={{ fontSize: 20, verticalAlign: "middle", marginRight: 8 }}>tablet_android</span>
        Activités sur tablette, par niveau
      </h3>
      <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", marginBottom: 20, lineHeight: 1.5 }}>
        Éteins une activité pour qu&apos;un niveau la fasse <strong>sur son cahier</strong> : elle disparaît de son
        tableau de bord et ne compte plus dans sa barre du jour ni dans le suivi.
      </p>

      {grille === null ? (
        <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)" }}>Chargement…</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 420 }}>
            <thead>
              <tr>
                <th />
                {NIVEAUX_ACTIVITES.map((n) => (
                  <th key={n} style={{ fontSize: 13, fontWeight: 800, padding: "0 8px 10px", textAlign: "center" }}>{n}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LIGNES.map(({ activite, libelle, icone, effet }) => (
                <tr key={activite} style={{ borderTop: "1px solid var(--pb-outline-variant)" }}>
                  <td style={{ padding: "12px 8px 12px 0" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="ms" style={{ fontSize: 18, color: "var(--pb-primary)" }}>{icone}</span>
                      {libelle}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginTop: 2 }}>{effet}</div>
                  </td>
                  {NIVEAUX_ACTIVITES.map((niveau) => {
                    const valeur = grille[activite]?.[niveau];
                    const cle = `${activite}|${niveau}`;
                    return (
                      <td key={niveau} style={{ textAlign: "center", padding: "12px 8px" }}>
                        {valeur === null || valeur === undefined ? (
                          <Link href="/enseignant/calcul-du-jour" style={{ fontSize: 12, fontWeight: 700, color: "var(--pb-primary)" }}>
                            À configurer
                          </Link>
                        ) : (
                          <Interrupteur
                            allume={valeur}
                            desactive={enCours !== null}
                            libelle={`${libelle} — ${niveau}`}
                            surClic={() => basculer(activite, niveau)}
                            chargement={enCours === cle}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {message && (
        <p style={{ marginTop: 14, fontSize: 13, fontWeight: 600, color: message.startsWith("✓") ? "#16A34A" : "#DC2626" }}>{message}</p>
      )}
    </section>
  );
}

function Interrupteur({ allume, desactive, libelle, surClic, chargement }: {
  allume: boolean; desactive: boolean; libelle: string; surClic: () => void; chargement: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={allume}
      aria-label={libelle}
      title={allume ? "Sur tablette" : "Sur cahier"}
      onClick={surClic}
      disabled={desactive}
      style={{
        width: 52, height: 30, borderRadius: 999, border: "none", position: "relative",
        background: allume ? "var(--pb-primary)" : "var(--pb-outline-variant)",
        cursor: desactive ? "default" : "pointer", transition: "background 0.15s",
        opacity: chargement ? 0.6 : 1,
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: allume ? 25 : 3, width: 24, height: 24, borderRadius: "50%",
        background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "left 0.15s",
      }} />
    </button>
  );
}
