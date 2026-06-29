// Compare OLD vs NEW distill prompt on the real exploratory conversation,
// WITHOUT posting to GitHub. Mirrors src/server/llm.ts prompt construction.
import { readFileSync } from "node:fs";

const KEY = process.env.LLM_API_KEY;
const BASE = "https://api.groq.com/openai/v1";
const MODEL = "llama-3.3-70b-versatile";

const diffHunk = readFileSync(process.argv[2], "utf8").trim();

const SYSTEM = `You are an expert software engineer assisting with a code review.
You are discussing a specific line (or range) of a pull request diff with a reviewer.
Be precise and concrete. Reference the diff and surrounding code. When you spot bugs,
edge cases, security issues, or clarity problems, call them out plainly. Keep answers
focused on the code in question. When asked to produce a review comment, write a concise,
actionable comment a maintainer could post directly.`;

const contextBlock = [
  "Repository: ssjl06/CRA_AI_0610",
  "Pull request: docs: feature/polite → master PR",
  "PR description:\n## 개요\nfeature/polite 브랜치의 README 변경사항을 master에 병합합니다.\n## 변경 사항\n- README 공손한 말투로 수정\n- README 무례한 말투로 수정\n- polite/rude 두 말투 버전 병합",
  "File: README.md",
  "Anchored at: line 5 (RIGHT)",
  "",
  "Diff hunk under discussion:",
  "```diff",
  diffHunk,
  "```",
].join("\n");

const history = [
  { role: "user", content: "이건 뭐지?" },
  { role: "user", content: "ㅇㅇ?" },
  { role: "user", content: "이건 무슨 코드지?" },
  { role: "assistant", content: "이 코드는 Markdown 형식의 .diff 파일입니다. README.md 파일의 변경 사항을 보여주는 Diff hunk입니다." },
  { role: "user", content: "이 PR 은 어떤 내용의 PR 이지?" },
  { role: "assistant", content: "이 PR은 README.md 파일의 문장을 공손한 말투와 무례한 말투 두 가지 버전으로 수정한 내용을 master 브랜치에 병합하는 것입니다." },
];

const base = [
  { role: "user", content: `Here is the context for our discussion. Acknowledge briefly only if I ask a question.\n\n${contextBlock}` },
  { role: "assistant", content: "Understood. What would you like to discuss?" },
  ...history,
];

const OLD_INSTR =
  "Based on our conversation, write a single concise inline review comment to post on this line of the PR. " +
  "Output only the comment body in GitHub-flavored Markdown — no preamble, no quotes around it.";

const NEW_INSTR =
  "Write a single inline review comment for this line that captures the conclusion of OUR conversation above.\n" +
  "Strict rules:\n" +
  "- Base the comment ONLY on what we actually discussed. Do NOT introduce new issues, bugs, or suggestions that were not raised in the conversation.\n" +
  "- If the conversation was exploratory and reached no concrete review point (e.g. I only asked what the code does), write a brief, faithful note reflecting what was actually discussed — an observation or open question — rather than inventing a critique.\n" +
  "- Match the language of the conversation.\n" +
  "Output only the comment body in GitHub-flavored Markdown — no preamble, no surrounding quotes.";

async function run(label, instr, temperature) {
  const messages = [
    { role: "system", content: SYSTEM },
    ...base,
    { role: "user", content: instr },
  ];
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, messages, temperature }),
  });
  const data = await res.json();
  console.log(`\n===== ${label} =====`);
  console.log(data.choices?.[0]?.message?.content ?? JSON.stringify(data));
}

await run("OLD prompt (temp 1.0)", OLD_INSTR, 1.0);
await run("NEW prompt (temp 0.2)", NEW_INSTR, 0.2);
