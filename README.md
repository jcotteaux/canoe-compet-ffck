# canoe-wslive

Front live **competFFCK** (`ws_live`) avec un **bouchon de serveur** qui permet
de développer et de tester sans competFFCK.exe, sans Laragon et sans base MySQL
contenant une compétition lancée.

```bash
npm install
npm start
```

→ <http://localhost:3000/mock/> (panneau de contrôle)
→ <http://localhost:3000/canoe/live.html> (le live)

Le bouchon démarre sur le **slalom**. Les autres compétitions simulées restent
disponibles (`npm run descente`, `npm run international`) et la suite de tests
continue de les exercer.

---

## Pourquoi

`ws_live` est un **pur client** : des pages HTML/JS qui reçoivent toutes leurs
données par une WebSocket ouverte sur competFFCK, un exécutable Windows
propriétaire qui embarque MySQL et Laragon. Pour afficher ne serait-ce qu'une
ligne, il fallait jusqu'ici une compétition réellement chargée dans la base.

Le bouchon rejoue ce protocole. Il n'y a rien à installer d'autre que Node.

Il permet surtout de provoquer à volonté les cas qu'on ne peut pas reproduire
sur une vraie compétition : effacement de manche en plein live, DSQ, pénalité à
50, coupure réseau, bateau retiré de la course.

## Arborescence

| dossier | contenu |
|---|---|
| `ws_live/` | le front officiel, importé tel quel du zip du 2025-02-02 |
| `gestion_kcross_series/` | competCrossFFCK : gestion et live du kayak cross (PHP + MySQL) |
| `mock/` | le bouchon : serveur WebSocket + serveur statique + panneau de contrôle |
| `mock/kcross/` | le simulateur kayak cross : API PHP en mémoire + directeur de course |
| `fixtures/` | compétitions simulées (JSON) ; `fixtures/kcross/` pour le kayak cross |
| `tools/` | générateur de fixtures, pilote de navigateur |
| `docs/` | [le protocole WebSocket](docs/PROTOCOL.md), rétro-ingénieré ; [tester contre un serveur distant](docs/SERVEUR_DISTANT.md) |

Le premier commit contient `ws_live` **non modifié** : tout changement apporté
au front apparaît donc en diff, ce qui n'était pas possible avec la
distribution officielle par zips datés.

## Le bouchon

```bash
npm start                  # slalom 18 portes, 2 inters (par défaut)
npm run descente           # descente sprint
npm run international      # niveau INT : affichage nations + drapeaux

node mock/server.js --fixture descente-sprint --speed 10
node mock/server.js --record captures/ma-session.jsonl
```

| option | défaut | rôle |
|---|---|---|
| `--fixture <id>` | `slalom-finale` | compétition simulée |
| `--speed <n>` | celui de la fixture | accélération du temps |
| `--port <n>` | 3000 | serveur HTTP |
| `--ws-port <n>` | 8080 | serveur WebSocket |
| `--record <fichier>` | — | journalise toutes les trames émises (JSONL) |

Le panneau de contrôle (`/mock/`) pilote la course en direct : départs,
arrivées, pénalités par porte, DNF/DSQ, changement de fixture, et les scénarios
de rupture.

### Pages servies

`live.html`, `monitor_race.html`, `tv_inrace.html`, `tv_oncourse.html`,
`tv_leaders.html`, `tv_podium.html`, `tv_startlist.html`, `tv_ranking.html`,
`jugement.html`, `inrace.php`.

macOS ne fournit plus PHP : `mock/php-lite.js` évalue le petit sous-ensemble
utilisé par les gabarits (`define`, `echo`, `$_GET`, un `if`). Cela couvre
`inrace.php` et `pena_biathlon.php`. `notation_fs.php` utilise le vrai framework
`advPage` (classes PHP) et n'est pas rendu — le bouchon le signale sur la sortie
standard au lieu de produire une page silencieusement cassée.

## Simulateur kayak cross

`gestion_kcross_series/` (competCrossFFCK) n'a rien à voir avec ws_live côté
transport : pas de WebSocket, des pages qui **interrogent des API PHP toutes les
1,5 s**, elles-mêmes adossées à MySQL (tables `KCross_*` plus les tables
competFFCK pour les bateaux et le time trial). Le simulateur remplace PHP et
MySQL par une base en mémoire et fait courir une compétition entière.

```bash
npm run kcross                                  # K1D 24 et K1H 32, huitièmes, tours intercalés
node mock/kcross/server.mjs --fixture icf       # K1D 12, K1H 16
node mock/kcross/server.mjs --fixture montante  # montante-descendante 2 tours
node mock/kcross/server.mjs --paused --manual   # tout se pilote depuis les vraies pages
```

