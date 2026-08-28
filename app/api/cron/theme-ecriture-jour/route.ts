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

  const supabase = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  // Vérifier le dernier mode utilisé
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

  // ── Vérifier s'il existe déjà des blocs écriture planifiés ────────────
  // (créés via la page Nouvelle semaine — pas par le widget)
  // En mode semaine : vérifier toute la semaine ; en mode jour : seulement aujourd'hui
  let dejaPlannifie = false;

  if (modeActuel === "semaine") {
    const diffToMonday = jour === 0 ? -6 : 1 - jour;
    const monday = new Date();
    monday.setDate(monday.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const { count } = await supabase
      .from("plan_travail")
      .select("id", { count: "exact", head: true })
      .eq("type", "ecriture")
      .gte("date_assignation", monday.toISOString().split("T")[0])
      .lte("date_assignation", sunday.toISOString().split("T")[0]);

    dejaPlannifie = (count ?? 0) > 0;
  } else {
    const { count } = await supabase
      .from("plan_travail")
      .select("id", { count: "exact", head: true })
      .eq("type", "ecriture")
      .eq("date_assignation", today);

    dejaPlannifie = (count ?? 0) > 0;
  }

  if (dejaPlannifie) {
    return Response.json({ skipped: true, raison: "Des blocs écriture existent déjà pour cette période (planifiés à l'avance)" });
  }

  // ── Générer et affecter ───────────────────────────────────────────────
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002";

  const theme = await fetch(`${base}/api/generer-theme-ecriture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({ force: true, mode: modeActuel }),
  }).then((r) => r.json());

  await fetch(`${base}/api/affecter-theme-ecriture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({ theme_id: theme.id }),
  });

  return Response.json({ ok: true, mode: modeActuel, theme });
}
