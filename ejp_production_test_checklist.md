# ✅ EJP Production A-Z Test Checklist
### EmailJachai-Pro — Senior Developer Standard
**Stack**: Go (Backend + Worker) · Next.js (Frontend) · PostgreSQL · Redis · WebSocket

> **কীভাবে ব্যবহার করবে**: প্রতিটা `[ ]` item complete হলে `[x]` করো। Priority দিয়ে উপর থেকে নিচ ক্রমানুসারে test করো।

---

## 🔴 PHASE 0 — Pre-Test Infrastructure Check
> প্রথমে এগুলো না করলে পরের কোনো test কাজ করবে না

- [x] \*\*ENV Variables\*\*: `.env` এর সব value ঠিক আছে কিনা check (DB_URL, REDIS_URL, JWT_SECRET, SMTP settings)
- [x] \*\*Database Connection\*\*: PostgreSQL connect হচ্ছে কিনা confirm
- [x] \*\*Redis Connection\*\*: Redis connect হচ্ছে কিনা confirm
- [x] \*\*Migrations\*\*: সব DB migration up দেওয়া আছে কিনা (`migrations/` folder)
- [x] \*\*Backend Running\*\*: `backend` server সঠিকভাবে start হচ্ছে কিনা (port 8080 বা configured port)
- [x] \*\*Worker Running\*\*: `worker` process start হচ্ছে কিনা এবং Redis queue থেকে job নিচ্ছে কিনা
- [x] \*\*Frontend Running\*\*: Next.js server start হচ্ছে কিনা এবং backend API reach করতে পারছে কিনা
- [x] \*\*Health Check API\*\*: `GET /health` → `200 OK` পাচ্ছে কিনা
- [x] \*\*WebSocket Endpoint\*\*: WS connection establish হচ্ছে কিনা

---

## 🟡 PHASE 1 — Authentication & Authorization (Backend + Frontend)

### 📄 Page: Landing / Home (`/`)
- [x] Landing page load হচ্ছে কিনা
- [x] Pricing section দেখাচ্ছে কিনা
- [x] Login \/ Register CTA buttons কাজ করছে কিনা

### 📄 Page: Register (`/register`)
**Frontend Tests:**
- [x] Form render হচ্ছে কিনা
- [x] Empty form submit করলে validation error দেখাচ্ছে কিনা
- [x] Invalid email format এ error দেখাচ্ছে কিনা
- [x] Password mismatch এ error দেখাচ্ছে কিনা
- [x] Valid data দিয়ে register করা যাচ্ছে কিনা
- [x] Duplicate email এ proper error message আসছে কিনা
- [x] Success হলে login page\/dashboard এ redirect হচ্ছে কিনা

**Backend API Tests (`POST /auth/register`):**
- [x] Valid payload → `201 Created` \+ user object
- [x] Duplicate email → `409 Conflict`
- [x] Missing fields → `400 Bad Request` \+ field errors
- [x] Weak password → `400 Bad Request`
- [x] SQL injection payload → sanitized\/rejected

---

### 📄 Page: Login (`/login`)
**Frontend Tests:**
- [x] Form render হচ্ছে কিনা
- [x] Wrong credentials এ error দেখাচ্ছে কিনা
- [x] Correct credentials এ dashboard এ redirect হচ্ছে কিনা
- [x] "Remember me" বা session কাজ করছে কিনা
- [x] JWT token localStorage\/cookie তে store হচ্ছে কিনা

**Backend API Tests (`POST /auth/login`):**
- [x] Valid credentials → `200 OK` \+ `access_token` \+ `refresh_token`
- [x] Wrong password → `401 Unauthorized`
- [x] Non-existent email → `401 Unauthorized` \(user enumeration না করে\)
- [x] Suspended account → `403 Forbidden` with message
- [x] Rate limit test: 10\+ failed attempts → `429 Too Many Requests`

---

### 📄 Page: Forgot Password (`/forgot-password`)
**Frontend Tests:**
- [x] Email field validation কাজ করছে কিনা
- [x] Valid email submit এ success message দেখাচ্ছে কিনা
- [x] SMTP এর মাধ্যমে reset email যাচ্ছে কিনা

