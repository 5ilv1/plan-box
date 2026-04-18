-- ============================================================
-- Plan Box — Ajout du type 'lecture' à la contrainte exercice.type
-- ============================================================
-- Contexte : le commit 5622fbc a ajouté le type "lecture" côté code
-- (TYPES_VALIDES dans /api/chapitres/exercices), mais la CHECK
-- constraint de la table exercice ne l'autorisait pas → 500 sur POST.

ALTER TABLE exercice DROP CONSTRAINT IF EXISTS exercice_type_check;

ALTER TABLE exercice ADD CONSTRAINT exercice_type_check
  CHECK (type = ANY (ARRAY[
    'exercice'::text,
    'calcul_mental'::text,
    'texte_a_trous'::text,
    'analyse_phrase'::text,
    'qcm'::text,
    'classement'::text,
    'ecriture_contrainte'::text,
    'revision'::text,
    'lecture'::text
  ]));
