import { NextRequest, NextResponse } from "next/server";
import { GET as problemeDuJour } from "@/app/api/daily-problem/route";
import { GET as calculDuJour } from "@/app/api/calcul-du-jour/route";
import { GET as monPlanTravail } from "@/app/api/mon-plan-travail/route";
import { createAdminClient } from "@/lib/supabase-admin";
import { getServerUser } from "@/lib/server-auth";

// GET /api/eleve/chargement?rb=<id>&debut=YYYY-MM-DD&fin=YYYY-MM-DD
//
// Les cinq appels que le tableau de bord d'un élève Repetibox refait à chaque
// retour d'activité, en UNE fonction Vercel au lieu de cinq (quota gratuit).
//
// ⚠️ Aucune logique ici : chaque morceau est la réponse de la route d'origine,
// appelée telle quelle. Une seule source de vérité — une correction dans
// daily-problem ou mon-plan-travail vaut aussi pour ce regroupement. Les
// routes appelées lisent la session par les cookies de CETTE requête.
//
// Chaque morceau porte son statut : l'échec de l'un n'emporte pas les autres,
// exactement comme cinq appels séparés.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rb = searchParams.get("rb");
  const debut = searchParams.get("debut");
  const fin = searchParams.get("fin");
  if (!rb || !debut || !fin) {
    return NextResponse.json({ erreur: "rb, debut et fin requis" }, { status: 400 });
  }

  const sousRequete = (chemin: string) =>
    new NextRequest(new URL(chemin, req.url), { headers: req.headers });

  // Le corps de chaque réponse est recopié tel quel, sans JSON.parse ni
  // JSON.stringify : les blocs de la semaine pèsent ~200 Ko, et les décoder
  // pour les réencoder coûterait du calcul pour rien.
  const lire = async (reponse: Promise<Response>) => {
    try {
      const r = await reponse;
      const texte = await r.text();
      return `{"status":${r.status},"corps":${texte.trim() ? texte : "null"}}`;
    } catch (err) {
      console.error("[eleve/chargement]", err);
      return `{"status":500,"corps":null}`;
    }
  };

  // Réglage de classe « déblocage progressif » (lib/deblocage-eleve.ts),
  // livré ici pour ne pas coûter un appel de plus. Illisible ⇒ désactivé :
  // l'élève voit tout, comme avant.
  const lireDeblocage = async () => {
    try {
      const { data } = await createAdminClient()
        .from("reglage").select("valeur").eq("cle", "deblocage_progressif").maybeSingle();
      return data?.valeur === true;
    } catch { return false; }
  };

  // Dernière connexion (« connectés aujourd'hui » côté enseignant) : ici,
  // appelé à chaque ouverture du tableau de bord, et seulement quand c'est
  // l'élève lui-même. /api/revisions-repetibox-jour l'écrivait seul, mais le
  // déblocage progressif ne l'appelle plus qu'à l'étape 3.
  const noterConnexion = async () => {
    try {
      const rbId = parseInt(rb, 10);
      const user = await getServerUser();
      if (!user || !Number.isFinite(rbId)) return;
      const admin = createAdminClient();
      const { data: eleve } = await admin.from("eleve").select("auth_id").eq("id", rbId).maybeSingle();
      if (eleve?.auth_id !== user.id) return;
      await admin.from("eleves_planbox_meta").upsert(
        { repetibox_eleve_id: rbId, derniere_connexion: new Date().toISOString() },
        { onConflict: "repetibox_eleve_id" },
      );
    } catch (err) { console.error("[eleve/chargement] derniere_connexion:", err); }
  };

  const rbQ = encodeURIComponent(rb);
  const [probleme, calcul, semaine, exos, podcasts, deblocage] = await Promise.all([
    lire(problemeDuJour()),
    lire(calculDuJour()),
    lire(monPlanTravail(sousRequete(`/api/mon-plan-travail?rb=${rbQ}&debut=${encodeURIComponent(debut)}&fin=${encodeURIComponent(fin)}`))),
    lire(monPlanTravail(sousRequete(`/api/mon-plan-travail?rb=${rbQ}&types=exercice,calcul_mental,eval&avecChapitre=1`))),
    lire(monPlanTravail(sousRequete(`/api/mon-plan-travail?rb=${rbQ}&types=ressource&avecQcm=1&limite=4&leger=1`))),
    lireDeblocage(),
    noterConnexion(),
  ]);

  return new Response(
    `{"probleme":${probleme},"calcul":${calcul},"semaine":${semaine},"exos":${exos},"podcasts":${podcasts},"deblocage":${deblocage}}`,
    { headers: { "Content-Type": "application/json" } },
  );
}
