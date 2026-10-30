#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SAMPLES_DIR="$REPO_ROOT/backend/tests/samples"

if ! command -v gs &> /dev/null; then
    echo "ghostscript not found, installing..."
    sudo apt-get update
    sudo apt-get install -y ghostscript
fi

mkdir -p "$SAMPLES_DIR"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Generating sample-plan-a0.pdf (A0 Landscape: 3370 x 2384 pt)..."
cat << 'PS' > "$TMP_DIR/plan-a0.ps"
%!PS-Adobe-3.0
%%BoundingBox: 0 0 3370 2384
<< /PageSize [3370 2384] >> setpagedevice

% White background
1 1 1 setrgbcolor
0 0 3370 2384 rectfill

% Subtle 1m grid (every 100pt)
0.90 0.92 0.95 setrgbcolor
1 setlinewidth
0 100 3370 {
  dup 0 moveto 2384 lineto stroke
} for
0 100 2384 {
  dup 0 exch moveto 3370 exch lineto stroke
} for

% Outer architectural border at exact page edges
0.1 0.15 0.25 setrgbcolor
8 setlinewidth
4 4 3362 2376 rectstroke

% Inner frame
3 setlinewidth
40 40 3290 2304 rectstroke

% Rooms / Ground Floor Plan
6 setlinewidth
0.15 0.2 0.3 setrgbcolor
200 600 1200 1400 rectstroke
1400 600 1000 900 rectstroke
1400 1500 1000 500 rectstroke
2400 600 700 1400 rectstroke

% Title block at bottom-right corner
0.95 0.96 0.98 setrgbcolor
2490 40 840 320 rectfill
0.1 0.15 0.25 setrgbcolor
4 setlinewidth
2490 40 840 320 rectstroke

/Helvetica-Bold findfont 48 scalefont setfont
100 2250 moveto (Sample A0 Architectural Plan - Scale 1:100) show

/Helvetica findfont 36 scalefont setfont
260 1850 moveto (Room 1.01 - Main Hall \(12.0m x 14.0m\)) show
1460 1350 moveto (Room 1.02 - Office \(10.0m x 9.0m\)) show
1460 1850 moveto (Room 1.03 - Corridor \(10.0m x 5.0m\)) show
2460 1850 moveto (Room 1.04 - Technical \(7.0m x 14.0m\)) show

/Helvetica-Bold findfont 32 scalefont setfont
2530 290 moveto (PROJECT: Neubau Wohn- & Geschaeftshaus) show
/Helvetica findfont 26 scalefont setfont
2530 230 moveto (Format: DIN A0 Landscape \(1189 x 841 mm\)) show
2530 180 moveto (Resolution: 300 DPI \(14042 x 9933 px\)) show
2530 130 moveto (Corner Reference: \(1.0, 1.0\) Bottom-Right) show

showpage
%%EOF
PS

gs -q -sDEVICE=pdfwrite -dNOPAUSE -dBATCH -dAutoRotatePages=/None \
   -dDEVICEWIDTHPOINTS=3370 -dDEVICEHEIGHTPOINTS=2384 -dFIXEDMEDIA \
   -o "$SAMPLES_DIR/sample-plan-a0.pdf" "$TMP_DIR/plan-a0.ps"

echo "Generating sample-plan-multipage.pdf..."
cat << 'PS' > "$TMP_DIR/multipage.ps"
%!PS-Adobe-3.0
<< /PageSize [842 595] >> setpagedevice
/Helvetica-Bold findfont 36 scalefont setfont
100 500 moveto (Page 1: Ground Floor Plan) show
20 20 802 555 rectstroke
showpage

<< /PageSize [842 595] >> setpagedevice
/Helvetica-Bold findfont 36 scalefont setfont
100 500 moveto (Page 2: First Floor Plan) show
20 20 802 555 rectstroke
showpage
%%EOF
PS

gs -q -sDEVICE=pdfwrite -dNOPAUSE -dBATCH -dAutoRotatePages=/None \
   -o "$SAMPLES_DIR/sample-plan-multipage.pdf" "$TMP_DIR/multipage.ps"

echo "Sample plans generated in $SAMPLES_DIR"
