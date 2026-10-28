#!/usr/bin/env bash
# CI ONLY: native PostgreSQL 17 utilities in the dedicated fictional service.
set -euo pipefail
operation="$(basename "$0")"
case "$operation" in pg_dump|pg_restore) ;; *) exit 2 ;; esac
exec docker exec -i -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE -e PGSSLMODE -e PGCONNECT_TIMEOUT \
  "${UCP_PG_TEST_CONTAINER:?Dedicated test service required}" "$operation" "$@"