→ <http://localhost:3001/mock/> (panneau de contrôle)
→ <http://localhost:3001/live.html?competition=900>

| option | défaut | rôle |
|---|---|---|
| `--fixture <id>` | `huitiemes` | compétition simulée (`fixtures/kcross/*.json`), toujours servie sous le code `900` pour que les URL d'OBS survivent à un changement |
| `--speed <n>` | celui de la fixture | accélération du temps |
| `--port <n>` | 3001 | serveur HTTP (le bouchon slalom garde 3000) |
| `--paused` | en marche | démarre en pause |
| `--manual` | validation auto | les séries attendent la validation du gestionnaire |
| `--no-config` | configurée | base vide : la compétition se configure depuis `admin.html` |

### Ce qui est simulé

Un directeur de course tient les postes d'une vraie compétition et agit sur la
base **par les mêmes actions `api_save_state.php` que les tablettes** :

| poste | action | effet |
|---|---|---|
| départ | `launch_heat` | série en course, pénalités à zéro, DNS éventuels |
| juges de zone | `validate_zone_penalties` | une zone après l'autre, au passage des bateaux (FLT, RAL) |
| arrivée | `update_place` puis `record_arrivals` | places au fil des arrivées, puis série à valider |
| gestionnaire | `save_progression` | série officielle, qualifiés placés dans le tour suivant |

**Les classements et la progression ne sont pas réécrits** : le simulateur
charge le vrai `gestion_kcross_series/js/engine.js` dans Node et lui fait
générer les séries, les horaires, puis valider chaque série comme le bouton
« Valider » du gestionnaire. Un changement de format ou de règle dans
l'application est donc repris sans toucher au simulateur. Les scripts de
l'application sont des modules ES pour navigateur ; `mock/kcross/hooks.mjs` les
fait accepter par Node malgré le `package.json` en CommonJS.

