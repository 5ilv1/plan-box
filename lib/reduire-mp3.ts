/**
 * Réduit un MP3 dans le navigateur, avant son envoi (page Podcasts).
 *
 * Les podcasts sont servis aux élèves par Plan Box (`/media/…`, voir
 * lib/r2.ts) : le filtre de l'école bloque r2.dev. Cette bande passante compte
 * dans le quota gratuit de Vercel, et un podcast radio arrive en stéréo à
 * 256 kbit/s — 28 Mo pour un quart d'heure de voix. Mono, 24 kHz, 48 kbit/s :
 * ~5 Mo, sans perte audible pour de la parole. Mêmes réglages que
 * `scripts/compresser-podcasts.ts`.
 *
 * ⚠️ Une réduction qui échoue ne doit jamais empêcher l'envoi : on rend alors
 * le fichier d'origine (`reduit: false`), et l'écran le signale.
 */

const FREQUENCE = 24000;
const DEBIT_KBPS = 48;
/** En dessous, le fichier est déjà léger : on ne le retouche pas. */
const SEUIL_OCTETS = 8 * 1024 * 1024;
const ECHANTILLONS_PAR_TRAME = 1152;

export interface ResultatReduction {
  fichier: File;
  reduit: boolean;
}

export async function reduireMp3(
  fichier: File,
  onProgres?: (fraction: number) => void,
): Promise<ResultatReduction> {
  if (fichier.size <= SEUIL_OCTETS) return { fichier, reduit: false };
  try {
    // Décodé par un contexte à 24 kHz, le son est rééchantillonné au passage.
    const contexte = new OfflineAudioContext(1, 1, FREQUENCE);
    const son = await contexte.decodeAudioData(await fichier.arrayBuffer());

    // Mono : moyenne des canaux.
    const n = son.length;
    const mono = new Int16Array(n);
    const canaux = Array.from({ length: son.numberOfChannels }, (_, i) => son.getChannelData(i));
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (const c of canaux) s += c[i];
      s /= canaux.length;
      mono[i] = s < 0 ? Math.max(-1, s) * 0x8000 : Math.min(1, s) * 0x7fff;
    }

    const { Mp3Encoder } = await import("@breezystack/lamejs");
    const encodeur = new Mp3Encoder(1, FREQUENCE, DEBIT_KBPS);
    const morceaux: Uint8Array[] = [];
    // Par paquets, en rendant la main : un quart d'heure s'encode en
    // quelques secondes, l'écran ne doit pas geler pendant ce temps.
    const PAQUET = ECHANTILLONS_PAR_TRAME * 200;
    for (let debut = 0; debut < n; debut += PAQUET) {
      const mp3 = encodeur.encodeBuffer(mono.subarray(debut, Math.min(n, debut + PAQUET)));
      if (mp3.length) morceaux.push(mp3);
      onProgres?.(Math.min(1, (debut + PAQUET) / n));
      await new Promise((r) => setTimeout(r, 0));
    }
    const fin = encodeur.flush();
    if (fin.length) morceaux.push(fin);

    const blob = new Blob(morceaux as BlobPart[], { type: "audio/mpeg" });
    // Jamais plus lourd que l'original : dans ce cas, garder l'original.
    if (blob.size === 0 || blob.size >= fichier.size) return { fichier, reduit: false };
    const nom = fichier.name.replace(/\.mp3$/i, "") + "-voix.mp3";
    return { fichier: new File([blob], nom, { type: "audio/mpeg" }), reduit: true };
  } catch (e) {
    console.warn("[podcasts] réduction impossible, envoi du fichier d'origine :", e);
    return { fichier, reduit: false };
  }
}
