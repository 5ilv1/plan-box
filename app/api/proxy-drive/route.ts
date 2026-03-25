import { NextRequest, NextResponse } from "next/server";

// GET /api/proxy-drive?url=ENCODED_GOOGLE_DRIVE_URL
// Gère les deux cas Google Drive :
//  - Petit fichier : réponse directe en bytes
//  - Grand fichier : page HTML de confirmation → extrait le token → 2e requête
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "url requis" }, { status: 400 });

  // ── Extraire l'ID et construire l'URL de téléchargement ──────────────────
  let fileId: string | null = null;
  let downloadUrl: string;

  // Google Docs / Slides / Sheets → export PDF direct
  const docsMatch = raw.match(
    /docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([^/?#]+)/
  );
  if (docsMatch) {
    const [, type, id] = docsMatch;
    downloadUrl = `https://docs.google.com/${type}/d/${id}/export?format=pdf`;
  } else {
    // Google Drive fichier
    const driveMatch = raw.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
    fileId = driveMatch?.[1] ?? null;
    downloadUrl = fileId
      ? `https://drive.google.com/uc?export=download&id=${fileId}`
      : raw;
  }

  const UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  try {
    // ── Première requête ──────────────────────────────────────────────────
    const r1 = await fetch(downloadUrl, {
      headers: { "User-Agent": UA },
      redirect: "follow",
    });

    if (!r1.ok) {
      return NextResponse.json({ error: `Google a répondu ${r1.status}` }, { status: r1.status });
    }

    const ct1 = r1.headers.get("content-type") ?? "";

    // Fichier servi directement (pas de page de confirmation)
    if (!ct1.includes("text/html")) {
      const bytes = await r1.arrayBuffer();
      return pdfResponse(bytes);
    }

    // ── Page de confirmation : extraire token + cookie ────────────────────
    const html = await r1.text();

    // Token "confirm"
    const confirmMatch =
      html.match(/name="confirm"\s+value="([^"]+)"/) ??
      html.match(/confirm=([0-9A-Za-z_\-]+)/);
    const confirm = confirmMatch?.[1] ?? "t";

    // UUID (parfois présent)
    const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/);
    const uuid = uuidMatch?.[1];

    // Cookie renvoyé par Google (NID, download_warning…)
    const setCookie = r1.headers.get("set-cookie") ?? "";
    const cookieHeader = setCookie
      .split(",")
      .map((c) => c.split(";")[0].trim())
      .join("; ");

    // ── Deuxième requête avec le confirm token ────────────────────────────
    const url2 = new URL(downloadUrl);
    url2.searchParams.set("confirm", confirm);
    if (uuid) url2.searchParams.set("uuid", uuid);

    const r2 = await fetch(url2.toString(), {
      headers: {
        "User-Agent": UA,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      redirect: "follow",
    });

    if (!r2.ok) {
      return NextResponse.json({ error: `Confirmation échouée : ${r2.status}` }, { status: r2.status });
    }

    const ct2 = r2.headers.get("content-type") ?? "";
    if (ct2.includes("text/html")) {
      return NextResponse.json(
        { error: "Google exige une authentification. Vérifiez le partage public du fichier." },
        { status: 403 }
      );
    }

    const bytes2 = await r2.arrayBuffer();
    return pdfResponse(bytes2);

  } catch (err) {
    console.error("[proxy-drive]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

function pdfResponse(bytes: ArrayBuffer) {
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": "inline",
    },
  });
}
