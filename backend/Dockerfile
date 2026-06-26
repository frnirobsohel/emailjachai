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
RUN apk add --no-cache ca-certificates tzdata postgresql-client

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/api .

# Copy migrations folder for production
COPY ./migrations ./migrations

# Create directory for local uploads/storage (if used)
RUN mkdir -p /app/storage

EXPOSE 8000

# By default, run idempotent SQL migrations and then start the API.
CMD sh -c "for f in ./migrations/*.sql; do echo \"Running migration $f\"; psql \"$DATABASE_URL\" -v ON_ERROR_STOP=1 -f \"$f\"; done && ./api"
