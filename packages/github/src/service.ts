// ============================================================
// BODHI — GitHub Service
// Tracks commits, PRs, and issues across configured repos
// ============================================================

import type { GitHubConfig, GitHubCommit, GitHubPR, GitHubIssue } from "./types.js";

export class GitHubService {
  private token: string;
  private repos: string[];
  private discoveredRepos: string[] | null = null;
  private baseUrl = "https://api.github.com";

  constructor(config: GitHubConfig) {
    this.token = config.token;
    this.repos = config.repos || [];
  }

  // --- Core API Methods ---

  async getRecentCommits(limit = 15): Promise<GitHubCommit[]> {
    const repos = await this.getRepos();
    const allCommits: GitHubCommit[] = [];

    const perRepo = Math.max(5, Math.ceil(limit / repos.length));

    await Promise.all(
      repos.map(async (repo) => {
        try {
          const data = await this.githubFetch<any[]>(
            `/repos/${repo}/commits?per_page=${perRepo}`
          );
          const commits = data.map((c: any) => ({
            sha: c.sha.slice(0, 7),
            message: c.commit.message.split("\n")[0], // First line only
            author: c.commit.author?.name || c.author?.login || "unknown",
            date: c.commit.author?.date || "",
            repo,
            url: c.html_url,
          }));
          allCommits.push(...commits);
        } catch (err) {
          console.error(`[github] Failed to fetch commits for ${repo}:`, err instanceof Error ? err.message : err);
        }
      })
    );

    return allCommits
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
  }

  async getOpenPRs(): Promise<GitHubPR[]> {
    const repos = await this.getRepos();
    const allPRs: GitHubPR[] = [];

    await Promise.all(
      repos.map(async (repo) => {
        try {
          const data = await this.githubFetch<any[]>(
            `/repos/${repo}/pulls?state=open&per_page=10`
          );
          const prs = data.map((pr: any) => ({
            number: pr.number,
            title: pr.title,
            state: pr.state,
            author: pr.user?.login || "unknown",
            repo,
            createdAt: pr.created_at,
            updatedAt: pr.updated_at,
            url: pr.html_url,
            additions: pr.additions || 0,
            deletions: pr.deletions || 0,
            draft: pr.draft || false,
          }));
          allPRs.push(...prs);
        } catch (err) {
          console.error(`[github] Failed to fetch PRs for ${repo}:`, err instanceof Error ? err.message : err);
        }
      })
    );

    return allPRs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getRecentIssues(limit = 15): Promise<GitHubIssue[]> {
    const repos = await this.getRepos();
    const allIssues: GitHubIssue[] = [];

    await Promise.all(
      repos.map(async (repo) => {
        try {
          const data = await this.githubFetch<any[]>(
            `/repos/${repo}/issues?state=open&sort=updated&per_page=10`
          );
          // GitHub API includes PRs in issues endpoint — filter them out
          const issues = data
            .filter((i: any) => !i.pull_request)
            .map((i: any) => ({
              number: i.number,
              title: i.title,
              state: i.state,
              author: i.user?.login || "unknown",
              repo,
              createdAt: i.created_at,
              labels: (i.labels || []).map((l: any) => l.name),
              url: i.html_url,
            }));
          allIssues.push(...issues);
        } catch (err) {
          console.error(`[github] Failed to fetch issues for ${repo}:`, err instanceof Error ? err.message : err);
        }
      })
    );

    return allIssues
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  async getActivity(): Promise<{
    commits: GitHubCommit[];
    prs: GitHubPR[];
    issues: GitHubIssue[];
  }> {
    const [commits, prs, issues] = await Promise.all([
      this.getRecentCommits(10),
      this.getOpenPRs(),
      this.getRecentIssues(10),
    ]);
    return { commits, prs, issues };
  }

  // --- Health check ---

  async ping(): Promise<boolean> {
    try {
      await this.githubFetch<any>("/user");
      return true;
    } catch {
      return false;
    }
  }

  // --- Summary for briefings ---

  async getBriefingSummary(): Promise<string> {
    const parts: string[] = [];

    try {
      const { commits, prs, issues } = await this.getActivity();

      if (prs.length > 0) {
        const prLines = prs.slice(0, 5).map((pr) => {
          const draft = pr.draft ? " [DRAFT]" : "";
          return `  - #${pr.number} ${pr.title}${draft} (${pr.repo})`;
        });
        parts.push(`Open PRs (${prs.length}):\n${prLines.join("\n")}`);
      }

      if (commits.length > 0) {
        const commitLines = commits.slice(0, 5).map((c) => {
          const age = formatAge(c.date);
          return `  - ${c.sha} ${c.message} (${c.repo}, ${age})`;
        });
        parts.push(`Recent Commits:\n${commitLines.join("\n")}`);
      }

      if (issues.length > 0) {
        const issueLines = issues.slice(0, 5).map((i) => {
          const labels = i.labels.length ? ` [${i.labels.join(", ")}]` : "";
          return `  - #${i.number} ${i.title}${labels} (${i.repo})`;
        });
        parts.push(`Open Issues (${issues.length}):\n${issueLines.join("\n")}`);
      }
    } catch (err) {
      console.error("[github] Failed to build briefing summary:", err instanceof Error ? err.message : err);
    }

    return parts.join("\n\n");
  }

  // --- Internal ---

  private async getRepos(): Promise<string[]> {
    if (this.repos.length > 0) return this.repos;

    // Auto-discover user's recent repos
    if (!this.discoveredRepos) {
      try {
        const data = await this.githubFetch<any[]>("/user/repos?sort=updated&per_page=5");
        this.discoveredRepos = data.map((r: any) => r.full_name);
      } catch {
        this.discoveredRepos = [];
      }
    }

    return this.discoveredRepos;
  }

  private async githubFetch<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "BODHI",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }
}

function formatAge(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}
