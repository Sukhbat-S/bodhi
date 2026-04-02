import { useEffect, useState, useCallback } from "react";
import {
  getVercelStatus,
  getVercelDeployments,
  type VercelDeployment,
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

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

const stateColors: Record<string, string> = {
  READY: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  BUILDING: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  ERROR: "bg-red-500/10 text-red-400 border-red-500/20",
  QUEUED: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  CANCELED: "bg-stone-700/30 text-stone-500 border-stone-700/30",
  INITIALIZING: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

export default function VercelPage() {
  const [deployments, setDeployments] = useState<VercelDeployment[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const status = await getVercelStatus().catch(() => ({
        connected: false as const,
        reason: "Server unreachable",
        project: undefined as string | undefined,
      }));
      setConnected(status.connected);
      if (!status.connected) {
        setReason(status.reason || "Not connected");
        setLoading(false);
        return;
      }
      if (status.project) setProjectName(status.project);

      const data = await getVercelDeployments(20).catch(() => ({
        deployments: [],
      }));
      setDeployments(data.deployments);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Vercel data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 120000); // 2 minutes
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
        <h2 className="text-2xl font-bold text-stone-100 mb-6">Vercel</h2>
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-8 text-center">
          <div className="text-4xl mb-4">&#9650;</div>
          <h3 className="text-lg font-medium text-stone-200 mb-2">
            Vercel Not Connected
          </h3>
          <p className="text-sm text-stone-400 mb-4">
            {reason || "VERCEL_TOKEN not configured"}
          </p>
          <p className="text-xs text-stone-500">
            Set{" "}
            <code className="bg-stone-800 px-1.5 py-0.5 rounded">
              VERCEL_TOKEN
            </code>{" "}
            in your .env file to enable deployment tracking
          </p>
        </div>
      </div>
    );
  }

  const buildingCount = deployments.filter((d) => d.state === "BUILDING").length;
  const errorCount = deployments.filter((d) => d.state === "ERROR").length;
  const readyCount = deployments.filter((d) => d.state === "READY").length;

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-stone-100">Vercel</h2>
        <p className="text-sm text-stone-400 mt-1">
          {projectName || "Deployments"}
        </p>
      </div>

      {error && (
        <div className="text-red-400 bg-red-500/10 px-4 py-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
          <p className="text-2xl font-bold text-emerald-400">{readyCount}</p>
          <p className="text-xs text-stone-500 mt-1">Ready</p>
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
          <p className="text-2xl font-bold text-amber-400">{buildingCount}</p>
          <p className="text-xs text-stone-500 mt-1">Building</p>
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
          <p className="text-2xl font-bold text-red-400">{errorCount}</p>
          <p className="text-xs text-stone-500 mt-1">Errors</p>
        </div>
      </div>

      {/* Deployments */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-stone-100 mb-4">
          Recent Deployments
        </h3>
        {deployments.length === 0 ? (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 text-center">
            <p className="text-sm text-stone-400">No deployments found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {deployments.map((deploy) => (
              <a
                key={deploy.id}
                href={deploy.inspectorUrl || `https://${deploy.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-stone-900 border border-stone-800 rounded-lg px-4 py-3 hover:border-stone-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${stateColors[deploy.state] || "bg-stone-800 text-stone-400"}`}
                      >
                        {deploy.state}
                      </span>
                      <span className="text-sm font-medium text-stone-200 truncate">
                        {deploy.name}
                      </span>
                      {deploy.target && (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            deploy.target === "production"
                              ? "bg-purple-500/10 text-purple-400"
                              : "bg-stone-800 text-stone-500"
                          }`}
                        >
                          {deploy.target}
                        </span>
                      )}
                    </div>
                    {deploy.meta?.commitMessage && (
                      <p className="text-xs text-stone-500 mt-1 truncate">
                        {deploy.meta.commitMessage.split("\n")[0]}
                      </p>
                    )}
                    <p className="text-xs text-stone-600 mt-1">
                      {deploy.meta?.branch && `${deploy.meta.branch} · `}
                      {deploy.meta?.commitSha && `${deploy.meta.commitSha.slice(0, 7)} · `}
                      {formatAge(deploy.createdAt)}
                    </p>
                  </div>
                  <div className="text-xs text-stone-500 flex-shrink-0 text-right">
                    <p>{formatDuration(deploy.buildDuration)}</p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 text-xs text-stone-600 text-center">
        {deployments.length} deployments · Auto-refreshes every 2m
      </div>
    </div>
  );
}
