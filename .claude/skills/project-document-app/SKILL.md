---
name: project-document-app
description: Maintain the "Project Document" app (Document ES) — Next.js App Router frontend + Go/Gin/pgx backend + PostgreSQL. Use for UI table/form layout fixes (text overlap, column ordering, icon-only buttons, two-column forms), RBAC admin-only edit/delete features (frontend + backend enforcement), adding document endpoints, and building/type-checking this project on this Windows machine. Triggers on work under "D:\2.Project\Document ES" or the TimeSheet/Document document module.
---

# Project Document App (Document ES)

Maintenance playbook for the Project Document app. Frontend and backend live under `D:\2.Project\Document ES`.

## Layout & key files
- **Frontend**: `frontend/src` — Next.js App Router. Protected pages under `src/app/(protected)/`.
  - Documents list: `documents/page.tsx` · Upload: `documents/upload/page.tsx` · Detail: `documents/[id]/page.tsx` · Edit (admin): `documents/[id]/edit/page.tsx`
  - API client + types: `src/lib/api/endpoints.ts` (axios `api` in `client.ts`)
  - Shared: `components/ConfirmDialog.tsx` (`useConfirm`, tones `primary|danger|success`), `components/Avatar.tsx`, `lib/utils.ts` (`cn`)
- **Backend**: `backend` — Go + Gin + pgx (pgxpool), storage abstraction (`storage.Storage`).
  - Document handler: `handlers/document.go` · Routes: `cmd/server/main.go` · Models: `models/models.go`
  - Auth context: `middleware/context.go` (`UserRoles`, `UserDeptIDs`), `handlers/settings.go` has `isAdmin(c)`
  - Responses: `handlers/response.go` (`OK`, `Created`, `Err`, `List`)

## Build & verify on THIS machine
- `go` is NOT on PATH. Use the full path: `& "C:\Program Files\Go\bin\go.exe" build ./...` (run from `backend`).
- Frontend type-check: `npx tsc --noEmit -p tsconfig.json` (run from `frontend`). Ignore pre-existing `MasterTab.tsx` `is_active`/`Department` errors — unrelated.
- Prefer type-check over full build for a quick correctness gate.

## Runtime / ops (dev machine)
- **Backend** runs as a native process on **:8080** via `go run ./cmd/server` (binary shows up under a `go-build` temp dir). It reads `backend/.env` (has `DATABASE_URL`).
- **Postgres** runs in Docker container **`pd_postgres`** (`postgres:15-alpine`, host port **5433**, db `documentes`). Query it with: `docker exec pd_postgres psql -U postgres -d documentes -c "..."` (no local `psql` CLI). For files with Thai text, put SQL in a UTF-8 file and `docker exec -i pd_postgres psql -U postgres -d documentes < file.sql`.
- **A `go run` backend does NOT hot-reload.** After editing Go code (new routes/handlers), you MUST restart it or the changes are not live. Restart: `Stop-Process -Id <pid> -Force` (find via `netstat -ano | grep :8080`), then relaunch `go run ./cmd/server` from `backend` (background).

### Production deploy — see `docs/DEPLOY_CHECKLIST.md`
Full go-live checklist (env, NSSM/systemd, nginx TLS+SSE, Azure redirect URI, storage/backup) lives in `docs/DEPLOY_CHECKLIST.md`. The app code is solid; the gaps are all **config/infra** (dev defaults). The 3 things that make it literally not work on plain HTTP: **TLS** (MSAL needs `window.crypto.subtle` = secure context), the **Azure SPA redirect URI** must be registered for the prod origin (`https://<domain>/Document/login`), and running as a **built binary + process manager** (not `go run`/`next dev`). Frontend `NEXT_PUBLIC_*` are inlined at build → change requires rebuild. Recommended topology = reverse proxy TLS → Next (:3000) → Next rewrites proxy `/api/v1/*` + `/uploads/*` to Go (:8080) **same-origin** (so CORS is mostly moot).
- **CORS is env-gated:** `middleware.CORS(allowedOrigins, allowPrivateLAN)` — `main.go` passes `!isProd`, so **production accepts ONLY `CORS_ALLOWED_ORIGINS`** (the private-LAN wildcard is dev-only). Don't drop the 2nd arg.
- **Storage is a factory:** `storage.New(driver, localPath)` — `""`/`"local"` → local disk; any other `STORAGE_DRIVER` **fails fast** (`log.Fatalf`). Only `local` exists — no cloud/object driver yet, so files live on ONE node (no horizontal scale) and the `storage/` dir must be backed up SEPARATELY from the DB. `STORAGE_LOCAL_PATH` is relative → the process manager MUST set WorkingDirectory to `backend/` or files land in the wrong place (same for `r.Static("./storage/avatars")`).

