// ============================================================
// BODHI — GitHub Types
// ============================================================

export interface GitHubConfig {
  token: string;
  repos?: string[]; // ["owner/repo", ...] — if empty, auto-discovers
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  repo: string;
  url: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  author: string;
  repo: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  additions: number;
  deletions: number;
  draft: boolean;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  author: string;
  repo: string;
  createdAt: string;
  labels: string[];
  url: string;
}
