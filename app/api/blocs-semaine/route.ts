import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getServerUser } from "@/lib/server-auth";

export async function GET(req: Request) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();
  const { searchParams } = new URL(req.url);
  const lundi = searchParams.get("lundi");

  if (!lundi) {
    return NextResponse.json({ error: "Paramètre lundi manquant" }, { status: 400 });
  }

  const lundiDate = new Date(lundi);
  const dimanche = new Date(lundiDate);
  dimanche.setDate(lundiDate.getDate() + 6);
  const lundiStr = lundiDate.toISOString().split("T")[0];
  const dimancheStr = dimanche.toISOString().split("T")[0];

  // Récupérer tous les blocs de la semaine (groupés par type+titre+date pour éviter de lister chaque élève)
  const { data, error } = await admin
    .from("plan_travail")
    .select("type, titre, date_assignation, groupe_label, contenu, chapitre_id, statut, repetibox_eleve_id, eleve_id")
    .gte("date_assignation", lundiStr)
    .lte("date_assignation", dimancheStr)
    .order("date_assignation");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Grouper par (type + titre + date)
  const groupes = new Map<string, {
    type: string;
    titre: string;
    date: string;
    jour: number; // 0=lundi, 1=mardi, 2=mercredi, 3=jeudi, 4=vendredi
    groupeLabel: string;
    contenu: any;
    chapitreId: string | null;
    nbEleves: number;
    nbFaits: number;
  }>();

  for (const b of data ?? []) {
    const key = `${b.type}|${b.titre}|${b.date_assignation}`;
    if (!groupes.has(key)) {
      // Parser la date en local (éviter le décalage UTC)
      const [y, m, dd] = b.date_assignation.split("-").map(Number);
      const d = new Date(y, m - 1, dd);
      const dayOfWeek = d.getDay(); // 0=dim, 1=lun, ..., 6=sam
      const jour = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0=lundi, 4=vendredi

      groupes.set(key, {
        type: b.type,
        titre: b.titre,
        date: b.date_assignation,
        jour,
        groupeLabel: b.groupe_label ?? "",
        contenu: b.contenu,
        chapitreId: b.chapitre_id,
        nbEleves: 0,
        nbFaits: 0,
      });
    }
    const g = groupes.get(key)!;
    g.nbEleves++;
    if (b.statut === "fait") g.nbFaits++;
  }

  return NextResponse.json({
    blocs: [...groupes.values()],
  });
}
