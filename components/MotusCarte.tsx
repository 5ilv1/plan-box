"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { EtatPartie } from "@/lib/motus";

/**
 * Aperçu du Motus du jour : la carte posée à droite du « Bonjour » (variante
 * `hero`) et sa jumelle dans le bento sur petit écran (variante `bento`).
 *
 * Les deux variantes sont montées en même temps — l'une ou l'autre est masquée
 * en CSS selon la largeur — d'où la promesse partagée : un seul appel réseau.
 */

let promesseEtat: Promise<EtatPartie | { aucun_mot: true }> | null = null;

function chargerEtat() {
  if (!promesseEtat) {
    promesseEtat = fetch("/api/motus").then((r) => r.json());
  }
  return promesseEtat;
}

/** À appeler au retour du jeu pour que la carte ne reste pas sur l'état d'avant. */
export function invaliderMotusCache() {
  promesseEtat = null;
}

function Tuiles({ etat }: { etat: EtatPartie }) {
  const lettres = etat.termine && etat.mot ? etat.mot.split("") : [];
  return (
    <div className="motus-mini">
      {Array.from({ length: etat.longueur }).map((_, i) => {
        const revelee = lettres[i] ?? (i === 0 ? etat.premiere_lettre : "");
        return (
          <span
            key={i}
            className={`motus-mini-case${etat.termine ? (etat.trouve ? " gagnee" : " perdue") : ""}`}
          >
            {revelee}
          </span>
        );
      })}
    </div>
  );
}

export default function MotusCarte({ variant }: { variant: "hero" | "bento" }) {
  const [etat, setEtat] = useState<EtatPartie | null>(null);
  const [aucunMot, setAucunMot] = useState(false);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    let annule = false;
    chargerEtat()
      .then((json) => {
        if (annule) return;
        if ((json as { aucun_mot?: boolean })?.aucun_mot) setAucunMot(true);
        else if ((json as EtatPartie)?.longueur) setEtat(json as EtatPartie);
        setPret(true);
      })
      .catch(() => !annule && setPret(true));
    return () => {
      annule = true;
    };
  }, []);

  // Rien à annoncer tant qu'on ne sait pas, et rien du tout si la liste de
  // mots est vide : inutile d'afficher une case morte aux élèves.
  if (!pret || aucunMot || !etat) return null;

  const statut = etat.trouve
    ? `Trouvé en ${etat.essais.length} essai${etat.essais.length > 1 ? "s" : ""} 🎉`
    : etat.termine
      ? "Pas trouvé aujourd'hui"
      : etat.essais.length > 0
        ? `Essai ${etat.essais.length + 1} sur ${etat.essais_max}`
        : `Un mot de ${etat.longueur} lettres à trouver`;

  const libelleBouton = etat.termine
    ? "Voir la grille"
    : etat.essais.length > 0
      ? "Continuer →"
      : "Jouer →";

  return (
    <div className={`motus-carte motus-carte-${variant}`}>
      <div className="motus-carte-titre">Motus du jour</div>
      <Tuiles etat={etat} />
      <div className="motus-carte-statut">{statut}</div>
      <Link href="/eleve/motus" className="motus-carte-btn">
        {libelleBouton}
      </Link>
    </div>
  );
}
