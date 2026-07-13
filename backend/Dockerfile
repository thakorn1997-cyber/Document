FROM golang:1.22-alpine AS builder
RUN apk add --no-cache git
WORKDIR /app
COPY go.mod ./
COPY go.sum* ./
COPY . .
RUN go mod tidy
RUN CGO_ENABLED=0 go build -o /app/server ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/server /app/server
EXPOSE 8080
CMD ["/app/server"]
