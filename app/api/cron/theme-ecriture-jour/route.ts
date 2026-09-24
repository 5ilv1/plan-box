import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import { genererOuRecupererTheme, affecterTheme } from "@/lib/theme-ecriture";
import { executerThemeDuJour } from "@/lib/cron-theme-ecriture";
import { ouvrirJournal, clore } from "@/lib/cron-journal";

/**
 * Le thème d'écriture du jour, posé chaque matin de classe (`vercel.json` :
 * lundi, mardi, jeudi, vendredi à 6 h UTC — entre 8 h et 9 h à Paris sur le
 * plan Hobby).
 *
 * L'orchestration — reprises, vérification, statuts — vit dans
 * `lib/cron-theme-ecriture.ts`, où elle est testée. Ici, on branche les vraies
 * dépendances et on tient le journal (`cron_journal`) : les journaux Vercel ne
 * gardent qu'une heure.
 */
export const maxDuration = 60;

function jourISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });
  const maintenant = new Date();
  const today = jourISO(maintenant);
  const journal = await ouvrirJournal(admin, "theme-ecriture-jour");

  const resultat = await executerThemeDuJour({
    jourSemaine: maintenant.getDay(),

    dernierMode: async () => {
      const { data } = await admin
        .from("themes_ecriture")
        .select("mode")
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.mode as "jour" | "semaine") ?? "jour";
    },

    dejaPlanifie: async (mode) => {
      let q = admin.from("plan_travail").select("id", { count: "exact", head: true }).eq("type", "ecriture");
      if (mode === "semaine") {
        const jour = maintenant.getDay();
        const lundi = new Date(maintenant);
        lundi.setDate(maintenant.getDate() + (jour === 0 ? -6 : 1 - jour));
        const dimanche = new Date(lundi);
        dimanche.setDate(lundi.getDate() + 6);
        q = q.gte("date_assignation", jourISO(lundi)).lte("date_assignation", jourISO(dimanche));
      } else {
        q = q.eq("date_assignation", today);
      }
      const { count, error } = await q;
      if (error) throw new Error(`plan_travail : ${error.message}`);
      return (count ?? 0) > 0;
    },

    generer: (mode) => genererOuRecupererTheme(admin, anthropic, true, mode),
    affecter: (themeId) => affecterTheme(admin, themeId),

    blocsDuJour: async () => {
      const { count, error } = await admin
        .from("plan_travail")
        .select("id", { count: "exact", head: true })
        .eq("type", "ecriture")
        .eq("date_assignation", today);
      if (error) throw new Error(`plan_travail : ${error.message}`);
      return count ?? 0;
    },
  });

  const { statut, tentatives, ...detail } = resultat;
  await clore(admin, journal, statut, {
    tentatives,
    detail,
    ...(resultat.statut === "echec" ? { erreur: resultat.erreur } : {}),
  });

  // Un échec rend 500 : Vercel marque alors l'exécution comme échouée, au
  // lieu du « ok » que renvoyait l'ancien cron quoi qu'il arrive.
  return Response.json(resultat, { status: statut === "echec" ? 500 : 200 });
}
