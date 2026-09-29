"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { groupesTouchesPar, invaliderGroupes } from "@/lib/cache-eleve";

/**
 * Efface ce que le tableau de bord garde en mémoire dès que l'élève entre sur
 * une page qui peut le changer (ceintures, chapitres, bibliothèque) : en
 * revenant, il voit l'état à jour, pas celui d'avant son travail.
 */
export default function InvalidationCacheEleve() {
  const chemin = usePathname();
  useEffect(() => {
    if (!chemin) return;
    const groupes = groupesTouchesPar(chemin);
    if (groupes.length > 0) invaliderGroupes(groupes);
  }, [chemin]);
  return null;
}
