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
  dispatching: "bg-blue-900/60 text-blue-300",
  planning: "bg-violet-900/60 text-violet-300",
  running: "bg-amber-900/60 text-amber-300",
  completed: "bg-emerald-900/60 text-emerald-300",
  failed: "bg-red-900/60 text-red-300",
  cancelled: "bg-stone-700 text-stone-400",
  pending: "bg-stone-800 text-stone-500",
};

function TaskRow({ task }: { task: MissionTask }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-l-2 border-stone-700/50 pl-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          task.status === "running" ? "bg-amber-400 animate-pulse" :
          task.status === "completed" ? "bg-emerald-400" :
          task.status === "failed" ? "bg-red-400" : "bg-stone-600"
        }`} />
        <span className="text-xs text-stone-300 truncate">{task.title}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ml-auto shrink-0 ${STATUS_STYLES[task.status] || ""}`}>
          {task.status}
        </span>
      </button>

      {expanded && task.progress.length > 0 && (
        <div className="mt-1 ml-3.5 bg-stone-950/50 rounded p-2 max-h-32 overflow-y-auto font-mono text-[10px] text-stone-500 whitespace-pre-wrap">
          {task.progress.join("")}
        </div>
      )}

      {expanded && task.status === "completed" && task.result && (
        <div className="mt-1 ml-3.5 bg-emerald-950/20 rounded p-2 max-h-32 overflow-y-auto text-[10px] text-emerald-400 whitespace-pre-wrap">
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

  return (
    <div className="bg-stone-900/50 border border-stone-800/60 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
            </span>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[mission.status] || ""}`}>
            {mission.status}
          </span>
          {mission.phase && (
            <span className="text-[10px] text-stone-500">{mission.phase}</span>
          )}
          <span className="text-[10px] text-stone-600">{mission.model}</span>
        </div>
        {isActive && (
          <button
            onClick={() => onCancel(mission.id)}
            className="text-[10px] text-stone-500 hover:text-red-400 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      <p className="text-sm text-stone-200 font-medium">{mission.goal}</p>

      {/* Task tree */}
      {hasTasks && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-stone-600 uppercase tracking-wider">
            {mission.tasks.filter((t) => t.status === "completed").length}/{mission.tasks.length} tasks
          </p>
          {mission.tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}

      {/* Simple progress (non-orchestrated missions) */}
      {!hasTasks && mission.progress.length > 0 && (
        <div
          ref={logRef}
          className="bg-stone-950/50 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs text-stone-400 leading-relaxed whitespace-pre-wrap"
        >
          {mission.progress.join("")}
        </div>
      )}

      {mission.status === "completed" && mission.result && !hasTasks && (
        <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-lg p-3 text-xs text-emerald-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
          {mission.result}
        </div>
      )}

      {mission.status === "failed" && mission.error && (
        <div className="bg-red-950/30 border border-red-800/30 rounded-lg p-3 text-xs text-red-300">
          {mission.error}
        </div>
      )}
    </div>
  );
}
