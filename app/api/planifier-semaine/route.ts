import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getServerUser } from "@/lib/server-auth";

export async function POST(req: Request) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();
  const body = await req.json();
  const { lundi, blocs } = body;

  if (!lundi || !Array.isArray(blocs) || blocs.length === 0) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  // Résoudre les assignations
  const { data: allGroupes } = await admin.from("eleve_groupe").select("groupe_id, planbox_eleve_id, repetibox_eleve_id");
  const groupeMap = new Map<string, { planbox_eleve_id: string | null; repetibox_eleve_id: number | null }[]>();
  for (const ge of allGroupes ?? []) {
    if (!groupeMap.has(ge.groupe_id)) groupeMap.set(ge.groupe_id, []);
    groupeMap.get(ge.groupe_id)!.push(ge);
  }

  const inserts: any[] = [];
  let created = 0;

  for (const bloc of blocs) {
    const dateAssignation = (() => {
      const d = new Date(lundi);
      d.setDate(d.getDate() + (bloc.jour ?? 0));
      return d.toISOString().split("T")[0];
    })();

    // Résoudre les élèves cibles
    const eleves: { eleve_id: string | null; repetibox_eleve_id: number | null }[] = [];

    // Par groupes
    for (const gid of (bloc.assignation?.groupeIds ?? [])) {
      const membres = groupeMap.get(gid) ?? [];
      for (const m of membres) {
        eleves.push({ eleve_id: m.planbox_eleve_id, repetibox_eleve_id: m.repetibox_eleve_id });
      }
    }

    // Par élèves individuels
    for (const uid of (bloc.assignation?.eleveUids ?? [])) {
      if (uid.startsWith("rb_")) {
        eleves.push({ eleve_id: null, repetibox_eleve_id: parseInt(uid.replace("rb_", "")) });
      } else {
        eleves.push({ eleve_id: uid, repetibox_eleve_id: null });
      }
    }

    // Si aucune assignation, skip
    if (eleves.length === 0) continue;

    // Dédupliquer
    const seen = new Set<string>();
    const uniqueEleves = eleves.filter((e) => {
      const key = e.eleve_id ?? `rb_${e.repetibox_eleve_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Créer un bloc par élève
    const groupeLabel = (bloc.assignation?.groupeNoms ?? []).join(", ") || "Toute la classe";

    for (const eleve of uniqueEleves) {
      inserts.push({
        type: bloc.type,
        titre: bloc.titre,
        statut: "a_faire",
        date_assignation: dateAssignation,
        periodicite: "jour",
        contenu: bloc.contenu ?? {},
        chapitre_id: bloc.chapitreId ?? null,
        eleve_id: eleve.eleve_id,
        repetibox_eleve_id: eleve.repetibox_eleve_id,
        groupe_label: groupeLabel,
      });
    }

    created++;
  }

  if (inserts.length === 0) {
    return NextResponse.json({ error: "Aucun élève trouvé pour les assignations" }, { status: 400 });
  }

  // Insérer par lots de 100 — ignorer les doublons
  let totalInserted = 0;
  let totalSkipped = 0;

  for (let i = 0; i < inserts.length; i += 100) {
    const batch = inserts.slice(i, i + 100);
    const { error, count } = await admin.from("plan_travail").upsert(batch, {
      onConflict: "repetibox_eleve_id,date_assignation,type,titre",
      ignoreDuplicates: true,
    });
    if (error) {
      // Si le upsert échoue (contrainte pas exactement sur ces colonnes), fallback insert un par un
      for (const row of batch) {
        const { error: errRow } = await admin.from("plan_travail").insert(row);
        if (errRow) {
          if (errRow.message.includes("duplicate") || errRow.message.includes("unique")) {
            totalSkipped++;
          } else {
            console.error("[planifier-semaine] Erreur insert row:", errRow.message);
          }
        } else {
          totalInserted++;
        }
      }
    } else {
      totalInserted += batch.length;
    }
  }

  return NextResponse.json({
    success: true,
    blocsCreated: created,
    totalInserted,
    totalSkipped,
  });
}
