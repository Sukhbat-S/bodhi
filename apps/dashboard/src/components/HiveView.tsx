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

interface HiveTask {
  id: string;
  role: string;
  model: string;
  status: string;
  dependsOn: string[];
  result?: string;
  error?: string;
  repairAttempts: number;
  startedAt?: string;
  completedAt?: string;
}

interface MissionDetail {
  id: string;
  goal: string;
  status: string;
  tasks: HiveTask[];
  createdAt: string;
  completedAt?: string;
  result?: string;
  error?: string;
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
  running: "bg-amber-500 animate-pulse",
  planning: "bg-blue-500 animate-pulse",
  pending: "bg-stone-600",
  queued: "bg-blue-400",
  failed: "bg-red-500",
  cancelled: "bg-stone-600",
};

const ROLE_COLORS: Record<string, string> = {
  commander: "text-purple-400",
  scout: "text-blue-400",
  builder: "text-amber-400",
  sentinel: "text-emerald-400",
  witness: "text-stone-400",
  merger: "text-cyan-400",
};

export default function HiveView() {
  const [metrics, setMetrics] = useState<HiveMetrics | null>(null);
  const [missions, setMissions] = useState<HiveMission[]>([]);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [alerts, setAlerts] = useState<WitnessAlert[]>([]);
  const [selectedMission, setSelectedMission] = useState<MissionDetail | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

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

  const fetchMissionDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/hive/missions/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedMission(data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Refresh selected mission detail
  useEffect(() => {
    if (!selectedMission || selectedMission.status === "completed" || selectedMission.status === "failed") return;
    const interval = setInterval(() => fetchMissionDetail(selectedMission.id), 3000);
    return () => clearInterval(interval);
  }, [selectedMission, fetchMissionDetail]);

  if (!metrics) return null;

  const poolPct = metrics.poolSize > 0 ? (metrics.activeWorkers / metrics.poolSize) * 100 : 0;

  // Group tasks by dependency depth for DAG layout
  const getTaskDepth = (task: HiveTask, tasks: HiveTask[]): number => {
    if (task.dependsOn.length === 0) return 0;
    const depDepths = task.dependsOn.map((depId) => {
      const dep = tasks.find((t) => t.id === depId);
      return dep ? getTaskDepth(dep, tasks) + 1 : 0;
    });
    return Math.max(...depDepths);
  };

  return (
    <div className="space-y-4">
      {/* Pool Status Bar */}
      <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-stone-200">The Hive</h3>
          <span className="text-xs text-stone-500">{metrics.memoryUsageMb}MB heap</span>
        </div>

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

      {/* Recent Missions — clickable for detail */}
      {missions.length > 0 && (
        <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-4">
          <h3 className="text-sm font-bold text-stone-200 mb-3">Recent Missions</h3>
          <div className="space-y-2">
            {missions.map((m) => (
              <button
                key={m.id}
                onClick={() => fetchMissionDetail(m.id)}
                className={`w-full flex items-center gap-3 text-sm text-left p-2 rounded-lg transition-colors ${
                  selectedMission?.id === m.id ? "bg-stone-800/60" : "hover:bg-stone-800/30"
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[m.status] || "bg-stone-600"}`} />
                <span className="text-stone-300 truncate flex-1">{m.goal}</span>
                <span className="text-xs text-stone-600">{m.taskCount} tasks</span>
                <span className="text-xs text-stone-500 w-16 text-right">{m.status}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* DAG View — selected mission detail */}
      {selectedMission && selectedMission.tasks.length > 0 && (
        <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-stone-200">
              Mission DAG
              <span className="ml-2 text-xs font-normal text-stone-500">
                {selectedMission.tasks.length} tasks
              </span>
            </h3>
            <button
              onClick={() => setSelectedMission(null)}
              className="text-xs text-stone-600 hover:text-stone-400"
            >
              Close
            </button>
          </div>

          {/* DAG flow — grouped by depth */}
          <div className="flex gap-4 overflow-x-auto pb-2">
            {Array.from(
              new Set(selectedMission.tasks.map((t) => getTaskDepth(t, selectedMission.tasks)))
            )
              .sort()
              .map((depth) => (
                <div key={depth} className="flex flex-col gap-2 min-w-[140px]">
                  <span className="text-[10px] text-stone-600 uppercase tracking-wider mb-1">
                    {depth === 0 ? "Start" : `Wave ${depth}`}
                  </span>
                  {selectedMission.tasks
                    .filter((t) => getTaskDepth(t, selectedMission.tasks) === depth)
                    .map((task) => (
                      <button
                        key={task.id}
                        onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                        className={`relative p-2 rounded-lg border text-left transition-colors ${
                          expandedTask === task.id
                            ? "border-amber-500/40 bg-stone-800/60"
                            : "border-stone-800/40 bg-stone-900/60 hover:border-stone-700"
                        }`}
                      >
                        {/* Arrow from dependency */}
                        {task.dependsOn.length > 0 && (
                          <span className="absolute -left-3 top-1/2 -translate-y-1/2 text-stone-700 text-xs">
                            &larr;
                          </span>
                        )}
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[task.status] || "bg-stone-600"}`} />
                          <span className={`text-[10px] font-mono ${ROLE_COLORS[task.role] || "text-stone-400"}`}>
                            {task.role}
                          </span>
                        </div>
                        <p className="text-xs text-stone-400 truncate">{task.id}</p>
                        {task.repairAttempts > 0 && (
                          <span className="text-[10px] text-amber-500">
                            repair x{task.repairAttempts}
                          </span>
                        )}
                      </button>
                    ))}
                </div>
              ))}
          </div>

          {/* Expanded task detail */}
          {expandedTask && (() => {
            const task = selectedMission.tasks.find((t) => t.id === expandedTask);
            if (!task) return null;
            return (
              <div className="mt-3 p-3 rounded-lg bg-stone-800/40 border border-stone-700/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-mono font-bold ${ROLE_COLORS[task.role] || ""}`}>
                    {task.role}
                  </span>
                  <span className="text-xs text-stone-500">{task.id}</span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                    task.status === "completed" ? "bg-emerald-900/40 text-emerald-400" :
                    task.status === "failed" ? "bg-red-900/40 text-red-400" :
                    "bg-stone-800 text-stone-400"
                  }`}>
                    {task.status}
                  </span>
                </div>
                {task.result && (
                  <pre className="text-xs text-stone-400 whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {task.result.slice(0, 500)}
                    {task.result.length > 500 ? "..." : ""}
                  </pre>
                )}
                {task.error && (
                  <pre className="text-xs text-red-400/70 whitespace-pre-wrap mt-1">
                    {task.error}
                  </pre>
                )}
                {task.dependsOn.length > 0 && (
                  <p className="text-[10px] text-stone-600 mt-2">
                    Depends on: {task.dependsOn.join(", ")}
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Agent Profiles */}
      {profiles.length > 0 && (
        <div className="rounded-xl border border-stone-800/60 bg-stone-900/50 p-4">
          <h3 className="text-sm font-bold text-stone-200 mb-3">Agent Roster</h3>
          <div className="space-y-2">
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center gap-3 text-sm">
                <span className={`text-xs font-mono w-20 ${ROLE_COLORS[p.role] || "text-stone-400"}`}>{p.role}</span>
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
