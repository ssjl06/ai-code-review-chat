import Link from "next/link";
import { requireUserId } from "@/server/session";
import { listOpenPulls } from "@/server/github";

export const dynamic = "force-dynamic";

export default async function PullsPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const userId = await requireUserId();
  const { owner, repo } = await params;

  let pulls;
  try {
    pulls = await listOpenPulls(userId, owner, repo);
  } catch (err) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        {err instanceof Error ? err.message : "Failed to load pull requests."}
      </div>
    );
  }

  return (
    <div>
      <nav className="mb-4 text-sm text-black/50 dark:text-white/50">
        <Link href="/repos" className="hover:underline">
          Repositories
        </Link>{" "}
        / {owner}/{repo}
      </nav>
      <h1 className="mb-4 text-xl font-semibold">Open pull requests</h1>
      {pulls.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">No open pull requests.</p>
      ) : (
        <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/15 dark:border-white/15">
          {pulls.map((p) => (
            <li key={p.number}>
              <Link
                href={`/repos/${owner}/${repo}/pulls/${p.number}`}
                className="block px-4 py-3 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.title}</span>
                  {p.draft && (
                    <span className="rounded bg-black/10 px-1.5 py-0.5 text-xs dark:bg-white/15">
                      draft
                    </span>
                  )}
                </div>
                <div className="text-sm text-black/50 dark:text-white/50">
                  #{p.number} · {p.author ?? "unknown"}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
