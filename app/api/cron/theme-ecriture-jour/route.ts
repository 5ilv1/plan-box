import { createAdminClient } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const jour = new Date().getDay();
  if (![1, 2, 4, 5].includes(jour)) {
    return Response.json({ skipped: true, raison: "Pas un jour de classe" });
  }

  // Vérifier le dernier mode utilisé
  const supabase = createAdminClient();
  const { data: dernierTheme } = await supabase
    .from("themes_ecriture")
    .select("mode")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const modeActuel = (dernierTheme?.mode as "jour" | "semaine") ?? "jour";

  // Mode semaine : ne générer que le lundi
  if (modeActuel === "semaine" && jour !== 1) {
    return Response.json({ skipped: true, raison: "Mode semaine — génération uniquement le lundi" });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002";

  // Générer avec le mode courant pour obtenir un thème adapté
  const theme = await fetch(`${base}/api/generer-theme-ecriture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force: true, mode: modeActuel }),
  }).then((r) => r.json());

  // Affecter à tous les élèves
  await fetch(`${base}/api/affecter-theme-ecriture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme_id: theme.id }),
  });

  return Response.json({ ok: true, mode: modeActuel, theme });
}
