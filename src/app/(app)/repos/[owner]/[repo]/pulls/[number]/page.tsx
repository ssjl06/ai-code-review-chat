import Link from "next/link";
import { requireUserId } from "@/server/session";
import { getPull, listPullFiles } from "@/server/github";
import { listThreadsForPull } from "@/server/threads";
import { toThreadDTO } from "@/lib/dto";
import { env, defaultModel } from "@/lib/env";
import PullDiffs from "@/components/diff/PullDiffs";

export const dynamic = "force-dynamic";

export default async function PullDetailPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; number: string }>;
}) {
  const userId = await requireUserId();
  const { owner, repo, number } = await params;
  const prNumber = Number(number);

  let pr, files, threads;
  try {
    [pr, files, threads] = await Promise.all([
      getPull(userId, owner, repo, prNumber),
      listPullFiles(userId, owner, repo, prNumber),
      listThreadsForPull(userId, owner, repo, prNumber),
    ]);
  } catch (err) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        {err instanceof Error ? err.message : "Failed to load pull request."}
      </div>
    );
  }

  const threadDTOs = threads.map(toThreadDTO);
  const prInfo = { repoOwner: owner, repoName: repo, prNumber, headSha: pr.headSha };

  return (
    <div className="space-y-4">
      <nav className="text-sm text-black/50 dark:text-white/50">
        <Link href="/repos" className="hover:underline">
          Repositories
        </Link>{" "}
        /{" "}
        <Link href={`/repos/${owner}/${repo}/pulls`} className="hover:underline">
          {owner}/{repo}
        </Link>{" "}
        / #{prNumber}
      </nav>

      <header>
        <h1 className="text-xl font-semibold">{pr.title}</h1>
        <p className="text-sm text-black/50 dark:text-white/50">
          #{pr.number} · {pr.author ?? "unknown"} · {pr.headRef} → {pr.baseRef}
        </p>
        {pr.body && (
          <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm text-black/70 dark:text-white/70">
            {pr.body}
          </p>
        )}
      </header>

      <p className="text-xs text-black/50 dark:text-white/50">
        Click a line&rsquo;s gutter to start an AI conversation about it.
      </p>

      <PullDiffs
        files={files}
        prInfo={prInfo}
        threads={threadDTOs}
        models={env.llmModels}
        defaultModel={defaultModel()}
      />
    </div>
  );
}
