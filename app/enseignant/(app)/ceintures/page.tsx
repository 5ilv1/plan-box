"use client";

import { useCallback, useEffect, useState } from "react";
import {
  GrilleClasse,
  type CouleurVue,
  type DomaineVue,
  type EleveCeintures,
} from "@/components/CeinturesClasse";

/**
 * Vue enseignant des ceintures de compétences.
 *
 * Trois choses en une page :
 *  • la grille couleurs × élèves — où en est la classe, d'un coup d'œil ;
 *  • le détail d'un élève, au clic sur sa ligne ;
 *  • la réinitialisation d'un test de départ, jusqu'ici accessible seulement
 *    par l'API.
 *
 * La progression n'est stockée nulle part : elle se dérive des évaluations
 * réussies. Cet écran ne fait donc que lire — sauf la réinitialisation, qui
 * est la seule action destructive et demande confirmation.
 */

const NIVEAUX = ["tous", "CE2", "CM1", "CM2"] as const;

export default function CeinturesEnseignantPage() {
  const [eleves, setEleves] = useState<EleveCeintures[]>([]);
  const [domaines, setDomaines] = useState<DomaineVue[]>([]);
  const [couleurs, setCouleurs] = useState<CouleurVue[]>([]);
  const [niveau, setNiveau] = useState<(typeof NIVEAUX)[number]>("tous");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async (n: string) => {
    setChargement(true);
    setErreur(null);
    try {
      const r = await fetch(`/api/ceintures/classe?niveau=${n}`);
      const json = await r.json();
      if (!r.ok) throw new Error(json.erreur ?? "Lecture impossible");
      setEleves(json.eleves ?? []);
      setDomaines(json.domaines ?? []);
      setCouleurs(json.couleurs ?? []);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(niveau); }, [niveau, charger]);

  async function reinitialiser(eleve: EleveCeintures, domaine: DomaineVue, idx: number) {
    const couleur = couleurs[idx]?.nom.toLowerCase() ?? `ceinture ${idx}`;
    const quoi = `le test de départ de ${domaine.nom} · ${couleur}`;

    if (!confirm(
      `Réinitialiser ${quoi} pour ${eleve.prenom} ?\n\n` +
      `Le test lui sera reproposé, et les compétences qu'il avait validées ` +
      `d'office redeviennent à faire. Les exercices réellement travaillés sont ` +
      `conservés.`,
    )) return;

    setEnCours(`${eleve.uid}-${domaine.code}-${idx}`);
    setMessage(null);
    try {
      const r = await fetch("/api/ceintures/reinitialiser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domaine: domaine.code,
          idx,
          eleve_id: eleve.eleveId ?? undefined,
          rb_eleve_id: eleve.rbEleveId ?? undefined,
          effacer_resultats: true,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.erreur ?? "Réinitialisation impossible");
      setMessage(
        `${eleve.prenom} — ${quoi} réinitialisé, ` +
        `${json.nb_resultats} compétence(s) redevenue(s) à faire.`,
      );
      await charger(niveau);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur");
    } finally {
      setEnCours(null);
    }
  }

  return (
    <div style={{ padding: "24px 20px 80px", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{
        fontSize: 24, fontWeight: 800, margin: "0 0 4px",
        fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--pb-on-surface)",
      }}>
        🥋 Ceintures de compétences
      </h1>
      <p style={{ fontSize: 13, color: "var(--pb-on-surface-variant)", margin: "0 0 18px" }}>
        La couleur en cours de chaque élève, domaine par domaine. Clique sur une
        ligne pour voir le détail et réinitialiser un test de départ.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {NIVEAUX.map((n) => (
          <button
            key={n}
            onClick={() => setNiveau(n)}
            style={{
              padding: "7px 16px", borderRadius: 999, cursor: "pointer",
              fontSize: 13, fontWeight: 700,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              border: niveau === n ? "none" : "1.5px solid var(--pb-outline-variant, #ddd)",
              background: niveau === n ? "var(--pb-primary)" : "white",
              color: niveau === n ? "white" : "var(--pb-on-surface-variant)",
            }}
          >
            {n === "tous" ? "Tous" : n}
          </button>
        ))}
      </div>

      {message && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, marginBottom: 14,
          background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
          fontSize: 13, color: "#166534",
        }}>
          {message}
        </div>
      )}

      {erreur && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, marginBottom: 14,
          background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)",
          fontSize: 13, color: "#991B1B",
        }}>
          {erreur}
        </div>
      )}

      {chargement ? (
        <div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 42, borderRadius: 10, marginBottom: 8 }} />
          ))}
        </div>
      ) : eleves.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--pb-on-surface-variant)" }}>
          Aucun élève pour ce niveau.
        </p>
      ) : (
        <GrilleClasse
          eleves={eleves}
          domaines={domaines}
          couleurs={couleurs}
          ouvert={ouvert}
          enCours={enCours}
          onOuvrir={(uid) => setOuvert(ouvert === uid ? null : uid)}
          onReinitialiser={reinitialiser}
        />
      )}

      <p style={{ fontSize: 12, color: "var(--pb-on-surface-variant)", marginTop: 18 }}>
        La progression se déduit des évaluations réussies : rien n&apos;est stocké,
        rien ne peut se désynchroniser.
      </p>
    </div>
  );
}
