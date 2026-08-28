-- ─────────────── 7e domaine : Espace et géométrie (ESGE) ───────────────
-- 30 items, 9 ceintures. 15 en validation enseignant : le tracé se fait sur
-- le cahier, l'écran vérifie ce que le tracé fait apparaitre.
-- Deux types s'écartent du référentiel PIDAPI, voir SPEC-ESPACE-GEOMETRIE.md :
--   EG32 exercice → qcm            (vérifier une figure contre son programme)
--   EG33 ecriture_contrainte → texte_a_trous  (sinon absent de l'évaluation)

insert into ceinture_domaine (code, nom, matiere, description, ordre) values
  ('ESGE', 'Espace et géométrie', 'maths', 'Vocabulaire, figures, solides, symétrie, repérage, constructions', 7)
on conflict (code) do update set nom = excluded.nom, matiere = excluded.matiere,
  description = excluded.description, ordre = excluded.ordre;

insert into ceinture_item (code, domaine_code, ceinture_idx, libelle, niveau_cible,
  type_exercice, nb_questions_diagnostic, validation, rattachement, statut_source, ordre) values
  ('EG10', 'ESGE', 0, 'Je connais le vocabulaire : point, droite, segment, milieu', 'CE2', 'qcm', 2, 'auto', 'iParcours · Géométrie', 'PIDAPI', 1),
  ('EG11', 'ESGE', 0, 'Je reconnais les carrés, les rectangles et les cercles sans quadrillage', 'CE2', 'qcm', 2, 'auto', 'iParcours · Géométrie', 'PIDAPI', 2),
  ('EG12', 'ESGE', 0, 'Je reconnais les angles droits', 'CE2', 'exercice', 2, 'auto', 'iParcours · Géométrie', 'PIDAPI', 3),
  ('EG13', 'ESGE', 1, 'Je reconnais les polygones', 'CE2', 'classement', 2, 'auto', 'iParcours · Géométrie', 'PIDAPI', 4),
  ('EG14', 'ESGE', 1, 'Je trouve les axes de symétrie d''une figure sur un quadrillage', 'CE2', 'exercice', 2, 'auto', 'iParcours · Symétrie', 'PIDAPI', 5),
  ('EG15', 'ESGE', 1, 'Je me repère dans le plan à l''aide d''un quadrillage (cases ou nœuds)', 'CE2', 'exercice', 2, 'auto', 'iParcours · Repérage', 'PIDAPI', 6),
  ('EG16', 'ESGE', 2, 'Je connais le vocabulaire des figures planes : côté, sommet, angle', 'CE2-CM1', 'qcm', 2, 'auto', 'iParcours · Géométrie', 'PIDAPI', 7),
  ('EG17', 'ESGE', 2, 'Je connais le vocabulaire des solides : face, arête, sommet', 'CE2-CM1', 'qcm', 2, 'auto', 'iParcours · Solides', 'PIDAPI', 8),
  ('EG18', 'ESGE', 2, 'Je reconnais et je trace deux droites perpendiculaires', 'CE2-CM1', 'exercice', 1, 'enseignant', 'Trace papier', 'Reformulé', 9),
  ('EG19', 'ESGE', 2, 'Je trace un cercle au compas (centre, rayon, diamètre)', 'CE2-CM1', 'exercice', 1, 'enseignant', 'Trace papier', 'PIDAPI', 10),
  ('EG20', 'ESGE', 3, 'Je reconnais deux droites parallèles', 'CM1', 'qcm', 2, 'auto', 'iParcours · Géométrie', 'PIDAPI', 11),
  ('EG21', 'ESGE', 3, 'Je reconnais les solides (cube, cylindre, boule, pavé droit, cône, pyramide)', 'CM1', 'qcm', 2, 'auto', 'iParcours · Solides', 'PIDAPI', 12),
  ('EG22', 'ESGE', 3, 'Je reconnais les quadrilatères et les triangles dans une figure complexe', 'CM1', 'exercice', 2, 'auto', 'iParcours · Géométrie', 'PIDAPI', 13),
  ('EG23', 'ESGE', 3, 'Je reproduis et je construis les quadrilatères particuliers et les triangles rectangles', 'CM1', 'exercice', 1, 'enseignant', 'Trace papier', 'PIDAPI', 14),
  ('EG24', 'ESGE', 4, 'Je construis un patron de cube de dimension donnée', 'CM1', 'exercice', 1, 'enseignant', 'Trace papier', 'PIDAPI', 15),
  ('EG25', 'ESGE', 4, 'Je reconnais et je trace deux droites perpendiculaires à l''équerre', 'CM1', 'exercice', 1, 'enseignant', 'Trace papier', 'Reformulé', 16),
  ('EG26', 'ESGE', 4, 'Je reconnais, je nomme et je décris les trois triangles particuliers', 'CM1', 'qcm', 2, 'auto', 'iParcours · Géométrie', 'Reformulé', 17),
  ('EG39', 'ESGE', 4, 'Je décris et je code un déplacement sur un plan ou un quadrillage', 'CM1', 'exercice', 2, 'auto', 'iParcours · Repérage', 'Ajouté', 18),
  ('EG27', 'ESGE', 5, 'Je décris les propriétés des solides (cube, cylindre, boule, pavé droit, cône, pyramide, prisme droit)', 'CM1-CM2', 'exercice', 2, 'auto', 'iParcours · Solides', 'PIDAPI', 19),
  ('EG28', 'ESGE', 5, 'Je trace deux droites parallèles', 'CM1-CM2', 'exercice', 1, 'enseignant', 'Trace papier', 'PIDAPI', 20),
  ('EG37', 'ESGE', 5, 'Je trouve et je trace les axes de symétrie d''une figure sans quadrillage', 'CM1-CM2', 'exercice', 1, 'enseignant', 'Trace papier', 'Ajouté', 21),
  ('EG29', 'ESGE', 6, 'Je reproduis des figures simples ou complexes', 'CM2', 'exercice', 1, 'enseignant', 'Trace papier', 'PIDAPI', 22),
  ('EG30', 'ESGE', 6, 'Je construis une figure par symétrie axiale (calque, quadrillage, papier uni)', 'CM2', 'exercice', 1, 'enseignant', 'Trace papier', 'PIDAPI', 23),
  ('EG38', 'ESGE', 6, 'Je lis et j''utilise le codage d''une figure (angles droits, longueurs égales)', 'CM2', 'qcm', 2, 'auto', 'iParcours · Géométrie', 'Ajouté', 24),
  ('EG31', 'ESGE', 7, 'Je construis des figures simples ou complexes d''après un schéma à main levée', 'CM2', 'exercice', 1, 'enseignant', 'Trace papier', 'PIDAPI', 25),
  ('EG32', 'ESGE', 7, 'Je sais suivre un programme de construction', 'CM2', 'qcm', 1, 'enseignant', 'Trace papier', 'PIDAPI', 26),
  ('EG33', 'ESGE', 7, 'Je complète et je rédige un programme de construction', 'CM2', 'texte_a_trous', 1, 'enseignant', 'Trace papier', 'PIDAPI', 27),
  ('EG34', 'ESGE', 8, 'Je construis des patrons de solides (cubes et pavés droits)', 'CM2+', 'exercice', 1, 'enseignant', 'Trace papier', 'PIDAPI', 28),
  ('EG35', 'ESGE', 8, 'Je me repère et je me déplace dans l''espace en élaborant des représentations', 'CM2+', 'exercice', 1, 'enseignant', 'Projet de classe', 'PIDAPI', 29),
  ('EG36', 'ESGE', 8, 'Je me sers de la règle, de l''équerre et du compas pour reproduire des figures (triangles de dimensions données)', 'CM2+', 'exercice', 1, 'enseignant', 'Trace papier', 'PIDAPI', 30)
on conflict (code) do update set
  domaine_code = excluded.domaine_code, ceinture_idx = excluded.ceinture_idx,
  libelle = excluded.libelle, niveau_cible = excluded.niveau_cible,
  type_exercice = excluded.type_exercice,
  nb_questions_diagnostic = excluded.nb_questions_diagnostic,
  validation = excluded.validation, rattachement = excluded.rattachement,
  statut_source = excluded.statut_source, ordre = excluded.ordre;
