"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

export default function Accueil() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace("/eleve/dashboard");
    });
  }, [router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      {/* Logo + titre */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            backgroundColor: "var(--primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            margin: "0 auto 20px",
            boxShadow: "0 4px 24px rgba(37,99,235,0.25)",
          }}
        >
          📋
        </div>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 800,
            color: "var(--text)",
            marginBottom: 8,
          }}
        >
          Plan Box
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 16 }}>
          Mon plan de travail numérique
        </p>
      </div>

      {/* Boutons choix de rôle */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          width: "100%",
          maxWidth: 360,
        }}
      >
        <Link href="/eleve" className="btn-primary" style={{ justifyContent: "center", padding: "18px 24px", fontSize: 16, borderRadius: 12 }}>
          <span className="ms" style={{ fontSize: 22 }}>backpack</span>
          Je suis élève
        </Link>

        <Link href="/enseignant" className="btn-secondary" style={{ justifyContent: "center", padding: "18px 24px", fontSize: 16, borderRadius: 12 }}>
          <span className="ms" style={{ fontSize: 22 }}>school</span>
          Je suis enseignant
        </Link>
      </div>

      {/* Lien Repetibox discret */}
      <div style={{ marginTop: 40, textAlign: "center" }}>
        <a
          href="/api/sso/redirect-repetibox"
          style={{ fontSize: 13, color: "var(--text-secondary)" }}
        >
          Aller sur Repetibox →
        </a>
      </div>
    </div>
  );
}
