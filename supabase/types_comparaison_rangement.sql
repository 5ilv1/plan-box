-- Deux nouveaux types de blocs : comparaison de nombres et rangement dans l'ordre.
-- Les trois tables qui contraignent `type` doivent les accepter, sinon
-- l'affectation, la duplication d'un bloc ou la mise en banque échouent.

alter table public.plan_travail drop constraint plan_travail_type_check;
alter table public.plan_travail add constraint plan_travail_type_check
  check (type = any (array[
    'exercice', 'calcul_mental', 'mots', 'dictee', 'correction_dictee', 'media',
    'eval', 'libre', 'ressource', 'repetibox', 'fichier_maths', 'lecon_copier',
    'ecriture', 'texte_a_trous', 'analyse_phrase', 'classement', 'comparaison',
    'rangement', 'lecture', 'qcm', 'revision', 'ecriture_contrainte',
    'ceinture_multiplication', 'probleme_maths'
  ]::text[]));

alter table public.exercice drop constraint exercice_type_check;
alter table public.exercice add constraint exercice_type_check
  check (type = any (array[
    'exercice', 'calcul_mental', 'texte_a_trous', 'analyse_phrase', 'qcm',
    'classement', 'comparaison', 'rangement', 'ecriture_contrainte',
    'revision', 'lecture', 'probleme_maths'
  ]::text[]));

alter table public.banque_exercices drop constraint banque_exercices_type_check;
alter table public.banque_exercices add constraint banque_exercices_type_check
  check (type = any (array[
    'exercice', 'qcm', 'calcul_mental', 'mots', 'dictee', 'media', 'eval',
    'libre', 'ressource', 'repetibox', 'fichier_maths', 'lecon_copier',
    'ecriture', 'texte_a_trous', 'analyse_phrase', 'classement', 'comparaison',
    'rangement', 'lecture', 'probleme_maths'
  ]::text[]));
