FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod .
COPY main.go .
RUN go build -o lab1 .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/lab1 .
EXPOSE 8080
CMD ["./lab1"]
