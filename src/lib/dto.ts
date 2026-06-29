import type { Side } from "@/lib/types";

// Serializable thread shape passed to client components.
export interface ThreadDTO {
  id: string;
  filePath: string;
  line: number;
  startLine: number | null;
  side: Side;
  startSide: Side | null;
  commitSha: string;
  status: string;
  postedCommentId: string | null;
  messages: { id: string; role: string; content: string }[];
  shareToken: string | null;
}

// Structural input — matches a Prisma Thread with messages + share included.
export interface ThreadRecord {
  id: string;
  filePath: string;
  line: number;
  startLine: number | null;
  side: string;
  startSide: string | null;
  commitSha: string;
  status: string;
  postedCommentId: bigint | null;
  messages: { id: string; role: string; content: string }[];
  share: { token: string; revoked: boolean } | null;
}

export function toThreadDTO(t: ThreadRecord): ThreadDTO {
  return {
    id: t.id,
    filePath: t.filePath,
    line: t.line,
    startLine: t.startLine,
    side: t.side as Side,
    startSide: (t.startSide as Side | null) ?? null,
    commitSha: t.commitSha,
    status: t.status,
    postedCommentId: t.postedCommentId != null ? t.postedCommentId.toString() : null,
    messages: t.messages.map((m) => ({ id: m.id, role: m.role, content: m.content })),
    shareToken: t.share && !t.share.revoked ? t.share.token : null,
  };
}
