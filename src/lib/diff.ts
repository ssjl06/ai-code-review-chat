import type { DiffFile } from "@/lib/types";

// GitHub's listFiles returns only the hunk body in `patch` (starting at `@@`).
// react-diff-view's parseDiff expects a full unified-diff with file headers, so
// we synthesize a minimal but valid header. Line numbers come from the `@@`
// markers, so generic a/ b/ paths are sufficient.
export function buildUnifiedDiff(file: DiffFile): string | null {
  if (!file.patch) return null;

  const newPath = file.filename;
  const oldPath = file.previousFilename ?? file.filename;

  const header: string[] = [`diff --git a/${oldPath} b/${newPath}`];

  if (file.status === "added") {
    header.push("--- /dev/null", `+++ b/${newPath}`);
  } else if (file.status === "removed") {
    header.push(`--- a/${oldPath}`, "+++ /dev/null");
  } else {
    header.push(`--- a/${oldPath}`, `+++ b/${newPath}`);
  }

  return `${header.join("\n")}\n${file.patch}\n`;
}

// Stable DOM id for a file's diff section, used by the file-tree jump links.
export function fileAnchorId(path: string): string {
  return "file-" + path.replace(/[^a-zA-Z0-9]+/g, "-");
}

// Language hint for syntax highlighting, derived from file extension.
export function languageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    rb: "ruby",
    php: "php",
    c: "c",
    h: "c",
    cpp: "cpp",
    cs: "csharp",
    css: "css",
    scss: "scss",
    html: "markup",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    md: "markdown",
    sh: "bash",
    sql: "sql",
  };
  return map[ext] ?? "text";
}
