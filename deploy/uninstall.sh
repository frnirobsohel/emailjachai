#!/usr/bin/env bash
# =============================================================================
#  Email Jachai — Uninstaller
#  Usage: bash deploy/uninstall.sh
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "  ${GREEN}[✓]${RESET} $*"; }
info() { echo -e "  ${CYAN}[→]${RESET} $*"; }
warn() { echo -e "  ${YELLOW}[!]${RESET} $*"; }

INSTALL_DIR="${EMAILJACHAI_DIR:-/opt/emailjachai}"
COMPOSE_FILE="deploy/docker-compose.prod.yml"
ENV_FILE="$INSTALL_DIR/.env"

echo ""
echo -e "  ${BOLD}${RED}Email Jachai Uninstaller${RESET}"
echo "  ──────────────────────────────────────────────────────────────────"
echo ""
warn "This will stop all services and remove all containers."
warn "Your database data will be preserved in Docker volumes unless you choose to delete them."
echo ""
read -rp "  Are you sure you want to uninstall Email Jachai? [y/N]: " CONFIRM
[[ "${CONFIRM:-N}" =~ ^[Yy]$ ]] || { echo "  Cancelled."; exit 0; }

cd "$INSTALL_DIR" 2>/dev/null || { warn "Install dir not found: $INSTALL_DIR"; exit 0; }

COMPOSE_ARGS="-f $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] && COMPOSE_ARGS="$COMPOSE_ARGS --env-file $ENV_FILE"

info "Creating final database backup before uninstall..."
BACKUP_DIR="$INSTALL_DIR/backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/ejp_final_${TIMESTAMP}.sql.gz"
docker compose $COMPOSE_ARGS exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-ejp}" "${POSTGRES_DB:-ejp}" \
  2>/dev/null | gzip > "$BACKUP_FILE" && ok "Final backup: $BACKUP_FILE" || warn "Backup failed (services may already be stopped)"

info "Stopping and removing containers..."
docker compose $COMPOSE_ARGS down --remove-orphans
ok "Containers removed"

echo ""
read -rp "  Delete Docker volumes (ALL data including database)? [y/N]: " DEL_VOLUMES
if [[ "${DEL_VOLUMES:-N}" =~ ^[Yy]$ ]]; then
  docker compose $COMPOSE_ARGS down -v 2>/dev/null || true
  ok "Volumes deleted"
else
  ok "Volumes preserved (data is safe)"
fi

# Remove CLI
if [[ -f "/usr/local/bin/emailjachai" ]]; then
  (sudo rm -f /usr/local/bin/emailjachai 2>/dev/null) || rm -f /usr/local/bin/emailjachai 2>/dev/null || true
  ok "CLI removed"
fi

echo ""
ok "Email Jachai has been uninstalled."
[[ -f "$BACKUP_FILE" ]] && echo -e "  Your final backup is at: ${CYAN}$BACKUP_FILE${RESET}"
echo ""
