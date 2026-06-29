#!/usr/bin/env bash
# Manage the code-review app Apptainer image.
#
#   ENV_FILE=.env.production ./run-app.sh migrate   # apply DB migrations (once / on upgrade)
#   ENV_FILE=.env.production ./run-app.sh start      # run as a background instance
#   ./run-app.sh status
#   ./run-app.sh stop
#   ENV_FILE=.env.production ./run-app.sh run        # run in the foreground (Ctrl-C to stop)
#
# The app image is read-only and stateless — it stores nothing on local disk
# (sessions live in Postgres). ENV_FILE must set DATABASE_URL to the DB started
# by run-db.sh (e.g. postgresql://USER:PW@localhost:5432/code_review?schema=public),
# plus GITHUB_* / LLM_* / AUTH_SECRET / TOKEN_ENC_KEY (see .env.production.example).
set -euo pipefail

APP_SIF="${APP_SIF:-/mnt/e/codereview.sif}"
ENV_FILE="${ENV_FILE:-.env.production}"
APP_INSTANCE="${APP_INSTANCE:-codereview-app}"
# Optional extra binds (e.g. relocate something to NFS): EXTRA_BINDS="/nfs/x:/x"
EXTRA_BINDS="${EXTRA_BINDS:-}"
bind_args=()
[ -n "$EXTRA_BINDS" ] && bind_args=(--bind "$EXTRA_BINDS")

case "${1:-}" in
  migrate)
    apptainer run --app migrate --env-file "$ENV_FILE" "${bind_args[@]}" "$APP_SIF"
    ;;
  run)
    apptainer run --env-file "$ENV_FILE" "${bind_args[@]}" "$APP_SIF"
    ;;
  start)
    apptainer instance start --env-file "$ENV_FILE" "${bind_args[@]}" "$APP_SIF" "$APP_INSTANCE"
    echo "App '$APP_INSTANCE' started (see env for PORT/HOSTNAME)"
    ;;
  stop)
    apptainer instance stop "$APP_INSTANCE"
    ;;
  status)
    apptainer instance list
    ;;
  *)
    echo "usage: $0 {migrate|run|start|stop|status}" >&2
    exit 1
    ;;
esac
