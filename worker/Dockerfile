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
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o worker cmd/worker/main.go

# Production Stage
FROM alpine:latest

# Install runtime dependencies (ca-certificates are critical for DNS/SMTP lookup verification)
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/worker .

# Create non-root system user and group, and change ownership of /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup /app

USER appuser

# Process-level check — worker has no HTTP server; Admin → Servers shows heartbeats.
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD pidof worker || exit 1

# Run binary
CMD ["./worker"]
