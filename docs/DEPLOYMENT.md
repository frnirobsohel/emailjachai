# Email Jachai — Deployment Guide

Email Jachai is designed to run seamlessly from a single $5/month VPS for open-source users to a multi-node Kubernetes or Dokploy cluster for enterprise teams.

---

## 1. Quick Start: 1-Command Installer (Recommended for VPS)

On any fresh Ubuntu/Debian/Rocky Linux server:

```bash
curl -fsSL https://raw.githubusercontent.com/frnirobsohel/emailjachai/main/deploy/install.sh | bash
```

### What the installer handles automatically:
- Checks CPU, RAM, disk space, and Docker engine installation.
- Tests outbound port 25 connectivity (essential for SMTP mailbox probes).
- Prompts for your domain name and admin credentials.
- Generates cryptographically strong secrets (`JWT_SECRET`, `WORKER_API_KEY`, PostgreSQL passwords).
- Generates `.env` and boots Caddy, PostgreSQL, Redis, API Backend, Worker, and Next.js Frontend.
- Automatically provisions free SSL certificates via Let's Encrypt / ZeroSSL.

---

## 2. Deploying via Dokploy / Coolify

For users who manage applications with Dokploy, Coolify, or Portainer:

1. **Create a new Stack / Compose Application**.
2. Point Dokploy to `deploy/docker-compose.dokploy.yml`.
3. Set your environment variables in the Dokploy UI (refer to `.env.example`).
4. Set domain routing:
   - Route `your-domain.com` → `frontend:3000`
   - Route `api.your-domain.com` or `your-domain.com/api` → `backend:8000`
5. Click **Deploy**.

---

## 3. Manual Production Deployment (Docker Compose)

```bash
# 1. Clone repository
git clone https://github.com/frnirobsohel/emailjachai.git /opt/emailjachai
cd /opt/emailjachai

# 2. Prepare environment file
cp .env.example .env
nano .env   # Fill in APP_HOST, passwords, secrets, etc.

# 3. Launch stack
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

---

## 4. Maintenance, Upgrades & Diagnostics

Email Jachai provides unified operational scripts in `deploy/`:

### Check System Health (Doctor):
```bash
./deploy/update.sh --doctor
```
Inspects database connectivity, Redis ping latency, Asynq queue status, and container uptime.

### Zero-Downtime Update:
```bash
./deploy/update.sh
```
Pulls the latest git commits, runs database migrations safely, rebuilds images, and updates containers.

### Upgrade to Enterprise Scale:
```bash
./deploy/upgrade.sh
```
Guides you through scaling worker replicas, multi-replica API backends, and multi-IP egress pools.

### Clean Removal:
```bash
./deploy/uninstall.sh
```
Provides options to keep or purge database data and completely remove the stack.
