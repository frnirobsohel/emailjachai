#!/usr/bin/env bash
# =============================================================================
#  Email Jachai — Enterprise Upgrade Script
#  Scales an existing single-VPS install to an enterprise cluster.
#
#  Usage:
#    bash deploy/upgrade.sh --workers 5
#    bash deploy/upgrade.sh --workers 10 --api-replicas 3
#    bash deploy/upgrade.sh --external-redis redis://redis.example.com:6379/0
#    bash deploy/upgrade.sh --external-db postgres://user:pass@db.example.com/ejp
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "  ${GREEN}[✓]${RESET} $*"; }
info() { echo -e "  ${CYAN}[→]${RESET} $*"; }
warn() { echo -e "  ${YELLOW}[!]${RESET} $*"; }
fail() { echo -e "  ${RED}[✗]${RESET} $*"; exit 1; }

INSTALL_DIR="${EMAILJACHAI_DIR:-/opt/emailjachai}"
COMPOSE_FILE="deploy/docker-compose.prod.yml"
ENV_FILE="$INSTALL_DIR/.env"

# ── Argument parsing ──────────────────────────────────────────────────────────
WORKERS=1
API_REPLICAS=1
EXTERNAL_REDIS=""
EXTERNAL_DB=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workers)        WORKERS="$2";        shift 2 ;;
    --api-replicas)   API_REPLICAS="$2";   shift 2 ;;
    --external-redis) EXTERNAL_REDIS="$2"; shift 2 ;;
    --external-db)    EXTERNAL_DB="$2";    shift 2 ;;
    --help|-h)
      echo "Usage: bash deploy/upgrade.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --workers N              Number of local worker replicas (default: 1)"
      echo "  --api-replicas N         Number of API replicas (default: 1)"
      echo "  --external-redis URL     Use an external Redis (e.g. Redis Cloud)"
      echo "  --external-db URL        Use an external PostgreSQL (e.g. Supabase, RDS)"
      echo ""
      echo "Examples:"
      echo "  bash deploy/upgrade.sh --workers 5"
      echo "  bash deploy/upgrade.sh --workers 10 --api-replicas 3"
      echo "  bash deploy/upgrade.sh --external-redis redis://user:pass@redis.example.com:6379/0"
      exit 0
      ;;
    *)
      fail "Unknown argument: $1. Use --help for usage."
      ;;
  esac
done

# ── Main ──────────────────────────────────────────────────────────────────────
cd "$INSTALL_DIR" 2>/dev/null || fail "Email Jachai not found at $INSTALL_DIR."

[[ -f "$ENV_FILE" ]] || fail ".env not found at $ENV_FILE. Run install.sh first."
set -o allexport && source "$ENV_FILE" && set +o allexport

COMPOSE_ARGS="-f $COMPOSE_FILE --env-file $ENV_FILE"

echo ""
echo -e "  ${BOLD}Email Jachai — Enterprise Upgrade${RESET}"
echo "  ──────────────────────────────────────────────────────────────────"
echo ""
echo -e "  Workers     : ${CYAN}${WORKERS}${RESET}"
echo -e "  API replicas: ${CYAN}${API_REPLICAS}${RESET}"
[[ -n "$EXTERNAL_REDIS" ]] && echo -e "  Redis       : ${CYAN}external${RESET}"
[[ -n "$EXTERNAL_DB" ]]    && echo -e "  PostgreSQL  : ${CYAN}external${RESET}"
echo ""

# ── Patch .env if external services are specified ─────────────────────────────
if [[ -n "$EXTERNAL_REDIS" ]]; then
  info "Patching .env: REDIS_URL → external Redis"
  # Backup .env
  cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%s)"
  sed -i "s|^REDIS_URL=.*|REDIS_URL=${EXTERNAL_REDIS}|" "$ENV_FILE"
  ok "REDIS_URL updated"
fi

if [[ -n "$EXTERNAL_DB" ]]; then
  info "Patching .env: DATABASE_URL → external PostgreSQL"
  [[ -z "$EXTERNAL_REDIS" ]] && cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%s)" || true
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${EXTERNAL_DB}|" "$ENV_FILE"
  ok "DATABASE_URL updated"
fi

# ── Set SHARED_STORAGE if multiple API replicas ───────────────────────────────
if [[ "$API_REPLICAS" -gt 1 ]]; then
  warn "Multiple API replicas require a shared volume for bulk CSV files."
  warn "Ensure BULK_SOURCE_PATH and BULK_RESULTS_PATH are on a shared NFS/EFS mount."
  sed -i "s|^#.*SHARED_STORAGE=.*|SHARED_STORAGE=required|" "$ENV_FILE" || \
    echo "SHARED_STORAGE=required" >> "$ENV_FILE"
  ok "SHARED_STORAGE=required set in .env"
fi

# ── Scale services ────────────────────────────────────────────────────────────
info "Scaling API to $API_REPLICAS replica(s)..."
docker compose $COMPOSE_ARGS up -d --scale backend="$API_REPLICAS" --no-recreate backend
ok "API scaled to $API_REPLICAS"

info "Scaling workers to $WORKERS replica(s)..."
docker compose $COMPOSE_ARGS up -d --scale worker="$WORKERS" --no-recreate worker
ok "Workers scaled to $WORKERS"

# ── Verify ────────────────────────────────────────────────────────────────────
sleep 5
info "Verifying services..."
RUNNING=$(docker compose $COMPOSE_ARGS ps --services --filter "status=running" 2>/dev/null || echo "")
echo "$RUNNING" | grep -q "backend" && ok "API: running" || warn "API: not all replicas running"
echo "$RUNNING" | grep -q "worker"  && ok "Worker: running" || warn "Worker: not all replicas running"

HEALTH=$(curl -fsSL --max-time 5 "http://localhost:8000/api/v1/health" 2>/dev/null || echo "{}")
echo "$HEALTH" | grep -q '"postgres":"ok"' && ok "Database: OK" || warn "Database: check connection"
echo "$HEALTH" | grep -q '"redis":"ok"'    && ok "Redis: OK"    || warn "Redis: check connection"

echo ""
ok "Enterprise upgrade complete!"
echo ""
echo -e "  ${BOLD}Next steps for full enterprise scale:${RESET}"
echo "    1. Add more workers on remote servers:"
echo "       REDIS_URL=<master-redis>  WORKER_API_KEY=<key>  docker compose up -d worker"
echo "    2. Place a load balancer (Caddy/NGINX) in front of $API_REPLICAS API replicas"
echo "    3. Monitor with: emailjachai status"
echo ""
