# Tester avec le serveur de course distant (chez Stéphane)

Pense-bête pour faire tourner **mon code local** contre le **vrai competFFCK**
installé sur la machine de Stéphane, au lieu du bouchon.

## La config

| quoi | valeur |
|---|---|
| serveur de course (Laragon + competFFCK) | `192.168.1.52` |
| site web du serveur | `http://192.168.1.52/` |
| ma version déployée | `http://192.168.1.52/ws_live/` |
| version de référence qui marche | `http://192.168.1.52/ws_live_ICF/` |
| **port WebSocket competFFCK** | **8080** (pas 20000 !) |
| mon Mac en Wi-Fi (Internet) | `en0` → `192.168.1.57` |
| mon Mac sur le câble (serveur) | `en7` → `192.168.1.103` |

Les adresses du Mac peuvent changer (DHCP). Pour les retrouver :

```bash
ipconfig getifaddr en0     # Wi-Fi
ipconfig getifaddr en7     # câble Ethernet
```

Si le câble n'est pas `en7` : `networksetup -listallhardwareports`.

## Le piège réseau

Le Wi-Fi et le câble sont **tous les deux en `192.168.1.x`**. macOS envoie alors
tout ce réseau par l'interface prioritaire, le Wi-Fi, y compris `.52`, qui
n'est joignable que par le câble. Résultat : « Host is down », page blanche,
alors que tout est branché.

## Démarrer (3 terminaux)

```bash
# 1. le bouchon : sert MON code local sur le port 3000
npm start

# 2. le relais vers la machine de Stéphane, par le câble
npm run relay
#    si l'IP du câble a changé :
node tools/relay.js --via $(ipconfig getifaddr en7)
```

Le relais (`tools/relay.js`) ouvre :

- `localhost:8052` → le site de `192.168.1.52`
- `localhost:8081` → le WebSocket competFFCK `192.168.1.52:8080`

Il réécrit au passage les `ws_params.js` du serveur pour qu'ils visent
`localhost:8081`. Même `ws_live_ICF`, qui code l'IP en dur, marche donc à
travers lui.

## Les adresses à ouvrir

| je veux voir… | adresse |
|---|---|
| **mon code local + données de la course** | `http://localhost:3000/canoe/tv_results.html?ws=localhost:8081` |
| mon code local + bouchon | `http://localhost:3000/canoe/tv_results.html?ws=localhost:8080` |
| ma version déployée sur le serveur | `http://localhost:8052/ws_live/canoe/tv_results.html` |
| la version ICF du serveur | `http://localhost:8052/ws_live_ICF/canoe/tv_results.html` |

Remplacer `tv_results` par la page voulue : `tv_startlist`, `tv_leaders`,
`tv_podium`, `tv_oncourse`, `live`…

## ⚠️ `?ws=` est mémorisé

`?ws=hôte:port` est enregistré dans le navigateur (`localStorage`), **par
adresse** (`localhost:3000`, `localhost:8052`… chacune a le sien). Il garde la
priorité ensuite, même sans `?ws=` dans l'URL.

Une page vide alors que tout tourne ? Rouvrir **une fois** avec le bon `?ws=` :

- vers la course : `?ws=localhost:8081`
- vers le bouchon : `?ws=localhost:8080`
- en direct sur le serveur : `?ws=192.168.1.52:8080`

## Sans relais : réparer la route

Pour que le navigateur atteigne directement `192.168.1.52` (mot de passe admin) :

```bash
sudo route -n delete -host 192.168.1.52
sudo route -n add -host 192.168.1.52 -interface en7
route -n get 192.168.1.52 | grep interface     # doit dire en7
```

C'est perdu au redémarrage ou quand on débranche le câble. Encore plus simple :
**couper le Wi-Fi** le temps du test, mais plus d'Internet.

## Déployer sur le serveur

Copier `ws_live/` sur la machine de Stéphane, dans `…/www/ws_live/`. Ne pas
oublier :

- `adv/` **en entier** : `adv.js` a été coupé en `adv.js` + `adv_table.js`, et
  `ws.js`, `canoe.js`, `ws_params.js` ont changé ;
- `adv/ws_params.js` : le nôtre déduit l'adresse toute seule (l'hôte de la page,
  port 8080), aucun réglage à faire.

Après la copie, recharger en vidant le cache : **Cmd+Maj+R**.

## Diagnostiquer

```bash
# le serveur répond-il par le câble ?
curl --interface en7 -I http://192.168.1.52/ws_live/canoe/tv_results.html

# competFFCK écoute-t-il ? (8080 oui, 20000 refusé chez Stéphane)
nc -vz -b en7 192.168.1.52 8080

# par quelle interface part le trafic vers le serveur ?
route -n get 192.168.1.52 | grep interface
```

Pour voir ce que reçoit une page : `node tools/browse.js "<url>" --wait 8000 --shot /tmp/x.png`
(console + capture d'écran, dans un Chrome sans historique, donc sans `?ws=` mémorisé).

## Historique des soucis rencontrés (2026-10-02)

- **`/ws_live/` vide, `/ws_live_ICF/` OK** : notre `ws_params.js` visait le
  port 20000 (celui du bouchon), competFFCK écoute sur 8080 chez Stéphane.
  → Port par défaut passé à 8080, et le bouchon aussi.
- **`tv_results` : colonnes décalées** (pénalités sous « Temps », écart replié
  sous le rang) : la colonne nation était masquée dans l'en-tête mais pas dans
  les lignes, en mode championnat de France (aucune nation renseignée).
  → Corrigé dans `canoe/css/tv_results.css`.
