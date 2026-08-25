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

-- ───────────────── Seed du référentiel français (3 domaines, 112 items) ─────
-- Ordre et type_exercice repris des fichiers de banque, qui font foi :
-- plusieurs items ont changé de type par rapport au référentiel PIDAPI,
-- parce que le moteur ne sait pas évaluer le type d'origine (voir BRIEF §3).

insert into ceinture_domaine (code, nom, matiere, description, ordre) values
  ('PHRA', 'Phrases', 'français', 'Grammaire, conjugaison, orthographe grammaticale', 2),
  ('MOTS', 'Mots', 'français', 'Vocabulaire, classes de mots, orthographe lexicale', 1),
  ('TEXT', 'Textes', 'français', 'Lecture, production d''écrits, relecture', 3)
on conflict (code) do update set nom = excluded.nom, matiere = excluded.matiere,
  description = excluded.description, ordre = excluded.ordre;

insert into ceinture_item (code, domaine_code, ceinture_idx, libelle, niveau_cible,
  type_exercice, nb_questions_diagnostic, validation, rattachement, statut_source, ordre) values
  ('P11', 'PHRA', 0, 'Je commence ma phrase par une majuscule et je la termine par un point', 'CE2', 'classement', 2, 'auto', 'S1 · Grammaire', 'Reformulé', 1),
  ('P10', 'PHRA', 0, 'Je situe l''action dans le temps : passé, présent, futur', 'CE2', 'qcm', 2, 'auto', 'S1 · Grammaire', 'Reformulé', 2),
  ('P16', 'PHRA', 0, 'J''identifie le verbe : le mot qui change quand le moment change', 'CE2', 'exercice', 2, 'auto', 'S1 · Grammaire', 'Reformulé', 3),
  ('P12', 'PHRA', 0, 'Je mets un « s » au pluriel', 'CE2', 'exercice', 2, 'auto', '—', 'PIDAPI', 4),
  ('P13', 'PHRA', 1, 'Je distingue et j''écris les 3 types de phrases : déclarative (.), interrogative (?), exclamative (!)', 'CE2', 'classement', 2, 'auto', 'S2 · Types de phrases', 'Reformulé', 5),
  ('P20', 'PHRA', 1, 'Je conjugue être et avoir au présent', 'CE2', 'exercice', 2, 'auto', 'S2 · Conjugaison', 'Reformulé', 6),
  ('P14', 'PHRA', 1, 'J''utilise le déterminant qui convient et je l''accorde avec le nom', 'CE2', 'qcm', 2, 'auto', 'S6 · Classes de mots', 'Reformulé', 7),
  ('P15', 'PHRA', 1, 'J''utilise les mots outils (à, sans, avec, pour, de, sur…)', 'CE2', 'qcm', 2, 'auto', '—', 'PIDAPI', 8),
  ('P25', 'PHRA', 2, 'Je repère le sujet du verbe (« Qui est-ce qui… ? »)', 'CE2-CM1', 'exercice', 2, 'auto', 'S3 · Sujet et verbe', 'Reformulé', 9),
  ('P22', 'PHRA', 2, 'Je conjugue les verbes en -ER au présent', 'CE2-CM1', 'texte_a_trous', 2, 'auto', 'S3 · Conjugaison', 'Reformulé', 10),
  ('P17', 'PHRA', 2, 'J''accorde le verbe avec son sujet ① (sujet proche du verbe)', 'CE2-CM1', 'texte_a_trous', 2, 'auto', 'S3 · Sujet et verbe', 'Reformulé', 11),
  ('P47', 'PHRA', 2, 'Homophones ① : je choisis entre a / à et entre et / est', 'CE2-CM1', 'texte_a_trous', 2, 'auto', 'S2 et S3 · Ma P''tite Règle', 'Ajouté', 12),
  ('P51', 'PHRA', 3, 'Je conjugue les verbes en -IR (finir) au présent', 'CM1', 'texte_a_trous', 2, 'auto', 'S4 · Conjugaison', 'Ajouté', 13),
  ('P18', 'PHRA', 3, 'J''utilise la forme négative : ne … pas / n'' … pas', 'CM1', 'classement', 2, 'auto', 'S4 · Grammaire', 'Reformulé', 14),
  ('P48', 'PHRA', 3, 'Homophones ② : je choisis entre son / sont et entre on / ont', 'CM1', 'texte_a_trous', 2, 'auto', 'S4 · Ma P''tite Règle', 'Ajouté', 15),
  ('P52', 'PHRA', 3, 'Je n''oublie pas le -ent quand le sujet est ils, elles ou un groupe au pluriel', 'CM1', 'texte_a_trous', 2, 'auto', 'S4 · Grammaire', 'Ajouté', 16),
  ('P23', 'PHRA', 4, 'Je conjugue au présent les verbes fréquents ① : aller, faire', 'CM1', 'texte_a_trous', 2, 'auto', 'S5 · Conjugaison', 'Reformulé', 17),
  ('P19', 'PHRA', 4, 'J''accorde en genre et en nombre dans le groupe nominal ①', 'CM1', 'exercice', 2, 'auto', 'S6 · Classes de mots', 'Reformulé', 18),
  ('P26', 'PHRA', 4, 'Je conjugue au présent les verbes fréquents ② : venir, prendre', 'CM1', 'texte_a_trous', 2, 'auto', 'S6 · Conjugaison', 'Reformulé', 19),
  ('P27', 'PHRA', 4, 'Je repère les compléments d''objet (COD, COI)', 'CM1', 'analyse_phrase', 2, 'auto', '—', 'Reformulé', 20),
  ('P28', 'PHRA', 4, 'Je repère les compléments circonstanciels (temps, lieu, manière)', 'CM1', 'analyse_phrase', 2, 'auto', '—', 'Reformulé', 21),
  ('P29', 'PHRA', 5, 'J''accorde le verbe avec son sujet ② (sujet éloigné ou inversé)', 'CM1-CM2', 'texte_a_trous', 2, 'auto', 'S5 · Accord sujet-verbe', 'Reformulé', 22),
  ('P24', 'PHRA', 5, 'Je comprends et j''écris le passé composé', 'CM1-CM2', 'texte_a_trous', 2, 'auto', 'P2 · Conjugaison', 'Reformulé', 23),
  ('P54', 'PHRA', 5, 'Je conjugue au futur simple', 'CM1-CM2', 'texte_a_trous', 2, 'auto', 'P2 · Conjugaison', 'Ajouté', 24),
  ('P49', 'PHRA', 5, 'Homophones ③ : je choisis entre ce / se et entre ces / ses', 'CM1-CM2', 'texte_a_trous', 2, 'auto', 'Ma P''tite Règle', 'Déplacé', 25),
  ('P53', 'PHRA', 5, 'Je conjugue à l''imparfait (être, avoir, verbes en -ER)', 'CM1', 'texte_a_trous', 2, 'auto', 'P2 · Conjugaison', 'Ajouté', 26),
  ('P32', 'PHRA', 6, 'J''identifie et j''accorde l''attribut du sujet', 'CM2', 'analyse_phrase', 2, 'auto', '—', 'PIDAPI', 27),
  ('P33', 'PHRA', 6, 'Je conjugue avoir à tous les temps étudiés', 'CM2', 'exercice', 2, 'auto', '—', 'Reformulé', 28),
  ('P34', 'PHRA', 6, 'J''identifie les expansions du groupe nominal (adjectif, complément du nom, relative)', 'CM2', 'classement', 2, 'auto', '—', 'Reformulé', 29),
  ('P37', 'PHRA', 6, 'Je conjugue au présent les verbes fréquents ③ : voir, dire', 'CM2', 'texte_a_trous', 2, 'auto', 'S6 · Conjugaison CM2', 'Reformulé', 30),
  ('P30', 'PHRA', 6, 'J''utilise tous les points (. ? ! … : « »)', 'CM1', 'qcm', 2, 'auto', '—', 'Reformulé', 31),
  ('P35', 'PHRA', 7, 'Je repère et je distingue les pronoms de reprise et les pronoms personnels', 'CM2', 'qcm', 2, 'auto', '—', 'PIDAPI', 32),
  ('P36', 'PHRA', 7, 'J''accorde en genre et en nombre dans le groupe nominal ② (cas complexes)', 'CM2', 'texte_a_trous', 2, 'auto', '—', 'Fusionné', 33),
  ('P38', 'PHRA', 7, 'Je conjugue au présent les verbes fréquents ④ : pouvoir, vouloir', 'CM2', 'texte_a_trous', 2, 'auto', 'S7 · Conjugaison CM2', 'Reformulé', 34),
  ('P55', 'PHRA', 7, 'Je conjugue au passé simple les verbes fréquents (3e personne)', 'CM2', 'texte_a_trous', 2, 'auto', 'P3 · Conjugaison', 'Déplacé', 35),
  ('P31', 'PHRA', 7, 'Je conjugue être et avoir à l''imparfait, au futur et au passé composé', 'CM2', 'exercice', 2, 'auto', '—', 'Reformulé', 36),
  ('P39', 'PHRA', 8, 'Je comprends la formation du plus-que-parfait', 'CM2+', 'texte_a_trous', 2, 'auto', '—', 'PIDAPI', 37),
  ('P41', 'PHRA', 8, 'Je distingue les pronoms personnels, possessifs et démonstratifs', 'CM2+', 'classement', 2, 'auto', '—', 'Fusionné', 38),
  ('P43', 'PHRA', 8, 'J''identifie la fonction des éléments de la phrase (sujet, groupe verbal) dans des situations complexes', 'CM2+', 'analyse_phrase', 2, 'auto', '—', 'PIDAPI', 39),
  ('P44', 'PHRA', 8, 'Je distingue phrase simple et phrase complexe (notion de proposition)', 'CM2+', 'classement', 2, 'auto', '—', 'Fusionné', 40),
  ('P46', 'PHRA', 8, 'Je différencie les conjonctions de coordination et de subordination', 'CM2+', 'classement', 2, 'auto', '—', 'PIDAPI', 41),
  ('M10', 'MOTS', 0, 'Je range des mots dans l''ordre alphabétique (1re lettre, puis 2e)', 'CE2', 'classement', 2, 'auto', 'S1 · Vocabulaire', 'PIDAPI', 1),
  ('M12', 'MOTS', 0, 'J''utilise les déterminants ① : le, la, les, un, une, des', 'CE2', 'qcm', 2, 'auto', 'S6 · Classes de mots', 'Reformulé', 2),
  ('M13', 'MOTS', 0, 'J''utilise des adjectifs pour décrire (apparence, caractère)', 'CE2', 'qcm', 2, 'auto', 'S1 · Vocabulaire du portrait', 'Reformulé', 3),
  ('M42', 'MOTS', 0, 'J''utilise des mots précis d''apparence et de caractère', 'CE2', 'classement', 2, 'auto', 'S1 · Apparence et caractère', 'Ajouté', 4),
  ('M14', 'MOTS', 1, 'J''écris sans erreur les mots invariables ① (série 1)', 'CE2', 'exercice', 2, 'auto', 'Dictée hebdomadaire', 'Reformulé', 5),
  ('M11', 'MOTS', 1, 'J''écris le féminin des noms ① : règle générale (+ e)', 'CE2', 'exercice', 2, 'auto', '—', 'Reformulé', 6),
  ('M16', 'MOTS', 1, 'Je reconnais les mots du groupe nominal (déterminant + nom + adjectif)', 'CE2', 'classement', 2, 'auto', 'S6 · Classes de mots', 'PIDAPI', 7),
  ('M17', 'MOTS', 1, 'Je nomme le verbe : je donne son infinitif (« il faut… »)', 'CE2', 'exercice', 2, 'auto', 'S1 · Grammaire', 'Reformulé', 8),
  ('M19', 'MOTS', 2, 'J''écris sans erreur les mots invariables ② (série 2)', 'CE2-CM1', 'exercice', 2, 'auto', 'Dictée hebdomadaire', 'Reformulé', 9),
  ('M20', 'MOTS', 2, 'Je trouve un mot dans le dictionnaire en m''aidant des mots-repères', 'CE2-CM1', 'qcm', 2, 'auto', 'S2 · Vocabulaire', 'Reformulé', 10),
  ('M21', 'MOTS', 2, 'Je différencie les noms communs et les noms propres', 'CE2-CM1', 'classement', 2, 'auto', 'S6 · Classes de mots', 'PIDAPI', 11),
  ('M18', 'MOTS', 2, 'J''utilise les pronoms personnels sujets (je, tu, il, nous, vous, ils)', 'CE2-CM1', 'texte_a_trous', 2, 'auto', 'S3 · Sujet et verbe', 'Reformulé', 12),
  ('M22', 'MOTS', 3, 'J''utilise les déterminants ② : possessifs et démonstratifs', 'CM1', 'exercice', 2, 'auto', '—', 'Reformulé', 13),
  ('M23', 'MOTS', 3, 'Je mets un « m » devant m, b et p', 'CM1', 'classement', 2, 'auto', 'Ma P''tite Règle', 'PIDAPI', 14),
  ('M15', 'MOTS', 3, 'J''écris le féminin des noms ② : cas particuliers (-eur/-euse, -teur/-trice, -f/-ve)', 'CM1', 'exercice', 2, 'auto', '—', 'Reformulé', 15),
  ('M26', 'MOTS', 3, 'Je trouve des mots relevant d''un même champ lexical', 'CM1', 'classement', 2, 'auto', 'S3 · Caractère', 'PIDAPI', 16),
  ('M43', 'MOTS', 3, 'J''utilise les antonymes (contraires), y compris avec un préfixe (poli / impoli)', 'CM1', 'exercice', 2, 'auto', 'S5 · Les contraires', 'Ajouté', 17),
  ('M27', 'MOTS', 4, 'J''écris sans erreur les mots invariables ③ (série 3)', 'CM1', 'exercice', 2, 'auto', 'Dictée hebdomadaire', 'Reformulé', 18),
  ('M28', 'MOTS', 4, 'J''utilise un mot ayant plusieurs sens (polysémie)', 'CM1', 'qcm', 2, 'auto', '—', 'Reformulé', 19),
  ('M29', 'MOTS', 4, 'J''utilise des synonymes pour éviter les répétitions', 'CM1', 'qcm', 2, 'auto', 'S4 · Les synonymes', 'Reformulé', 20),
  ('M30', 'MOTS', 4, 'Je reconnais les principales classes grammaticales (nom, déterminant, verbe, adjectif, pronom)', 'CM1', 'classement', 2, 'auto', 'S6 · Classes de mots', 'PIDAPI', 21),
  ('M31', 'MOTS', 5, 'J''écris sans erreur les mots invariables ④ (série 4)', 'CM1-CM2', 'exercice', 2, 'auto', 'Dictée hebdomadaire', 'Reformulé', 22),
  ('M25', 'MOTS', 5, 'Je reconnais une famille de mots à partir du radical', 'CM1-CM2', 'classement', 2, 'auto', 'S6 · Familles de mots', 'PIDAPI', 23),
  ('M32', 'MOTS', 5, 'Je repère le sens des préfixes et des suffixes', 'CM1-CM2', 'qcm', 2, 'auto', 'S5 · Préfixes', 'PIDAPI', 24),
  ('M33', 'MOTS', 5, 'Je construis des familles de mots', 'CM1-CM2', 'exercice', 2, 'auto', 'S6 · Familles de mots', 'PIDAPI', 25),
  ('M34', 'MOTS', 6, 'J''écris sans erreur les mots invariables ⑤ (série 5)', 'CM2', 'exercice', 2, 'auto', 'Dictée hebdomadaire', 'Reformulé', 26),
  ('M35', 'MOTS', 6, 'Je lis un article de dictionnaire (nature, définitions, exemple)', 'CM2', 'qcm', 2, 'auto', 'S3 · Vocabulaire', 'Reformulé', 27),
  ('M24', 'MOTS', 6, 'J''utilise le participe passé en tant qu''adjectif', 'CM2', 'exercice', 2, 'auto', '—', 'PIDAPI', 28),
  ('M36', 'MOTS', 7, 'J''écris sans erreur les mots invariables ⑥ (série 6)', 'CM2', 'exercice', 2, 'auto', 'Dictée hebdomadaire', 'Reformulé', 29),
  ('M37', 'MOTS', 7, 'J''utilise les termes génériques et les termes spécifiques', 'CM2', 'classement', 2, 'auto', '—', 'PIDAPI', 30),
  ('M44', 'MOTS', 7, 'Je nuance : je classe des mots par degré d''intensité (content < ravi < enthousiaste)', 'CM2', 'classement', 2, 'auto', 'S7 · Bilan vocabulaire', 'Ajouté', 31),
  ('M40', 'MOTS', 8, 'Je connais le sens des principaux préfixes d''origine latine et grecque (télé-, péri-, ortho-…)', 'CM2+', 'qcm', 2, 'auto', '—', 'PIDAPI', 32),
  ('M41', 'MOTS', 8, 'Je repère des mots du vocabulaire savant grâce aux racines grecques et latines', 'CM2+', 'exercice', 2, 'auto', '—', 'PIDAPI', 33),
  ('M45', 'MOTS', 8, 'J''utilise un dictionnaire des synonymes pour choisir le mot juste', 'CM2+', 'qcm', 2, 'auto', '—', 'Ajouté', 34),
  ('T11', 'TEXT', 0, 'Je reconnais une phrase et je l''écris correctement', 'CE2', 'classement', 2, 'auto', 'S1 · Lecture', 'PIDAPI', 1),
  ('T13', 'TEXT', 0, 'Je copie un texte de 3 lignes sans erreur', 'CE2', 'ecriture_contrainte', 2, 'enseignant', 'Copie quotidienne', 'PIDAPI', 2),
  ('T44', 'TEXT', 0, 'Je réponds à une question en recopiant un morceau de phrase du texte', 'CE2', 'lecture', 2, 'auto', 'S1 · Lecture', 'Ajouté', 3),
  ('T12', 'TEXT', 0, 'J''utilise « et », « et puis » pour relier deux idées', 'CE2', 'qcm', 2, 'auto', '—', 'PIDAPI', 4),
  ('T14', 'TEXT', 1, 'Je comprends ce qu''est un texte (titre, paragraphes, sens général)', 'CE2', 'lecture', 2, 'auto', 'S1 · Lecture', 'PIDAPI', 5),
  ('T45', 'TEXT', 1, 'Je repère dans un texte ce qui décrit un personnage (apparence, caractère)', 'CE2', 'lecture', 2, 'auto', 'S1 et S2 · Lecture', 'Ajouté', 6),
  ('T15', 'TEXT', 1, 'J''identifie un texte correctement segmenté (majuscules, points)', 'CE2', 'qcm', 2, 'auto', '—', 'PIDAPI', 7),
  ('T16', 'TEXT', 1, 'J''utilise « ou », « ou bien »', 'CE2', 'qcm', 2, 'auto', '—', 'PIDAPI', 8),
  ('T18', 'TEXT', 2, 'J''utilise des verbes précis (au lieu de faire, dire, être)', 'CE2-CM1', 'qcm', 2, 'auto', 'S5 · Production', 'PIDAPI', 9),
  ('T19', 'TEXT', 2, 'Je sais écrire des phrases courtes et complètes', 'CE2-CM1', 'ecriture_contrainte', 2, 'enseignant', 'S1 · Production', 'Reformulé', 10),
  ('T46', 'TEXT', 2, 'J''écris un portrait physique organisé : visage, cheveux, yeux, vêtements', 'CE2-CM1', 'ecriture_contrainte', 2, 'enseignant', 'S2 · Production', 'Ajouté', 11),
  ('T21', 'TEXT', 2, 'J''utilise la grille de relecture ① : majuscule, point, sens de la phrase', 'CE2-CM1', 'qcm', 2, 'enseignant', 'Toutes les semaines', 'Reformulé', 12),
  ('T47', 'TEXT', 3, 'J''écris un portrait moral : deux qualités, les goûts, un défaut', 'CM1', 'ecriture_contrainte', 2, 'enseignant', 'S3 · Production', 'Ajouté', 13),
  ('T22', 'TEXT', 3, 'J''utilise des substituts pour désigner le personnage principal ① (pronoms, groupes nominaux)', 'CM1', 'qcm', 2, 'auto', 'S6 · Production', 'Reformulé', 14),
  ('T23', 'TEXT', 3, 'Je sais écrire un dialogue simple', 'CM1', 'ecriture_contrainte', 2, 'enseignant', '—', 'PIDAPI', 15),
  ('T25', 'TEXT', 3, 'J''utilise la grille de relecture ② : accords dans le GN, accord sujet-verbe', 'CM1', 'qcm', 2, 'enseignant', 'Toutes les semaines', 'Reformulé', 16),
  ('T48', 'TEXT', 4, 'J''enrichis mon portrait avec des adjectifs et une comparaison avec « comme »', 'CM1', 'ecriture_contrainte', 2, 'enseignant', 'S4 · Production', 'Ajouté', 17),
  ('T26', 'TEXT', 4, 'Je respecte la cohérence des temps ① (présent / passé composé)', 'CM1', 'texte_a_trous', 2, 'auto', '—', 'Reformulé', 18),
  ('T28', 'TEXT', 4, 'J''enrichis mon texte avec des connecteurs de temps et de lieu', 'CM1', 'qcm', 2, 'auto', '—', 'PIDAPI', 19),
  ('T29', 'TEXT', 4, 'J''utilise la grille de relecture ③ : temps, connecteurs, répétitions', 'CM1', 'qcm', 2, 'enseignant', 'Toutes les semaines', 'Reformulé', 20),
  ('T49', 'TEXT', 5, 'Je montre le caractère d''un personnage par une action, sans le dire', 'CM1-CM2', 'ecriture_contrainte', 2, 'enseignant', 'S5 · Production', 'Ajouté', 21),
  ('T31', 'TEXT', 5, 'Je sais segmenter mon texte en paragraphes', 'CM1-CM2', 'ecriture_contrainte', 2, 'enseignant', 'S6 · Production', 'PIDAPI', 22),
  ('T27', 'TEXT', 5, 'J''utilise des phrases avec « qui » et « que » pour alléger mon texte', 'CM1-CM2', 'qcm', 2, 'auto', '—', 'PIDAPI', 23),
  ('T30', 'TEXT', 5, 'Je respecte la cohérence des temps ② (passé composé / imparfait)', 'CM1-CM2', 'texte_a_trous', 2, 'auto', '—', 'Reformulé', 24),
  ('T33', 'TEXT', 5, 'J''utilise un vocabulaire adapté au contexte', 'CM1-CM2', 'qcm', 2, 'auto', '—', 'PIDAPI', 25),
  ('T34', 'TEXT', 6, 'Je sais utiliser des comparaisons', 'CM2', 'qcm', 2, 'auto', 'S4 · Lecture', 'PIDAPI', 26),
  ('T35', 'TEXT', 6, 'J''utilise des substituts du personnage principal ② (variés, sans répétition)', 'CM2', 'classement', 2, 'auto', 'S6 · Production', 'Reformulé', 27),
  ('T32', 'TEXT', 6, 'Je sais exprimer la cause et la conséquence', 'CM2', 'qcm', 2, 'auto', '—', 'Fusionné', 28),
  ('T36', 'TEXT', 6, 'J''utilise la grille de relecture ④ : cohérence globale, ponctuation du dialogue', 'CM2', 'classement', 2, 'enseignant', 'Toutes les semaines', 'Reformulé', 29),
  ('T50', 'TEXT', 7, 'J''écris le portrait d''un personnage inventé, complet et organisé (apparence, caractère, action)', 'CM2', 'ecriture_contrainte', 2, 'enseignant', 'S7 · Production', 'Ajouté', 30),
  ('T37', 'TEXT', 7, 'Je reconnais et j''emploie le sens propre et le sens figuré', 'CM2', 'qcm', 2, 'auto', '—', 'PIDAPI', 31),
  ('T39', 'TEXT', 7, 'Je respecte la cohérence des temps ③ (imparfait / passé simple)', 'CM2', 'texte_a_trous', 2, 'auto', 'P3 · Production', 'Reformulé', 32),
  ('T38', 'TEXT', 7, 'Je sais recopier un texte d''au moins 15 lignes sans erreur', 'CM2', 'ecriture_contrainte', 2, 'enseignant', 'Copie quotidienne', 'PIDAPI', 33),
  ('T40', 'TEXT', 8, 'Je sais utiliser l''implicite dans mon texte', 'CM2+', 'ecriture_contrainte', 2, 'enseignant', '—', 'PIDAPI', 34),
  ('T41', 'TEXT', 8, 'Je sais écrire un début qui accroche', 'CM2+', 'ecriture_contrainte', 2, 'enseignant', '—', 'Reformulé', 35),
  ('T42', 'TEXT', 8, 'Je sais écrire une fin', 'CM2+', 'ecriture_contrainte', 2, 'enseignant', '—', 'PIDAPI', 36),
  ('T43', 'TEXT', 8, 'Je sais articuler les paragraphes de mon texte (connecteurs logiques)', 'CM2+', 'qcm', 2, 'enseignant', '—', 'Fusionné', 37)
on conflict (code) do update set domaine_code = excluded.domaine_code,
  ceinture_idx = excluded.ceinture_idx, libelle = excluded.libelle,
  niveau_cible = excluded.niveau_cible, type_exercice = excluded.type_exercice,
  validation = excluded.validation, rattachement = excluded.rattachement,
  statut_source = excluded.statut_source, ordre = excluded.ordre;

commit;
