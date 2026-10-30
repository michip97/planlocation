#!/bin/bash
set -e

if ! command -v gs &> /dev/null || ! command -v enscript &> /dev/null; then
    echo "ghostscript or enscript not found, installing them..."
    sudo apt-get update
    sudo apt-get install -y ghostscript enscript
fi

mkdir -p backend/tests/samples

echo "Generating sample-plan-a0.pdf..."
cat << 'TXT' > plan-text.txt
Sample A0 Architectural Plan
Project: Example Project
Scale: 1:100
Grid: 1m x 1m
----------------------------------
Room 1: 4x4m
Room 2: 6x4m
Corridor
----------------------------------
Notes:
- Load bearing walls are marked in thick lines.
- Verify dimensions on site.
TXT

enscript -B -f Helvetica@24 -p plan-a0.ps plan-text.txt
gs -sDEVICE=pdfwrite -dDEVICEWIDTHPOINTS=3370 -dDEVICEHEIGHTPOINTS=2384 -dPDFFitPage -o backend/tests/samples/sample-plan-a0.pdf plan-a0.ps

echo "Generating sample-plan-multipage.pdf..."
cat << 'TXT' > page1.txt
Page 1: Ground Floor
TXT
cat << 'TXT' > page2.txt
Page 2: First Floor
TXT

enscript -B -f Helvetica@18 -p page1.ps page1.txt
enscript -B -f Helvetica@18 -p page2.ps page2.txt

gs -sDEVICE=pdfwrite -o backend/tests/samples/sample-plan-multipage.pdf page1.ps page2.ps

rm plan-text.txt plan-a0.ps page1.txt page2.txt page1.ps page2.ps

echo "Sample plans generated in backend/tests/samples/"
