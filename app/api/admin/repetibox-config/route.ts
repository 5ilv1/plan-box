import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase-admin"

// GET → { configs: [{ id, groupe_id, eleve_id, actif }] }
export async function GET() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("pb_repetibox_config")
    .select("id, groupe_id, eleve_id, repetibox_eleve_id, actif")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ configs: data ?? [] })
}

// POST { groupe_id?, eleve_id?, repetibox_eleve_id?, actif: boolean }
// Upsert : supprime l'existant puis insère
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { groupe_id, eleve_id, repetibox_eleve_id, actif } = body

  if (!groupe_id && !eleve_id && !repetibox_eleve_id) {
    return NextResponse.json({ error: "groupe_id, eleve_id ou repetibox_eleve_id requis" }, { status: 400 })
  }
  if (typeof actif !== "boolean") {
    return NextResponse.json({ error: "actif (boolean) requis" }, { status: 400 })
  }

  const admin = createAdminClient()

  // Supprimer l'existant
  if (groupe_id) {
    await admin.from("pb_repetibox_config").delete().eq("groupe_id", groupe_id)
  } else if (eleve_id) {
    await admin.from("pb_repetibox_config").delete().eq("eleve_id", eleve_id)
  } else {
    await admin.from("pb_repetibox_config").delete().eq("repetibox_eleve_id", repetibox_eleve_id)
  }

  // Insérer le nouveau
  const { error } = await admin.from("pb_repetibox_config").insert({
    groupe_id: groupe_id ?? null,
    eleve_id: eleve_id ?? null,
    repetibox_eleve_id: repetibox_eleve_id ?? null,
    actif,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?groupe_id=X ou ?eleve_id=Y ou ?repetibox_eleve_id=Z
export async function DELETE(req: NextRequest) {
  const params = new URL(req.url).searchParams
  const groupe_id = params.get("groupe_id")
  const eleve_id = params.get("eleve_id")
  const repetibox_eleve_id = params.get("repetibox_eleve_id")

  if (!groupe_id && !eleve_id && !repetibox_eleve_id) {
    return NextResponse.json({ error: "groupe_id, eleve_id ou repetibox_eleve_id requis" }, { status: 400 })
  }

  const admin = createAdminClient()

  if (groupe_id) {
    await admin.from("pb_repetibox_config").delete().eq("groupe_id", groupe_id)
  } else if (eleve_id) {
    await admin.from("pb_repetibox_config").delete().eq("eleve_id", eleve_id)
  } else {
    await admin.from("pb_repetibox_config").delete().eq("repetibox_eleve_id", repetibox_eleve_id)
  }

  return NextResponse.json({ ok: true })
}
