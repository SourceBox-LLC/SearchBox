#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 SourceBox LLC
#
# Boot wrapper: start Meilisearch as a sidecar, wait for it, then exec the
# SearchBox binary. Meilisearch is also startable / stoppable from the
# app itself via /api/meilisearch/start and /api/meilisearch/stop.

set -eu

MEILI_MASTER_KEY="${MEILI_MASTER_KEY:-aSampleMasterKey}"
MEILI_PORT="${MEILI_PORT:-7700}"
MEILI_DB_PATH="${MEILI_DB_PATH:-/app/meili_data}"

echo "starting meilisearch on :${MEILI_PORT}"
meilisearch \
    --http-addr "0.0.0.0:${MEILI_PORT}" \
    --master-key "${MEILI_MASTER_KEY}" \
    --db-path "${MEILI_DB_PATH}" \
    --no-analytics &

MEILI_PID=$!
trap 'kill ${MEILI_PID} 2>/dev/null || true' EXIT

echo "waiting for meilisearch…"
for i in $(seq 1 30); do
    if curl -sf "http://localhost:${MEILI_PORT}/health" > /dev/null 2>&1; then
        echo "meilisearch ready (pid ${MEILI_PID})"
        break
    fi
    if [ "$i" = "30" ]; then
        echo "ERROR: meilisearch failed to start within 30s"
        exit 1
    fi
    sleep 1
done

echo "starting searchbox"
exec searchbox
