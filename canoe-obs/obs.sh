#!/bin/zsh
# Installe la configuration OBS de la régie TV et lance OBS dessus.
#
#   ./obs.sh                          serveur de course par défaut (192.168.1.52)
#   SERVEUR=192.168.1.60 ./obs.sh     autre serveur de course
#   FPS=50 ./obs.sh                   autre cadence (celle de l'ATEM)
#   CODE_KX=70 ./obs.sh               samedi après-midi : autre compétition kayak-cross
#                                     (défaut 62 ; le serveur competCrossFFCK, lui, se
#                                     règle dans regie.sh : SERVEUR_KX, défaut 192.168.1.65)
#   ./obs.sh --sans-lancer            installe sans ouvrir OBS
#   ./obs.sh --sans-son               sans attendre la sortie son HDMI de l'ATEM
#
# OBS réécrit sa configuration en quittant : il doit être fermé pendant
# l'installation. Les fichiers remplacés sont gardés en .bak.

cd "${0:A:h}"

OBS_CONF="$HOME/Library/Application Support/obs-studio/basic"
NOM="Canoë FFCK"

if pgrep -xq OBS; then
	echo "OBS est ouvert : le quitter d'abord (il écraserait la configuration en sortant)."
	exit 1
fi

[[ -d "$OBS_CONF" ]] || { echo "OBS n'a jamais été lancé sur ce Mac : l'ouvrir une fois, puis relancer."; exit 1; }

# Le son du générique sort par l'écoute d'OBS vers le HDMI de l'ATEM. OBS
# n'ouvre ce périphérique qu'au démarrage, et ne réessaie pas : ATEM débranché
# au lancement = générique muet toute la journée. On attend donc la sortie, et
# on relève son identifiant du moment.
SON_NOM=${SON_NOM:-BMD HDMI}
if [[ $1 != --sans-son ]]; then
	export SON_ID=$(swift son.swift "$SON_NOM")
	if [[ -z $SON_ID ]]; then
		echo "⚠︎ pas de sortie son « $SON_NOM » : brancher le HDMI de l'ATEM sur ce Mac."
		echo "  (attente, Ctrl-C pour arrêter ; ./obs.sh --sans-son pour lancer quand même, sans son vers l'ATEM)"
		until SON_ID=$(swift son.swift "$SON_NOM"); do sleep 2; done
		export SON_ID
	fi
	export SON_NOM
	echo "✓ son vers « $SON_NOM » ($SON_ID)"
fi

build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT
node generer.js --sortie "$build" || exit 1

# Le projecteur plein écran vers l'ATEM, une fois posé, revient seul au
# lancement : OBS le garde dans la collection (saved_projectors), qu'on
# reprend de l'installation précédente au lieu de l'effacer.
if [[ -f "$OBS_CONF/scenes/canoe_ffck.json" ]]; then
	node -e '
		const fs = require("fs");
		const [ancien, neuf] = process.argv.slice(1);
		const p = JSON.parse(fs.readFileSync(ancien)).saved_projectors || [];
		const c = JSON.parse(fs.readFileSync(neuf));
		c.saved_projectors = p;
		fs.writeFileSync(neuf, JSON.stringify(c, null, "\t") + "\n");
		if (p.length) console.log("✓ projecteur(s) gardé(s) : " + p.length);
	' "$OBS_CONF/scenes/canoe_ffck.json" "$build/scenes/canoe_ffck.json"
fi
GLOBAL="${OBS_CONF:h}/global.ini"
if [[ -f $GLOBAL ]] && grep -q '^SaveProjectors=false' $GLOBAL; then
	sed -i '' 's/^SaveProjectors=false/SaveProjectors=true/' $GLOBAL
	echo "✓ « Enregistrer les projecteurs à la sortie » activé"
fi

# La télécommande du podium (scène « Écran podium · piloté ») en dock OBS :
# ajoutée une fois aux docks navigateur personnalisés (Docks > … pour l'afficher).
if [[ -f $GLOBAL ]]; then
	node -e '
		const fs = require("fs");
		const [fichier, url] = process.argv.slice(1);
		const titre = "Télécommande podium";
		let ini = fs.readFileSync(fichier, "utf8");
		const m = ini.match(/^ExtraBrowserDocks=(.*)$/m);
		let docks = [];
		try { docks = m ? JSON.parse(m[1]) : []; } catch (e) { docks = []; }
		if (docks.some(d => d.title === titre)) process.exit(0);
		docks.push({ title: titre, url, uuid: require("crypto").randomUUID() });
		const ligne = "ExtraBrowserDocks=" + JSON.stringify(docks);
		if (m) ini = ini.replace(m[0], () => ligne);
		else if (/^\[BasicWindow\]$/m.test(ini)) ini = ini.replace(/^\[BasicWindow\]$/m, s => s + "\n" + ligne);
		else ini += "\n[BasicWindow]\n" + ligne + "\n";
		fs.writeFileSync(fichier, ini);
		console.log("✓ dock « " + titre + " » ajouté (menu Docks pour l’afficher)");
	' "$GLOBAL" "http://localhost:3000/canoe/tv_podium_pilote.html"
fi

installe() {   # installe <source> <destination>
	if [[ -f $2 ]]; then
		cmp -s $1 $2 && return
		cp $2 $2.bak
	fi
	mkdir -p ${2:h}
	cp $1 $2
	echo "  → ${2#$OBS_CONF/}"
}

installe "$build/scenes/canoe_ffck.json" "$OBS_CONF/scenes/canoe_ffck.json"
installe "$build/profiles/canoe-ffck/basic.ini" "$OBS_CONF/profiles/canoe-ffck/basic.ini"
mkdir -p "$HOME/Movies/canoe-obs"

echo "✓ collection et profil « $NOM » installés"

[[ $1 == --sans-lancer ]] && exit 0
open -a OBS --args --collection "$NOM" --profile "$NOM"
