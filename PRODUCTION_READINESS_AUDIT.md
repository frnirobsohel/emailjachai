# EmailJachai-Pro — Production Readiness Audit

**Date:** August 6, 2026 (updated after Phase 1 + Phase 2 + Phase 3 fixes)  
**Stack:** Next.js BFF + Go API + Go Asynq worker · PostgreSQL + Redis  

---

## Verdict

**Phase 1 (Security), Phase 2 (Ops), and Phase 3 (Accuracy) code fixes are in the repo.**  
Remaining work is **operational**: set real prod secrets, enable backups/uptime on the host, optional Sentry DSN, redeploy, and run the smoke checklist in `ops/PRODUCTION_RUNBOOK.md`.

| Area | Status |
|------|--------|
| Phase 1 Security | Done |
| Phase 2 Ops code | Done |
| Phase 3 Accuracy (G-series) | Done |
| Host/deploy config | Your responsibility before DNS cutover |

---

## Phase 1 — Security (DONE)

| ID | Sev | Fix |
|----|-----|-----|
| F1 | CRITICAL | Next.js **16.2.11** |
| F2 | HIGH | Prod fail-fast for CORS / FRONTEND_URL / secrets |
| F3 | HIGH | `sslmode=require` documented + warning |
| F4 | MEDIUM | Session TTL **24h** |
| F5 | MEDIUM | debug-ip hard-disabled in production |
| F6 | MEDIUM | Proxy error details scrubbed in production |
| F7 | MEDIUM | Public status rate-limited |
| F8 | LOW | make_admin requires DATABASE_URL |

---

## Phase 2 — Ops (DONE in repo)

| ID | Sev | Fix |
|----|-----|-----|
| F9 | HIGH | `.github/workflows/ci.yml` — Go test/build + frontend lint/test/build |
| F10 | HIGH | Deep `/api/v1/health` (Postgres + Redis → 503); Docker HEALTHCHECK on all services |
| F11 | HIGH | Frontend `reportError` + `global-error.tsx`; backend 5xx structured logging; optional `SENTRY_DSN` |
| F12 | HIGH | Worker tests: webhook SSRF guard, DLQ payload shape, domain cache, SMTP timeout, invalid syntax |
| F13 | MEDIUM | Shared-storage boot guidance + `.env.example` `SHARED_STORAGE` / `API_REPLICAS` |
| F14 | MEDIUM | `scripts/backup-postgres.sh` + `ops/PRODUCTION_RUNBOOK.md` |
| F15 | MEDIUM | Migration `000011` partitions through **2031** |
| F16 | LOW | Root `docker-compose.yml` for local/staging smoke |

---

## Phase 3 — Accuracy / Verification Engine (DONE — August 22, 2026)

| Gap | Sev | Fix | Files |
|----|-----|-----|-------|
| G2 | HIGH | Unknown/timeout results NOT cached — next request re-probes fresh | `worker_handler.go`, `job_service.go`, `public_verify_handler.go` |
| G6 | HIGH | Worker + backend STARTTLS + `SMTP_HELO_HOSTNAME` for proper FQDN | `worker/internal/engine/smtp.go`, `backend/internal/verifier/smtp.go` |
| G9 | MEDIUM | 4xx greylist: 8-second back-off retry on same MX (deadline-aware) | `worker/internal/engine/smtp.go`, `backend/internal/verifier/smtp.go` |
| G10 | MEDIUM | RFC 7505 Null MX (`0 .`) → immediate `invalid (no_mail)` | `worker/internal/engine/smtp.go`, `backend/internal/verifier/smtp.go` |
| G11 | HIGH | M365/Yahoo known accept-all MX → force `catch_all` (no false valid) | `worker/internal/engine/smtp.go`, `backend/internal/verifier/smtp.go` |
| G13 | LOW | Role list expanded: noreply, no-reply, abuse, security, office, team, etc. | `worker/internal/engine/smtp.go`, `backend/internal/verifier/smtp.go` |

**Already correct (no change needed):** G1, G3, G5, G7, G8, G14, G15, G17, G18

**Parity note (Aug 22, 2026):** Single/public (backend verifier) and bulk (worker) now share G6/G9/G10/G11/G13 probe classification. Paths remain separate processes; logic must stay mirrored.

---

## Go-live checklist (host)

- [ ] Redeploy frontend/backend/worker with Phase 1+2+3 images
- [ ] Set real secrets (`JWT_SECRET`, `WORKER_API_KEY`, TLS `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGINS`, `FRONTEND_URL`, internal `API_BASE_URL`)
- [ ] **Set `SMTP_HELO_HOSTNAME=mail.yourdomain.com` on worker AND backend** (Phase 3 parity)
- [ ] Schedule `scripts/backup-postgres.sh` daily + one restore drill
- [ ] External uptime check on `/api/v1/health` and site `/`
- [ ] Optional: set `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`
- [ ] Single API replica **or** shared volume + `SHARED_STORAGE=required`
- [ ] Smoke: register → verify → bulk → buy credits → webhook → worker online

---

## Key files added/updated

### Phase 1 + 2
- `.github/workflows/ci.yml`
- `docker-compose.yml`
- `ops/PRODUCTION_RUNBOOK.md`
- `scripts/backup-postgres.sh`
- `backend/migrations/000011_job_results_partitions_2029_2031.sql`
- `backend/internal/api/handler/system_handler.go` (deep health)
- `backend/pkg/observability/`
- `frontend/lib/observability.ts`, `frontend/app/global-error.tsx`
- `worker/internal/queue/handlers_test.go`, `worker/internal/engine/smtp_test.go`

### Phase 3 (Accuracy)
- `backend/internal/api/handler/worker_handler.go` (G2 cache skip)
- `backend/internal/service/job_service.go` (G2 cache skip)
- `backend/internal/api/handler/public_verify_handler.go` (G2 cache skip)
- `backend/internal/verifier/smtp.go` (G10 Null MX, G13 roles)
- `worker/internal/engine/smtp.go` (G6 STARTTLS+HELO, G9 retry, G10 Null MX, G11 M365/Yahoo, G13 roles)
- `worker/.env`, `worker/.env.example` (SMTP_HELO_HOSTNAME)
