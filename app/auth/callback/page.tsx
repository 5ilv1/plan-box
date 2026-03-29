"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

/**
 * Page de callback auth — gère les deux flows Supabase :
 * - Implicit flow : tokens dans le hash (#access_token=...)
 * - PKCE flow : code dans les query params (?code=...)
 *
 * Le paramètre "next" indique où rediriger après connexion.
 */
export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const searchParams = new URLSearchParams(window.location.search);
    const next = searchParams.get("next") ?? "/eleve/dashboard";
    const code = searchParams.get("code");

    if (code) {
      // PKCE flow : échanger le code contre une session
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          router.replace("/eleve?erreur=qr");
        } else {
          router.replace(next);
        }
      });
      return;
    }

    // Implicit flow : Supabase place les tokens dans le hash
    // createBrowserClient les détecte automatiquement et déclenche SIGNED_IN
    // IMPORTANT : ne pas réagir à INITIAL_SESSION(null) — les hash tokens arrivent après
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")) {
        router.replace(next);
      }
      // Pas de redirection d'erreur ici — le timeout s'en charge
    });

    // Timeout de sécurité : si aucune session après 8s, aller à la page de connexion
    const timer = setTimeout(() => {
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        if (!s) router.replace("/eleve?erreur=qr");
      });
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid var(--primary-mid)", borderTopColor: "var(--primary)", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ color: "var(--text-secondary)" }}>Connexion en cours…</p>
    </div>
  );
}
