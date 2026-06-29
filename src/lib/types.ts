// Shared domain types used across server and client.

export type Side = "LEFT" | "RIGHT";

export interface RepoSummary {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  description: string | null;
  updatedAt: string | null;
}

export interface PullSummary {
  number: number;
  title: string;
  state: string;
  author: string | null;
  authorAvatar: string | null;
  updatedAt: string | null;
  headSha: string;
  draft: boolean;
}

export interface PullDetail extends PullSummary {
  body: string | null;
  baseRef: string;
  headRef: string;
}

export interface DiffFile {
  filename: string;
  previousFilename?: string;
  status: string; // added | modified | removed | renamed | ...
  additions: number;
  deletions: number;
  // Unified-diff patch for this file. Null for binary/too-large files.
  patch: string | null;
}

// The exact parameters needed to anchor (and later post) a review comment.
export interface LineAnchor {
  filePath: string;
  line: number;
  startLine?: number;
  side: Side;
  startSide?: Side;
  commitSha: string;
  diffHunk: string;
}