### Diagnosing "action failed" (e.g. "ลบไม่สำเร็จ")
Curl the endpoint UNauthenticated to distinguish cause — the protected group runs JWT middleware, so:
- **HTTP 401** = route exists (just needs auth) → the handler/route is fine; look elsewhere (permissions, DB).
- **HTTP 404** = route does NOT exist in the running binary → the backend is a **stale build**; restart it.
Example: `curl -s -o /dev/null -w "%{http_code}" -X DELETE http://localhost:8080/api/v1/documents/<uuid>`. This is exactly how a "delete failed" report was traced to a not-restarted backend (routes 404) while the DB cascade was perfectly fine.
To confirm a delete is safe at the DB level, list FKs → all should be `CASCADE`: query `information_schema` referential_constraints for children of `documents`, or dry-run `BEGIN; DELETE FROM documents WHERE id=...; ROLLBACK;`.

### Login/logout MUST clear the React Query cache (stale-user gotcha)
The `QueryClient` is created once at app root (`components/providers.tsx`, `staleTime: 30_000`) and lives for the whole tab — it survives client-side navigation between `/login` and the protected pages. So logout/login MUST call `queryClient.clear()` or the previous user's cached data leaks into the next session. A real bug: login Azure → logout → login as a local user still showed the **Azure** user, because `logout()` cleared only `tokenStore` (not the cache), so `useQuery(["me"])` served the still-fresh Azure profile. Fix pattern: `logout()` in `(protected)/layout.tsx` calls `tokenStore.clear(); qc.clear();` before `router.replace("/login")`; the login page (`login/page.tsx`) also calls `qc.clear()` right after `tokenStore.set(...)` on BOTH the local and Azure success paths (belt-and-suspenders for switching users without logging out). `qc` = `useQueryClient()`. NOTE: this is separate from MSAL's own cache (`sessionStorage`, `msal.ts`) — logout does not `removeAccount`, but `loginPopup({prompt:"select_account"})` already forces the account chooser, so Azure re-login isn't sticky.

## RBAC (admin) — enforce on BOTH layers
Admin roles are the strings `"SystemAdmin"` and `"admin"`.
- **Frontend**: `const admin = (meQ.data?.roles ?? []).some(r => r === "SystemAdmin" || r === "admin")` where `meQ = useQuery({queryKey:["me"], queryFn: authApi.me})`. Hide admin-only UI (edit/delete buttons, whole pages) behind `admin`. For an admin-only page, redirect non-admins: `useEffect(() => { if (meQ.data && !admin) router.replace(...) }, [meQ.data, admin])`.
- **Backend**: start each admin handler with `if !isAdmin(c) { Err(c, http.StatusForbidden, "FORBIDDEN", "admin only"); return }`. Never rely on the UI alone — the API must reject direct calls.

## Adding a document endpoint
1. Write the handler method in `handlers/document.go`.
2. Register the route in `cmd/server/main.go` inside the `protected` group, e.g. `protected.PATCH("/documents/:id", docH.Update)`.
3. Add the client call in `endpoints.ts` under `documentApi` (e.g. `update: (id, patch) => api.patch(...)`, `remove: (id) => api.delete(...)`).
4. Audit mutations with `writeAudit(ctx, tx, userID, "ACTION", "Document", id, detail)`. `audit_logs.target_id` has NO FK, so writing an audit row before a hard delete is safe.

### Partial update (PATCH) pattern
Accept a struct of `*T` pointers (nil = "don't change"). Build the SQL dynamically:
```go
set := []string{}; args := []any{}; n := 1
add := func(col string, val any){ set = append(set, fmt.Sprintf("%s = $%d", col, n)); args = append(args, val); n++ }
if req.CompanyName != nil { add("company_name", nilIfEmpty(strings.TrimSpace(*req.CompanyName))) }
// ...
if len(set) == 0 { Err(...VALIDATION...); return }
set = append(set, "updated_at = NOW()")
query := fmt.Sprintf("UPDATE documents SET %s WHERE id = $%d", strings.Join(set, ", "), n)
args = append(args, id)
```
Normalize enums with helpers already in `document.go`: `normStatus` (→ Pending/Passed/Failed), `normProjectType` (→ Standard/Modify/Add-on). Dates via `parseDatePtr`. Empty→NULL via `nilIfEmpty`.

### Hard delete + file cleanup pattern
Child tables (`document_versions`, `acknowledgements`, `document_recipients`, `download_logs`, `notifications`) all `REFERENCES documents(id) ON DELETE CASCADE`, so one `DELETE FROM documents` cascades. But physical files must be removed manually:
```go
// 1. collect file_path for every version BEFORE deleting (cascade will drop the rows)
// 2. writeAudit(...); DELETE FROM documents WHERE id=$1 (check RowsAffected==0 → 404)
// 3. commit, THEN loop paths: h.Storage.Delete(p)
```
The `documents` table has no `deleted_at`; there is no soft-delete unless a migration adds one.

