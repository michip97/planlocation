#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

TEST_PORT="${TEST_PORT:-3099}"
BASE_URL="http://localhost:$TEST_PORT"

npm run build
PORT="$TEST_PORT" node dist/server.js &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
sleep 2

# 1. Register User and extract Token and TenantId
RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/register" \
-H "Content-Type: application/json" \
-d "{
  \"email\": \"admin$(date +%s)@musterbau.ch\",
  \"password\": \"SecurePassword123\",
  \"firstName\": \"Max\",
  \"lastName\": \"Muster\",
  \"tenantName\": \"Musterbau AG\"
}")

TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*' | grep -o '[^"]*$')
echo "Got Token: ${TOKEN:0:20}..."

# 2. Create Project
PROJECT_RESP=$(curl -s -X POST "$BASE_URL/api/projects" \
-H "Authorization: Bearer $TOKEN" \
-H "Content-Type: application/json" \
-d '{
  "name": "Test Bauprojekt"
}')
PROJECT_ID=$(echo "$PROJECT_RESP" | grep -o '"id":"[^"]*' | head -1 | grep -o '[^"]*$')
echo "Created Project: $PROJECT_ID"

# 3. Generate sample PDFs
if ! bash ../scripts/generate-sample-plans.sh; then
    echo "Failed to generate sample plans!"
    exit 1
fi

# 4. Upload Document (PDF)
echo "Uploading PDF..."
UPLOAD_RESP=$(curl -s -X POST "$BASE_URL/api/documents/project/$PROJECT_ID" \
-H "Authorization: Bearer $TOKEN" \
-F "file=@tests/samples/sample-plan-a0.pdf;type=application/pdf")

DOCUMENT_ID=$(echo "$UPLOAD_RESP" | grep -o '"id":"[^"]*' | head -1 | grep -o '[^"]*$')
STORAGE_REF=$(echo "$UPLOAD_RESP" | grep -o '"storageRef":"[^"]*' | head -1 | grep -o '[^"]*$')
echo "Uploaded Document: $DOCUMENT_ID (storageRef: $STORAGE_REF)"

if [ -z "$DOCUMENT_ID" ]; then
    echo "Upload failed! Response was: $UPLOAD_RESP"
    exit 1
fi

# 5. Verify that only <documentId>.pmtiles and <documentId>.metadata.json exist in ../storage/tiles/
PMTILES_FILE="../storage/tiles/${DOCUMENT_ID}.pmtiles"
META_FILE="../storage/tiles/${DOCUMENT_ID}.metadata.json"

if [ ! -s "$PMTILES_FILE" ] || [ ! -s "$META_FILE" ]; then
    echo "❌ Expected $PMTILES_FILE and $META_FILE to exist and be non-empty!"
    ls -la ../storage/tiles/
    exit 1
fi
echo "✅ Single-file storage verified: $PMTILES_FILE and $META_FILE"

# 6. Get Metadata and validate JSON + dimensions
echo "Fetching Metadata..."
META_BODY=$(curl -s -f -X GET "$BASE_URL/api/documents/$DOCUMENT_ID/tiles/metadata.json" \
-H "Authorization: Bearer $TOKEN")

echo "Metadata JSON: $META_BODY"
node -e "
  const meta = JSON.parse(process.argv[1]);
  if (!meta.width || !meta.height || !meta.aspectRatio || meta.tileSize !== 512 || meta.maxZoom === undefined) {
    throw new Error('Invalid metadata content: ' + JSON.stringify(meta));
  }
" "$META_BODY"
echo "✅ Metadata correctly retrieved and validated as JSON."

# 7. Test HTTP 206 Partial Content Range Request on /api/documents/:id/tiles.pmtiles
echo "Testing HTTP Range Request (206 Partial Content) on /tiles.pmtiles..."
RANGE_HEADERS=$(curl -s -D - -o /tmp/pmtiles_header_test.bin \
  -H "Authorization: Bearer $TOKEN" \
  -H "Range: bytes=0-126" \
  "$BASE_URL/api/documents/$DOCUMENT_ID/tiles.pmtiles")

if echo "$RANGE_HEADERS" | grep -q "206 Partial Content" && \
   echo "$RANGE_HEADERS" | grep -qi "Cache-Control: public, max-age=31536000, immutable"; then
    MAGIC=$(head -c 7 /tmp/pmtiles_header_test.bin)
    rm -f /tmp/pmtiles_header_test.bin
    if [ "$MAGIC" = "PMTiles" ]; then
        echo "✅ /tiles.pmtiles returned HTTP 206 Partial Content, immutable Cache-Control, and valid PMTiles v3 header."
    else
        echo "❌ Invalid PMTiles magic bytes: $MAGIC"
        exit 1
    fi
else
    rm -f /tmp/pmtiles_header_test.bin
    echo "❌ Range request failed! Headers: $RANGE_HEADERS"
    exit 1
fi

# 8. Test reading tiles via PMTiles FetchSource over HTTP Range requests
echo "Testing PMTiles client Range requests for (0,0,0), (5,27,19), and out-of-bounds (5,31,31)..."
node -e "
const { PMTiles, FetchSource } = require('pmtiles');
(async () => {
  const source = new FetchSource(
    '$BASE_URL/api/documents/$DOCUMENT_ID/tiles.pmtiles',
    new Headers({ Authorization: 'Bearer $TOKEN' })
  );
  const pm = new PMTiles(source);
  const t0 = await pm.getZxy(0, 0, 0);
  if (!t0 || t0.data.byteLength === 0) throw new Error('Missing tile 0/0/0 in PMTiles');
  const tBr = await pm.getZxy(5, 27, 19);
  if (!tBr || tBr.data.byteLength === 0) throw new Error('Missing tile 5/27/19 in PMTiles');
  const tOob = await pm.getZxy(5, 31, 31);
  if (tOob !== undefined) throw new Error('Expected out-of-bounds tile 5/31/31 to be undefined');
})();
"
echo "✅ PMTiles client fetched WebP tiles via HTTP Range requests accurately."

# 9. Also test direct tile endpoints (0/0/0.webp -> 200, 5/31/31.webp -> 204)
TILE_RESP=$(curl -s -w "\nHTTP_CODE:%{http_code}\nCONTENT_TYPE:%{content_type}\n" -X GET "$BASE_URL/api/documents/$DOCUMENT_ID/tiles/0/0/0.webp" \
-H "Authorization: Bearer $TOKEN" -o /dev/null)

if [[ "$TILE_RESP" == *"HTTP_CODE:200"* && "$TILE_RESP" == *"CONTENT_TYPE:image/webp"* ]]; then
    echo "✅ Tile 0/0/0.webp correctly retrieved (HTTP 200, image/webp)."
else
    echo "❌ Tile retrieval failed. Response: $TILE_RESP"
    exit 1
fi

OOB_RESP=$(curl -s -w "\nHTTP_CODE:%{http_code}\n" -X GET "$BASE_URL/api/documents/$DOCUMENT_ID/tiles/5/31/31.webp" \
-H "Authorization: Bearer $TOKEN" -o /dev/null)

if [[ "$OOB_RESP" == *"HTTP_CODE:204"* ]]; then
    echo "✅ Out-of-bounds tile returned 204 correctly."
else
    echo "❌ Out-of-bounds tile check failed. Response: $OOB_RESP"
    exit 1
fi

# 10. Test Lazy-Fallback when .pmtiles and .metadata.json are missing
echo "Testing lazy PMTiles generation by removing $PMTILES_FILE and $META_FILE..."
rm -f "$PMTILES_FILE" "$META_FILE"

LAZY_RESP=$(curl -s -w "\nHTTP_CODE:%{http_code}\n" -X GET "$BASE_URL/api/documents/$DOCUMENT_ID/tiles/metadata.json" \
-H "Authorization: Bearer $TOKEN")

if [[ "$LAZY_RESP" == *"HTTP_CODE:200"* && "$LAZY_RESP" == *"aspectRatio"* && -s "$PMTILES_FILE" ]]; then
    echo "✅ Lazy PMTiles regeneration succeeded on-the-fly."
else
    echo "❌ Lazy PMTiles regeneration failed. Response: $LAZY_RESP"
    exit 1
fi

# 11. Cleanup test document
curl -s -X DELETE "$BASE_URL/api/documents/$DOCUMENT_ID" -H "Authorization: Bearer $TOKEN" -o /dev/null

echo "============================"
echo "✅ All E2E Tests for the Single-File PMTiles Pipeline Passed!"
echo "============================"
