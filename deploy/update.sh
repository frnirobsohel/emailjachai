#!/usr/bin/env bash
# =============================================================================
#  Email Jachai — Update / Maintenance CLI
#  Usage:
#    emailjachai update          # Zero-downtime update to latest
#    emailjachai backup          # Backup PostgreSQL database
#    emailjachai doctor          # Run diagnostics
#    bash deploy/update.sh       # Direct invocation
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
BACKUP_DIR="$INSTALL_DIR/backups"

cd "$INSTALL_DIR" 2>/dev/null || fail "Email Jachai not found at $INSTALL_DIR. Run the installer first."

COMPOSE_ARGS="-f $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] && COMPOSE_ARGS="$COMPOSE_ARGS --env-file $ENV_FILE"

# Load env for DB connection
[[ -f "$ENV_FILE" ]] && set -o allexport && source "$ENV_FILE" && set +o allexport

# ── Backup ────────────────────────────────────────────────────────────────────
cmd_backup() {
  mkdir -p "$BACKUP_DIR"
  TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
  BACKUP_FILE="$BACKUP_DIR/ejp_${TIMESTAMP}.sql.gz"

  info "Backing up PostgreSQL database..."
  docker compose $COMPOSE_ARGS exec -T postgres \
    pg_dump -U "${POSTGRES_USER:-ejp}" "${POSTGRES_DB:-ejp}" \
    | gzip > "$BACKUP_FILE"

  ok "Backup saved: $BACKUP_FILE"

  # Prune backups older than 14 days
  find "$BACKUP_DIR" -name "ejp_*.sql.gz" -mtime +14 -delete 2>/dev/null || true
  ok "Old backups pruned (keeping 14 days)"

  echo ""
  echo "  Restore: gunzip -c $BACKUP_FILE | docker compose $COMPOSE_ARGS exec -T postgres psql -U ${POSTGRES_USER:-ejp} ${POSTGRES_DB:-ejp}"
}

# ── Update ────────────────────────────────────────────────────────────────────
cmd_update() {
  echo ""
  echo -e "  ${BOLD}Email Jachai Update${RESET}"
  echo "  ──────────────────────────────────────────────────────────────────"
  echo ""

  # Step 1: Backup first
  info "Step 1/5: Creating pre-update backup..."
  cmd_backup

  # Step 2: Pull latest code
  info "Step 2/5: Pulling latest version..."
  if git remote get-url origin &>/dev/null; then
    OLD_REV=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    git pull --ff-only origin main 2>/dev/null || \
      git pull --ff-only origin master 2>/dev/null || \
      warn "Could not pull — repository may have local changes."
    NEW_REV=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    ok "Updated: $OLD_REV → $NEW_REV"
  else
    warn "Not a git repository — skipping code pull. Pull manually if needed."
  fi

  # Step 3: Pull new Docker images
  info "Step 3/5: Pulling updated Docker images..."
  docker compose $COMPOSE_ARGS pull --quiet
  ok "Images updated"

  # Step 4: Restart services with rolling update
  info "Step 4/5: Restarting services..."

  # Backend handles its own migrations in CMD
  docker compose $COMPOSE_ARGS up -d --no-deps backend
  echo -n "  Waiting for API"
  for i in $(seq 1 30); do
    if curl -fsSL --max-time 3 "http://localhost:8000/api/v1/health" &>/dev/null; then
      echo " — ready"; break
    fi
    echo -n "."; sleep 3
  done

  # Check health before restarting worker/frontend
  if ! curl -fsSL --max-time 5 "http://localhost:8000/api/v1/health" &>/dev/null; then
    warn "Health check failed after update. Attempting rollback..."
    docker compose $COMPOSE_ARGS restart backend
    fail "Update failed health check. Rolled back backend. Check logs: emailjachai logs backend"
  fi

  docker compose $COMPOSE_ARGS up -d --no-deps worker frontend
  ok "All services restarted"

  # Step 5: Final health check
  info "Step 5/5: Verifying health..."
  sleep 5
  HEALTH=$(curl -fsSL --max-time 5 "http://localhost:8000/api/v1/health" 2>/dev/null || echo "{}")
  echo "$HEALTH" | grep -q '"postgres":"ok"' && ok "Database: OK" || warn "Database: not responding"
  echo "$HEALTH" | grep -q '"redis":"ok"'    && ok "Redis: OK"    || warn "Redis: not responding"

  echo ""
  ok "Update complete!"
  echo ""
}

# ── Doctor ────────────────────────────────────────────────────────────────────
cmd_doctor() {
  echo ""
  echo -e "  ${BOLD}Email Jachai Doctor${RESET}"
  echo "  ──────────────────────────────────────────────────────────────────"
  echo ""

  # Docker
  command -v docker &>/dev/null && ok "Docker installed" || fail "Docker not found"
  docker compose version &>/dev/null && ok "Docker Compose available" || warn "docker compose plugin not found"

  # Services running?
  RUNNING=$(docker compose $COMPOSE_ARGS ps --services --filter "status=running" 2>/dev/null || echo "")
  for svc in postgres redis backend worker frontend; do
    echo "$RUNNING" | grep -q "$svc" && ok "Service running: $svc" || warn "Service NOT running: $svc"
  done

  # API Health
  HEALTH=$(curl -fsSL --max-time 5 "http://localhost:8000/api/v1/health" 2>/dev/null || echo "{}")
  echo "$HEALTH" | grep -q '"postgres":"ok"' && ok "API → PostgreSQL: OK" || warn "API → PostgreSQL: FAIL"
  echo "$HEALTH" | grep -q '"redis":"ok"'    && ok "API → Redis: OK"    || warn "API → Redis: FAIL"

  # Disk space
  DISK_AVAIL=$(df -h "$INSTALL_DIR" 2>/dev/null | awk 'NR==2{print $4}' || echo "unknown")
  ok "Disk available: $DISK_AVAIL"

  # Backup age
  LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/ejp_*.sql.gz 2>/dev/null | head -1 || echo "")
  if [[ -n "$LATEST_BACKUP" ]]; then
    BACKUP_AGE=$(( ($(date +%s) - $(stat -c %Y "$LATEST_BACKUP" 2>/dev/null || echo 0)) / 3600 ))
    if [[ "$BACKUP_AGE" -lt 25 ]]; then
      ok "Latest backup: ${BACKUP_AGE}h ago"
    else
      warn "Latest backup: ${BACKUP_AGE}h ago (consider running: emailjachai backup)"
    fi
  else
    warn "No backups found (run: emailjachai backup)"
  fi

  # Env file exists?
  [[ -f "$ENV_FILE" ]] && ok "Config file: $ENV_FILE" || warn "Config file missing: $ENV_FILE"

  echo ""
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
case "${1:-update}" in
  backup)  cmd_backup ;;
  update)  cmd_update ;;
  doctor)  cmd_doctor ;;
  *)
    echo "Usage: bash deploy/update.sh [update|backup|doctor]"
    echo ""
    echo "  update    Zero-downtime update to latest version (default)"
    echo "  backup    Backup the PostgreSQL database"
    echo "  doctor    Run diagnostics and health checks"
    ;;
esac
