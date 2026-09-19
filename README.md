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
npm start                  # descente sprint (par défaut)
npm run slalom             # slalom 18 portes, 2 inters
npm run international      # niveau INT : affichage nations + drapeaux

node mock/server.js --fixture slalom-finale --speed 10
node mock/server.js --record captures/ma-session.jsonl
```

| option | défaut | rôle |
|---|---|---|
| `--fixture <id>` | `descente-sprint` | compétition simulée |
| `--speed <n>` | celui de la fixture | accélération du temps |
| `--port <n>` | 3000 | serveur HTTP |
| `--ws-port <n>` | 20000 | serveur WebSocket |
| `--record <fichier>` | — | journalise toutes les trames émises (JSONL) |

Le panneau de contrôle (`/mock/`) pilote la course en direct : départs,
arrivées, pénalités par porte, DNF/DSQ, changement de fixture, et les scénarios
de rupture.

### Pages servies

`live.html`, `monitor_race.html`, `tv_inrace.html`, `tv_startlist.html`,
`tv_ranking.html`, `jugement.html`, `inrace.php`.

macOS ne fournit plus PHP : `mock/php-lite.js` évalue le petit sous-ensemble
utilisé par les gabarits (`define`, `echo`, `$_GET`, un `if`). Cela couvre
`inrace.php` et `pena_biathlon.php`. `notation_fs.php` utilise le vrai framework
`advPage` (classes PHP) et n'est pas rendu — le bouchon le signale sur la sortie
standard au lieu de produire une page silencieusement cassée.

## Tests de non-régression

```bash
npm test                    # 20 cas
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
| `descente-sprint` | DES | 24 bateaux, 4 épreuves, 1 inter |
| `slalom-finale` | SLA | 16 bateaux, 18 portes, 2 inters, colonnes `@…` |
| `descente-internationale` | DES / INT | 16 bateaux, nations et drapeaux |

## Limites connues

Le bouchon reproduit le protocole tel qu'il est déduit du code client. Les
points non vérifiables sans capture sur une compétition réelle sont listés en
fin de [docs/PROTOCOL.md](docs/PROTOCOL.md). Une capture (via
`client_notification.py`, adapté en enregistreur) permettra de les confirmer et
de rejouer du flux authentique.
