#!/bin/bash
set -e

MEILI_MASTER_KEY="${MEILI_MASTER_KEY:-aSampleMasterKey}"
MEILI_PORT="${MEILI_PORT:-7700}"
MEILI_DB_PATH="${MEILI_DB_PATH:-/app/meili_data}"

# Start Meilisearch in the background
echo "Starting Meilisearch..."
meilisearch \
    --http-addr "0.0.0.0:${MEILI_PORT}" \
    --master-key "${MEILI_MASTER_KEY}" \
    --db-path "${MEILI_DB_PATH}" \
    --no-analytics &

MEILI_PID=$!

# Wait for Meilisearch to be healthy
echo "Waiting for Meilisearch to be ready..."
for i in $(seq 1 30); do
    if curl -sf "http://localhost:${MEILI_PORT}/health" > /dev/null 2>&1; then
        echo "Meilisearch is ready (PID ${MEILI_PID})"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "ERROR: Meilisearch failed to start within 30 seconds"
        exit 1
    fi
    sleep 1
done

# Start Flask app
echo "Starting SearchBox..."
exec python app.py
