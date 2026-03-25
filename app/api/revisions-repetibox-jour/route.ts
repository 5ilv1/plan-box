import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase-admin"

// GET /api/revisions-repetibox-jour?rb_eleve_id=42&pb_eleve_id=uuid (pb_eleve_id optionnel)
// Retourne les chapitres avec des cartes dues aujourd'hui dans Repetibox,
// accompagnés d'un token de connexion automatique valable 8h.
//
// Logique d'activation :
// - Élève PB (pb_eleve_id fourni) : vérifie config individuelle > config groupe > défaut OFF
// - Élève RB (source "repetibox", pas de pb_eleve_id) : vérifie config groupe > défaut OFF
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rbEleveId = searchParams.get("rb_eleve_id")
  const pbEleveId = searchParams.get("pb_eleve_id")

  if (!rbEleveId) {
    return NextResponse.json({ error: "rb_eleve_id requis" }, { status: 400 })
  }

  const admin = createAdminClient()
  const rbId = parseInt(rbEleveId, 10)

  // ── Vérification d'activation ────────────────────────────────────────────
  if (pbEleveId) {
    // Élève Plan Box natif : config individuelle > config groupe > OFF
    const { data: configIndiv } = await admin
      .from("pb_repetibox_config")
      .select("actif")
      .eq("eleve_id", pbEleveId)
      .maybeSingle()

    if (configIndiv !== null) {
      // Override individuel trouvé
      if (!configIndiv.actif) return NextResponse.json({ chapitres: [] })
    } else {
      // Pas d'override individuel : chercher dans les groupes
      const { data: membres } = await admin
        .from("eleve_groupe")
        .select("groupe_id")
        .eq("planbox_eleve_id", pbEleveId)

      const groupeIds = (membres ?? []).map((g: { groupe_id: string }) => g.groupe_id)
      if (groupeIds.length === 0) return NextResponse.json({ chapitres: [] })

      const { data: configGroupe } = await admin
        .from("pb_repetibox_config")
        .select("actif")
        .in("groupe_id", groupeIds)
        .eq("actif", true)
        .maybeSingle()

      if (!configGroupe) return NextResponse.json({ chapitres: [] })
    }
  } else {
    // Élève Repetibox natif : config individuelle > config groupe > OFF
    const { data: configIndiv } = await admin
      .from("pb_repetibox_config")
      .select("actif")
      .eq("repetibox_eleve_id", rbId)
      .maybeSingle()

    if (configIndiv !== null) {
      if (!configIndiv.actif) return NextResponse.json({ chapitres: [] })
    } else {
      // Pas d'override individuel : chercher dans les groupes
      const { data: membres } = await admin
        .from("eleve_groupe")
        .select("groupe_id")
        .eq("repetibox_eleve_id", rbId)

      const groupeIds = (membres ?? []).map((g: { groupe_id: string }) => g.groupe_id)
      if (groupeIds.length === 0) return NextResponse.json({ chapitres: [] })

      const { data: configGroupe } = await admin
        .from("pb_repetibox_config")
        .select("actif")
        .in("groupe_id", groupeIds)
        .eq("actif", true)
        .maybeSingle()

      if (!configGroupe) return NextResponse.json({ chapitres: [] })
    }
  }

  // ── Récupérer les infos de l'élève (classe_id) ───────────────────────────
  const aujourd_hui = new Date().toISOString().split("T")[0]

  const { data: eleveInfo } = await admin
    .from("eleve")
    .select("id, classe_id, auth_id")
    .eq("id", rbId)
    .single()

  const classeId = eleveInfo?.classe_id

  // ── Chapitres assignés à l'élève (même logique que getChapitresAssignes) ─
  const [
    { data: parClasse },
    { data: groupesEleve },
    { data: parEleve },
    { data: ancienne },
  ] = await Promise.all([
    classeId
      ? admin.from("assignation").select("chapitre_id")
          .eq("classe_id", classeId)
          .lte("date_debut", aujourd_hui)
          .or(`date_fin.is.null,date_fin.gte.${aujourd_hui}`)
      : Promise.resolve({ data: [] }),
    admin.from("groupe_eleve").select("groupe_id").eq("eleve_id", rbId),
    admin.from("assignation").select("chapitre_id")
      .eq("eleve_id", rbId)
      .lte("date_debut", aujourd_hui)
      .or(`date_fin.is.null,date_fin.gte.${aujourd_hui}`),
    classeId
      ? admin.from("assignation_classe").select("chapitre_id")
          .eq("classe_id", classeId)
          .lte("date_debut", aujourd_hui)
          .or(`date_fin.is.null,date_fin.gte.${aujourd_hui}`)
      : Promise.resolve({ data: [] }),
  ])

  const groupeIds = (groupesEleve ?? []).map((g: { groupe_id: string }) => g.groupe_id)

  const { data: parGroupe } = groupeIds.length > 0
    ? await admin.from("assignation").select("chapitre_id")
        .in("groupe_id", groupeIds)
        .lte("date_debut", aujourd_hui)
        .or(`date_fin.is.null,date_fin.gte.${aujourd_hui}`)
    : { data: [] }

  const chapitresAssignesIds = [
    ...(parClasse ?? []),
    ...(parGroupe ?? []),
    ...(parEleve ?? []),
    ...(ancienne ?? []),
  ].map((a: { chapitre_id: number }) => a.chapitre_id)
  const chapitresAssignesUniques = [...new Set(chapitresAssignesIds)]

  // ── Toutes les progressions de l'élève ───────────────────────────────────
  const { data: toutesProgressions, error: progError } = await admin
    .from("progression")
    .select("carte_id, prochaine_revision")
    .eq("eleve_id", rbId)

  if (progError) {
    return NextResponse.json({ error: progError.message }, { status: 500 })
  }

  const progressionMap = new Map<number, string>()
  for (const p of (toutesProgressions ?? []) as Array<{ carte_id: number; prochaine_revision: string }>) {
    progressionMap.set(p.carte_id, p.prochaine_revision)
  }

  // ── Toutes les cartes des chapitres assignés ──────────────────────────────
  if (chapitresAssignesUniques.length === 0) return NextResponse.json({ chapitres: [] })

  const { data: toutesCartes } = await admin
    .from("carte")
    .select("id, chapitre_id")
    .in("chapitre_id", chapitresAssignesUniques)

  if (!toutesCartes || toutesCartes.length === 0) return NextResponse.json({ chapitres: [] })

  // ── Filtrer : dues = pas de progression OU prochaine_revision <= aujourd'hui
  const cartesDues = (toutesCartes as Array<{ id: number; chapitre_id: number }>).filter((carte) => {
    const prochaine = progressionMap.get(carte.id)
    if (!prochaine) return true // jamais commencée → due
    return prochaine <= aujourd_hui
  })

  if (cartesDues.length === 0) return NextResponse.json({ chapitres: [] })

  // ── Grouper les cartes dues par chapitre ─────────────────────────────────
  const compteParChapitre = new Map<number, number>()
  for (const carte of cartesDues) {
    compteParChapitre.set(carte.chapitre_id, (compteParChapitre.get(carte.chapitre_id) ?? 0) + 1)
  }

  const chapitreIds = Array.from(compteParChapitre.keys())

  // ── Noms des chapitres ───────────────────────────────────────────────────
  const { data: chapitres } = await admin
    .from("chapitre")
    .select("id, nom")
    .in("id", chapitreIds)

  const chapitresMap = new Map<number, string>()
  for (const ch of (chapitres ?? []) as Array<{ id: number; nom: string }>) {
    chapitresMap.set(ch.id, ch.nom)
  }

  // ── Générer les tokens 8h ────────────────────────────────────────────────
  const authId = eleveInfo?.auth_id
  const repetiboxUrl = process.env.NEXT_PUBLIC_REPETIBOX_URL || "https://leitner-app-kohl.vercel.app"

  const resultats = []
  for (const [chapitreId, nbCartes] of compteParChapitre) {
    const chapitreNom = chapitresMap.get(chapitreId) ?? `Chapitre ${chapitreId}`
    let tokenUrl = `${repetiboxUrl}/eleve/revision/leitner?chapitre=${chapitreId}`

    if (authId) {
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
      const { data: tokenData } = await admin
        .from("qr_tokens")
        .insert({ eleve_auth_id: authId, expires_at: expiresAt })
        .select("token")
        .single()

      if (tokenData?.token) {
        tokenUrl = `${repetiboxUrl}/eleve/revision/leitner?chapitre=${chapitreId}&token=${tokenData.token}`
      }
    }

    resultats.push({ chapitre_id: chapitreId, chapitre_nom: chapitreNom, nb_cartes_dues: nbCartes, token_url: tokenUrl })
  }

  return NextResponse.json({ chapitres: resultats })
}
