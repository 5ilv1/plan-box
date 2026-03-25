-- ============================================================
-- Migration : plan_travail — support élèves Repetibox
-- Ajoute repetibox_eleve_id (integer) et rend eleve_id nullable
-- Au moins l'un des deux doit être renseigné (CHECK constraint)
-- À exécuter dans l'éditeur SQL Supabase
-- ============================================================

-- 1. Ajouter la colonne pour les élèves Repetibox (integer)
ALTER TABLE plan_travail
  ADD COLUMN IF NOT EXISTS repetibox_eleve_id INTEGER REFERENCES eleve(id) ON DELETE SET NULL;

-- 2. Rendre eleve_id nullable (était NOT NULL)
ALTER TABLE plan_travail
  ALTER COLUMN eleve_id DROP NOT NULL;

-- 3. Contrainte : au moins un des deux doit être renseigné
ALTER TABLE plan_travail
  ADD CONSTRAINT plan_travail_eleve_check CHECK (
    (eleve_id IS NOT NULL) OR (repetibox_eleve_id IS NOT NULL)
  );

-- 4. Index pour les requêtes par élève Repetibox
CREATE INDEX IF NOT EXISTS idx_plan_travail_rb_eleve
  ON plan_travail (repetibox_eleve_id)
  WHERE repetibox_eleve_id IS NOT NULL;

-- 5. Mettre à jour la politique RLS de lecture élève
-- (L'élève Repetibox ne peut pas se connecter à Plan Box via Supabase auth
--  donc la lecture depuis leur côté n'est pas encore gérée ici)
-- La politique existante pour les enseignants reste valide.
