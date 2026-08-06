# Production Operations Runbook — EmailJachai-Pro

## Services

| Service | Port | Health |
|---------|------|--------|
| Frontend (Next.js) | 3000 | HTTP `/` |
| Backend (Go API) | 8000 | `GET /api/v1/health` (Postgres + Redis) |
| Worker (Asynq) | — | process alive + Admin → Servers heartbeat |
| PostgreSQL | 5432 | `pg_isready` |
| Redis | 6379 | `PING` |

## Required production env (minimum)

- `GO_ENV=production` / `NODE_ENV=production`
- `JWT_SECRET` (same on frontend + backend)
- `WORKER_API_KEY` (same on backend + worker)
- `DATABASE_URL` with `sslmode=require` (or `verify-full`)
- `REDIS_URL`
- `CORS_ORIGINS` + `FRONTEND_URL` (real HTTPS origins)
- Frontend `API_BASE_URL` = **internal** backend URL (not public Traefik)
- `NEXT_PUBLIC_WS_URL` = `wss://…/api/v1/ws`

Optional: `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`, Turnstile keys, payment credentials.

## Backups

Daily (cron / Dokploy scheduled task):

```bash
DATABASE_URL='postgres://…?sslmode=require' \
BACKUP_DIR=/var/backups/ejp \
RETENTION_DAYS=14 \
./scripts/backup-postgres.sh
```

Restore drill (staging DB only):

```bash
gunzip -c backups/ejp_YYYYMMDD….sql.gz | psql "$DATABASE_URL"
```

Run a restore drill at least once before public launch.

## Multi-replica API

Bulk job source/results live on disk (`BULK_SOURCE_PATH`, `BULK_RESULTS_PATH`).

- **1 API replica:** local volume OK.
- **2+ API replicas:** mount the **same** shared volume on every replica and set `SHARED_STORAGE=required`.

## Uptime checks

Point an external monitor at:

- `https://api.example.com/api/v1/health` — expect HTTP 200 + `"postgres":"ok"`, `"redis":"ok"`
- `https://app.example.com/` — expect HTTP 200

Alert on 503 from `/health` (dependency outage).

## Partitions

`job_results` monthly partitions are created through **2031** (migration `000011`). Before 2032, add the next year of partitions (copy the migration pattern).

## Smoke test before DNS cutover

1. Register → login  
2. Single verify  
3. Bulk CSV job completes + download  
4. Buy credits (sandbox) → webhook fulfill  
5. Worker appears Online in Admin → Servers  
6. `/api/v1/health` returns 200  

## Local full stack

```bash
docker compose up --build
```

See root `docker-compose.yml`.
