# AI Code Review

A web app for reviewing **GitHub (Enterprise)** pull requests with **line-by-line AI conversations**.
Open a PR, view the full diff, click any line to start a multi-turn chat with an AI about that code,
then distill the conversation into a real inline review comment and post it back to the PR.

Built with Next.js (App Router) · Auth.js · Prisma/Postgres · Octokit · Vercel AI SDK against an
OpenAI-compatible LLM endpoint (LiteLLM / vLLM).

## Features

- **GitHub Enterprise sign-in** via a GitHub App (user-to-server OAuth). All API + OAuth endpoints
  are configurable, so it works against GHES or github.com.
- **Repo → PR → diff** browsing. Diffs render file-by-file with +/- markers (`react-diff-view`).
- **Line-anchored AI threads.** Click a line's gutter to open a private chat thread about it. The
  diff hunk, file, and PR context are fed to the model. Responses stream in.
- **Distill & post.** One click condenses the thread into a concise comment and posts it as an
  inline review comment on the exact line/side via the modern `line`+`side`+`commit_id` API.
- **Private by default + share links.** Threads are visible only to their creator; generate a
  read-only share link (claude.ai style) that renders from stored data without any GitHub access.
- **Pluggable models.** Point `LLM_BASE_URL` at LiteLLM/vLLM and list models in `LLM_MODELS`.

## Prerequisites

- Node 20+
- PostgreSQL 14+
- A LiteLLM/vLLM (or any OpenAI-compatible) endpoint
- A **GitHub App** registered on your GitHub Enterprise (or github.com)

## 1. Register the GitHub App

In your GitHub Enterprise: **Settings → Developer settings → GitHub Apps → New GitHub App**.

- **Callback URL:** `http://localhost:3000/api/auth/callback/github` (use your real origin in prod)
- **Request user authorization (OAuth) during installation:** enabled
- Optionally enable **Expire user authorization tokens** (the app auto-refreshes them).
- **Permissions:**
  - Pull requests: **Read & write**
  - Contents: **Read**
  - Metadata: **Read** (default)
- Note the **Client ID** and generate a **Client secret**.
- **Install** the app on the org/repos you want to review (an org admin can do this once org-wide).

## 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — from the GitHub App
- `GITHUB_BASE_URL` — e.g. `https://github.your-co.com` (use `https://github.com` for public)
- `GITHUB_API_URL` — GHES: `https://github.your-co.com/api/v3` · public: `https://api.github.com`
- `AUTH_SECRET` — `npx auth secret` or `openssl rand -base64 32`
- `TOKEN_ENC_KEY` — `openssl rand -base64 32` (32-byte key; encrypts GitHub tokens at rest)
- `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODELS`, `LLM_DEFAULT_MODEL`

## 3. Database

```bash
docker compose up -d            # or point DATABASE_URL at your own Postgres
npx prisma migrate deploy       # apply migrations (or: npx prisma migrate dev)
npx prisma generate
```

## 4. Run

```bash
npm run dev      # http://localhost:3000
```

Sign in with GitHub → pick a repo → open a PR → click a line gutter to start an AI thread.

## Architecture

| Path | Role |
|------|------|
| `src/server/auth.ts` | Auth.js config; GitHub provider pointed at the enterprise host; encrypts tokens |
| `src/server/github.ts` | Octokit factory (enterprise `baseUrl` + token refresh) and all GitHub calls |
| `src/server/llm.ts` | OpenAI-compatible client + prompt/context builders |
| `src/server/threads.ts` | Thread/message data layer (ownership-scoped) |
| `src/server/share.ts` | Share-link create/revoke + public token lookup |
| `src/server/actions.ts` | Server actions: create thread, distill+post, share |
| `src/app/api/chat/route.ts` | Streaming chat endpoint |
| `src/lib/diff-anchor.ts` | Maps a diff line → GitHub `line`/`side` params |
| `src/components/diff/FileDiff.tsx` | Renders a file diff, wires gutter clicks to threads |
| `src/components/thread/ThreadPanel.tsx` | Chat UI, post-to-GitHub, share controls |

## Notes / limitations

- Posting requires the target line to be part of the PR diff; the app always re-fetches the current
  head SHA before posting to avoid stale-commit errors.
- After a force-push, threads whose anchor line is no longer in the diff are shown in an
  **"Outdated threads"** section (kept readable, not posted).
- Tokens are AES-256-GCM encrypted at rest; never sent to the browser.
