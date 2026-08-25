-- Ceintures de compétences — migration additive
-- Aucune table existante n'est modifiée. Rejouable sans perte.
-- Projet Supabase : dobaryyfqgcumwbskark

begin;

create table if not exists ceinture_domaine (
  code        text primary key,
  nom         text not null,
  matiere     text not null,
  description text,
  ordre       int not null default 0,
  actif       boolean not null default true
);

create table if not exists ceinture_item (
  code          text primary key,
  domaine_code  text not null references ceinture_domaine(code),
  ceinture_idx  int  not null check (ceinture_idx between 0 and 8),
  libelle       text not null,
  niveau_cible  text,
  type_exercice text not null,
  nb_questions_diagnostic int not null default 2,
  validation    text not null default 'auto',
  rattachement  text,
  statut_source text,
  ordre         int not null default 0,
  actif         boolean not null default true
);
create index if not exists idx_ceinture_item_dom on ceinture_item(domaine_code, ceinture_idx, ordre);

-- Une ceinture = un chapitre existant.
create table if not exists ceinture_chapitre (
  domaine_code text not null references ceinture_domaine(code),
  ceinture_idx int  not null check (ceinture_idx between 0 and 8),
  chapitre_id  uuid not null references chapitres(id) on delete cascade,
  primary key (domaine_code, ceinture_idx)
);
create unique index if not exists idx_ceinture_chapitre_ch on ceinture_chapitre(chapitre_id);

-- Une passation de diagnostic. items_acquis = codes réussis 2/2.
create table if not exists ceinture_diagnostic (
  id            uuid primary key default gen_random_uuid(),
  eleve_id      uuid,
  rb_eleve_id   int,
  domaine_code  text not null references ceinture_domaine(code),
  ceinture_idx  int  not null,
  questions     jsonb not null default '[]'::jsonb,
  reponses      jsonb not null default '[]'::jsonb,
  items_acquis  text[] not null default '{}',
  nb_correct    int not null default 0,
  nb_total      int not null default 0,
  created_at    timestamptz not null default now(),
  constraint ceinture_diagnostic_eleve_check
    check (eleve_id is not null or rb_eleve_id is not null)
);
create unique index if not exists idx_cdiag_pb on ceinture_diagnostic(eleve_id, domaine_code, ceinture_idx) where eleve_id is not null;
create unique index if not exists idx_cdiag_rb on ceinture_diagnostic(rb_eleve_id, domaine_code, ceinture_idx) where rb_eleve_id is not null;

