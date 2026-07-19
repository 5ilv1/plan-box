"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { BigHeadsOptions } from "@/lib/bigheads";

export interface EleveSession {
  id: string;
  prenom: string;
  nom: string;
  source: "planbox" | "repetibox";
  // Avatar BigHeads (élèves Repetibox uniquement). null = pas d'avatar → initiales.
  avatar_bigheads?: BigHeadsOptions | null;
}

// v2 : ajout de avatar_bigheads → on invalide les sessions cachées d'avant.
const SESSION_CACHE_KEY = "pb_eleve_session_v2";

function lireSessionCachee(): EleveSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EleveSession;
    if (parsed.id && parsed.prenom && parsed.source) return parsed;
    return null;
  } catch {
    return null;
  }
}

function ecrireSessionCache(s: EleveSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (s) sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    /* quota plein → ignorer */
  }
}

export function useEleveSession() {
  // Hydratation SYNCHRONE depuis le cache au 1er render → pas de loader
  // quand l'élève revient sur une page après avoir navigué ailleurs.
  const [session, setSession] = useState<EleveSession | null>(() => lireSessionCachee());
  const [chargement, setChargement] = useState<boolean>(() => !lireSessionCachee());

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
          const s: EleveSession = { id: user.id, prenom: e.prenom as string, nom: e.nom as string, source: "planbox", avatar_bigheads: null };
          setSession(s);
          ecrireSessionCache(s);
          setChargement(false);
          return;
        }

        // 2. Repetibox migré (@planbox.local)
        if (user.email?.endsWith("@planbox.local")) {
          const res = await fetch(`/api/repetibox-eleve-by-auth?auth_id=${encodeURIComponent(user.id)}`);
          if (!annule && res.ok) {
            const json = await res.json();
            const s: EleveSession = { id: String(json.id), prenom: json.prenom as string, nom: json.nom as string, source: "repetibox", avatar_bigheads: json.avatar_bigheads ?? null };
            setSession(s);
            ecrireSessionCache(s);
            setChargement(false);
            return;
          }
        }

        if (!annule) {
          // Authentifié mais non reconnu → déconnecter (cet appareil uniquement :
          // un signOut global révoquerait les sessions sur tous les appareils)
          await supabase.auth.signOut({ scope: "local" });
          setSession(null);
          ecrireSessionCache(null);
          setChargement(false);
        }
      } catch (err) {
        console.error("[useEleveSession] erreur resoudreUser:", err);
        if (!annule) {
          setSession(null);
          ecrireSessionCache(null);
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
        ecrireSessionCache(null);
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
        ecrireSessionCache(null);
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
        ecrireSessionCache(null);
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
    // scope "local" : déconnecte cet appareil seulement. Le défaut ("global")
    // révoquait TOUTES les sessions de l'élève — y compris sur les autres
    // appareils et sur Repetibox — d'où des dashboards cassés (API en 401,
    // ceintures/calcul/problème masqués) sans aucun message.
    try {
      await Promise.race([
        supabase.auth.signOut({ scope: "local" }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("signOut timeout")), 3000)),
      ]);
    } catch (err) {
      console.warn("[effacerSession] signOut échoué ou timeout:", err);
    }
    setSession(null);
    ecrireSessionCache(null);
  }

  return { session, chargement, effacerSession };
}
