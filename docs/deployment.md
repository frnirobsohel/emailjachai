# Deployment Guide (Frontend + Backend)

This project deploys as:

- Frontend (Next.js): `https://yourdomain.com`
- Backend (PHP API): `https://yourdomain.com/api`

## 1) Server Requirements

- Node.js 20+ and npm 10+
- PHP 8.2+ (`pdo_mysql`, `openssl`, `curl`)
- Apache + `mod_rewrite`
- MySQL/MariaDB

## 2) Database Setup

Import schema from project root:

```bash
mysql -u root < docs/schema.sql
```

Default DB name: `frontend`.

## 3) Backend Deploy (`api/`)

Place `api/` under web root so public API path is `/api`.

`api/.htaccess` already routes all API requests to `api/index.php`.

Run backend schema migrations once after import/deploy:

```bash
php api/index.php --migrate

```

If admin server page shows `ERR_SCHEMA_OUTDATED` / `Worker server schema is outdated`, re-run the same two commands.

### Backend Environment Setup

Create `api/.env` from `api/.env.example`:

```env
DB_HOST=localhost
DB_USER=your_db_user
DB_PASS=your_db_password
DB_NAME=frontend
ENVIRONMENT=production
API_BASE_PATH=/api
FRONTEND_URL=https://yourdomain.com
JWT_SECRET=very_long_random_secret_here
```

Notes:

- `API_BASE_PATH` must match your public API prefix.
- `JWT_SECRET` should be the same secret used by frontend auth routes.

### Backend writable folders

Make writable by web user:

- `api/storage/jobs/bulk`
- `api/storage/results/bulk`
- `api/storage/results/single`
- `api/logs`

## 4) Frontend Deploy (`frontend/`)

Create `frontend/.env.local` from `frontend/.env.example`.

### Frontend env example

```env
DB_HOST=127.0.0.1
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=frontend
JWT_SECRET=very_long_random_secret
API_BASE_URL=https://yourdomain.com/api
NEXT_PUBLIC_API_URL=https://yourdomain.com/api
NODE_ENV=production
PORT=3000
```

### Build and run

```bash
cd frontend
npm install
npm run build
npm run start
```

Run frontend behind reverse proxy to `http://127.0.0.1:3000`.

## 5) Optional Worker Deploy

For `worker/worker.php`:

```env
API_URL=https://yourdomain.com/api
WORKER_API_KEY=your_dedicated_worker_key
WORKER_SERVER_NAME=worker-us-east-1a-01
WORKER_SERVER_PORT=80
WORKER_IP_ADDRESS=203.0.113.10
```

`WORKER_API_KEY` must be the dedicated worker key from admin server settings (`/admin/server/worker-key`), not a user API key.

`WORKER_SERVER_NAME` must be unique per worker node (letters/numbers/dot/underscore/hyphen, 3-100 chars).

Run:

```bash
php worker/artisan
```

### 5.1) Process Management (Production)

For production, use a process manager like **Supervisor** or **PM2** to ensure the worker restarts if it crashes:

**PM2 Example:**
```bash
pm2 start "php worker/artisan" --name "verification-worker"
```

**Supervisor Config Example:**
```ini
[program:email-worker]
command=php /path/to/worker/artisan
autostart=true
autorestart=true
stderr_logfile=/var/log/worker.err.log
stdout_logfile=/var/log/worker.out.log
```

Use supervisor/systemd/PM2-like manager for production workers.

## 6) Smoke Tests

```bash
curl -i https://yourdomain.com/api/settings/public
curl -i https://yourdomain.com/api/dashboard/stats
```

Second endpoint should return `401/403` without auth token.

Frontend test:

- Open `/login`
- Login
- Verify dashboard loads and `/api/proxy/...` requests succeed.

## 7) Common Fixes

- `Endpoint not found: /fontendapi/api/...`
  - Check `API_BASE_PATH` and backend rewrite rules
- `JWT_SECRET environment variable is not defined`
  - Set `JWT_SECRET` in frontend env and restart Next.js
- 401 loop to `/login`
  - Check auth cookie and backend auth response
