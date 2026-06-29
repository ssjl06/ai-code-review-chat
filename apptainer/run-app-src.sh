#!/usr/bin/env bash
# Run the app from the "env SIF + source on host" model.
#
# The env SIF carries Node + node_modules + Prisma engine + toolchain. The app
# SOURCE lives on the host (SRC_DIR) and is bound over /app at runtime, so code
# changes need only a `build`, not a SIF rebuild.
#
#   SRC_DIR=/opt/codereview/src ENV_SIF=/opt/codereview/env.sif ENV_FILE=/etc/codereview/.env.production \
#     ./run-app-src.sh build       # next build → writes SRC_DIR/.next
#     ./run-app-src.sh migrate      # prisma migrate deploy
#     ./run-app-src.sh start        # serve as a background instance (next start)
#     ./run-app-src.sh run          # serve in the foreground
#     ./run-app-src.sh stop
#
# Rebuild env.sif (apptainer build ... env.def) only when dependencies change.
set -euo pipefail

ENV_SIF="${ENV_SIF:-/opt/codereview/env.sif}"
SRC_DIR="${SRC_DIR:-$(pwd)}"
ENV_FILE="${ENV_FILE:-.env.production}"
APP_INSTANCE="${APP_INSTANCE:-codereview-app}"

mkdir -p "$SRC_DIR/.next"

# --writable-tmpfs gives an ephemeral writable overlay so `next build` can write
# scratch files (e.g. next-env.d.ts) into the otherwise read-only image. The real
# build output still lands in the host-bound /app/.next.
opts=(--writable-tmpfs)

# Bind host source over the SIF's /app; node_modules stays the SIF's baked copy.
# New code under src/ is picked up automatically (it's a directory bind). Add a
# line here only if you introduce a NEW top-level file/dir.
binds=(
  --bind "$SRC_DIR/src:/app/src"
  --bind "$SRC_DIR/public:/app/public"
  --bind "$SRC_DIR/prisma:/app/prisma"
  --bind "$SRC_DIR/next.config.ts:/app/next.config.ts"
  --bind "$SRC_DIR/tsconfig.json:/app/tsconfig.json"
  --bind "$SRC_DIR/postcss.config.mjs:/app/postcss.config.mjs"
  --bind "$SRC_DIR/eslint.config.mjs:/app/eslint.config.mjs"
  --bind "$SRC_DIR/package.json:/app/package.json"
  --bind "$SRC_DIR/.next:/app/.next"
)

case "${1:-}" in
  build)
    # next build validates env at import → pass the env file (no network used).
    apptainer run --app build --env-file "$ENV_FILE" "${opts[@]}" "${binds[@]}" "$ENV_SIF"
    ;;
  migrate)
    apptainer run --app migrate --env-file "$ENV_FILE" "${opts[@]}" "${binds[@]}" "$ENV_SIF"
    ;;
  run)
    apptainer run --env-file "$ENV_FILE" "${opts[@]}" "${binds[@]}" "$ENV_SIF"
    ;;
  start)
    apptainer instance start --env-file "$ENV_FILE" "${opts[@]}" "${binds[@]}" "$ENV_SIF" "$APP_INSTANCE"
    echo "App '$APP_INSTANCE' started from env SIF + source ($SRC_DIR)"
    ;;
  stop)
    apptainer instance stop "$APP_INSTANCE"
    ;;
  *)
    echo "usage: $0 {build|migrate|run|start|stop}" >&2
    exit 1
    ;;
esac
