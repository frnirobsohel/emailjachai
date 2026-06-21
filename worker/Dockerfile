# Build Stage
FROM golang:1.22-alpine AS builder

# Install certificates and git
RUN apk add --no-cache git ca-certificates

WORKDIR /app

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build statically linked release binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o worker cmd/worker/main.go

# Final Run Stage
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy binary from build stage
COPY --from=builder /app/worker .

# Run the worker service
CMD ["./worker"]
