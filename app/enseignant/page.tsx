"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

export default function ConnexionEnseignant() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur("");
    setChargement(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: motDePasse,
    });

    if (error) {
      setErreur("Identifiants incorrects. Vérifie ton email et ton mot de passe.");
      setChargement(false);
      return;
    }

    router.push("/enseignant/dashboard");
  }

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
            Espace enseignant
          </h1>
          <p className="text-secondary text-sm" style={{ marginTop: 4 }}>
            Accède au tableau de bord de ta classe
          </p>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="enseignant@ecole.fr"
              required
              autoFocus
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
              required
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
            type="submit"
            className="btn-primary w-full"
            disabled={chargement}
            style={{ marginTop: 8 }}
          >
            {chargement ? "Connexion…" : "Se connecter"}
          </button>
        </form>

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
