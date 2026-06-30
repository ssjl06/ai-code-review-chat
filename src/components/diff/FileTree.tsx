"use client";

import { useMemo, useState } from "react";

interface TreeNode {
  name: string;
  path: string; // full path for files; folder path for dirs
  isFile: boolean;
  children: TreeNode[];
  // file stats (leaves only)
  additions?: number;
  deletions?: number;
}

export interface FileEntry {
  filename: string;
  additions: number;
  deletions: number;
}

function buildTree(files: FileEntry[]): TreeNode {
  const root: TreeNode = { name: "", path: "", isFile: false, children: [] };
  for (const f of files) {
    const parts = f.filename.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      let child = node.children.find((c) => c.name === part && c.isFile === isFile);
      if (!child) {
        child = {
          name: part,
          path: isFile ? f.filename : parts.slice(0, i + 1).join("/"),
          isFile,
          children: [],
          ...(isFile ? { additions: f.additions, deletions: f.deletions } : {}),
        };
        node.children.push(child);
      }
      node = child;
    });
  }
  // folders first, then files; alphabetical within each
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) =>
      a.isFile === b.isFile ? a.name.localeCompare(b.name) : a.isFile ? 1 : -1,
    );
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

function Row({
  node,
  depth,
  collapsed,
  toggle,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  toggle: (p: string) => void;
  onSelect: (path: string) => void;
}) {
  const pad = { paddingLeft: `${depth * 12 + 8}px` };
  if (node.isFile) {
    return (
      <button
        onClick={() => onSelect(node.path)}
        title={node.path}
        style={pad}
        className="flex w-full items-center justify-between gap-2 rounded py-1 pr-2 text-left text-xs hover:bg-black/5 dark:hover:bg-white/10"
      >
        <span className="truncate font-mono">{node.name}</span>
        <span className="shrink-0 tabular-nums text-[10px]">
          <span className="text-green-600 dark:text-green-400">+{node.additions}</span>{" "}
          <span className="text-red-600 dark:text-red-400">−{node.deletions}</span>
        </span>
      </button>
    );
  }
  const isCollapsed = collapsed.has(node.path);
  return (
    <div>
      <button
        onClick={() => toggle(node.path)}
        style={pad}
        className="flex w-full items-center gap-1 rounded py-1 pr-2 text-left text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10"
      >
        <span className="text-black/40 dark:text-white/40">
          {isCollapsed ? "▶" : "▼"}
        </span>
        <span className="truncate">{node.name}/</span>
      </button>
      {!isCollapsed &&
        node.children.map((c) => (
          <Row
            key={c.path + (c.isFile ? "f" : "d")}
            node={c}
            depth={depth + 1}
            collapsed={collapsed}
            toggle={toggle}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

export default function FileTree({
  files,
  onSelect,
}: {
  files: FileEntry[];
  onSelect: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const toggle = (p: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      n.has(p) ? n.delete(p) : n.add(p);
      return n;
    });

  const query = q.trim().toLowerCase();
  const matches = query
    ? files.filter((f) => f.filename.toLowerCase().includes(query))
    : [];

  return (
    <nav className="text-black/80 dark:text-white/80">
      <div className="mb-1 px-2 text-xs font-semibold text-black/50 dark:text-white/50">
        {files.length} changed file{files.length === 1 ? "" : "s"}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter files…"
        className="mb-2 w-full rounded border border-black/15 bg-transparent px-2 py-1 text-xs outline-none focus:border-blue-400 dark:border-white/20"
      />
      {query ? (
        matches.length === 0 ? (
          <div className="px-2 py-1 text-xs text-black/40 dark:text-white/40">
            No matching files
          </div>
        ) : (
          matches.map((f) => (
            <button
              key={f.filename}
              onClick={() => onSelect(f.filename)}
              title={f.filename}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs hover:bg-black/5 dark:hover:bg-white/10"
            >
              <span className="truncate font-mono">{f.filename}</span>
              <span className="shrink-0 tabular-nums text-[10px]">
                <span className="text-green-600 dark:text-green-400">+{f.additions}</span>{" "}
                <span className="text-red-600 dark:text-red-400">−{f.deletions}</span>
              </span>
            </button>
          ))
        )
      ) : (
        tree.children.map((c) => (
          <Row
            key={c.path + (c.isFile ? "f" : "d")}
            node={c}
            depth={0}
            collapsed={collapsed}
            toggle={toggle}
            onSelect={onSelect}
          />
        ))
      )}
    </nav>
  );
}
