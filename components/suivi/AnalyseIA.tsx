"use client";

import { useEffect, useState } from "react";
import { EtatVide } from "./Carte";
import { ENCRE, ENCRE_DOUCE, ETAT } from "./theme-charts";

interface Analyse { forces: string[]; faiblesses: string[] }

/**
 * Trois forces, trois faiblesses, formulées par l'IA à partir des seuls
 * pourcentages par sous-domaine.
 *
 * Chargée après les chiffres et jamais bloquante : les graphes s'affichent
 * d'abord, ce texte arrive ensuite. En cas d'échec, la carte se tait — une
 * analyse absente vaut mieux qu'une analyse inventée.
 */
export default function AnalyseIA({
  domaines,
  contexte,
}: {
  domaines: Array<{ libelle: string; pourcentage: number | null }>;
  contexte: string;
}) {
  const [analyse, setAnalyse] = useState<Analyse | null>(null);
  const [chargement, setChargement] = useState(false);

  // La signature évite de relancer l'appel quand seuls des libellés changent
  // d'ordre : l'analyse coûte un aller-retour au modèle.
  const signature = domaines
    .filter((d) => d.pourcentage !== null)
    .map((d) => `${d.libelle}:${d.pourcentage}`)
    .sort()
    .join("|");

  useEffect(() => {
    if (signature.split("|").filter(Boolean).length < 3) {
      setAnalyse(null);
      return;
    }
    let vivant = true;
    setChargement(true);
    fetch("/api/enseignant/suivi/ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domaines, contexte }),
    })
      .then((r) => r.json())
      .then((j) => { if (vivant) setAnalyse(j as Analyse); })
      .catch(() => { if (vivant) setAnalyse(null); })
      .finally(() => { if (vivant) setChargement(false); });
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, contexte]);

  if (chargement) {
    return <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />;
  }
  if (!analyse || (analyse.forces.length === 0 && analyse.faiblesses.length === 0)) {
    return <EtatVide message="Il faut au moins trois sous-domaines notés pour dégager des tendances." />;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 18 }}>
      <Colonne titre="Points d'appui" items={analyse.forces} icone="trending_up" couleur={ETAT.bon} />
      <Colonne titre="À travailler" items={analyse.faiblesses} icone="priority_high" couleur={ETAT.serieux} />
    </div>
  );
}

function Colonne({
  titre, items, icone, couleur,
}: { titre: string; items: string[]; icone: string; couleur: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: ENCRE_DOUCE, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {titre}
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 7 }}>
        {items.map((t, i) => (
          <li key={i} style={{ display: "flex", gap: 7, fontSize: 13, color: ENCRE, lineHeight: 1.4 }}>
            <span className="ms" style={{ fontSize: 16, color: couleur, flexShrink: 0, marginTop: 1 }} aria-hidden>
              {icone}
            </span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