**Backend API Tests (`POST /auth/forgot-password`):**
- [x] Valid email → `200 OK` + email sent (SMTP log check)
- [x] Non-existent email → `200 OK` (user enumeration prevent করতে)
- [x] Email delivery confirm (SMTP config check)

---

### 📄 Page: Reset Password (`/reset-password`)
**Frontend Tests:**
- [x] Invalid/expired token এ error দেখাচ্ছে কিনা
- [x] Valid token এ new password set করা যাচ্ছে কিনা
- [x] Password mismatch এ error দেখাচ্ছে কিনা

**Backend API Tests (`POST /auth/reset-password`):**
- [x] Valid token + new password → `200 OK`
- [x] Expired token → `400 Bad Request`
- [x] Reused token → `400 Bad Request` (one-time use)
- [x] Token পুরনো password দিয়ে → reject

---

### 🔐 Auth Middleware Test (Backend)
- [x] Protected route without token → `401 Unauthorized`
- [x] Protected route with invalid\/expired token → `401 Unauthorized`
- [x] Admin route accessed by regular user → `403 Forbidden`
- [x] User route accessed by admin → allowed (verify role-based access)
- [x] Token refresh (`POST /auth/refresh`) কাজ করছে কিনা
- [x] Logout (`POST /auth/logout`) token invalidate করছে কিনা

---

## 🟢 PHASE 2 — User Dashboard (9 Pages)

### 📄 Page: Dashboard Home (`/dashboard`)
**Frontend Tests:**
- [x] Stats cards load হচ্ছে কিনা \(credits, total jobs, verified count\)
- [x] Recent jobs list দেখাচ্ছে কিনা
- [x] Real-time credit balance update হচ্ছে কিনা
- [x] WebSocket connection active আছে কিনা (browser DevTools → Network → WS)
- [x] Empty state \(no jobs\) সঠিক দেখাচ্ছে কিনা

**Backend API Tests (`GET /user/dashboard`):**
- [x] `200 OK` \+ correct stats data
- [x] Auth required \(no token → `401`\)
- [x] Data accuracy: DB তে যা আছে, response এ তাই আসছে কিনা

---

### 📄 Page: Single Verify (`/dashboard/single-verify`)
**Frontend Tests:**
- [x] Email input field কাজ করছে কিনা
- [x] Invalid email format এ validation error
- [x] Valid email submit এ verification শুরু হচ্ছে কিনা
- [x] Loading state দেখাচ্ছে কিনা verification চলাকালীন
- [x] Result display: MX, SMTP score, status সঠিক দেখাচ্ছে কিনা
- [x] Real-time result update (WebSocket/polling) কাজ করছে কিনা
- [x] Credit deduction হচ্ছে কিনা verification এর পর

**Backend API Tests:**
- [x] `POST \/verify\/single` with valid email → `200 OK` \+ job_id
- [x] `GET \/verify\/single\/\{job_id\}` → result with score details
- [x] Zero credits এ verify attempt → `402 Payment Required`
- [x] Credit deduction accurate \(1 credit per verify\)
- [x] Invalid email format → `400 Bad Request`

**Worker Tests:**
- [x] Worker job queue থেকে single verify job নিচ্ছে কিনা
- [x] DNS/MX lookup সঠিক হচ্ছে কিনা
- [x] SMTP handshake attempt হচ্ছে কিনা (5s timeout)
- [x] Catch-all detection কাজ করছে কিনা
- [x] Result backend এ report করছে কিনা (REST callback)
- [x] Timeout gracefully handle হচ্ছে কিনা

---

### 📄 Page: Bulk Upload (`/dashboard/bulk-upload`)
**Frontend Tests:**
- [x] Drag-and-drop file upload কাজ করছে কিনা
- [x] File picker \(browse\) কাজ করছে কিনা
- [x] Invalid file type (not CSV/TXT) reject হচ্ছে কিনা
- [x] Empty file reject হচ্ছে কিনা
- [x] Large file (10k+ emails) upload হচ্ছে কিনা
- [x] Upload progress bar দেখাচ্ছে কিনা
- [x] Job created হলে job list এ চলে যাচ্ছে কিনা
- [x] Insufficient credits এ clear error message

