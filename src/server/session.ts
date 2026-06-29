import { redirect } from "next/navigation";
import { auth } from "@/server/auth";

// Returns the current session, or null when signed out.
export async function getSession() {
  return auth();
}

// Use in protected server components / actions. Redirects to sign-in when there
// is no authenticated user; otherwise returns the user id.
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  return session.user.id;
}
