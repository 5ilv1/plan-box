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
    async function detecter() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
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
      }

      // Utilisateur authentifié Supabase mais non reconnu dans aucune table :
      // on le déconnecte pour éviter la boucle de redirection entre /eleve et /eleve/dashboard
      if (user) {
        await supabase.auth.signOut();
      }
      setSession(null);
      setChargement(false);
    }

    detecter();
  }, []);

  async function effacerSession() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setSession(null);
  }

  return { session, chargement, effacerSession };
}
