# canoe-obs

La configuration OBS de la régie TV : une collection de scènes et un profil
**« Canoë FFCK »**, générés plutôt que cliqués, pour qu'une réinstallation
redonne exactement la même chose.

```bash
./obs.sh                              # installe et ouvre OBS dessus (OBS fermé)
SERVEUR=192.168.1.60 ./obs.sh         # autre serveur de course
SERVEUR_KX=192.168.1.52 CODE_KX=1234 ./obs.sh   # + régie du samedi après-midi
```

Les pages sont servies par ce Mac : lancer `../canoe-wslive/regie.sh` (ou
`npm run serve` dans `canoe-wslive`) à côté, et le laisser tourner.

## Le circuit

```
competFFCK ──ws──▶ pages ws_live (localhost:3000) ──▶ OBS ──HDMI──▶ ATEM, entrée chroma
                                                                    │ #CC00CC découpé
                                     caméras ──▶ SuperSource ───────┴──▶ programme
```

OBS ne compose rien : il affiche une page plein cadre, et l'ATEM découpe le
magenta `#CC00CC` par-dessus les caméras (`atemctl atem incrust --couleur
CC00CC`, voir `canoe-atem`). Tout ce qui est magenta à la sortie d'OBS laisse
voir les caméras.

## Les scènes

| scène | page |
|---|---|
| `Régie · Vendredi matin — qualifs M1` … `Dimanche après-midi — finales` | `tv_regie.html?scenario=…` : la demi-journée entière, sans y toucher |
| `Caméras seules` | rien : tout magenta, l'antenne montre les caméras |
| `Sponsors · boucle` | `../sponsors/Sponsor.mp4` en boucle, plein cadre, avec son son (repart du début à chaque passage) |
| `Manuel · Course duo` | `tv_duo.html?bg=1` |
| `Manuel · Course 1 bateau` | `tv_inrace.html?bg=1` |
| `Manuel · Bateaux en course` | `tv_oncourse.html?bg=1` |
| `Manuel · Départs` | `tv_departs.html` |
| `Manuel · Résultats` | `tv_results.html` |
| `Test son · générique` | le générique lu par OBS, sur le même chemin de son que la régie : à passer avant l'antenne |
| `Répétition · bouchon` | `tv_regie.html?scenario=test&repetition=1&ws=localhost:8080`, avec `node mock/server.js` dans `canoe-wslive` |

En temps normal, une seule scène par demi-journée : la régie automatique. Les
scènes `Manuel` sont le secours si elle ne convient pas.

`Régie · Samedi après-midi` n'existe que si `SERVEUR_KX` et `CODE_KX` sont
donnés à l'installation.

Partout :

- **un fond magenta plein cadre**, verrouillé, sous la page. Une page vide,
  plantée ou encore en chargement donne les caméras seules, jamais un écran gris
  à l'antenne ;
- **une page cachée est arrêtée**, et rechargée quand sa scène revient. Les
  pages ne gardent pas d'état : la régie se recale sur l'heure au chargement ;
- **le rideau** à chaque changement de scène : les bandes obliques bleues et
  les logos de la régie (transition *Stinger* « Rideau », `rideau/rideau.webm`).
  La scène change à 600 ms, quand la bande marine couvre tout l'écran ; jamais
  de fondu, qui sur une image découpée par chroma ferait passer du rose.
  Après une retouche du rideau dans `tv_regie.css` : `rideau/rideau.sh`, puis
  `./obs.sh` ;
- le son des scènes `Régie` (le générique) passe par OBS : « Contrôler l'audio
  via OBS », écoute et sortie vers le HDMI `BMD HDMI`.

## Le profil

