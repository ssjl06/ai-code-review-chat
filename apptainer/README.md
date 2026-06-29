# Apptainer deployment (offline / air-gapped)

Two single-file SIF images run the whole stack — no Docker, no daemon, no registry
inside the air-gap. The app is read-only and stateless; **the only growing data is
the Postgres data directory**, which lives outside the image (bind-mounted, can be NFS).

| File | What it is |
|------|------------|
| `codereview.def` / `codereview.sif` | The Next.js app (runscript = server, `--app migrate` = DB migrations) |
| `postgres.def` / `postgres.sif` | PostgreSQL 16 (`--app initdb` = init, instance = server) |
| `run-db.sh` | init / start / stop / status the DB instance |
| `run-app.sh` | migrate / run / start / stop / status the app |

## Build (on a network-connected host)

```bash
cd <project root>
apptainer build --fakeroot apptainer-out/codereview.sif apptainer/codereview.def
apptainer build --fakeroot apptainer-out/postgres.sif   apptainer/postgres.def
```
Copy the two `.sif` files into the air-gap (that's the entire transfer). The build pulls:
base images (`node:20-slim`, `postgres:16-alpine`), npm packages, Prisma engine binaries,
and `openssl`/`ca-certificates`. Nothing internet-bound remains at runtime.

> Building on a host with a small local disk? Point the build cache/temp at a big disk or NFS:
> `export APPTAINER_CACHEDIR=/big/cache APPTAINER_TMPDIR=/big/tmp`

## Configure

```bash
cp .env.production.example .env.production   # fill GITHUB_* (GHES), LLM_* (internal), secrets
```
Set `DATABASE_URL` to the DB you'll start below, e.g.
`postgresql://postgres:<pw>@localhost:5432/code_review?schema=public`.

## Run (approach A: app SIF + Postgres SIF instance)

```bash
# 1) Database — PGDATA_HOST is the large/growing dir; put it on a big disk or NFS.
PGDATA_HOST=/srv/codereview/pgdata POSTGRES_PASSWORD=secret ./apptainer/run-db.sh init
PGDATA_HOST=/srv/codereview/pgdata PGPORT=5432            ./apptainer/run-db.sh start

# 2) Migrate, then start the app (reads .env.production)
ENV_FILE=.env.production ./apptainer/run-app.sh migrate
ENV_FILE=.env.production ./apptainer/run-app.sh start

# status / stop
./apptainer/run-app.sh status
./apptainer/run-app.sh stop
./apptainer/run-db.sh stop
```

Put a TLS-terminating reverse proxy in front of the app port and set `AUTH_URL` to the public
origin. On upgrade: build new SIFs, `run-app.sh stop`, swap the file, `run-app.sh migrate`, `start`.

## Relocating large dirs to NFS

Anything can be placed on NFS via bind mounts. In practice only **PGDATA** matters:

```bash
PGDATA_HOST=/nfs/codereview/pgdata ./apptainer/run-db.sh init
PGDATA_HOST=/nfs/codereview/pgdata ./apptainer/run-db.sh start
```
Other relocatable dirs: Apptainer instance logs (`~/.apptainer/instances/logs`), build
cache/temp (`APPTAINER_CACHEDIR` / `APPTAINER_TMPDIR`). The app image itself writes nothing
to local disk.

### ⚠️ Postgres on NFS
PostgreSQL risks data corruption on misconfigured NFS. If PGDATA must be on NFS:
- **hard** mount (never `soft`), NFSv4 with working file locks, conservative caching (`actimeo=0`)
- exactly **one** instance accessing that PGDATA (no concurrent mounts)
- prefer local/block storage for PGDATA and use NFS only for backups/WAL archive when possible.

## Configuration reference (env vars)

`run-db.sh`: `PG_SIF`, `PGDATA_HOST`, `PGPORT`, `PG_LISTEN` (`localhost`|`*`),
`POSTGRES_USER/PASSWORD/DB`, `PG_INSTANCE`.

`run-app.sh`: `APP_SIF`, `ENV_FILE`, `APP_INSTANCE`, `EXTRA_BINDS` (`/host:/ctr`).
App port/host come from `PORT`/`HOSTNAME` in `ENV_FILE`.

## Auto-start on boot (systemd)

`systemd/` holds three units (`codereview-db` → `codereview-migrate` → `codereview-app`)
plus `install-systemd.sh`. Enabling `codereview-app` pulls in the whole chain.

```bash
sudo ./install-systemd.sh                      # or: ./install-systemd.sh --user
sudo vi /etc/codereview/deploy.env             # SIF paths, PGDATA_HOST (NFS ok), PGPORT, ENV_FILE
sudo vi /etc/codereview/.env.production        # app env (GITHUB_*, LLM_*, DATABASE_URL, secrets, PORT)
# one-time DB init:
set -a; . /etc/codereview/deploy.env; set +a
sudo PGDATA_HOST="$PGDATA_HOST" PGPORT="$PGPORT" ./run-db.sh init
sudo systemctl enable --now codereview-app.service
```
The DB unit orders `After=remote-fs.target` so an NFS-backed `PGDATA_HOST` is mounted first.
For `--user` mode, run `loginctl enable-linger $USER` so it starts without a login session.

## Reverse proxy (TLS) & logging

### Reverse proxy
Terminate TLS at the corporate LB or an nginx host and forward to the app port. A ready
config is in `nginx/codereview.conf` — install to `/etc/nginx/conf.d/codereview.conf`,
set the cert paths + `server_name`, then `nginx -t && systemctl reload nginx`. It already:
- sets `X-Forwarded-Proto/Host` so Auth.js builds correct **HTTPS OAuth callback URLs**
  (keep `AUTH_URL=https://<host>` and `AUTH_TRUST_HOST=true` in the app env);
- disables proxy buffering so **AI chat responses stream** to the browser, with 300s timeouts;
- enlarges header buffers for GitHub OAuth cookies.

### Log rotation (journald)
The units log to journald (stdout/stderr). Cap/rotate the journal with
`systemd/journald-codereview.conf`:
```bash
sudo cp systemd/journald-codereview.conf /etc/systemd/journald.conf.d/codereview.conf
sudo systemctl restart systemd-journald
```
Caps total journal at 500M with a 2-week retention. View logs with
`journalctl -u codereview-app -f` (add `--user` for user-mode). For tighter per-service
throttling, add `LogRateLimitIntervalSec=`/`LogRateLimitBurst=` to a unit's `[Service]`.

## Alternative model: env SIF + source on host (editable code)

If you expect to tweak the code in place, use `env.def` instead of `codereview.def`.
The SIF carries only the **environment** (Node + node_modules + Prisma engine + toolchain);
the **app source lives on the host** and is bind-mounted at runtime, so a code change needs
only a `build` — not a SIF rebuild. Rebuild `env.sif` only when dependencies change.

Transfer set for this model: `env.sif`, `postgres.sif`, the **source tree**, and the ops files.

```bash
# build the env image (connected host)
apptainer build --fakeroot env.sif apptainer/env.def

# on the target: put the source somewhere (e.g. /opt/codereview/src) and:
export ENV_SIF=/opt/codereview/env.sif SRC_DIR=/opt/codereview/src ENV_FILE=/etc/codereview/.env.production
./apptainer/run-app-src.sh build      # next build → SRC_DIR/.next  (offline, uses in-SIF node_modules)
./apptainer/run-app-src.sh migrate    # prisma migrate deploy
./apptainer/run-app-src.sh start      # next start (background instance)

# code change later:  edit SRC_DIR → ./run-app-src.sh build → ./run-app-src.sh stop && start
```
`run-app-src.sh` uses `--writable-tmpfs` so `next build` can write scratch files (e.g.
`next-env.d.ts`) into the read-only image; the real build output lands in `SRC_DIR/.next`.
For systemd, point `ExecStart` at `run-app-src.sh run` with `Environment=ENV_SIF=…,SRC_DIR=…,ENV_FILE=…`
(and a separate one-shot for `build`).

Trade-off vs the all-in-one `codereview.sif`: more flexible for code edits, but you ship a
source tree alongside the SIF and run a `build` step on each change.

## Verified

End-to-end on this machine:
- build both SIFs → `run-db.sh init/start` (PGDATA bind) → `run-app.sh migrate` (7 tables) →
  `run-app.sh start` → app serves (HTTP 200) and queries the DB;
- systemd chain (`--user`): `systemctl start codereview-app` brings up db → migrate → app
  (all active), app serves; the migrate one-shot waits for the DB then exits 0.
- env-SIF model: `run-app-src.sh build` (host source → host `.next`, offline) → `migrate` →
  `run` (`next start`) serves (HTTP 200) and queries the DB.
All as unprivileged Apptainer instances.
