# Protocole WebSocket competFFCK

Rétro-ingénierie du protocole parlé entre les pages `ws_live` et le serveur
WebSocket intégré à competFFCK. Aucune documentation officielle n'existe : tout
ce qui suit est déduit du source de `ws_live` (paquet du 2025-02-02) et de la
page wiki « B. Module Externe (Python …) ».

Les références de ligne pointent vers les fichiers de `ws_live/`.

---

## Transport

Une seule WebSocket par page, en mode texte, un message = un objet JSON.

```js
const wsMain = new ws.Context(wsParams.url, wsParams.port);  // canoe/js/live.js:1128
wsMain.OpenWebSocketCommand(OnOpenWebSocketCommand);         // canoe/js/live.js:1298
```

L'adresse vient de `adv/ws_params.js`. Le port par défaut des déploiements
réels est **20000** (`canoe_pau/js/ws_params.js`) ; l'exemple livré dans
`canoe_national/` utilise 8080.

> competFFCK expose aussi un serveur **TCP brut** (port 7000 par défaut) qui
> parle le même JSON, avec un octet `\0` comme fin de trame, destiné aux modules
> externes Python. Voir `cmd_competFFCK.py` et `client_notification.py`.

### Routage des messages entrants

`adv/ws.js:31-70` applique trois priorités :

1. si le message porte un champ `fn`, le client appelle `window[objJSON.fn](msg)` ;
2. sinon il cherche `mapCommand.get(msg.key)` ;
3. sinon il appelle le handler enregistré sous `'*'`.

> ⚠️ La priorité 1 laisse le serveur choisir **n'importe quelle fonction globale**
> de la page. Sur un réseau de course ouvert, quiconque peut se faire passer pour
> le serveur exécute du code arbitraire dans les pages. À remplacer par une liste
> blanche.

---

## Format des tables

competFFCK sérialise ses tables SQL sous forme d'objets `{ name, columns, rows }`,
désérialisés par `adv.table` (`adv/adv.js:55`).

Une **colonne** est un tuple positionnel (`adv/adv.js:526`) :

| index | contenu | lu par |
|---|---|---|
| 0 | nom | `GetColumnName`, `GetIndexColumn` |
| 1 | libellé | `GetColumnLabel` |
| 2 | format | `GetColumnFormat` |
| 3 | style | — |
| 4 | nom de type | — |
| 5 | **type SQL** | `GetColumnType` |
| 6-8 | tailles | — |
| 9 | **alignement** | `GetColumnAlignment` |

Une **ligne** est un tableau de valeurs dans l'ordre des colonnes.

La table est rangée dans la trame sous une clé suffixée `<sqlTable>` :

- **au premier niveau** → lue par `adv.GetTableUnique(frame, 'ranking')`
  → clé `ranking<sqlTable>`
- **sous `tables`** → lue par `adv.GetTable(frame, 'Competition')`
  → clé `tables['Competition<sqlTable>']`

### Types SQL (`adv.index_type`, `adv/adv.js:7`)

```
NULL 0   CHAR 1   VARCHAR 2   TEXT 3   SHORT 4   LONG 5   DOUBLE 6
CHRONO 7   CHRONO_INV 8   RANKING 9   DATE 10   SMALLDATETIME 11   DATETIME 12
```

### Chronos (`adv.chrono`, `adv/adv.js:3`)

Tous les temps sont en **millisecondes**. Les valeurs `< 1` sont des statuts,
pas des durées :

| valeur | sens |
|---|---|
| `>= 1` | temps valide |
| `-1` | KO |
| `-99` | AUTO |
| `-500` | DNF |
| `-600` | DNS |
| `-700` | DES |
| `-800` | DSQ |

Les heures de départ sont exprimées en millisecondes depuis minuit.

---

## Commandes client → serveur

| `key` | paramètres | émis par |
|---|---|---|
| `<competition_load>` | `mode_test` | `live.html`, `live_web.html` à l'ouverture |
| `<race_load>` | `key_race` (`'*'`, ou la clé listée par `<competition_load>`) | toutes les pages |
| `<epreuve_load>` | `epreuve` (ex. `K1W`) ; **vide ou absent = toutes les épreuves** | live, tv_* |
| `<pdf>` | `type` (`'res'`) | `live.html` |
| `<order>` | `action:'tv'`, `url` | régie : une page pilote les autres |
| `<passage_add>` | `time`, `bib`, `passage`, `device` | `phone_passage.html` |
| `<bib_delete>` | `bib`, `passage`, `key_count` | `phone_passage.html` |
| `<bib_next>` | `bib`, `passage`, `key_count` | `phone_passage.html` |

Enchaînement normal de `live.html` :

```
onopen ──> <competition_load>
        <── liste des compétitions (table `competitions`)
clic ───> <race_load> {key_race}
        <── compétition + course + phase + épreuves (tables imbriquées)
clic ───> <epreuve_load> {epreuve}
        <── classement (table `ranking`)
puis flux <on_course> / <bib_time> / <penalty_add> en continu
```

---

## Trames serveur → client

### `<competition_load>`

