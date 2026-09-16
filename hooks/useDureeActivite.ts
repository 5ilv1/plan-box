"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Chronomètre le temps réellement passé sur une activité.
 *
 * Ne compte que pendant que l'onglet est **visible** : une tablette posée
 * ouverte pendant la récréation ne doit pas transformer un exercice de trois
 * minutes en exercice d'une heure. C'est cette précaution qui rend la mesure
 * exploitable pour repérer le travail expédié — sans elle, la durée ne
 * signifierait rien.
 *
 * Même approche que `calcul-du-jour` (`temps_reponse`) et les ceintures de
 * multiplication (`temps_ms`) : horloge côté client, valeur envoyée au serveur.
 *
 * @param actif  Démarre le chronomètre. Le passer à `false` met en pause.
 */
export function useDureeActivite(actif: boolean) {
  const cumulMs = useRef(0);
  const depuis = useRef<number | null>(null);

  const arreter = useCallback(() => {
    if (depuis.current === null) return;
    cumulMs.current += Date.now() - depuis.current;
    depuis.current = null;
  }, []);

  const demarrer = useCallback(() => {
    if (depuis.current !== null) return;
    depuis.current = Date.now();
  }, []);

  useEffect(() => {
    if (!actif) { arreter(); return; }

    if (typeof document === "undefined" || document.visibilityState === "visible") demarrer();

    function surVisibilite() {
      if (document.visibilityState === "visible") demarrer();
      else arreter();
    }
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      document.removeEventListener("visibilitychange", surVisibilite);
      arreter();
    };
  }, [actif, demarrer, arreter]);

  /** Secondes actives écoulées. Peut être appelé sans arrêter le chronomètre. */
  return useCallback(() => {
    const enCours = depuis.current === null ? 0 : Date.now() - depuis.current;
    return Math.round((cumulMs.current + enCours) / 1000);
  }, []);
}
