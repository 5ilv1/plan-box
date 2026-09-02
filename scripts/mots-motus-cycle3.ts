/**
 * Mots à deviner du Motus, pour une classe de CE2-CM2, groupés par thème.
 *
 * Critères de choix :
 *  - 5 à 9 lettres. En dessous, la grille se devine trop vite ; au-delà, elle
 *    devient large et le mot souvent trop rare.
 *  - vocabulaire courant du cycle 3 : un élève doit pouvoir le reconnaître,
 *    mais pas le trouver du premier coup. D'où l'absence de « chat » ou
 *    « vélo », et celle des mots techniques ou littéraires.
 *  - noms communs, quelques verbes à l'infinitif.
 *  - pas de noms propres, pas de traits d'union : le jeu ne saisit que A-Z.
 *
 * Les accents sont conservés pour l'affichage côté enseignant ; le jeu les
 * ignore (`normaliserMot`). Chaque mot est vérifié contre `motus_lexique` par
 * scripts/seed-mots-motus.ts : une faute de frappe est refusée à l'import.
 *
 * Les codes de thème doivent exister dans THEMES (lib/motus-themes.ts).
 * Un mot peut appartenir à plusieurs thèmes : « chocolat » est de la nourriture,
 * de Noël et de Pâques.
 */

export const MOTS_PAR_THEME: Record<string, string[]> = {
  animaux: [
    "requin", "dauphin", "baleine", "tortue", "gazelle", "guépard", "panthère",
    "écureuil", "hérisson", "marmotte", "chouette", "hibou", "pigeon",
    "moineau", "corbeau", "mouette", "pélican", "autruche", "flamant",
    "perroquet", "papillon", "libellule", "fourmi", "abeille", "araignée",
    "escargot", "crapaud", "lézard", "serpent", "crocodile", "éléphant",
    "girafe", "zèbre", "chameau", "sanglier", "renard", "blaireau", "belette",
    "hamster", "lapin", "mouton", "chèvre", "cochon", "poulain", "jument",
    "taureau", "canard", "poussin", "dindon", "saumon", "truite", "sardine",
    "méduse", "pieuvre", "homard", "crevette", "oursin", "phoque", "otarie",
    "manchot", "pingouin", "castor", "loutre", "taupe", "mulot", "vipère",
    "biche", "chevreuil", "kangourou", "panda", "koala", "bison", "buffle",
    "antilope", "gorille", "perruche", "canari", "faucon", "vautour",
    "cigogne", "héron", "coucou", "pivert", "mésange", "cheval", "poisson",
    "dinosaure", "hibou", "corneille", "écrevisse", "limace", "chenille",
    "criquet", "bourdon", "guêpe", "moustique", "scarabée", "vipère",
  ],

  nature: [
    "montagne", "colline", "vallée", "rivière", "ruisseau", "cascade",
    "torrent", "falaise", "plage", "désert", "forêt", "clairière", "prairie",
    "sentier", "chemin", "rocher", "caillou", "sable", "argile", "marais",
    "étang", "lagune", "océan", "marée", "vague", "écume", "récif", "volcan",
    "cratère", "séisme", "glacier", "banquise", "iceberg", "avalanche",
    "tempête", "orage", "tonnerre", "éclair", "nuage", "brume", "rosée",
    "givre", "flocon", "grêle", "saison", "automne", "hiver", "printemps",
    "soleil", "planète", "étoile", "comète", "galaxie", "horizon", "rivage",
    "pente", "sommet", "gouffre", "grotte", "caverne", "source", "fleuve",
    "berge", "canyon", "steppe", "savane", "toundra", "jungle", "oasis",
    "climat",
  ],

  plantes: [
    "bouleau", "chêne", "platane", "peuplier", "noisetier", "pommier",
    "cerisier", "olivier", "sapin", "cyprès", "roseau", "fougère", "mousse",
    "lichen", "tulipe", "jonquille", "lavande", "muguet", "pissenlit",
    "ortie", "ronce", "lierre", "bambou", "cactus", "racine", "feuille",
    "branche", "écorce", "graine", "bourgeon", "pétale", "pollen", "verger",
    "potager", "récolte", "moisson", "buisson", "rameau", "épine",
  ],

  alimentation: [
    "chocolat", "gâteau", "gaufre", "crêpe", "brioche", "baguette", "farine",
    "levure", "fromage", "yaourt", "beurre", "confiture", "sucre", "poivre",
    "moutarde", "vinaigre", "salade", "tomate", "carotte", "radis", "poireau",
    "navet", "courgette", "potiron", "haricot", "lentille", "épinard",
    "asperge", "oignon", "échalote", "persil", "basilic", "banane", "orange",
    "citron", "abricot", "cerise", "fraise", "framboise", "myrtille",
    "raisin", "melon", "pastèque", "ananas", "noisette", "amande", "biscuit",
    "bonbon", "tartine", "potage", "soupe", "omelette", "jambon", "poulet",
    "saucisse", "galette", "compote", "sirop", "tisane", "céréale", "semoule",
  ],

  ecole: [
    "cartable", "trousse", "crayon", "gomme", "règle", "ciseaux", "colle",
    "feutre", "stylo", "cahier", "classeur", "agrafe", "tableau", "craie",
    "ardoise", "pupitre", "lecture", "dictée", "calcul", "problème", "leçon",
    "devoir", "cantine", "maîtresse", "directeur", "élève", "copain",
    "camarade", "roman", "poésie", "histoire", "science", "musique", "dessin",
    "peinture", "pinceau", "palette", "sculpture", "théâtre", "spectacle",
    "chorale", "flûte", "guitare", "piano", "tambour", "trompette", "violon",
    "partition", "mélodie", "rythme", "refrain", "carnet", "manuel", "atlas",
  ],

  maison: [
    "fenêtre", "escalier", "grenier", "plafond", "plancher", "cuisine",
    "chambre", "salon", "couloir", "placard", "armoire", "tiroir", "étagère",
    "fauteuil", "coussin", "couette", "oreiller", "lampe", "bougie", "miroir",
    "rideau", "tapis", "serrure", "poignée", "balcon", "terrasse", "jardin",
    "clôture", "barrière", "portail", "toiture", "cheminée", "gouttière",
    "robinet", "éponge", "balai", "poubelle", "valise", "parapluie",
    "chaussure", "écharpe", "manteau", "pantalon", "chemise", "pyjama",
    "bonnet", "casquette", "lunettes", "ceinture", "bouton", "tissu", "laine",
    "coton", "assiette", "cuillère", "fourchette", "casserole", "bouteille",
    "théière", "cafetière", "saladier", "torchon", "serviette",
  ],

  ville: [
    "boulanger", "épicerie", "marché", "magasin", "boutique", "pharmacie",
    "quartier", "avenue", "ruelle", "trottoir", "carrefour", "immeuble",
    "château", "clocher", "musée", "stade", "piscine", "gymnase", "mairie",
    "caserne", "hôpital", "aéroport", "tunnel", "viaduc", "autoroute",
    "chantier", "usine", "atelier", "fermier", "berger", "pêcheur", "marin",
    "pilote", "facteur", "pompier", "plombier", "menuisier", "maçon",
    "coiffeur", "libraire", "cuisinier", "infirmier", "jardinier", "policier",
    "docteur", "peintre", "boucher", "épicier", "horloger", "serrurier",
    "éleveur", "vendeur", "danseur", "chanteur", "écrivain",
  ],

  transports: [
    "voiture", "camion", "tracteur", "remorque", "scooter", "autobus",
    "tramway", "wagon", "bateau", "voilier", "barque", "radeau", "navire",
    "paquebot", "avion", "planeur", "fusée", "navette", "ballon", "traîneau",
    "patin", "métro", "péniche", "chariot", "carrosse", "calèche", "pédalo",
    "camionnette", "ambulance", "téléphérique", "montgolfière",
  ],

  corps: [
    "squelette", "muscle", "poumon", "estomac", "cerveau", "épaule", "coude",
    "genou", "cheville", "poignet", "talon", "doigt", "pouce", "ongle",
    "cheveu", "sourcil", "paupière", "menton", "langue", "gorge", "respirer",
    "grandir", "guérir", "soigner", "vaccin", "microbe", "fièvre", "remède",
    "artère", "veine", "hanche", "colonne", "rotule", "crâne",
  ],

  sports: [
    "natation", "escalade", "handball", "football", "basket", "tennis",
    "karaté", "cyclisme", "course", "sprint", "relais", "record", "équipe",
    "arbitre", "maillot", "raquette", "filet", "panier", "victoire",
    "défaite", "champion", "médaille", "trophée", "tournoi", "puzzle",
    "échecs", "toupie", "cerceau", "cabane", "masque", "carnaval", "kermesse",
    "billes", "corde", "patinage", "aviron", "escrime", "tremplin", "podium",
  ],

  temps: [
    "journée", "semaine", "matinée", "soirée", "minute", "seconde", "horloge",
    "vacances", "voyage", "départ", "arrivée", "retour", "sortie",
    "promenade", "balade", "aventure", "veille", "lendemain",
    "durée", "instant", "époque", "siècle", "année", "aube", "crépuscule",
    "midi", "matin", "attente", "avenir", "passé", "présent",
  ],

  emotions: [
    "bonheur", "courage", "patience", "silence", "sourire", "amitié",
    "colère", "tristesse", "mystère", "surprise", "secret", "cadeau",
    "pensée", "mémoire", "espoir", "confiance", "fierté", "timide", "joyeux",
    "curieux", "généreux", "tranquille", "inquiet", "étonné", "rassuré",
    "peureux", "fâché", "content", "rêveur", "sérieux",
  ],

  langage: [
    "écriture", "parole", "phrase", "lettre", "syllabe", "voyelle",
    "consonne", "verbe", "sujet", "nombre", "chiffre", "addition", "division",
    "mesure", "longueur", "largeur", "hauteur", "distance", "vitesse",
    "balance", "triangle", "carré", "losange", "cercle", "sphère", "volume",
    "surface", "symétrie", "question", "réponse", "exemple", "erreur",
    "progrès", "effort", "réussite", "projet", "accent", "virgule",
    "majuscule", "adjectif", "pluriel", "féminin", "conjugaison",
  ],

  actions: [
    "courir", "sauter", "nager", "plonger", "grimper", "glisser", "rouler",
    "voler", "chanter", "danser", "rêver", "écouter", "observer", "chercher",
    "trouver", "dessiner", "peindre", "fabriquer", "inventer", "imaginer",
    "raconter", "expliquer", "apprendre", "réfléchir", "mesurer", "compter",
    "partager", "applaudir", "réussir", "gagner", "perdre", "ranger",
    "nettoyer", "cuisiner", "jardiner", "voyager", "explorer", "naviguer",
    "atterrir", "décoller", "bricoler", "escalader", "galoper", "murmurer",
    "chuchoter", "bondir", "franchir", "surveiller", "protéger",
  ],

  sciences: [
    "boussole", "lanterne", "torche", "échelle", "marteau", "tournevis",
    "pelle", "râteau", "arrosoir", "brouette", "tondeuse", "cadenas",
    "monnaie", "billet", "trésor", "coffre", "maquette", "modèle", "machine",
    "moteur", "engrenage", "aimant", "télescope", "loupe", "jumelles",
    "appareil", "écran", "clavier", "souris", "console", "manette", "robot",
    "antenne", "satellite", "batterie", "ampoule", "câble", "levier",
    "ressort", "poulie", "hélice", "circuit", "énergie", "lumière",
    "chaleur", "liquide", "matière", "ordinateur", "boulier", "compas",
    "équerre", "microscope", "éprouvette", "expérience",
  ],

  imaginaire: [
    "dragon", "sorcière", "licorne", "géant", "lutin", "potion", "sortilège",
    "chevalier", "princesse", "royaume", "donjon", "armure", "épée",
    "bouclier", "pirate", "trésor", "carte", "boussole", "naufrage",
    "sirène", "ogre", "farfadet", "baguette", "grimoire", "légende",
    "conte", "fable", "héros", "monstre", "fantôme", "citrouille", "magie",
    "enchanteur", "palais", "carrosse", "sceptre", "couronne",
  ],

  // ── Thèmes de saison ──
  halloween: [
    "citrouille", "potiron", "fantôme", "sorcière", "squelette", "monstre",
    "potion", "chaudron", "araignée", "toile", "vampire", "momie",
    "épouvantail", "costume", "bonbons", "frisson", "cimetière", "hibou",
    "corbeau", "chauve", "balai", "masque", "déguisement", "lanterne", "ténèbres", "hurlement", "sombre", "terreur", "grimace",
  ],

  noel: [
    "sapin", "guirlande", "cadeau", "traîneau", "renne", "cheminée",
    "étoile", "bougie", "crèche", "santon", "berger", "flocon", "hiver",
    "biscuit", "orange", "papillote", "décembre", "réveillon", "festin",
    "lutin", "hotte", "ruban", "emballage", "boule", "houx", "gui",
    "patinoire", "marché", "chocolat", "chorale", "cantique", "veillée",
    "friandise", "clémentine", "manteau", "moufles", "carillon",
  ],

  hiver: [
    "neige", "glace", "verglas", "givre", "glaçon", "banquise", "iceberg",
    "flocon", "luge", "patinage", "traîneau", "bonnet", "écharpe", "moufles",
    "manteau", "gants", "frimas", "froidure", "chalet", "cheminée", "galette",
    "couronne", "janvier", "février", "brouillard", "congère", "tempête",
    "hibernation", "marmotte", "renard", "chamois", "bouquetin",
  ],

  carnaval: [
    "carnaval", "masque", "déguisement", "confetti", "serpentin", "costume",
    "clown", "défilé", "parade", "fanfare", "crêpe", "beignet", "chandeleur",
    "farine", "sucre", "perruque", "trompette", "tambour", "musique",
    "cortège", "arlequin", "pierrot", "colombine", "farandole", "grimace",
    "maquillage", "pirate", "princesse", "guirlande",
  ],

  printemps: [
    "printemps", "bourgeon", "jonquille", "tulipe", "muguet", "pâquerette",
    "hirondelle", "oisillon", "nichée", "abeille", "papillon", "pollen",
    "verdure", "prairie", "rosée", "averse", "ondée", "parapluie",
    "renouveau", "semis", "potager", "plantation", "germe", "pousse",
    "floraison", "cerisier", "pommier", "lilas", "violette", "primevère",
  ],

  paques: [
    "cloche", "chocolat", "lapin", "poule", "poussin", "panier", "cachette",
    "jardin", "friandise", "coquille", "printemps", "carillon", "cocotte",
    "chasse", "surprise", "gourmand", "moulage", "praline", "noisette",
    "agneau", "brioche", "colombe", "clochette", "dimanche", "grelot",
    "cloches", "lapereau", "poulette", "confiserie", "nougat", "guimauve",
    "corbeille", "pelouse", "tablette",
  ],

  ete: [
    "vacances", "plage", "sable", "coquillage", "parasol", "maillot",
    "serviette", "bouée", "piscine", "baignade", "château", "seau",
    "pelle", "crème", "soleil", "chaleur", "glace", "sorbet", "citronnade",
    "camping", "caravane", "tente", "randonnée", "montagne", "rivière",
    "pique", "valise", "voyage", "juillet", "août", "canicule", "orage",
    "cigale", "criquet", "lézard", "hamac", "cerf", "pastèque",
  ],
};
