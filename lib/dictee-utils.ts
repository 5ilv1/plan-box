import { MotDict, PhraseDict } from "@/types";

// Normalise une chaîne : minuscules, sans accents, sans ponctuation de fin
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Vérifie si un token du texte correspond à un mot de la liste
export function motCorrespond(motListe: string, token: string): boolean {
  const racine = normalise(motListe);
  const tokenNorm = normalise(token.replace(/[.,;:!?«»"'()\-]/g, ""));
  if (tokenNorm === racine) return true;
  // Correspondance par racine (min 4 caractères, tolère les flexions)
  const minLen = Math.max(4, racine.length - 1);
  if (racine.length >= minLen && tokenNorm.startsWith(racine.slice(0, minLen))) return true;
  return false;
}

// Retourne une chaîne de tirets proportionnelle à la longueur du mot
export function longueurTirets(n: number): string {
  if (n <= 5) return "____________";       // 12 tirets
  if (n <= 8) return "________________";   // 16 tirets
  if (n <= 12) return "____________________"; // 20 tirets
  return "________________________";       // 24 tirets
}

// Remplace les mots à apprendre dans le texte par des tirets
export function genereTrous(texte: string, mots: MotDict[]): string {
  // Tokenise en conservant les séparateurs
  const tokens = texte.split(/(\s+|(?=[.,;:!?«»"'()\-])|(?<=[.,;:!?«»"'()\-]))/);
  return tokens
    .map((token) => {
      if (!token || /^\s+$/.test(token)) return token;
      const correspond = mots.some((m) => motCorrespond(m.mot, token));
      if (correspond) {
        const motPur = token.replace(/[.,;:!?«»"'()\-]/g, "");
        return token.replace(motPur, longueurTirets(motPur.length));
      }
      return token;
    })
    .join("");
}

// Mappe le nom du niveau (CE2/CM1/CM2) aux étoiles (1/2/3)
export function niveauNomToEtoiles(nom: string): 1 | 2 | 3 | 4 {
  if (nom === "CE2") return 1;
  if (nom === "CM1") return 2;
  if (nom === "CM2") return 3;
  return 2; // fallback
}

// Retourne les ids des phrases de `a` dont le texte normalisé apparaît dans `b`
export function phrasesCommunes(a: PhraseDict[], b: PhraseDict[]): Set<number> {
  const textesBNorm = new Set(b.map((p) => normalise(p.texte)));
  const communs = new Set<number>();
  for (const phrase of a) {
    if (textesBNorm.has(normalise(phrase.texte))) communs.add(phrase.id);
  }
  return communs;
}

/**
 * Remplace les signes de ponctuation par leur équivalent oral en français,
 * pour que le TTS (Web Speech API ou OpenAI) les prononce explicitement.
 *
 * Exemples :
 *   "Bonjour, monde."     → "Bonjour virgule monde point"
 *   "Qu'est-ce que c'est ?" → "Qu'est-ce que c'est point d'interrogation"
 *   "«Attention !»"        → "ouvrez les guillemets Attention point d'exclamation fermez les guillemets"
 */
export function enonceePonctuation(texte: string): string {
  return texte
    // Ponctuation double — traiter avant les simples
    .replace(/\.\.\./g, " points de suspension ")
    .replace(/«\s*/g, " ouvrez les guillemets ")
    .replace(/\s*»/g, " fermez les guillemets ")
    // Tiret de dialogue en début de ligne
    .replace(/(^|\n)\s*[-–—]\s*/g, "$1 tiret ")
    // Ponctuation simple — la virgule avant le mot crée une pause naturelle dans la voix TTS
    .replace(/,/g, ", virgule,")
    .replace(/\./g, ", point,")
    .replace(/;/g, ", point-virgule,")
    .replace(/:/g, ", deux-points,")
    .replace(/\?/g, ", point d'interrogation,")
    .replace(/!/g, ", point d'exclamation,")
    .replace(/\(/g, ", ouvrez la parenthèse,")
    .replace(/\)/g, ", fermez la parenthèse,")
    .replace(/"/g, ", guillemets,")
    // Apostrophe : garder pour la liaison naturelle
    .replace(/'/g, "'")
    // Nettoyer les espaces multiples
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Surligneage HTML des mots à apprendre dans un texte
export function surlignerMots(texte: string, mots: MotDict[]): string {
  const tokens = texte.split(/(\s+|(?=[.,;:!?«»"'()\-])|(?<=[.,;:!?«»"'()\-]))/);
  return tokens
    .map((token) => {
      if (!token || /^\s+$/.test(token)) return token;
      const correspond = mots.some((m) => motCorrespond(m.mot, token));
      return correspond
        ? `<mark style="background:#BFDBFE;border-radius:3px;padding:0 2px">${token}</mark>`
        : token;
    })
    .join("");
}
