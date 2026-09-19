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
| `mock/` | le bouchon : serveur WebSocket + serveur statique + panneau de contrôle |
| `fixtures/` | compétitions simulées (JSON) |
| `tools/` | générateur de fixtures, pilote de navigateur |
| `docs/` | [le protocole WebSocket](docs/PROTOCOL.md), rétro-ingénieré |

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
| `--ws-port <n>` | 20000 | serveur WebSocket |
| `--record <fichier>` | — | journalise toutes les trames émises (JSONL) |

Le panneau de contrôle (`/mock/`) pilote la course en direct : départs,
arrivées, pénalités par porte, DNF/DSQ, changement de fixture, et les scénarios
de rupture.

### Pages servies

`live.html`, `monitor_race.html`, `tv_inrace.html`, `tv_oncourse.html`,
`tv_leaders.html`, `tv_startlist.html`, `tv_ranking.html`, `jugement.html`,
`inrace.php`.

macOS ne fournit plus PHP : `mock/php-lite.js` évalue le petit sous-ensemble
utilisé par les gabarits (`define`, `echo`, `$_GET`, un `if`). Cela couvre
`inrace.php` et `pena_biathlon.php`. `notation_fs.php` utilise le vrai framework
`advPage` (classes PHP) et n'est pas rendu — le bouchon le signale sur la sortie
standard au lieu de produire une page silencieusement cassée.

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

## Tests de non-régression

```bash
npm test                    # 42 cas
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

### Configuration de l'adresse WebSocket

`ws_live/adv/ws_params.js` **n'existe pas dans le zip officiel** : chaque
déploiement doit le créer, en codant l'IP en dur. La version de ce dépôt la
déduit :

1. `?ws=192.168.1.10:20000` dans l'URL de la page (mémorisé ensuite) ;
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
