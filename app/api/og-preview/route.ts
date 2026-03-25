import { NextRequest, NextResponse } from "next/server";

// GET /api/og-preview?url=<url>
export async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return NextResponse.json({ erreur: "url requis" }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PlanBox/1.0)" },
      signal: AbortSignal.timeout(5000),
    });
    const html = await res.text();

    function meta(property: string): string {
      const m =
        html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i")) ??
        html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"));
      return m?.[1] ?? "";
    }
    function metaName(name: string): string {
      const m =
        html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i")) ??
        html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"));
      return m?.[1] ?? "";
    }
    function tag(t: string): string {
      const m = html.match(new RegExp(`<${t}[^>]*>([^<]+)</${t}>`, "i"));
      return m?.[1]?.trim() ?? "";
    }

    const titre = meta("og:title") || metaName("title") || tag("title");
    const description = meta("og:description") || metaName("description");
    const image = meta("og:image");
    const siteName = meta("og:site_name");

    // Image absolue
    let imageAbs = image;
    if (image && image.startsWith("/")) {
      const base = new URL(url);
      imageAbs = `${base.origin}${image}`;
    }

    return NextResponse.json({ titre, description, image: imageAbs, siteName });
  } catch {
    return NextResponse.json({ titre: "", description: "", image: "", siteName: "" });
  }
}