Le temps est simulé de bout en bout : appel en pré-départ, course (l'ordre
d'arrivée suit, avec du hasard, le classement du time trial), passage des juges,
validation, pause avant la série suivante. Les tirages sont déterministes : même
fixture, même compétition.

Toutes les pages de l'application tournent dessus sans erreur console :
`live.html`, `speaker.html`, `admin.html` (tableaux de progression remplis au
fil de la course), `video/video_control.html` et l'incrustation,
`classement-time-trial.html`, `index.html`, ainsi que les postes `depart.html`,
`arrivee.html`, `penalite.html`.

### Panneau de contrôle

- pause / relance, étape suivante, vitesse, validation automatique ou non ;
- incidents sur la série en course : DNF, DSQ, FLT ou RAL sur la prochaine zone
  non jugée ;
- bouton « Valider » sur chaque série à valider ;
- **coupure réseau** de 15 ou 60 s : les connexions des API sont fermées comme
  sur un Wi-Fi perdu, les postes doivent passer hors-ligne et rejouer leurs
  saisies au retour ;
- programme complet, classements par catégorie, journal de course.

En pause, rien ne bouge seul : les vraies pages pilotent la même base, avec les
mêmes verrous que le PHP (série officielle, zone déjà jugée…). À la relance, une
série partie depuis `depart.html` est reprise là où elle en est.

### Incrustation OBS

`video/video_incrustation.html` n'affiche que ce que lui pousse la régie
(`video_control.html`). Le simulateur joue cette régie (case « régie
automatique » du panneau) : tableau des phases finales puis rampe de départ à
l'appel, live au départ et à chaque arrivée ou pénalité, résultats à la
validation. Tant que la case est cochée, il est seul à écrire l'incrustation.

Les tours Dames et Hommes s'intercalent (1/8 D, 1/8 H, 1/4 D, 1/4 H…), dans
l'ordre que le moteur de l'application calcule à partir de l'ordre des
catégories. Le tableau passe avant chaque départ, centré sur la branche de la
série qui part, et une fois après chaque finale avec le vainqueur.

Ajouts à `gestion_kcross_series/video/` :

- **style « TV »** (`css/incrustation_TV.css`), sélectionnable dans la régie :
  charte des pages TV ws_live. Les deux qualifiés d'une série forment un
  groupe vert, séparé des éliminés ;
- **Dames / Hommes** : libellé et couleur par catégorie (rose / bleu) en tête
  des bandeaux du style TV et sur le tableau, déduits du code (K1D, K1H) ;
- **club** sous le nom sur la rampe, le live et les résultats. La régie le
  demande désormais à l'API ; les anciens styles le masquent ;
- **tableau des phases finales** (`video_tableau.html`) : deux branches qui
  convergent vers la finale, la règle en une phrase, la prochaine course
  encadrée, les places à venir libellées (« Vainqueur S1 », « 2e de S2 »), les
  qualifiés d'office du time trial, le vainqueur une fois la finale jouée.
  L'incrustation l'embarque et l'affiche en mode `BRACKET` ; seul, il se teste
  avec `?force=1&categorie=K1H`. À l'antenne, il ne montre que la branche de
  la série qui part (en 1/8 et 1/4 : les séries qui alimentent la même série,
  celle-ci et le tour d'après ; ensuite la fin de l'arbre), en caractères
  lisibles sur YouTube ; `?vue=complet` affiche l'arbre entier. Composé pour
  1920 × 1080, il se réduit d'un bloc sur un écran plus petit, comme
  l'incrustation. Les tours se lisent de gauche à droite ; à
  32 bateaux (8 huitièmes) la première colonne ne tiendrait pas à l'écran et le
  tableau passe en deux branches qui convergent vers la finale
  (`?disposition=ltr|branches` pour forcer). Dessiné pour l'élimination directe
  ICF de 8 à 32 bateaux, y compris les huitièmes « barrage » à 20 ; pas pour
  le Joker, la montante-descendante ni les Piges, qui ne sont pas des arbres ;
- **écran TV du site** (`ecran_tv.html?competition=…`) : page autonome pour
  le public sur place, sans régie. En haut, la progression de la journée
  (programme par blocs 1/8 Dames, 1/8 Hommes…, course n° x sur y, heure) ; à
  gauche la branche du tableau de la série en cours ; à droite la série en
  cours (au départ, en course avec places et pénalités, arrivée, résultats
  avec les qualifiés) et la série suivante. Une série validée reste à l'écran
  avec son tableau `?maintien=20` secondes, puis l'écran passe à la suivante
  (aussitôt si elle part avant). L'arbre est dessiné par `js/tableau_view.js`,
  partagé avec l'incrustation ;
- **correctif** : en mode Live, l'incrustation empilait ses lignes à chaque
  mise à jour (ids créés `live-row-0`, cherchés `live-row-R`).

### Garde-fou : live web coupé

La configuration livrée (`api/config/config.php`) active l'envoi vers
`livecompet.ffck.org`. Le simulateur renvoie `fonction_live_enabled: false`
dans `load_full_competition` : un gestionnaire ouvert sur une compétition
simulée ne publie rien sur le live public.

### Non simulé

Import de sauvegarde, compétitions manuelles, journal d'audit, création des
tables, export/import de course : ces API répondent `501` avec leur nom, et le
simulateur le signale sur sa sortie standard.

## Incrustation du bateau suivi (`tv_inrace`) refaite

`canoe/tv_inrace.html` gardait la mise en page du gabarit d'origine : blocs
dessinés par des images de fond, police Calibri jamais déclarée (Times sur
macOS), textes qui débordaient des gabarits, pays et drapeau à moitié
masqués. La logique (départ, intermédiaires avec écart au leader, arrivée,
ordres de régie, filtres d'URL) est conservée ; l'affichage est refait avec la
charte des autres incrustations TV :

- **bas gauche** : dossard dans un pavé, nom, **club** (à la place du pays et
  du drapeau) et catégorie ;
- **bas droite** : chrono tournant dans le pavé de temps ; au passage d'un
  intermédiaire, « Inter 1 », l'écart au leader (vert devant, rouge derrière)
  et le temps du leader au-dessus, avec un badge doré **NEW LEADER** quand le
  bateau passe devant ; à l'approche de l'arrivée, la bande « Leader » ;
- **bord droit** : les **pénalités au fil des portes jugées**, une ligne par
  porte pénalisée (« Porte 7 +50 », jaune pour 2 s, rouge pour 50 s) ; les
  portes passées proprement ne sont pas listées ;
- **arrivée** : « Arrivée », écart, temps et place (en or pour le meilleur
  temps). Tant qu'une porte n'est pas jugée, place et écart sont calculés sur
  le temps connu face aux bateaux classés de la catégorie, sous le libellé
  orange « Provisoire », puis confirmés ;
- **enchaînement** : l'arrivée reste au moins 8 s (`?delay_finish_min=`), puis
  l'incrustation passe au bateau suivant s'il est sur l'eau. Auparavant elle
  restait 40 s (`?delay_finish=`) sur le résultat pendant que le chrono du
  suivant tournait sans être affiché ; ce délai ne sert plus que lorsque
  personne n'est en course, ou avec un bateau imposé (`?bib_select=`).

Tous les blocs du bas ont la même hauteur et la même ligne de base. Les tailles
de police ne sont plus posées par le script. `?bg=1` (fond magenta) et
`?anim=0` fonctionnent comme sur les autres pages TV.

Corrigés au passage : `Reload()` appelait une fonction `ClearRunning()` qui
n'existait pas (erreur à chaque effacement de manche) ; un intermédiaire dans
les 10 premières secondes de l'affichage d'un bateau perdait son écart au
leader (la référence était effacée à chaque trame par le bloc de départ).

Bouchon : une porte jugée « 0 » était effacée au lieu d'être enregistrée,
toutes les arrivées restaient donc provisoires ; les juges valident désormais
les portes restantes 3 s (simulées) après l'arrivée.

## Nouvelle page : tous les bateaux en course

`canoe/tv_oncourse.html` — `tv_inrace.html` n'affiche qu'un seul bateau (celui
choisi par `GetBibSelect`). Cette page les montre **tous**, en surimpression en
haut à gauche.

Fond **transparent** : elle se superpose à une vidéo dans OBS ou un navigateur
en overlay. Chaque ligne porte son propre fond, sinon le texte devient illisible
dès que l'image est claire (écume, ciel).

Pas d'en-tête : seules les lignes s'affichent, et elles disparaissent
entièrement quand personne n'est en course — un cadre vide à l'écran est pire
que pas de cadre.

Le style reprend celui des autres pages TV, valeurs relevées dans leurs
gabarits : Calibri gras blanc et tailles en `pt` (`tv_inrace.css`), dégradé de
ligne `#030910 → #256eb5` (`img/block_name.png`), pavé de temps bleu pâle sur
texte `rgb(0,27,90)` (`img/block_running.png`), animation `apparitionD 0.7s`
(`tv_ranking.css`) et magenta `#D500FF` pour le repli chroma-key.

Au passage, la fonte Calibri est **déclarée** en `@font-face` sur les `.ttf`
déjà livrés dans `canoe/font/`. Les autres pages écrivent `font-family: Calibri`
sans jamais la déclarer : sur un poste sans Calibri (macOS, Linux) leur rendu
diverge silencieusement.

| paramètre | défaut | rôle |
|---|---|---|
| `epreuve=K1H` | toutes | n'afficher qu'une épreuve |
| `max=8` | 10 | nombre de lignes maximum |
| `scale=1.2` | 1 | facteur de taille |
| `top=` / `left=` | 40 | position en pixels (ancrage haut-gauche) |
| `right=` | — | ancre le bloc à droite plutôt qu'à gauche |
| `width=` | 560 | largeur du bandeau |
| `delay_finish=6000` | 10000 | durée d'affichage après l'arrivée, en ms (même nom que `tv_inrace`) |
| `no_pena` | affiché | masque le cumul de pénalités |
| `time_pena=0` | avec | slalom : temps tournant sans les pénalités |
| `fmt=XSCC` | selon l'activité | format du chrono |
| `bg=1` | transparent | fond magenta pour une régie chroma-key |
| `anim=0` | animé | coupe les animations |

Les bateaux encore sur l'eau sont triés du plus proche de l'arrivée au plus
récemment parti, sur le **temps brut** : en slalom, un bateau à +50 s affiche
son temps pénalisé mais ne remonte pas en tête, puisqu'il n'est pas plus avancé
sur le parcours.

**Cumul de pénalités** (slalom) : un pavé rouge `+52` sur la ligne, masqué tant
qu'il est nul. Ce sont les secondes de pénalité, pas le nombre de portes
touchées — c'est ce qui est déjà ajouté au temps tournant, et le badge explique
donc pourquoi celui-ci a sauté. `canoe.GetCurrentSlalomCountPena` ne convenait
pas : elle compte les portes **jugées**, y compris celles à 0.

**À l'arrivée** : le bateau quitte le flux `<on_course>`, mais sa ligne reste
10 s en tête de liste, passe au vert d'arrivée, et affiche son temps classant
(pénalités comprises) plus sa **place** dans un pavé jaune. Le temps et la place
définitifs viennent du `<epreuve_load>` déclenché par l'arrivée ; en attendant sa
réponse, la ligne montre le chrono brut de la trame `<bib_time>`. Un bateau non
classé (DNF, DSQ) n'affiche pas de place.

Deux pièges rencontrés en développant cette page, tous deux invisibles hors
navigateur réel :

- réordonner avec `appendChild` retire puis réinsère le nœud, ce qui **relance
  ses animations CSS** ; à 10 Hz les lignes restaient bloquées à 24 % d'opacité.
  L'ordre passe donc par la propriété flex `order` ;
- un bateau remis en course après avoir été marqué sortant était quand même
  supprimé par le minuteur de sortie lancé auparavant.

## Nouvelle page : classement des premiers

`canoe/tv_leaders.html` — les premiers de l'épreuve, en surimpression en haut
à gauche, avec le dernier arrivé en pied de bloc.

L'épreuve affichée est celle du **dernier arrivé** : le classement ne bascule
qu'au moment où le premier bateau de la nouvelle épreuve franchit la ligne.
Basculer au départ viderait le bloc, puisque la nouvelle épreuve n'a alors
encore aucun classé.

Au premier affichage, faute d'arrivée observée, la page prend l'épreuve
chronométrée que porte le flux `<on_course>` — mais seulement si elle a déjà
des classés. Sinon elle remonte le programme à l'envers jusqu'à la dernière
épreuve qui en a : ouvrir la page pendant les K1D alors que seuls les K1H ont
des résultats doit montrer les K1H, pas un bloc vide.

Chaque ligne porte la place et le dossard dans leur propre pavé, détachés du
dégradé : ce sont les deux repères que le spectateur cherche en premier, ils ne
sont pas du texte posé sur le fond.

Le **dernier arrivé** est mis en évidence. S'il figure déjà dans les premiers,
sa ligne y est simplement colorée ; sinon elle apparaît sous un trait de
séparation, pour qu'on ne la lise pas comme la place suivante.

Le classement est celui de competFFCK (`Cltc`), repris tel quel pour ne pas
diverger de lui en cas d'ex æquo ; la position dans la liste triée ne sert que
de repli. Les statuts DNF/DNS/DSQ sont des valeurs négatives et sortent donc
naturellement du classement.

**Cumul de pénalités** (slalom) : même pavé rouge que sur `tv_oncourse`, masqué
quand il est nul. Le temps affiché (`Tps`) inclut déjà ces secondes : le pavé
explique donc l'écart entre le chrono du bateau et son temps au classement, et
pourquoi un bateau à +52 se retrouve derrière des chronos plus lents.

**Écarts**, à droite de chaque temps. Par défaut l'écart avec le premier, qui
est l'usage des affichages de résultats ; `?ecart=precedent` donne l'écart avec
le concurrent qui précède au classement. La case du premier reste vide.

Sous la minute l'écart se lit en secondes (`+3,20`), au-delà en minutes
(`+1:30.00`). `adv.js` écrit la virgule dans ses formats « secondes » et le
point dans ses formats « minutes » : en descente on obtiendrait donc `1:30.15`
suivi de `+1,15` sur la même ligne. Le séparateur de l'écart est aligné sur
celui du temps, et un test le vérifie.

### Insertion animée

À chaque arrivée, la nouvelle ligne **s'insère** à sa place et celles qui
reculent **glissent** d'un cran. Le classement n'est jamais effacé puis
redessiné : les lignes déjà à l'écran sont les mêmes nœuds du DOM, seul leur
contenu et leur ordre changent.

Deux points rendent cela possible :

- l'ordre passe par la propriété flex `order`, jamais par `appendChild` —
  réinsérer un nœud relance ses animations CSS ;
- le glissement utilise la technique FLIP : on relève la position de chaque
  ligne avant la mise à jour, on la relève après, et on repart de l'ancienne
  pour animer jusqu'à la nouvelle. La transition est posée depuis le
  JavaScript, la distance n'étant connue qu'à l'exécution.

L'animation d'insertion dure 350 ms, comme le glissement : les deux doivent se
lire comme un seul mouvement. Le bloc entier garde les 0,7 s de la charte.

Le test `tv_leaders / insertion sans redessiner` marque les lignes avant
l'arrivée et vérifie ensuite que sept ont survécu, qu'une seule est neuve et
que cinq ont glissé.

| paramètre | défaut | rôle |
|---|---|---|
| `max=8` | 8 | nombre de places affichées |
| `epreuve=K1H` | suit le chrono | fige l'épreuve |
| `top=` / `left=` | 40 | position en pixels (ancrage haut-gauche) |
| `bottom=` | — | ancre le bloc en bas plutôt qu'en haut |
| `width=` | 760 | largeur du bloc (620 sans les écarts) |
| `scale=1.2` | 1 | facteur de taille |
| `libelle=1` | code court | libellé complet de l'épreuve |
| `no_last` | affiché | masque la ligne du dernier arrivé |
| `no_pena` | affiché | masque le cumul de pénalités (slalom) |
| `ecart=precedent` | au premier | écart avec le concurrent précédent |
| `no_ecart` | affiché | masque la colonne des écarts |
| `no_categ` | affiché | masque l'en-tête d'épreuve |
| `fmt=XSCC` | selon l'activité | format du chrono |
| `bg=1` | transparent | fond magenta pour une régie chroma-key |
| `anim=0` | animé | coupe les animations |

Même charte que `tv_oncourse`. Les deux blocs étant ancrés à gauche, c'est
`apparitionG` (entrée par la gauche) qui s'applique ; `apparitionD` reste en
place pour l'ancrage à droite.

`tv_oncourse` et `tv_leaders` sont deux pages distinctes, comme le veut la
convention maison (une page = une incrustation). Toutes deux transparentes et
calées au même coin haut-gauche : **c'est la régie qui les décale**, chaque
source étant positionnée indépendamment. Pour les régler depuis l'URL plutôt
que depuis OBS, jouer sur `top` de chacune.

## Nouvelle page : podium de fin d'épreuve

`canoe/tv_podium.html` — les trois premiers sur un podium à marches 2-1-3,
plein écran centré, déclenché automatiquement **quand une épreuve se termine**.
La page ne peint rien le reste du temps.

**Fin d'épreuve** : tous les bateaux de l'épreuve ont une valeur dans `Tps`.
competFFCK laisse cette colonne vide tant qu'un bateau n'a pas de résultat, et
y met une valeur négative pour DNF/DNS/DSQ — un abandon compte donc comme un
bateau traité, pas comme un bateau attendu. Une épreuve n'est jouée qu'une
fois ; `<run_erase>` la rend rejouable.

Séquence : le titre descend, puis les marches montent dans l'ordre 3 → 2 → 1
avec un léger dépassement, et un éclat balaie la marche du vainqueur. Sortie
d'un bloc après `delay`. Un voile radial assombrit le fond, sans quoi le
podium se lit mal sur une image de rivière en mouvement.

| paramètre | défaut | rôle |
|---|---|---|
| `delay=15000` | 15000 | durée d'affichage en ms |
| `scale=0.8` | 1 | facteur de taille |
| `epreuve=K1H&force=1` | — | joue ce podium tout de suite et sans fin, pour régler le cadrage en répétition |
| `no_scrim` | voile actif | retire le voile assombrissant |
| `fmt=XSCC` | selon l'activité | format du chrono |
| `bg=1` | transparent | fond magenta pour une régie chroma-key |
| `anim=0` | animé | tout apparaît d'un coup |

Moins de trois classés : les marches vides disparaissent plutôt que d'afficher
un bloc sans nom.

L'or vient de `img/60_140_Y.jpg`. **L'argent et le bronze ne viennent d'aucun
gabarit maison** — il n'en existe pas — ce sont des valeurs conventionnelles,
à ajuster si la FFCK en a.

Pour déclencher un podium depuis le bouchon : bouton « Terminer l'épreuve en
cours » du panneau, ou `POST /mock/api/finish-categ`.

### Attention à `wsMain.delay`

`ws.Context` possède un champ `delay` qui sert à **différer la distribution de
toutes les trames** (`ws.js`, `onmessage_command_delay`). Y écrire une durée
métier paralyse la page : c'est ce qui est arrivé en écrivant la durée
d'affichage du podium dans `wsMain.delay`, et la page ne recevait plus rien
pendant 15 s. Un test le vérifie désormais.

## Tests de non-régression

```bash
npm test                    # 46 cas
node tools/smoke.js --only tv
```

Chaque cas ouvre une page dans Chrome, y déroule un scénario réaliste (arrivée
en direct, DNF/DSQ, pénalité à 50, effacement de manche, coupure réseau,
changement de mode chrono) et **échoue si la console produit la moindre
erreur**. Le bouchon est démarré automatiquement si besoin.

Mesure de référence : sur le code tel que distribué, la suite donnait **17/20**.

## Blindage

Quatre défauts corrigés, tous reproduits par la suite avant correction.

| où | défaut |
|---|---|
| `canoe/js/live.js`, `live_web.js` | `OnBroadcastModeChrono` testait `canoe.GetTableRanking() !== 'object'` — il manquait `typeof`, la condition était donc **toujours** vraie et appelait `OpenWebSocketCommand()`, qui n'existe pas (la fonction de la page s'appelle `OnOpenWebSocketCommand`). `ReferenceError` à chaque `<mode_chrono>`. |
| `canoe/js/live.js:86` | `elemTime.GetAttribute(...)` au lieu de `getAttribute`. La branche qui restaure une cellule quand un bateau quitte la course ne faisait pas son travail : le temps tournant restait figé au lieu de repasser à `-`. |
| `adv/adv.js`, `adv/canoe.js` | `GetTable` levait une exception sans `tables`, `GetTableUnique` et `canoe.GetTable*` retournaient `undefined` — alors que la plupart des 72 appelants enchaînent sur `.GetNbRows()`. Toute trame arrivant avant le chargement de la course plantait la page (`monitor_race.html` était inutilisable). Ils retournent désormais **toujours** une table, vide si la donnée n'est pas là. |
| `adv/ws.js` | Un handler qui levait une exception interrompait le traitement : la page cessait silencieusement de se mettre à jour jusqu'au prochain F5. Chaque appel est maintenant protégé et l'erreur journalisée avec la clé fautive. |

Pour distinguer « pas encore chargé » de « chargé mais vide », utiliser les
nouveaux `canoe.HasRace()` / `canoe.HasRanking()`, ou `adv.IsTableUnique`.

### Champ `fn` : exécution de code à distance

`ws.js` faisait `window[objJSON.fn](objJSON)` : le serveur choisissait
n'importe quelle fonction globale de la page. Sur un réseau de course ouvert,
quiconque se fait passer pour le serveur exécute du code arbitraire.

Le champ `fn` n'est plus honoré que pour les noms explicitement autorisés :

```js
wsMain.AllowFunction('MaFonction');
```

Aucune page de `ws_live` n'utilisait ce mécanisme et la suite passe à 20/20 sans
rien autoriser. Un refus est journalisé bruyamment avec le nom demandé : si
competFFCK s'en sert réellement en production, cela se verra immédiatement et
il suffira d'ajouter la fonction concernée. **À vérifier avant de déployer sur
une compétition.**

## Chrono local

Le temps tournant ne dépend plus de la régularité du serveur. competFFCK
envoie `<on_course>` environ 10 fois par seconde (horloge et temps de chaque
bateau sur l'eau) et les pages affichaient ces valeurs telles quelles : qu'un
serveur ralentisse et le chrono se figeait, puis sautait.

`adv/ws.js` (`ws.ChronoLocal`) intercepte désormais ces trames avant les pages :

- chaque trame recale une référence locale par bateau
  (`départ estimé = réception - temps reçu`) ; on garde l'estimation la plus
  précoce, celle de la trame la moins retardée, si bien qu'une trame en retard
  ne fait ni reculer ni geler l'affichage ;
- le temps transmis aux pages est calculé localement, et si le serveur se tait
  plus de 100 ms, le poste fabrique lui-même la trame suivante (10 Hz) ;
- **régulation** : si le serveur indique sans interruption pendant 3 s que
  l'affichage est en avance de plus de 150 ms, le chrono ralentit de 20 % au
  plus jusqu'à le rejoindre. Il ne recule jamais ;
- à l'arrivée (`<bib_time>`, passage 0) le chrono du bateau s'arrête aussitôt ;
  `<run_erase>` et `<race_load>` remettent tout à zéro ; au-delà de 20 s sans
  trame, on cesse d'extrapoler et l'affichage se fige comme avant.

Toutes les pages en profitent sans modification (`live`, `live_web`,
`inrace`, `tv_inrace`, `tv_oncourse`, `tv_results`, et `canoe_national`, qui
charge le même `ws.js`). `?chrono=serveur` dans l'URL rétablit l'ancien
comportement.

Mesure avec le bouchon en mode « serveur lent » (retard aléatoire de 0 à
250 ms par trame, gel de 1,5 s toutes les 4 s), chrono relevé toutes les 20 ms :

| page | gel le plus long, serveur | gel le plus long, chrono local |
|---|---|---|
| `tv_oncourse` | 1 499 ms | 162 ms |
| `tv_inrace` | 1 501 ms | 161 ms |
| `inrace.php` | 1 539 ms | 161 ms |
| `tv_results` | 1 479 ms | 162 ms |
| `live`, `live_web` (à la seconde) | 2 380 ms, saut de 2 s | 1 100 ms, 1 s par seconde |

Aucun retour en arrière dans les deux cas ; les gels volontaires de
`inrace`/`tv_inrace` (affichage du temps intermédiaire) sont exclus de la mesure.

Pour reproduire : `node mock/server.js --lag`, ou bouton « Serveur lent » du
panneau.

## Reconnexion automatique

`adv/ws.js` se reconnecte désormais seul. Auparavant, `onclose` se contentait de
mettre la socket à `null` : la moindre coupure Wi-Fi figeait la page jusqu'à un
F5 manuel — sur un réseau de course, devant le public.

- délai progressif de 1 s à 15 s, pour ne pas inonder un serveur qui vient de tomber ;
- à la reconnexion, le contexte **rejoue l'état** (`<race_load>` puis
  `<epreuve_load>`) au lieu de rappeler le handler d'ouverture, qui renverrait
  l'utilisateur à la liste des compétitions en plein direct ;
- `<competition_load>` n'est pas rejoué quand une course est chargée : cela
  ferait clignoter le sélecteur avant le retour du classement ;
- les commandes sont captées en instrumentant `websocket.send`, donc les pages
  qui appellent `wsMain.websocket.send(...)` directement sont couvertes sans
  modification.

Chaque changement d'état émet un `CustomEvent` sur `window` :

```js
window.addEventListener('competffck:ws-status', (e) => {
  // e.detail.status : 'connected' | 'reconnecting' | 'reconnected'
});
```

Aucun affichage n'est imposé : une page d'incrustation TV ne doit rien dessiner.
`wsContext.Close()` ferme sans reconnecter, `wsContext.reconnect = false` désactive.

Pour le vérifier : bouton « Couper le réseau » du panneau, ou `Ctrl-C` sur le
serveur puis relance — la page doit repartir seule sur la même épreuve.

### Liaison morte

Une coupure sans fermeture propre (wifi qui décroche, switch redémarré,
serveur figé) laisse la socket « ouverte » : aucun `onclose`, la page reste
figée sur le dernier état. Une fois que `<on_course>` (10 Hz) s'est manifesté sur
la socket, 10 s sans aucune trame suffisent : la socket est abandonnée sans
attendre sa fermeture, puis rouverte avec le rejeu de l'état
(`ws.SILENCE_RECONNECT`, statut `silent`, `?watchdog=0` pour désactiver).
Comme seul `<on_course>` arme la surveillance, un serveur qui se tait
volontairement provoque au plus une reconnexion, pas une boucle.

API du bouchon : `POST /mock/api/mute-clients` rend muettes les sockets
ouvertes (rien ne passe, ni dans un sens ni dans l'autre) ; les nouvelles
connexions fonctionnent.

### `tv_inrace` : toujours recalée sur le serveur

- au chargement de la page, le flux `<on_course>` est ignoré tant que le
  classement n'est pas arrivé : le bateau est choisi une fois qu'on sait le
  nommer, son identité s'affiche, ses pénalités déjà jugées aussi ;
- chaque rechargement du classement (ouverture, reconnexion, effacement de
  manche) recale l'affichage : leader recalculé (les index de lignes de
  l'ancien classement ne valent plus rien), pénalités reconstruites, arrivée
  en cours réaffichée avec les données fraîches ; une arrivée survenue pendant
  la coupure s'affiche à la reprise ;
- un dossard inconnu du classement (en course, temps, pénalité) déclenche un
  nouveau `<epreuve_load>`, au plus toutes les 5 s.

Vérifié sur le bouchon : coupure muette pendant une course, avec pénalités et
arrivée manquées, puis page ouverte en plein parcours.

### Configuration de l'adresse WebSocket

`ws_live/adv/ws_params.js` **n'existe pas dans le zip officiel** : chaque
déploiement doit le créer, en codant l'IP en dur. La version de ce dépôt la
déduit :

1. `?ws=192.168.1.10:8080` dans l'URL de la page (mémorisé ensuite) ;
2. `localStorage['competffck.ws']` ;
3. à défaut, l'hôte qui a servi la page.

Aucun poste du réseau de course n'a donc de fichier JS à éditer.

## Tester une page dans un vrai navigateur

`tools/browse.js` pilote Chrome via le DevTools Protocol : il laisse le temps
réel s'écouler (indispensable, les données arrivent par WebSocket), navigue,
puis renvoie le DOM, les erreurs console et une capture.

```bash
node tools/browse.js http://localhost:3000/canoe/live.html \
  --click "#main table td a >> #main table tbody tr:first-child td button" \
  --settle 10000 --shot /tmp/live.png
```

Il sort en code 2 si la page a produit une erreur console — utilisable tel quel
comme test de non-régression.

## Fixtures

```bash
npm run fixtures     # régénère fixtures/*.json
```

Les JSON sont versionnés ; `tools/make-fixtures.js` ne sert qu'à les
régénérer ou à en dériver de nouvelles. Les temps sont tirés d'un générateur
pseudo-aléatoire à graine fixe : une fixture donne toujours la même course.

| fixture | activité | particularités |
|---|---|---|
| `slalom-finale` | SLA | 48 bateaux, 4 épreuves, 18 portes, 2 inters, colonnes `@…` |
| `descente-sprint` | DES | 48 bateaux, 4 épreuves, 1 inter |
| `descente-internationale` | DES / INT | 16 bateaux, nations et drapeaux |

## Limites connues

Le bouchon reproduit le protocole tel qu'il est déduit du code client. Les
points non vérifiables sans capture sur une compétition réelle sont listés en
fin de [docs/PROTOCOL.md](docs/PROTOCOL.md). Une capture (via
`client_notification.py`, adapté en enregistreur) permettra de les confirmer et
de rejouer du flux authentique.
