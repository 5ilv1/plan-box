// Modèle d'options d'avatar BigHeads utilisé par le customiseur élève.
// Fichier pur (pas de React) : importable côté client (customiseur, Avatar)
// ET côté serveur (validation dans l'API). Ne dépend pas du paquet @bigheads/core.

// Champs personnalisables par l'élève, avec valeurs autorisées (adaptées aux enfants :
// on retire les options tristes/glauques comme "balding", "sad", "dizzy").
export const OPTIONS = {
  skinTone: ["light", "yellow", "brown", "dark", "red", "black"],
  hair: ["none", "short", "long", "bun", "pixie", "buzz", "afro", "bob"],
  hairColor: ["blonde", "orange", "brown", "black", "white", "blue", "pink"],
  eyes: ["normal", "happy", "content", "squint", "simple", "wink", "heart"],
  mouth: ["grin", "openSmile", "lips", "open", "serious", "tongue"],
  clothing: ["shirt", "dressShirt", "vneck", "tankTop", "dress"],
  clothingColor: ["white", "blue", "black", "green", "red"],
  accessory: ["none", "roundGlasses", "tinyGlasses", "shades"],
  hat: ["none", "beanie", "turban"],
} as const

export type BigHeadsOptions = { -readonly [K in keyof typeof OPTIONS]: (typeof OPTIONS)[K][number] }

// Props fixes (non exposées à l'élève) passées à <BigHead>.
export const FIXED = {
  eyebrows: "raised",
  facialHair: "none",
  graphic: "none",
  body: "chest",
  circleColor: "blue",
  lipColor: "pink",
  mask: false,
  faceMask: false,
  lashes: false,
} as const

const FIELDS = Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]

// Hash déterministe simple (djb2) d'une chaîne → entier positif.
function hash(str: string): number {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

// Avatar déterministe dérivé d'une graine (le prénom) : sert de défaut tant que
// l'élève n'a pas personnalisé, pour que les listes restent jolies.
export function deterministicOptions(seed: string): BigHeadsOptions {
  const s = seed || "eleve"
  const out = {} as BigHeadsOptions
  FIELDS.forEach((field, i) => {
    const values = OPTIONS[field]
    const idx = hash(s + ":" + field + ":" + i) % values.length
    ;(out as Record<string, string>)[field] = values[idx]
  })
  // On évite un défaut "chauve/sans cheveux" pour l'avatar auto.
  if (out.hair === "none") out.hair = "short"
  return out
}

// Tirage aléatoire (bouton « Surprise ! » du customiseur).
export function randomOptions(): BigHeadsOptions {
  const out = {} as BigHeadsOptions
  FIELDS.forEach((field) => {
    const values = OPTIONS[field]
    ;(out as Record<string, string>)[field] = values[Math.floor(Math.random() * values.length)]
  })
  return out
}

// Valide/nettoie des options reçues (API + init du customiseur).
// Retourne null si l'entrée n'est pas un objet exploitable.
export function sanitizeOptions(input: unknown): BigHeadsOptions | null {
  if (!input || typeof input !== "object") return null
  const src = input as Record<string, unknown>
  const out = {} as BigHeadsOptions
  for (const field of FIELDS) {
    const values = OPTIONS[field] as readonly string[]
    const v = src[field]
    if (typeof v === "string" && values.includes(v)) {
      ;(out as Record<string, string>)[field] = v
    } else {
      return null // champ manquant ou invalide → on refuse tout
    }
  }
  return out
}

// Assemble les props finales passées à <BigHead> : choix de l'élève (ou défaut
// déterministe) + props fixes + couleur de chapeau alignée sur les vêtements.
export function resolveBigHeadProps(stored: unknown, seed: string) {
  const options = sanitizeOptions(stored) ?? deterministicOptions(seed)
  // hatColor réutilise la palette "clothing" → aligné sur la couleur des vêtements.
  return { ...options, ...FIXED, hatColor: options.clothingColor }
}
