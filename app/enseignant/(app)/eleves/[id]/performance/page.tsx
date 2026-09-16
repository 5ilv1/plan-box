import { redirect } from "next/navigation";

/**
 * L'ancienne fiche « performance » est devenue la vue élève du suivi.
 * L'icône « insights » de la page Élèves & Groupes pointe toujours ici.
 */
export default async function PagePerformanceEleve({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/enseignant/suivi?eleve=${encodeURIComponent(id)}`);
}
