# canoe

Les outils de course de canoë-kayak, réunis dans un seul dépôt. Chaque dossier
est un projet indépendant, avec son README et ses commandes.

| dossier | contenu |
|---|---|
| [`canoe-wslive/`](canoe-wslive/README.md) | pages live et TV sur le WebSocket competFFCK (`ws_live`), régie TV automatique, dalles LED, kayak cross (`gestion_kcross_series`), bouchons de course, outils. **Commandes du jour J en tête de son README.** |
| [`canoe-atem/`](canoe-atem/README.md) | app iOS de régie : macros du mélangeur ATEM et bateaux sur l'eau (competFFCK), simulateur ATEM dans `sim/` |
| `canoe-judge/` | app d'aide au jugement vidéo (clips par bateau et par caméra, revue des 50), en Swift |
| [`canoe-obs/`](canoe-obs/README.md) | configuration OBS de la régie TV (scènes et profil générés, `./obs.sh` les installe) : les pages `ws_live` plein cadre, sur fond de clé `#CC00CC` pour l'ATEM |
| `canoe-viewer-atem/` | lecteur multi-vues des enregistrements ATEM (`npm start`), synchro incrémentale des vidéos depuis le disque réseau (`npm run sync`) |

`canoe-judge` dépend de `canoe-atem` par le chemin `../canoe-atem` (client
competFFCK commun) : les deux dossiers restent côte à côte. Projets Swift :
`swift build` / `swift test` dans leur dossier, ou le projet Xcode de `App/`.

`canoe-atem`, `canoe-judge` et `canoe-viewer-atem` ont rejoint le dépôt le
15 octobre 2026, sans historique (ils n'étaient pas sous git) ; l'historique de
`canoe-wslive` est conservé (`git log --follow`).
