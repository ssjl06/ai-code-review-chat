"use client";

import { useEffect, useState } from "react";
import type { DiffFile } from "@/lib/types";
import type { ThreadDTO } from "@/lib/dto";
import FileDiff from "@/components/diff/FileDiff";

type ViewType = "unified" | "split";

interface Props {
  files: DiffFile[];
  prInfo: { repoOwner: string; repoName: string; prNumber: number; headSha: string };
  threads: ThreadDTO[];
  models: string[];
  defaultModel: string;
}

export default function PullDiffs({
  files,
  prInfo,
  threads,
  models,
  defaultModel,
}: Props) {
  const [viewType, setViewType] = useState<ViewType>("split");

  // Remember the user's preference across PRs (overrides the default).
  useEffect(() => {
    const saved = localStorage.getItem("diffViewType");
    if (saved === "split" || saved === "unified") setViewType(saved);
  }, []);
  function choose(v: ViewType) {
    setViewType(v);
    localStorage.setItem("diffViewType", v);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-1 text-xs">
        <span className="mr-1 text-black/50 dark:text-white/50">View:</span>
        {(["unified", "split"] as const).map((v) => (
          <button
            key={v}
            onClick={() => choose(v)}
            aria-pressed={viewType === v}
            className={
              viewType === v
                ? "rounded bg-black px-2 py-1 font-medium text-white dark:bg-white dark:text-black"
                : "rounded border border-black/15 px-2 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            }
          >
            {v === "unified" ? "Unified" : "Split"}
          </button>
        ))}
      </div>

      {files.map((file) => (
        <FileDiff
          key={file.filename}
          file={file}
          prInfo={prInfo}
          threadsForFile={threads.filter((t) => t.filePath === file.filename)}
          models={models}
          defaultModel={defaultModel}
          viewType={viewType}
        />
      ))}
    </div>
  );
}
