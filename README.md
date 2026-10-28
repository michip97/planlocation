# PlanSync - PDF-Pendenzen- und Synchronisationsplattform

PlanSync ist eine Offline-First Progressive Web App (PWA) für Architektur- und Bauprojekte. Sie ermöglicht es Teams, große Architekturpläne im PDF-Format zu verwalten, Pendenzen (Tasks) direkt auf den Plänen als Pins zu markieren und diese offline zu bearbeiten. Sobald das Gerät wieder mit dem Internet verbunden ist, synchronisieren sich alle Änderungen automatisch mit dem Server.

## Features

- **Multi-Tenant (Firmen & Benutzer):** Strikte Mandantentrennung auf Datenbankebene. Benutzer sehen nur Projekte und Pendenzen ihrer eigenen Firma.
- **Performanter PDF-Viewer (Pan & Zoom):** Optimiert für große A0-Architekturpläne. Rendering über `pdf.js` mit Web-Workern. Navigation via Google-Maps-artigem Panning (`react-zoom-pan-pinch`).
- **Pendenzen-Pins auf PDFs:** Pendenzen werden über normalisierte Koordinaten pixelgenau auf den Plänen platziert.
- **Vollständige Offline-Fähigkeit (PWA):**
  - Die App-Shell wird per Service-Worker (`vite-plugin-pwa`) offline verfügbar gemacht.
  - Projekte und PDF-Pläne können explizit heruntergeladen werden. Die Speicherung erfolgt in IndexedDB (`localforage`).
  - Neue Pendenzen und Änderungen werden offline in eine lokale Queue geschrieben und asynchron zum Backend übertragen, sobald die Verbindung wiederhergestellt ist.
- **Export & QR-Codes:** Generierung von PDF-Berichten der Pendenzen (`jspdf`) sowie scannbaren QR-Codes, um Projekte schnell auf der Baustelle zu öffnen.

## Tech-Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS v4, React Router, Lucide Icons, Axios, Localforage, Playwright (für E2E Testing).
- **Backend:** Node.js, Express, TypeScript.
- **Datenbank:** PostgreSQL (via Prisma ORM).
- **Sicherheit:** JWT für die Authentifizierung, `bcryptjs` für sicheres Passwort-Hashing, strikte Überprüfung des `tenantId` in jeder API-Route.

---

## 🚀 Lokales Setup für die Entwicklung

### 1. Repository klonen und installieren
`git clone <repository-url>`
`cd <repository>`

`cd frontend`
`npm install`

`cd ../backend`
`npm install`

### 2. Datenbank (Docker)
Kopiere zuerst die Umgebungsvariablen im `backend` Ordner:
```bash
cd backend
cp .env.example .env
```
Um lokal eine Datenbank aufzusetzen, kannst du die beiliegende `docker-compose.yml` aus dem Hauptverzeichnis nutzen. Wichtig: Du musst den Container zwingend neu starten, wenn sich Port-Konfigurationen geändert haben.
```bash
cd ..
docker compose down
docker compose up -d db
```

### 3. Datenbank initialisieren (Backend)
Aus dem `/backend` Ordner:
`npx prisma db push`

### 4. Server starten
Du benötigst zwei Terminal-Fenster:

**Terminal 1 (Backend API):**
`cd backend`
`npm run dev`

**Terminal 2 (Frontend PWA):**
`cd frontend`
`npm run dev`

### 5. App Testen
Öffne `http://localhost:5173/login`. Da noch keine Benutzer existieren, kannst du über die API direkt einen Tenant & Admin erstellen.
Sende einfach diesen cURL Befehl an das laufende Backend:
```bash
curl -X POST http://localhost:3000/api/auth/register \
-H "Content-Type: application/json" \
-d '{
  "email": "admin@musterbau.ch",
  "password": "SecurePassword123",
  "firstName": "Max",
  "lastName": "Muster",
  "tenantName": "Musterbau AG"
}'
```
Melde dich anschließend mit `admin@musterbau.ch` und `SecurePassword123` an.

---

## 🗄️ CI/CD Deployment mit GitHub Container Registry (GHCR) & geteilter Datenbank

Die App ist für das automatische Deployment auf einen VPS optimiert und nutzt GitHub Actions, um das Docker Image zu bauen und auf der GitHub Container Registry (GHCR) abzulegen.

**Wichtig:** In diesem Setup wird davon ausgegangen, dass du auf deinem VPS bereits eine geteilte PostgreSQL-Instanz laufen hast, die auf dem Docker-Netzwerk `postgres_network` erreichbar ist (Ressourcenschonung).

### Voraussetzungen (GitHub Secrets)
Folgende Secrets müssen in deinem GitHub Repository (`Settings > Secrets and variables > Actions`) hinterlegt werden:

- `VPS_HOST`: Die IP-Adresse oder der Hostname deines Servers.
- `VPS_USERNAME`: Der SSH-User (z.B. `root`).
- `VPS_SSH_KEY`: Dein privater SSH-Schlüssel für den Serverzugriff.
- `DATABASE_URL`: Der vollständige Connection String zu deiner geteilten Datenbank (z.B. `postgresql://user:pass@db_container_name:5432/plansync_db?schema=public`).
- `JWT_SECRET`: Ein starker, zufälliger String für die Ausstellung von Login-Tokens.
- `DOMAIN`: Deine Zieldomain (z.B. `planlocationtest.michaelportmann.ch`). Dies konfiguriert den Reverse Proxy (Traefik).

**Hinweis zu Traefik:**
Die `docker-compose.prod.yml` erwartet, dass Traefik auf deinem Server installiert ist und ein externes Docker-Netzwerk namens `webproxy` existiert.

### Ablauf des Deployments
Sobald du Code auf den `main` Branch pushst:
1. **Build & Push:** GitHub Actions baut das Fullstack-Docker-Image (Frontend + Backend) und lädt es sicher in die GHCR deines Repositories hoch.
2. **Transfer:** Die `docker-compose.prod.yml` wird per SCP auf deinen Server unter `/opt/plansync` kopiert.
3. **Pull & Start:** Die GitHub Action loggt sich per SSH auf deinem Server ein, lädt das neuste Image herunter und startet den Container mit `docker compose up -d` neu, wodurch die App sofort unter deiner Domain erreichbar ist.
