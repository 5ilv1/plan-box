"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Etat = "chargement" | "redirection" | "erreur";

export default function PageQRLogin() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [etat, setEtat] = useState<Etat>("chargement");
  const [messageErreur, setMessageErreur] = useState("");

  useEffect(() => {
    if (!token) return;

    async function verifier() {
      const res = await fetch("/api/qr-login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const json = await res.json();

      if (!res.ok || json.erreur) {
        setMessageErreur(json.erreur ?? "QR code invalide.");
        setEtat("erreur");
        return;
      }

      setEtat("redirection");
      // Rediriger vers le magic link — Supabase gère la session et redirige vers /eleve/dashboard
      window.location.href = json.actionLink;
    }

    verifier();
  }, [token, router]);

  if (etat === "chargement") {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "var(--bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "3px solid var(--primary-mid)",
            borderTopColor: "var(--primary)",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>Connexion en cours…</p>
      </div>
    );
  }

  if (etat === "redirection") {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "var(--bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 48 }}>✅</div>
        <p style={{ color: "var(--text)", fontWeight: 600 }}>Connexion réussie, redirection…</p>
      </div>
    );
  }

  // Erreur
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        className="card"
        style={{ maxWidth: 400, textAlign: "center", padding: "40px 24px" }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>📵</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>
          QR code invalide
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24 }}>
          {messageErreur}
        </p>
        <Link href="/eleve" className="btn-primary" style={{ display: "inline-block" }}>
          Se connecter manuellement
        </Link>
      </div>
    </div>
  );
}