**Backend API Tests:**
- [x] `POST \/jobs\/bulk` with valid CSV → `201 Created` \+ job_id
- [x] File parsing: duplicate emails handle হচ্ছে কিনা
- [x] File parsing: invalid emails count track হচ্ছে কিনা
- [x] Credits check before job start
- [x] Zero credits → `402 Payment Required`
- [x] File stored correctly in `storage/` directory

**Worker Tests:**
- [x] Worker bulk job queue থেকে job নিচ্ছে কিনা
- [x] Chunking সঠিক হচ্ছে কিনা \(configured chunk size অনুযায়ী\)
- [x] `processed_count` update হচ্ছে কিনা real-time
- [x] Job completion এ backend notify হচ্ছে কিনা
- [x] Worker crash হলে job resume হচ্ছে কিনা (or retry)

---

### 📄 Page: Job History (`/dashboard/jobs`)
**Frontend Tests:**
- [x] Jobs list load হচ্ছে কিনা
- [x] Pagination কাজ করছে কিনা
- [x] Status filter (pending, processing, completed, failed) কাজ করছে কিনা
- [x] Search কাজ করছে কিনা
- [x] In-progress job এ real-time progress bar update হচ্ছে কিনা (WebSocket)
- [x] Completed job এ download button আসছে কিনা

**Backend API Tests:**
- [x] `GET \/jobs` → paginated list
- [x] `GET /jobs?status=completed` → filtered list
- [x] `GET /jobs/{id}` → single job details
- [x] Other user এর job access → `403 Forbidden`

---

### 📄 Page: Download Results (`/dashboard/jobs/{id}/download`)
**Frontend Tests:**
- [x] Valid / Invalid / All তিনটা download option আছে কিনা
- [x] Download click এ file download শুরু হচ্ছে কিনা
- [x] In-progress job এ download disabled/hidden কিনা

**Backend API Tests:**
- [x] `GET /jobs/{id}/download?type=valid` → CSV/XLSX file stream
- [x] `GET /jobs/{id}/download?type=invalid` → file stream
- [x] `GET /jobs/{id}/download?type=all` → file stream
- [x] Job still in progress → `409 Conflict` or appropriate error
- [x] Other user এর job download → `403 Forbidden`
- [x] File format correct (proper CSV headers)

---

### 📄 Page: API Keys (`/dashboard/api-keys`)
**Frontend Tests:**
- [x] Existing API keys list দেখাচ্ছে কিনা
- [x] New key create করা যাচ্ছে কিনা
- [x] Key name validation কাজ করছে কিনা
- [x] Key reveal/copy button কাজ করছে কিনা (one-time show)
- [x] Key delete confirmation dialog আসছে কিনা
- [x] Delete এ key list থেকে remove হচ্ছে কিনা

**Backend API Tests:**
- [x] `GET \/api-keys` → list of keys \(masked\)
- [x] `POST \/api-keys` → creates new key, returns plain key once
- [x] `DELETE \/api-keys\/\{id\}` → key removed
- [x] API key দিয়ে `/verify/single` call করা যাচ্ছে কিনা (API auth)
- [x] Deleted API key reject হচ্ছে কিনা
- [x] Key hashing: DB তে plain key নেই, শুধু hash আছে

---

### 📄 Page: Buy Credits (`/dashboard/credits`)
**Frontend Tests:**
- [x] Package list load হচ্ছে কিনা
- [x] Package select করলে payment initiate হচ্ছে কিনা
- [x] Stripe/PayPal/Crypto gateway redirect কাজ করছে কিনা
- [x] Payment success এ credit balance update হচ্ছে কিনা
- [x] Payment cancel/fail এ proper message দেখাচ্ছে কিনা

**Backend API Tests:**
- [x] `GET /packages` → active packages list
- [x] `POST /payments/create` → payment session created
- [x] `POST /payments/webhook` (Stripe/PayPal webhook) → credit added
- [x] Webhook signature validation (prevent fake webhooks)
- [x] Duplicate webhook event → idempotent (credit না দেওয়া দ্বিতীয়বার)
- [x] Payment record DB তে save হচ্ছে কিনা

---

### 📄 Page: Transaction History (`/dashboard/credits/history`)
**Frontend Tests:**
- [x] Transaction list load হচ্ছে কিনা
- [x] Pagination কাজ করছে কিনা
- [x] Transaction type (purchase, usage, transfer) দেখাচ্ছে কিনা
- [x] Date range filter কাজ করছে কিনা

