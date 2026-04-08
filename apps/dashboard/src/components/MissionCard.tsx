import { useRef, useEffect, useState } from "react";

export interface MissionTask {
  id: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: string[];
  result?: string;
  error?: string;
}

export interface Mission {
  id: string;
  goal: string;
  model: string;
  status: "dispatching" | "planning" | "running" | "completed" | "failed" | "cancelled";
  phase?: string;
  tasks: MissionTask[];
  progress: string[];
  result?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

interface Props {
  mission: Mission;
  onCancel: (id: string) => void;
}

const STATUS_STYLES: Record<string, string> = {
  dispatching: "bg-steppe-sky/40 text-steppe-cream/70",
  planning: "bg-steppe-sky/50 text-steppe-cream/80",
  running: "bg-steppe-gold/15 text-steppe-gold",
  completed: "bg-steppe-sage/15 text-steppe-sage",
  failed: "bg-steppe-rust/15 text-steppe-rust",
  cancelled: "bg-steppe-smoke/10 text-steppe-smoke",
  pending: "bg-steppe-shadow/30 text-steppe-smoke/50",
};

const TASK_DOT: Record<string, string> = {
  running: "bg-steppe-gold animate-pulse",
  completed: "bg-steppe-sage",
  failed: "bg-steppe-rust",
  pending: "bg-steppe-smoke/30",
};

function TaskRow({ task }: { task: MissionTask }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border-l-2 pl-4 transition-colors duration-300 ${
      task.status === "running" ? "border-steppe-gold/60" :
      task.status === "completed" ? "border-steppe-sage/40" :
      task.status === "failed" ? "border-steppe-rust/40" :
      "border-steppe-shadow/30"
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 w-full text-left py-1 group"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 transition-all ${TASK_DOT[task.status] || TASK_DOT.pending}`} />
        <span className="text-sm text-steppe-cream/80 group-hover:text-steppe-cream truncate transition-colors">
          {task.title}
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ml-auto shrink-0 ${STATUS_STYLES[task.status] || ""}`}>
          {task.status}
        </span>
      </button>

      {expanded && task.progress.length > 0 && (
        <div className="mt-1.5 ml-4.5 bg-steppe-night/60 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-[11px] text-steppe-smoke leading-relaxed whitespace-pre-wrap wind-in">
          {task.progress.join("")}
        </div>
      )}

      {expanded && task.status === "completed" && task.result && (
        <div className="mt-1.5 ml-4.5 bg-steppe-sage/5 border border-steppe-sage/10 rounded-lg p-3 max-h-40 overflow-y-auto text-[11px] text-steppe-sage/80 whitespace-pre-wrap wind-in">
          {task.result}
        </div>
      )}
    </div>
  );
}

export default function MissionCard({ mission, onCancel }: Props) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [mission.progress]);

  const isActive = ["dispatching", "planning", "running"].includes(mission.status);
  const hasTasks = mission.tasks.length > 0;
  const completedCount = mission.tasks.filter((t) => t.status === "completed").length;
  const confidence = hasTasks && completedCount > 0 ? completedCount / mission.tasks.length : isActive ? undefined : 1;

  return (
    <div className="relative bg-steppe-sky/20 border border-steppe-shadow/40 rounded-xl p-5 space-y-4 hover:border-steppe-gold/15 transition-colors duration-300">
      {/* Confidence bar at top — thin gold line */}
      {confidence !== undefined && (
        <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl overflow-hidden">
          <div
            className={`h-full transition-all duration-700 ease-out rounded-full ${
              confidence >= 0.8 ? "bg-steppe-sage" : confidence >= 0.5 ? "bg-steppe-gold" : "bg-steppe-rust"
            }`}
            style={{ width: `${confidence * 100}%` }}
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {isActive && (
            <span className="relative flex h-2.5 w-2.5 steppe-breathe">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-steppe-gold opacity-50" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-steppe-gold" />
            </span>
          )}
          <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${STATUS_STYLES[mission.status] || ""}`}>
            {mission.status}
          </span>
          {mission.phase && (
            <span className="text-[11px] text-steppe-smoke/60">{mission.phase}</span>
          )}
          <span className="text-[11px] text-steppe-smoke/40">{mission.model}</span>
        </div>
        {isActive && (
          <button
            onClick={() => onCancel(mission.id)}
            className="text-[11px] text-steppe-smoke/40 hover:text-steppe-rust transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      <p className="text-base text-steppe-cream font-medium leading-relaxed">{mission.goal}</p>

      {/* Task tree */}
      {hasTasks && (
        <div className="space-y-1">
          <p className="text-[11px] text-steppe-smoke/50 uppercase tracking-wider mb-2">
            {completedCount}/{mission.tasks.length} tasks
          </p>
          {mission.tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}

      {/* Simple progress (non-orchestrated) */}
      {!hasTasks && mission.progress.length > 0 && (
        <div
          ref={logRef}
          className="bg-steppe-night/50 rounded-lg p-4 max-h-52 overflow-y-auto font-mono text-xs text-steppe-smoke leading-relaxed whitespace-pre-wrap"
        >
          {mission.progress.join("")}
        </div>
      )}

      {mission.status === "completed" && mission.result && !hasTasks && (
        <div className="bg-steppe-sage/5 border border-steppe-sage/10 rounded-lg p-4 text-sm text-steppe-sage/80 whitespace-pre-wrap max-h-52 overflow-y-auto">
          {mission.result}
        </div>
      )}

      {mission.status === "failed" && mission.error && (
        <div className="bg-steppe-rust/5 border border-steppe-rust/10 rounded-lg p-4 text-sm text-steppe-rust/80">
          {mission.error}
        </div>
      )}
    </div>
  );
}