### Notifications / fanout (SSE) — kinds & conditions
Realtime notifications live in `handlers/notifications.go` (+ `notify.Hub` SSE) and render in `components/NotificationBell.tsx`. Fanout helpers run in a goroutine AFTER the DB commit. Kinds:
- **`document_acknowledged`** — on ack, notifies only the doc's uploader (`owner_user_id`).
- **`document_passed`** — broadcast to ALL active users (except the actor) when a save moves a UAT/UAI status into **Passed** (`uat_status='Passed' OR uai_status='Passed'`). Fires from **Create** (created already Passed) and **Update** (transition only: new is Passed AND old was NOT — read old status before the update, re-read after commit, compare, to avoid duplicate alerts on repeated edits).
- **`document_created`** — legacy broadcast helper still defined but no longer called (creation no longer notifies unless Passed).
`fanoutBroadcast(db, hub, docID, actorID, kind, payload)` is the shared broadcaster (INSERT ... SELECT over active users). To add a new kind: add it in `fanoutBroadcast` callers, extend `NotificationKind` in `endpoints.ts`, and add a `KindDot` color/icon + a `NotifText` branch in `NotificationBell.tsx` (else it falls back to raw kind text).
Payload convention: `{ company_name, work_order, title, uat_status, uai_status }` (older created payload used `has_uat`/`has_uai` booleans).

#### SSE + access-token rotation (the "realtime stops after a while" gotcha)
EventSource can't send an `Authorization` header, so the access token is passed as a **query param** in `streamUrl` (`.../stream?access_token=...`). The backend `Stream` handler validates the token **only once, at connect** (`handlers/notifications.go`) — an already-open stream survives token expiry, BUT the token is baked into the URL, so on ANY reconnect (laptop sleep, network blip, proxy timeout) EventSource retries the **same, now-expired** URL → server 401s → realtime silently dies until a full page reload (the 60s count poll keeps the badge number roughly fresh, masking it).
Fix pattern (do NOT capture the token once at mount): in `NotificationBell.tsx` read `tokenStore.access` **fresh on every (re)connect** and rebuild the `EventSource` whenever the token changes. Access tokens rotate only via the axios 401→refresh flow (`client.ts` → `tokenStore.setAccess`), and same-tab code gets no `storage` event, so `token.ts` has a tiny **pub/sub**: `set`/`setAccess`/`clear` call `notify()`; `tokenStore.subscribe(fn)→unsubscribe` lets consumers react. The bell subscribes and reconnects on a changed token (null token = logged out → stay disconnected). Closed loop: token expires → 60s poll hits axios → 401 → refresh → `setAccess` → `notify` → bell reconnects with the fresh token. `tokenStore.subscribe` is the general hook for "do X when the token rotates" — reuse it rather than polling `localStorage`.

### Attachments are optional
Documents can be saved with **zero files** — neither the upload form nor `Create` requires an attachment. Ack still needs at least one version (it acks the latest), so a fileless doc simply can't be acknowledged until a file is added via the edit page.

### UAT/UAI form binding — keep label↔state matched
On upload + edit, the two `<StatusGroup>`s render UAI first then UAT (to match the "สถานะ UAI / UAT" header). Each group's `status`/`onStatus`/`date`/`onDate` MUST bind to its OWN state: `label="UAI"` → `uaiStatus`/`uaiDate`, `label="UAT"` → `uatStatus`/`uatDate`. A past bug cross-wired them (UAI group written to `uatStatus`), silently saving to the wrong DB column. Always verify the binding matches the label when reordering these.

### Perf indexes / audit
Migration `017` added `idx_documents_created_at (created_at DESC)` (list/dashboard global ordering) and `idx_audit_action_created (action, target_type, created_at DESC)` (dashboard "recent edits"). Fanout goroutines have `defer recover()`; `azureCache` is guarded by `azureCacheMu`. A full backend+frontend review is captured in `docs/คู่มือและผลตรวจสอบระบบ.md` (defect audit + user manual + pros/cons).

### Status vs project_type — don't confuse the columns
Two unrelated fields are easy to mix up (a real dashboard bug came from this):
- `uat_status` / `uai_status` ∈ **Pending / Passed / Failed** (per-doc, separate for UAT and UAI).
- `project_type` ∈ **Standard / Modify / Add-on** (one value per doc).
The dashboard's UAT/UAI breakdown once queried `uat_status = 'Standard'/'Modify'/'Add-on'` → always 0 because those are `project_type` values, not statuses. The dashboard now reports `statuses.{uat,uai}.{pending,passed,failed}` from `COUNT(*) FILTER (WHERE uat_status='Passed')` etc. Dashboard handler: `handlers/dashboard.go` → `GET /dashboard`.

