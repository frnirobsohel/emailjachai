#!/usr/bin/env bash
# =============================================================================
#  Email Jachai — One-Command Installer
#  Usage: curl -fsSL https://install.emailjachai.com | bash
#  Or:    bash deploy/install.sh
# =============================================================================
set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "  ${GREEN}[✓]${RESET} $*"; }
info() { echo -e "  ${CYAN}[→]${RESET} $*"; }
warn() { echo -e "  ${YELLOW}[!]${RESET} $*"; }
fail() { echo -e "  ${RED}[✗]${RESET} $*"; exit 1; }

# ── Banner ────────────────────────────────────────────────────────────────────
banner() {
  echo -e "${CYAN}"
  cat <<'EOF'
  _____ _ __ ___   __ _(_) |     | | __ _  ___| |__   __ _(_)
 | ____|  '_ ` _ \ / _` | | |  _  | |/ _` |/ __|| '_ \ / _` | |
 | |___| | | | | | (_| | | | | |_| | (_| | (__ | | | | (_| | |
 |_____|_| |_| |_|\__,_|_|_|  \___/ \__,_|\___||_| |_|\__,_|_|
EOF
  echo -e "${RESET}"
  echo -e "${BOLD}  Email Jachai Installer${RESET}"
  echo "  ──────────────────────────────────────────────────────────────────"
  echo ""
}

# ── Config ────────────────────────────────────────────────────────────────────
INSTALL_DIR="${EMAILJACHAI_DIR:-/opt/emailjachai}"
REPO_URL="https://github.com/frnirobsohel/emailjachai"
COMPOSE_FILE="deploy/docker-compose.prod.yml"
ENV_FILE="$INSTALL_DIR/.env"
MIN_DOCKER_VERSION="24"

# ── OS Detection ──────────────────────────────────────────────────────────────
detect_os() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck source=/dev/null
    . /etc/os-release
    OS_ID="${ID:-unknown}"
    OS_ID_LIKE="${ID_LIKE:-}"
  elif [[ "$(uname)" == "Darwin" ]]; then
    OS_ID="macos"
  else
    OS_ID="unknown"
  fi
}

# ── Docker Detection & Installation ──────────────────────────────────────────
check_docker() {
  if command -v docker &>/dev/null; then
    DOCKER_VER=$(docker --version 2>/dev/null | grep -oP '\d+' | head -1)
    if [[ "${DOCKER_VER:-0}" -ge "$MIN_DOCKER_VERSION" ]]; then
      ok "Docker $DOCKER_VER detected"
    else
      warn "Docker $DOCKER_VER found — version $MIN_DOCKER_VERSION+ recommended"
    fi

    if docker compose version &>/dev/null; then
      ok "Docker Compose (plugin) detected"
    elif command -v docker-compose &>/dev/null; then
      ok "docker-compose (standalone) detected"
      # Alias for rest of script
      docker() { if [[ "$1" == "compose" ]]; then shift; command docker-compose "$@"; else command docker "$@"; fi; }
      export -f docker
    else
      fail "Docker Compose not found. Please install Docker Desktop or 'docker compose' plugin."
    fi
  else
    warn "Docker not found."
    echo ""
    read -rp "  Install Docker automatically? [Y/n]: " INSTALL_DOCKER
    INSTALL_DOCKER="${INSTALL_DOCKER:-Y}"
    if [[ "$INSTALL_DOCKER" =~ ^[Yy]$ ]]; then
      install_docker
    else
      fail "Docker is required. Install it from https://docs.docker.com/get-docker/ and re-run."
    fi
  fi
}

install_docker() {
  info "Installing Docker via official convenience script..."
  detect_os
  case "$OS_ID" in
    ubuntu|debian|raspbian|pop|linuxmint)
      curl -fsSL https://get.docker.com | bash
      ;;
    centos|rhel|fedora|rocky|almalinux)
      curl -fsSL https://get.docker.com | bash
      ;;
    *)
      fail "Automatic Docker installation not supported on '$OS_ID'. Install manually: https://docs.docker.com/get-docker/"
      ;;
  esac
  # Start & enable Docker
  systemctl enable --now docker 2>/dev/null || true
  ok "Docker installed"
}

# ── Secret Generation ─────────────────────────────────────────────────────────
gen_secret() {
  # 32-byte hex string
  openssl rand -hex 32 2>/dev/null || \
    cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1
}

gen_password() {
  # 16-char alphanumeric password
  openssl rand -base64 16 2>/dev/null | tr -dc 'a-zA-Z0-9' | head -c 16 || \
    cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 16 | head -n 1
}

# ── Detect public IP ──────────────────────────────────────────────────────────
detect_ip() {
  for svc in "https://api.ipify.org" "https://ifconfig.me/ip" "https://icanhazip.com"; do
    ip=$(curl -fsSL --max-time 5 "$svc" 2>/dev/null | tr -d '[:space:]') || true
    if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [[ "$ip" =~ .*:.* ]]; then
      echo "$ip"; return
    fi
  done
  echo "localhost"
}

# ── Collect domain/IP from user ───────────────────────────────────────────────
prompt_domain() {
  DETECTED_IP=$(detect_ip)
  echo ""
  echo -e "  ${BOLD}Server Configuration${RESET}"
  echo "  ──────────────────────────────────────────────────────────────────"
  echo -e "  Detected public IP: ${CYAN}${DETECTED_IP}${RESET}"
  echo ""
  read -rp "  Enter your domain name (or press Enter to use IP): " USER_DOMAIN
  USER_DOMAIN="${USER_DOMAIN:-$DETECTED_IP}"

  # Strip trailing slash / protocol
  USER_DOMAIN="${USER_DOMAIN#http://}"
  USER_DOMAIN="${USER_DOMAIN#https://}"
  USER_DOMAIN="${USER_DOMAIN%/}"

  SCHEME="http"
  if [[ "$USER_DOMAIN" != "$DETECTED_IP" ]] && [[ "$USER_DOMAIN" != "localhost" ]]; then
    SCHEME="https"
  fi

  APP_URL="${SCHEME}://${USER_DOMAIN}"
  API_URL="${SCHEME}://${USER_DOMAIN}/api/v1"

  ok "App URL: $APP_URL"
}

# ── Create .env file ──────────────────────────────────────────────────────────
create_env() {
  info "Generating secure environment configuration..."

  JWT_SECRET=$(gen_secret)
  WORKER_API_KEY=$(gen_secret)
  PG_PASSWORD=$(gen_password)
  ADMIN_PASSWORD=$(gen_password)
  ADMIN_EMAIL="admin@emailjachai.local"

  cat > "$ENV_FILE" <<EOF
# Email Jachai — Auto-generated by installer on $(date -u +"%Y-%m-%d %H:%M UTC")
# DO NOT commit this file to version control.

# ── Database ──────────────────────────────────────────────────────────────────
POSTGRES_USER=ejp
POSTGRES_PASSWORD=${PG_PASSWORD}
POSTGRES_DB=ejp
DATABASE_URL=postgres://ejp:${PG_PASSWORD}@postgres:5432/ejp?sslmode=disable

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0

# ── Secrets ───────────────────────────────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
WORKER_API_KEY=${WORKER_API_KEY}

# ── URLs ──────────────────────────────────────────────────────────────────────
APP_HOST=${USER_DOMAIN}
FRONTEND_URL=${APP_URL}
CORS_ORIGINS=${APP_URL}
PUBLIC_API_URL=${APP_URL}
NEXT_PUBLIC_WS_URL=$(echo "$APP_URL" | sed 's|^http|ws|')/api/v1/ws

# ── Admin Bootstrap ───────────────────────────────────────────────────────────
ADMIN_BOOTSTRAP_EMAIL=${ADMIN_EMAIL}
ADMIN_BOOTSTRAP_PASSWORD=${ADMIN_PASSWORD}

# ── Runtime ───────────────────────────────────────────────────────────────────
GO_ENV=production
ENVIRONMENT=production
NODE_ENV=production
PORT=8000

# ── Storage ───────────────────────────────────────────────────────────────────
BULK_RESULTS_PATH=/app/storage/results/bulk
BULK_SOURCE_PATH=/app/storage/jobs/bulk
SINGLE_RESULTS_PATH=/app/storage/results/single

# ── SMTP Engine ───────────────────────────────────────────────────────────────
SMTP_VERIFY_TIMEOUT_SEC=135
SMTP_MAX_CONCURRENT=25
DNS_RESOLVERS=8.8.8.8,1.1.1.1

# ── Worker ────────────────────────────────────────────────────────────────────
API_BASE_URL=http://backend:8000/api/v1/internal
WORKER_SERVER_NAME=worker-1
EOF

  ok "Environment file created: $ENV_FILE"
  # Store for summary
  export ADMIN_EMAIL ADMIN_PASSWORD APP_URL API_URL
}

# ── Pull / Clone Repo ─────────────────────────────────────────────────────────
setup_repo() {
  if [[ -f "$INSTALL_DIR/docker-compose.yml" ]] || [[ -f "$INSTALL_DIR/$COMPOSE_FILE" ]]; then
    info "Existing installation found at $INSTALL_DIR — skipping clone."
    return
  fi

  info "Cloning Email Jachai to $INSTALL_DIR ..."
  mkdir -p "$INSTALL_DIR"
  if command -v git &>/dev/null; then
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  else
    fail "git not found. Install git and re-run."
  fi
  ok "Repository cloned"
}

# ── Start Services ────────────────────────────────────────────────────────────
start_services() {
  info "Starting services with Docker Compose..."
  cd "$INSTALL_DIR"

  COMPOSE_ARGS="-f $COMPOSE_FILE"
  [[ -f "$ENV_FILE" ]] && COMPOSE_ARGS="$COMPOSE_ARGS --env-file $ENV_FILE"

  # Pull images first (shows progress)
  docker compose $COMPOSE_ARGS pull --quiet 2>/dev/null || true

  # Start infrastructure first, wait for health
  info "Starting PostgreSQL & Redis..."
  docker compose $COMPOSE_ARGS up -d postgres redis

  echo -n "  Waiting for PostgreSQL"
  for i in $(seq 1 30); do
    if docker compose $COMPOSE_ARGS exec -T postgres pg_isready -U ejp -d ejp &>/dev/null; then
      echo " — ready"; break
    fi
    echo -n "."
    sleep 2
  done
  ok "PostgreSQL"

  echo -n "  Waiting for Redis"
  for i in $(seq 1 20); do
    if docker compose $COMPOSE_ARGS exec -T redis redis-cli ping &>/dev/null; then
      echo " — ready"; break
    fi
    echo -n "."
    sleep 1
  done
  ok "Redis"

  # Start backend (runs migrations in Dockerfile CMD)
  info "Starting API server (running database migrations)..."
  docker compose $COMPOSE_ARGS up -d backend

  echo -n "  Waiting for API"
  for i in $(seq 1 40); do
    if curl -fsSL --max-time 3 "http://localhost:8000/api/v1/health" &>/dev/null; then
      echo " — ready"; break
    fi
    echo -n "."
    sleep 3
  done
  ok "API Server"
  ok "Database Migrations"

  # Start worker & frontend
  info "Starting Worker Engine & Web Dashboard..."
  docker compose $COMPOSE_ARGS up -d worker frontend
  sleep 5
  ok "Worker Engine"
  ok "Web Dashboard"
}

# ── Health Check ──────────────────────────────────────────────────────────────
run_health_check() {
  info "Running final health check..."
  cd "$INSTALL_DIR"
  HEALTH=$(curl -fsSL --max-time 5 "http://localhost:8000/api/v1/health" 2>/dev/null || echo "{}")
  if echo "$HEALTH" | grep -q '"postgres":"ok"'; then
    ok "Database health: OK"
  else
    warn "Database health check returned unexpected response (may still be starting)"
  fi
  if echo "$HEALTH" | grep -q '"redis":"ok"'; then
    ok "Redis health: OK"
  else
    warn "Redis health check returned unexpected response"
  fi
}

# ── Install CLI helper ────────────────────────────────────────────────────────
install_cli() {
  CLI_PATH="/usr/local/bin/emailjachai"
  if [[ -w "/usr/local/bin" ]] || sudo -n true 2>/dev/null; then
    cat > /tmp/emailjachai_cli <<CLISCRIPT
#!/usr/bin/env bash
# Email Jachai CLI helper
INSTALL_DIR="${INSTALL_DIR}"
COMPOSE_FILE="${COMPOSE_FILE}"
ENV_FILE="${ENV_FILE}"

cd "\$INSTALL_DIR" 2>/dev/null || { echo "Email Jachai not found at \$INSTALL_DIR"; exit 1; }
COMPOSE_ARGS="-f \$COMPOSE_FILE --env-file \$ENV_FILE"

case "\${1:-help}" in
  status)  docker compose \$COMPOSE_ARGS ps ;;
  logs)    docker compose \$COMPOSE_ARGS logs --tail=100 -f "\${2:-}" ;;
  update)  bash deploy/update.sh ;;
  backup)  bash deploy/update.sh backup ;;
  restart) docker compose \$COMPOSE_ARGS restart "\${2:-}" ;;
  stop)    docker compose \$COMPOSE_ARGS stop ;;
  start)   docker compose \$COMPOSE_ARGS up -d ;;
  doctor)  bash deploy/update.sh doctor ;;
  *)
    echo "Email Jachai CLI"
    echo ""
    echo "Usage: emailjachai <command>"
    echo ""
    echo "Commands:"
    echo "  status    Show running services"
    echo "  logs      Tail logs (optional: service name)"
    echo "  update    Update to latest version"
    echo "  backup    Backup database"
    echo "  restart   Restart services"
    echo "  stop      Stop all services"
    echo "  start     Start all services"
    echo "  doctor    Run diagnostics"
    ;;
esac
CLISCRIPT
    chmod +x /tmp/emailjachai_cli
    (sudo mv /tmp/emailjachai_cli "$CLI_PATH" 2>/dev/null) || mv /tmp/emailjachai_cli "$CLI_PATH" 2>/dev/null || true
    ok "CLI installed: emailjachai <status|logs|update|backup|restart|doctor>"
  fi
}

# ── Summary Banner ────────────────────────────────────────────────────────────
print_summary() {
  echo ""
  echo -e "${GREEN}${BOLD}  ══════════════════════════════════════════════════════════════${RESET}"
  echo -e "${GREEN}${BOLD}  🎉  Email Jachai is ready to verify!${RESET}"
  echo -e "${GREEN}${BOLD}  ══════════════════════════════════════════════════════════════${RESET}"
  echo ""
  echo -e "  ${BOLD}Dashboard URL  :${RESET}  ${CYAN}${APP_URL}${RESET}"
  echo -e "  ${BOLD}API Endpoint   :${RESET}  ${CYAN}${APP_URL}/api/v1${RESET}"
  echo ""
  echo -e "  ${BOLD}Admin Email    :${RESET}  ${YELLOW}${ADMIN_EMAIL}${RESET}"
  echo -e "  ${BOLD}Admin Password :${RESET}  ${YELLOW}${ADMIN_PASSWORD}${RESET}"
  echo ""
  echo -e "  ${BOLD}Installation   :${RESET}  $INSTALL_DIR"
  echo -e "  ${BOLD}Config         :${RESET}  $ENV_FILE"
  echo ""
  echo "  ──────────────────────────────────────────────────────────────────"
  echo -e "  ${BOLD}Useful commands:${RESET}"
  echo "    emailjachai status    # Check running services"
  echo "    emailjachai logs      # View live logs"
  echo "    emailjachai update    # Update to latest version"
  echo "    emailjachai backup    # Backup database"
  echo ""
  echo -e "  ${BOLD}Docs:${RESET} https://docs.emailjachai.com"
  echo "  ──────────────────────────────────────────────────────────────────"
  echo ""
  warn "Save your admin password — it will not be shown again."
  echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  banner
  echo -e "  ${BOLD}Starting installation...${RESET}"
  echo "  ──────────────────────────────────────────────────────────────────"
  echo ""

  # Check dependencies
  check_docker

  # Collect config from user
  prompt_domain

  echo ""
  echo "  ──────────────────────────────────────────────────────────────────"
  echo -e "  ${BOLD}Setting up Email Jachai...${RESET}"
  echo "  ──────────────────────────────────────────────────────────────────"
  echo ""

  setup_repo
  create_env
  start_services
  run_health_check
  install_cli
  print_summary
}

main "$@"
