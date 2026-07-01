# Collaborative Real-Time Document Editor

A Google Docs-style collaborative editor built with React, TypeScript, FastAPI, WebSockets, Yjs, and Redis. Users can join the same document, edit together in real time, see collaborator presence, and save document snapshots for history review.

## Highlights

- Built simultaneous multi-user editing with live document synchronization.
- Implemented WebSocket communication between a React frontend and FastAPI backend.
- Used Yjs for conflict-tolerant collaborative document updates.
- Added Redis-backed update persistence, pub/sub coordination, and snapshot history.
- Designed a responsive editor workspace with document management, presence, formatting controls, and history previews.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, TipTap, Yjs
- **Backend:** FastAPI, Python, WebSockets
- **Realtime state:** Yjs document updates, awareness presence
- **Storage and coordination:** Redis
- **Deployment-ready frontend:** Vercel-compatible Vite build

## Features

- Create or join documents by ID
- Real-time collaborative editing
- Multi-user cursor and presence awareness
- Formatting toolbar for common writing actions
- Snapshot saving and history preview
- Recent document shortcuts
- Responsive editor layout for desktop and mobile

## Architecture

```txt
React + TipTap editor
        |
        | WebSocket document updates
        v
FastAPI realtime server
        |
        | Redis streams / pub-sub
        v
Redis persistence and coordination
```

The frontend sends local Yjs updates over WebSockets. The backend broadcasts changes to connected collaborators, stores document updates in Redis, and coordinates activity across server instances through Redis pub/sub.

## Prerequisites

- Node.js LTS
- Python 3.11+
- Docker, for local Redis

## Run with Docker

Build and start Redis, backend, and frontend together:

```bash
docker compose up --build
```

Open:

```txt
http://localhost:5173
```

Stop everything:

```bash
docker compose down
```

## Run Locally (without Docker)

Start Redis:

```bash
docker compose up -d redis
```

Start the backend:

```bash
cd backend
python -m venv .venv
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open:

```txt
http://localhost:5173
```

## Environment Variables

Frontend:

```txt
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_BASE_URL=ws://localhost:8000
```

Backend:

```txt
REDIS_URL=redis://localhost:6379/0
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

## Deployment Notes

The frontend can be deployed to Vercel as a static Vite app. The backend should run on a host that supports persistent WebSocket connections, such as Render, Railway, Fly.io, or a VPS.

For a production-style portfolio deployment:

- Deploy `frontend/` to Vercel.
- Deploy `backend/` to a persistent server host.
- Use hosted Redis such as Upstash, Redis Cloud, or Railway Redis.
- Set `VITE_API_BASE_URL`, `VITE_WS_BASE_URL`, `REDIS_URL`, and `CORS_ORIGINS` for the deployed URLs.
