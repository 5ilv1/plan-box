-- ── Motus de la classe ──────────────────────────────────────────────────────
-- Un mot par jour, commun à toute la classe, jouable même hors jours d'école.
-- La liste de mots est éditée par l'enseignant ; le mot du jour est figé dans
-- motus_jour (copie du texte) pour qu'une suppression de mot ne casse pas une
-- journée déjà commencée.

create table if not exists motus_mot (
  id            uuid primary key default gen_random_uuid(),
  mot           text not null,          -- saisi par l'enseignant (accents autorisés)
  mot_normalise text not null unique,   -- A-Z sans accents, 4 à 10 lettres
  actif         boolean not null default true,
  cree_le       timestamptz not null default now()
);

create table if not exists motus_jour (
  date    date primary key,
  mot_id  uuid references motus_mot(id) on delete set null,
  mot     text not null,                -- copie normalisée, figée
  cree_le timestamptz not null default now()
);

create table if not exists motus_partie (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  eleve_id    uuid   references eleves(id) on delete cascade,
  rb_eleve_id bigint references eleve(id)  on delete cascade,
  essais      jsonb not null default '[]'::jsonb,  -- ["REQUIN", …]
  trouve      boolean not null default false,
  termine     boolean not null default false,
  cree_le     timestamptz not null default now(),
  maj_le      timestamptz not null default now(),
  constraint motus_partie_un_eleve check (
    (eleve_id is not null) <> (rb_eleve_id is not null)
  )
);

-- Index partiels : une seule partie par élève et par jour, quelle que soit la
-- source. ⚠️ partiels ⇒ pas d'upsert onConflict possible (voir CLAUDE.md).
create unique index if not exists motus_partie_pb_uniq
  on motus_partie (date, eleve_id) where eleve_id is not null;
create unique index if not exists motus_partie_rb_uniq
  on motus_partie (date, rb_eleve_id) where rb_eleve_id is not null;

create index if not exists motus_jour_mot_id_idx on motus_jour (mot_id);

-- RLS activée sans policy : tout passe par les routes API (service_role).
alter table motus_mot    enable row level security;
alter table motus_jour   enable row level security;
alter table motus_partie enable row level security;
