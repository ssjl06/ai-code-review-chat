import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db";

// Create (or re-activate) a share link for a thread the user owns.
export async function createShareLink(userId: string, threadId: string) {
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, userId },
    include: { share: true },
  });
  if (!thread) throw new Error("Thread not found");

  if (thread.share) {
    return prisma.shareLink.update({
      where: { id: thread.share.id },
      data: { revoked: false },
    });
  }
  const token = randomBytes(24).toString("base64url");
  return prisma.shareLink.create({ data: { threadId, token } });
}

export async function revokeShareLink(userId: string, threadId: string) {
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, userId },
    include: { share: true },
  });
  if (!thread?.share) return;
  await prisma.shareLink.update({
    where: { id: thread.share.id },
    data: { revoked: true },
  });
}

// Public lookup by token — the ONLY path that reads a thread without a userId.
// Returns null when missing, revoked, or expired.
export async function getSharedThread(token: string) {
  const share = await prisma.shareLink.findUnique({
    where: { token },
    include: {
      thread: {
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          user: { select: { name: true, githubLogin: true } },
        },
      },
    },
  });
  if (!share || share.revoked) return null;
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) return null;
  return share.thread;
}
