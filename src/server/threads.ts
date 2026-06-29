import { prisma } from "@/server/db";
import type { Side } from "@/lib/types";

// Data-access layer for threads/messages. Every read/write takes an explicit
// userId so ownership is always enforced (the share route is the only exception
// and uses a dedicated token lookup).

export interface CreateThreadInput {
  repoOwner: string;
  repoName: string;
  prNumber: number;
  filePath: string;
  line: number;
  startLine?: number | null;
  side: Side;
  startSide?: Side | null;
  commitSha: string;
  diffHunk: string;
}

export async function createThread(userId: string, input: CreateThreadInput) {
  return prisma.thread.create({
    data: {
      userId,
      repoOwner: input.repoOwner,
      repoName: input.repoName,
      prNumber: input.prNumber,
      filePath: input.filePath,
      line: input.line,
      startLine: input.startLine ?? null,
      side: input.side,
      startSide: input.startSide ?? null,
      commitSha: input.commitSha,
      diffHunk: input.diffHunk,
    },
  });
}

export async function listThreadsForPull(
  userId: string,
  repoOwner: string,
  repoName: string,
  prNumber: number,
) {
  return prisma.thread.findMany({
    where: { userId, repoOwner, repoName, prNumber },
    include: { messages: { orderBy: { createdAt: "asc" } }, share: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getThreadForUser(userId: string, threadId: string) {
  return prisma.thread.findFirst({
    where: { id: threadId, userId },
    include: { messages: { orderBy: { createdAt: "asc" } }, share: true },
  });
}

export async function addMessage(
  threadId: string,
  role: "user" | "assistant",
  content: string,
  model?: string,
) {
  const msg = await prisma.message.create({
    data: { threadId, role, content, model },
  });
  await prisma.thread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });
  return msg;
}

export type ThreadWithMessages = NonNullable<
  Awaited<ReturnType<typeof getThreadForUser>>
>;
