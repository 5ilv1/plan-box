"use client";

import { useEffect } from "react";
import Link from "next/link";
import MotusJeu from "@/components/MotusJeu";
import { invaliderMotusCache } from "@/components/MotusCarte";

const THEME_COLOR = "#4C5A3A";

export default function MotusPage() {
  // Au retour au tableau de bord, la carte doit refléter la partie qu'on
  // vient de jouer, pas l'état chargé à l'arrivée sur le dashboard.
  useEffect(() => invaliderMotusCache, []);

  return (
    <div className="eleve-page" style={{ background: "#F3F3F0" }}>
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 20px",
      }}>
        <Link href="/eleve/dashboard" style={{
          display: "flex", alignItems: "center", gap: 6,
          color: THEME_COLOR, fontWeight: 600, fontSize: 14,
          textDecoration: "none", padding: "6px 10px", borderRadius: 12,
          fontFamily: "Manrope, sans-serif",
        }}>
          <span className="ms" style={{ fontSize: 20 }}>arrow_back</span>
          Retour
        </Link>
        <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 17, color: "var(--pb-on-surface)" }}>
          Motus
        </span>
        <div style={{ width: 60 }} />
      </nav>

      <main style={{
        maxWidth: 900, margin: "0 auto", padding: "1.5rem 1rem 6rem",
        display: "flex", flexDirection: "column", alignItems: "center",
      }}>
        <header style={{ textAlign: "center", marginBottom: 20 }}>
          <h1 style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "clamp(1.9rem, 6vw, 2.4rem)",
            fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
            color: "var(--pb-on-surface)", margin: 0,
          }}>
            Motus
          </h1>
          <p style={{ color: "var(--pb-on-surface-variant)", fontSize: 14, marginTop: 6 }}>
            Le mot du jour — devine-le, lettre par lettre.
          </p>
        </header>

        <MotusJeu />
      </main>
    </div>
  );
}
