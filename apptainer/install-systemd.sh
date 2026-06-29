#!/usr/bin/env bash
# Install systemd units that auto-start the code-review stack on boot:
#   codereview-db.service  →  codereview-migrate.service  →  codereview-app.service
#
# Modes:
#   sudo ./install-systemd.sh              # system-wide (default; units in /etc/systemd/system)
#   ./install-systemd.sh --user            # per-user (units in ~/.config/systemd/user)
#
# After install, edit the deploy.env + app env file it points to, then:
#   (system)  sudo systemctl enable --now codereview-app.service
#   (user)    systemctl --user enable --now codereview-app.service
# Enabling codereview-app pulls in db + migrate via the dependency chain.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_SRC="$HERE/systemd"
MODE="system"
[ "${1:-}" = "--user" ] && MODE="user"

if [ "$MODE" = "user" ]; then
  UNIT_DST="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  CFG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/codereview"
  SYSTEMCTL=(systemctl --user)
else
  if [ "$(id -u)" -ne 0 ]; then
    echo "System mode needs root. Re-run with sudo, or use: $0 --user" >&2
    exit 1
  fi
  UNIT_DST="/etc/systemd/system"
  CFG_DIR="/etc/codereview"
  SYSTEMCTL=(systemctl)
fi

ENVFILE="$CFG_DIR/deploy.env"

mkdir -p "$UNIT_DST" "$CFG_DIR"

# Seed the deploy.env (paths/ports) if absent — edit it before starting.
if [ ! -f "$ENVFILE" ]; then
  cp "$UNIT_SRC/deploy.env.example" "$ENVFILE"
  echo "Created $ENVFILE (EDIT IT: SIF paths, PGDATA_HOST, PGPORT, ENV_FILE)."
else
  echo "Keeping existing $ENVFILE"
fi

# Install the three units, pointing EnvironmentFile at the chosen deploy.env.
for u in codereview-db.service codereview-migrate.service codereview-app.service; do
  sed "s|__ENVFILE__|$ENVFILE|g" "$UNIT_SRC/$u" > "$UNIT_DST/$u"
  echo "Installed $UNIT_DST/$u"
done

"${SYSTEMCTL[@]}" daemon-reload
echo
echo "Next:"
echo "  1) Edit $ENVFILE  (and the app ENV_FILE it references — see .env.production.example)"
echo "  2) Initialize the DB once:"
echo "       set -a; . $ENVFILE; set +a"
echo "       PGDATA_HOST=\"\$PGDATA_HOST\" PGPORT=\"\$PGPORT\" $HERE/run-db.sh init"
if [ "$MODE" = "user" ]; then
  echo "  3) Enable on boot (user lingering so it starts without login):"
  echo "       loginctl enable-linger \$USER"
  echo "       systemctl --user enable --now codereview-app.service"
else
  echo "  3) Enable on boot:"
  echo "       sudo systemctl enable --now codereview-app.service"
fi
echo "  Check:  ${SYSTEMCTL[*]} status codereview-app.service"
