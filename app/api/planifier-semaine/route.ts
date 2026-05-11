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

  // ── Résoudre le contenu des blocs avec banque_id ───────────────────────
  // Pour les blocs écriture / exercice / ressource, le contenu réel est dans banque_exercices
  const banqueIds = blocs
    .map((b: any) => b.contenu?.banque_id)
    .filter(Boolean) as string[];

  const banqueMap = new Map<string, Record<string, unknown>>();
  if (banqueIds.length > 0) {
    const uniqueIds = [...new Set(banqueIds)];
    const { data: banqueData } = await admin
      .from("banque_exercices")
      .select("id, contenu")
      .in("id", uniqueIds);
    for (const ex of banqueData ?? []) {
      if (ex.contenu) banqueMap.set(ex.id, ex.contenu as Record<string, unknown>);
    }
  }

  // ── Résoudre les noms de groupes (pour adapter la contrainte écriture) ──
  const tousGroupeIds = [...new Set(
    blocs.flatMap((b: any) => b.assignation?.groupeIds ?? [])
  )];
  const groupeNomMap = new Map<string, string>();
  if (tousGroupeIds.length > 0) {
    const { data: grpData } = await admin.from("groupes").select("id, nom").in("id", tousGroupeIds);
    for (const g of grpData ?? []) groupeNomMap.set(g.id, g.nom);
  }

  // ── Résoudre le contenu complet des dictées (depuis la table `dictees`) ──
  const dicteeParentIds = blocs
    .filter((b: any) => (b.type === "dictee" || b.type === "mots") && b.contenu?.dictee_parent_id)
    .map((b: any) => b.contenu.dictee_parent_id as string);

  // Map: dictee_parent_id → { niveau_etoiles → contenu complet }
  const dicteeContentMap = new Map<string, Map<number, {
    titre: string; texte: string; phrases: any[]; mots: any[];
    audio_complet_url: string | null; audio_phrases_urls: { id: number; url: string | null }[];
    niveau_etoiles: number;
  }>>();

  if (dicteeParentIds.length > 0) {
    const uniqueParentIds = [...new Set(dicteeParentIds)];
    const { data: dicteesData } = await admin
      .from("dictees")
      .select("dictee_parent_id, niveau_etoiles, titre, texte, phrases, mots, audio_complet_url, audio_phrases_urls")
      .in("dictee_parent_id", uniqueParentIds);
    for (const d of dicteesData ?? []) {
      if (!dicteeContentMap.has(d.dictee_parent_id)) {
        dicteeContentMap.set(d.dictee_parent_id, new Map());
      }
      dicteeContentMap.get(d.dictee_parent_id)!.set(d.niveau_etoiles, {
        titre: d.titre,
        texte: d.texte,
        phrases: d.phrases ?? [],
        mots: d.mots ?? [],
        audio_complet_url: d.audio_complet_url ?? null,
        audio_phrases_urls: d.audio_phrases_urls ?? [],
        niveau_etoiles: d.niveau_etoiles,
      });
    }
  }

  // ── Résoudre le niveau étoiles de chaque élève (PB + RB) ──
  // Concerne les blocs de type "dictee" ET "mots" qui ont un dictee_parent_id,
  // car les mots de la semaine sont aussi spécifiques au niveau (cf bug observé
  // le 5 mai : tous les élèves recevaient la liste de mots du niveau 4).
  const isDicteePresent = dicteeParentIds.length > 0;
  const niveauParEleve = new Map<string, number>(); // eleve_id | "rb_X" → étoiles

  if (isDicteePresent) {
    // Récupérer tous les eleve_ids et rb_ids des groupes concernés
    const tousGroupeIdsDictee = [...new Set(
      blocs
        .filter((b: any) => (b.type === "dictee" || b.type === "mots") && b.contenu?.dictee_parent_id)
        .flatMap((b: any) => b.assignation?.groupeIds ?? [])
    )];

    const pbIds: string[] = [];
    const rbIds: number[] = [];
    for (const gid of tousGroupeIdsDictee) {
      const membres = groupeMap.get(gid) ?? [];
      for (const m of membres) {
        if (m.planbox_eleve_id) pbIds.push(m.planbox_eleve_id);
        if (m.repetibox_eleve_id) rbIds.push(m.repetibox_eleve_id);
      }
    }

    // PB: niveau_etoiles direct ou via niveaux.nom
    if (pbIds.length > 0) {
      const { data: pbData } = await admin
        .from("eleves")
        .select("id, niveau_etoiles, niveaux(nom)")
        .in("id", [...new Set(pbIds)]);
      for (const e of (pbData ?? []) as any[]) {
        const etoiles = e.niveau_etoiles
          ?? (e.niveaux?.nom === "CE2" ? 1 : e.niveaux?.nom === "CM1" ? 2 : e.niveaux?.nom === "CM2" ? 3 : 2);
        niveauParEleve.set(e.id, etoiles);
      }
    }

    // RB: via eleves_planbox_meta
    if (rbIds.length > 0) {
      const { data: rbData } = await admin
        .from("eleves_planbox_meta")
        .select("repetibox_eleve_id, niveau_etoiles")
        .in("repetibox_eleve_id", [...new Set(rbIds)]);
      for (const m of (rbData ?? []) as any[]) {
        if (m.niveau_etoiles) niveauParEleve.set(`rb_${m.repetibox_eleve_id}`, m.niveau_etoiles);
      }
    }
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

    // Déterminer la periodicite : "semaine" si le contenu le demande, sinon "jour"
    // Les dictées sont toujours "semaine"
    const contenuBrut = bloc.contenu ?? {};
    const isDictee = bloc.type === "dictee" || bloc.type === "mots";
    const periodicite = isDictee ? "semaine" : (contenuBrut._periodicite === "semaine" ? "semaine" : "jour");

    // Résoudre le contenu de la banque si présent
    const banqueId = contenuBrut.banque_id as string | undefined;
    const contenuBanque = banqueId ? banqueMap.get(banqueId) : undefined;

    // Fusionner : contenu banque (complet) + champs du bloc (sauf _periodicite)
    const contenuBase = contenuBanque
      ? { ...contenuBanque, ...contenuBrut }
      : { ...contenuBrut };
    delete contenuBase._periodicite;

    // Pour les blocs écriture : adapter la contrainte par niveau de groupe
    const isEcriture = bloc.type === "ecriture";
    const contrainteBase = isEcriture
      ? ((contenuBase.contrainte as string) ?? "").replace(/ · Au moins \d+ lignes$/, "").trim()
      : "";

    // Pour les blocs dictée avec dictee_parent_id : résoudre le contenu complet
    const dicteeParentId = contenuBrut.dictee_parent_id as string | undefined;
    const dicteeNiveaux = dicteeParentId ? dicteeContentMap.get(dicteeParentId) : undefined;

    for (const eleve of uniqueEleves) {
      let contenuFinal: Record<string, unknown> = contenuBase;

      // ── Dictée : personnaliser par niveau étoiles de l'élève ──
      if (isDictee && bloc.type === "dictee" && dicteeNiveaux && dicteeNiveaux.size > 0) {
        const eleveKey = eleve.eleve_id ?? `rb_${eleve.repetibox_eleve_id}`;
        const etoiles = niveauParEleve.get(eleveKey) ?? 2;
        const nivContenu = dicteeNiveaux.get(etoiles) ?? dicteeNiveaux.values().next().value;

        if (nivContenu) {
          contenuFinal = {
            niveau_etoiles: nivContenu.niveau_etoiles,
            titre: nivContenu.titre,
            texte: nivContenu.texte,
            phrases: nivContenu.phrases,
            mots: nivContenu.mots,
            audio_complet_url: nivContenu.audio_complet_url,
            audio_phrases_urls: nivContenu.audio_phrases_urls,
            dictee_parent_id: dicteeParentId,
            batch_id: contenuBrut.batch_id,
          };
        }
      }

      // ── Mots de la semaine + Révision : personnaliser par niveau étoiles ──
      // Le client envoie une liste fusionnée (tous niveaux) pour le bloc mots ;
      // ici on la remplace par la liste du NIVEAU de l'élève. Sans ça, tous
      // les élèves voyaient les 17 mots du niveau 4 (bug du 5 mai 2026).
      if (isDictee && bloc.type === "mots" && dicteeNiveaux && dicteeNiveaux.size > 0) {
        const eleveKey = eleve.eleve_id ?? `rb_${eleve.repetibox_eleve_id}`;
        const etoiles = niveauParEleve.get(eleveKey) ?? 2;
        const nivContenu = dicteeNiveaux.get(etoiles) ?? dicteeNiveaux.values().next().value;

        if (nivContenu) {
          contenuFinal = {
            ...contenuFinal,
            niveau_etoiles: nivContenu.niveau_etoiles,
            mots: nivContenu.mots,
          };
        }
      }

      // Adapter la contrainte écriture par niveau (CE2 → 3 lignes, CM1/CM2 → 5 lignes)
      if (isEcriture && contrainteBase) {
        // Trouver le groupe de cet élève pour déterminer le niveau
        let niveauNom = "";
        for (const gid of (bloc.assignation?.groupeIds ?? [])) {
          const membres = groupeMap.get(gid) ?? [];
          const match = membres.find((m) =>
            (eleve.eleve_id && m.planbox_eleve_id === eleve.eleve_id) ||
            (eleve.repetibox_eleve_id && m.repetibox_eleve_id === eleve.repetibox_eleve_id)
          );
          if (match) { niveauNom = groupeNomMap.get(gid) ?? ""; break; }
        }

        let contraintefinale = contrainteBase;
        if (niveauNom === "CE2") contraintefinale += " · Au moins 3 lignes";
        else if (niveauNom === "CM1" || niveauNom === "CM2") contraintefinale += " · Au moins 5 lignes";

        contenuFinal = { ...contenuBase, contrainte: contraintefinale };
      }

      inserts.push({
        type: bloc.type,
        titre: bloc.titre,
        statut: "a_faire",
        date_assignation: dateAssignation,
        periodicite,
        contenu: contenuFinal,
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

  // ── Garde-fou anti-doublon "mots de la semaine" ──────────────────────────
  // Un élève ne doit avoir qu'UN SEUL bloc mots_semaine par date (lundi). Si on
  // replanifie une semaine avec un nouveau thème de dictée, on doit retirer
  // le ou les anciens blocs mots_semaine de la même semaine avant l'insert,
  // sinon le élève voit deux jeux de mots à apprendre (cf bug du 11 mai 2026).
  const motsSemaineInserts = inserts.filter(
    (i) => i.type === "mots" && (i.contenu as Record<string, unknown> | null)?.mots_semaine === true,
  );

  if (motsSemaineInserts.length > 0) {
    const eleveDatesPB = new Map<string, Set<string>>(); // eleve_id (PB) → dates
    const eleveDatesRB = new Map<number, Set<string>>(); // rb_eleve_id → dates
    for (const m of motsSemaineInserts) {
      const d = m.date_assignation as string;
      if (m.eleve_id) {
        if (!eleveDatesPB.has(m.eleve_id)) eleveDatesPB.set(m.eleve_id, new Set());
        eleveDatesPB.get(m.eleve_id)!.add(d);
      } else if (m.repetibox_eleve_id != null) {
        if (!eleveDatesRB.has(m.repetibox_eleve_id)) eleveDatesRB.set(m.repetibox_eleve_id, new Set());
        eleveDatesRB.get(m.repetibox_eleve_id)!.add(d);
      }
    }

    // Pour chaque (élève, date), supprimer les blocs mots_semaine existants.
    // On filtre côté serveur sur contenu->>'mots_semaine' = 'true' pour ne pas
    // toucher aux blocs "Révision mots" qui n'ont pas ce flag.
    for (const [eleveId, dates] of eleveDatesPB.entries()) {
      await admin
        .from("plan_travail")
        .delete()
        .eq("type", "mots")
        .eq("eleve_id", eleveId)
        .in("date_assignation", [...dates])
        .filter("contenu->>mots_semaine", "eq", "true");
    }
    for (const [rbId, dates] of eleveDatesRB.entries()) {
      await admin
        .from("plan_travail")
        .delete()
        .eq("type", "mots")
        .eq("repetibox_eleve_id", rbId)
        .in("date_assignation", [...dates])
        .filter("contenu->>mots_semaine", "eq", "true");
    }
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
