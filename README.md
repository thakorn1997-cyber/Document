# Project Document

ระบบส่งเอกสารระหว่างแผนก (Upload/Download + Version + Audit Log)
รายละเอียด business rules อ่านที่ [`Document MD.md`](./Document%20MD.md)

## Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind + TanStack Query
- **Backend:** Go 1.22 + Gin + pgx + JWT (custom)
- **Database:** PostgreSQL 15
- **Storage:** Local filesystem (MVP) via storage interface

## โครงสร้าง

```text
Document ES/
├── Document MD.md          # Business rules + API contract + schema
├── docker-compose.yml
├── backend/                # Go API
│   ├── cmd/server/         # main.go
│   ├── config/ db/ handlers/ middleware/ models/ storage/ utils/
│   └── migrations/         # SQL files
└── frontend/               # Next.js
    └── src/app/ src/components/ src/lib/
```

## Quick Start (Docker Compose)

```bash
# 1. copy env
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local

# 2. generate JWT secrets (recommended)
#    openssl rand -hex 32   -> วางค่าลง JWT_ACCESS_SECRET และ JWT_REFRESH_SECRET

# 3. run everything
docker compose up --build

# 4. open http://localhost:3000
```

## Local Development (แยก process)

### Backend

```bash
cd backend
cp .env.example .env

# start postgres (ผ่าน docker เดี่ยว หรือ compose)
docker compose up -d postgres

# run migrations (ต้องมี golang-migrate CLI ติดตั้ง)
migrate -database "$env:DATABASE_URL" -path migrations up

# start api
go run ./cmd/server
```

### Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
# http://localhost:3000
```

## API

REST prefix `/api/v1`. ดูรายละเอียดทุก endpoint และ response shape ที่ `Document MD.md` Section 18.

Health check: `GET /healthz`

## Directory Convention

- **Backend:** cmd → config → db → repositories → services → handlers (top-down)
- **Frontend:** `src/app/*` เป็น routes, `src/components/*` shared UI, `src/lib/api/*` HTTP layer, `src/lib/auth/*` token store

## เอกสาร Design ที่เกี่ยวข้อง

- Business rules, permissions, statuses: `Document MD.md` Sections 1–11
- API contract: `Document MD.md` Section 18
- Database schema: `Document MD.md` Section 19
- Env vars: `Document MD.md` Section 20
- Definition of Done (MVP): `Document MD.md` Section 21
