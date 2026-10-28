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
- **Datenbank:** SQLite (via Prisma ORM). SQLite wurde für das lokale Setup und Docker-Deployment gewählt, um komplexe Volumes und Berechtigungsprobleme zu vermeiden. Ein Wechsel auf PostgreSQL in Produktion erfordert lediglich eine Anpassung der `provider` Zeile in der `schema.prisma`.
- **Sicherheit:** JWT für die Authentifizierung, `bcryptjs` für sicheres Passwort-Hashing, strikte Überprüfung des `tenantId` in jeder API-Route.

---

## 🚀 Lokales Setup für die Entwicklung (Ohne Docker)

### 1. Repository klonen und installieren
`git clone <repository-url>`
`cd <repository>`

`cd frontend`
`npm install`

`cd ../backend`
`npm install`

### 2. Datenbank initialisieren (Backend)
Aus dem `/backend` Ordner:
`npx prisma migrate dev --name init`

### 3. Server starten
Du benötigst zwei Terminal-Fenster:

**Terminal 1 (Backend API):**
`cd backend`
`npm start`

**Terminal 2 (Frontend PWA):**
`cd frontend`
`npm start`

### 4. App Testen
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

## 🐳 Deployment via Docker (Produktion / Komplettes Setup)

Für ein einfaches und nahtloses Deployment (z.B. auf einer VM) wurde ein Docker-Setup erstellt. Das Backend serviert in diesem Modus die kompilierten Frontend-Dateien direkt.

### Starten mit Docker Compose
Wechsle in das Hauptverzeichnis des Repositories:
`docker compose up --build -d`

Die App ist nun unter `http://localhost:3000` erreichbar.
Alle hochgeladenen PDF-Dateien und die SQLite-Datenbank werden dauerhaft gespeichert.

## Architektur & Designentscheidungen
* **Tenant-Isolation:** Jeder Benutzer hat eine `tenantId`. In den Prisma-Queries wird dies stets forciert, was "Tenant-Bleeding" unmöglich macht.
* **Offline-Queue:** Wenn der User offline eine Pendenz ändert, wird die Mutations-Payload in IndexedDB abgelegt. Ein EventListener triggert die asynchrone Abarbeitung der Queue, sobald das Gerät wieder online ist. Zur Fehlervermeidung werden Tasks schon im Frontend mit UUIDs versehen (optimistisches UI), sodass der Server keine Doppel-Einträge erstellt.
* **Große PDF-Pläne:** `react-zoom-pan-pinch` skaliert nur das Canvas (via CSS Transform), was für Architekturpläne viel performanter ist als wiederholtes PDF-Neu-Rendern beim Heranzoomen. Der PDF.js-Worker liegt lokal im Build, um echte Offline-Nutzung zu garantieren.

---

## 🚀 CI/CD & VPS Deployment (Produktion)

Das Projekt ist vollständig für das automatische Deployment auf einem Virtual Private Server (VPS) via GitHub Actions vorbereitet. Es kann problemlos parallel zu anderen Projekten (wie Homepages) laufen.

Das Setup verwendet `docker-compose.prod.yml`, welches die Anwendung in ein externes Docker-Netzwerk (`webproxy`) einhängt und Labels bereitstellt, die von Reverse Proxies (wie **Traefik** oder **Nginx-Proxy**) automatisch erkannt werden.

### 1. Vorbereitungen auf GitHub
Damit die GitHub Action funktioniert, musst du in deinem Repository unter `Settings` > `Secrets and variables` > `Actions` folgende **Repository Secrets** anlegen:

- `VPS_HOST`: Die IP-Adresse oder Domain deines VPS.
- `VPS_USERNAME`: Der SSH-Benutzername (z.B. `root` oder `ubuntu`).
- `VPS_SSH_KEY`: Ein privater SSH-Key, mit dem GitHub Actions sich passwortlos auf dem Server einloggen darf.

### 2. Konfiguration anpassen (Optional)
Die `docker-compose.prod.yml` ist aktuell so konfiguriert, dass sie auf den Hostnamen **`planlocationtest.michaelportmann.ch`** reagiert.
Wenn sich dieser ändert, passe einfach die Zeilen mit `VIRTUAL_HOST` und `LETSENCRYPT_HOST` (oder die Traefik-Labels) in der Datei an.

### 3. Deployment
Sobald du Code auf den `main` Branch pushst, passiert Folgendes automatisch:
1. Die Dateien werden sicher per `rsync` auf den VPS unter `/opt/plansync` kopiert (Uploads und die Datenbank werden natürlich nicht überschrieben).
2. Auf dem Server wird der Container neu gebaut (`docker compose --build`).
3. Die App startet im Hintergrund neu (`-d`), ohne Ausfallzeiten.
