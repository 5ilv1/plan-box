-- ============================================================
-- Groupes partagés Plan Box / Repetibox
-- Tables partagées dans le même projet Supabase
-- À exécuter dans l'éditeur SQL Supabase (une seule fois)
-- ============================================================

-- 1. Table des groupes
CREATE TABLE IF NOT EXISTS groupes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom        text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 2. Table de liaison élève ↔ groupe
CREATE TABLE IF NOT EXISTS eleve_groupe (
  eleve_id   uuid REFERENCES eleves(id) ON DELETE CASCADE,
  groupe_id  uuid REFERENCES groupes(id) ON DELETE CASCADE,
  PRIMARY KEY (eleve_id, groupe_id)
);

-- 3. RLS
ALTER TABLE groupes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE eleve_groupe ENABLE ROW LEVEL SECURITY;

-- Lecture groupes : tout utilisateur authentifié
CREATE POLICY "groupes_lecture" ON groupes
  FOR SELECT TO authenticated USING (true);

-- Écriture groupes : enseignant seulement
CREATE POLICY "groupes_ecriture" ON groupes
  FOR ALL TO authenticated
  USING (est_enseignant())
  WITH CHECK (est_enseignant());

-- Lecture eleve_groupe : enseignant OU l'élève lui-même
CREATE POLICY "eleve_groupe_lecture" ON eleve_groupe
  FOR SELECT TO authenticated
  USING (est_enseignant() OR eleve_id = auth.uid());

-- Écriture eleve_groupe : enseignant seulement
CREATE POLICY "eleve_groupe_ecriture" ON eleve_groupe
  FOR ALL TO authenticated
  USING (est_enseignant())
  WITH CHECK (est_enseignant());

-- 4. Données de démo (optionnel — à supprimer en prod)
-- INSERT INTO groupes (nom) VALUES ('CE2'), ('CM1'), ('CM2'), ('Groupe lecture');
