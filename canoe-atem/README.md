# canoe-atem

App iOS qui **déclenche les macros d'un mélangeur ATEM** et affiche en même
temps **ce qui se passe sur l'eau**, lu directement du chronométrage
competFFCK.

Universelle iPhone / iPad, sans ordinateur intermédiaire : le téléphone parle
au mélangeur et au chronométrage, chacun sur le réseau du site de course.

```bash
npm start            # simulateur ATEM + rien d'autre à installer
swift test           # 39 cas sur les deux protocoles
open App/CanoeAtem.xcodeproj
```

---

## Pourquoi

En régie de slalom, les deux informations qui décident de ce qu'on envoie à
l'antenne ne sont pas au même endroit : les macros sont dans l'ATEM, et
« qui est sur l'eau, qui part dans trente secondes » est dans competFFCK. On
regarde un écran, on tend la main vers un autre.

L'app met les deux sur la même surface. Un appui = une macro, et la liste des
bateaux est à côté du bouton.

## Arborescence

| dossier | contenu |
|---|---|
| `Sources/AtemKit/` | le protocole UDP des mélangeurs ATEM |
| `Sources/CanoeLiveKit/` | le client WebSocket competFFCK |
| `Sources/atemctl/` | banc d'essai en ligne de commande |
| `App/` | l'app SwiftUI (projet Xcode) |
| `sim/` | simulateur de mélangeur ATEM |
| `Tests/` | tests des deux encodages |

`AtemKit` et `CanoeLiveKit` sont un paquet Swift ordinaire : l'app les référence
en paquet local, et `swift build` les compile sans Xcode. Le même code sert donc
à l'app et au banc d'essai, sans copie.

## Développer sans matériel

C'est le point qui a dicté toute la structure. Le protocole ATEM n'est pas
documenté par Blackmagic et **ne se découvre pas à l'exécution** : il n'y a rien
à interroger, un mélangeur ignore silencieusement une commande mal formée. Sans
mélangeur sous la main, le seul moyen de vérifier qu'on encode juste est de se
confronter à un pair qui décode selon la même spécification.

D'où `sim/atem-sim.js`, qui parle le vrai protocole — y compris l'enregistrement
d'une macro, qu'il rejoue ensuite opération par opération :

```bash
npm start                          # ou : node sim/atem-sim.js --verbose
swift run atemctl atem list        # liste les macros du mélangeur simulé
swift run atemctl atem run 4       # déclenche la macro 4
swift run atemctl atem sectors 0 1 2 3   # déroule un plan de secteurs
swift run atemctl atem grave --depart 10 # grave les douze macros de régie
```

Pour le côté course, c'est le bouchon de **canoe-wslive** qui sert de serveur :

```bash
cd ../canoe-wslive && npm start
curl -X POST http://127.0.0.1:3000/mock/api/start     # lance la course
cd ../canoe-atem && swift run atemctl canoe watch
```

```
Coupe de France Slalom — Slalom Finale  [SLA]  14:02:13
  en course (1) :
    2 RIVIERE Hugo [K1H]  43.00
  prochains départs :
    3 VASSEUR Quentin [K1H]  14:03:00  0:47
```

Le simulateur iOS partage le réseau du Mac : `127.0.0.1` dans les réglages de
l'app suffit à la brancher sur les deux bouchons.

`CANOE_DEBUG=1` fait tracer chaque trame competFFCK reçue sur la sortie
d'erreur — utile sur une vraie compétition, où il n'y a pas de navigateur pour
inspecter le flux.

## Le protocole ATEM

