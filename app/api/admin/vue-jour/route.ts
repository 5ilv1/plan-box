import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireEnseignant } from "@/lib/server-auth";
import { TYPE_BLOC_CONFIG } from "@/types";

/**
 * GET /api/admin/vue-jour
 *
 * Retourne les blocs du jour groupés par niveau (CE2, CM1, CM2).
 * Utilisé pour la vue affichage en classe.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnseignant();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const dateParam = new URL(req.url).searchParams.get("date");
  const today = dateParam ?? new Date().toISOString().split("T")[0];

  // Lundi de la semaine contenant la date demandée (pour les blocs semaine "toute la semaine")
  const ref = new Date(today + "T12:00:00");
  const day = ref.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() + diffToMonday);
  const mondayStr = monday.toISOString().split("T")[0];

  // Blocs du jour précis + blocs semaine assignés le lundi (tâches "toute la semaine")
  // Les blocs semaine sur mardi/jeudi/etc. sont des tâches d'un jour précis et
  // apparaissent uniquement via la requête date_assignation = today.
  const [{ data: ptToday }, { data: ptSemaineLundi }] = await Promise.all([
    admin
      .from("plan_travail")
      .select("id, type, titre, statut, date_assignation, eleve_id, repetibox_eleve_id, chapitre_id, groupe_label, contenu")
      .eq("date_assignation", today)
      .order("created_at"),
    today !== mondayStr
      ? admin
          .from("plan_travail")
          .select("id, type, titre, statut, date_assignation, eleve_id, repetibox_eleve_id, chapitre_id, groupe_label, contenu")
          .eq("periodicite", "semaine")
          .eq("date_assignation", mondayStr)
          .order("created_at")
      : Promise.resolve({ data: [] }),
  ]);

  const allBlocs = [...(ptToday ?? []), ...(ptSemaineLundi ?? [])];

  // Récupérer les niveaux des élèves PB (via niveaux) et RB (via groupes nommés CE2/CM1/CM2)
  const pbIds = [...new Set(allBlocs.map((b: any) => b.eleve_id).filter(Boolean))] as string[];
  const rbIds = [...new Set(allBlocs.map((b: any) => b.repetibox_eleve_id).filter((id: any) => id != null))] as number[];

  // Chapitres actifs : fenêtre de 10 jours avant la date vue
  // + P'tite Règle : uniquement la plus récente par groupe
  const cutoff = new Date(today + "T00:00:00");
  cutoff.setDate(cutoff.getDate() - 10);
  const cutoffStr = cutoff.toISOString();

  const { data: chapitresData } = await admin
    .from("chapitre_assignation")
    .select("groupe_id, chapitres(id, titre, matiere, sous_matiere, date_debut), groupes(nom), created_at")
    .eq("actif", true);

  // Map groupe_nom → chapitres (max 1 rituel-orthographe = celui dont date_debut <= today le plus récent)
  const chapitresParGroupe = new Map<string, Array<{ titre: string; matiere: string; sous_matiere: string }>>();
  const rituelParGroupe = new Map<string, { titre: string; date_debut: string }>();

  for (const ca of chapitresData ?? []) {
    const groupeNom = (ca as any).groupes?.nom ?? "";
    const ch = (ca as any).chapitres;
    const caDate: string = (ca as any).created_at ?? "";
    if (!ch || !groupeNom) continue;

    if (ch.sous_matiere === "rituel-orthographe") {
      // Garder la règle dont date_debut est la plus récente sans dépasser today
      const debutStr: string = ch.date_debut ?? "";
      if (!debutStr || debutStr > today) continue; // pas encore active
      const existing = rituelParGroupe.get(groupeNom);
      if (!existing || debutStr > existing.date_debut) {
        rituelParGroupe.set(groupeNom, { titre: ch.titre, date_debut: debutStr });
      }
    } else {
      // Uniquement les chapitres assignés dans les 10 derniers jours
      if (caDate < cutoffStr) continue;
      if (!chapitresParGroupe.has(groupeNom)) chapitresParGroupe.set(groupeNom, []);
      chapitresParGroupe.get(groupeNom)!.push({ titre: ch.titre, matiere: ch.matiere ?? "", sous_matiere: ch.sous_matiere ?? "" });
    }
  }

  // Ajouter la P'tite Règle de la semaine en tête de chaque groupe
  for (const [groupeNom, regle] of rituelParGroupe) {
    if (!chapitresParGroupe.has(groupeNom)) chapitresParGroupe.set(groupeNom, []);
    chapitresParGroupe.get(groupeNom)!.unshift({ titre: regle.titre, matiere: "français", sous_matiere: "rituel-orthographe" });
  }

  const [pbRes, rbRes] = await Promise.all([
    pbIds.length > 0
      ? admin.from("eleves").select("id, niveaux(nom)").in("id", pbIds)
      : Promise.resolve({ data: [] }),
    rbIds.length > 0
      ? admin
          .from("eleve_groupe")
          .select("repetibox_eleve_id, groupes(nom)")
          .in("repetibox_eleve_id", rbIds)
      : Promise.resolve({ data: [] }),
  ]);

  // Map eleve_id / rb_id → niveau_nom
  const niveauParEleve = new Map<string, string>();

  for (const e of pbRes.data ?? []) {
    const niveauNom = (e as any).niveaux?.nom ?? "Autre";
    niveauParEleve.set(e.id, niveauNom);
  }

  const NIVEAUX_VALIDES = new Set(["CE2", "CM1", "CM2"]);
  for (const eg of rbRes.data ?? []) {
    const groupeNom = (eg as any).groupes?.nom ?? "";
    const niveau = NIVEAUX_VALIDES.has(groupeNom) ? groupeNom : "Autre";
    // clé rb_ID pour distinguer des PB
    niveauParEleve.set(`rb_${(eg as any).repetibox_eleve_id}`, niveau);
  }

  // Ordre d'affichage des niveaux
  const ORDRE_NIVEAUX = ["CE2", "CM1", "CM2"];
  const ORDRE_TYPES = ["dictee", "mots", "calcul_mental", "exercice", "eval", "texte_a_trous", "classement", "analyse_phrase", "lecture", "ecriture", "lecon_copier", "ressource", "fichier_maths", "media", "ceinture_multiplication", "libre", "repetibox"];

  // Grouper par niveau → type → titre
  const parNiveau = new Map<string, Map<string, Map<string, { nb_total: number; nb_faits: number; estPodcast: boolean }>>>();

  for (const b of allBlocs as any[]) {
    const cleNiveau = b.eleve_id ? b.eleve_id : (b.repetibox_eleve_id ? `rb_${b.repetibox_eleve_id}` : null);
    const niveau = cleNiveau
      ? (niveauParEleve.get(cleNiveau) ?? "Autre")
      : (NIVEAUX_VALIDES.has(b.groupe_label) ? b.groupe_label : "Autre");
    if (!parNiveau.has(niveau)) parNiveau.set(niveau, new Map());
    const parType = parNiveau.get(niveau)!;
    if (!parType.has(b.type)) parType.set(b.type, new Map());
    const parTitre = parType.get(b.type)!;
    const estPodcast = b.type === "ressource" && !!(b.contenu as any)?.qcm_id;
    if (!parTitre.has(b.titre)) parTitre.set(b.titre, { nb_total: 0, nb_faits: 0, estPodcast });
    const entry = parTitre.get(b.titre)!;
    entry.nb_total++;
    if (b.statut === "fait") entry.nb_faits++;
  }

  // Construire la réponse
  const niveaux: Array<{
    nom: string;
    blocs: Array<{ type: string; libelle: string; icone: string; couleur: string; titre: string; nb_total: number; nb_faits: number }>;
    chapitres: Array<{ titre: string; matiere: string; sous_matiere: string }>;
  }> = [];

  const allNiveaux = [...parNiveau.keys()]
    .filter((n) => ORDRE_NIVEAUX.includes(n))
    .sort((a, b) => ORDRE_NIVEAUX.indexOf(a) - ORDRE_NIVEAUX.indexOf(b));

  for (const niveauNom of allNiveaux) {
    const parType = parNiveau.get(niveauNom)!;
    const blocs: typeof niveaux[0]["blocs"] = [];

    const types = [...parType.keys()].sort((a, b) => {
      const ia = ORDRE_TYPES.indexOf(a);
      const ib = ORDRE_TYPES.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    for (const type of types) {
      const parTitre = parType.get(type)!;
      for (const [titre, counts] of parTitre) {
        const isPodcast = type === "ressource" && counts.estPodcast;
        const cfg = isPodcast
          ? { libelle: "Podcast", icone: "headphones", couleur: "#7C3AED" }
          : (TYPE_BLOC_CONFIG[type as keyof typeof TYPE_BLOC_CONFIG] ?? { libelle: type, icone: "assignment", couleur: "#6B7280" });
        blocs.push({ type, libelle: cfg.libelle, icone: cfg.icone, couleur: cfg.couleur, titre, nb_total: counts.nb_total, nb_faits: counts.nb_faits });
      }
    }

    const chapitres = chapitresParGroupe.get(niveauNom) ?? [];
    niveaux.push({ nom: niveauNom, blocs, chapitres });
  }

  return NextResponse.json({ niveaux, date: today });
}
