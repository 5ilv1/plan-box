import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";

const anthropic = new Anthropic({ apiKey: process.env.PB_ANTHROPIC_KEY });

interface OpenLibraryDoc {
  title?: string;
  author_name?: string[];
  cover_i?: number;
  key?: string;
  language?: string[];
  first_publish_year?: number;
}

export async function POST(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  try {
    const { chapitre_id } = await req.json().catch(() => ({}));
    if (!chapitre_id) {
      return NextResponse.json({ error: "chapitre_id requis" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: ch } = await admin
      .from("chapitres")
      .select("titre, auteur")
      .eq("id", chapitre_id)
      .single();

    if (!ch) {
      return NextResponse.json({ error: "Chapitre introuvable" }, { status: 404 });
    }

    const titre = ch.titre as string;
    const auteurSaisi = (ch.auteur as string | null) ?? null;

    // 1) Open Library — récupère couverture + auteur (description souvent absente)
    const olInfos = await chercherOpenLibrary(titre, auteurSaisi);

    // 2) Upload couverture sur Supabase si on en a trouvé une
    let couvertureUrl: string | null = null;
    if (olInfos.couvertureUrlExterne) {
      couvertureUrl = await uploadCouvertureDepuisUrl(admin, olInfos.couvertureUrlExterne, chapitre_id);
    }

    // 3) Résumé — on privilégie Claude sur le texte réel du livre (en BDD).
    //    Fallback : description Open Library si pas encore de chapitres générés.
    const texteLivre = await recupererTexteLivre(admin, chapitre_id);
    let resume: string | null = null;
    if (texteLivre && texteLivre.length > 400) {
      resume = await genererResumeIA(titre, texteLivre);
    }
    if (!resume && olInfos.description) {
      resume = olInfos.description;
    }

    return NextResponse.json({
      couverture_url: couvertureUrl,
      resume,
      auteur: auteurSaisi ?? olInfos.auteur ?? null,
      // Hint pour le front : indique pourquoi le résumé peut manquer
      resume_source: resume
        ? (texteLivre && texteLivre.length > 400 ? "ia" : "open_library")
        : null,
      a_texte_livre: !!(texteLivre && texteLivre.length > 400),
    });
  } catch (err) {
    console.error("[auto-infos]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function chercherOpenLibrary(titre: string, auteur: string | null): Promise<{
  couvertureUrlExterne: string | null;
  auteur: string | null;
  description: string | null;
}> {
  const params = new URLSearchParams({ title: titre, limit: "5" });
  if (auteur) params.set("author", auteur);

  const url = `https://openlibrary.org/search.json?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return { couvertureUrlExterne: null, auteur: null, description: null };
    const data = (await res.json()) as { docs?: OpenLibraryDoc[] };

    const docs = data.docs ?? [];
    // Préférer un résultat en français avec une couverture
    const best =
      docs.find((d) => d.cover_i && d.language?.includes("fre")) ??
      docs.find((d) => d.cover_i) ??
      docs[0];

    if (!best) return { couvertureUrlExterne: null, auteur: null, description: null };

    const coverUrl = best.cover_i
      ? `https://covers.openlibrary.org/b/id/${best.cover_i}-L.jpg`
      : null;

    // Description : 2e appel sur /works/{key}.json si on a une key
    let description: string | null = null;
    if (best.key) {
      description = await recupererDescriptionOpenLibrary(best.key);
    }

    return {
      couvertureUrlExterne: coverUrl,
      auteur: best.author_name?.[0] ?? null,
      description,
    };
  } catch (err) {
    console.warn("[auto-infos] Open Library failed", err);
    return { couvertureUrlExterne: null, auteur: null, description: null };
  }
}

async function recupererDescriptionOpenLibrary(workKey: string): Promise<string | null> {
  try {
    const res = await fetch(`https://openlibrary.org${workKey}.json`);
    if (!res.ok) return null;
    const data = (await res.json()) as { description?: string | { value?: string } };
    const desc = data.description;
    if (!desc) return null;
    const texte = typeof desc === "string" ? desc : desc.value ?? null;
    if (!texte || texte.length < 40) return null;
    // Nettoyer les éventuelles références Wikipedia ou crédits en fin de description
    return texte.split(/\(\[source\]|--+|\[[12]?\]/)[0].trim();
  } catch {
    return null;
  }
}

async function uploadCouvertureDepuisUrl(
  admin: ReturnType<typeof createAdminClient>,
  url: string,
  chapitreId: string
): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const path = `${chapitreId}_${Date.now()}.jpg`;

    const { error } = await admin.storage
      .from("couvertures")
      .upload(path, buffer, { contentType: "image/jpeg", upsert: false });
    if (error) {
      console.warn("[auto-infos] upload cover failed", error.message);
      return null;
    }

    const { data: { publicUrl } } = admin.storage.from("couvertures").getPublicUrl(path);
    return publicUrl;
  } catch (err) {
    console.warn("[auto-infos] download cover failed", err);
    return null;
  }
}

async function recupererTexteLivre(
  admin: ReturnType<typeof createAdminClient>,
  chapitreId: string
): Promise<string | null> {
  const { data } = await admin
    .from("exercice")
    .select("contenu, ordre")
    .eq("chapitre_id", chapitreId)
    .order("ordre");

  if (!data?.length) return null;

  // Concatène les textes des 3 premiers chapitres de lecture (hors éval finale)
  const morceaux: string[] = [];
  for (const ex of data) {
    const c = ex.contenu as { texte?: string; est_evaluation_finale?: boolean };
    if (c?.est_evaluation_finale) continue;
    if (typeof c?.texte === "string") morceaux.push(c.texte);
    if (morceaux.length >= 3) break;
  }
  if (!morceaux.length) return null;

  // Limiter à ~1500 mots
  const texte = morceaux.join("\n\n").split(/\s+/).slice(0, 1500).join(" ");
  return texte;
}

async function genererResumeIA(titre: string, texte: string): Promise<string | null> {
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `Tu es un enseignant de cycle 3 (CE2/CM1/CM2). Rédige un résumé accrocheur de 2 à 3 phrases pour donner envie à un élève de 8-11 ans de lire ce livre intitulé « ${titre} ». Reste fidèle au texte, évite de spoiler la fin. Réponds UNIQUEMENT avec le résumé, sans préambule ni guillemets.

Voici le début du livre :

${texte}`,
        },
      ],
    });

    const bloc = msg.content.find((b) => b.type === "text");
    if (!bloc || bloc.type !== "text") return null;
    return bloc.text.trim();
  } catch (err) {
    console.warn("[auto-infos] resume IA failed", err);
    return null;
  }
}
