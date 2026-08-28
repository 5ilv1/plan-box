"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { theme } from "@bigheads/core";
import Avatar from "@/components/Avatar";
import { useEleveSession } from "@/hooks/useEleveSession";
import {
  OPTIONS,
  randomOptions,
  deterministicOptions,
  sanitizeOptions,
  type BigHeadsOptions,
} from "@/lib/bigheads";

// Libellés français de chaque réglage et de chaque valeur.
const LABELS: Record<keyof typeof OPTIONS, string> = {
  skinTone: "Peau",
  hair: "Cheveux",
  hairColor: "Couleur des cheveux",
  eyes: "Yeux",
  mouth: "Bouche",
  clothing: "Vêtements",
  clothingColor: "Couleur des vêtements",
  accessory: "Lunettes",
  hat: "Chapeau",
};

const VALUE_LABELS: Record<string, string> = {
  // cheveux
  none: "Aucun", short: "Courts", long: "Longs", bun: "Chignon",
  pixie: "Pixie", buzz: "Rasés", afro: "Afro", bob: "Carré",
  // yeux
  normal: "Normaux", happy: "Joyeux", content: "Content", squint: "Plissés",
  simple: "Simples", wink: "Clin d'œil", heart: "Cœurs",
  // bouche
  grin: "Sourire", openSmile: "Grand sourire", lips: "Lèvres",
  open: "Bouche ouverte", serious: "Sérieux", tongue: "Langue",
  // vêtements
  shirt: "T-shirt", dressShirt: "Chemise", vneck: "Col V",
  tankTop: "Débardeur", dress: "Robe",
  // lunettes
  roundGlasses: "Rondes", tinyGlasses: "Fines", shades: "Soleil",
  // chapeau
  beanie: "Bonnet", turban: "Turban",
};

/** Champs affichés en pastilles de couleur ; le reste en boutons texte. */
const COLOR_FIELDS = new Set(["skinTone", "hairColor", "clothingColor"]);

function couleurPour(field: string, value: string): string {
  const c = theme.colors;
  if (field === "skinTone") return (c.skin as Record<string, { base: string }>)[value]?.base ?? "#ccc";
  if (field === "hairColor") return (c.hair as Record<string, { base: string }>)[value]?.base ?? "#ccc";
  if (field === "clothingColor") return (c.clothing as Record<string, { base: string }>)[value]?.base ?? "#ccc";
  return "#ccc";
}

const FIELDS = Object.keys(OPTIONS) as (keyof typeof OPTIONS)[];

/** Même clé que `hooks/useEleveSession` — le cache doit refléter le nouvel avatar. */
const SESSION_CACHE_KEY = "pb_eleve_session_v2";