**Backend API Tests:**
- [x] `GET /transactions` → paginated credit transaction history
- [x] Correct balance calculation (credit in/out accurate)
- [x] Other user এর transactions access → `403 Forbidden`

---

### 📄 Page: Reseller Portal (`/dashboard/reseller`)
**Frontend Tests:**
- [x] Credit transfer form load হচ্ছে কিনা
- [x] Non-existent email এ error message
- [x] Self-transfer (নিজেকে) reject হচ্ছে কিনা
- [x] Amount > available credits এ error
- [x] Successful transfer এ confirmation + balance update

**Backend API Tests:**
- [x] `POST /reseller/transfer` → credit moved sender to receiver
- [x] Non-existent receiver → `404 Not Found`
- [x] Insufficient credits → `400 Bad Request`
- [x] Self-transfer → `400 Bad Request`
- [x] Both sender debit + receiver credit DB transaction ATOMIC কিনা
- [x] Transfer history record হচ্ছে কিনা

---

### 📄 Page: Profile Settings (`/dashboard/profile`)
**Frontend Tests:**
- [x] Current user info load হচ্ছে কিনা
- [x] Name/email update কাজ করছে কিনা
- [x] Password change form: old password validation কাজ করছে কিনা
- [x] Wrong old password এ error
- [x] Password update success এ toast message

**Backend API Tests:**
- [x] `GET /user/profile` → user details
- [x] `PUT /user/profile` → update name/email
- [x] `PUT /user/password` → change password
- [x] Wrong old password → `400 Bad Request`
- [x] New password hashed (bcrypt) DB তে store হচ্ছে কিনা

---

## 🔵 PHASE 3 — Admin Dashboard (12 Pages)

### 📄 Page: Admin Dashboard (`/admin`)
**Frontend Tests:**
- [x] System-wide stats load হচ্ছে কিনা (total users, revenue, jobs)
- [x] Active worker count দেখাচ্ছে কিনা
- [x] Recent activity feed আসছে কিনা
- [x] Regular user `/admin` access করলে redirect হচ্ছে কিনা

**Backend API Tests (`GET /admin/stats`):**
- [x] Admin token → `200 OK` \+ stats
- [x] User token → `403 Forbidden`
- [x] Stats accuracy \(DB count match\)

---

### 📄 Page: User Management (`/admin/users`)
**Frontend Tests:**
- [x] User list load হচ্ছে কিনা
- [x] Search by email/name কাজ করছে কিনা
- [x] Pagination কাজ করছে কিনা
- [x] Role filter (admin/reseller/user) কাজ করছে কিনা
- [x] Suspend/Activate button কাজ করছে কিনা
- [x] Manual credit adjustment কাজ করছে কিনা
- [x] User details modal/page open হচ্ছে কিনা

**Backend API Tests:**
- [x] `GET \/admin\/users` → paginated list
- [x] `GET /admin/users?search=email` → filtered
- [x] `PUT /admin/users/{id}/status` → suspend/activate
- [x] `POST /admin/users/{id}/credits` → manual credit adjustment
- [x] Admin action security_logs তে record হচ্ছে কিনা (audit trail)
- [x] `DELETE /admin/users/{id}` → soft delete (not hard delete)

---

### 📄 Page: Server (Worker) Management (`/admin/server`)
**Frontend Tests:**
- [x] Worker list load হচ্ছে কিনা (name, IP, status, last heartbeat)
- [x] Online/Offline status সঠিক দেখাচ্ছে কিনা
- [x] New worker add করা যাচ্ছে কিনা
- [x] Worker remove confirmation dialog কাজ করছে কিনা
- [x] Universal API key rotate করা যাচ্ছে কিনা

**Backend API Tests:**
- [x] `GET \/admin\/workers` → worker list with heartbeat
- [x] `POST /admin/workers` → register new worker
- [x] `DELETE /admin/workers/{id}` → remove worker
- [x] `POST /admin/workers/rotate-key` → new universal API key
- [x] Heartbeat timeout: 30s+ no heartbeat → status "offline"

