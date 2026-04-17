"use client";

import { useEffect } from "react";

/**
 * Error boundary racine : rattrape les erreurs runtime non gérées.
 * Si c'est une erreur de chargement de chunk (après déploiement),
 * on recharge automatiquement. Sinon on affiche un bouton « Recharger ».
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const msg = (error?.message ?? "").toLowerCase();
    const estChunkError =
      msg.includes("failed to fetch dynamically imported module") ||
      msg.includes("loading chunk") ||
      msg.includes("chunkloaderror") ||
      msg.includes("importing a module script failed");

    if (estChunkError) {
      const cle = "pb_chunk_reload_count";
      const n = parseInt(sessionStorage.getItem(cle) ?? "0", 10);
      if (n < 2) {
        sessionStorage.setItem(cle, String(n + 1));
        window.location.reload();
      }
    }
    // eslint-disable-next-line no-console
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        background: "var(--bg, #F7F7F8)",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          textAlign: "center",
          background: "white",
          padding: "32px 28px",
          borderRadius: 16,
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
          Oups, une erreur est survenue
        </h1>
        <p style={{ color: "#666", marginBottom: 24, fontSize: 15 }}>
          Recharge la page pour réessayer.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "12px 28px",
            borderRadius: 999,
            background: "#0050D4",
            color: "white",
            border: "none",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Recharger la page
        </button>
      </div>
    </div>
  );
}
