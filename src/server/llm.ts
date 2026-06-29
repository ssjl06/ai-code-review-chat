import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ModelMessage } from "ai";
import { env, defaultModel } from "@/lib/env";

// OpenAI-compatible provider pointed at LiteLLM / vLLM.
const provider = createOpenAICompatible({
  name: "litellm",
  baseURL: env.llmBaseUrl,
  apiKey: env.llmApiKey,
});

export function getModel(modelId?: string) {
  const id = modelId && env.llmModels.includes(modelId) ? modelId : defaultModel();
  return { id, model: provider(id) };
}

const SYSTEM_PROMPT = `You are an expert software engineer assisting with a code review.
You are discussing a specific line (or range) of a pull request diff with a reviewer.
Be precise and concrete. Reference the diff and surrounding code. When you spot bugs,
edge cases, security issues, or clarity problems, call them out plainly. Keep answers
focused on the code in question. When asked to produce a review comment, write a concise,
actionable comment a maintainer could post directly.`;

export interface ThreadContext {
  prTitle: string;
  prBody: string | null;
  repoFullName: string;
  filePath: string;
  side: string;
  line: number;
  startLine?: number | null;
  diffHunk: string;
  surroundingCode?: string | null;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

// Assemble the system prompt + a context preamble + prior turns into model messages.
export function buildMessages(
  ctx: ThreadContext,
  history: HistoryMessage[],
): { system: string; messages: ModelMessage[] } {
  const range =
    ctx.startLine && ctx.startLine !== ctx.line
      ? `lines ${ctx.startLine}–${ctx.line} (${ctx.side})`
      : `line ${ctx.line} (${ctx.side})`;

  const contextBlock = [
    `Repository: ${ctx.repoFullName}`,
    `Pull request: ${ctx.prTitle}`,
    ctx.prBody ? `PR description:\n${truncate(ctx.prBody, 1500)}` : null,
    `File: ${ctx.filePath}`,
    `Anchored at: ${range}`,
    "",
    "Diff hunk under discussion:",
    "```diff",
    truncate(ctx.diffHunk, 4000),
    "```",
    ctx.surroundingCode
      ? `\nSurrounding source for context:\n\`\`\`\n${truncate(
          ctx.surroundingCode,
          3000,
        )}\n\`\`\``
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const messages: ModelMessage[] = [
    {
      role: "user",
      content: `Here is the context for our discussion. Acknowledge briefly only if I ask a question.\n\n${contextBlock}`,
    },
    { role: "assistant", content: "Understood. What would you like to discuss?" },
    ...history.map((m) => ({ role: m.role, content: m.content }) as ModelMessage),
  ];

  return { system: SYSTEM_PROMPT, messages };
}

// One-shot prompt: condense a conversation into a postable review comment.
export function buildDistillMessages(
  ctx: ThreadContext,
  history: HistoryMessage[],
): { system: string; messages: ModelMessage[] } {
  const base = buildMessages(ctx, history);
  return {
    system: base.system,
    messages: [
      ...base.messages,
      {
        role: "user",
        content:
          "Write a single inline review comment for this line that captures the conclusion of OUR conversation above.\n" +
          "Strict rules:\n" +
          "- Base the comment ONLY on what we actually discussed. Do NOT introduce new issues, bugs, or suggestions that were not raised in the conversation.\n" +
          "- If the conversation was exploratory and reached no concrete review point (e.g. I only asked what the code does), write a brief, faithful note reflecting what was actually discussed — an observation or open question — rather than inventing a critique.\n" +
          "- Match the language of the conversation.\n" +
          "Output only the comment body in GitHub-flavored Markdown — no preamble, no surrounding quotes.",
      },
    ],
  };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "\n…[truncated]";
}