| réglage | valeur |
|---|---|
| image | 1920 × 1080, sans mise à l'échelle |
| cadence | 25 i/s (`FPS=50 ./obs.sh` sinon) : **celle du format de l'ATEM**, sinon les animations saccadent |
| couleur | Rec. 709, plage limitée — ce qu'attend une entrée HDMI |
| son | 48 kHz stéréo, écoute vers `BMD HDMI` |
| enregistrement | `~/Movies/canoe-obs`, mkv, encodeur matériel Apple (l'ATEM enregistre déjà le programme ; ça ne sert qu'à revoir l'habillage) |
| diffusion | rien : c'est l'ATEM qui diffuse |

## Une fois OBS ouvert (à faire une fois)

1. **Sortie vers l'ATEM** : clic droit sur le programme → *Projecteur plein
   écran (programme)* → l'écran `BMD HDMI`. `obs.sh` coche « Enregistrer les
   projecteurs à la sortie » et garde le projecteur d'une installation à
   l'autre : il revient seul aux lancements suivants.
2. **Vérifier la clé** : scène `Caméras seules` au programme — l'antenne doit
   montrer les caméras sans aucune trace de rose.
3. **Vérifier le son** : voir plus bas.

## Le son du générique

Le générique est joué par la page de régie ; OBS récupère son son (« Contrôler
l'audio via OBS ») et l'envoie par l'**écoute** vers la sortie son du HDMI,
`BMD HDMI`, qui arrive dans l'ATEM avec l'image. Seule autre source de son :
la vidéo `Sponsors · boucle`, sur le même chemin. Ni micro ni son du bureau :
rien d'autre du Mac ne part à l'antenne.

Trois choses peuvent le casser, `obs.sh` en règle deux :

- **ATEM débranché au lancement d'OBS** : OBS n'ouvre la sortie d'écoute
  qu'au démarrage et ne réessaie jamais (« audio_monitor_init: start failed »
  dans son journal) — générique muet toute la journée. `obs.sh` attend donc
  que `BMD HDMI` apparaisse avant de lancer OBS. Si l'ATEM est rebranché
  après, **quitter et relancer OBS** par `./obs.sh` ;
- **identifiant de la sortie** : il peut changer d'un Mac ou d'un câble à
  l'autre ; `obs.sh` le relève à chaque lancement (`swift son.swift` liste les
  sorties) ;
- **côté ATEM**, à régler une fois dans ATEM Software Control, onglet
  *Audio* : l'entrée HDMI d'OBS sur **On**, pas sur *AFV*. Le programme reste
  sur le SuperSource et OBS n'arrive que par l'incrustation : en AFV, l'ATEM
  ne considère jamais cette entrée à l'antenne et coupe son son.

Avant l'antenne : scène `Test son · générique` au programme d'OBS — les vumètres
de l'entrée OBS doivent bouger dans ATEM Software Control, et le son sortir au
casque du programme. Revenir ensuite sur la scène de la demi-journée, le
générique s'arrête dès qu'on quitte la scène de test.

`--studio-mode` n'est plus imposé au lancement : en mode studio, une scène de
régie posée en **aperçu** charge sa page, et son générique peut partir sur le
HDMI en même temps que celui du programme. Si OBS revient en mode studio, ne
pas laisser une scène `Régie` en aperçu.

## Variables

| variable | défaut | rôle |
|---|---|---|
| `SERVEUR` | `192.168.1.52` | serveur competFFCK (port 8080) |
| `PORT` | `3000` | port local de `regie.sh` / `npm run serve` |
| `SERVEUR_KX` / `CODE_KX` | — | competCrossFFCK et son code de compétition, samedi après-midi |
| `FPS` | `25` | cadence, celle de l'ATEM |
| `SON_NOM` | `BMD HDMI` | sortie son vers l'ATEM, relevée au lancement (`--sans-son` pour ne pas l'attendre) |
| `ENREGISTREMENTS` | `~/Movies/canoe-obs` | dossier des enregistrements |
| `SPONSORS` | `../sponsors/Sponsor.mp4` | vidéo de la scène `Sponsors · boucle` |

Changer d'adresse de serveur = relancer `./obs.sh` avec OBS fermé : OBS
réécrit sa configuration en quittant et écraserait l'installation. Les
fichiers remplacés sont gardés en `.bak` à côté
(`~/Library/Application Support/obs-studio/basic/`). Les autres collections et
profils (`N1 Cesson Avril 2024`…) ne sont pas touchés.

`node generer.js --sortie build` produit les fichiers sans rien installer,
pour les relire.
