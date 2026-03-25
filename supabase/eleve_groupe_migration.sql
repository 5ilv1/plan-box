-- ============================================================
-- Migration : eleve_groupe avec support deux sources d'élèves
-- Plan Box (eleves, UUID) ET Repetibox (eleve, integer)
-- À exécuter dans l'éditeur SQL Supabase
-- ============================================================

-- 1. Supprimer l'ancienne table (créée vide lors de la session précédente)
DROP TABLE IF EXISTS eleve_groupe;

-- 2. Recréer avec deux FK optionnelles
CREATE TABLE eleve_groupe (
  groupe_id           uuid    NOT NULL REFERENCES groupes(id) ON DELETE CASCADE,

  -- Élève Plan Box (UUID, table "eleves")
  planbox_eleve_id    uuid    REFERENCES eleves(id)  ON DELETE CASCADE,

  -- Élève Repetibox (integer, table "eleve")
  repetibox_eleve_id  integer REFERENCES eleve(id)   ON DELETE CASCADE,

  -- Exactement une des deux sources doit être renseignée
  CONSTRAINT eleve_source_check CHECK (
    (planbox_eleve_id IS NOT NULL)::int
    + (repetibox_eleve_id IS NOT NULL)::int = 1
  )
);

-- 3. Index d'unicité (un élève ne peut être dans un groupe qu'une seule fois)
CREATE UNIQUE INDEX eg_planbox_unique
  ON eleve_groupe (groupe_id, planbox_eleve_id)
  WHERE planbox_eleve_id IS NOT NULL;

CREATE UNIQUE INDEX eg_repetibox_unique
  ON eleve_groupe (groupe_id, repetibox_eleve_id)
  WHERE repetibox_eleve_id IS NOT NULL;

-- 4. RLS
ALTER TABLE eleve_groupe ENABLE ROW LEVEL SECURITY;

-- Lecture : enseignant voit tout ; élève Plan Box voit ses propres lignes
CREATE POLICY "eleve_groupe_lecture" ON eleve_groupe
  FOR SELECT TO authenticated
  USING (est_enseignant() OR planbox_eleve_id = auth.uid());

-- Écriture : enseignant seulement
CREATE POLICY "eleve_groupe_ecriture" ON eleve_groupe
  FOR ALL TO authenticated
  USING (est_enseignant())
  WITH CHECK (est_enseignant());
