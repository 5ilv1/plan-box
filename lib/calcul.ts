// ─── Types ─────────────────────────────────────────────────────────────────

export type Operation =
  | "addition"
  | "soustraction"
  | "multiplication"
  | "division"
  | "complement"
  | "perimetre_rectangle"

export interface TemplateCalcul {
  operation: Operation
  variables: {
    a: { min: number; max: number; decimales?: number }
    b?: { min: number; max: number; decimales?: number }
    cible?: number
  }
}

export interface CarteCalculGeneree {
  recto: string         // question générée dynamiquement
  bonneReponse: string  // réponse correcte calculée
  mauvaisesReponses: string[] // 3 mauvaises réponses proches
}

// ─── Utilitaires ───────────────────────────────────────────────────────────

function tirerNombre(min: number, max: number, decimales: number = 0): number {
  if (decimales === 0) {
    // Entier uniforme dans [min, max] inclus
    return Math.floor(Math.random() * (max - min + 1)) + min
  }
  const val = Math.random() * (max - min) + min
  return Math.round(val * 10 ** decimales) / 10 ** decimales
}

function arrondir(n: number): number {
  return Math.round(n * 1000) / 1000
}

function formaterVal(n: number): string {
  return String(n).replace(".", ",")
}

export function genererMauvaisesReponses(bonne: number, operation: Operation): string[] {
  const erreurs = new Set<number>()
  const estDecimal = !Number.isInteger(bonne)
  const increment = estDecimal ? 0.1 : 1
  const grandSaut = estDecimal ? 1 : 10

  const candidats = [
    arrondir(bonne + increment),
    arrondir(bonne - increment),
    arrondir(bonne + increment * 2),
    arrondir(bonne - increment * 2),
    arrondir(bonne + grandSaut),
    arrondir(bonne - grandSaut),
    arrondir(bonne * 2),
  ].filter(n => n > 0 && n !== bonne)

  for (const c of candidats) {
    if (erreurs.size >= 3) break
    erreurs.add(c)
  }

  // Fallback déterministe si pas assez de valeurs trouvées
  let fallback = increment
  while (erreurs.size < 3) {
    const v = arrondir(fallback)
    if (v !== bonne && v > 0) erreurs.add(v)
    fallback = arrondir(fallback + increment)
  }

  return [...erreurs].slice(0, 3).map(n => formaterVal(n))
}

// ─── Générateur principal ──────────────────────────────────────────────────

export function genererCarteCalcul(tmpl: TemplateCalcul): CarteCalculGeneree {
  const varA = tmpl.variables.a
  const varB = tmpl.variables.b ?? { min: 1, max: 10, decimales: 0 }

  const a = tirerNombre(varA.min, varA.max, varA.decimales ?? 0)
  const b = tirerNombre(varB.min, varB.max, varB.decimales ?? 0)

  let recto: string
  let bonneVal: number

  switch (tmpl.operation) {
    case "addition":
      bonneVal = arrondir(a + b)
      recto = `${formaterVal(a)} + ${formaterVal(b)} = ?`
      break

    case "soustraction": {
      const grand = Math.max(a, b)
      const petit = Math.min(a, b)
      bonneVal = arrondir(grand - petit)
      recto = `${formaterVal(grand)} − ${formaterVal(petit)} = ?`
      break
    }

    case "multiplication":
      bonneVal = arrondir(a * b)
      recto = `${formaterVal(a)} × ${formaterVal(b)} = ?`
      break

    case "division": {
      // Dividende = a × b pour garantir une division exacte (sur entiers)
      const dividende = arrondir(a * b)
      const diviseur = b === 0 ? 1 : b
      bonneVal = b === 0 ? dividende : a
      recto = `${formaterVal(dividende)} ÷ ${formaterVal(diviseur)} = ?`
      break
    }

    case "complement": {
      const total = arrondir(a + b)
      bonneVal = b
      recto = `${formaterVal(a)} + ? = ${formaterVal(total)}`
      break
    }

    case "perimetre_rectangle":
      bonneVal = arrondir(2 * (a + b))
      recto = `Périmètre rect. ${formaterVal(a)} × ${formaterVal(b)} = ?`
      break

    default:
      bonneVal = arrondir(a + b)
      recto = `${formaterVal(a)} + ${formaterVal(b)} = ?`
  }

  return {
    recto,
    bonneReponse: formaterVal(bonneVal),
    mauvaisesReponses: genererMauvaisesReponses(bonneVal, tmpl.operation),
  }
}

// ─── Labels opérations (pour UI enseignant) ────────────────────────────────

export const OPERATIONS_LABELS: Record<Operation, string> = {
  addition:            "Addition (a + b = ?)",
  soustraction:        "Soustraction (a − b = ?)",
  multiplication:      "Multiplication (a × b = ?)",
  division:            "Division (a×b ÷ b = ?)",
  complement:          "Complément (a + ? = a+b)",
  perimetre_rectangle: "Périmètre rectangle (2×(a+b))",
}