export default function CustomiseurAvatar() {
  const { session, chargement } = useEleveSession();
  const router = useRouter();
  const [options, setOptions] = useState<BigHeadsOptions | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Avatar déjà créé → écran d'édition ; sinon onboarding de première connexion.
  const dejaCree = useMemo(
    () => sanitizeOptions(session?.avatar_bigheads) !== null,
    [session],
  );

  useEffect(() => {
    if (chargement) return;
    if (!session) { router.push("/eleve"); return; }
    if (!options) {
      setOptions(sanitizeOptions(session.avatar_bigheads) ?? deterministicOptions(session.prenom));
    }
  }, [session, chargement, router, options]);

  function setField<K extends keyof BigHeadsOptions>(field: K, value: BigHeadsOptions[K]) {
    setOptions((o) => (o ? { ...o, [field]: value } : o));
  }

  async function enregistrer() {
    if (!options) return;
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch("/api/eleve/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ options }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErreur(body.error || "Impossible d'enregistrer. Réessaie.");
        setEnCours(false);
        return;
      }
      // Cache de session mis à jour : le tableau de bord affiche le nouvel
      // avatar sans attendre, et ne redéclenche pas l'onboarding.
      try {
        sessionStorage.setItem(
          SESSION_CACHE_KEY,
          JSON.stringify({ ...session, avatar_bigheads: options }),
        );
      } catch { /* quota plein → ignorer */ }
      window.location.href = "/eleve/dashboard";
    } catch {
      setErreur("Impossible d'enregistrer. Réessaie.");
      setEnCours(false);
    }
  }

  if (chargement || !options || !session) {
    return (
      <main className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ color: "var(--pb-on-surface-variant)" }}>Chargement…</div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 760, margin: "0 auto", padding: "1.5rem 1rem 3rem" }}>

        <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
          <h1 style={{
            fontSize: "1.5rem", fontWeight: 800, margin: 0,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            color: "var(--pb-on-surface)",
          }}>
            {dejaCree ? "Personnalise ton avatar 🎨" : `Bienvenue ${session.prenom} ! 🎨`}
          </h1>
          <p style={{ color: "var(--pb-on-surface-variant)", marginTop: "0.35rem" }}>
            {dejaCree ? "Change ton avatar comme tu veux." : "Crée ton avatar pour commencer."}
          </p>
        </div>

        {/* Aperçu */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <Avatar options={options} seed={session.prenom} size={180} style={{ boxShadow: "0 6px 24px rgba(0,0,0,0.12)" }} />
          <button
            type="button"
            onClick={() => setOptions(randomOptions())}
            className="pb-btn"
            style={{ borderRadius: 999, padding: "0.5rem 1.1rem", fontSize: "0.9rem", fontWeight: 600 }}
          >
            🎲 Surprise !
          </button>
        </div>

        {/* Réglages */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          {FIELDS.map((field) => {
            const values = OPTIONS[field] as readonly string[];
            const isColor = COLOR_FIELDS.has(field);
            return (
              <div key={field}>
                <div style={{
                  fontSize: "0.8rem", fontWeight: 700, color: "var(--pb-on-surface-variant)",
                  textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "0.5rem",
                }}>
                  {LABELS[field]}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {values.map((value) => {
                    const selected = options[field] === value;
                    if (isColor) {
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-label={VALUE_LABELS[value] ?? value}
                          aria-pressed={selected}
                          onClick={() => setField(field, value as never)}
                          style={{
                            width: 38, height: 38, borderRadius: "50%",
                            background: couleurPour(field, value),
                            border: selected ? "3px solid var(--pb-primary)" : "3px solid transparent",
                            boxShadow: "0 0 0 1px var(--border)",
                            cursor: "pointer", padding: 0,
                          }}
                        />
                      );
                    }
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setField(field, value as never)}
                        style={{
                          borderRadius: 12, padding: "0.45rem 0.8rem",
                          fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
                          border: `2px solid ${selected ? "var(--pb-primary)" : "var(--border)"}`,
                          background: selected ? "var(--pb-primary-container)" : "var(--card, #fff)",
                          color: "var(--pb-on-surface)",
                          fontFamily: "inherit",
                        }}
                      >
                        {VALUE_LABELS[value] ?? value}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {erreur && (
          <p style={{ color: "#DC2626", textAlign: "center", marginTop: "1rem", fontWeight: 600 }}>{erreur}</p>
        )}

        <div style={{
          display: "flex", justifyContent: "center", gap: "0.75rem",
          marginTop: "1.75rem", position: "sticky", bottom: "1rem",
        }}>
          {dejaCree && (
            <button
              type="button"
              onClick={() => router.push("/eleve/dashboard")}
              disabled={enCours}
              className="pb-btn"
              style={{ borderRadius: 999, padding: "0.75rem 1.5rem", fontSize: "1rem", fontWeight: 600 }}
            >
              ← Retour
            </button>
          )}
          <button
            type="button"
            onClick={enregistrer}
            disabled={enCours}
            className="btn-primary"
            style={{ padding: "0.75rem 2rem", fontSize: "1rem", fontWeight: 700, opacity: enCours ? 0.6 : 1 }}
          >
            {enCours ? "Enregistrement…" : dejaCree ? "Enregistrer" : "C'est parti !"}
          </button>
        </div>
      </div>
    </main>
  );
}
