"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RedirectExercices() {
  const router = useRouter();
  useEffect(() => { router.replace("/enseignant/bibliotheque?onglet=exercices"); }, []);
  return null;
}
