import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// POST /api/upload-lecon  (multipart/form-data, champ "file")
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
    }

    const ext  = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
    const path = `lecons/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const admin  = createAdminClient();
    const bytes  = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const { error } = await admin.storage
      .from("lecons")
      .upload(path, buffer, {
        contentType: file.type || "application/pdf",
        upsert: false,
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data } = admin.storage.from("lecons").getPublicUrl(path);

    return NextResponse.json({ url: data.publicUrl, nom: file.name });
  } catch (err) {
    console.error("[upload-lecon]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
