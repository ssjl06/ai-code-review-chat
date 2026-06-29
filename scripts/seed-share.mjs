// One-off seed: create a user + thread + messages + share link, print the token.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const token = "demo-share-token-123";

const user = await prisma.user.upsert({
  where: { email: "demo@example.com" },
  update: {},
  create: { email: "demo@example.com", name: "Demo Reviewer", githubLogin: "demo" },
});

const thread = await prisma.thread.create({
  data: {
    userId: user.id,
    repoOwner: "acme",
    repoName: "widgets",
    prNumber: 42,
    filePath: "src/auth/login.ts",
    line: 23,
    side: "RIGHT",
    commitSha: "abc1234",
    diffHunk: [
      "@@ -18,7 +18,9 @@ export async function login(email: string, pw: string) {",
      "   const user = await db.user.findUnique({ where: { email } });",
      "-  if (user.password === pw) {",
      "+  if (user && (await bcrypt.compare(pw, user.passwordHash))) {",
      "+    // TODO: rate-limit failed attempts",
      "     return signSession(user);",
      "   }",
      "   return null;",
    ].join("\n"),
    messages: {
      create: [
        {
          role: "user",
          content: "이 변경에서 보안상 더 살펴봐야 할 부분이 있을까?",
        },
        {
          role: "assistant",
          model: "qwen2.5-coder-32b-instruct",
          content:
            "좋은 방향입니다. bcrypt.compare로 바꾼 건 타이밍 공격에 안전합니다. 다만 두 가지를 권합니다:\n\n1. `user`가 null일 때도 더미 해시로 `bcrypt.compare`를 호출해 사용자 존재 여부에 따른 응답 시간 차이를 없애세요(user enumeration 방지).\n2. TODO로 남긴 rate-limit은 실제로 꼭 필요합니다 — 실패 횟수 기반 지연/잠금을 추가하세요.",
        },
      ],
    },
  },
});

await prisma.shareLink.create({ data: { threadId: thread.id, token } });

console.log("SEEDED token:", token);
await prisma.$disconnect();
