"use client";

import { useEffect } from "react";

/**
 * Détecte les erreurs de chargement de chunks JS après un déploiement
 * (hashes de fichiers ayant changé pendant que la page était ouverte)
 * et force un hard reload pour récupérer le nouveau HTML.
 *
 * Principaux symptômes corrigés :
 *  - « Failed to fetch dynamically imported module » (Safari, Chrome)
 *  - « Loading chunk X failed » (webpack/turbopack)
 *  - « ChunkLoadError »
 *
 * Limite le nombre de reloads automatiques (sessionStorage) pour éviter
 * les boucles infinies si l'erreur vient d'ailleurs.
 */
export default function ChunkErrorHandler() {
  useEffect(() => {
    const estErreurChunk = (msg: string) => {
      if (!msg) return false;
      const m = msg.toLowerCase();
      return (
        m.includes("failed to fetch dynamically imported module") ||
        m.includes("loading chunk") ||
        m.includes("chunkloaderror") ||
        m.includes("importing a module script failed") ||
        m.includes("error loading") && m.includes(".js")
      );
    };

    const rechargerSiBesoin = (raison: string) => {
      const cle = "pb_chunk_reload_count";
      const n = parseInt(sessionStorage.getItem(cle) ?? "0", 10);
      if (n >= 2) {
        console.error("[ChunkErrorHandler] Reload déjà tenté 2x, on abandonne.", raison);
        return;
      }
      sessionStorage.setItem(cle, String(n + 1));
      console.warn("[ChunkErrorHandler] Erreur de chunk détectée → reload :", raison);
      window.location.reload();
    };

    const onError = (e: ErrorEvent) => {
      if (estErreurChunk(e.message) || estErreurChunk(e.error?.toString() ?? "")) {
        rechargerSiBesoin(e.message);
      }
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message ?? e.reason?.toString() ?? "";
      if (estErreurChunk(msg)) rechargerSiBesoin(msg);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    // Reset du compteur après navigation réussie (après 5 s sans erreur)
    const t = setTimeout(() => sessionStorage.removeItem("pb_chunk_reload_count"), 5000);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      clearTimeout(t);
    };
  }, []);

  return null;
}
