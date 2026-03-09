# Collaborative Real-Time Document Editor
A simplified version of Google Docs.

## Prereqs
- Node.js (LTS)
- Python 3.11+
- Docker (for Redis)

## Run (dev)
Start Redis:

```bash
docker compose up -d
```

Backend:

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.\\.venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and create/join a document.
