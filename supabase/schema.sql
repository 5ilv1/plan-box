-- ============================================================
-- Plan Box — Schéma Supabase
-- Projet partagé avec Repetibox (même auth.users)
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================================

-- ============================================================
-- 1. TABLES
-- ============================================================

-- Niveaux scolaires
CREATE TABLE IF NOT EXISTS niveaux (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom  text NOT NULL -- 'CE2', 'CM1', 'CM2'
);

-- Élèves (liés à auth.users existant de Repetibox)
CREATE TABLE IF NOT EXISTS eleves (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prenom     text NOT NULL,
  nom        text NOT NULL,
  niveau_id  uuid REFERENCES niveaux(id),
  created_at timestamptz DEFAULT now()
);

-- Chapitres
CREATE TABLE IF NOT EXISTS chapitres (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titre      text NOT NULL,
  matiere    text NOT NULL, -- 'maths', 'français', 'sciences', ...
  niveau_id  uuid REFERENCES niveaux(id),
  ordre      integer,
  created_at timestamptz DEFAULT now()
);

-- Plan de travail (blocs assignés à un élève)
CREATE TABLE IF NOT EXISTS plan_travail (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eleve_id         uuid NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
  titre            text NOT NULL,
  type             text NOT NULL CHECK (type IN ('exercice','calcul_mental','mots','dictee','media','eval','libre','ressource','repetibox','fichier_maths','lecon_copier','ecriture','texte_a_trous','analyse_phrase','classement','lecture')),
  -- NOTE: si la contrainte actuelle en DB n'inclut pas tous ces types, exécuter :
  -- ALTER TABLE plan_travail DROP CONSTRAINT IF EXISTS plan_travail_type_check;
  -- ALTER TABLE plan_travail ADD CONSTRAINT plan_travail_type_check
  --   CHECK (type IN ('exercice','calcul_mental','mots','dictee','media','eval','libre',
  --                    'ressource','repetibox','fichier_maths','lecon_copier','ecriture',
  --                    'texte_a_trous','analyse_phrase','classement','lecture'));
  contenu          jsonb,
  date_assignation date NOT NULL DEFAULT CURRENT_DATE,
  date_limite      date,
  statut           text NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire','en_cours','fait')),
  chapitre_id      uuid REFERENCES chapitres(id),
  created_at       timestamptz DEFAULT now()
);

-- Progression élève par chapitre (Plan Box)
-- NB : nommée pb_progression pour éviter le conflit avec la table
--      "progression" de Repetibox (colonnes user_id/carte_id/boite)
CREATE TABLE IF NOT EXISTS pb_progression (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eleve_id     uuid NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
  chapitre_id  uuid NOT NULL REFERENCES chapitres(id) ON DELETE CASCADE,
  pourcentage  integer NOT NULL DEFAULT 0 CHECK (pourcentage >= 0 AND pourcentage <= 100),
  statut       text NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours','valide','remediation')),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (eleve_id, chapitre_id)
);

-- Notifications enseignant
CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL CHECK (type IN ('chapitre_valide','eval_echec','eleve_bloque')),
  eleve_id    uuid REFERENCES eleves(id) ON DELETE CASCADE,
  chapitre_id uuid REFERENCES chapitres(id),
  message     text,
  lu          boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- ============================================================
-- 2. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE niveaux        ENABLE ROW LEVEL SECURITY;
ALTER TABLE eleves         ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapitres      ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_travail   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pb_progression ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications  ENABLE ROW LEVEL SECURITY;

-- Helper : est-ce que l'utilisateur connecté est l'enseignant ?
-- Adapte l'email ci-dessous à ton email enseignant, ou utilise une table de rôles.
CREATE OR REPLACE FUNCTION est_enseignant()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND email = current_setting('app.enseignant_email', true)
  );
$$;

-- niveaux : lecture publique (tous les connectés)
CREATE POLICY "niveaux_read" ON niveaux
  FOR SELECT TO authenticated USING (true);

-- eleves : l'élève voit seulement lui-même, l'enseignant voit tout
CREATE POLICY "eleves_self" ON eleves
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR est_enseignant());

CREATE POLICY "eleves_insert_enseignant" ON eleves
  FOR INSERT TO authenticated
  WITH CHECK (est_enseignant());

CREATE POLICY "eleves_update_enseignant" ON eleves
  FOR UPDATE TO authenticated
  USING (est_enseignant());

-- chapitres : lecture pour tous, écriture enseignant
CREATE POLICY "chapitres_read" ON chapitres
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "chapitres_write_enseignant" ON chapitres
  FOR ALL TO authenticated
  USING (est_enseignant())
  WITH CHECK (est_enseignant());

-- plan_travail : l'élève voit ses propres blocs, l'enseignant voit tout
CREATE POLICY "plan_travail_self" ON plan_travail
  FOR SELECT TO authenticated
  USING (eleve_id = auth.uid() OR est_enseignant());

CREATE POLICY "plan_travail_update_self" ON plan_travail
  FOR UPDATE TO authenticated
  USING (eleve_id = auth.uid() OR est_enseignant());

CREATE POLICY "plan_travail_insert_enseignant" ON plan_travail
  FOR INSERT TO authenticated
  WITH CHECK (est_enseignant());

-- pb_progression : l'élève voit sa pb_progression, l'enseignant voit tout
CREATE POLICY "pb_progression_self" ON pb_progression
  FOR SELECT TO authenticated
  USING (eleve_id = auth.uid() OR est_enseignant());

