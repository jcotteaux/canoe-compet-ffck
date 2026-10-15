#!/bin/zsh
# Fabrique rideau.webm, la transition d'OBS : le rideau de la régie
# (tv_regie.css), image par image à 25 i/s, sur fond transparent.
#
#   ./rideau.sh            après une retouche du rideau dans tv_regie.css
#   FPS=50 ./rideau.sh     autre cadence (celle de l'ATEM)
#
# Demande Google Chrome et ffmpeg (brew install ffmpeg).

cd "${0:A:h}"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
FPS=${FPS:-25}
DUREE=1240          # ms : 1,2 s de passage + 40 ms de décalage de la dernière bande

[[ -x $CHROME ]] || { echo "Google Chrome manque"; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg manque : brew install ffmpeg"; exit 1; }

images=$(mktemp -d)
trap 'rm -rf "$images"' EXIT

n=$(( DUREE * FPS / 1000 + 1 ))
for (( i = 0; i < n; i++ )); do
	t=$(( i * 1000 / FPS ))
	"$CHROME" --headless --disable-gpu --hide-scrollbars --force-color-profile=srgb \
		--default-background-color=00000000 --window-size=1920,1080 \
		--virtual-time-budget=3000 --allow-file-access-from-files \
		--screenshot="$images/$(printf %04d $i).png" \
		"file://$PWD/rideau.html?t=$t" 2>/dev/null
	print -n "\r  image $((i + 1))/$n"
done
echo

# VP9 avec couche alpha : ce que lit le Stinger d'OBS.
ffmpeg -hide_banner -loglevel error -y -framerate $FPS -i "$images/%04d.png" \
	-c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 18 -auto-alt-ref 0 rideau.webm || exit 1
echo "✓ rideau.webm : $n images, $FPS i/s"
