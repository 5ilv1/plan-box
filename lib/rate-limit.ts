import { NextResponse } from "next/server";

/**
 * Rate-limit en mémoire (Map module-scope), clé `${route}:${ip}`.
 *
 * Limitation connue : sur Vercel, chaque instance Lambda a sa propre Map.
 * La limite effective est donc multipliée par le nombre d'instances actives.
 * C'est une première barrière contre l'abus de coût IA, pas une protection
 * forte. Pour un vrai rate-limit global, migrer vers Upstash Redis.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  /** Identifiant de la route, ex. "generer-dictee" */
  key: string;
  /** Requêtes max sur la fenêtre */
  max: number;
  /** Fenêtre en secondes */
  windowSec: number;
  /**
   * Identifiant pour le bucket (typiquement user.id pour les routes
   * authentifiées). Si absent, fallback sur l'IP — déconseillé en classe
   * où tous les élèves partagent la même IP publique (NAT).
   */
  identifier?: string;
};

export function rateLimit(req: Request, opts: RateLimitOptions): NextResponse | null {
  const ident = opts.identifier ?? getClientIp(req);
  const cacheKey = `${opts.key}:${ident}`;
  const now = Date.now();
  const windowMs = opts.windowSec * 1000;

  const cur = buckets.get(cacheKey);
  if (!cur || cur.resetAt <= now) {
    buckets.set(cacheKey, { count: 1, resetAt: now + windowMs });
    cleanupIfNeeded(now);
    return null;
  }

  if (cur.count >= opts.max) {
    const retryAfter = Math.max(1, Math.ceil((cur.resetAt - now) / 1000));
    return NextResponse.json(
      { erreur: `Trop de requêtes. Réessaie dans ${retryAfter} s.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  cur.count++;
  return null;
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

let lastCleanup = 0;
function cleanupIfNeeded(now: number) {
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}