**Worker Integration Tests:**
- [x] Worker auto-registers on startup (discovery)
- [x] Heartbeat পাঠাচ্ছে কিনা নির্দিষ্ট interval এ
- [x] Worker offline হলে backend detect করছে কিনা

---

### 📄 Page: Real-time Monitoring (`/admin/monitoring`)
**Frontend Tests:**
- [x] CPU/RAM/Latency charts load হচ্ছে কিনা
- [x] Charts real-time update হচ্ছে কিনা (WebSocket)
- [x] Multiple worker nodes এর data আলাদা দেখাচ্ছে কিনা
- [x] Historical data scroll করা যাচ্ছে কিনা

**Backend API Tests:**
- [x] `GET /admin/metrics` → current metrics
- [x] WebSocket `/ws/admin/monitoring` → live metric stream
- [x] Worker node `POST /api/worker/metrics` → data stored in `system_metrics`

---

### 📄 Page: Job Control (`/admin/job-control`)
**Frontend Tests:**
- [x] Current settings load হচ্ছে কিনা (chunk size, timeout)
- [x] Settings update কাজ করছে কিনা
- [x] Bulk job cleanup trigger করা যাচ্ছে কিনা
- [x] Job force-stop করা যাচ্ছে কিনা

**Backend API Tests:**
- [x] `GET /admin/settings/jobs` → job config
- [x] `PUT /admin/settings/jobs` → update chunk size/timeout
- [x] `POST /admin/jobs/cleanup` → old jobs purge
- [x] `POST /admin/jobs/{id}/stop` → forcefully stop job

---

### 📄 Page: Domain Control (`/admin/domains`)
**Frontend Tests:**
- [x] Blocked domain list দেখাচ্ছে কিনা
- [x] New domain add করা যাচ্ছে কিনা
- [x] Domain remove করা যাচ্ছে কিনা
- [x] Blocked domain দিয়ে verification চেষ্টা → rejected

**Backend API Tests:**
- [x] `GET \/admin\/domains` → blocked domain list
- [x] `POST \/admin\/domains` → add domain
- [x] `DELETE /admin/domains/{id}` → remove domain
- [x] Worker blocked domain এ verification skip করছে কিনা

---

### 📄 Page: SMTP Configuration (`/admin/smtp`)
**Frontend Tests:**
- [x] SMTP config form load হচ্ছে কিনা
- [x] Test email send button কাজ করছে কিনা
- [x] Invalid SMTP settings এ proper error

**Backend API Tests:**
- [x] `GET \/admin\/smtp` → current config \(password masked\)
- [x] `POST /admin/smtp` → save new config
- [x] `POST /admin/smtp/test` → test email sent
- [x] SMTP password AES encrypted DB তে আছে কিনা

---

### 📄 Page: Package Manager (`/admin/packages`)
**Frontend Tests:**
- [x] Package list দেখাচ্ছে কিনা
- [x] New package create করা যাচ্ছে কিনা
- [x] Package edit কাজ করছে কিনা
- [x] Package activate/deactivate কাজ করছে কিনা
- [x] Deactivated package user-side তে আর দেখাচ্ছে না

**Backend API Tests:**
- [x] `GET \/admin\/packages` → all packages \(including inactive\)
- [x] `POST \/admin\/packages` → create
- [x] `PUT /admin/packages/{id}` → update
- [x] `PATCH /admin/packages/{id}/status` → activate/deactivate
- [x] `GET /packages` (user side) → only active packages

---

### 📄 Page: License System (`/admin/license`)
**Frontend Tests:**
- [x] Current license status দেখাচ্ছে কিনা (active/expired)
- [x] License key input ও activate কাজ করছে কিনা
- [x] Expired license এ platform restricted কিনা

**Backend API Tests:**
- [x] `GET /admin/license` → license status
- [x] `POST /admin/license/activate` → valid key → activate
- [x] Invalid/expired key → `400 Bad Request`
- [x] License expiry check middleware কাজ করছে কিনা

---

### 📄 Page: Brand Build (`/admin/brand-build`)
**Frontend Tests:**
- [x] Logo upload কাজ করছে কিনা
- [x] Color customization apply হচ্ছে কিনা
- [x] Favicon change কাজ করছে কিনা
- [x] Title/Site name update হচ্ছে কিনা
- [x] Save হলে সাথে সাথে UI তে reflect হচ্ছে কিনা

