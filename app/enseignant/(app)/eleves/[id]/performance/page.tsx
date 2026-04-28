"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import PortraitSuivi from "@/components/PortraitSuivi";

export default function PageSuiviEleve({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const from = searchParams.get("from");

  const retour = from === "bilan"
    ? { href: "/enseignant/bilan", label: "Retour au bilan classe" }
    : { href: "/enseignant/admin/eleves", label: "Retour aux élèves" };

  return <PortraitSuivi cible="eleve" id={id} retourHref={retour.href} retourLabel={retour.label} />;
}
