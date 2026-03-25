"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

export default function ConnexionEleve() {
  const router = useRouter();

  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);
  const [verification, setVerification] = useState(true);

  // Redirection automatique si déjà connecté
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.replace("/eleve/dashboard");
      } else {
        setVerification(false);
      }
    });
  }, [router]);

  async function handleConnexion() {
    setErreur("");
    setChargement(true);

    const supabase = createClient();

    // Essai 1 : connexion Plan Box natif (email réel)
    let { error } = await supabase.auth.signInWithPassword({
      email: identifiant,
      password: motDePasse,
    });

    // Essai 2 : connexion Repetibox migré (identifiant@planbox.local)
    if (error && !identifiant.includes("@")) {
      const res = await supabase.auth.signInWithPassword({
        email: `${identifiant}@planbox.local`,
        password: motDePasse,
      });
      error = res.error;
    }

    if (error) {
      setErreur("Identifiant ou mot de passe incorrect.");
      setChargement(false);
      return;
    }

    router.push("/eleve/dashboard");
  }

  if (verification) return null;

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
      <div className="card" style={{ width: "100%", maxWidth: 420 }}>
        {/* En-tête */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              margin: "0 auto 14px",
            }}
          >
            <img src="/planbox-mascotte.png" alt="Plan Box" width={56} height={56} style={{ objectFit: "contain" }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>
            Espace élève
          </h1>
        </div>

        {/* Formulaire */}
        <div className="form-group">
          <label className="form-label">Identifiant</label>
          <input
            type="text"
            className="form-input"
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
            placeholder="Email ou identifiant"
            autoFocus
            autoComplete="username"
            disabled={chargement}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Mot de passe</label>
          <input
            type="password"
            className="form-input"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={chargement}
            onKeyDown={(e) => {
              if (e.key === "Enter" && identifiant && motDePasse) handleConnexion();
            }}
          />
        </div>

        {erreur && (
          <div
            style={{
              backgroundColor: "#FEE2E2",
              color: "#DC2626",
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {erreur}
          </div>
        )}

        <button
          type="button"
          className="btn-primary w-full"
          onClick={handleConnexion}
          disabled={chargement || !identifiant || !motDePasse}
          style={{ marginTop: 4 }}
        >
          {chargement ? "Connexion…" : "Se connecter"}
        </button>

        {/* Lien retour */}
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <Link href="/" className="text-sm text-secondary">
            ← Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
