# ── Stage 1: Compile C++ document extractor ──
# Must use bookworm (same glibc as runtime) for binary compatibility
FROM debian:bookworm AS cpp-builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    pkg-config \
    libmupdf-dev \
    libmujs-dev \
    libgumbo-dev \
    libjbig2dec-dev \
    libharfbuzz-dev \
    libfreetype-dev \
    libopenjp2-7-dev \
    libjpeg-dev \
    zlib1g-dev \
    libzip-dev \
    libpugixml-dev \
    libzim-dev \
    librsvg2-dev \
    libcairo2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY extractor/CMakeLists.txt .
COPY extractor/src/ src/
RUN mkdir out && cd out && cmake .. && make -j"$(nproc)"


# ── Stage 2: Runtime image ──
FROM ghcr.io/astral-sh/uv:python3.10-bookworm-slim

# System dependencies for Pillow, PDF processing, health checks,
# Meilisearch, and C++ extractor runtime libraries
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    libffi-dev \
    libjpeg-dev \
    libpng-dev \
    zlib1g-dev \
    curl \
    libmupdf-dev \
    libmujs-dev \
    libgumbo-dev \
    libzip-dev \
    libpugixml-dev \
    libharfbuzz-dev \
    libfreetype-dev \
    libopenjp2-7-dev \
    libjbig2dec-dev \
    libzim8 \
    librsvg2-2 \
    libcairo2 \
    libcairo-gobject2 \
    && echo "deb [trusted=yes] https://apt.fury.io/meilisearch/ /" \
       > /etc/apt/sources.list.d/fury.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends meilisearch \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled C++ extractor binary from builder stage
COPY --from=cpp-builder /build/out/doc_extractor /usr/local/bin/doc_extractor

WORKDIR /app

# Copy dependency files first for layer caching
COPY pyproject.toml uv.lock .python-version ./

# Install dependencies into .venv (without the project itself)
RUN uv sync --frozen --no-install-project --no-dev

# Copy application source
COPY app.py config.py models.py ./
COPY routes/ routes/
COPY services/ services/
COPY utils/ utils/
COPY static/ static/
COPY templates/ templates/

# Copy entrypoint
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Create runtime directories
RUN mkdir -p vault static/thumbnails instance meili_data

# Default environment
ENV FLASK_SECRET_KEY=change-me-in-production \
    MEILI_HOST=http://localhost \
    MEILI_PORT=7700 \
    MEILI_MASTER_KEY=aSampleMasterKey \
    MEILI_AUTO_START=false \
    MEILI_DB_PATH=/app/meili_data \
    SEARCHBOX_HOST=0.0.0.0 \
    SEARCHBOX_PORT=5000 \
    SEARCHBOX_DB_DIR=/app/instance \
    PATH="/app/.venv/bin:$PATH"

EXPOSE 5000

ENTRYPOINT ["./entrypoint.sh"]
