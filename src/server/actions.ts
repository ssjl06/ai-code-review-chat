"use server";

import { generateText } from "ai";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/session";
import {
  createThread,
  getThreadForUser,
  type CreateThreadInput,
} from "@/server/threads";
import { getPull, getHeadSha, postReviewComment } from "@/server/github";
import { createShareLink, revokeShareLink } from "@/server/share";
import { buildDistillMessages, getModel, type ThreadContext } from "@/server/llm";
import { toThreadDTO, type ThreadDTO } from "@/lib/dto";
import type { Side } from "@/lib/types";

export async function createThreadAction(
  input: CreateThreadInput,
): Promise<ThreadDTO> {
  const userId = await requireUserId();
  const thread = await createThread(userId, input);
  const full = await getThreadForUser(userId, thread.id);
  revalidatePath(
    `/repos/${input.repoOwner}/${input.repoName}/pulls/${input.prNumber}`,
  );
  return toThreadDTO(full!);
}

export async function refreshThreadAction(threadId: string): Promise<ThreadDTO | null> {
  const userId = await requireUserId();
  const t = await getThreadForUser(userId, threadId);
  return t ? toThreadDTO(t) : null;
}

// ──────────────────────────────────────────────
// Distill the conversation and post it as an inline review comment.
// ──────────────────────────────────────────────
export type PostReviewResult =
  | { ok: true; commentUrl: string; body: string }
  | { ok: false; error: string };

export async function postReviewAction(
  threadId: string,
  model?: string,
): Promise<PostReviewResult> {
  const userId = await requireUserId();
  const thread = await getThreadForUser(userId, threadId);
  if (!thread) return { ok: false, error: "Thread not found." };
  if (thread.messages.length === 0) {
    return { ok: false, error: "Have a conversation before posting." };
  }

  // Best-effort PR metadata for the distillation prompt.
  let prTitle = `PR #${thread.prNumber}`;
  let prBody: string | null = null;
  try {
    const pr = await getPull(userId, thread.repoOwner, thread.repoName, thread.prNumber);
    prTitle = pr.title;
    prBody = pr.body;
  } catch {
    /* fall back to stored anchor context */
  }

  const ctx: ThreadContext = {
    prTitle,
    prBody,
    repoFullName: `${thread.repoOwner}/${thread.repoName}`,
    filePath: thread.filePath,
    side: thread.side,
    line: thread.line,
    startLine: thread.startLine,
    diffHunk: thread.diffHunk,
  };
  const history = thread.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // Distill the conversation into a comment. LLM may be unreachable/misconfigured.
  let distilled: string;
  try {
    const { model: chatModel } = getModel(model);
    const { system, messages } = buildDistillMessages(ctx, history);
    // Low temperature → stay faithful to the conversation, avoid inventing issues.
    const result = await generateText({
      model: chatModel,
      system,
      messages,
      temperature: 0.2,
    });
    distilled = result.text.trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `AI 요약 생성 실패 (LLM 연결 확인): ${msg}` };
  }
  if (!distilled) {
    return { ok: false, error: "AI가 빈 코멘트를 생성했습니다. 다시 시도해 주세요." };
  }

  // Always anchor against the CURRENT head SHA to avoid stale-commit 422s.
  try {
    const commitSha = await getHeadSha(
      userId,
      thread.repoOwner,
      thread.repoName,
      thread.prNumber,
    );
    const { id, htmlUrl } = await postReviewComment(userId, {
      owner: thread.repoOwner,
      repo: thread.repoName,
      pull_number: thread.prNumber,
      body: distilled,
      commit_id: commitSha,
      path: thread.filePath,
      line: thread.line,
      side: thread.side as Side,
      startLine: thread.startLine ?? undefined,
      startSide: (thread.startSide as Side | null) ?? undefined,
    });
    await prisma.thread.update({
      where: { id: thread.id },
      data: { postedCommentId: BigInt(id) },
    });
    revalidatePath(
      `/repos/${thread.repoOwner}/${thread.repoName}/pulls/${thread.prNumber}`,
    );
    return { ok: true, commentUrl: htmlUrl, body: distilled };
  } catch (err) {
    // Surface GitHub's reason (commonly a 422: line not in diff / stale commit).
    const msg = err instanceof Error ? err.message : "Failed to post comment.";
    return { ok: false, error: msg };
  }
}

// ──────────────────────────────────────────────
// Share links
// ──────────────────────────────────────────────
export async function createShareLinkAction(threadId: string): Promise<{ token: string }> {
  const userId = await requireUserId();
  const link = await createShareLink(userId, threadId);
  return { token: link.token };
}

export async function revokeShareLinkAction(threadId: string): Promise<void> {
  const userId = await requireUserId();
  await revokeShareLink(userId, threadId);
}
