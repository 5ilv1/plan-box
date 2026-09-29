/**
 * Un rafraîchissement périodique qui ne tourne que si l'onglet est visible.
 *
 * Chaque appel est une fonction Vercel facturée au temps de calcul, et le plan
 * gratuit a failli être épuisé fin septembre. Un onglet caché — tablette posée,
 * autre application au premier plan — n'a rien à afficher : il ne demande rien.
 * La page rattrape de toute façon au retour (`visibilitychange`).
 */
export function pollingVisible(fn: () => void, ms: number): () => void {
  const id = setInterval(() => {
    if (typeof document === "undefined" || document.visibilityState === "visible") fn();
  }, ms);
  return () => clearInterval(id);
}
