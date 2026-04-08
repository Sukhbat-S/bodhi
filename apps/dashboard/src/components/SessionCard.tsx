import { useEffect, useState } from "react";
import type { ActiveSession, FileOwnership } from "../api";

function elapsed(since: string): string {
  const ms = Date.now() - new Date(since).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d`;
}

function liveness(lastPing: string): "active" | "stale" | "expired" {
  const ago = Date.now() - new Date(lastPing).getTime();
  if (ago < 90_000) return "active";
  if (ago < 300_000) return "stale";
  return "expired";
}

const PROJECT_COLORS: Record<string, string> = {
  bodhi: "bg-amber-500/20 text-amber-400",
  jewelry: "bg-emerald-500/20 text-emerald-400",
};

interface Props {
  session: ActiveSession;
  files: FileOwnership[];
}

export default function SessionCard({ session, files }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  const status = liveness(session.lastPingAt);
  const sessionFiles = files.filter((f) => f.session === session.id);
  const color = PROJECT_COLORS[session.project] || "bg-blue-500/20 text-blue-400";

  return (
    <div className="bg-stone-900/50 border border-stone-800/60 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {status === "active" && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              status === "active" ? "bg-emerald-400" : status === "stale" ? "bg-amber-400" : "bg-stone-600"
            }`} />
          </span>
          <span className="text-xs font-mono text-stone-500">{session.id}</span>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${color}`}>
          {session.project}
        </span>
      </div>

      <p className="text-sm text-stone-200 font-medium">{session.description || "Active session"}</p>

      {session.currentFile && (
        <p className="text-xs text-stone-500 font-mono truncate" title={session.currentFile}>
          {session.currentFile.split("/").slice(-2).join("/")}
        </p>
      )}

      <div className="flex items-center justify-between text-[10px] text-stone-600">
        <span>{elapsed(session.startedAt)}</span>
        {sessionFiles.length > 0 && (
          <span>{sessionFiles.length} file{sessionFiles.length > 1 ? "s" : ""}</span>
        )}
      </div>
    </div>
  );
}
