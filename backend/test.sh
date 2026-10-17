#!/bin/bash
# Move to backend directory if not already there
if [ -d "backend" ]; then
    cd backend
fi

npm run build
node dist/server.js &
SERVER_PID=$!
sleep 2

curl -X POST http://localhost:3000/api/auth/register \
-H "Content-Type: application/json" \
-d '{
  "email": "admin'$(date +%s)'@musterbau.ch",
  "password": "SecurePassword123",
  "firstName": "Max",
  "lastName": "Muster",
  "tenantName": "Musterbau AG"
}'
echo ""
kill $SERVER_PID
