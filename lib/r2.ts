import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2 : stockage des podcasts (serveur uniquement).
 *
 * Les podcasts ont quitté Supabase Storage le 07/10/2026 : 8 MP3 de ~28 Mo
 * avaient épuisé le quota gratuit de bande passante (5,5 Go par mois), et
 * Plan Box comme Repetibox étaient coupés. R2 ne facture pas la bande
 * passante sortante.
 *
 * Variables : R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET, R2_PUBLIC_URL (adresse publique r2.dev du bucket).
 */

function config() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
    throw new Error("Configuration R2 incomplète");
  }
  return {
    client: new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto",
    }),
    base: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`,
    publique: R2_PUBLIC_URL.replace(/\/$/, ""),
  };
}

/** Adresse publique d'un objet, celle que lisent les élèves. */
export function urlPubliqueR2(cle: string): string {
  return `${config().publique}/${cle}`;
}

/** Clé d'un objet à partir de son adresse publique ; null si l'adresse n'est pas dans le bucket. */
export function cleDepuisUrlR2(url: string): string | null {
  const prefixe = `${config().publique}/`;
  return url.startsWith(prefixe) ? url.slice(prefixe.length) : null;
}

/**
 * URL signée pour que le navigateur dépose le fichier directement dans R2
 * (une fonction Vercel refuse les corps de plus de 4,5 Mo).
 */
export async function urlEnvoiR2(
  cle: string,
  contentType: string,
  expireSecondes = 900,
): Promise<{ url: string; headers: Record<string, string> }> {
  const { client, base } = config();
  // Les en-têtes sont signés : le navigateur doit renvoyer exactement ceux-ci.
  const headers = { "Content-Type": contentType, "Cache-Control": CACHE_CONTROL };
  const signe = await client.sign(
    new Request(`${base}/${cle}?X-Amz-Expires=${expireSecondes}`, { method: "PUT", headers }),
    { aws: { signQuery: true } },
  );
  return { url: signe.url, headers };
}

// Un fichier ne change jamais sous la même clé (chaque envoi en crée une
// nouvelle) : la tablette peut le garder, une réécoute ne coûte plus rien.
const CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Dépose un fichier depuis le serveur (scripts de migration). */
export async function deposerR2(cle: string, corps: BodyInit, contentType: string): Promise<void> {
  const { client, base } = config();
  const r = await client.fetch(`${base}/${cle}`, {
    method: "PUT",
    body: corps,
    headers: { "Content-Type": contentType, "Cache-Control": CACHE_CONTROL },
  });
  if (!r.ok) throw new Error(`R2 PUT ${cle} : ${r.status}`);
}

export async function supprimerR2(cle: string): Promise<void> {
  const { client, base } = config();
  const r = await client.fetch(`${base}/${cle}`, { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new Error(`R2 DELETE ${cle} : ${r.status}`);
}
