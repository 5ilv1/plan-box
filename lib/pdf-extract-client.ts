// Extraction client-side du texte d'un PDF via pdfjs-dist.
// Évite d'envoyer le PDF au serveur (limite Vercel 4.5 MB) et permet
// de traiter des livres de n'importe quelle taille.

// pdfjs-dist est chargé dynamiquement côté client uniquement
// pour ne pas alourdir le bundle serveur.

export async function extraireTextePdf(file: File): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("extraireTextePdf() est réservé au client.");
  }

  // @ts-expect-error pdfjs-dist n'a pas de types TS parfaits pour l'import dynamique
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");

  // Worker : on le pointe sur un fichier local servi par Next.js (public/)
  // ou on utilise le worker bundled
  if (typeof pdfjs.GlobalWorkerOptions !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.mjs",
      import.meta.url
    ).toString();
  }

  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Reconstruire le texte avec sauts de ligne entre items proches
    let pageText = "";
    let lastY: number | null = null;
    for (const item of content.items as Array<{ str: string; transform?: number[] }>) {
      if (!("str" in item)) continue;
      const y = item.transform?.[5] ?? null;
      if (lastY !== null && y !== null) {
        const dy = Math.abs(y - lastY);
        // Un interligne classique fait ~14-18 px. Au-delà de 25, on considère
        // un saut de paragraphe / titre isolé et on insère une ligne vide,
        // ce qui permet à la détection de chapitres d'isoler les titres.
        if (dy > 25) pageText += "\n\n";
        else if (dy > 2) pageText += "\n";
      }
      pageText += item.str + " ";
      lastY = y;
    }
    pages.push(pageText.trim());
  }

  await doc.destroy();
  return pages.join("\n\n");
}
