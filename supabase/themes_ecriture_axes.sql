-- Les axes choisis par le code pour chaque thème d'écriture (lib/theme-ecriture-variete.ts),
-- notés à la génération plutôt que relus dans le texte (29/10/2026).
alter table themes_ecriture add column if not exists univers text;
alter table themes_ecriture add column if not exists famille_contrainte text;
