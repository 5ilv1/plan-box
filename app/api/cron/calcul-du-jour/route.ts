import { createAdminClient } from "@/lib/supabase-admin";
import { NIVEAUX_IDS, assurerCalculDuJour } from "@/lib/calcul-jour";

/**
 * GET /api/cron/calcul-du-jour  (déclenché par Vercel Cron chaque matin)
 *
 * Pré-génère le calcul du jour pour CHAQUE niveau actif, sans attendre qu'un
 * élève ouvre son tableau de bord. Garantit que chaque élève voit un calcul
 * adapté à son niveau, quel que soit l'ordre de connexion de la classe.
 *
 * Idempotent : si un calcul existe déjà pour (date, niveau), il est conservé.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Pas de génération le week-end (samedi = 6, dimanche = 0)
  const jour = new Date().getDay();
  if (jour === 0 || jour === 6) {
    return Response.json({ skipped: true, raison: "Week-end" });
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  const resultats: Record<string, { ok: boolean; id?: string; operation?: string; inactif?: boolean }> = {};

  for (const [niveau, niveauId] of Object.entries(NIVEAUX_IDS)) {
    try {
      const r = await assurerCalculDuJour(admin, niveauId, today);
      if ("inactif" in r) {
        resultats[niveau] = { ok: false, inactif: true };
      } else {
        resultats[niveau] = { ok: true, id: r.row.id, operation: r.row.operation };
      }
    } catch (e) {
      resultats[niveau] = { ok: false };
      console.error(`[cron/calcul-du-jour] ${niveau} échec :`, e);
    }
  }

  return Response.json({ ok: true, date: today, niveaux: resultats });
}
