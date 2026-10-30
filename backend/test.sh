#!/bin/bash

# Prevent nested backend cd errors
if [ "$(basename "$PWD")" != "backend" ]; then
    cd backend
fi

npm run build
node dist/server.js &
SERVER_PID=$!
sleep 2

# 1. Register User and extract Token and TenantId
RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/register \
-H "Content-Type: application/json" \
-d '{
  "email": "admin'$(date +%s)'@musterbau.ch",
  "password": "SecurePassword123",
  "firstName": "Max",
  "lastName": "Muster",
  "tenantName": "Musterbau AG"
}')

TOKEN=$(echo $RESPONSE | grep -o '"token":"[^"]*' | grep -o '[^"]*$')
TENANT_ID=$(echo $RESPONSE | grep -o '"tenantId":"[^"]*' | grep -o '[^"]*$')

echo "Got Token: $TOKEN"

# 2. Create Project
PROJECT_RESP=$(curl -s -X POST http://localhost:3000/api/projects \
-H "Authorization: Bearer $TOKEN" \
-H "Content-Type: application/json" \
-d '{
  "name": "Test Bauprojekt"
}')
PROJECT_ID=$(echo $PROJECT_RESP | grep -o '"id":"[^"]*' | head -1 | grep -o '[^"]*$')
echo "Created Project: $PROJECT_ID"

# 3. Generate a quick sample PDF
bash ../scripts/generate-sample-plans.sh

# 4. Upload Document (PDF)
echo "Uploading PDF..."
UPLOAD_RESP=$(curl -s -X POST http://localhost:3000/api/documents/project/$PROJECT_ID \
-H "Authorization: Bearer $TOKEN" \
-F "file=@backend/tests/samples/sample-plan-a0.pdf")

DOCUMENT_ID=$(echo $UPLOAD_RESP | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
echo "Uploaded Document: $DOCUMENT_ID"

if [ -z "$DOCUMENT_ID" ]; then
    echo "Upload failed! Response was: $UPLOAD_RESP"
    kill $SERVER_PID
    return 1 2>/dev/null
fi

# 5. Get Metadata (this should return 200 and the JSON containing width/height from tiling)
echo "Fetching Metadata..."
META_RESP=$(curl -s -w "\nHTTP_CODE:%{http_code}\n" -X GET http://localhost:3000/api/documents/$DOCUMENT_ID/tiles/metadata.json \
-H "Authorization: Bearer $TOKEN")

if [[ "$META_RESP" == *"HTTP_CODE:200"* && "$META_RESP" == *"aspectRatio"* ]]; then
    echo "✅ Metadata correctly retrieved."
else
    echo "❌ Metadata retrieval failed. Response: $META_RESP"
    kill $SERVER_PID
    return 1 2>/dev/null
fi

# 6. Fetch a tile
echo "Fetching Tile 0/0/0..."
TILE_RESP=$(curl -s -w "\nHTTP_CODE:%{http_code}\n" -X GET http://localhost:3000/api/documents/$DOCUMENT_ID/tiles/0/0/0.webp \
-H "Authorization: Bearer $TOKEN" -o /dev/null)

if [[ "$TILE_RESP" == *"HTTP_CODE:200"* ]]; then
    echo "✅ Tile 0/0/0 correctly retrieved."
else
    echo "❌ Tile retrieval failed. Response: $TILE_RESP"
    kill $SERVER_PID
    return 1 2>/dev/null
fi

# 7. Fetch an out-of-bounds tile (should return 204 No Content for transparent padding)
echo "Fetching out-of-bounds Tile..."
OOB_RESP=$(curl -s -w "\nHTTP_CODE:%{http_code}\n" -X GET http://localhost:3000/api/documents/$DOCUMENT_ID/tiles/1/1/99.webp \
-H "Authorization: Bearer $TOKEN" -o /dev/null)

if [[ "$OOB_RESP" == *"HTTP_CODE:204"* ]]; then
    echo "✅ Out-of-bounds tile returned 204 correctly."
else
    echo "❌ Out-of-bounds tile check failed. Response: $OOB_RESP"
    kill $SERVER_PID
    return 1 2>/dev/null
fi

echo "============================"
echo "✅ All E2E Tests for the Tiling Pipeline Passed!"
echo "============================"

kill $SERVER_PID
