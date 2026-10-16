# canoe-obs

La configuration OBS de la régie TV : une collection de scènes et un profil
**« Canoë FFCK »**, générés plutôt que cliqués, pour qu'une réinstallation
redonne exactement la même chose.

```bash
./obs.sh                              # installe et ouvre OBS dessus (OBS fermé)
SERVEUR=192.168.1.60 ./obs.sh         # autre serveur de course
CODE_KX=70 ./obs.sh                   # samedi après-midi : autre compétition kayak-cross
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
| `Sponsors · boucle avec Timer` | la même vidéo, et par-dessus `tv_prochaine.html` : le temps avant la prochaine session, en bas (pauses entre deux demi-journées) |
| `Écran podium · attente` | `tv_podium_attente.html` : « Remise des prix », le nom de l'épreuve (lu dans competFFCK), logos et marches vides, en attendant la cérémonie (compte à rebours avec `PODIUM_HEURE`) |
| `Écran podium · <catégorie>` | `tv_palmares.html?epreuve=<code>` : le palmarès d'une seule catégorie, sans rotation — une scène par catégorie de la demi-journée `PODIUM` |
| `Écran podium · piloté` | `tv_palmares.html?pilote=1` : la catégorie et le 3e, le 2e, le 1er à la demande, depuis la télécommande `http://localhost:3000/canoe/tv_podium_pilote.html` (ce Mac, un téléphone, ou le dock OBS « Télécommande podium », posé par `obs.sh` : menu Docks pour l'afficher) |
| `Écran podium · rotation` | `tv_palmares.html?sans_inv` : chaque catégorie courue (hors invités), 20 s chacune |
| `Écran podium · fichier, piloté` / `fichier, rotation` | `tv_palmares.html?fichier…` : comme `piloté` et `rotation`, mais le palmarès vient de `canoe-wslive/ws_live/canoe/podium/podium.json`, édité à la main — sans competFFCK ni WebSocket. Enregistrer le fichier suffit, l'écran le relit toutes les 2 s |
| `Manuel · Course duo` | `tv_duo.html?bg=1` |
| `Manuel · Course duo KX` | `tv_duo_kx.html?bg=1` : le duo du contre-la-montre kayak-cross (samedi matin) |
| `Manuel · Course 1 bateau` | `tv_inrace.html?bg=1` |
| `Manuel · Bateaux en course` | `tv_oncourse.html?bg=1` |
| `Manuel · Départs` | `tv_departs.html` |
| `Manuel · Résultats` | `tv_results.html?no_course` (sans le bandeau des bateaux en course) |
| `Manuel · Résultats KX` | `tv_results_kx.html?no_course` : le classement du contre-la-montre kayak-cross (pénalités FLT par porte, rang du contre-la-montre) |
| `Manuel · Séries KX (incrustation)` | samedi après-midi sans la régie : `gestion_kcross_series/video/video_incrustation.html` et, invisible dans la même scène, son pilote automatique (série en course, classement provisoire dès les 4 arrivées, résultats, rampe de la suivante) |
| `Manuel · Tableau KX Dames` / `Hommes` | le tableau des phases finales de XK1D / XK1H, plein écran |
| `Test son · générique` | le générique lu par OBS, sur le même chemin de son que la régie : à passer avant l'antenne |
| `Répétition · bouchon` | `tv_regie.html?scenario=test&repetition=1&ws=localhost:8080`, avec `node mock/server.js` dans `canoe-wslive` |

En temps normal, une seule scène par demi-journée : la régie automatique. Les
scènes `Manuel` sont le secours si elle ne convient pas.

Les scènes `Écran podium` ne vont pas à l'antenne : elles sont faites pour
l'écran derrière le podium, opaques et sans fond de clé. Les sortir par un
**projecteur de scène** (clic droit sur la scène → *Projecteur plein écran
(scène)* → l'écran du podium), pas par le programme.

`Régie · Samedi après-midi` et les scènes KX lisent les pages kayak-cross sur
ce Mac (`http://localhost:3000/gestion_kcross_series/`, la copie du dépôt) :
`regie.sh` lance `tools/serve.js --kx`, qui relaie leur API vers
competCrossFFCK (`SERVEUR_KX`, défaut `192.168.1.65` ; compétition `CODE_KX`,
défaut `62`).

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
la vidéo des scènes `Sponsors`, sur le même chemin. Ni micro ni son du bureau :
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
| `SERVEUR_KX` / `CODE_KX` | `192.168.1.65` / `62` | competCrossFFCK et son code de compétition, samedi après-midi |
| `FPS` | `25` | cadence, celle de l'ATEM |
| `SON_NOM` | `BMD HDMI` | sortie son vers l'ATEM, relevée au lancement (`--sans-son` pour ne pas l'attendre) |
| `ENREGISTREMENTS` | `~/Movies/canoe-obs` | dossier des enregistrements |
| `PODIUM` | `samedi-matin` | la demi-journée (scénario de `regie_scenarios.js`) dont les catégories ont leur scène `Écran podium` |
| `PODIUM_HEURE` | — | heure de la remise des prix (ex. `16:30`) : compte à rebours sur `Écran podium · attente` |
| `SPONSORS` | `../sponsors/Sponsor.mp4` | vidéo des scènes `Sponsors` |

Changer d'adresse de serveur = relancer `./obs.sh` avec OBS fermé : OBS
réécrit sa configuration en quittant et écraserait l'installation. Les
fichiers remplacés sont gardés en `.bak` à côté
(`~/Library/Application Support/obs-studio/basic/`). Les autres collections et
profils (`N1 Cesson Avril 2024`…) ne sont pas touchés.

`node generer.js --sortie build` produit les fichiers sans rien installer,
pour les relire.
