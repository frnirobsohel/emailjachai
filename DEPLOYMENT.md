# Independent Deployment Guide

This project is designed as three independently deployable services:

- `frontend`: Next.js app
- `backend`: Go API
- `worker`: Go Asynq worker

Use one Coolify project to group them if you want, but create them as separate Coolify applications/services. A root Docker Compose stack is not required for production.

## Backend

Build context: `backend`

Dockerfile: `backend/Dockerfile`

Required environment:

```env
GO_ENV=production
ENVIRONMENT=production
PORT=8000
DATABASE_URL=postgres://user:password@db-host:5432/ejp?sslmode=disable
REDIS_URL=redis://:password@redis-host:6379/0
JWT_SECRET=change-me-long-random
WORKER_API_KEY=change-me-long-random
FRONTEND_URL=https://app.example.com
CORS_ORIGINS=https://app.example.com
BULK_JOBS_PATH=/app/storage/bulk_jobs
SINGLE_RESULTS_PATH=/app/storage/results/single
DNS_RESOLVERS=8.8.8.8,1.1.1.1
```

Mount persistent storage to `/app/storage` so bulk and single verification result files survive redeploys.

Health check:

```text
/health
```

## Frontend

Build context: `frontend`

Dockerfile: `frontend/Dockerfile`

Required runtime environment:

```env
NODE_ENV=production
JWT_SECRET=change-me-long-random
API_BASE_URL=https://api.example.com/api/v1
NEXT_PUBLIC_WS_URL=wss://api.example.com/api/v1/ws
FRONTEND_URL=https://app.example.com
```

Required build arguments:

```env
JWT_SECRET=change-me-long-random
NEXT_PUBLIC_WS_URL=wss://api.example.com/api/v1/ws
```

`JWT_SECRET` must match the backend because the frontend creates server-side session cookies.

## Worker

Build context: `worker`

Dockerfile: `worker/Dockerfile`

Required environment:

```env
GO_ENV=production
REDIS_URL=redis://:password@redis-host:6379/0
API_BASE_URL=https://api.example.com/api/v1/internal
WORKER_API_KEY=change-me-long-random
WORKER_SERVER_NAME=worker-1
CONCURRENCY=10
CHUNK_SIZE=100
```

Workers are stateless. You can deploy more workers on any VPS as long as they can reach Redis and the backend internal API.

## Coolify Shape

Create one Coolify project, then add:

1. PostgreSQL resource or external PostgreSQL URL.
2. Redis resource or external Redis URL.
3. Backend application from `backend/Dockerfile`.
4. Worker application from `worker/Dockerfile`.
5. Frontend application from `frontend/Dockerfile`.

Use public domains for frontend and backend. Workers do not need a public domain.
