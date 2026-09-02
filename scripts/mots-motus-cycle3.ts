/**
 * Mots à deviner du Motus, pour une classe de CE2-CM2, groupés par thème.
 *
 * Le thème est affiché aux élèves sous la grille : c'est leur seul indice.
 * **Un mot doit donc évoquer son thème sans explication.** C'est le critère le
 * plus important de ce fichier, avant même le niveau de vocabulaire : une
 * trompette sous l'indice « L'école » n'aide personne, elle égare. D'où les
 * thèmes séparés pour la musique et les arts, et pour les vêtements.
 *
 * Un mot peut figurer dans plusieurs thèmes quand il est plausible dans
 * chacun — « chocolat » pour la nourriture, Noël et Pâques ; « bonnet » pour
 * les vêtements et l'hiver. Mais s'il n'est évident que dans un seul, il ne va
 * que là.
 *
 * Autres critères :
 *  - 5 à 10 lettres. En dessous, la grille se devine trop vite.
 *  - vocabulaire courant du cycle 3 : reconnaissable, mais pas trouvable du
 *    premier coup. D'où l'absence de « chat » ou « vélo », et celle des mots
 *    techniques ou littéraires.
 *  - noms communs, quelques verbes à l'infinitif et adjectifs.
 *  - pas de noms propres, pas de traits d'union : le jeu ne saisit que A-Z.
 *
 * Les accents sont conservés pour l'affichage côté enseignant ; le jeu les
 * ignore (`normaliserMot`). Chaque mot est vérifié contre `motus_lexique` par
 * scripts/seed-mots-motus.ts : une faute de frappe est refusée à l'import.
 *
 * Les codes de thème doivent exister dans THEMES (lib/motus-themes.ts).
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
    "dinosaure", "corneille", "écrevisse", "limace", "chenille", "criquet",
    "bourdon", "guêpe", "moustique", "scarabée",
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

  // Ce qu'un élève voit et fait en classe. La musique, le dessin et le théâtre
  // sont partis dans « arts » : « trompette » sous l'indice « L'école »
  // n'aidait pas à deviner.
  ecole: [
    "cartable", "trousse", "crayon", "gomme", "règle", "ciseaux", "colle",
    "feutre", "stylo", "cahier", "classeur", "agrafe", "tableau", "craie",
    "ardoise", "pupitre", "lecture", "dictée", "calcul", "problème", "leçon",
    "devoir", "cantine", "maîtresse", "directeur", "élève", "copain",
    "camarade", "roman", "poésie", "histoire", "science", "carnet", "manuel",
    "atlas", "récréation", "préau", "rentrée", "écolier", "sonnerie",
    "bulletin", "exercice", "brouillon", "résumé", "exposé", "casier",
    "effort", "progrès", "réussite", "erreur",
  ],

  arts: [
    "musique", "dessin", "peinture", "pinceau", "palette", "sculpture",
    "sculpteur", "théâtre", "spectacle", "chorale", "flûte", "guitare",
    "piano", "tambour", "trompette", "violon", "partition", "mélodie",
    "rythme", "refrain", "chanson", "orchestre", "concert", "danse",
    "comédie", "scène", "décor", "musicien", "artiste", "aquarelle",
    "statue", "harpe", "mosaïque", "portrait",
  ],

  maison: [
    "fenêtre", "escalier", "grenier", "plafond", "plancher", "cuisine",
    "chambre", "salon", "couloir", "placard", "armoire", "tiroir", "étagère",
    "fauteuil", "coussin", "couette", "oreiller", "lampe", "bougie", "miroir",
    "rideau", "tapis", "serrure", "poignée", "balcon", "terrasse", "jardin",
    "clôture", "barrière", "portail", "toiture", "cheminée", "gouttière",
    "robinet", "éponge", "balai", "poubelle", "parapluie", "assiette",
    "cuillère", "fourchette", "casserole", "bouteille", "théière",
    "cafetière", "saladier", "torchon", "serviette", "tabouret", "buffet",
    "commode", "lavabo", "baignoire", "douche", "matelas", "traversin",
    "cintre", "aspirateur",
  ],

  vetements: [
    "chaussure", "chaussette", "écharpe", "manteau", "pantalon", "chemise",
    "pyjama", "bonnet", "casquette", "lunettes", "ceinture", "bouton",
    "tissu", "laine", "coton", "chapeau", "veste", "blouson", "anorak",
    "gants", "mitaine", "tablier", "sandale", "botte", "pantoufle",
    "chausson", "cravate", "foulard", "collant", "culotte", "tricot",
    "velours", "dentelle", "poche", "manche", "doublure",
  ],

  ville: [
    "boulanger", "épicerie", "marché", "magasin", "boutique", "pharmacie",
    "quartier", "avenue", "ruelle", "trottoir", "carrefour", "immeuble",
    "clocher", "musée", "stade", "piscine", "gymnase", "mairie",
    "caserne", "hôpital", "aéroport", "tunnel", "viaduc", "autoroute",
    "chantier", "usine", "atelier", "fermier", "berger", "pêcheur", "marin",
    "pilote", "facteur", "pompier", "plombier", "menuisier", "maçon",
    "coiffeur", "libraire", "cuisinier", "infirmier", "jardinier", "policier",
    "docteur", "peintre", "boucher", "épicier", "horloger", "serrurier",
    "éleveur", "vendeur", "danseur", "chanteur", "écrivain", "monnaie",
    "billet", "caisse", "vitrine", "enseigne", "banque", "bureau", "parking",
    "fontaine", "square", "kiosque",
  ],

  transports: [
    "voiture", "camion", "tracteur", "remorque", "scooter", "autobus",
    "tramway", "wagon", "bateau", "voilier", "barque", "radeau", "navire",
    "paquebot", "avion", "planeur", "fusée", "navette", "traîneau", "métro",
    "péniche", "chariot", "calèche", "pédalo", "voyage", "départ", "arrivée",
    "retour", "promenade", "balade", "valise", "escale", "croisière",
    "itinéraire", "trajet", "bagage", "passager", "conducteur",
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
    "échecs", "toupie", "cerceau", "kermesse", "billes", "corde",
    "patinage", "aviron", "escrime", "tremplin", "podium", "ballon",
    "dossard", "vestiaire", "gymnaste", "supporter", "marathon", "rugby",
    "volley", "pétanque",
  ],

  temps: [
    "journée", "semaine", "matinée", "soirée", "minute", "seconde", "horloge",
    "veille", "lendemain", "durée", "instant", "époque", "siècle", "année",
    "matin", "attente", "avenir", "passé", "présent", "vacances",
    "crépuscule", "calendrier", "horaire", "montre", "pendule", "réveil",
    "minuit", "semestre", "trimestre", "quinzaine", "quotidien", "autrefois",
    "toujours", "jadis", "bientôt", "demain",
  ],

  emotions: [
    "bonheur", "courage", "patience", "silence", "sourire", "amitié",
    "colère", "tristesse", "surprise", "pensée", "mémoire", "espoir",
    "confiance", "fierté", "timide", "joyeux", "curieux", "généreux",
    "tranquille", "inquiet", "étonné", "rassuré", "peureux", "fâché",
    "content", "rêveur", "sérieux", "gentil", "aimable", "heureux", "triste",
    "jaloux", "honteux", "surpris", "ennui", "tendresse", "affection",
    "émotion", "chagrin", "sanglot", "câlin", "calme", "douceur", "méchant",
    "respect",
  ],

  langage: [
    "écriture", "parole", "phrase", "lettre", "syllabe", "voyelle",
    "consonne", "verbe", "sujet", "nombre", "chiffre", "addition", "division",
    "mesure", "longueur", "largeur", "hauteur", "distance", "vitesse",
    "balance", "triangle", "carré", "losange", "cercle", "sphère", "volume",
    "surface", "symétrie", "question", "réponse", "exemple", "accent",
    "virgule", "majuscule", "adjectif", "pluriel", "féminin", "synonyme",
    "rectangle", "diagonale", "fraction", "moitié", "double", "somme",
    "produit", "résultat", "décimal", "dizaine", "centaine", "millier",
    "quotient", "diviseur", "multiple", "périmètre", "diamètre", "rayon",
    "angle",
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
    "machine", "moteur", "engrenage", "aimant", "télescope", "loupe",
    "jumelles", "appareil", "écran", "clavier", "souris", "console",
    "manette", "robot", "antenne", "satellite", "batterie", "ampoule",
    "câble", "levier", "ressort", "poulie", "hélice", "circuit", "énergie",
    "lumière", "chaleur", "liquide", "matière", "ordinateur", "boulier",
    "compas", "équerre", "microscope", "éprouvette", "expérience",
    "maquette", "pince", "tenaille", "perceuse", "baromètre",
  ],

  imaginaire: [
    "dragon", "sorcière", "licorne", "géant", "lutin", "potion", "sortilège",
    "chevalier", "princesse", "royaume", "donjon", "armure", "bouclier",
    "pirate", "trésor", "coffre", "naufrage", "sirène", "farfadet",
    "baguette", "grimoire", "légende", "conte", "fable", "héros", "monstre",
    "fantôme", "magie", "palais", "château", "carrosse", "sceptre", "couronne",
    "aventure", "sorcier", "gnome", "mystère",
  ],

  // ── Thèmes de saison ──
  halloween: [
    "citrouille", "fantôme", "sorcière", "squelette", "monstre", "potion",
    "chaudron", "araignée", "vampire", "momie", "costume",
    "bonbons", "frisson", "cimetière", "hibou", "corbeau", "balai",
    "masque", "lanterne", "ténèbres", "hurlement", "sombre", "terreur",
    "grimace", "sorcier", "effrayant", "macabre", "ombre", "panique",
    "tombeau",
  ],

  noel: [
    "sapin", "guirlande", "cadeau", "traîneau", "renne", "cheminée",
    "étoile", "bougie", "crèche", "santon", "berger", "flocon", "biscuit",
    "papillote", "décembre", "réveillon", "festin", "lutin", "hotte",
    "ruban", "emballage", "boule", "patinoire", "chocolat", "cantique",
    "veillée", "friandise", "clémentine", "carillon", "bûche", "paquet",
    "étrenne",
  ],

  hiver: [
    "neige", "glace", "verglas", "givre", "glaçon", "banquise", "iceberg",
    "flocon", "patinage", "traîneau", "bonnet", "écharpe", "moufles",
    "manteau", "gants", "frimas", "froidure", "chalet", "cheminée",
    "galette", "couronne", "janvier", "février", "brouillard", "congère",
    "tempête", "hibernation", "marmotte", "igloo", "frileux", "glacial",
    "glissade",
  ],

  carnaval: [
    "carnaval", "masque", "confetti", "serpentin", "costume", "clown",
    "défilé", "parade", "fanfare", "crêpe", "beignet", "chandeleur",
    "perruque", "trompette", "tambour", "cortège", "arlequin", "pierrot",
    "colombine", "farandole", "grimace", "maquillage", "pirate", "princesse",
    "jongleur", "acrobate", "échasse", "samba", "costumé",
  ],

  printemps: [
    "printemps", "bourgeon", "jonquille", "tulipe", "muguet", "pâquerette",
    "hirondelle", "oisillon", "nichée", "abeille", "papillon", "pollen",
    "verdure", "prairie", "rosée", "averse", "ondée", "renouveau", "semis",
    "potager", "plantation", "germe", "pousse", "floraison", "cerisier",
    "pommier", "lilas", "violette", "primevère", "oiseau", "jardinage",
    "arrosage",
  ],

  paques: [
    "cloche", "chocolat", "lapin", "poule", "poussin", "panier", "cachette",
    "friandise", "coquille", "carillon", "cocotte", "chasse",
    "moulage", "praline", "agneau", "brioche", "colombe", "clochette",
    "dimanche", "grelot", "cloches", "lapereau", "poulette", "confiserie",
    "nougat", "guimauve", "corbeille", "chocolats",
  ],

  ete: [
    "vacances", "plage", "sable", "coquillage", "parasol", "maillot",
    "serviette", "bouée", "piscine", "baignade", "crème", "soleil",
    "chaleur", "glace", "sorbet", "citronnade", "camping", "caravane",
    "tente", "randonnée", "valise", "juillet", "canicule", "cigale",
    "hamac", "pastèque", "bronzage", "transat", "vagues", "estival",
    "planche", "kayak", "bivouac", "colonie", "festival", "barbecue",
    "limonade", "moustique",
  ],
};
