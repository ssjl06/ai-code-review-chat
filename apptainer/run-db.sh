#!/usr/bin/env bash
# Manage the PostgreSQL Apptainer instance for the code-review app.
#
# All paths/ports are env-configurable. PGDATA_HOST is the ONLY large/growing
# directory — point it at your big disk or an NFS mount.
#
#   PGDATA_HOST=/nfs/codereview/pgdata ./run-db.sh init
#   PGDATA_HOST=/nfs/codereview/pgdata ./run-db.sh start
#   ./run-db.sh status
#   ./run-db.sh stop
#
# NFS caveat: Postgres on NFS needs a hard mount with working locks (NFSv4) and
# a single exclusive accessor — otherwise data corruption is possible.
set -euo pipefail

PG_SIF="${PG_SIF:-/mnt/e/postgres.sif}"
PGDATA_HOST="${PGDATA_HOST:-/srv/codereview/pgdata}"   # <- relocate to NFS/large disk
PGPORT="${PGPORT:-5432}"
PG_LISTEN="${PG_LISTEN:-localhost}"                      # 'localhost' or '*'
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-code_review}"
PG_INSTANCE="${PG_INSTANCE:-codereview-db}"

case "${1:-}" in
  init)
    mkdir -p "$PGDATA_HOST"
    apptainer run --app initdb \
      --bind "$PGDATA_HOST:/pgdata" \
      --env POSTGRES_USER="$POSTGRES_USER" \
      --env POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
      --env POSTGRES_DB="$POSTGRES_DB" \
      "$PG_SIF"
    ;;
  start)
    apptainer instance start \
      --bind "$PGDATA_HOST:/pgdata" \
      --env PGPORT="$PGPORT" --env PG_LISTEN="$PG_LISTEN" \
      "$PG_SIF" "$PG_INSTANCE"
    echo "Postgres '$PG_INSTANCE' listening on ${PG_LISTEN}:${PGPORT} (PGDATA=$PGDATA_HOST)"
    ;;
  stop)
    apptainer instance stop "$PG_INSTANCE"
    ;;
  status)
    apptainer instance list
    ;;
  *)
    echo "usage: $0 {init|start|stop|status}" >&2
    exit 1
    ;;
esac
