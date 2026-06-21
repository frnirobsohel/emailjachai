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

# Run binary
CMD ["./worker"]
