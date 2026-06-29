# Deploying to an offline / air-gapped GitHub Enterprise

This app is built to run fully on-prem with **no internet access at runtime**:
- GitHub endpoints are configurable (`GITHUB_BASE_URL` / `GITHUB_API_URL`) → your GHES host.
- The LLM is any OpenAI-compatible endpoint → your internal **LiteLLM / vLLM** (open-source models).
- Fonts are system stacks (no Google Fonts fetch). DB is your own PostgreSQL.

The only place the public internet might be needed is the **build** (npm packages, base Docker
images). Handle that with one of the two strategies below.

## Topology

```
[ user browser ] ──HTTPS──> [ reverse proxy / TLS ] ──> [ app (Next standalone, :3000) ]
                                                              │            │
                                                              ▼            ▼
                                                     [ PostgreSQL ]   [ GHES API ]   [ internal LiteLLM/vLLM ]
```

## Prerequisites (inside the air-gap)

- An internal container registry holding `node:20-slim` and `postgres:16-alpine` (or equivalents).
- A reachable **GitHub Enterprise Server** instance.
- A reachable **OpenAI-compatible LLM endpoint** (LiteLLM or vLLM serving open-source models).
- PostgreSQL 14+ (the compose file can provide it).

## 1. Register the GitHub App on GHES

On GHES: **Settings → Developer settings → GitHub Apps → New GitHub App**.
- **Callback URL:** `https://<app-host>/api/auth/callback/github` (your `AUTH_URL` + that path)
- **Request user authorization (OAuth) during installation:** on. Optionally enable
  *Expire user authorization tokens* (the app auto-refreshes them).
- **Permissions:** Pull requests **Read & write**, Contents **Read**, Metadata **Read**.
- Note the **Client ID**, generate a **Client secret**.
- **Install** the App on the org/repos to review (an org admin can do it org-wide once).

> A classic **OAuth App** also works (set the same URLs); it just uses the coarse `repo` scope
> instead of fine-grained per-repo permissions.

## 2. Configure environment

```bash
cp .env.production.example .env.production
# then edit: DATABASE_URL, AUTH_SECRET, AUTH_URL, TOKEN_ENC_KEY,
# GITHUB_* (GHES host + App creds), LLM_* (internal endpoint)
```

Generate secrets: `openssl rand -base64 32` for both `AUTH_SECRET` and `TOKEN_ENC_KEY`.

## 3. Build strategy (pick one)

**A. Build on a connected host, ship the image (recommended).**
```bash
docker build -t codereview-app:1.0 .
docker save codereview-app:1.0 | gzip > codereview-app-1.0.tar.gz
# transfer the tarball into the air-gap, then:
docker load < codereview-app-1.0.tar.gz
```
Skip the `build:` keys in `docker-compose.prod.yml` and reference `image: codereview-app:1.0`
for the `app` (and a deps image for `migrate`).

**B. Build inside the air-gap.** Point npm at an internal mirror (Verdaccio / Nexus / Artifactory):
```bash
npm config set registry https://npm.corp.example.com/
docker build -t codereview-app:1.0 .   # base images must be in the internal registry
```

The build uses throwaway placeholder env (see the Dockerfile) — no real secrets at build time,
and nothing internet-bound at runtime.

## 4. Run

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

This brings up Postgres, runs `prisma migrate deploy` once (the `migrate` service), then starts
the app on `:3000`. Put your TLS-terminating reverse proxy (nginx / corporate LB) in front and
make sure `AUTH_URL` matches the public HTTPS origin.

### Without Docker (plain Node)

```bash
npm ci --legacy-peer-deps
npx prisma generate && npx prisma migrate deploy
npm run build
# ship .next/standalone + .next/static + public to the server, then:
node .next/standalone/server.js     # reads env from the process environment
```

## 5. Database migrations on upgrade

Each release: run `npx prisma migrate deploy` against the prod DB before (or as) the new app
starts. The compose `migrate` service does this automatically; for manual/Node deploys run it
explicitly.

## Notes & gotchas

- **Reverse proxy:** terminate TLS upstream; forward to the app on `:3000`. Set `AUTH_URL` to the
  public origin and keep `AUTH_TRUST_HOST=true`.
- **Token encryption:** `TOKEN_ENC_KEY` encrypts GitHub tokens at rest (AES-256-GCM). Back it up
  securely and **do not rotate** without re-encrypting existing `Account` rows (rotation would
  invalidate stored tokens — users would just need to sign in again).
- **GHES App user tokens** expire ~8h when "expire tokens" is enabled; the app refreshes them
  transparently. If disabled, tokens are long-lived and no refresh is needed.
- **LLM context:** on-prem open-source models often have smaller context windows — tune
  `LLM_MAX_CONTEXT` and the model list (`LLM_MODELS`) to what your LiteLLM/vLLM serves.
- **Scaling:** the app is stateless (sessions live in Postgres) — run multiple replicas behind the
  LB. Run the migration job once per release, not per replica.
- **Prisma engine:** the image is Debian-based (`node:20-slim`) to match the
  `debian-openssl-3.0.x` Prisma engine declared in `prisma/schema.prisma`.
- **Prisma engines in an air-gap build (strategy B):** `npm ci` / `prisma generate` normally
  fetch engine binaries from `binaries.prisma.sh`. Mirror them internally and set
  `PRISMA_ENGINES_MIRROR=https://<internal-mirror>` (and `PRISMA_CLI_BINARY_TARGETS`) at build
  time, or prefer strategy A (build connected, ship the image) to avoid this entirely.
