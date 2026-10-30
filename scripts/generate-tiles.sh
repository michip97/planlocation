#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v vips &> /dev/null || ! command -v vipsheader &> /dev/null; then
    echo "vips not found, installing libvips-tools..."
    sudo apt-get update
    sudo apt-get install -y libvips-tools poppler-utils bc
fi

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: $0 <input.pdf> <output_dir_or_base> [document_id]"
    exit 1
fi

INPUT_PDF="$1"
TARGET_ARG="${2%/}"
DOC_ID_ARG="$3"

if [ ! -f "$INPUT_PDF" ]; then
    echo "Error: Input PDF '$INPUT_PDF' does not exist."
    exit 1
fi

if [ -n "$DOC_ID_ARG" ]; then
    TILES_DIR="$TARGET_ARG"
    DOC_ID="${DOC_ID_ARG%.pmtiles}"
elif [[ "$TARGET_ARG" == *.pmtiles ]]; then
    TILES_DIR="$(dirname "$TARGET_ARG")"
    DOC_ID="$(basename "$TARGET_ARG" .pmtiles)"
else
    TILES_DIR="$(dirname "$TARGET_ARG")"
    DOC_ID="$(basename "$TARGET_ARG")"
fi

mkdir -p "$TILES_DIR"

PMTILES_FILE="$TILES_DIR/${DOC_ID}.pmtiles"
METADATA_FILE="$TILES_DIR/${DOC_ID}.metadata.json"

TILE_SIZE=512

# Obtain exact rendered pixel dimensions at 300 DPI directly from libvips
WIDTH=$(vipsheader -f width "$INPUT_PDF[dpi=300,page=0]")
HEIGHT=$(vipsheader -f height "$INPUT_PDF[dpi=300,page=0]")

if [ -z "$WIDTH" ] || [ -z "$HEIGHT" ]; then
    echo "Error: Could not determine rendered PDF dimensions via vipsheader."
    exit 1
fi

ASPECT_RATIO=$(LC_ALL=C awk "BEGIN {printf \"%.6f\", $WIDTH / $HEIGHT}")

# Use Linux RAM filesystem (/dev/shm) for zero disk-thrashing during intermediate tile rendering,
# falling back to system TMPDIR (/tmp) if /dev/shm is unavailable or not writable.
if [ -d "/dev/shm" ] && [ -w "/dev/shm" ]; then
    RAM_TEMP_DIR="$(mktemp -d /dev/shm/tiles_XXXXXXXX)"
else
    RAM_TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tiles_XXXXXXXX")"
fi
trap 'rm -rf "$RAM_TEMP_DIR"' EXIT

echo "Rendering temporary WebP tiles in RAM ($RAM_TEMP_DIR) for $INPUT_PDF (${WIDTH}x${HEIGHT} px @ 300 DPI)..."
vips dzsave "$INPUT_PDF[dpi=300,page=0]" "$RAM_TEMP_DIR" \
  --layout google \
  --tile-size "$TILE_SIZE" \
  --overlap 0 \
  --skip-blanks 5 \
  --background "0" \
  --suffix ".webp[Q=82,effort=2]"

MAX_ZOOM=0
for d in "$RAM_TEMP_DIR"/*; do
  if [ -d "$d" ]; then
    Z=$(basename "$d")
    if [[ "$Z" =~ ^[0-9]+$ ]] && [ "$Z" -gt "$MAX_ZOOM" ]; then
      MAX_ZOOM=$Z
    fi
  fi
done

cat << META > "$METADATA_FILE"
{
  "width": $WIDTH,
  "height": $HEIGHT,
  "aspectRatio": $ASPECT_RATIO,
  "tileSize": $TILE_SIZE,
  "maxZoom": $MAX_ZOOM
}
META

node "$SCRIPT_DIR/pack-pmtiles.mjs" "$RAM_TEMP_DIR" "$PMTILES_FILE" "$METADATA_FILE"

echo "Single-file PMTiles generated successfully:"
echo "  - $PMTILES_FILE"
echo "  - $METADATA_FILE"
