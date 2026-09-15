# Email Jachai — Enterprise Scaling & High Throughput Guide

This guide explains how to scale Email Jachai from a single server to handle tens of millions of email verifications per day.

---

## 1. Multi-Worker Horizontal Scaling

Because Email Jachai uses Redis-backed Asynq queues with distributed Job Control, workers are completely stateless and can scale horizontally across multiple VPS nodes or containers.

### Scaling on a Single Host:
```bash
docker compose -f deploy/docker-compose.prod.yml up -d --scale worker=8
```

### Scaling Across Multiple VPS Nodes:
1. Run PostgreSQL and Redis on dedicated managed instances (or central host).
2. On remote worker nodes, run only the worker container with the central `REDIS_URL` and `API_BASE_URL`.
3. Set a distinct `WORKER_SERVER_NAME` for each worker (e.g., `worker-nyc-1`, `worker-fra-2`) so they appear individually in the Admin Dashboard.

---

## 2. Multi-IP Egress Pool

Large ESPs (Gmail, Microsoft 365, Yahoo, etc.) enforce strict IP-level rate limits. When verifying high volumes, single-IP servers will encounter `421 Try again later` or greylisting delays.

Email Jachai supports native Multi-IP Egress Pools in the worker engine.

### Configuration:
Assign multiple public IPs to your worker host interface, then configure `.env`:

```env
EGRESS_IPS=198.51.100.10,198.51.100.11,198.51.100.12,198.51.100.13
SMTP_CHUNK_CONCURRENCY=100
```

### How the Egress Pool Works:
- **Round-Robin Rotation**: Probes cycle across each configured egress IP to distribute outbound SMTP connections evenly.
- **Per-IP Cooldown**: If one egress IP receives a 421 greylist or connection throttle from a destination, that specific IP is put into a short cooldown (e.g. 15–30s) while the other IPs continue probing.
- **Zero Overhead**: If `EGRESS_IPS` is empty, workers fall back to the operating system's default network route.

---

## 3. Prometheus & Grafana Monitoring

Email Jachai exposes standard Prometheus metrics out of the box.

### Endpoints:
- `/metrics`
- `/api/v1/metrics`

### Metrics Exported:
| Metric | Type | Description |
|---|---|---|
| `ejp_db_online` | Gauge | PostgreSQL database connectivity (1 = online, 0 = offline) |
| `ejp_db_connections{state="open\|in_use\|idle"}` | Gauge | Active, in-use, and idle database connections |
| `ejp_redis_online` | Gauge | Redis connectivity status |
| `ejp_redis_latency_ms` | Gauge | Round-trip Redis ping latency |
| `ejp_queue_tasks{state="active\|pending\|retry\|completed"}` | Gauge | Real-time queue volume across critical, default, and low queues |

### Prometheus Scrape Config Example:
```yaml
scrape_configs:
  - job_name: 'emailjachai'
    scrape_interval: 15s
    static_configs:
      - targets: ['backend:8000']
```

---

## 4. 1-Command Enterprise Upgrade

To reconfigure an existing installation into high-throughput enterprise mode, run:

```bash
./deploy/upgrade.sh
```

The script will prompt for worker replica counts, memory limits, and egress IPs, and automatically apply the changes without data loss.
