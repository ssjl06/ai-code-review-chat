import { notFound } from "next/navigation";
import { getSharedThread } from "@/server/share";

export const dynamic = "force-dynamic";

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const thread = await getSharedThread(token);
  if (!thread) notFound();

  const range =
    thread.startLine && thread.startLine !== thread.line
      ? `lines ${thread.startLine}–${thread.line}`
      : `line ${thread.line}`;
  const author = thread.user.name ?? thread.user.githubLogin ?? "Someone";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-wide text-black/40 dark:text-white/40">
          Shared AI code-review thread (read-only)
        </p>
        <h1 className="text-lg font-semibold">
          {thread.repoOwner}/{thread.repoName} · PR #{thread.prNumber}
        </h1>
        <p className="text-sm text-black/50 dark:text-white/50">
          {thread.filePath} · {thread.side} {range} · shared by {author}
        </p>
      </div>

      {thread.diffHunk && (
        <pre className="mb-4 overflow-x-auto rounded-lg border border-black/10 bg-black/[0.03] p-3 text-xs dark:border-white/15 dark:bg-white/[0.04]">
          <code>{thread.diffHunk}</code>
        </pre>
      )}

      <div className="space-y-2">
        {thread.messages.length === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">
            No messages in this thread.
          </p>
        ) : (
          thread.messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "rounded bg-blue-50 px-3 py-2 text-sm dark:bg-blue-950/40"
                  : "rounded bg-black/[0.03] px-3 py-2 text-sm dark:bg-white/[0.04]"
              }
            >
              <div className="mb-0.5 text-xs font-semibold uppercase text-black/40 dark:text-white/40">
                {m.role}
              </div>
              <div className="whitespace-pre-wrap break-words">{m.content}</div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
