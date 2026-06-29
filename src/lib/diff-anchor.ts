import type { Side } from "@/lib/types";

// Map react-diff-view change/hunk objects to the parameters GitHub's
// review-comment API expects. Kept pure so it can be unit-tested without React.

// Minimal shapes from react-diff-view / gitdiff-parser.
export interface DiffChange {
  type: "insert" | "delete" | "normal";
  content: string;
  isInsert?: boolean;
  isDelete?: boolean;
  isNormal?: boolean;
  // For insert/delete react-diff-view exposes `lineNumber`; for normal it
  // exposes old/new line numbers separately.
  lineNumber?: number;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  content: string; // the "@@ -a,b +c,d @@" header line
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: DiffChange[];
}

export interface SingleAnchor {
  line: number;
  side: Side;
}

// Resolve a single change to its GitHub { line, side }.
//  - inserted / context lines anchor on the RIGHT (new file) side
//  - deleted lines anchor on the LEFT (old file) side
export function changeToAnchor(change: DiffChange): SingleAnchor {
  if (change.type === "delete") {
    return { side: "LEFT", line: change.lineNumber ?? change.oldLineNumber ?? 0 };
  }
  if (change.type === "insert") {
    return { side: "RIGHT", line: change.lineNumber ?? change.newLineNumber ?? 0 };
  }
  // normal / context line
  return { side: "RIGHT", line: change.newLineNumber ?? 0 };
}

// Stable key for a change, used to address lines in the UI and find threads.
export function changeKey(change: DiffChange): string {
  const { side, line } = changeToAnchor(change);
  return `${side}:${line}`;
}

// Reconstruct the unified-diff text for a hunk (header + its lines). Stored on
// the thread for LLM context and for re-anchoring after a force-push.
export function hunkToText(hunk: DiffHunk): string {
  const prefix = (c: DiffChange) =>
    c.type === "insert" ? "+" : c.type === "delete" ? "-" : " ";
  const lines = hunk.changes.map((c) => prefix(c) + c.content);
  return [hunk.content, ...lines].join("\n");
}

// Build a (possibly multi-line) anchor from a selection of changes within one
// hunk. GitHub requires both ends of a range on the same side.
export interface RangeAnchor {
  line: number;
  side: Side;
  startLine?: number;
  startSide?: Side;
}

export function buildRangeAnchor(
  start: DiffChange,
  end: DiffChange,
): RangeAnchor {
  const a = changeToAnchor(start);
  const b = changeToAnchor(end);

  // Single line.
  if (a.line === b.line && a.side === b.side) {
    return { line: a.line, side: a.side };
  }

  // Order so the smaller line number is the start. Mixed sides are not allowed
  // by GitHub — fall back to anchoring on the end line only.
  if (a.side !== b.side) {
    return { line: b.line, side: b.side };
  }
  const [lo, hi] = a.line <= b.line ? [a, b] : [b, a];
  return { line: hi.line, side: hi.side, startLine: lo.line, startSide: lo.side };
}
