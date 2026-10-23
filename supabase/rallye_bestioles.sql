-- Rallye Bestioles : une ligne par podcast choisi par un élève.
--
-- Les questions et réponses ne sont PAS en base : elles vivent dans
-- lib/rallye-bestioles.json (tirées des fiches PDF). Le podcast est lu sur
-- les serveurs de Radio France, jamais copié.
--
-- Choisir un podcast crée la ligne : il est « joué » dès ce moment et ne sera
-- plus proposé, même si l'élève quitte la page avant la fin.

create table if not exists rallye_partie (
  id          uuid primary key default gen_random_uuid(),
  eleve_id    uuid   references eleves(id) on delete cascade,
  rb_eleve_id bigint references eleve(id)  on delete cascade,
  prenom      text not null default '',
  nom         text not null default '',
  fiche       int  not null,                       -- numéro de la fiche (1 à 140)
  date        date not null,                       -- jour du choix, à Paris
  reponses    jsonb not null default '[]'::jsonb,  -- [1, 0, null, …] : option choisie par question
  score       int  not null default 0,
  total       int  not null default 5,
  termine     boolean not null default false,
  cree_le     timestamptz not null default now(),
  termine_le  timestamptz,
  constraint rallye_partie_un_eleve check (
    (eleve_id is not null) <> (rb_eleve_id is not null)
  )
);

-- Un podcast ne se joue qu'une fois par élève. Index partiels ⇒ pas d'upsert
-- onConflict possible (voir CLAUDE.md).
create unique index if not exists rallye_partie_pb_uniq
  on rallye_partie (eleve_id, fiche) where eleve_id is not null;
create unique index if not exists rallye_partie_rb_uniq
  on rallye_partie (rb_eleve_id, fiche) where rb_eleve_id is not null;

create index if not exists rallye_partie_termine_idx on rallye_partie (termine);

-- RLS activée sans policy : tout passe par les routes API (service_role).
alter table rallye_partie enable row level security;

-- Le rallye remplace les podcasts sur le tableau de bord élève tant que ce
-- réglage est vrai (Paramètres → « Rallye Bestioles »).
insert into reglage (cle, valeur) values ('rallye_bestioles', 'true'::jsonb)
  on conflict (cle) do nothing;