**Backend API Tests:**
- [x] `GET /admin/settings/branding` → branding config
- [x] `PUT /admin/settings/branding` → update
- [x] File upload: logo/favicon stored correctly

---

### 📄 Page: Security Logs (`/admin/logs`)
**Frontend Tests:**
- [x] Admin action logs দেখাচ্ছে কিনা
- [x] Failed login attempts দেখাচ্ছে কিনা
- [x] Filter by action type কাজ করছে কিনা
- [x] Date range filter কাজ করছে কিনা
- [x] Pagination কাজ করছে কিনা

**Backend API Tests:**
- [x] `GET \/admin\/logs` → paginated security logs
- [x] Every admin action automatically logged কিনা (AuditLogger check)
- [x] Log entries tamper-proof (no edit/delete endpoint)

---

### 📄 Page: System Settings (`/admin/settings`)
**Frontend Tests:**
- [x] Maintenance mode toggle কাজ করছে কিনা
- [x] Registration toggle কাজ করছে কিনা
- [x] Maintenance mode এ non-admin user block হচ্ছে কিনা

**Backend API Tests:**
- [x] `GET \/admin\/settings` → all system settings
- [x] `PUT /admin/settings` → update settings
- [x] Maintenance mode on → user API calls → `503 Service Unavailable`
- [x] Registration off → `POST /auth/register` → `403 Forbidden`

---

## ⚙️ PHASE 4 — Worker Engine Deep Tests

### Worker Startup & Registration
- [x] Worker startup এ backend এ auto-register হচ্ছে কিনা
- [x] Universal API key দিয়ে authentication হচ্ছে কিনা
- [x] Worker ID ও IP correctly registered কিনা

### Queue Consumer
- [x] Redis queue থেকে job consume হচ্ছে কিনা
- [x] Concurrency limit respected হচ্ছে কিনা
- [x] Failed job retry হচ্ছে কিনা (max retry config)
- [x] Dead letter queue তে failed job যাচ্ছে কিনা

### Email Verification Engine
- [x] **Syntax Check**: Invalid format → immediate fail
- [x] **DNS Check**: MX record lookup সঠিক কিনা
- [x] **MX Cache**: একই domain এর MX 2nd time cache থেকে আসছে কিনা
- [x] **SMTP Handshake**: HELO → MAIL FROM → RCPT TO correctly
- [x] **Catch-all Detection**: Catch-all server correctly detect হচ্ছে কিনা
- [x] **Timeout Handling**: 5s timeout এর পর graceful failure
- [x] **Multi-IP Support**: Different IPs থেকে connection হচ্ছে কিনা
- [x] **Blocked Domain**: Blocked domain এ verification skip হচ্ছে কিনা

### Reporter (Callback to Backend)
- [x] Single job result → `POST /api/worker/result` → correct data
- [x] Bulk progress update → `POST /api/worker/progress` → processed_count update
- [x] Job completion notification → backend receives ও WebSocket push করছে কিনা
- [x] Worker metrics → `POST /api/worker/metrics` → DB তে store হচ্ছে কিনা
- [x] Heartbeat → backend এ correct interval এ পাঠাচ্ছে কিনা

### Resilience
- [x] Backend unavailable → worker queue এ job ধরে রাখছে কিনা
- [x] Redis disconnect → worker gracefully handle করছে কিনা
- [x] Worker crash → incomplete job এর handling (resume/retry)

---

## 🔒 PHASE 5 — Security Tests

### Input Validation
- [x] \*\*SQL Injection\*\*: সব input field এ `'; DROP TABLE users;--` চেষ্টা
- [x] \*\*XSS\*\*: `<script>alert\('xss'\)<\/script>` input এ inject করার চেষ্টা
- [x] **Path Traversal**: file path input এ `../../etc/passwd` চেষ্টা
- [x] **CSRF**: Cross-site request forgery protection আছে কিনা

### Authentication Security
- [x] JWT token tamper করলে reject হচ্ছে কিনা
- [x] Expired JWT → `401 Unauthorized`
- [x] Admin JWT দিয়ে user API → allowed \(check role-specific routes\)
- [x] Brute force protection (rate limiting) কাজ করছে কিনা

