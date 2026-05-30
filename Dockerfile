# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 SourceBox LLC

# ── Stage 1: Build the Rust binary ──
FROM rust:1.88-slim-bookworm AS builder

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Pre-cache deps before copying src/ so changes to source don't invalidate
# the dependency layer.
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src \
    && echo 'fn main() {}' > src/main.rs \
    && cargo build --release \
    && rm -rf src target/release/deps/searchbox* target/release/searchbox*

# rust-embed bakes templates/ and static/ into the binary at build time,
# so both dirs need to exist when `cargo build --release` runs.
COPY src/ src/
COPY schema.sql ./
COPY templates/ templates/
COPY static/ static/
RUN touch src/main.rs && cargo build --release


# ── Stage 2: Runtime ──
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && echo "deb [trusted=yes] https://apt.fury.io/meilisearch/ /" \
       > /etc/apt/sources.list.d/fury.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends meilisearch \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Single-binary runtime: the searchbox executable already contains every
# template and every byte of static/ (rust-embed). We ship just the binary
# plus the Meilisearch sidecar that was apt-installed above.
COPY --from=builder /build/target/release/searchbox /usr/local/bin/searchbox
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENV SEARCHBOX_HOST=0.0.0.0 \
    SEARCHBOX_PORT=8080 \
    SEARCHBOX_DB_DIR=/app/instance \
    SEARCHBOX_BASE_DIR=/app \
    MEILI_PORT=7700 \
    MEILI_MASTER_KEY=aSampleMasterKey \
    MEILI_DB_PATH=/app/meili_data

EXPOSE 8080 7700

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fs http://localhost:8080/api/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
