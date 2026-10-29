#!/bin/bash
set -e

if ! command -v vips &> /dev/null; then
    echo "vips not found, installing libvips-tools..."
    sudo apt-get update
    sudo apt-get install -y libvips-tools poppler-utils bc
fi

if ! command -v bc &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y bc
fi

if [ -z "\$1" ] || [ -z "\$2" ]; then
    echo "Usage: \$0 <input.pdf> <output_dir>"
    return 1 2>/dev/null
fi

INPUT_PDF=\$1
OUTPUT_DIR=\$2

mkdir -p "\$OUTPUT_DIR"

if ! command -v pdfinfo &> /dev/null; then
  echo "pdfinfo not found, installing poppler-utils..."
  sudo apt-get update
  sudo apt-get install -y poppler-utils
fi

DIMENSIONS=\$(pdfinfo "\$INPUT_PDF" | grep "Page size" | awk '{print \$3, \$5}')
WIDTH_PTS=\$(echo \$DIMENSIONS | awk '{print \$1}')
HEIGHT_PTS=\$(echo \$DIMENSIONS | awk '{print \$2}')

if [ -z "\$WIDTH_PTS" ] || [ -z "\$HEIGHT_PTS" ]; then
    WIDTH_PTS=3370
    HEIGHT_PTS=2384
fi

WIDTH=\$(echo "\$WIDTH_PTS * 300 / 72" | bc -l | awk '{printf "%.0f", \$1}')
HEIGHT=\$(echo "\$HEIGHT_PTS * 300 / 72" | bc -l | awk '{printf "%.0f", \$1}')
ASPECT_RATIO=\$(echo "scale=6; \$WIDTH / \$HEIGHT" | bc)

echo "Generating tiles for \$INPUT_PDF at \$OUTPUT_DIR..."
vips dzsave "\$INPUT_PDF[dpi=300,page=0]" "\$OUTPUT_DIR" --layout google --tile-size 512 --suffix .webp[Q=82]

MAX_ZOOM=0
for d in "\$OUTPUT_DIR"/*; do
  if [ -d "\$d" ]; then
    Z=\$(basename "\$d")
    if [[ "\$Z" =~ ^[0-9]+$ ]] && [ "\$Z" -gt "\$MAX_ZOOM" ]; then
      MAX_ZOOM=\$Z
    fi
  fi
done

cat << META > "\$OUTPUT_DIR/metadata.json"
{
  "width": \$WIDTH,
  "height": \$HEIGHT,
  "aspectRatio": \$ASPECT_RATIO,
  "tileSize": 512,
  "maxZoom": \$MAX_ZOOM
}
META

echo "Tiles generated successfully at \$OUTPUT_DIR"
