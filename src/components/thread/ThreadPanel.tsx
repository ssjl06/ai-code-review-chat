"use client";

import { useState } from "react";
import type { Side } from "@/lib/types";
import {
  createThreadAction,
  postReviewAction,
  createShareLinkAction,
  revokeShareLinkAction,
} from "@/server/actions";
import type { ThreadDTO } from "@/lib/dto";

export interface ThreadAnchor {
  filePath: string;
  line: number;
  startLine?: number | null;
  side: Side;
  startSide?: Side | null;
  diffHunk: string;
}

interface Props {
  prInfo: { repoOwner: string; repoName: string; prNumber: number; headSha: string };
  anchor: ThreadAnchor;
  initialThread?: ThreadDTO;
  models: string[];
  defaultModel: string;
  onClose: () => void;
  onCreated?: (t: ThreadDTO) => void;
}

interface ChatMessage {
  role: string;
  content: string;
}

export default function ThreadPanel({
  prInfo,
  anchor,
  initialThread,
  models,
  defaultModel,
  onClose,
  onCreated,
}: Props) {
  const [threadId, setThreadId] = useState<string | null>(initialThread?.id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialThread?.messages ?? [],
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [model, setModel] = useState(defaultModel);

  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<
    { url: string } | { error: string } | null
  >(initialThread?.postedCommentId ? { url: "" } : null);

  const [shareToken, setShareToken] = useState<string | null>(
    initialThread?.shareToken ?? null,
  );

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setStreaming(true);
    try {
      let tid = threadId;
      if (!tid) {
        const dto = await createThreadAction({
          repoOwner: prInfo.repoOwner,
          repoName: prInfo.repoName,
          prNumber: prInfo.prNumber,
          filePath: anchor.filePath,
          line: anchor.line,
          startLine: anchor.startLine ?? null,
          side: anchor.side,
          startSide: anchor.startSide ?? null,
          commitSha: prInfo.headSha,
          diffHunk: anchor.diffHunk,
        });
        tid = dto.id;
        setThreadId(tid);
        onCreated?.(dto);
      }

      setMessages((m) => [
        ...m,
        { role: "user", content: text },
        { role: "assistant", content: "" },
      ]);
      setInput("");

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: tid, model, content: text }),
      });
      if (!res.ok || !res.body) {
        throw new Error((await res.text()) || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `⚠️ ${(e as Error).message}` },
      ]);
    } finally {
      setStreaming(false);
    }
  }

  async function post() {
    if (!threadId) return;
    setPosting(true);
    setPostResult(null);
    const r = await postReviewAction(threadId, model);
    setPostResult(r.ok ? { url: r.commentUrl } : { error: r.error });
    setPosting(false);
  }

  async function toggleShare() {
    if (!threadId) return;
    if (shareToken) {
      await revokeShareLinkAction(threadId);
      setShareToken(null);
    } else {
      const { token } = await createShareLinkAction(threadId);
      setShareToken(token);
    }
  }

  const rangeLabel =
    anchor.startLine && anchor.startLine !== anchor.line
      ? `lines ${anchor.startLine}–${anchor.line}`
      : `line ${anchor.line}`;
  const shareUrl =
    shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/share/${shareToken}`
      : null;

  return (
    <div className="my-1 rounded-md border border-blue-300 bg-white p-3 text-sm shadow-sm dark:border-blue-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-black/70 dark:text-white/70">
          AI thread · {anchor.side} {rangeLabel}
        </span>
        <button
          onClick={onClose}
          className="text-black/40 hover:text-black/80 dark:text-white/40 dark:hover:text-white/80"
          aria-label="Close thread"
        >
          ✕
        </button>
      </div>

      <div className="mb-2 max-h-80 space-y-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-black/40 dark:text-white/40">
            Ask the AI about this line — bugs, intent, edge cases, alternatives.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "rounded bg-blue-50 px-2 py-1.5 dark:bg-blue-950/40"
                : "rounded bg-black/[0.03] px-2 py-1.5 dark:bg-white/[0.04]"
            }
          >
            <div className="mb-0.5 text-xs font-semibold uppercase text-black/40 dark:text-white/40">
              {m.role}
            </div>
            <div className="whitespace-pre-wrap break-words">{m.content || "…"}</div>
          </div>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="Message the AI… (⌘/Ctrl+Enter to send)"
          className="flex-1 resize-y rounded border border-black/15 bg-transparent px-2 py-1 outline-none focus:border-blue-400 dark:border-white/20"
        />
        <button
          onClick={send}
          disabled={streaming || !input.trim()}
          className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white disabled:opacity-50"
        >
          {streaming ? "…" : "Send"}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {models.length > 1 && (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/20"
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={post}
          disabled={!threadId || posting || streaming}
          className="rounded border border-black/15 px-2 py-1 hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          {posting ? "Posting…" : "Distill & post to GitHub"}
        </button>
        <button
          onClick={toggleShare}
          disabled={!threadId}
          className="rounded border border-black/15 px-2 py-1 hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          {shareToken ? "Revoke share" : "Share"}
        </button>
      </div>

      {postResult && "url" in postResult && postResult.url && (
        <p className="mt-1 text-xs text-green-700 dark:text-green-400">
          Posted ·{" "}
          <a href={postResult.url} target="_blank" className="underline">
            view on GitHub
          </a>
        </p>
      )}
      {postResult && "url" in postResult && !postResult.url && (
        <p className="mt-1 text-xs text-green-700 dark:text-green-400">
          Already posted to GitHub.
        </p>
      )}
      {postResult && "error" in postResult && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          {postResult.error}
        </p>
      )}
      {shareUrl && (
        <p className="mt-1 break-all text-xs text-black/50 dark:text-white/50">
          Read-only link: <span className="underline">{shareUrl}</span>
        </p>
      )}
    </div>
  );
}