Rétro-ingénieré, jamais publié. Les offsets et les valeurs d'énumération de
`AtemKit` sont repris de l'implémentation de référence
[`atem-connection`](https://github.com/nrkno/sofie-atem-connection), seule
source stable ; chaque constante porte en commentaire le fichier dont elle
vient.

**Transport** — UDP sur le port 9910, un paquet = 12 octets d'en-tête puis une
suite de commandes.

| octets | contenu |
|---|---|
| 0-1 | drapeaux (5 bits hauts) + longueur totale (11 bits bas) |
| 2-3 | identifiant de session |
| 4-5 | numéro du paquet acquitté |
| 6-7 | numéro demandé en retransmission |
| 10-11 | numéro de ce paquet |

Drapeaux : `0x01` demande d'acquittement, `0x02` ouverture de session, `0x04`
retransmission, `0x08` demande de retransmission, `0x10` acquittement.

**Commandes** — 8 octets d'en-tête : longueur sur 16 bits (elle **inclut**
l'en-tête et fait avancer le parseur), puis le nom sur 4 caractères à
l'offset 4. Les données commencent à l'offset 8 et sont complétées à un
multiple de 4 octets.

Celles qui nous concernent :

| nom | sens | contenu |
|---|---|---|
| `MPrp` | ← macro | index, `isUsed`, longueurs puis nom et description |
| `MRPr` | ← exécution | bit 0 en cours, bit 1 en attente, index en 2-3 |
| `MAct` | → action | index sur 16 bits, action sur 8 (0 = jouer) |
| `PrgI` / `PrvI` | ← programme / preview | bus en 0, source en 2-3 |
| `InPr` | ← entrée | id, nom long (20 o.), nom court (4 o.) |
| `StRS` / `RTMS` | ← direct / enregistrement | état sur 16 bits |
| `InCm` | ← fin du vidage d'état | — |
| `_top` | ← capacités | nombre de M/E, de DVE, de SuperSource |
| `MSRc` | → gravure | emplacement, longueurs puis nom et description |
| `MRcS` | ← gravure | enregistrement en cours, emplacement en 2-3 |
| `CMPr` | → macro | masque, emplacement, nom et description |
| `CSBP` / `SSBP` | ↔ fenêtre SuperSource | masque, fenêtre, source, x, y, taille |
| `CSSc` | → fond SuperSource | masque, source de remplissage |
| `CKTp` | → incrustation | masque, M/E, keyer, type (1 = chroma) |
| `CKeF` | → incrustation | M/E, keyer, source de remplissage |
| `CKOn` / `KeOn` | ↔ incrustation | M/E, keyer, à l'antenne |
| `KeBP` | ← incrustation | type, remplissage, découpe, masquage |
| `CACC` / `KACC` | ↔ chroma avancé | masque, curseur, couleur Y Cb Cr |
| `CKCk` | → chroma classique | masque, teinte en dixièmes de degré |

Trois de ces commandes portent un **masque** : le mélangeur n'applique que les
champs dont le bit est levé et laisse les autres tels quels. C'est ce qui permet
de changer la caméra d'une fenêtre sans toucher à son cadrage — sans masque, il
faudrait réécrire position et taille à chaque changement de source, donc les
connaître.

`CSBP` et `CSSc` ont par ailleurs **changé de disposition en 8.0** : l'identifiant
du SuperSource s'est inséré derrière le masque et décale tout le reste. On
n'encode que cette forme, les mélangeurs qui ont un SuperSource étant tous
au-delà. `_top` a de même gagné un champ en 2.30 ; `_ver` arrivant en tête du
vidage d'état, la version est connue au moment de le lire.

**Deux pièges**, tous deux invisibles à la compilation comme à l'exécution :

- l'identifiant de session **change** entre la réponse d'ouverture et les
  paquets suivants. Le client adopte celui de chaque paquet reçu plutôt que de
  le figer à la poignée de main ;
- la trame d'ouverture porte `0x003a` aux octets 8-9. Ce champ n'a pas de sens
  connu, mais c'est ce qu'envoie l'implémentation de référence : on le
  reproduit tel quel plutôt que d'envoyer un zéro qu'aucun mélangeur réel n'a
  jamais reçu.

### État de la vérification

Les deux protocoles sont **vérifiés contre un pair qui décode**, pas contre du
matériel : `AtemKit` face à `sim/atem-sim.js`, `CanoeLiveKit` face au bouchon
canoe-wslive. C'est ce qui attrape une erreur d'offset, ce n'est pas ce qui
prouve qu'un ATEM répondra.

À vérifier au premier contact avec le mélangeur, dans cet ordre :

1. la poignée de main aboutit et les macros apparaissent — si la liste est
   vide alors que l'ATEM en a, c'est `MPrp` ;
2. une macro se déclenche — sinon c'est `MAct` ;
3. le retour `MRPr` allume bien le bouton pendant l'exécution ;
4. `atemctl atem cadrage duo` pose bien les deux fenêtres à l'image — sinon
   c'est `CSBP`, et les coordonnées de `WindowGeometry` sont le premier
   endroit où regarder ;
5. la gravure aboutit : la macro apparaît nommée dans ATEM Software Control.
   Sinon c'est `MSRc`, ou le mélangeur n'accepte pas d'enregistrer à distance ;
6. l'incrustation chroma découpe bien la couleur demandée — voir plus bas :
   l'échelle des composantes échantillonnées est le seul nombre du dépôt qui
   n'ait pas de source.

**Le point à vérifier avant tous les autres** : jouer « F1 Cam 3 » alors qu'on
est en duo doit changer la caméra *sans* remettre la fenêtre en plein cadre. Le
jeu de macros repose entièrement là-dessus — que le mélangeur grave l'opération
masquée et non l'état complet de la fenêtre. C'est le seul point qu'un
simulateur ne peut pas trancher : il décode ce qu'on lui envoie, il ne dit pas
ce qu'un ATEM choisit de graver. Si le cadrage saute, il faudra deux jeux de
macros caméra, un par cadrage — soit vingt macros au lieu de douze.

`_MAC` (taille du pool de macros) n'est **pas** lu : son encodage n'a pas pu
être confirmé, et la liste se construit de toute façon à partir des `MPrp`
reçus. Les valeurs de `StRS` et `RTMS` viennent de la même source que le reste
mais ne sont utilisées que pour deux pastilles d'état : une erreur y serait
sans conséquence sur le déclenchement des macros.

## Le protocole competFFCK

Décrit dans [canoe-wslive/docs/PROTOCOL.md](../canoe-wslive/docs/PROTOCOL.md).
L'app rejoue l'enchaînement de `live.html` : `<competition_load>` →
`<race_load>` sur la course active → `<epreuve_load>` avec une épreuve vide,
ce qui donne le classement de **toutes** les épreuves. Le serveur pousse
ensuite `<on_course>` en continu.

Les identités, les heures de départ et les pénalités ne sont que dans le
classement ; `<on_course>` ne porte que `bib` et `time`. L'app croise les deux.

**Les noms de colonne dépendent de l'activité.** En descente competFFCK envoie
les noms finaux (`Tps1_1`), en slalom des noms génériques (`@TIME_1_1_1`) que
le front officiel renomme au vol. Plutôt que de rejouer ce renommage, le client
accepte les deux orthographes — c'est ce que fait `AdvTable.index(ofAny:)`, et
un test le vérifie.

## Secteurs

Un **secteur** est une portion du parcours couverte par un cadrage. Suivre un
bateau qui descend, c'est passer de l'un au suivant, toujours dans le même
ordre.

L'app en tient de **1 à 6**, chacun affecté à une macro, et un seul bouton les
joue dans l'ordre. C'est le geste principal d'une descente : on le presse en
regardant la rivière, pas l'écran. Le bouton annonce la macro qu'il enverra,
pour qu'on puisse le vérifier d'un coup d'œil sans avoir à le déclencher.

La bande des secteurs et ce bouton sont **ancrés en bas de l'écran** et ne
défilent pas : un geste répété doit tomber au même endroit à chaque fois, et
rester sous le pouce sur un téléphone.

Le plan **boucle** : après le dernier secteur, l'appui suivant revient au
premier, prêt pour le bateau d'après. C'est ce qui évite d'avoir à penser à
réarmer entre deux descentes. La bande des secteurs reste tapable directement,
pour rattraper une fausse manœuvre sans faire le tour.

Deux choix qui se remarquent à l'usage :

- **un secteur sans macro n'interrompt pas la progression.** Le plan avance
  quand même et n'envoie rien : il reste calé sur la descente, et un secteur
  vide est un oubli de réglage, pas une raison de bloquer le bouton ;
- **les six secteurs restent réglables**, y compris au-delà du nombre utilisé,
  et réduire ce nombre n'efface pas les affectations des autres. On prépare un
  parcours à six secteurs, on redescend à trois pour une course, et le plan
  complet revient en remontant le nombre — les secteurs hors du compte sont
  marqués « inutilisé » dans les réglages.

Le nombre de secteurs se choisit d'un geste (un sélecteur de 1 à 6) et chaque
secteur a sa macro, dans les réglages. Le secteur courant, lui, n'est pas
conservé d'un lancement à l'autre — on ouvre l'app avant une descente, pas au
milieu.

Le cycle est un type à part (`SectorPlan`, dans `AtemKit`) plutôt qu'un bout
d'état dans la vue : c'est ce qui permet de le couvrir par des tests et de le
dérouler contre le mélangeur simulé avec `atemctl atem sectors`.

## Graver les macros

Une macro ne se **téléverse** pas : le protocole n'a pas de commande pour
recevoir une macro toute faite. Il en a une pour l'**enregistrer** — `MSRc`
ouvre un emplacement, tout ce que le mélangeur reçoit ensuite y est gravé,
`MAct` avec l'action `stopRecord` referme. C'est exactement ce que fait ATEM
Software Control quand on appuie sur son bouton rouge : il n'a aucun privilège,
il envoie les mêmes commandes sur le même port UDP. Un enregistrement grave donc
aussi ce qu'enverrait un autre client — pendant une gravure, rien d'autre ne
doit toucher au mélangeur.

```bash
swift run atemctl atem cadrage duo --cam1 2 --cam2 7  # pose le cadrage, sans rien graver
swift run atemctl atem grave --essai                  # affiche le plan, n'envoie rien
swift run atemctl atem grave --depart 10              # grave à partir de l'emplacement 10
```

Les douze macros d'une régie à deux kayakistes :

| macro | ce qu'elle fait |
|---|---|
| `Duo` | les deux fenêtres : la 1 en haut à gauche, la 2 en bas à droite |
| `Plein ecran` | la fenêtre 1 seule, plein cadre |
| `F1 Cam 1…5` | la caméra de la fenêtre 1 |
| `F2 Cam 1…5` | la caméra de la fenêtre 2 |

**Deux images à l'écran, c'est le SuperSource** : un compositeur qui tient
plusieurs fenêtres et qui s'envoie au programme comme une source ordinaire. Sur
un ATEM Mini Extreme il y en a un, plus deux DVE qui restent libres pour autre
chose. On aurait pu monter le duo avec deux incrustations DVE, mais il aurait
fallu leur trouver un fond et occuper deux keyers pour un résultat identique.

Le programme reste donc **toujours** sur le SuperSource, et les macros ne
déplacent que ce qu'il y a dedans. C'est ce qui rend « duo » et « plein écran »
indépendantes des caméras affichées : une macro ne sait pas lire l'état du
mélangeur, elle rejoue une séquence figée. Si le plein écran devait envoyer une
caméra directement au programme, il lui faudrait connaître laquelle — donc une
macro par combinaison, soit trente au lieu de douze.

Pour la même raison, une macro de caméra ne porte **que** la source : le masque
de `CSBP` laisse position et taille intactes, et la même macro sert en plein
écran comme en duo.

Graver écrase. `atem grave` refuse les emplacements déjà occupés et les liste ;
`--force` passe outre, `--depart n` grave ailleurs.

## Incruster une source

Une incrustation chroma — une source posée sur le programme, une couleur rendue
transparente — se grave comme le reste :

```bash
swift run atemctl atem incrust --source 8 --couleur CC00CC
swift run atemctl atem incrust --sonde              # ce que le mélangeur retient, sans rien graver
swift run atemctl atem incrust --couleur melangeur  # regrave la couleur relevée sur le mélangeur
```

Quatre opérations, dans cet ordre : la source de remplissage, le type chroma,
la couleur, puis la mise à l'antenne. **La mise à l'antenne vient en dernier** —
l'inverse afficherait l'incrustation mal réglée le temps que le reste arrive, et
sur une macro ce temps se voit. Une seconde macro la retire : un keyer qu'on ne
sait pas enlever reste à l'antenne, la macro de retrait n'est pas un supplément.

Le keyer se pose **au-dessus du programme**, donc au-dessus du SuperSource :
l'incrustation survit aux bascules de cadrage, et les macros de cadrage n'ont
pas à la connaître.

### L'échelle de la couleur

C'est le seul nombre de tout le dépôt qui n'ait **aucune source**. Le keyer
chroma des mélangeurs récents ne se règle pas par teinte mais par
échantillonnage : on pose un curseur sur l'image et le mélangeur en tire une
couleur. Ces trois composantes (Y, Cb, Cr) sont heureusement inscriptibles
directement — c'est ce qui permet de graver une couleur connue dans une macro
sans rien avoir à viser.

Mais ni Blackmagic ni l'implémentation de référence ne disent dans quelle
**échelle** le mélangeur les range. Le millième est la convention de presque
toutes les autres grandeurs du protocole, d'où le choix par défaut ; il reste un
choix. `#CC00CC` vaut, en BT.709, Y 0,2278, Cb +0,3083, Cr +0,3633 — soit
`228 / 308 / 363` au millième, ou `2278 / 3083 / 3633` au dix-millième.

D'où la sonde, qui ne suppose rien :

1. régler la couleur une fois à la main, dans ATEM Software Control ;
2. `atemctl atem incrust --sonde` lit ce que le mélangeur en a fait et annonce
   l'échelle qui s'en déduit ;
3. `--couleur melangeur` regrave ces valeurs telles quelles, ou `--echelle
   10000` reprend le calcul dans la bonne échelle.

## L'app

Les macros ne se créent pas **depuis l'app** : elles se gravent avec `atemctl
atem grave` ou s'enregistrent depuis ATEM Software Control, et l'app les liste
et les joue. Une macro sans nom reste déclenchable, annoncée par son rang.

Disposition selon la taille d'écran : sur iPad les macros et le panneau de
course côte à côte, sur iPhone l'essentiel de la course en tête et les macros
dessous, atteignables au pouce. Palette sombre à fort contraste — l'app
s'utilise dehors, en plein soleil ou de nuit en régie.

Le bouton d'une macro s'allume **dès l'appui**, sans attendre la confirmation
du mélangeur : celle-ci met un aller-retour à revenir, et sans retour immédiat
on appuie deux fois. Un garde-fou de 3 secondes l'éteint si la confirmation ne
vient jamais.

Les deux liaisons se rétablissent seules et sont indépendantes : sur un site de
course le Wi-Fi tombe, et on veut garder les macros quand le chrono lâche.

### Installer sur un appareil

Ouvrir `App/CanoeAtem.xcodeproj`, sélectionner la cible `CanoeAtem`, et régler
l'équipe de signature (onglet *Signing & Capabilities*) ainsi que
`PRODUCT_BUNDLE_IDENTIFIER`, aujourd'hui `com.archireport.canoe-atem`.

iOS demande l'autorisation d'accès au **réseau local** au premier lancement :
sans elle, ni le mélangeur ni competFFCK ne répondent. Si elle a été refusée,
elle se rétablit dans Réglages → Canoë ATEM → Réseau local.

## Ce qui n'est pas fait

- **rien n'est automatique** : aucune macro ne se déclenche sur une arrivée ou
  un départ, et le passage au secteur suivant reste un appui. Le lien entre les
  deux protocoles reste dans la tête de la personne en régie, ce qui est le bon
  endroit tant qu'on n'a pas éprouvé l'app sur une vraie course ;
- pas de classement ni de podium dans l'app — c'est le rôle des incrustations
  de canoe-wslive, qui vont à l'antenne ;
- l'app ne joue que des macros. Les commandes de cadrage et d'incrustation
  (SuperSource, programme, keyer) n'existent que dans `atemctl`, le temps de
  graver : pas de transition ni de contrôle caméra ;
- la découverte automatique du mélangeur sur le réseau n'est pas implémentée,
  l'adresse se saisit à la main.
