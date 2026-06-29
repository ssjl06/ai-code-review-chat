import { Octokit } from "@octokit/rest";
import { prisma } from "@/server/db";
import { encrypt, decrypt } from "@/server/crypto";
import { env, githubOAuth } from "@/lib/env";
import type {
  DiffFile,
  PullDetail,
  PullSummary,
  RepoSummary,
  Side,
} from "@/lib/types";

// ──────────────────────────────────────────────
// Token lifecycle
// ──────────────────────────────────────────────

// Refresh a GitHub App user-to-server token using the stored refresh token.
async function refreshToken(refreshTokenPlain: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
}> {
  const res = await fetch(githubOAuth.token, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: env.githubClientId,
      client_secret: env.githubClientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshTokenPlain,
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub token refresh failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (data.error || !data.access_token) {
    throw new Error(`GitHub token refresh error: ${data.error ?? "no token"}`);
  }
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_in ? nowSec + data.expires_in : null,
  };
}

// Return a valid, decrypted GitHub access token for the user, refreshing if needed.
async function getValidAccessToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
  });
  if (!account?.access_token) {
    throw new Error("No linked GitHub account for this user");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expiresSoon =
    account.expires_at != null && account.expires_at - nowSec < 60;

  // Token still valid, or the App doesn't expire tokens (no refresh token).
  if (!expiresSoon || !account.refresh_token) {
    return decrypt(account.access_token);
  }

  // Expired and we have a refresh token → refresh and persist.
  const refreshed = await refreshToken(decrypt(account.refresh_token));
  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: encrypt(refreshed.accessToken),
      refresh_token: refreshed.refreshToken
        ? encrypt(refreshed.refreshToken)
        : account.refresh_token,
      expires_at: refreshed.expiresAt,
    },
  });
  return refreshed.accessToken;
}

// Build an Octokit client bound to the user's token and the enterprise API host.
export async function getUserOctokit(userId: string): Promise<Octokit> {
  const token = await getValidAccessToken(userId);
  return new Octokit({ auth: token, baseUrl: env.githubApiUrl });
}

// ──────────────────────────────────────────────
// Read helpers
// ──────────────────────────────────────────────

export async function listRepos(userId: string): Promise<RepoSummary[]> {
  const octokit = await getUserOctokit(userId);
  const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
    per_page: 100,
    sort: "updated",
    affiliation: "owner,collaborator,organization_member",
  });
  return repos.map((r) => ({
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    description: r.description,
    updatedAt: r.updated_at ?? null,
  }));
}

export async function listOpenPulls(
  userId: string,
  owner: string,
  repo: string,
): Promise<PullSummary[]> {
  const octokit = await getUserOctokit(userId);
  const pulls = await octokit.paginate(octokit.pulls.list, {
    owner,
    repo,
    state: "open",
    per_page: 100,
    sort: "updated",
    direction: "desc",
  });
  return pulls.map((p) => ({
    number: p.number,
    title: p.title,
    state: p.state,
    author: p.user?.login ?? null,
    authorAvatar: p.user?.avatar_url ?? null,
    updatedAt: p.updated_at,
    headSha: p.head.sha,
    draft: p.draft ?? false,
  }));
}

export async function getPull(
  userId: string,
  owner: string,
  repo: string,
  pull_number: number,
): Promise<PullDetail> {
  const octokit = await getUserOctokit(userId);
  const { data: p } = await octokit.pulls.get({ owner, repo, pull_number });
  return {
    number: p.number,
    title: p.title,
    state: p.state,
    author: p.user?.login ?? null,
    authorAvatar: p.user?.avatar_url ?? null,
    updatedAt: p.updated_at,
    headSha: p.head.sha,
    draft: p.draft ?? false,
    body: p.body,
    baseRef: p.base.ref,
    headRef: p.head.ref,
  };
}

// Fetch only the current head SHA — used right before posting a comment so we
// never anchor against a stale commit.
export async function getHeadSha(
  userId: string,
  owner: string,
  repo: string,
  pull_number: number,
): Promise<string> {
  const octokit = await getUserOctokit(userId);
  const { data } = await octokit.pulls.get({ owner, repo, pull_number });
  return data.head.sha;
}

export async function listPullFiles(
  userId: string,
  owner: string,
  repo: string,
  pull_number: number,
): Promise<DiffFile[]> {
  const octokit = await getUserOctokit(userId);
  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner,
    repo,
    pull_number,
    per_page: 100,
  });
  return files.map((f) => ({
    filename: f.filename,
    previousFilename: f.previous_filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch ?? null,
  }));
}

// ──────────────────────────────────────────────
// Write helper — post an inline review comment
// ──────────────────────────────────────────────

export interface PostCommentParams {
  owner: string;
  repo: string;
  pull_number: number;
  body: string;
  commit_id: string;
  path: string;
  line: number;
  side: Side;
  startLine?: number;
  startSide?: Side;
}

export async function postReviewComment(
  userId: string,
  params: PostCommentParams,
): Promise<{ id: number; htmlUrl: string }> {
  const octokit = await getUserOctokit(userId);
  const { data } = await octokit.pulls.createReviewComment({
    owner: params.owner,
    repo: params.repo,
    pull_number: params.pull_number,
    body: params.body,
    commit_id: params.commit_id,
    path: params.path,
    side: params.side,
    line: params.line,
    ...(params.startLine
      ? { start_line: params.startLine, start_side: params.startSide ?? params.side }
      : {}),
  });
  return { id: data.id, htmlUrl: data.html_url };
}
