FROM ocaml/opam:debian-12

WORKDIR /app
USER opam

COPY --chown=opam:opam backend /app/backend
COPY --chown=opam:opam static /app/static

WORKDIR /app/backend
RUN opam install -y dune dream \
  && opam exec -- dune build --release

EXPOSE 8080

WORKDIR /app
CMD ["opam", "exec", "--", "/app/backend/_build/default/server.exe"]
