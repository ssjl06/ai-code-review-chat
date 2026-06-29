import Link from "next/link";
import { requireUserId } from "@/server/session";
import { listRepos } from "@/server/github";

export const dynamic = "force-dynamic";

export default async function ReposPage() {
  const userId = await requireUserId();

  let repos;
  try {
    repos = await listRepos(userId);
  } catch (err) {
    return (
      <ErrorState
        message={err instanceof Error ? err.message : "Failed to load repositories."}
      />
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Repositories</h1>
      {repos.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">
          No repositories found. Make sure the GitHub App is installed on the
          repositories you want to review.
        </p>
      ) : (
        <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/15 dark:border-white/15">
          {repos.map((r) => (
            <li key={r.fullName}>
              <Link
                href={`/repos/${r.owner}/${r.name}/pulls`}
                className="flex items-center justify-between px-4 py-3 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium">{r.fullName}</span>
                  {r.private && (
                    <span className="rounded bg-black/10 px-1.5 py-0.5 text-xs dark:bg-white/15">
                      private
                    </span>
                  )}
                </span>
                {r.description && (
                  <span className="ml-4 truncate text-sm text-black/50 dark:text-white/50">
                    {r.description}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      {message}
    </div>
  );
}
