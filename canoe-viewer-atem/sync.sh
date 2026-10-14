#!/bin/bash
# Sync incrémental des vidéos ATEM depuis un disque réseau vers un dossier local.
# Utilise rsync --append pour ne transférer que les nouveaux octets.
#
# Usage: ./sync.sh /source/remote /destination/local [interval_seconds]
#
# Exemple:
#   ./sync.sh "/Volumes/ArchiDrive/2026/Video ISO Files" ./local-videos 5

SOURCE="${1:?Usage: $0 <source_dir> <dest_dir> [interval]}"
DEST="${2:?Usage: $0 <source_dir> <dest_dir> [interval]}"
INTERVAL="${3:-5}"  # Sync toutes les 5 secondes par défaut

mkdir -p "$DEST"

echo "🔄  Sync incrémental démarré"
echo "   Source : $SOURCE"
echo "   Local  : $DEST"
echo "   Intervalle : ${INTERVAL}s"
echo "   Ctrl+C pour arrêter"
echo ""

while true; do
  rsync -a --append --info=progress2 --no-compress \
    --include='*.mp4' \
    --include='*.mov' \
    --include='*.mkv' \
    --include='*.mxf' \
    --include='*.avi' \
    --include='*.m4v' \
    --include='*.webm' \
    --exclude='.*' \
    --exclude='*' \
    "$SOURCE/" "$DEST/"
  
  sleep "$INTERVAL"
done
