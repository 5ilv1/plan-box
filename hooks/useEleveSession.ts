"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

export interface EleveSession {
  id: string;
  prenom: string;
  nom: string;
  source: "planbox" | "repetibox";
}

export function useEleveSession() {
  const [session, setSession] = useState<EleveSession | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let annule = false;

    async function resoudreUser(user: import("@supabase/supabase-js").User) {
      try {
        console.log("[useEleveSession] resoudreUser pour", user.id, user.email);
        // 1. Plan Box natif
        const { data: e, error: errEleve } = await supabase
          .from("eleves")
          .select("prenom, nom")
          .eq("id", user.id)
          .maybeSingle();

        console.log("[useEleveSession] requête eleves →", e ? "trouvé" : "null", errEleve ? `err: ${errEleve.message}` : "ok", "annule:", annule);
        if (annule) return;

        if (errEleve) {
          console.error("[useEleveSession] erreur requête eleves:", errEleve.message);
        }

        if (e) {
          setSession({ id: user.id, prenom: e.prenom as string, nom: e.nom as string, source: "planbox" });
          setChargement(false);
          console.log("[useEleveSession] ✅ session PB définie, chargement=false");
          return;
        }

        // 2. Repetibox migré (@planbox.local)
        if (user.email?.endsWith("@planbox.local")) {
          const res = await fetch(`/api/repetibox-eleve-by-auth?auth_id=${encodeURIComponent(user.id)}`);
          if (!annule && res.ok) {
            const json = await res.json();
            setSession({ id: String(json.id), prenom: json.prenom as string, nom: json.nom as string, source: "repetibox" });
            setChargement(false);
            return;
          }
        }

        if (!annule) {
          // Authentifié mais non reconnu → déconnecter
          await supabase.auth.signOut();
          setSession(null);
          setChargement(false);
        }
      } catch (err) {
        console.error("[useEleveSession] erreur resoudreUser:", err);
        if (!annule) {
          setSession(null);
          setChargement(false);
        }
      }
    }

    // Vérification initiale rapide via getUser()
    console.log("[useEleveSession] démarrage getUser...");
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      console.log("[useEleveSession] getUser résolu, user:", user?.id ?? "null", "annule:", annule);
      if (annule) return;
      if (user) {
        await resoudreUser(user);
      } else {
        setSession(null);
        setChargement(false);
      }
    }).catch((err) => {
      console.error("[useEleveSession] erreur getUser:", err);
      if (!annule) {
        setSession(null);
        setChargement(false);
      }
    });

    // Écouter SIGNED_IN (QR, connexion manuelle) et SIGNED_OUT
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, authSession) => {
      console.log("[useEleveSession] onAuthStateChange:", event, "annule:", annule);
      if (annule) return;
      if (event === "SIGNED_IN" && authSession?.user) {
        await resoudreUser(authSession.user);
      } else if (event === "SIGNED_OUT") {
        setSession(null);
        setChargement(false);
      }
    });

    return () => {
      annule = true;
      subscription.unsubscribe();
    };
  }, []);

  async function effacerSession() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setSession(null);
  }

  return { session, chargement, effacerSession };
}
