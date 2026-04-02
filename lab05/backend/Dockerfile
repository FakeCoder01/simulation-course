FROM golang:1.22-alpine AS builder
WORKDIR /build
COPY go.mod .
COPY main.go .
COPY lcg.go .
RUN go build -o lab5 .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /build/lab5 .
EXPOSE 8080
CMD ["./lab5"]
