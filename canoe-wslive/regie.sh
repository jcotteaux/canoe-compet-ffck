#!/bin/zsh
# Lance la régie TV en local : sert ws_live sur ce Mac, données du serveur de course.
#
#   ./regie.sh                       demi-journée déduite du jour et de l'heure
#   ./regie.sh vendredi-matin        demi-journée imposée
#   SERVEUR=192.168.1.60 ./regie.sh  autre serveur de course
#   PORT=3100 ./regie.sh             autre port local
#
# Le samedi après-midi (kayak-cross) demande en plus SERVEUR_KX et CODE_KX.
# Ctrl-C arrête le serveur local.

cd "${0:A:h}"

SERVEUR=${SERVEUR:-192.168.1.52}
PORT=${PORT:-3000}

# La demi-journée : celle passée en argument, sinon le jour et l'heure (avant 13h : matin).
scenario=$1
if [[ -z $scenario ]]; then
	case $(date +%u) in
		5) jour=vendredi ;;
		6) jour=samedi ;;
		7) jour=dimanche ;;
		*) echo "pas de demi-journée aujourd'hui : préciser, ex. ./regie.sh vendredi-matin"; exit 1 ;;
	esac
	(( $(date +%H) < 13 )) && scenario=$jour-matin || scenario=$jour-apres-midi
fi

case $scenario in
	vendredi-matin|vendredi-apres-midi|samedi-matin|samedi-apres-midi|dimanche-matin|dimanche-apres-midi) ;;
	*) echo "demi-journée inconnue : $scenario"; exit 1 ;;
esac

url="http://localhost:$PORT/canoe/tv_regie.html?scenario=$scenario&ws=$SERVEUR:8080"
if [[ $scenario == samedi-apres-midi ]]; then
	if [[ -z $SERVEUR_KX || -z $CODE_KX ]]; then
		echo "samedi après-midi : définir SERVEUR_KX et CODE_KX, ex."
		echo "  SERVEUR_KX=192.168.1.52 CODE_KX=1234 ./regie.sh samedi-apres-midi"
		exit 1
	fi
	url="$url&kx=http://$SERVEUR_KX/gestion_kcross_series&kx_competition=$CODE_KX"
fi

# Le serveur de course répond-il ? On prévient sans bloquer : il peut démarrer après.
if nc -z -G 3 $SERVEUR 8080 2>/dev/null; then
	echo "✓ serveur de course $SERVEUR:8080 joignable"
else
	echo "⚠︎ serveur de course $SERVEUR:8080 injoignable — vérifier le réseau (la pastille de la régie restera rouge)"
fi

[[ -f ws_live/canoe/video/generique.mp4 ]] || echo "⚠︎ ws_live/canoe/video/generique.mp4 manque : pas de générique"
[[ -d node_modules ]] || npm install

echo
echo "  régie $scenario :"
echo "  $url"
echo
print -n "$url" | pbcopy && echo "  (adresse copiée dans le presse-papiers, à coller dans la source OBS 1920×1080)"
echo

# Déjà servi sur ce port (une autre fenêtre) : on ne relance pas.
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
	echo "le port $PORT est déjà servi : serveur local déjà lancé, rien à faire."
	exit 0
fi

exec node tools/serve.js --port $PORT
