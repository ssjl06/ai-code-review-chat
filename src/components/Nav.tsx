import Link from "next/link";
import { auth, signIn, signOut } from "@/server/auth";

export default async function Nav() {
  const session = await auth();
  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href={session?.user ? "/repos" : "/"} className="font-semibold">
          AI Code Review
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {session?.user ? (
            <>
              <span className="text-black/60 dark:text-white/60">
                {session.user.name ?? session.user.email}
              </span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button className="rounded border border-black/15 px-3 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <form
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/repos" });
              }}
            >
              <button className="rounded bg-black px-3 py-1 text-white hover:opacity-90 dark:bg-white dark:text-black">
                Sign in with GitHub
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
