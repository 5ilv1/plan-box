import type { ReactNode } from "react";

// La page est un composant client : le serveur ne rend qu'une coquille, la même
// pour tous les élèves, et les données arrivent ensuite par l'API. Sans ceci,
// ce segment dynamique serait recalculé par une fonction Vercel à chaque visite
// et à chaque préchargement de lien. Liste vide = chaque chemin est rendu à sa
// première visite, puis servi depuis le cache.
export function generateStaticParams() {
  return [];
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