CREATE POLICY "pb_progression_write_enseignant" ON pb_progression
  FOR ALL TO authenticated
  USING (est_enseignant())
  WITH CHECK (est_enseignant());

CREATE POLICY "pb_progression_update_self" ON pb_progression
  FOR UPDATE TO authenticated
  USING (eleve_id = auth.uid());

-- notifications : enseignant seulement
CREATE POLICY "notifications_enseignant" ON notifications
  FOR ALL TO authenticated
  USING (est_enseignant())
  WITH CHECK (est_enseignant());


-- ============================================================
-- 3. DONNÉES DE TEST
-- ============================================================

-- Pour les données de test, remplace les UUIDs des élèves par
-- de vrais user_id Supabase Auth créés manuellement
-- (Authentication > Users > Invite user dans la console Supabase)
-- ou utilise les commandes INSERT ci-dessous après création.

-- 3.1 Niveaux
INSERT INTO niveaux (id, nom) VALUES
  ('11111111-0000-0000-0000-000000000001', 'CE2'),
  ('11111111-0000-0000-0000-000000000002', 'CM1'),
  ('11111111-0000-0000-0000-000000000003', 'CM2')
ON CONFLICT DO NOTHING;

-- 3.2 Chapitres
INSERT INTO chapitres (id, titre, matiere, niveau_id, ordre) VALUES
  ('22222222-0000-0000-0000-000000000001', 'La multiplication posée', 'maths', '11111111-0000-0000-0000-000000000001', 1),
  ('22222222-0000-0000-0000-000000000002', 'Les temps du passé', 'français', '11111111-0000-0000-0000-000000000002', 1),
  ('22222222-0000-0000-0000-000000000003', 'Les fractions décimales', 'maths', '11111111-0000-0000-0000-000000000003', 1)
ON CONFLICT DO NOTHING;

-- ============================================================
-- INSTRUCTIONS POUR LES DONNÉES ÉLÈVES & PLAN DE TRAVAIL
-- ============================================================
--
-- 1. Crée 5 comptes élèves dans Authentication > Users :
--    - lea.martin@ecole-test.fr  (CE2)
--    - tom.bernard@ecole-test.fr (CE2)
--    - emma.dupont@ecole-test.fr (CM1)
--    - lucas.petit@ecole-test.fr (CM1)
--    - chloe.moreau@ecole-test.fr (CM2)
--
-- 2. Récupère leurs UUID dans la console, puis exécute :
--
-- INSERT INTO eleves (id, prenom, nom, niveau_id) VALUES
--   ('<UUID_LEA>',   'Léa',   'Martin',  '11111111-0000-0000-0000-000000000001'),
--   ('<UUID_TOM>',   'Tom',   'Bernard', '11111111-0000-0000-0000-000000000001'),
--   ('<UUID_EMMA>',  'Emma',  'Dupont',  '11111111-0000-0000-0000-000000000002'),
--   ('<UUID_LUCAS>', 'Lucas', 'Petit',   '11111111-0000-0000-0000-000000000002'),
--   ('<UUID_CHLOE>', 'Chloé', 'Moreau',  '11111111-0000-0000-0000-000000000003');
--
-- 3. Ajoute des blocs plan_travail pour aujourd'hui (remplace CURRENT_DATE si besoin) :
--
-- INSERT INTO plan_travail (eleve_id, titre, type, date_assignation, statut, chapitre_id) VALUES
--   ('<UUID_LEA>', 'Ex. 4 p.52 — Tables de multiplication',  'exercice', CURRENT_DATE, 'a_faire', '22222222-0000-0000-0000-000000000001'),
--   ('<UUID_LEA>', 'Calcul mental — série C',                'calcul_mental', CURRENT_DATE, 'fait', NULL),
--   ('<UUID_TOM>', 'Fiche mots à apprendre — liste 8',       'mots', CURRENT_DATE, 'a_faire', NULL),
--   ('<UUID_TOM>', 'Ex. 4 p.52 — Tables de multiplication',  'exercice', CURRENT_DATE, 'en_cours', '22222222-0000-0000-0000-000000000001'),
--   ('<UUID_EMMA>','Conjugaison — imparfait et passé simple', 'exercice', CURRENT_DATE, 'a_faire', '22222222-0000-0000-0000-000000000002'),
--   ('<UUID_EMMA>','Dictée préparée n°6',                    'dictee', CURRENT_DATE + 2, 'a_faire', NULL);
--
-- 4. Progressions :
--
-- INSERT INTO pb_progression (eleve_id, chapitre_id, pourcentage, statut) VALUES
--   ('<UUID_LEA>',   '22222222-0000-0000-0000-000000000001', 65, 'en_cours'),
--   ('<UUID_TOM>',   '22222222-0000-0000-0000-000000000001', 30, 'en_cours'),
--   ('<UUID_EMMA>',  '22222222-0000-0000-0000-000000000002', 80, 'en_cours'),
--   ('<UUID_LUCAS>', '22222222-0000-0000-0000-000000000002', 100, 'valide'),
--   ('<UUID_CHLOE>', '22222222-0000-0000-0000-000000000003', 45, 'remediation');
--
-- 5. Notifications :
--
-- INSERT INTO notifications (type, eleve_id, chapitre_id, message) VALUES
--   ('chapitre_valide', '<UUID_LUCAS>', '22222222-0000-0000-0000-000000000002', 'Lucas a validé "Les temps du passé" avec 100% !'),
--   ('eleve_bloque',    '<UUID_CHLOE>', '22222222-0000-0000-0000-000000000003', 'Chloé est en difficulté sur les fractions décimales.');
--
-- ============================================================
