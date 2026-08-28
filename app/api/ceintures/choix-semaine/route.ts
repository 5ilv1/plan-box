import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireProprietaireOuEnseignant } from "@/lib/server-auth";
import { etatCeintures, lireEleve, type EleveRef } from "@/lib/ceintures-serveur";

/** Lundi de la semaine en cours, au format YYYY-MM-DD (calcul en UTC). */
function lundiCourant(): string {
  const now = new Date();
  const jour = (now.getDay() + 6) % 7; // 0 = lundi
  const lundi = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - jour));
  return lundi.toISOString().split("T")[0];
}

function filtreEleve(eleve: EleveRef): [string, string | number] {
  return eleve.eleveId ? ["eleve_id", eleve.eleveId] : ["rb_eleve_id", eleve.rbEleveId as number];
}

/**
 * GET  → { lundi, domaines, doitChoisir, disponibles }
 * POST → enregistre les (au plus deux) domaines travaillés cette semaine.
 *
 * `doitChoisir` déclenche la fenêtre de choix sur le tableau de bord : elle
 * s'ouvre à la première connexion de la semaine, quel que soit le jour — lundi
 * d'ordinaire, mardi la semaine de la rentrée.
 */
export async function GET(req: NextRequest) {
  const eleve = lireEleve(req.nextUrl.searchParams);
  if (!eleve.eleveId && !eleve.rbEleveId) {
    return NextResponse.json({ erreur: "eleve_id ou rb_eleve_id requis" }, { status: 400 });
  }

  const auth = await requireProprietaireOuEnseignant(eleve.eleveId, eleve.rbEleveId);
  if (!auth.ok) return auth.error;

  try {
    const admin = createAdminClient();
    const lundi = lundiCourant();
    const [col, val] = filtreEleve(eleve);

    const [{ data: choix }, domaines] = await Promise.all([
      admin
        .from("ceinture_choix_semaine")
        .select("domaines, nb_modifications")
        .eq(col, val)
        .eq("lundi", lundi)
        .maybeSingle(),
      etatCeintures(eleve),
    ]);

    // Un domaine terminé n'a plus rien à travailler : il ne peut pas être choisi.
    const disponibles = domaines
      .filter((d) => !d.termine)
      .map((d) => ({
        code: d.code,
        slug: d.slug,
        nom: d.nom,
        matiere: d.matiere,
        description: d.description,
        icone: d.icone,
        commence: d.commence,
        couleurCourante: d.couleurCourante,
      }));

    const enregistres: string[] = choix?.domaines ?? [];
    const nbModifications: number = choix?.nb_modifications ?? 0;
    // Un domaine qui n'est plus disponible (terminé depuis) sort du choix.
    const codesDispo = new Set(disponibles.map((d) => d.code));
    const retenus = enregistres.filter((c) => codesDispo.has(c));

    return NextResponse.json({
      lundi,
      domaines: retenus,
      disponibles,
      // Rien à choisir s'il n'y a pas au moins deux domaines ouverts.
      doitChoisir: retenus.length === 0 && disponibles.length >= 2,
      // Le choix initial, puis un seul changement dans la semaine.
      peutChanger: retenus.length === 0 || nbModifications < 1,
      nbModifications,
    });
  } catch (e) {
    console.error("[ceintures/choix-semaine GET]", e);
    return NextResponse.json({ erreur: "Erreur de lecture" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const eleve: EleveRef = {
      eleveId: body.eleve_id || null,
      rbEleveId: body.rb_eleve_id ? Number(body.rb_eleve_id) : null,
    };

    if (!eleve.eleveId && !eleve.rbEleveId) {
      return NextResponse.json({ erreur: "eleve_id ou rb_eleve_id requis" }, { status: 400 });
    }

    const auth = await requireProprietaireOuEnseignant(eleve.eleveId, eleve.rbEleveId);
    if (!auth.ok) return auth.error;

    const demandes: unknown = body.domaines;
    if (!Array.isArray(demandes) || demandes.length === 0 || demandes.length > 2) {
      return NextResponse.json({ erreur: "Choisis un ou deux domaines." }, { status: 400 });
    }

    // On ne fait pas confiance aux codes reçus : ils doivent correspondre à des
    // domaines réellement ouverts et non terminés pour cet élève.
    const ouverts = new Set(
      (await etatCeintures(eleve)).filter((d) => !d.termine).map((d) => d.code),
    );
    const domaines = [...new Set(demandes.filter((c): c is string => typeof c === "string"))]
      .filter((c) => ouverts.has(c));

    if (domaines.length === 0) {
      return NextResponse.json({ erreur: "Aucun domaine valide." }, { status: 400 });
    }

    const admin = createAdminClient();
    const lundi = lundiCourant();
    const [col, val] = filtreEleve(eleve);

    const { data: existant } = await admin
      .from("ceinture_choix_semaine")
      .select("id, domaines, nb_modifications")
      .eq(col, val)
      .eq("lundi", lundi)
      .maybeSingle();

    // Choix initial, puis un seul changement : au-delà, la semaine est figée.
    if (existant) {
      if ((existant.nb_modifications ?? 0) >= 1) {
        return NextResponse.json(
          {
            erreur: "Tu as déjà changé tes domaines cette semaine. Tu pourras en choisir de nouveaux lundi prochain.",
            domaines: existant.domaines,
            peutChanger: false,
          },
          { status: 409 },
        );
      }

      const { error } = await admin
        .from("ceinture_choix_semaine")
        .update({ domaines, nb_modifications: 1 })
        .eq("id", existant.id);

      if (error) {
        console.error("[ceintures/choix-semaine POST]", error);
        return NextResponse.json({ erreur: error.message }, { status: 500 });
      }
      return NextResponse.json({ lundi, domaines, peutChanger: false, nbModifications: 1 });
    }

    const { error } = await admin.from("ceinture_choix_semaine").insert({
      eleve_id: eleve.eleveId,
      rb_eleve_id: eleve.rbEleveId,
      lundi,
      domaines,
    });

    if (error) {
      console.error("[ceintures/choix-semaine POST]", error);
      return NextResponse.json({ erreur: error.message }, { status: 500 });
    }

    return NextResponse.json({ lundi, domaines, peutChanger: true, nbModifications: 0 });
  } catch (e) {
    console.error("[ceintures/choix-semaine POST]", e);
    return NextResponse.json({ erreur: "Erreur d'enregistrement" }, { status: 500 });
  }
}
