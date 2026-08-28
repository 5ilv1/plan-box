import { NextResponse, type NextRequest } from "next/server";

/**
 * Filet de sécurité sur /api/ : refus par défaut.
 *
 * Pourquoi : l'audit du 28/08/2026 a trouvé 78 routes sur 158 sans aucune
 * vérification d'accès, presque toutes utilisant le client service_role qui
 * contourne la RLS. Le problème de fond n'était pas telle ou telle route, mais
 * qu'une route neuve soit ouverte par défaut. Ce middleware inverse ça : une
 * route non listée ici exige une session, donc un oubli échoue en fermé.
 *
 * ⚠️ Ce n'est PAS de l'autorisation. On vérifie la PRÉSENCE d'un cookie de
 * session, pas sa validité, et surtout pas les droits de son porteur. Un élève
 * connecté passe ce filtre sur toutes les routes. La vraie autorisation reste
 * le rôle de requireEnseignant() / requireProprietaireOuEnseignant() dans
 * chaque route. Ce middleware ne dispense d'aucun de ces gardes : il évite
 * seulement qu'un inconnu atteigne une route qu'on aurait oublié de protéger.
 */

// Nom du cookie de session Plan Box. Doit rester identique à
// PLANBOX_AUTH_COOKIE dans lib/supabase.ts et lib/server-auth.ts. Repris en dur
// ici : importer lib/supabase.ts embarquerait le SDK Supabase dans le bundle
// edge du middleware, exécuté à chaque requête.
const COOKIE_SESSION = "sb-planbox-auth";

// Routes légitimement appelées sans session. Toute addition ici doit être
// justifiée : c'est la liste des portes ouvertes sur internet.
const PUBLIQUES = [
  // Point d'entrée du scan QR : l'élève n'a pas encore de session, c'est tout
  // l'objet de l'appel. Sa sécurité repose sur le secret du token.
  "/api/qr-login/verify",
  // Crons Vercel. Ces routes vérifient elles-mêmes CRON_SECRET.
  "/api/cron",
  // Lien "Aller sur Repetibox" de la page d'accueil publique (app/page.tsx),
  // suivi en navigation directe. La route vérifie elle-même la session et
  // redirige vers /eleve quand il n'y en a pas : un 401 JSON à la place
  // afficherait une page d'erreur brute au visiteur déconnecté.
  "/api/sso/redirect-repetibox",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIQUES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // Appels signés : crons Vercel, appels d'une route API à une autre, et
  // scripts CLI (scripts/regen-audio-dictees.ts) qui n'ont pas de session.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return NextResponse.next();
  }

  // Supabase découpe les gros cookies en "<nom>.0", "<nom>.1"… d'où le préfixe.
  const aUneSession = req.cookies
    .getAll()
    .some((c) => c.name === COOKIE_SESSION || c.name.startsWith(`${COOKIE_SESSION}.`));

  if (!aUneSession) {
    return NextResponse.json({ erreur: "Non authentifié" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
