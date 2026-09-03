"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EleveSession } from "@/hooks/useEleveSession";
import type { EtatReprise } from "@/lib/reprise";

/**
 * Sauvegarder un exercice en cours, et le retrouver.
 *
 * Le contrat tient en trois points :
 *  • `pret` passe à vrai quand on SAIT s'il y a une reprise — la page attend
 *    ce moment pour se construire, sinon elle affiche la question 1 avant de
 *    sauter à la question 5, ce qui donne un clignotement désagréable ;
 *  • `etatRepris` ne contient jamais un état périmé : l'empreinte est vérifiée
 *    ici, une seule fois, et un contenu qui a changé annule la reprise ;
 *  • `sauver()` est groupé dans le temps et ne remonte JAMAIS d'erreur. Un
 *    élève au milieu d'un exercice ne doit pas être interrompu parce que le
 *    réseau a hoqueté : il perd sa reprise, pas son exercice.
 *
 * La sauvegarde est aussi forcée quand la page se cache — c'est précisément
 * le moment où l'on coupe un élève, et le `setTimeout` groupé n'aurait pas le
 * temps de partir.
 */

/** Délai de groupement : assez court pour ne rien perdre, assez long pour ne pas marteler la base. */
const GROUPEMENT_MS = 700;

interface Options {
  /** Ce qui est en cours : voir `cleExercice()` / `cleEvaluation()` / `cleActivite()`. */
  cle: string | null;
  /** L'empreinte du contenu affiché. Une reprise d'une autre empreinte est jetée. */
  empreinte: string | null;
  session: EleveSession | null;
}

export function useReprise({ cle, empreinte, session }: Options) {
  const [etatRepris, setEtatRepris] = useState<EtatReprise | null>(null);
  const [pret, setPret] = useState(false);

  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enAttente = useRef<EtatReprise | null>(null);
  const efface = useRef(false);

  const url = useCallback(() => {
    if (!cle || !session) return null;
    const qui = session.source === "planbox"
      ? `eleve_id=${encodeURIComponent(session.id)}`
      : `rb_eleve_id=${encodeURIComponent(session.id)}`;
    return `/api/reprise?cle=${encodeURIComponent(cle)}&${qui}`;
  }, [cle, session]);

  // ── Chargement, une fois que la clé ET l'empreinte sont connues ──────────
  useEffect(() => {
    const lien = url();
    if (!lien || !empreinte) return;

    let annule = false;
    setPret(false);

    (async () => {
      try {
        const r = await fetch(lien);
        const json = await r.json();
        const etat = json?.etat as EtatReprise | null;
        // Le contenu a changé depuis : les réponses ne se rapportent plus aux
        // mêmes questions, on repart de zéro plutôt que de mentir à l'élève.
        if (!annule) setEtatRepris(etat && etat.empreinte === empreinte ? etat : null);
      } catch {
        if (!annule) setEtatRepris(null);
      } finally {
        if (!annule) setPret(true);
      }
    })();

    return () => { annule = true; };
  }, [url, empreinte]);

  // ── Envoi ───────────────────────────────────────────────────────────────
  const envoyer = useCallback(async (etat: EtatReprise) => {
    const lien = url();
    if (!lien || efface.current) return;
    try {
      await fetch(lien, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etat }),
      });
    } catch {
      /* Le réseau a lâché : l'élève continue, il perd seulement sa reprise. */
    }
  }, [url]);

  /** Enregistre l'état courant. Groupé : le dernier appel gagne. */
  const sauver = useCallback((etat: EtatReprise) => {
    if (efface.current) return;
    enAttente.current = etat;
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => {
      const e = enAttente.current;
      enAttente.current = null;
      if (e) void envoyer(e);
    }, GROUPEMENT_MS);
  }, [envoyer]);

  /** L'exercice est fini : il n'y a plus rien à reprendre. */
  const effacer = useCallback(async () => {
    efface.current = true;
    if (minuterie.current) clearTimeout(minuterie.current);
    enAttente.current = null;
    const lien = url();
    if (!lien) return;
    try {
      await fetch(lien, { method: "DELETE" });
    } catch {
      /* Au pire la reprise survit et sera jetée par l'âge. */
    }
  }, [url]);

  // ── La page se ferme : on force ce qui attendait ─────────────────────────
  //
  // `sendBeacon` est le seul envoi qui survive à la fermeture d'un onglet.
  // Il emporte les cookies, donc l'authentification de la route est respectée.
  useEffect(() => {
    function vider() {
      const e = enAttente.current;
      const lien = url();
      if (!e || !lien || efface.current) return;
      enAttente.current = null;
      if (minuterie.current) clearTimeout(minuterie.current);
      try {
        const corps = new Blob([JSON.stringify({ etat: e })], { type: "application/json" });
        if (!navigator.sendBeacon?.(lien, corps)) void envoyer(e);
      } catch {
        void envoyer(e);
      }
    }

    // `pagehide` couvre la fermeture et le retour arrière ; `visibilitychange`
    // couvre le passage à une autre application, cas le plus fréquent sur
    // tablette — l'élève ne ferme pas l'onglet, il pose la tablette.
    const surVisibilite = () => { if (document.visibilityState === "hidden") vider(); };
    window.addEventListener("pagehide", vider);
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      window.removeEventListener("pagehide", vider);
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, [url, envoyer]);

  // Le minuteur ne doit pas survivre au démontage.
  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current); }, []);

  return { etatRepris, pret, sauver, effacer };
}