**`uat_status`/`uai_status` are NULLABLE** (migration `015`, default dropped). Unselected status = **NULL**, rendered as "—" in the table (never auto-defaulted to Pending). Consequences:
- Save path: use `normStatusPtr(s) *string` (returns nil for empty/unrecognized) so the column gets NULL; `derefStr(p)` when you need the string (e.g. the Passed notification check). The old `normStatus` (empty→"Pending") must NOT be used for saving.
- Read path: the model fields are `string`, so any query selecting these columns MUST wrap them `COALESCE(uat_status,'')` — scanning a raw NULL into a Go `string` errors and fails the whole query (breaks List/Detail). Frontend then sees `""`/absent → `StatusBadge` renders "—" and the edit form pre-selects nothing.
- Existing legacy 'Pending' rows were intentionally kept (not backfilled to NULL).

### Dashboard "เอกสารต่อวัน" chart — range filter + area chart
`GET /dashboard/daily?from=YYYY-MM-DD&to=YYYY-MM-DD` (handler `DashboardHandler.Daily`) returns the per-day count series for an inclusive range (defaults to last 7 days; from>to auto-swapped; span capped at 366 days). The main `GET /dashboard` still returns a fixed 7-day `daily` for backward compat, but the chart now drives itself off the dedicated endpoint. Frontend: `DocsPerDayCard` (in `dashboard/page.tsx`) has preset buttons (7/14/30 วัน) + a custom from–to date range, its own `useQuery(["dashboard-daily", from, to])`, and renders a self-contained SVG **`AreaChart`** — smooth Catmull-Rom path, gradient fill, gridlines, hover crosshair + tooltip, responsive width via `ResizeObserver` (svg width = measured px, no viewBox scaling so strokes/dots stay crisp), x-labels sampled to ≤7. Replaced the old `MiniBarChart`.

### Dashboard "เอกสารทั้งหมด" trend badge (`trend_pct` / `trend_is_new`)
The green/red badge on the total-docs KPI = week-over-week change in doc **creation** (`created_at`): thisWeek (last 7 days) vs lastWeek (14→7 days ago) → `(this-last)/last*100`. **When `lastWeek==0` there's no baseline** — a percentage is meaningless, so `dashboard.go` sets `trend_is_new=true` (instead of the old misleading hardcoded `trend_pct=100`) and the frontend `TrendBadge` renders **"+N ใหม่สัปดาห์นี้"** using `this_week` as N. Normal weeks (lastWeek>0) still show `±N% สัปดาห์นี้`. Response fields: `trend_pct`, `trend_is_new`, `this_week` — only consumed by `dashboard/page.tsx` (`this_week` also labels the "ของฉัน" card). Adding `trend_is_new` is backward-compatible (new field).

### Dashboard "recent activity" (กิจกรรมล่าสุด) logic
`activity` merges two independently-queried sources, each `LIMIT 10`, then sorts by timestamp DESC and caps at 10:
- **upload**: latest documents by `created_at`; actor = `owner_user_id` (the uploader, joined to `users`).
- **acknowledge**: latest rows from `acknowledgements` by `acknowledged_at`; actor = the user who acked. (Ack is a single first-come lock, so ≤1 per doc.)
It is global (not filtered by user/department) and only surfaces uploads + acknowledgements — not edits, deletes, or file add/remove. To include those, add a query over `audit_logs` (actions `UPDATE`/`DELETE`/`ADD_FILES`/`DELETE_FILE` are already written there).

