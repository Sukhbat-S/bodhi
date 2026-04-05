import { useEffect, useState, useCallback } from "react";
import {
  getGitHubStatus,
  getGitHubActivity,
  generateBuildlog,
  type GitHubCommit,
  type GitHubPR,
  type GitHubIssue,
} from "../api";

function formatAge(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}

export default function GitHubPage() {
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [prs, setPrs] = useState<GitHubPR[]>([]);
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [repos, setRepos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buildLog, setBuildLog] = useState<string[] | null>(null);
  const [buildLogLoading, setBuildLogLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const status = await getGitHubStatus().catch(() => ({
        connected: false as const,
        reason: "Server unreachable",
        repos: undefined as string[] | undefined,
      }));
      setConnected(status.connected);
      if (!status.connected) {
        setReason(status.reason || "Not connected");
        setLoading(false);
        return;
      }
      if (status.repos) setRepos(status.repos);

      const activity = await getGitHubActivity().catch(() => ({
        commits: [],
        prs: [],
        issues: [],
      }));
      setCommits(activity.commits);
      setPrs(activity.prs);
      setIssues(activity.issues);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load GitHub data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-stone-500 animate-pulse">Loading...</div>
      </div>
    );
  }

  if (connected === false) {
    return (
      <div className="p-8 max-w-4xl">
        <h2 className="text-2xl font-bold text-stone-100 mb-6">GitHub</h2>
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-8 text-center">
          <div className="text-4xl mb-4">🐙</div>
          <h3 className="text-lg font-medium text-stone-200 mb-2">
            GitHub Not Connected
          </h3>
          <p className="text-sm text-stone-400 mb-4">
            {reason || "GITHUB_TOKEN not configured"}
          </p>
          <p className="text-xs text-stone-500">
            Set{" "}
            <code className="bg-stone-800 px-1.5 py-0.5 rounded">
              GITHUB_TOKEN
            </code>{" "}
            in your .env file to enable GitHub tracking
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-100">GitHub</h2>
          <p className="text-sm text-stone-400 mt-1">
            {repos.length > 0 ? repos.join(", ") : "Tracking repositories"}
          </p>
        </div>
        <button
          onClick={async () => {
            setBuildLogLoading(true);
            setBuildLog(null);
            try {
              const res = await generateBuildlog({ days: 7 });
              setBuildLog(res.buildlog.tweets);
            } catch {
              setBuildLog(["Failed to generate build log. Is the server running?"]);
            } finally {
              setBuildLogLoading(false);
            }
          }}
          disabled={buildLogLoading}
          className="px-4 py-2 rounded-lg bg-amber-500/10 text-amber-400 text-sm font-medium hover:bg-amber-500/20 transition-colors border border-amber-500/20 disabled:opacity-50"
        >
          {buildLogLoading ? "Generating..." : "Generate Build Log"}
        </button>
      </div>

      {/* Build Log Result */}
      {buildLog && (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs uppercase tracking-wider text-amber-500">Build Log Draft</h3>
            <button
              onClick={() => {
                navigator.clipboard.writeText(buildLog.join("\n\n"));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="text-xs text-stone-400 hover:text-stone-200 transition-colors"
            >
              {copied ? "Copied" : "Copy all"}
            </button>
          </div>
          <div className="space-y-3">
            {buildLog.map((tweet, i) => (
              <div key={i} className="bg-stone-900/60 rounded-lg p-3">
                <p className="text-sm text-stone-300 leading-relaxed">{tweet}</p>
                <p className="text-[10px] text-stone-600 mt-1">{tweet.length}/280</p>
              </div>
            ))}
          </div>
          <button
            onClick={() => setBuildLog(null)}
            className="mt-3 text-xs text-stone-500 hover:text-stone-400 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="text-red-400 bg-red-500/10 px-4 py-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Open PRs */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-stone-100 mb-4">
          Open Pull Requests
          {prs.length > 0 && (
            <span className="ml-2 text-sm font-normal text-stone-500">
              ({prs.length})
            </span>
          )}
        </h3>
        {prs.length === 0 ? (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 text-center">
            <p className="text-sm text-stone-400">No open pull requests</p>
          </div>
        ) : (
          <div className="space-y-2">
            {prs.map((pr) => (
              <a
                key={`${pr.repo}-${pr.number}`}
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-stone-900 border border-stone-800 rounded-lg px-4 py-3 hover:border-stone-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-stone-200">
                        {pr.title}
                      </span>
                      {pr.draft && (
                        <span className="text-xs bg-stone-800 text-stone-400 px-1.5 py-0.5 rounded">
                          Draft
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 mt-1">
                      #{pr.number} · {pr.repo} · {pr.author} · {formatAge(pr.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-emerald-400">
                      +{pr.additions}
                    </span>
                    <span className="text-xs text-red-400">
                      -{pr.deletions}
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Recent Commits */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-stone-100 mb-4">
          Recent Commits
        </h3>
        {commits.length === 0 ? (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 text-center">
            <p className="text-sm text-stone-400">No recent commits</p>
          </div>
        ) : (
          <div className="space-y-1">
            {commits.map((commit) => (
              <a
                key={commit.sha}
                href={commit.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-stone-900 border border-stone-800 rounded-lg px-4 py-2.5 hover:border-stone-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <code className="text-xs text-amber-400/70 font-mono flex-shrink-0">
                    {commit.sha.slice(0, 7)}
                  </code>
                  <span className="text-sm text-stone-300 truncate flex-1">
                    {commit.message.split("\n")[0]}
                  </span>
                  <span className="text-xs text-stone-600 flex-shrink-0">
                    {commit.repo}
                  </span>
                  <span className="text-xs text-stone-500 flex-shrink-0 w-16 text-right">
                    {formatAge(commit.date)}
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Open Issues */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-stone-100 mb-4">
          Open Issues
          {issues.length > 0 && (
            <span className="ml-2 text-sm font-normal text-stone-500">
              ({issues.length})
            </span>
          )}
        </h3>
        {issues.length === 0 ? (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 text-center">
            <p className="text-sm text-stone-400">No open issues</p>
          </div>
        ) : (
          <div className="space-y-2">
            {issues.map((issue) => (
              <a
                key={`${issue.repo}-${issue.number}`}
                href={issue.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-stone-900 border border-stone-800 rounded-lg px-4 py-3 hover:border-stone-700 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-stone-200">
                      {issue.title}
                    </p>
                    <p className="text-xs text-stone-500 mt-1">
                      #{issue.number} · {issue.repo} · {issue.author} · {formatAge(issue.createdAt)}
                    </p>
                  </div>
                  {issue.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1 flex-shrink-0">
                      {issue.labels.slice(0, 3).map((label) => (
                        <span
                          key={label}
                          className="text-xs bg-stone-800 text-stone-400 px-1.5 py-0.5 rounded"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 text-xs text-stone-600 text-center">
        {prs.length} open PRs · {commits.length} recent commits · {issues.length} issues · Auto-refreshes every 5m
      </div>
    </div>
  );
}
