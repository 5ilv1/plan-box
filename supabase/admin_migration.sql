-- ============================================================
-- Plan Box — Migration module Administration
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================================

-- 1. Métadonnées Plan Box pour les élèves Repetibox
--    (niveau d'étoiles — géré depuis Plan Box uniquement)
CREATE TABLE IF NOT EXISTS eleves_planbox_meta (
  repetibox_eleve_id  integer PRIMARY KEY,
  niveau_etoiles      integer CHECK (niveau_etoiles BETWEEN 1 AND 4),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE eleves_planbox_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_enseignant" ON eleves_planbox_meta
  FOR ALL TO authenticated
  USING (est_enseignant())
  WITH CHECK (est_enseignant());

-- 2. Nouvelles colonnes sur chapitres
ALTER TABLE chapitres ADD COLUMN IF NOT EXISTS description      text;
ALTER TABLE chapitres ADD COLUMN IF NOT EXISTS nb_cartes_eval   integer DEFAULT 20;
ALTER TABLE chapitres ADD COLUMN IF NOT EXISTS seuil_reussite   integer DEFAULT 90;
