-- ============================================================
-- Correctif RLS : table "eleve" (Repetibox)
-- Problème : RLS activé sans politique pour les sessions "authenticated"
--            → l'enseignant connecté dans Plan Box obtient 0 lignes sans erreur
-- Solution  : ajouter une politique de lecture pour l'enseignant
-- À exécuter dans l'éditeur SQL Supabase
-- ============================================================

-- ─── DIAGNOSTIC (exécute d'abord ces deux requêtes pour comprendre l'état) ──
-- 1) Vérifier si RLS est activé sur la table eleve :
--    SELECT relrowsecurity FROM pg_class WHERE relname = 'eleve';
--    → true = RLS activé  /  false = RLS désactivé (dans ce cas ce script n'est pas nécessaire)
--
-- 2) Lister les politiques existantes :
--    SELECT policyname, roles, cmd, qual FROM pg_policies WHERE tablename = 'eleve';

-- ─── CORRECTIF ────────────────────────────────────────────────────────────────

-- Politique : l'enseignant (session authenticated) peut lire tous les élèves Repetibox
-- La fonction est_enseignant() est déjà définie dans ce projet Supabase.
-- Elle vérifie que auth.email() correspond à l'email enseignant configuré.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'eleve'
      AND policyname = 'eleve_lecture_enseignant_planbox'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "eleve_lecture_enseignant_planbox" ON eleve
        FOR SELECT TO authenticated
        USING (est_enseignant())
    $policy$;
    RAISE NOTICE 'Politique "eleve_lecture_enseignant_planbox" créée.';
  ELSE
    RAISE NOTICE 'Politique "eleve_lecture_enseignant_planbox" existe déjà, rien à faire.';
  END IF;
END $$;

-- ─── VÉRIFICATION ─────────────────────────────────────────────────────────────
-- Après exécution, vérifie que la politique apparaît bien :
--   SELECT policyname, roles, cmd FROM pg_policies WHERE tablename = 'eleve';
--
-- Puis retourne dans Plan Box → page Groupes : les élèves Repetibox doivent apparaître.
