"use client";

import { useEffect, useState } from "react";
import type { DiffFile } from "@/lib/types";
import type { ThreadDTO } from "@/lib/dto";
import FileDiff from "@/components/diff/FileDiff";
import FileTree from "@/components/diff/FileTree";
import { fileAnchorId } from "@/lib/diff";

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
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("diffViewType");
    if (saved === "split" || saved === "unified") setViewType(saved);
  }, []);
  function choose(v: ViewType) {
    setViewType(v);
    localStorage.setItem("diffViewType", v);
  }

  const toggleCollapse = (name: string) =>
    setCollapsedFiles((s) => {
      const n = new Set(s);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  const collapseAll = () => setCollapsedFiles(new Set(files.map((f) => f.filename)));
  const expandAll = () => setCollapsedFiles(new Set());

  function jumpTo(path: string) {
    // Expand the target file if it was collapsed, then scroll to it.
    setCollapsedFiles((s) => {
      if (!s.has(path)) return s;
      const n = new Set(s);
      n.delete(path);
      return n;
    });
    requestAnimationFrame(() =>
      document
        .getElementById(fileAnchorId(path))
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  const btn =
    "rounded border border-black/15 px-2 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-1 text-xs">
        <button onClick={() => setSidebarOpen((o) => !o)} className={`${btn} lg:hidden`}>
          ☰ Files
        </button>
        <button onClick={expandAll} className={btn}>
          Expand all
        </button>
        <button onClick={collapseAll} className={btn}>
          Collapse all
        </button>
        <span className="mx-1 text-black/30 dark:text-white/30">|</span>
        <span className="mr-1 text-black/50 dark:text-white/50">View:</span>
        {(["unified", "split"] as const).map((v) => (
          <button
            key={v}
            onClick={() => choose(v)}
            aria-pressed={viewType === v}
            className={
              viewType === v
                ? "rounded bg-black px-2 py-1 font-medium text-white dark:bg-white dark:text-black"
                : btn
            }
          >
            {v === "unified" ? "Unified" : "Split"}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        <aside
          className={`${
            sidebarOpen ? "block" : "hidden lg:block"
          } sticky top-4 max-h-[85vh] w-64 shrink-0 self-start overflow-auto rounded-lg border border-black/10 p-2 dark:border-white/15`}
        >
          <FileTree
            files={files.map((f) => ({
              filename: f.filename,
              additions: f.additions,
              deletions: f.deletions,
            }))}
            onSelect={(p) => {
              jumpTo(p);
              setSidebarOpen(false);
            }}
          />
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          {files.map((file) => (
            <FileDiff
              key={file.filename}
              file={file}
              prInfo={prInfo}
              threadsForFile={threads.filter((t) => t.filePath === file.filename)}
              models={models}
              defaultModel={defaultModel}
              viewType={viewType}
              collapsed={collapsedFiles.has(file.filename)}
              onToggleCollapse={() => toggleCollapse(file.filename)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