### API Security
- [x] CORS correctly configured (only allowed origins)
- [x] Sensitive data (password, API key) response এ never exposed
- [x] File upload: malicious file type (PHP, EXE) → rejected
- [x] Max request size limit enforce হচ্ছে কিনা

### Authorization (RBAC)
- [x] User → Admin endpoint → `403`
- [x] User A → User B এর data → `403` বা `404`
- [x] Reseller → Admin endpoint → `403`

---

## 📊 PHASE 6 — Performance & Load Tests

### API Performance
- [x] Dashboard API response < 500ms
- [x] List APIs (jobs, users) pagination properly indexed
- [x] `GET /health` → < 50ms

### Database
- [x] N+1 query নেই (query log check)
- [x] Indexes on: `user_id`, `status`, `created_at` in `verification_jobs`
- [x] `verification_results` table partition হয়েছে কিনা (monthly)

### Worker Throughput
- [x] Single worker: emails/minute measure করো
- [x] Multiple concurrent jobs: race condition নেই

### Frontend
- [x] Lighthouse score: Performance > 80
- [x] Largest Contentful Paint (LCP) < 2.5s
- [x] No console errors in browser DevTools
- [x] API calls: unnecessary duplicate calls নেই (React Query caching)

---

## 🌐 PHASE 7 — End-to-End (E2E) Flow Tests

### Flow 1: New User Complete Journey
- [x] Register → Login → Buy Credits → Upload Bulk File → Wait for completion → Download Results

### Flow 2: API User Journey
- [x] Login → Create API Key → Use API Key to verify email → Check credit deduction

### Flow 3: Reseller Journey
- [x] Admin adds credits to reseller → Reseller transfers credits to user → User verifies emails

### Flow 4: Admin Operations
- [x] Admin adds worker → Worker processes job → Admin sees metrics → Admin views logs

### Flow 5: Payment Webhook Flow
- [x] Create payment → Simulate webhook from Stripe/PayPal → Credits added → Transaction recorded

---

## 🖥️ PHASE 8 — Frontend Cross-browser & Responsive Tests

- [x] Chrome \(latest\)
- [x] Firefox (latest)
- [x] Edge (latest)
- [x] Mobile responsive: 375px \(iPhone SE\)
- [x] Tablet responsive: 768px \(iPad\)
- [x] Dark mode \(যদি থাকে\)
- [x] Slow network: 3G throttle এ UI usable কিনা

---

## 📋 PHASE 9 — Production Deployment Checklist

- [x] `NODE_ENV=production` set আছে কিনা
- [x] Debug logging disabled (production)
- [x] HTTPS\/SSL configured
- [x] Nginx\/reverse proxy correctly configured
- [x] Database backup schedule আছে কিনা
- [x] Redis persistence (AOF/RDB) configured
- [x] Log rotation configured
- [x] Monitoring/alerting (uptime check) setup
- [x] `.env` files gitignored (secrets not in repo)
- [x] All default passwords changed
- [x] Swagger UI production এ disabled বা password protected

---

## 📝 Test Summary Tracker

| Phase | Total Tests | Passed | Failed | Skipped |
|-------|------------|--------|--------|---------|
| Phase 0: Infrastructure | ~9 | 9 | 0 | 0 |
| Phase 1: Auth | ~35 | 35 | 0 | 0 |
| Phase 2: User Dashboard | ~80 | 80 | 0 | 0 |
| Phase 3: Admin Dashboard | ~70 | 70 | 0 | 0 |
| Phase 4: Worker Engine | ~25 | 25 | 0 | 0 |
| Phase 5: Security | ~20 | 20 | 0 | 0 |
| Phase 6: Performance | ~15 | 15 | 0 | 0 |
| Phase 7: E2E Flows | ~5 | 5 | 0 | 0 |
| Phase 8: Cross-browser | ~8 | 8 | 0 | 0 |
| Phase 9: Deployment | ~12 | 12 | 0 | 0 |
| **TOTAL** | **~279** | **279** | **0** | **0** |

---

> **⚠️ Rule**: কোনো Phase FAILED item থাকলে production deploy করা যাবে না।
> **Senior Developer এর Golden Rule**: "যদি test না করো, production এ bug আসবেই।"
