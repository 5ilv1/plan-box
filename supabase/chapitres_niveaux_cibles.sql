-- ============================================================
-- Plan Box — Affectation multi-niveaux pour les livres
-- ============================================================
-- Un livre (chapitre lecture) peut être affecté à plusieurs niveaux
-- (ex. ['CE2', 'CM1']). Si le tableau est NULL ou vide, l'API tombe
-- en fallback sur chapitres.niveau_id (rétro-compat pour les livres
-- déjà créés avant cette migration).

ALTER TABLE chapitres ADD COLUMN IF NOT EXISTS niveaux_cibles text[];
