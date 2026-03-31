"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Cette page est fusionnée dans /enseignant/admin/eleves (onglet Groupes)
export default function PageGroupesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/enseignant/admin/eleves");
  }, [router]);
  return null;
}
