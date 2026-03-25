/**
 * Script à exécuter via l'API route pour ajouter la colonne niveau_plus.
 * Puisqu'on ne peut pas faire de DDL via le client Supabase,
 * exécuter ce SQL dans le SQL Editor de Supabase Dashboard :
 *
 *   ALTER TABLE eleve ADD COLUMN IF NOT EXISTS niveau_plus BOOLEAN DEFAULT false;
 *
 * Puis lancer ce script pour vérifier.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SECRET_KEY!;
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data, error } = await admin.from("eleve").select("id, prenom, niveau_plus").limit(3);
  if (error) {
    console.error("❌ La colonne niveau_plus n'existe pas encore.");
    console.error("Exécute ce SQL dans Supabase Dashboard :");
    console.error("  ALTER TABLE eleve ADD COLUMN IF NOT EXISTS niveau_plus BOOLEAN DEFAULT false;");
  } else {
    console.log("✅ Colonne niveau_plus existe :", JSON.stringify(data, null, 2));
  }
}

main();
