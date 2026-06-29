import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/server/db";
import { encrypt } from "@/server/crypto";
import { env, githubOAuth } from "@/lib/env";

// Wrap the Prisma adapter so GitHub tokens are encrypted before they hit the DB.
function encryptingAdapter(): Adapter {
  const base = PrismaAdapter(prisma);
  return {
    ...base,
    async linkAccount(account) {
      const enc = {
        ...account,
        access_token: account.access_token
          ? encrypt(account.access_token as string)
          : account.access_token,
        refresh_token: account.refresh_token
          ? encrypt(account.refresh_token as string)
          : account.refresh_token,
      };
      await base.linkAccount!(enc);
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: encryptingAdapter(),
  session: { strategy: "database" },
  trustHost: true,
  pages: { signIn: "/" },
  providers: [
    GitHub({
      clientId: env.githubClientId,
      clientSecret: env.githubClientSecret,
      // Point every endpoint at the enterprise host (works for github.com too).
      authorization: {
        url: githubOAuth.authorization,
        // `repo` lets an OAuth App read PRs and post review comments. A GitHub
        // App ignores it (its permissions govern access), so it's safe for both.
        params: { scope: "read:user user:email repo" },
      },
      token: githubOAuth.token,
      userinfo: githubOAuth.userinfo,
    }),
  ],
  callbacks: {
    // Expose the user id on the session for ownership checks.
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
  events: {
    // Persist GitHub identity onto the user (kept out of the adapter's createUser
    // path to avoid BigInt/serialization fragility).
    async signIn({ user, profile }) {
      if (!user.id || !profile) return;
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            githubLogin: (profile.login as string) ?? undefined,
          },
        });
      } catch {
        // Non-fatal: identity columns are best-effort metadata.
      }
    },
  },
});
