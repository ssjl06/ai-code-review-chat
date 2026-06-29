import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import { auth, signIn } from "@/server/auth";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/repos");

  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">
          Review pull requests with line-by-line AI conversations
        </h1>
        <p className="text-black/60 dark:text-white/60">
          Connect GitHub, open a PR diff, and start an AI chat thread on any
          line. Distill the conversation into a real inline review comment and
          post it back to the PR.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/repos" });
          }}
        >
          <button className="rounded-lg bg-black px-5 py-2.5 font-medium text-white hover:opacity-90 dark:bg-white dark:text-black">
            Sign in with GitHub
          </button>
        </form>
      </main>
    </>
  );
}
