export interface Matiere {
  id: string;
  nom: string;
  icone: string;
  ordre: number;
}

export const PALETTE_COULEURS = [
  { bg: "#DBEAFE", texte: "#1D4ED8" },
  { bg: "#D1FAE5", texte: "#15803D" },
  { bg: "#FEF3C7", texte: "#B45309" },
  { bg: "#EDE9FE", texte: "#6D28D9" },
  { bg: "#FCE7F3", texte: "#BE185D" },
  { bg: "#FEE2E2", texte: "#DC2626" },
  { bg: "#F3F4F6", texte: "#6B7280" },
  { bg: "#ECFDF5", texte: "#065F46" },
  { bg: "#FFF7ED", texte: "#C2410C" },
  { bg: "#F0F9FF", texte: "#0369A1" },
];

export function couleurMatiere(index: number) {
  return PALETTE_COULEURS[index % PALETTE_COULEURS.length];
}

export function couleurBg(matieres: Matiere[], nom: string): string {
  const idx = matieres.findIndex((m) => m.nom === nom);
  return PALETTE_COULEURS[Math.max(0, idx) % PALETTE_COULEURS.length].bg;
}

export function couleurTexte(matieres: Matiere[], nom: string): string {
  const idx = matieres.findIndex((m) => m.nom === nom);
  return PALETTE_COULEURS[Math.max(0, idx) % PALETTE_COULEURS.length].texte;
}

export function iconeMatiere(matieres: Matiere[], nom: string): string {
  return matieres.find((m) => m.nom === nom)?.icone ?? "📋";
}

/* ── Cache module-level (5 min) ── */
let _cache: Matiere[] | null = null;
let _cacheTime = 0;

export async function fetchMatieres(): Promise<Matiere[]> {
  const now = Date.now();
  if (_cache && now - _cacheTime < 5 * 60 * 1000) return _cache;
  try {
    const res = await fetch("/api/matieres");
    const json = res.ok ? await res.json() : { matieres: [] };
    _cache = json.matieres ?? [];
    _cacheTime = now;
    return _cache!;
  } catch {
    return _cache ?? [];
  }
}

export function invalidateMatieres() {
  _cache = null;
  _cacheTime = 0;
}
