// Create a test C++ file on a new branch + open a PR in a CRA repo, using the
// GitHub token stored (encrypted) by the app. For verifying syntax highlighting.
import { readFileSync } from "node:fs";
import { createDecipheriv } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// --- load env from .env.local ---
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
process.env.DATABASE_URL = env.DATABASE_URL;

// --- decrypt (mirrors src/server/crypto.ts) ---
function decrypt(payload) {
  const [iv, tag, data] = payload.split(".");
  const key = Buffer.from(env.TOKEN_ENC_KEY, "base64");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

const prisma = new PrismaClient();
const account = await prisma.account.findFirst({ where: { provider: "github" } });
const token = decrypt(account.access_token);
await prisma.$disconnect();

const OWNER = "ssjl06";
const REPO = "CRA_repo";
const BRANCH = "test/cpp-syntax-highlight";
const PATH = "src/greeter.cpp";

const gh = (path, init = {}) =>
  fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

const cpp = `#include <iostream>
#include <vector>
#include <string>

// Greeter demonstrates C++ syntax highlighting in the diff viewer.
namespace demo {

template <typename T>
class Greeter {
public:
    explicit Greeter(const std::string& name) : name_(name) {}

    void greet(const T& value) const {
        std::cout << "Hello, " << name_ << "! value = " << value << std::endl;
    }

private:
    std::string name_;
};

}  // namespace demo

int main() {
    const int count = 42;
    std::vector<double> nums = {1.5, 2.0, 3.14};
    demo::Greeter<int> g("world");
    g.greet(count);
    for (const auto& n : nums) {
        std::cout << n << '\\n';
    }
    return 0;
}
`;

// 1) default branch + its head sha
const repoInfo = await (await gh("")).json();
const base = repoInfo.default_branch;
const ref = await (await gh(`/git/ref/heads/${base}`)).json();
const baseSha = ref.object.sha;
console.log("base branch:", base, "sha:", baseSha.slice(0, 7));

// 2) create the branch (ignore "already exists")
const mk = await gh("/git/refs", {
  method: "POST",
  body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: baseSha }),
});
console.log("create branch:", mk.status);

// 3) put the file on the branch
const put = await gh(`/contents/${PATH}`, {
  method: "PUT",
  body: JSON.stringify({
    message: "test: add C++ file to verify syntax highlighting",
    content: Buffer.from(cpp).toString("base64"),
    branch: BRANCH,
  }),
});
console.log("put file:", put.status);

// 4) open the PR
const pr = await gh("/pulls", {
  method: "POST",
  body: JSON.stringify({
    title: "test: C++ syntax highlighting sample",
    head: BRANCH,
    base,
    body: "Adds a small C++ file to verify diff syntax highlighting in the code-review app.",
  }),
});
const prData = await pr.json();
console.log("create PR:", pr.status);
console.log("PR_NUMBER:", prData.number);
console.log("PR_URL:", prData.html_url);
