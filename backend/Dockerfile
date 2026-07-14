FROM golang:1.22-alpine AS builder
WORKDIR /app
# Pin dependencies from go.mod/go.sum — never `go mod tidy` at build time,
# it can silently change dependency versions.
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /app/server ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/server /app/server
# Run as non-root; pre-create storage dirs so named volumes inherit ownership
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /app/storage/documents /app/storage/avatars \
    && chown -R app:app /app
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
CMD ["/app/server"]
