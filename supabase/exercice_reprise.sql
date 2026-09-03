-- Reprendre un exercice là où on l'a laissé.
--
-- Une ligne par élève et par chose en cours — un exercice d'entraînement, une
-- évaluation, une activité. La ligne naît à la première réponse et meurt à la
-- dernière : ce n'est pas un historique, c'est un travail en cours.
--
-- Volontairement SANS clé étrangère vers `exercice` : la clé est un texte
-- (`exercice:<uuid>`, `evaluation:<chapitre>`, `activite:<id>`) qui désigne
-- aussi bien une évaluation, qui n'est pas une ligne `exercice`. Une reprise
-- devenue orpheline ne gêne personne : plus rien ne la demande, et le ménage
-- par l'âge finit par l'emporter.
create table if not exists public.exercice_reprise (
  id          uuid primary key default gen_random_uuid(),
  eleve_id    uuid references public.eleves(id) on delete cascade,
  rb_eleve_id integer references public.eleve(id) on delete cascade,
  cle         text not null,
  -- L'état de la surface : son index courant, ses réponses, son ordre de
  -- questions. Chaque page décide de sa forme, sauf `empreinte` (voir plus bas).
  etat        jsonb not null,
  updated_at  timestamptz not null default now(),
  constraint exercice_reprise_un_eleve
    check ((eleve_id is not null) <> (rb_eleve_id is not null)),
  constraint exercice_reprise_cle_non_vide
    check (length(cle) between 1 and 200)
);

-- Une seule reprise par élève et par clé. Index PARTIELS, comme partout où les
-- deux sources d'élèves coexistent : `onConflict` ne sait pas les viser, donc
-- la route API lit puis écrit, elle ne fait pas d'upsert.
create unique index if not exists exercice_reprise_pb
  on public.exercice_reprise (eleve_id, cle) where eleve_id is not null;

create unique index if not exists exercice_reprise_rb
  on public.exercice_reprise (rb_eleve_id, cle) where rb_eleve_id is not null;

-- Le ménage se fait par l'âge : une reprise oubliée depuis un mois n'a plus de
-- sens, l'élève a repris son parcours ailleurs.
create index if not exists exercice_reprise_age
  on public.exercice_reprise (updated_at);

-- RLS active sans policy : seules les routes API (service_role) y accèdent.
alter table public.exercice_reprise enable row level security;

-- ── Note de conception : `etat.empreinte` ────────────────────────────────
--
-- Une reprise ne vaut que si les questions n'ont pas changé entre-temps. Le
-- risque n'est pas théorique : le réimport des banques de ceintures réécrit
-- les 236 exercices d'un coup, et un enseignant peut corriger un énoncé à
-- tout moment. Des réponses rangées par index se reporteraient alors sur les
-- mauvaises questions — un élève retrouverait « juste » ce qu'il n'a jamais
-- répondu.
--
-- Chaque état porte donc une `empreinte` du contenu auquel il se rapporte.
-- Elle est recalculée au chargement et comparée : si elle diffère, la reprise
-- est jetée et l'élève recommence — ce qui est le comportement d'aujourd'hui,
-- donc jamais une régression.
