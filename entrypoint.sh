#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 SourceBox LLC
#
# This file is part of SearchBox.
# SearchBox is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# SearchBox is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with SearchBox. If not, see <https://www.gnu.org/licenses/>.

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