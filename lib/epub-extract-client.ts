// Extraction client-side du contenu d'un EPUB.
//
// Même parti pris que `pdf-extract-client.ts` : tout se passe dans le
// navigateur, seul le texte part au serveur — la limite de 4,5 Mo de Vercel
// sur le corps d'une requête serverless interdit d'envoyer le fichier.
//
// À la différence du PDF, un EPUB est du XHTML balisé : les paragraphes sont
// des paragraphes, et le livre porte sa propre table des matières. On lit donc
// les vrais chapitres au lieu de les faire deviner par l'IA.

export interface ChapitreEpub {
  ordre: number;
  titre: string;
  texte: string;
  nb_mots: number;
}

export interface ContenuEpub {
  /** Tout le livre, chapitres concaténés — repli si le découpage ne convient pas. */
  texteBrut: string;
  /** Les chapitres tels que le livre les déclare, dans l'ordre de lecture. */
  chapitres: ChapitreEpub[];
  /** Métadonnées de l'OPF, quand elles sont présentes. */
  titre: string | null;
  auteur: string | null;
  /** Image de couverture embarquée dans l'archive, prête à être envoyée. */
  couverture: File | null;
}

/** Un EPUB est une archive ZIP dont le premier fichier est `mimetype`. */
export function estEpub(file: File): boolean {
  return file.name.toLowerCase().endsWith(".epub") || file.type === "application/epub+zip";
}

function compterMots(texte: string): number {
  return texte.split(/\s+/).filter(Boolean).length;
}

