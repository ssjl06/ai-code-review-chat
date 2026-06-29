import { streamText } from "ai";
import { auth } from "@/server/auth";
import { getThreadForUser, addMessage } from "@/server/threads";
import { getPull } from "@/server/github";
import { buildMessages, getModel, type ThreadContext } from "@/server/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { threadId, model, content } = (await req.json()) as {
    threadId?: string;
    model?: string;
    content?: string;
  };
  if (!threadId || !content?.trim()) {
    return new Response("Bad request", { status: 400 });
  }

  // Ownership check.
  const thread = await getThreadForUser(userId, threadId);
  if (!thread) return new Response("Not found", { status: 404 });

  // Persist the user's message before generating.
  await addMessage(threadId, "user", content);

  // Best-effort PR metadata for richer context.
  let prTitle = `PR #${thread.prNumber}`;
  let prBody: string | null = null;
  try {
    const pr = await getPull(
      userId,
      thread.repoOwner,
      thread.repoName,
      thread.prNumber,
    );
    prTitle = pr.title;
    prBody = pr.body;
  } catch {
    // Continue with stored anchor context only.
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

  const history = [
    ...thread.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content },
  ];

  const { id: modelId, model: chatModel } = getModel(model);
  const { system, messages } = buildMessages(ctx, history);

  const result = streamText({
    model: chatModel,
    system,
    messages,
    onFinish: async ({ text }) => {
      if (text.trim()) await addMessage(threadId, "assistant", text, modelId);
    },
  });

  return result.toTextStreamResponse();
}
