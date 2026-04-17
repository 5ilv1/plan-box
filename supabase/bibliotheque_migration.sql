-- ============================================================
-- Plan Box — Migration bibliothèque numérique
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================================

-- 1. Nouvelles colonnes sur chapitres pour les livres
ALTER TABLE chapitres ADD COLUMN IF NOT EXISTS couverture_url          text;
ALTER TABLE chapitres ADD COLUMN IF NOT EXISTS resume                  text;
ALTER TABLE chapitres ADD COLUMN IF NOT EXISTS auteur                  text;
ALTER TABLE chapitres ADD COLUMN IF NOT EXISTS disponible_bibliotheque boolean DEFAULT false;

-- 2. Table des livres choisis par les élèves (auto-assignation bibliothèque)
CREATE TABLE IF NOT EXISTS eleve_bibliotheque_choix (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapitre_id   uuid NOT NULL REFERENCES chapitres(id) ON DELETE CASCADE,
  eleve_id      uuid REFERENCES eleves(id) ON DELETE CASCADE,
  rb_eleve_id   integer REFERENCES eleve(id) ON DELETE CASCADE,
  choisi_le     timestamptz DEFAULT now(),
  CONSTRAINT eleve_ou_rb CHECK (
    (eleve_id IS NOT NULL AND rb_eleve_id IS NULL) OR
    (eleve_id IS NULL AND rb_eleve_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ebc_eleve_chap
  ON eleve_bibliotheque_choix (eleve_id, chapitre_id)
  WHERE eleve_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ebc_rb_chap
  ON eleve_bibliotheque_choix (rb_eleve_id, chapitre_id)
  WHERE rb_eleve_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ebc_chap ON eleve_bibliotheque_choix (chapitre_id);

ALTER TABLE eleve_bibliotheque_choix ENABLE ROW LEVEL SECURITY;

-- L'enseignant voit tous les choix
CREATE POLICY "ebc_enseignant_all" ON eleve_bibliotheque_choix
  FOR ALL TO authenticated
  USING (est_enseignant())
  WITH CHECK (est_enseignant());

-- L'élève voit/crée/supprime ses propres choix
CREATE POLICY "ebc_eleve_select" ON eleve_bibliotheque_choix
  FOR SELECT TO authenticated
  USING (eleve_id = auth.uid());

CREATE POLICY "ebc_eleve_insert" ON eleve_bibliotheque_choix
  FOR INSERT TO authenticated
  WITH CHECK (eleve_id = auth.uid());

CREATE POLICY "ebc_eleve_delete" ON eleve_bibliotheque_choix
  FOR DELETE TO authenticated
  USING (eleve_id = auth.uid());

-- 3. Bucket de stockage pour les couvertures de livres
INSERT INTO storage.buckets (id, name, public)
VALUES ('couvertures', 'couvertures', true)
ON CONFLICT (id) DO NOTHING;

-- Politique : tout le monde peut lire (bucket public)
-- Seul l'enseignant peut uploader
CREATE POLICY "couvertures_upload_enseignant"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'couvertures' AND est_enseignant());

CREATE POLICY "couvertures_update_enseignant"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'couvertures' AND est_enseignant());

CREATE POLICY "couvertures_delete_enseignant"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'couvertures' AND est_enseignant());