/** Résout un chemin relatif à un autre, sans passer par URL (chemins de ZIP). */
function resoudreChemin(base: string, relatif: string): string {
  const parts = base.split("/").slice(0, -1);
  for (const seg of decodeURIComponent(relatif).split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/**
 * Texte lisible d'un document XHTML.
 *
 * On retire d'abord ce qui ne se lit pas, puis on s'appuie sur les balises de
 * bloc pour poser les sauts de ligne — c'est précisément ce que le PDF oblige
 * à deviner à partir des coordonnées.
 */
function texteDeDocument(doc: Document): string {
  doc.querySelectorAll("script, style, nav, header, footer").forEach((n) => n.remove());

  const corps = doc.body ?? doc.documentElement;
  if (!corps) return "";

  corps.querySelectorAll("br").forEach((br) => br.replaceWith(doc.createTextNode("\n")));
  corps.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, blockquote, tr").forEach((bloc) => {
    bloc.appendChild(doc.createTextNode("\n\n"));
  });

  return (corps.textContent ?? "")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Titre porté par le document lui-même, à défaut du sommaire. */
function titreDeDocument(doc: Document): string | null {
  for (const sel of ["h1", "h2", "h3", "title"]) {
    const t = doc.querySelector(sel)?.textContent?.trim();
    if (t) return t.replace(/\s+/g, " ");
  }
  return null;
}

/** Titres du sommaire, indexés par chemin de fichier (nav.xhtml ou toc.ncx). */
function lireSommaire(doc: Document, cheminSommaire: string): Map<string, string> {
  const titres = new Map<string, string>();

  // EPUB 3 : <nav epub:type="toc"> — l'attribut est dans un espace de noms,
  // querySelectorAll("[epub\\:type]") n'est pas fiable partout, on balaie.
  const liens = Array.from(doc.querySelectorAll("a[href], content[src]"));
  for (const lien of liens) {
    const href = lien.getAttribute("href") ?? lien.getAttribute("src");
    if (!href) continue;

    // EPUB 2 : le titre est dans le <navLabel><text> frère du <content>
    const texte =
      lien.textContent?.trim() ||
      lien.parentElement?.querySelector("navLabel > text")?.textContent?.trim() ||
      "";
    if (!texte) continue;

    const chemin = resoudreChemin(cheminSommaire, href.split("#")[0]);
    if (!titres.has(chemin)) titres.set(chemin, texte.replace(/\s+/g, " "));
  }
  return titres;
}

/**
 * Localise l'image de couverture dans le manifeste.
 *
 * Trois conventions se croisent : `properties="cover-image"` (EPUB 3),
 * `<meta name="cover" content="ID">` (EPUB 2), et à défaut un identifiant ou
 * un nom de fichier qui contient « cover » ou « couverture ».
 */
function trouverCouverture(
  opf: Document,
  manifeste: Map<string, { chemin: string; type: string; proprietes: string }>,
): { chemin: string; type: string } | null {
  const estImage = (m: { type: string }) => m.type.startsWith("image/");

  for (const [, m] of manifeste) {
    if (m.proprietes.includes("cover-image") && estImage(m)) return m;
  }

  const idMeta = Array.from(opf.querySelectorAll("metadata meta"))
    .find((m) => m.getAttribute("name") === "cover")
    ?.getAttribute("content");
  const parMeta = idMeta ? manifeste.get(idMeta) : undefined;
  if (parMeta && estImage(parMeta)) return parMeta;

  for (const [id, m] of manifeste) {
    if (!estImage(m)) continue;
    if (/cover|couverture/i.test(id) || /cover|couverture/i.test(m.chemin)) return m;
  }
  return null;
}

/**
 * Lit un EPUB et renvoie ses chapitres dans l'ordre de lecture (le *spine*).
 *
 * Les EPUB protégés par DRM sont chiffrés : la lecture échoue avec un message
 * explicite plutôt que de produire du charabia.
 */
export async function extraireEpub(file: File): Promise<ContenuEpub> {
  if (typeof window === "undefined") {
    throw new Error("extraireEpub() est réservé au client.");
  }

  const JSZip = (await import("jszip")).default;
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error("Fichier EPUB illisible — il est peut-être endommagé.");
  }

  if (zip.file("META-INF/encryption.xml")) {
    throw new Error(
      "Cet EPUB est protégé par DRM : son texte est chiffré et ne peut pas être extrait.",
    );
  }

  const parseur = new DOMParser();

  // 1. container.xml → chemin de l'OPF
  const container = await zip.file("META-INF/container.xml")?.async("string");
  if (!container) throw new Error("Ce fichier n'est pas un EPUB valide (container.xml manquant).");

  const cheminOpf = parseur
    .parseFromString(container, "application/xml")
    .querySelector("rootfile")
    ?.getAttribute("full-path");
  if (!cheminOpf) throw new Error("EPUB invalide : le fichier OPF est introuvable.");

  // 2. OPF → métadonnées, manifeste, ordre de lecture
  const opfBrut = await zip.file(cheminOpf)?.async("string");
  if (!opfBrut) throw new Error("EPUB invalide : le fichier OPF est illisible.");
  const opf = parseur.parseFromString(opfBrut, "application/xml");

  const titre = opf.querySelector("metadata title")?.textContent?.trim() ?? null;
  const auteur = opf.querySelector("metadata creator")?.textContent?.trim() ?? null;

  const manifeste = new Map<string, { chemin: string; type: string; proprietes: string }>();
  for (const item of Array.from(opf.querySelectorAll("manifest > item"))) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) continue;
    manifeste.set(id, {
      chemin: resoudreChemin(cheminOpf, href),
      type: item.getAttribute("media-type") ?? "",
      proprietes: item.getAttribute("properties") ?? "",
    });
  }

  // 3. Sommaire : nav.xhtml (EPUB 3) ou toc.ncx (EPUB 2)
  let titresSommaire = new Map<string, string>();
  const idNav =
    Array.from(manifeste.entries()).find(([, m]) => m.proprietes.includes("nav"))?.[0] ??
    opf.querySelector("spine")?.getAttribute("toc");
  const nav = idNav ? manifeste.get(idNav) : undefined;
  if (nav) {
    const brut = await zip.file(nav.chemin)?.async("string");
    if (brut) {
      titresSommaire = lireSommaire(
        parseur.parseFromString(brut, nav.chemin.endsWith(".ncx") ? "application/xml" : "application/xhtml+xml"),
        nav.chemin,
      );
    }
  }

  // 4. Couverture : elle est dans l'archive, inutile d'aller la chercher ailleurs.
  let couverture: File | null = null;
  const refCouv = trouverCouverture(opf, manifeste);
  if (refCouv) {
    const donnees = await zip.file(refCouv.chemin)?.async("blob");
    if (donnees) {
      const ext = refCouv.chemin.split(".").pop()?.toLowerCase() ?? "jpg";
      couverture = new File([donnees], `couverture.${ext}`, { type: refCouv.type });
    }
  }

  // 5. Parcours du spine — l'ordre de lecture voulu par l'éditeur
  const chapitres: ChapitreEpub[] = [];
  for (const ref of Array.from(opf.querySelectorAll("spine > itemref"))) {
    const item = manifeste.get(ref.getAttribute("idref") ?? "");
    if (!item || !item.type.includes("html")) continue;

    const brut = await zip.file(item.chemin)?.async("string");
    if (!brut) continue;

    const doc = parseur.parseFromString(brut, "application/xhtml+xml");
    const texte = texteDeDocument(doc);
    const nbMots = compterMots(texte);

    // Couverture, page de titre, colophon : quelques mots, aucun intérêt.
    if (nbMots < 50) continue;

    chapitres.push({
      ordre: chapitres.length + 1,
      titre:
        titresSommaire.get(item.chemin) ??
        titreDeDocument(doc) ??
        `Chapitre ${chapitres.length + 1}`,
      texte,
      nb_mots: nbMots,
    });
  }

  if (chapitres.length === 0) {
    throw new Error("Aucun texte exploitable trouvé dans cet EPUB.");
  }

  return {
    texteBrut: chapitres.map((c) => `${c.titre}\n\n${c.texte}`).join("\n\n"),
    chapitres,
    titre,
    auteur,
    couverture,
  };
}
