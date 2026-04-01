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
    // Flag : getUser() initial terminé. Tant qu'il tourne, on ignore
    // les événements onAuthStateChange pour éviter un deadlock sur le
    // verrou interne du client Supabase (getUser rafraîchit le token →
    // tient le lock → une requête DB lancée en parallèle attend ce lock).
    let initialResolu = false;
    // File d'attente : si onAuthStateChange fire SIGNED_IN avant que
    // getUser ait terminé, on stocke le user et on le traite après.
    let pendingUser: import("@supabase/supabase-js").User | null = null;

    async function resoudreUser(user: import("@supabase/supabase-js").User) {
      try {
        // 1. Plan Box natif
        const { data: e } = await supabase
          .from("eleves")
          .select("prenom, nom")
          .eq("id", user.id)
          .maybeSingle();

        if (annule) return;

        if (e) {
          setSession({ id: user.id, prenom: e.prenom as string, nom: e.nom as string, source: "planbox" });
          setChargement(false);
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

    // ── Vérification initiale via getSession (local, instantané) + getUser ──
    // getSession() lit le cache local sans réseau → pas de lock.
    // On l'utilise pour avoir le user immédiatement, puis on valide avec getUser().
    supabase.auth.getSession().then(async ({ data: { session: authSession } }) => {
      if (annule) return;

      const user = authSession?.user;
      if (user) {
        await resoudreUser(user);
      } else {
        // Pas de session en cache → pas connecté
        setSession(null);
        setChargement(false);
      }

      initialResolu = true;

      // Si onAuthStateChange a envoyé un user pendant qu'on traitait, on le traite maintenant
      if (pendingUser && !annule) {
        await resoudreUser(pendingUser);
        pendingUser = null;
      }
    }).catch((err) => {
      console.error("[useEleveSession] erreur getSession:", err);
      if (!annule) {
        setSession(null);
        setChargement(false);
      }
      initialResolu = true;
    });

    // ── Écouter les changements d'auth ultérieurs ──
    // (QR code, connexion manuelle, déconnexion)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, authSession) => {
      if (annule) return;

      if (event === "SIGNED_IN" && authSession?.user) {
        if (!initialResolu) {
          // getSession() est encore en cours → stocker pour plus tard
          pendingUser = authSession.user;
          return;
        }
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
    // signOut peut parfois pendre (lock interne, réseau) → timeout 3s
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("signOut timeout")), 3000)),
      ]);
    } catch (err) {
      console.warn("[effacerSession] signOut échoué ou timeout:", err);
    }
    setSession(null);
  }

  return { session, chargement, effacerSession };
}
