import { redirect } from "next/navigation";

/** L'ancien « Bilan de classe » est devenu `/enseignant/suivi`. */
export default function PageBilanClasse() {
  redirect("/enseignant/suivi");
}
