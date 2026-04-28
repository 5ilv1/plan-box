"use client";

import { use } from "react";
import PortraitSuivi from "@/components/PortraitSuivi";

export default function PageSuiviEleve({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <PortraitSuivi cible="eleve" id={id} retourHref="/enseignant/admin/eleves" retourLabel="Retour aux élèves" />;
}