-- Banque d'exercices par item : servie en priorité, l'IA ne complète que si vide.
create table if not exists ceinture_banque (
  id            uuid primary key default gen_random_uuid(),
  item_code     text not null references ceinture_item(code),
  usage         text not null check (usage in ('diagnostic','entrainement','evaluation')),
  type_exercice text not null,
  contenu       jsonb not null,
  valide_par_enseignant boolean not null default false,
  genere_par_ia boolean not null default false,
  nb_utilisations int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_cbanque_item on ceinture_banque(item_code, usage, valide_par_enseignant);

-- ───────────────────────────── Seed du référentiel Phrases ─────────────

insert into ceinture_domaine (code, nom, matiere, description, ordre) values
  ('PHRA', 'Phrases', 'français', 'Grammaire, conjugaison, orthographe grammaticale', 2)
on conflict (code) do update set nom = excluded.nom, matiere = excluded.matiere,
  description = excluded.description, ordre = excluded.ordre;

insert into ceinture_item (code, domaine_code, ceinture_idx, libelle, niveau_cible,
  type_exercice, nb_questions_diagnostic, validation, rattachement, statut_source, ordre) values
  ('P11', 'PHRA', 0, 'Je commence ma phrase par une majuscule et je la termine par un point', 'CE2', 'texte_a_trous', 2, 'auto', 'S1 · Grammaire', 'Reformulé', 1),
  ('P10', 'PHRA', 0, 'Je situe l''action dans le temps : passé, présent, futur', 'CE2', 'qcm', 2, 'auto', 'S1 · Grammaire', 'Reformulé', 2),
  ('P16', 'PHRA', 0, 'J''identifie le verbe : le mot qui change quand le moment change', 'CE2', 'analyse_phrase', 2, 'auto', 'S1 · Grammaire', 'Reformulé', 3),
  ('P12', 'PHRA', 0, 'Je mets un « s » au pluriel', 'CE2', 'texte_a_trous', 2, 'auto', '—', 'PIDAPI', 4),
  ('P13', 'PHRA', 1, 'Je distingue et j''écris les 3 types de phrases : déclarative (.), interrogative (?), exclamative (!)', 'CE2', 'classement', 2, 'auto', 'S2 · Types de phrases', 'Reformulé', 5),
  ('P14', 'PHRA', 1, 'J''utilise le déterminant qui convient et je l''accorde avec le nom', 'CE2', 'texte_a_trous', 2, 'auto', 'S6 · Classes de mots', 'Reformulé', 6),
  ('P15', 'PHRA', 1, 'J''utilise les mots outils (à, sans, avec, pour, de, sur…)', 'CE2', 'texte_a_trous', 2, 'auto', '—', 'PIDAPI', 7),
  ('P20', 'PHRA', 1, 'Je conjugue être et avoir au présent', 'CE2', 'texte_a_trous', 2, 'auto', 'S2 · Conjugaison', 'Reformulé', 8),
  ('P25', 'PHRA', 2, 'Je repère le sujet du verbe (« Qui est-ce qui… ? »)', 'CE2-CM1', 'analyse_phrase', 2, 'auto', 'S3 · Sujet et verbe', 'Reformulé', 9),
  ('P17', 'PHRA', 2, 'J''accorde le verbe avec son sujet ① (sujet proche du verbe)', 'CE2-CM1', 'texte_a_trous', 2, 'auto', 'S3 · Sujet et verbe', 'Reformulé', 10),
  ('P22', 'PHRA', 2, 'Je conjugue les verbes en -ER au présent', 'CE2-CM1', 'texte_a_trous', 2, 'auto', 'S3 · Conjugaison', 'Reformulé', 11),
  ('P47', 'PHRA', 2, 'Homophones ① : je choisis entre a / à et entre et / est', 'CE2-CM1', 'texte_a_trous', 2, 'auto', 'S2 et S3 · Ma P''tite Règle', 'Ajouté', 12),
  ('P18', 'PHRA', 2, 'J''utilise la forme négative : ne … pas / n'' … pas', 'CE2-CM1', 'exercice', 2, 'auto', 'S4 · Grammaire', 'Reformulé', 13),
  ('P51', 'PHRA', 3, 'Je conjugue les verbes en -IR (finir) au présent', 'CM1', 'texte_a_trous', 2, 'auto', 'S4 · Conjugaison', 'Ajouté', 14),
  ('P23', 'PHRA', 3, 'Je conjugue au présent les verbes fréquents ① : aller, faire', 'CM1', 'texte_a_trous', 2, 'auto', 'S5 · Conjugaison', 'Reformulé', 15),
  ('P19', 'PHRA', 3, 'J''accorde en genre et en nombre dans le groupe nominal ①', 'CM1', 'texte_a_trous', 2, 'auto', 'S6 · Classes de mots', 'Reformulé', 16),
  ('P48', 'PHRA', 3, 'Homophones ② : je choisis entre son / sont et entre on / ont', 'CM1', 'texte_a_trous', 2, 'auto', 'S4 · Ma P''tite Règle', 'Ajouté', 17),
  ('P52', 'PHRA', 3, 'Je n''oublie pas le -ent des verbes quand le sujet est ils / elles', 'CM1', 'texte_a_trous', 2, 'auto', 'S4 · Grammaire', 'Ajouté', 18),
  ('P26', 'PHRA', 4, 'Je conjugue au présent les verbes fréquents ② : venir, prendre', 'CM1', 'texte_a_trous', 2, 'auto', 'S6 · Conjugaison', 'Reformulé', 19),
  ('P27', 'PHRA', 4, 'Je repère les compléments d''objet (COD, COI)', 'CM1', 'analyse_phrase', 2, 'auto', '—', 'Reformulé', 20),
  ('P28', 'PHRA', 4, 'Je repère les compléments circonstanciels (temps, lieu, manière)', 'CM1', 'analyse_phrase', 2, 'auto', '—', 'Reformulé', 21),
  ('P53', 'PHRA', 4, 'Je conjugue à l''imparfait (être, avoir, verbes en -ER)', 'CM1', 'texte_a_trous', 2, 'auto', 'P2 · Conjugaison', 'Ajouté', 22),
  ('P30', 'PHRA', 4, 'J''utilise tous les points (. ? ! … : « »)', 'CM1', 'exercice', 2, 'auto', '—', 'Reformulé', 23),
  ('P29', 'PHRA', 5, 'J''accorde le verbe avec son sujet ② (sujet éloigné ou inversé)', 'CM1-CM2', 'texte_a_trous', 2, 'auto', 'S5 · Accord sujet-verbe', 'Reformulé', 24),
  ('P24', 'PHRA', 5, 'Je comprends et j''écris le passé composé', 'CM1-CM2', 'texte_a_trous', 2, 'auto', 'P2 · Conjugaison', 'Reformulé', 25),
  ('P54', 'PHRA', 5, 'Je conjugue au futur simple', 'CM1-CM2', 'texte_a_trous', 2, 'auto', 'P2 · Conjugaison', 'Ajouté', 26),
  ('P49', 'PHRA', 5, 'Homophones ③ : je choisis entre ce / se et entre ces / ses', 'CM1-CM2', 'texte_a_trous', 2, 'auto', 'Ma P''tite Règle', 'Déplacé', 27),
  ('P32', 'PHRA', 6, 'J''identifie et j''accorde l''attribut du sujet', 'CM2', 'analyse_phrase', 2, 'auto', '—', 'PIDAPI', 28),
  ('P33', 'PHRA', 6, 'Je conjugue avoir à tous les temps étudiés', 'CM2', 'texte_a_trous', 2, 'auto', '—', 'Reformulé', 29),
  ('P34', 'PHRA', 6, 'J''identifie les expansions du groupe nominal (adjectif, complément du nom, relative)', 'CM2', 'analyse_phrase', 2, 'auto', '—', 'Reformulé', 30),
  ('P37', 'PHRA', 6, 'Je conjugue au présent les verbes fréquents ③ : voir, dire', 'CM2', 'texte_a_trous', 2, 'auto', 'S6 · Conjugaison CM2', 'Reformulé', 31),
  ('P35', 'PHRA', 7, 'Je repère et je distingue les pronoms de reprise et les pronoms personnels', 'CM2', 'analyse_phrase', 2, 'auto', '—', 'PIDAPI', 32),
  ('P36', 'PHRA', 7, 'J''accorde en genre et en nombre dans le groupe nominal ② (cas complexes)', 'CM2', 'texte_a_trous', 2, 'auto', '—', 'Fusionné', 33),
  ('P38', 'PHRA', 7, 'Je conjugue au présent les verbes fréquents ④ : pouvoir, vouloir', 'CM2', 'texte_a_trous', 2, 'auto', 'S7 · Conjugaison CM2', 'Reformulé', 34),
  ('P55', 'PHRA', 7, 'Je conjugue au passé simple les verbes fréquents (3e personne)', 'CM2', 'texte_a_trous', 2, 'auto', 'P3 · Conjugaison', 'Déplacé', 35),
  ('P31', 'PHRA', 7, 'Je conjugue être et avoir à l''imparfait, au futur et au passé composé', 'CM2', 'texte_a_trous', 2, 'auto', '—', 'Reformulé', 36),
  ('P39', 'PHRA', 8, 'Je comprends la formation du plus-que-parfait', 'CM2+', 'texte_a_trous', 2, 'auto', '—', 'PIDAPI', 37),
  ('P41', 'PHRA', 8, 'Je distingue les pronoms personnels, possessifs et démonstratifs', 'CM2+', 'classement', 2, 'auto', '—', 'Fusionné', 38),
  ('P43', 'PHRA', 8, 'J''identifie la fonction des éléments de la phrase (sujet, groupe verbal) dans des situations complexes', 'CM2+', 'analyse_phrase', 2, 'auto', '—', 'PIDAPI', 39),
  ('P44', 'PHRA', 8, 'Je distingue phrase simple et phrase complexe (notion de proposition)', 'CM2+', 'analyse_phrase', 2, 'auto', '—', 'Fusionné', 40),
  ('P46', 'PHRA', 8, 'Je différencie les conjonctions de coordination et de subordination', 'CM2+', 'classement', 2, 'auto', '—', 'PIDAPI', 41)
on conflict (code) do update set
  ceinture_idx = excluded.ceinture_idx, libelle = excluded.libelle,
  niveau_cible = excluded.niveau_cible, type_exercice = excluded.type_exercice,
  nb_questions_diagnostic = excluded.nb_questions_diagnostic,
  validation = excluded.validation, rattachement = excluded.rattachement,
  statut_source = excluded.statut_source, ordre = excluded.ordre;

-- RLS : référentiel en lecture publique, le reste passe par les API en service_role.
alter table ceinture_domaine enable row level security;
alter table ceinture_item enable row level security;
alter table ceinture_chapitre enable row level security;
alter table ceinture_diagnostic enable row level security;
alter table ceinture_banque enable row level security;

drop policy if exists "ceinture_domaine_read" on ceinture_domaine;
create policy "ceinture_domaine_read" on ceinture_domaine for select using (true);
drop policy if exists "ceinture_item_read" on ceinture_item;
create policy "ceinture_item_read" on ceinture_item for select using (true);
drop policy if exists "ceinture_chapitre_read" on ceinture_chapitre;
create policy "ceinture_chapitre_read" on ceinture_chapitre for select using (true);

commit;
