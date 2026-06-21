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
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/api .

# Create directory for local uploads/storage (if used)
RUN mkdir -p /app/storage

EXPOSE 8000

# Run binary
CMD ["./api"]
