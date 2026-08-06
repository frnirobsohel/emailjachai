# Build Stage
FROM golang:alpine AS builder

# Install system dependencies
RUN apk add --no-cache git ca-certificates

WORKDIR /app

# Copy dependency manifests
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build statically linked binary with optimized size flags
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o api cmd/api/main.go

# Production Stage
FROM alpine:latest

# Install runtime dependencies (ca-certificates are critical for outbound HTTPS calls)
# postgresql-client is used to run the idempotent SQL migrations at startup.
# wget is used by HEALTHCHECK against /api/v1/health.
RUN apk add --no-cache ca-certificates tzdata postgresql-client wget

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/api .

# Copy migrations folder for production
COPY ./migrations ./migrations

# Create directory for local uploads/storage (if used)
RUN mkdir -p /app/storage

# Create non-root system user and group, and change ownership of /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8000/api/v1/health || exit 1

# By default, wait for PostgreSQL to be ready, run idempotent SQL migrations, and then start the API.
CMD ["sh", "-c", "echo 'Waiting for database...' && i=0; while [ $i -lt 15 ]; do pg_isready -d \"$DATABASE_URL\" -t 1 && break; i=$((i+1)); echo 'Database not ready, sleeping 2s...'; sleep 2; done && for f in ./migrations/*.sql; do echo \"Running migration $f\"; psql \"$DATABASE_URL\" -q -v ON_ERROR_STOP=1 -f \"$f\"; done && ./api"]

