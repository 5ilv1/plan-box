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

  const modeActuel = dernierTheme?.mode ?? "jour";

  // Mode semaine : ne générer que le lundi
  if (modeActuel === "semaine" && jour !== 1) {
    return Response.json({ skipped: true, raison: "Mode semaine — génération uniquement le lundi" });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002";

  const theme = await fetch(`${base}/api/generer-theme-ecriture`, {
    method: "POST",
  }).then((r) => r.json());

  // Appliquer le même mode que le dernier thème
  if (modeActuel === "semaine") {
    await supabase
      .from("themes_ecriture")
      .update({ mode: "semaine" })
      .eq("id", theme.id);
  }

  await fetch(`${base}/api/affecter-theme-ecriture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme_id: theme.id }),
  });

  return Response.json({ ok: true, mode: modeActuel, theme });
}
