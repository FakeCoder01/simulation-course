FROM docker.io/ocaml/opam:debian-ocaml-5.1
WORKDIR /app
COPY --chown=opam:opam dune-project lab08-backend.opam ./
COPY --chown=opam:opam src ./src

ENV OPAMSOLVERTIMEOUT=300

RUN sudo apt-get update && sudo apt-get install -y \
    pkg-config \
    libev-dev \
    libssl-dev \
    && sudo rm -rf /var/lib/apt/lists/*
RUN opam install . --deps-only -y

RUN opam exec -- dune build --profile release
EXPOSE 8080
CMD ["./_build/default/src/main.exe"]
