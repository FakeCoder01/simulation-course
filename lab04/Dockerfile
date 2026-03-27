FROM rust:1.76-alpine as builder
WORKDIR /usr/src/app

RUN apk add --no-cache musl-dev

COPY Cargo.toml ./
COPY src ./src

RUN cargo build --release

FROM alpine:latest

COPY --from=builder /usr/src/app/target/release/stochastic_sim /usr/local/bin/stochastic_sim

CMD ["stochastic_sim"]
