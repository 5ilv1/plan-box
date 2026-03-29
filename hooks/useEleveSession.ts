"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

// Session unifiée — même interface peu importe la source
export interface EleveSession {
  id: string;            // UUID pour Plan Box, string d'entier pour Repetibox
  prenom: string;
  nom: string;
  source: "planbox" | "repetibox";
}

/**
 * useEleveSession()
 *
 * Abstrait les deux sources de session élève :
 * 1. Supabase Auth + table "eleves" (Plan Box natif)
 * 2. Supabase Auth + email "@planbox.local" (Repetibox migré — identifiant@planbox.local)
 *
 * Aucun accès à localStorage.
 */
export function useEleveSession() {
  const [session, setSession] = useState<EleveSession | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function resoudreUser(user: import("@supabase/supabase-js").User) {
      // 1. Plan Box natif — chercher dans la table "eleves"
      const { data: e } = await supabase
        .from("eleves")
        .select("prenom, nom")
        .eq("id", user.id)
        .maybeSingle();

      if (e) {
        setSession({
          id: user.id,
          prenom: e.prenom as string,
          nom: e.nom as string,
          source: "planbox",
        });
        setChargement(false);
        return;
      }

      // 2. Repetibox migré — email au format identifiant@planbox.local
      if (user.email?.endsWith("@planbox.local")) {
        const res = await fetch(`/api/repetibox-eleve-by-auth?auth_id=${encodeURIComponent(user.id)}`);
        if (res.ok) {
          const json = await res.json();
          setSession({
            id: String(json.id),
            prenom: json.prenom as string,
            nom: json.nom as string,
            source: "repetibox",
          });
          setChargement(false);
          return;
        }
      }

      // Authentifié mais non reconnu → déconnecter pour éviter la boucle
      await supabase.auth.signOut();
      setSession(null);
      setChargement(false);
    }

    // onAuthStateChange capte à la fois la session existante (INITIAL_SESSION)
    // et la session établie depuis le hash du magic link (SIGNED_IN)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, authSession) => {
      if (authSession?.user) {
        await resoudreUser(authSession.user);
      } else {
        setSession(null);
        setChargement(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function effacerSession() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setSession(null);
  }

  return { session, chargement, effacerSession };
}