### Report page (`/reports`) — aging column + Excel/PDF export
A read-only report at `(protected)/reports/page.tsx`, visible to **all roles** (NAV key `report`, NOT `adminOnly` → the layout's visibility filter shows it unless an admin sets `menu_visibility.report=false`). It reuses `documentApi.list({size:500})` + `settingsApi.get()` — **no backend endpoint was added**. Columns: บริษัท / ผู้รับผิดชอบ / วันติดตั้ง / UAI status+date / UAT status+date / **จำนวนวัน (aging)**.
- **Aging logic** (`computeAging`): calendar-day count (date-only, via `Date.UTC` parts) from `install_date`. If `uat_status==='Passed'` → FROZEN = `uat_date − install_date` (green); else RUNNING = `today − install_date`. Edge cases render `—`: no `install_date`, or Passed-but-no-`uat_date`. Negative clamped to 0. Because `install_date`/`uat_date`/`uai_date` are all nullable, always guard.
- **Color thresholds are configurable + persisted** in `app_settings` under key `report_aging` = `{warn_days, late_days}` (defaults 8 / 30). Set via a new admin-only Settings tab (`settings/tabs/ReportSettingsTab.tsx`, tab key `report`); read on the report page. The generic settings key-value store (`handlers/settings.go`, `Get` all-roles / `Patch` admin-only) means adding a new settings key needs **zero backend code** — just extend the `AppSettings` type in `endpoints.ts` and PATCH the key. Color: locked=emerald, `≥late`=rose, `≥warn`=amber, else brand-blue.
- **Export = a dropdown** (Excel + PDF). Excel uses **SheetJS `xlsx`** pinned to the **official CDN tarball** (`package.json` → `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, NOT the stale npm `xlsx@0.18.5` which has 2 high CVEs) — so `npm ci` needs to reach `cdn.sheetjs.com`; we only WRITE files (`writeFile`) so the read-path CVEs never applied anyway — imported **dynamically** (`await import("xlsx")`) inside the click handler so it code-splits out of the initial page load (page 6.75kB vs 227kB if statically imported). PDF export opens a new window, writes a self-contained HTML doc with a Sarabun `<link>` (falls back to `'Leelawadee UI'/'Tahoma'` offline so Thai still renders), and auto-`window.print()` — no jsPDF/Thai-font-embedding needed. Guard the `window.open` null (popup blocked) with a toast. Export always covers the **filtered** set (date-range on install_date + UAT-status filter), not a page slice.

### File versions — the version_no collision gotcha
`document_versions` has a UNIQUE index `uq_document_versions_kind (document_id, kind, version_no)` (migration 003). Therefore every inserted row of the same `kind` for a document MUST get a distinct `version_no` — you cannot hardcode `version_no = 1`. When saving multiple files:
- Within one request/tx, keep a per-kind counter: `verCounter[kind]++` and use that value.
- When appending to an existing document, seed from the DB: `SELECT COALESCE(MAX(version_no),0) FROM document_versions WHERE document_id=$1 AND kind=$2`, then increment per file.
Shared helper `storeVersion(ctx, tx, docID, userID, kind, versionNo, fh)` streams to `h.Storage`, hashes sha256, inserts the row, and returns the stored rel-path (non-empty even on insert error so the caller can `h.Storage.Delete` the orphan). Used by both `Create` and `AddVersions`.

Endpoints for managing files on an existing doc (both admin-guarded):
- `POST /documents/:id/versions` (`AddVersions`) — multipart `files[]`, saved as `kind='ATTACHMENT'` with `MAX+1` numbering; bumps `current_version_no`.
- `DELETE /documents/:id/versions/:versionId` (`DeleteVersion`) — reads `file_path`, deletes the row, commits, then `h.Storage.Delete`. Deleting a version cascades its `acknowledgements` (FK ON DELETE CASCADE) — acceptable for admin file management.
Gin routes on the same path with different verbs are fine (`GET .../download` + `DELETE .../:versionId`) as long as the param name (`:versionId`) is identical across methods.

### Frontend file management (edit page)
Manage attachments independently of the metadata PATCH — upload/delete fire their own mutations and `invalidateQueries(["document", id])` + `["documents","all"]` to refresh:
- `documentApi.addFiles(id, files)` → multipart POST; `documentApi.deleteVersion(id, versionId)` → DELETE.
- Existing files come from `detailQ.data.versions` (`DocumentVersion[]`: id, kind, original_file_name, file_size_bytes, uploaded_at).
- Validate client-side before upload (size ≤ `MAX_FILE_MB`, mime in PDF/JPG/PNG), then upload immediately (no staging). Show `กำลังอัปโหลด...` and disable the dropzone via `pointer-events-none` while pending.
- Authenticated download = `documentApi.download(id, versionId)` → returns a `Blob` via **axios** (`responseType:"blob"`, `timeout:60_000`) → `saveBlob(blob, filename)` (helper in `lib/utils.ts`) → temporary `<a download>`. Wrap in `try/catch` → `toast.error(...)`. Same helper in list + detail pages. **Do NOT use a raw `fetch` with a manual `Authorization: Bearer` header** — that bypasses the axios 401→refresh→retry interceptor, so a download the moment the access token expires silently fails with no retry (this was the fixed defect). Routing through the `api` instance also drops the need to touch `tokenStore` in the page at all.

### Returning nested arrays in a list query
For a per-row array (e.g. attached files), aggregate to JSON in SQL and unmarshal in Go — avoids N+1:
```sql
(SELECT COALESCE(json_agg(json_build_object('id', v.id::text, 'name', v.original_file_name, 'kind', v.kind)
        ORDER BY v.uploaded_at), '[]'::json)
   FROM document_versions v WHERE v.document_id = d.id) AS files
```
Scan into `var filesJSON []byte` then `json.Unmarshal(filesJSON, &it.Files)`. **Keep SELECT column order exactly aligned with the `rows.Scan(...)` argument order** — a mismatch is the most common bug when editing these queries.
Note: new uploads are stored with `kind = 'ATTACHMENT'` (unified `files[]`), not `UAT`/`UAI`. Any list/detail file logic must handle `ATTACHMENT`, not just UAT/UAI.

## Frontend UI patterns

### Data tables — prevent text overlap / ugly wrapping
Symptom: header/labels wrap mid-word and columns look cramped when there are many columns.
- Container: keep `overflow-x-auto` on a wrapper `div` so wide tables scroll instead of squashing.
- Stop wrapping: add `whitespace-nowrap` to all headers (`thead className="... [&_th]:whitespace-nowrap"`) and to short atomic cells (dates, WorkOrder, staff name, company link).
- Compact padding: `px-2.5 py-3` (not `px-3`+) buys horizontal room.
- Row vertical alignment: `align-middle` (use `align-top` only when a cell stacks multiple items like a file list).
- Only wrap columns that genuinely need it (long notes); keep IDs/dates/codes `whitespace-nowrap`.

### Per-column filter + sort headers (Documents table)
The documents list (`documents/page.tsx`) has clickable column headers → each opens a popover with sort (asc/desc) + a multi-select checkbox filter of that column's distinct values. Design:
- A module-level `COLUMNS: Column[]` config (`{ key, label, getValue(d)→string, sortValue(d)→string|number }`) drives headers, distinct-value lists, filtering, and sorting. **Its order MUST match the hand-written body `<td>` cells** (the body stays custom — badges/buttons — only headers are generified).
- Filters combine with **AND** across columns (`filters: Record<key, string[]>`); a single active `sort: {key, dir}`. Client-side over the already-loaded `size:200` list.
- The popover uses **`position: fixed`** with coords from the button's `getBoundingClientRect()` — NOT `absolute`. Reason: the table lives in an `overflow-x-auto` wrapper, which clips/scrolls an absolutely-positioned dropdown; fixed escapes the clip. It closes on outside-click, scroll (capture), and resize.
- When filters reduce to 0 rows, keep the table+headers rendered (show a `colSpan` "no match" row) so the user can still clear filters — gate the empty-state card on `base.length===0`, not `items.length===0`.
- The `#` index and admin `จัดการ` columns are intentionally not filterable.

### Icon-only action buttons
Compact circular buttons save width and read cleanly. Keep the meaning in `title=` for hover/accessibility:
```tsx
<button className="inline-flex w-9 h-9 items-center justify-center rounded-full border bg-white text-slate-500 border-slate-300 hover:border-brand-500 hover:text-brand-700 hover:bg-brand-50" title="กดรับทราบ">
  <Check size={18} />
</button>
// locked/done state: solid fill, no border, cursor-default
<div className="inline-flex w-9 h-9 items-center justify-center rounded-full bg-emerald-600 text-white" title="รับทราบแล้ว โดยคุณ">
  <CheckCircle2 size={18} />
</div>
```
Edit/delete use the same `w-8 h-8 rounded-lg` icon buttons (`Pencil`, `Trash2` from `lucide-react`), delete guarded by `useConfirm({ tone: "danger" })`.

### Page-level loading — `<MusicLoader/>`
Full-page/route loading states use `components/MusicLoader.tsx` — an animated equalizer ("music bars", brand-blue, `bg-brand-500`) with an optional `label` (default "กำลังโหลด...") and `className`. Pure CSS: `.animate-eq` + `@keyframes eq` (scaleY) in `globals.css` `@layer utilities` (alongside `animate-shimmer`/`animate-float`); each bar gets a staggered inline `animationDelay`; honors `prefers-reduced-motion`; `role="status"`. Used by the 5 page loaders (documents list/detail/edit, profile, settings Suspense fallback) — replaced the plain "กำลังโหลด..." text. NOT applied to contextual skeletons (dashboard chart/activity/donut, MasterTab/UsersTab table bodies, NotificationBell dropdown) — those stay as-is. Reuse `<MusicLoader/>` for any new page-level load; keep small inline/table loaders lightweight.

### Notifications — use the Toast system, never `alert()`
`components/Toast.tsx` provides `ToastProvider` + `useToast()` (mounted in `components/providers.tsx` inside `QueryClientProvider`, wrapping `ConfirmProvider`). API: `toast.success(msg)`, `toast.error(msg)`, `toast.info(msg)`, or `toast.show(msg, { type, title, duration })`. Toasts render top-right, colored by type (success=emerald, error=rose, info=brand), auto-dismiss (error 6s, others 4s), dismissible. Replace every `alert(...)` with a toast, and add `toast.success(...)` in mutation `onSuccess` for delete/save/upload feedback. `useConfirm` (modal, tones primary/danger/success) is still the right tool for yes/no confirmations before destructive actions.
- **A page that redirects on success STILL needs the toast** — the upload page (`documents/upload`) `onSuccess` fires `toast.success("บันทึกเอกสารเรียบร้อยแล้ว")` **then** `router.push(detail)`. Because `ToastProvider` sits in `components/providers.tsx` (app-level, above the router), the toast survives the navigation and renders on the destination page. A past bug: upload had NO toast at all (didn't even import `useToast`) — users saw the redirect but no "บันทึกสำเร็จ" confirmation. When adding a create/save flow, don't assume the redirect is enough feedback. Match the edit page: `toast.success` + `qc.invalidateQueries(["documents","all"])` on success, `toast.error(msg)` on error (keep any inline validation banner too).

### Status / type badges
Small pill helpers keyed by value with a fallback:
```tsx
// Status: Pending (slate) / Passed (emerald) / Failed (rose)
// Type:   Standard (slate) / Modify (amber) / Add-on (indigo)
const cls = { Passed: "bg-emerald-50 text-emerald-700 border border-emerald-200", ... }[status] ?? "bg-slate-100 text-slate-600";
```

### Master data tables (Settings → Master) & their dropdowns
Master entities live in `settings/tabs/MasterTab.tsx` as sub-tabs (แผนก/ระดับ/พนักงาน/บริษัท), each: a `*Panel` (table + soft-delete via `is_active`) + a `*Modal` (add/edit through `FormModal`/`FormRow`). Backend pattern = one handler per entity (e.g. `handlers/company.go`) with `List` (active-only, for form dropdowns) + `ListAll`/`Create`/`Update`/`Delete` (admin-guarded, `Delete` = soft `is_active=false`). Routes: public-ish `GET /<entity>` + admin `GET/POST/PATCH/DELETE /admin/<entity>`. Frontend api object in `endpoints.ts` (`companyApi`, `staffApi`, ...). Unique-name violations return 409 "…มีอยู่แล้ว" via `isUniqueViolation(err)` (pg code 23505 through `pgconn.PgError`).
- **Companies** master stores `name` + `work_order` (default WorkOrder) + `is_active` (migration `018` added `companies.work_order VARCHAR(255) NOT NULL DEFAULT ''`). The document `ชื่อบริษัท` field is a `SearchableSelect` in **`creatable`** mode (suggestions from `companyApi.list()`, but you may type a brand-new name). Documents still store the chosen/typed **name string** in `documents.company_name` (no FK, no schema change).
  - **Company default WorkOrder → upload autofill:** On the **upload page only** (`documents/upload`), selecting a company runs `onCompanyChange` which matches `companiesQ.data` by exact `name` and, if that company has a non-empty `work_order`, overwrites the `workOrder` field with it (option A — overwrite, but never wipe with a blank default). The field stays a normal editable `<input>`, so the user can still change the WO per document; the doc saves its own final value to `documents.work_order`. **Do NOT add this autofill to the edit page** (`documents/[id]/edit`) — it would clobber the document's saved WorkOrder when an admin re-touches the company field. `company` handler/`companyUpsert` carry `work_order`; the shared `scan()` SELECTs `id, name, work_order, is_active, created_at` (keep Scan order aligned). Set a company's default at Settings › Master › บริษัท.

### SearchableSelect — the one dropdown component (`components/SearchableSelect.tsx`)
`<SearchableSelect value onChange options placeholder>` replaces native `<select>` for every custom picker. Trigger styled with `.input` (matches other fields) + chevron; dropdown has an optional search box + option list; keyboard arrow/enter/esc; clear button; closes on outside-click. `options: {id, label, keywords?}` — `label` shown, `keywords` matched-only (e.g. a hidden employee code). Props:
- default = pick-only searchable (e.g. "ผู้รับผิดชอบ Project" staff — matches hidden employee_id too).
- `searchable={false}` = no search box, just the list (e.g. Type: Standard/Modify/Add-on).
- `creatable` = free text allowed; the value can be text not in options (shown in the trigger), and a "＋ ใช้ &quot;…&quot;" row / Enter commits the typed text (e.g. company name). There is no separate Combobox component — creatable mode replaced it.
Safe inside `.card` (no overflow-hidden) with a plain `absolute` dropdown; inside an `overflow-x-auto` container use fixed-positioning instead (see the table filter note).
- **The open-reset effect MUST be guarded by a `wasOpen` ref (fire only on the false→true transition), NOT keyed on `[open, options, value]` alone.** Parents pass a freshly-built `options` array every render (e.g. `staffApi.list().map(...)` inline), so a parent re-render while the dropdown is open changes `options` identity → the effect re-runs → `setQuery("")` wipes what the user is typing mid-search. Pattern: `if(!open){wasOpen.current=false;return} if(wasOpen.current)return; wasOpen.current=true; setQuery("")...`. (This was the fixed defect.)

### Two-column form layout (info left, attachments right)
Wrap the form body in `grid grid-cols-1 lg:grid-cols-3 gap-6 items-start`; left content `lg:col-span-2`, side panel `lg:col-span-1`. Mobile collapses to one column. **Do not add `lg:sticky`** to the side panel unless asked — users disliked the panel following the scrollbar.

### Status inputs with no forced default
The status picker must NOT pre-select on first load. Model the value as `type StatusValue = "Pending" | "Passed" | "Failed" | ""` initialized to `""`, and only send the field when non-empty (like optional dates): `if (uatStatus) form.append("uat_status", uatStatus)`.

## Layout / sidebar (`(protected)/layout.tsx`)
Two independent states drive the shell: `collapsed` (desktop icon-rail, persisted in `localStorage["sidebar-collapsed"]`) and `mobileOpen` (off-canvas drawer). Responsive rule = the `lg` breakpoint:
- **Desktop (lg+):** fixed sidebar toggles `lg:w-16` (rail: icons only, labels `lg:hidden`, `title` tooltips) ↔ `lg:w-60`; main content padding follows via `lg:pl-16`/`lg:pl-60`. A round chevron button floats on the sidebar edge (`absolute -right-3`, `hidden lg:flex`).
- **Mobile (<lg):** sidebar is a full-width (`w-60`) drawer slid off-canvas with `-translate-x-full` → `translate-x-0` when `mobileOpen`, `lg:translate-x-0` pins it on desktop. A `Menu` hamburger in the header (`lg:hidden`) opens it; a backdrop (`z-30`) + an `X` in the drawer close it; navigating (`useEffect` on `pathname`) auto-closes. z-order: header 20 < backdrop 30 < sidebar 40.
Read `localStorage` in a `useEffect` (not the `useState` initializer) — this is a client component but still SSR'd, so `localStorage` in render throws.

### Top header — glass toolbar
The sticky top `<header>` shows a **left title** (gradient accent bar + `pageTitle(pathname)`, which matches the longest `NAV` href prefix so `/documents/[id]` → "Document") and a **floating glass pill** on the right grouping: a search icon (a `<Link href="/documents">` — there's no global search, it just jumps to the list's per-column search, `hidden sm:flex`), `<NotificationBell/>`, a divider, and `<AvatarMenu/>`. `AvatarMenu` (used ONLY here) renders avatar + name + chevron in its trigger (name/chevron `hidden sm:block`); its dropdown is unchanged. NotificationBell sits inside the pill unchanged — its dropdown is `absolute right-0 top-12` off its own `relative` wrapper, so grouping doesn't break it. To add a header nav title, extend `NAV`.

### Brand logo (`components/Logo.tsx`)
The app mark is a reusable **full-bleed SVG** `<Logo className="w-full h-full" />` — a folded document outline behind overlapping bold letters **P** (deep-blue gradient `#3b7bf0→#2563eb`) and **D** (light-blue `#7fc5fb→#5db2f6`) on a soft blue tile (`#f5f9ff→#e6edff`), viewBox `0 0 120 120`. It replaced the old inline `<div>…PD…</div>` gradient badge. Used in the **sidebar header** (`(protected)/layout.tsx`, 36px) and the **login page** (`login/page.tsx`, 64px). The SVG is full-bleed (bg rect fills 0..120, no self-rounding) — the **caller** supplies the rounded/clipped/shadowed wrapper: `<div className="w-9 h-9 rounded-xl overflow-hidden shadow-md shadow-slate-300/50 ring-1 ring-slate-200/70"><Logo className="w-full h-full"/></div>`. To resize, only change the wrapper's `w-/h-`. Letters are `<text>` (font-weight 800, system sans) — tweak `x`/`fontSize` in the component to adjust overlap. (The browser-tab favicon under `app/` is separate and was NOT changed here.)

## Conventions
- Text is Thai; keep confirm/labels in Thai. Currency of dates via `new Date(x).toLocaleDateString("th-TH")` (Buddhist year shows, that's expected).
- React Query keys in use: `["documents","all"]`, `["document", id]`, `["me"]`, `["staff"]`. Invalidate the relevant ones after mutations.
- After editing a `.tsx` you Wrote earlier, note the harness may report "modified since read" if a linter reformatted it — re-Read before Write.
