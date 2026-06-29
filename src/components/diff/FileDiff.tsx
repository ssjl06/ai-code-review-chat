"use client";

import { useMemo, useState } from "react";
import {
  Diff,
  Hunk,
  parseDiff,
  getChangeKey,
  type ChangeData,
  type HunkData,
} from "react-diff-view";
import "react-diff-view/style/index.css";
import "./diff-theme.css";
import type { DiffFile, Side } from "@/lib/types";
import { buildUnifiedDiff, languageFromPath } from "@/lib/diff";
import { highlightHunks } from "@/lib/highlight";
import { changeToAnchor, hunkToText, type DiffHunk } from "@/lib/diff-anchor";
import ThreadPanel, { type ThreadAnchor } from "@/components/thread/ThreadPanel";
import { refreshThreadAction } from "@/server/actions";
import type { ThreadDTO } from "@/lib/dto";

interface Props {
  file: DiffFile;
  prInfo: { repoOwner: string; repoName: string; prNumber: number; headSha: string };
  threadsForFile: ThreadDTO[];
  models: string[];
  defaultModel: string;
  viewType?: "unified" | "split";
}

function sideLineKey(side: Side, line: number): string {
  return `${side}:${line}`;
}

export default function FileDiff({
  file,
  prInfo,
  threadsForFile,
  models,
  defaultModel,
  viewType = "unified",
}: Props) {
  const diffText = useMemo(() => buildUnifiedDiff(file), [file]);
  const parsed = useMemo(
    () => (diffText ? parseDiff(diffText)[0] : null),
    [diffText],
  );
  // Syntax-highlight tokens for the diff (undefined → render without colors).
  const tokens = useMemo(
    () => (parsed ? highlightHunks(parsed.hunks, languageFromPath(file.filename)) : undefined),
    [parsed, file.filename],
  );

  const [threads, setThreads] = useState<ThreadDTO[]>(threadsForFile);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [composer, setComposer] = useState<{
    changeKey: string;
    anchor: ThreadAnchor;
  } | null>(null);
  // Once the composer creates a thread, that thread is shown by the (still
  // mounted) composer panel — don't also render it from the threads loop.
  const [composerThreadId, setComposerThreadId] = useState<string | null>(null);

  // Index every change by side:line so threads/clicks can resolve to a change key.
  const changeIndex = useMemo(() => {
    const map = new Map<string, { change: ChangeData; hunk: HunkData }>();
    parsed?.hunks.forEach((hunk) => {
      hunk.changes.forEach((change) => {
        const a = changeToAnchor(change as never);
        map.set(sideLineKey(a.side, a.line), { change, hunk });
      });
    });
    return map;
  }, [parsed]);

  function anchorFromChange(change: ChangeData, hunk: HunkData): ThreadAnchor {
    const a = changeToAnchor(change as never);
    return {
      filePath: file.filename,
      line: a.line,
      side: a.side,
      diffHunk: hunkToText(hunk as unknown as DiffHunk),
    };
  }

  const onGutterClick = (args: { change: ChangeData | null }) => {
    const change = args.change;
    if (!change) return;
    const a = changeToAnchor(change as never);
    const key = sideLineKey(a.side, a.line);
    const entry = changeIndex.get(key);
    if (!entry) return;
    const gck = getChangeKey(change);

    // If a thread already exists on this line, just expand it.
    if (threads.some((t) => sideLineKey(t.side, t.line) === key)) {
      setExpanded((s) => new Set(s).add(gck));
      setComposer(null);
      return;
    }
    setComposer({ changeKey: gck, anchor: anchorFromChange(change, entry.hunk) });
  };

  // Build the widget map (inline panels under specific lines).
  const widgets: Record<string, React.ReactNode> = {};
  const orphanThreads: ThreadDTO[] = [];

  for (const t of threads) {
    // Skip the thread currently owned by the open composer panel.
    if (composer && t.id === composerThreadId) continue;
    const entry = changeIndex.get(sideLineKey(t.side, t.line));
    if (!entry) {
      orphanThreads.push(t); // line no longer in diff (likely outdated)
      continue;
    }
    const gck = getChangeKey(entry.change);
    const anchor = anchorFromChange(entry.change, entry.hunk);
    widgets[gck] = expanded.has(gck) ? (
      <ThreadPanel
        key={t.id}
        prInfo={prInfo}
        anchor={anchor}
        initialThread={t}
        models={models}
        defaultModel={defaultModel}
        onClose={() =>
          setExpanded((s) => {
            const n = new Set(s);
            n.delete(gck);
            return n;
          })
        }
      />
    ) : (
      <button
        key={t.id}
        onClick={() => setExpanded((s) => new Set(s).add(gck))}
        className="my-1 flex w-full items-center gap-2 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-left text-xs text-blue-800 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200"
      >
        💬 AI thread · {t.messages.length} message
        {t.messages.length === 1 ? "" : "s"}
        {t.postedCommentId ? " · posted" : ""} — open
      </button>
    );
  }

  if (composer) {
    const gck = composer.changeKey;
    widgets[gck] = (
      <ThreadPanel
        prInfo={prInfo}
        anchor={composer.anchor}
        models={models}
        defaultModel={defaultModel}
        onClose={async () => {
          // Pull the persisted conversation into the threads list, then collapse.
          if (composerThreadId) {
            const fresh = await refreshThreadAction(composerThreadId);
            if (fresh) {
              setThreads((prev) =>
                prev.map((t) => (t.id === fresh.id ? fresh : t)),
              );
            }
          }
          setComposer(null);
          setComposerThreadId(null);
        }}
        onCreated={(dto) => {
          // Keep the composer mounted (so the live chat survives); just record
          // the thread so it isn't double-rendered and persists after close.
          setThreads((prev) => [...prev, dto]);
          setComposerThreadId(dto.id);
        }}
      />
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
      <div className="flex items-center justify-between bg-black/[0.03] px-3 py-2 text-sm dark:bg-white/[0.04]">
        <span className="font-mono">{file.filename}</span>
        <span className="text-xs text-black/50 dark:text-white/50">
          +{file.additions} −{file.deletions}
        </span>
      </div>

      {!parsed ? (
        <div className="px-3 py-4 text-sm text-black/50 dark:text-white/50">
          No textual diff available (binary or too large).
        </div>
      ) : (
        <div className="diff-wrapper overflow-x-auto text-xs">
          <Diff
            viewType={viewType}
            diffType={parsed.type}
            hunks={parsed.hunks}
            tokens={tokens}
            widgets={widgets}
            gutterType="default"
            gutterEvents={{ onClick: onGutterClick }}
          >
            {(hunks) => hunks.map((h) => <Hunk key={h.content} hunk={h} />)}
          </Diff>
        </div>
      )}

      {orphanThreads.length > 0 && (
        <div className="border-t border-black/10 px-3 py-2 dark:border-white/15">
          <p className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-400">
            Outdated threads (line no longer in the current diff)
          </p>
          {orphanThreads.map((t) => (
            <ThreadPanel
              key={t.id}
              prInfo={prInfo}
              anchor={{
                filePath: t.filePath,
                line: t.line,
                startLine: t.startLine,
                side: t.side,
                startSide: t.startSide,
                diffHunk: "",
              }}
              initialThread={t}
              models={models}
              defaultModel={defaultModel}
              onClose={() => {}}
            />
          ))}
        </div>
      )}
    </section>
  );
}
