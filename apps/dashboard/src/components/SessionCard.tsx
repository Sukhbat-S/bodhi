import { useEffect, useState } from "react";
import type { ActiveSession, FileOwnership } from "../api";

function elapsed(since: string): string {
  const ms = Date.now() - new Date(since).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "now";
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
  bodhi: "bg-steppe-gold/15 text-steppe-gold",
  jewelry: "bg-steppe-sage/20 text-steppe-sage",
  mission: "bg-steppe-sky/30 text-steppe-cream/70",
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
  const color = PROJECT_COLORS[session.project] || "bg-steppe-sky/20 text-steppe-smoke";

  return (
    <div className="bg-steppe-sky/20 border border-steppe-shadow/40 rounded-xl p-5 space-y-3 hover:border-steppe-gold/20 transition-colors duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* Breathing pulse dot */}
          <span className="relative flex h-2.5 w-2.5">
            {status === "active" && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: "var(--steppe-sage)" }} />
            )}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              status === "active" ? "bg-steppe-sage" : status === "stale" ? "bg-steppe-rust" : "bg-steppe-smoke/30"
            }`} />
          </span>
          <span className="text-xs font-mono text-steppe-smoke">{session.id}</span>
        </div>
        <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${color}`}>
          {session.project}
        </span>
      </div>

      <p className="text-sm text-steppe-cream font-medium leading-relaxed">
        {session.description || "Active session"}
      </p>

      {session.currentFile && (
        <div className="flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-steppe-gold/40" />
          <p className="text-xs text-steppe-smoke font-mono truncate" title={session.currentFile}>
            {session.currentFile.split("/").slice(-2).join("/")}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-steppe-smoke/60">
        <span>{elapsed(session.startedAt)}</span>
        {sessionFiles.length > 0 && (
          <span>{sessionFiles.length} file{sessionFiles.length > 1 ? "s" : ""}</span>
        )}
      </div>
    </div>
  );
}
