-- ============================================================
-- Plan Box — Banque d'exercices (Phase 2)
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS banque_exercices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type           text NOT NULL CHECK (type IN ('exercice', 'calcul_mental')),
  matiere        text,                          -- 'maths', 'français'
  niveau_id      uuid REFERENCES niveaux(id),
  chapitre_id    uuid REFERENCES chapitres(id),
  titre          text,
  contenu        jsonb NOT NULL,
  nb_utilisations integer DEFAULT 1,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE banque_exercices ENABLE ROW LEVEL SECURITY;

-- Seul l'enseignant peut lire/écrire la banque
CREATE POLICY "banque_ens" ON banque_exercices
  FOR ALL TO authenticated
  USING (est_enseignant())
  WITH CHECK (est_enseignant());
