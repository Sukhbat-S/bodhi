import { useEffect, useState, useCallback } from "react";

interface HiveMetrics {
  poolSize: number;
  activeWorkers: number;
  queueDepth: number;
  completed: number;
  failed: number;
  avgDurationMs: number;
  throughputPerHour: number;
  memoryUsageMb: number;
}

interface HiveMission {
  id: string;
  goal: string;
  status: string;
  taskCount: number;
}

interface AgentProfile {
  id: string;
  role: string;
  totalTasks: number;
  successRate: number;
  avgDurationMs: number;
  weaknesses: string[];
}

interface WitnessAlert {
  level: string;
  type: string;
  message: string;
  timestamp: string;
}

const STATUS_DOT: Record<string, string> = {
  completed: "bg-emerald-500",
  executing: "bg-amber-500 animate-pulse",
  planning: "bg-blue-500 animate-pulse",
  failed: "bg-red-500",
  cancelled: "bg-stone-600",
};

export default function HiveView() {
  const [metrics, setMetrics] = useState<HiveMetrics | null>(null);
  const [missions, setMissions] = useState<HiveMission[]>([]);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [alerts, setAlerts] = useState<WitnessAlert[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, profilesRes, alertsRes] = await Promise.all([
        fetch("/api/hive/status").then((r) => r.json()),
        fetch("/api/hive/profiles").then((r) => r.json()),
        fetch("/api/hive/alerts").then((r) => r.json()),
      ]);
      setMetrics(statusRes.metrics);
      setMissions(statusRes.recentMissions || []);
      setProfiles(profilesRes.profiles || []);
      setAlerts(alertsRes.alerts || []);
    } catch {
      // Hive not available
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (!metrics) return null;

  const poolPct = metrics.poolSize > 0 ? (metrics.activeWorkers / metrics.poolSize) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Pool Status Bar */}
      <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-stone-200">The Hive</h3>
          <span className="text-xs text-stone-500">{metrics.memoryUsageMb}MB heap</span>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-stone-800 rounded-full mb-3 overflow-hidden">
          <div
            className="h-full bg-amber-500/80 rounded-full transition-all duration-500"
            style={{ width: `${poolPct}%` }}
          />
        </div>

        <div className="flex gap-4 text-xs text-stone-500">
          <span><strong className="text-stone-300">{metrics.activeWorkers}</strong>/{metrics.poolSize} active</span>
          <span>Queue: <strong className="text-stone-300">{metrics.queueDepth}</strong></span>
          <span>Done: <strong className="text-emerald-400">{metrics.completed}</strong></span>
          <span>Failed: <strong className={metrics.failed > 0 ? "text-red-400" : "text-stone-300"}>{metrics.failed}</strong></span>
          <span className="ml-auto">{metrics.throughputPerHour}/hr</span>
        </div>
      </div>

      {/* Recent Missions */}
      {missions.length > 0 && (
        <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-4">
          <h3 className="text-sm font-bold text-stone-200 mb-3">Recent Missions</h3>
          <div className="space-y-2">
            {missions.map((m) => (
              <div key={m.id} className="flex items-center gap-3 text-sm">
                <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[m.status] || "bg-stone-600"}`} />
                <span className="text-stone-300 truncate flex-1">{m.goal}</span>
                <span className="text-xs text-stone-600">{m.taskCount} tasks</span>
                <span className="text-xs text-stone-500 w-16 text-right">{m.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent Profiles */}
      {profiles.length > 0 && (
        <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-4">
          <h3 className="text-sm font-bold text-stone-200 mb-3">Agent Roster</h3>
          <div className="space-y-2">
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center gap-3 text-sm">
                <span className="text-xs font-mono text-amber-500/80 w-20">{p.role}</span>
                <div className="flex-1 h-1.5 bg-stone-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${p.successRate > 0.8 ? "bg-emerald-500/70" : p.successRate > 0.5 ? "bg-amber-500/70" : "bg-red-500/70"}`}
                    style={{ width: `${p.successRate * 100}%` }}
                  />
                </div>
                <span className="text-xs text-stone-500 w-16 text-right">
                  {(p.successRate * 100).toFixed(0)}% ({p.totalTasks})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Witness Alerts */}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-4">
          <h3 className="text-sm font-bold text-red-400 mb-2">Witness Alerts</h3>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {alerts.slice(-5).reverse().map((a, i) => (
              <p key={i} className="text-xs text-red-300/70">
                <span className={a.level === "critical" ? "text-red-400" : "text-amber-400"}>
                  [{a.level}]
                </span>{" "}
                {a.message}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