Table `competitions` au premier niveau. Colonnes lues par `live.js:435-449` :
`key`, `Code_activite`, `Nom`, `Date_debut`, `Libelle_course`, `Libelle_phase`,
`active` (1 = en ligne).

Le `key` sert ensuite de `key_race`.

### `<race_load>`

Champs de premier niveau : `Code_competition`, `Code_course`, `Code_phase`,
`Nb_inter`.

Tables imbriquées sous `tables` :

| table | colonnes utilisées |
|---|---|
| `Competition` | `Nom`, `Code_activite` (`DES`/`SLA`), `Code_niveau` (`INT` → nations au lieu des clubs), `Date_debut` |
| `Competition_Course` | `Libelle` |
| `Competition_Course_Phase` | `Libelle` (indexée par `Code_phase - 1`) |
| `Competition_Course_Phase_Manche_Epreuve` | `Libelle_court`, `Nombre` (les épreuves à 0 bateau sont masquées), `Etat_programme_epreuve` |

### `<epreuve_load>`

Champs de premier niveau : `epreuve`, `Nb_porte`, `clock`, plus la table
`ranking`.

**Le nommage des colonnes dépend de l'activité** (`adv/canoe.js:225-270`) :

- **Slalom (`SLA`)** — competFFCK envoie des colonnes génériques que
  `canoe.SetColumnNameRanking` renomme côté client :

  | envoyé | renommé en |
  |---|---|
  | `@RK_{c}_{p}_1` | `Cltc{c}_{p}` |
  | `@START_RK_{c}_{p}_1` | `Rang{c}_{p}` |
  | `@START_TIME_{c}_{p}_1` | `Heure_depart{c}_{p}` |
  | `@CHRONO_{c}_{p}_1` | `Tps_chrono{c}_{p}` |
  | `@TIME_{c}_{p}_1` | `Tps{c}_{p}` |
  | `@PENA_{n}_1` (n = 1..Nb_porte) | `Pena_{n}` |
  | `@SUMPENA_{c}_{p}_1` | `Total_pena{c}_{p}` |
  | `@INTER{k}_…`, `@CHRONO_INTER{k}_…`, `@RK_…`, `@DIFF_…` | équivalents `_inter{k}` |

- **Descente (`DES`)** — il n'y a **pas de branche `else`** : les noms finaux
  (`Tps1_1`, `Cltc1_1`, `Heure_depart1_1`, …) sont envoyés directement.

Colonnes communes : `Dossard`, `Bateau`, `Club`, `Code_nation`, `Code_categorie`.

Les pénalités slalom valent `'2'` ou `'50'` par porte (`canoe.js:325-340`).

> **Piège** : `SetCell` et `SetRanking` (`adv/adv.js:406`, `:905`) sont des
> **no-op silencieux** si la colonne n'existe pas. Le serveur doit déclarer
> toutes les colonnes que le client va remplir — y compris celles des inters,
> que `canoe.ComputeTpsInter` calcule côté client.

### `<on_course>` — flux temps réel

```json
{ "key": "<on_course>", "clock": 36123456, "epreuve": "K1H",
  "table<sqlTable>": { "columns": [["bib",…],["time",…]], "rows": [[4, 51230]] } }
```

`clock` alimente l'horloge affichée. Si la page est en mode scrolling
(`live.js:9-20`), un `epreuve` différent de l'épreuve courante déclenche
automatiquement un `<epreuve_load>`.

### `<bib_time>` — passage chronométré

```json
{ "key": "<bib_time>", "bib": 4, "passage": 0, "time_chrono": 93461,
  "diff_categ": 1250 }
```

`passage >= 1` = temps intermédiaire, sinon **arrivée** (`live.js:117`).
`diff_categ` est optionnel : écart avec le meilleur temps de la catégorie,
affiché en vert (négatif) ou rouge (positif).

### `<penalty_add>` — pénalité slalom

```json
{ "key": "<penalty_add>", "bib": 12, "gate": 5, "penalty": "2" }
```

⚠️ Les noms de champs ne suivent pas la convention française du reste du
protocole : le client lit `gate` et `penalty`, **pas** `porte` et `pena`
(`live.js:307-309`). `penalty` est une **chaîne** : `SetOnCoursePenalty`
(`live.js:336-345`) la compare à `'0'`, `'2'` et `'50'` sans conversion.

### `<mode_chrono>`, `<run_erase>`

`<run_erase>` porte `Code_competition`, `Code_course`, `Code_phase` : le client
ne remet à zéro que si les trois correspondent à la course affichée
(`live.js:89`).

---

## Hypothèses du bouchon

Ce que le bouchon fait faute de pouvoir l'observer sur le vrai serveur. À
confirmer lors d'une capture sur une compétition réelle :

- `<on_course>` est diffusé à **tous** les clients connectés, y compris ceux qui
  n'ont pas encore chargé de course ;
- la fréquence de `<on_course>` est de 10 Hz ;
- `key_race` a la forme `{codex}_{course}_{phase}` ;
- `<order>` est rediffusé aux autres clients sans être renvoyé à l'émetteur ;
- les classements (`Clt`, `Cltc`) arrivent déjà calculés par le serveur.
