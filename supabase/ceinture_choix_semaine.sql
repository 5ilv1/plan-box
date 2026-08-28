-- Les deux domaines de ceintures qu'un élève choisit de travailler dans la semaine.
-- Une ligne par élève et par semaine (identifiée par son lundi).
create table if not exists public.ceinture_choix_semaine (
  id          uuid primary key default gen_random_uuid(),
  eleve_id    uuid references public.eleves(id) on delete cascade,
  rb_eleve_id integer references public.eleve(id) on delete cascade,
  lundi       date not null,
  domaines    text[] not null,
  created_at  timestamptz not null default now(),
  constraint ceinture_choix_semaine_un_eleve
    check ((eleve_id is not null) <> (rb_eleve_id is not null)),
  constraint ceinture_choix_semaine_deux_domaines
    check (array_length(domaines, 1) between 1 and 2)
);

create unique index if not exists ceinture_choix_semaine_pb
  on public.ceinture_choix_semaine (eleve_id, lundi) where eleve_id is not null;

create unique index if not exists ceinture_choix_semaine_rb
  on public.ceinture_choix_semaine (rb_eleve_id, lundi) where rb_eleve_id is not null;

-- RLS active sans policy : seules les routes API (service_role) y accèdent.
alter table public.ceinture_choix_semaine enable row level security;
