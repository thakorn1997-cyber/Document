# Deploy Checklist — Project Document (Document ES)

คู่มือขึ้น production สำหรับแอปนี้ (Next.js frontend + Go/Gin backend + PostgreSQL)
ประกอบด้วย 3 ส่วน: **(ก)** checklist + config ตัวอย่าง · **(ข)** CORS เข้มตอน production (แก้แล้วในโค้ด) · **(ค)** storage เลือก driver ตาม env (แก้แล้วในโค้ด)

> สถาปัตยกรรมที่แนะนำ: reverse proxy (nginx/IIS) ทำ **TLS termination** → ชี้ไปที่ **Next.js (พอร์ต 3000)** → Next proxy `/api/v1/*` และ `/uploads/*` ไปที่ **backend Go (พอร์ต 8080)** แบบ same-origin (ไม่ต้องพึ่ง CORS)

---

## (ก) Deploy Checklist

### 0. เตรียมเครื่อง / prerequisites
- [ ] ติดตั้ง Go (build), Node.js 18+ (build/run frontend), PostgreSQL 15+
- [ ] มีโดเมนจริง + TLS certificate (Let's Encrypt หรือ cert องค์กร) — **จำเป็นสำหรับ Azure login**
- [ ] เปิดพอร์ตเฉพาะ 443 (public); 3000/8080 ให้ฟังเฉพาะ `127.0.0.1` (ไม่ expose ตรง)

### 1. Database
- [ ] สร้าง PostgreSQL จริง (มี backup + persistent volume) — **ห้ามใช้ container dev `pd_postgres:5433`**
- [ ] สร้าง db `documentes` + user ที่มีสิทธิ์ **DDL** (migration auto-run ตอน start — `db.Migrate`)
- [ ] ตั้ง `DATABASE_URL` ให้ถูก + `sslmode=require` ถ้า DB อยู่คนละเครื่อง
- [ ] ทดสอบ migration รันครบ: ดูตาราง `schema_migrations` ล่าสุด = `017_perf_indexes`

### 2. Backend (Go) — build เป็น binary + process manager
- [ ] สร้างไฟล์ `backend/.env` สำหรับ production (ดูตัวอย่างข้อ ก.6)
- [ ] `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` = **สุ่มใหม่ 64+ ตัวอักษร** (คนละตัวกับ dev, อย่า reuse) → `openssl rand -base64 48`
- [ ] `APP_ENV=production` (เปิด Gin release mode + ปิด CORS LAN wildcard — ข้อ ข)
- [ ] Build: `go build -o server.exe ./cmd/server` (จาก `backend`)
- [ ] รันใต้ process manager (auto-restart) — **NSSM** (Windows) / **systemd** (Linux) ดูข้อ ก.7
- [ ] ⚠️ ตั้ง **WorkingDirectory = โฟลเดอร์ backend** — storage path เป็น relative (`./storage/...`) ไฟล์จะไปผิดที่ถ้า cwd ผิด

### 3. Frontend (Next.js) — standalone build
- [ ] ตั้ง env ตอน **build** (ดูตัวอย่างข้อ ก.6): `NEXT_PUBLIC_BASE_PATH`, `BACKEND_URL`
- [ ] Build: `npm ci && npm run build` (จาก `frontend`) — `output:"standalone"` ตั้งไว้แล้ว
- [ ] Copy `.next/standalone`, `.next/static`, `public/` ไปเครื่อง prod ตามโครงสร้าง standalone
- [ ] รัน: `node .next/standalone/server.js` (พอร์ต 3000) ใต้ process manager — **ห้ามใช้ `next dev`**
- [ ] ⚠️ `NEXT_PUBLIC_*` ถูก inline ตอน build — ถ้าเปลี่ยนต้อง **build ใหม่**

### 4. Reverse proxy + TLS (ดูตัวอย่าง nginx ข้อ ก.8)
- [ ] TLS termination ที่ 443 → proxy ไป `127.0.0.1:3000`
- [ ] **ปิด buffering สำหรับ SSE** (`/api/v1/notifications/stream`) — ไม่งั้น realtime แจ้งเตือนจะไม่มา
- [ ] ตั้ง `proxy_read_timeout` ยาว (เช่น 1h) รองรับ SSE connection ค้าง
- [ ] เพิ่ม `client_max_body_size` ≥ `MAX_UPLOAD_MB` (เช่น 20m)

### 5. Azure AD (ถ้าใช้ Microsoft login)
- [ ] Azure Portal → App Registration → Authentication → **เพิ่ม SPA redirect URI**: `https://<domain>/Document/login` (ตรงกับ `NEXT_PUBLIC_BASE_PATH`)
- [ ] ตั้ง `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` ใน backend `.env` (หรือปล่อยว่างเพื่อปิด Azure login)
- [ ] ยืนยันเข้าผ่าน **HTTPS** เท่านั้น (MSAL ใช้ `window.crypto.subtle` ต้อง secure context)

### 6. Post-deploy verification
- [ ] `GET https://<domain>/Document` โหลดหน้า login ได้
- [ ] `GET /healthz` (ผ่าน proxy หรือ localhost:8080) = 200
- [ ] Local login ได้ + refresh token ทำงาน (ทิ้งไว้ > 15 นาทีแล้วยังใช้ต่อได้ = refresh ทำงาน)
- [ ] Azure login ได้ (ถ้าเปิด)
- [ ] อัปโหลดไฟล์ + ดาวน์โหลดกลับได้ (ยืนยัน storage path ถูก)
- [ ] เปิด 2 เบราว์เซอร์ → อัปเดตสถานะเป็น Passed → อีกฝั่งเห็น 🔔 realtime (ยืนยัน SSE ผ่าน proxy)
- [ ] รีสตาร์ท service แล้วขึ้นเองอัตโนมัติ (process manager)

---

### ก.6 ตัวอย่าง env สำหรับ production

**`backend/.env`**
```dotenv
APP_ENV=production
APP_PORT=8080

DATABASE_URL=postgres://appuser:STRONG_PASS@db-host:5432/documentes?sslmode=require

JWT_ACCESS_SECRET=<openssl rand -base64 48>
JWT_REFRESH_SECRET=<openssl rand -base64 48 — ต้องต่างจาก access>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=168h

STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=./storage/documents
MAX_UPLOAD_MB=20

# production: ใส่เฉพาะ origin จริง (ถ้าใช้ same-origin proxy จะปล่อยว่างก็ได้)
CORS_ALLOWED_ORIGINS=https://docs.example.co.th

AZURE_TENANT_ID=<tenant-guid>
AZURE_CLIENT_ID=<client-guid>
AZURE_AUTO_PROVISION=true
```

**`frontend/.env.production`** (ค่าเหล่านี้ inline ตอน `npm run build`)
```dotenv
NEXT_PUBLIC_BASE_PATH=/Document
# ปล่อยว่าง = client เรียก same-origin ผ่าน proxy (แนะนำ)
# NEXT_PUBLIC_API_BASE_URL=

# ใช้ตอน Next.js proxy /api → backend (server-side). ถ้าอยู่เครื่องเดียวกันปล่อย default ได้
BACKEND_URL=http://127.0.0.1:8080
```

### ก.7 ตัวอย่าง process manager

**Windows — NSSM** (ต่อ service, ตั้ง 2 ตัว: backend + frontend)
```powershell
# Backend
nssm install DocumentES-API "D:\deploy\backend\server.exe"
nssm set DocumentES-API AppDirectory "D:\deploy\backend"   # สำคัญ! storage path เป็น relative
nssm set DocumentES-API AppStdout "D:\deploy\logs\api.log"
nssm set DocumentES-API AppStderr "D:\deploy\logs\api.err.log"
nssm start DocumentES-API

# Frontend
nssm install DocumentES-Web "C:\Program Files\nodejs\node.exe" ".next\standalone\server.js"
nssm set DocumentES-Web AppDirectory "D:\deploy\frontend"
nssm set DocumentES-Web AppEnvironmentExtra "PORT=3000" "HOSTNAME=127.0.0.1"
nssm start DocumentES-Web
```

**Linux — systemd** (`/etc/systemd/system/documentes-api.service`)
```ini
[Unit]
After=network.target postgresql.service
[Service]
WorkingDirectory=/opt/documentes/backend
ExecStart=/opt/documentes/backend/server
Restart=always
EnvironmentFile=/opt/documentes/backend/.env
[Install]
WantedBy=multi-user.target
```

### ก.8 ตัวอย่าง nginx (TLS + SSE)
```nginx
server {
    listen 443 ssl;
    server_name docs.example.co.th;
    ssl_certificate     /etc/ssl/docs.crt;
    ssl_certificate_key /etc/ssl/docs.key;
    client_max_body_size 20m;

    # SSE — ต้องปิด buffering ไม่งั้น realtime ไม่วิ่ง
    location /Document/api/v1/notifications/stream {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
# หมายเหตุ: ถ้าใช้ IIS + ARR ให้ปิด response buffering ที่ URL ของ stream ด้วย (ARR proxy)
```

---

## (ข) CORS เข้มตอน production — ✅ แก้แล้วในโค้ด

**ปัญหาเดิม:** `middleware/cors.go` รับทุก origin ที่เป็น private-LAN/localhost เสมอ + `AllowCredentials:true` → LAN origin ใดก็ยิงแบบมี credential ได้ ทุก env

**แก้แล้ว:**
- `CORS(allowedOrigins, allowPrivateLAN)` เพิ่มพารามิเตอร์ — ถ้า `allowPrivateLAN=false` จะรับเฉพาะ `CORS_ALLOWED_ORIGINS`
- `main.go` ส่ง `!isProd` → **production ปิด LAN wildcard อัตโนมัติ** (dev ยังสะดวกเหมือนเดิม)
- production + `CORS_ALLOWED_ORIGINS` ว่าง → log เตือน (ปลอดภัยถ้าใช้ same-origin proxy)

**Checklist:**
- [ ] ตั้ง `APP_ENV=production` (เป็นตัว trigger)
- [ ] ตั้ง `CORS_ALLOWED_ORIGINS` = origin จริง **เฉพาะกรณีมี client เรียก backend ข้าม origin** (ถ้า same-origin proxy ล้วน ไม่ต้องตั้ง)

## (ค) Storage เลือก driver ตาม env — ✅ แก้แล้วในโค้ด

**ปัญหาเดิม:** `main.go` hardcode `storage.NewLocal(...)` — ตั้ง `STORAGE_DRIVER=อะไรก็ตาม` ไม่มีผล เงียบๆ ใช้ local เสมอ

**แก้แล้ว:**
- เพิ่ม factory `storage.New(driver, localPath)` — `""`/`"local"` → local; อื่นๆ → **error ทันทีตอน start** (fail fast)
- `main.go` เรียก `storage.New(...)` + `log.Fatalf` ถ้า error → config ไม่โกหกอีกต่อไป

**ข้อจำกัดที่ยังอยู่ (ต้องรู้):**
- มีแค่ driver **`local`** เท่านั้น (ยังไม่มี cloud/Azure Blob — ถ้าต้องใช้ต้องเขียน `Storage` implementation เพิ่มแล้วต่อใน `storage.New`)
- local disk = ไฟล์อยู่เครื่องเดียว → **สเกลหลาย instance ไม่ได้** (LB 2+ node หาไฟล์ข้ามเครื่องไม่เจอ)
- **backup โฟลเดอร์ `storage/` แยกจาก DB** (DB dump ไม่มีไฟล์แนบ)

**Checklist:**
- [ ] `STORAGE_DRIVER=local` (ค่าเดียวที่รองรับ)
- [ ] `STORAGE_LOCAL_PATH` ชี้ไป volume ที่ backup ได้ + WorkingDirectory ถูกต้อง
- [ ] ตั้ง cron/scheduled backup โฟลเดอร์ไฟล์ + avatars (`storage/avatars`)
- [ ] ถ้าจะสเกล horizontal ในอนาคต → ต้องเปลี่ยนไป shared/object storage (งานพัฒนาเพิ่ม)

---

_อัปเดต 2026-07-07 — ครอบคลุมการแก้ CORS (ข) + storage factory (ค); ส่วนอื่นเป็น config/infra ที่ต้องตั้งตอน deploy_
