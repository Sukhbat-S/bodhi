import { useEffect, useState, useCallback } from "react";
import {
  getWorkflows,
  streamWorkflow,
  type WorkflowInfo,
  type WorkflowStepResult,
} from "../api";

type StepStatus = "pending" | "running" | "completed" | "skipped" | "failed";

interface StepState {
  name: string;
  status: StepStatus;
  output?: string;
  durationMs?: number;
  startedAt?: number;
}

interface RunState {
  workflowId: string;
  steps: StepState[];
  status: "running" | "completed" | "paused" | "failed" | null;
  totalDurationMs?: number;
  error?: string;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - startedAt), 100);
    return () => clearInterval(interval);
  }, [startedAt]);
  return <span className="tabular-nums">{(elapsed / 1000).toFixed(1)}s</span>;
}

const stepLabels: Record<string, string> = {
  gather: "Gathering context",
  analyze: "Analyzing priorities",
  "draft-plan": "Drafting plan",
  "generate-briefing": "Writing briefing",
  "create-time-blocks": "Creating calendar blocks",
  build: "Building packages",
  "health-check": "Checking health",
  notify: "Sending notification",
  "gather-week": "Gathering weekly data",
  "pattern-analysis": "Detecting patterns",
  "generate-digest": "Writing digest",
};

function getStepLabel(name: string): string {
  return stepLabels[name] || name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<RunState | null>(null);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const { workflows: wfs } = await getWorkflows();
      setWorkflows(wfs);
    } catch { /* */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeStepIndex = run?.steps.findIndex((s) => s.status === "running") ?? -1;
  const completedCount = run?.steps.filter((s) => s.status === "completed").length ?? 0;
  const totalSteps = run?.steps.length ?? 0;

  const handleTrigger = async (id: string) => {
    setRun({ workflowId: id, steps: [], status: "running" });
    setExpandedStep(null);

    try {
      await streamWorkflow(
        id,
        (data) => {
          setRun((prev) =>
            prev ? { ...prev, steps: data.steps.map((name) => ({ name, status: "pending" as StepStatus })) } : prev
          );
        },
        (progress) => {
          setRun((prev) => {
            if (!prev) return prev;
            const steps = [...prev.steps];
            if (steps[progress.currentStep] && progress.status === "running") {
              steps[progress.currentStep] = {
                ...steps[progress.currentStep],
                status: "running",
                startedAt: Date.now(),
              };
            }
            return { ...prev, steps };
          });
        },
        (step: WorkflowStepResult) => {
          setRun((prev) => {
            if (!prev) return prev;
            const steps = [...prev.steps];
            const idx = steps.findIndex((s) => s.name === step.stepName);
            if (idx >= 0) {
              steps[idx] = {
                ...steps[idx],
                status: step.skipped ? "skipped" : "completed",
                output: step.output,
                durationMs: step.durationMs,
              };
            }
            return { ...prev, steps };
          });
        },
        (result) => {
          setRun((prev) =>
            prev ? { ...prev, status: result.status as RunState["status"], totalDurationMs: result.totalDurationMs, error: result.error } : prev
          );
        }
      );
    } catch (e) {
      setRun((prev) =>
        prev ? { ...prev, status: "failed", error: e instanceof Error ? e.message : "Failed" } : prev
      );
    }
  };

  const isRunning = run?.status === "running";

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-stone-100">Workflows</h2>
        <p className="text-sm text-stone-500 mt-1">Multi-step agent pipelines</p>
      </div>

      {/* Active run */}
      {run && (
        <div className="mb-10">
          {/* Header with progress bar */}
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-stone-400">
              {workflows.find((w) => w.id === run.workflowId)?.name || run.workflowId}
            </h3>
            <span className="text-xs text-stone-600">
              {run.status === "running" ? (
                <>{completedCount}/{totalSteps}</>
              ) : run.status === "completed" ? (
                <span className="text-emerald-500">Done in {formatDuration(run.totalDurationMs || 0)}</span>
              ) : run.status === "failed" ? (
                <span className="text-red-400">Failed</span>
              ) : null}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-0.5 bg-stone-800 rounded-full mb-6 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                run.status === "completed" ? "bg-emerald-500" :
                run.status === "failed" ? "bg-red-500" :
                "bg-amber-500"
              }`}
              style={{ width: `${totalSteps > 0 ? ((completedCount + (isRunning ? 0.5 : 0)) / totalSteps) * 100 : 0}%` }}
            />
          </div>

          {/* Steps */}
          <div className="space-y-0.5">
            {run.steps.map((step, i) => {
              const isActive = step.status === "running";
              const isDone = step.status === "completed";
              const isFailed = step.status === "failed";
              const isSkipped = step.status === "skipped";
              const isPending = step.status === "pending";
              const hasOutput = !!step.output;
              const isExpanded = expandedStep === i;

              return (
                <div key={i}>
                  <div
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300
                      ${isActive ? "bg-amber-500/[0.07]" : ""}
                      ${isDone && hasOutput ? "cursor-pointer hover:bg-stone-800/40" : ""}
                    `}
                    onClick={() => hasOutput && setExpandedStep(isExpanded ? null : i)}
                  >
                    {/* Status icon */}
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                      {isActive ? (
                        <div className="relative">
                          <div className="w-2 h-2 rounded-full bg-amber-400" />
                          <div className="absolute inset-0 w-2 h-2 rounded-full bg-amber-400 animate-ping opacity-75" />
                        </div>
                      ) : isDone ? (
                        <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : isFailed ? (
                        <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      ) : isSkipped ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-stone-700" />
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-stone-700" />
                      )}
                    </div>

                    {/* Label */}
                    <span className={`flex-1 text-sm transition-colors duration-300 ${
                      isActive ? "text-amber-300 font-medium" :
                      isDone ? "text-stone-300" :
                      isFailed ? "text-red-400" :
                      "text-stone-600"
                    }`}>
                      {isActive ? getStepLabel(step.name) : isDone ? getStepLabel(step.name) : step.name.replace(/-/g, " ")}
                      {isActive && <span className="ml-1.5 inline-flex"><span className="animate-pulse">...</span></span>}
                    </span>

                    {/* Duration / Timer */}
                    <span className={`text-xs shrink-0 tabular-nums ${
                      isActive ? "text-amber-400/70" : "text-stone-600"
                    }`}>
                      {isActive && step.startedAt && <ElapsedTimer startedAt={step.startedAt} />}
                      {isDone && step.durationMs != null && formatDuration(step.durationMs)}
                    </span>

                    {/* Expand indicator */}
                    {hasOutput && (
                      <svg className={`w-3.5 h-3.5 text-stone-600 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </div>

                  {/* Expanded output */}
                  {isExpanded && step.output && (
                    <div className="ml-8 mr-3 mt-1 mb-3 py-3 px-4 bg-stone-900/60 border-l-2 border-stone-800 rounded-r-lg">
                      <pre className="text-xs text-stone-400 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                        {step.output}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Error */}
          {run.error && (
            <div className="mt-4 px-3 py-2 text-xs text-red-400 bg-red-500/5 border border-red-500/10 rounded-lg">
              {run.error}
            </div>
          )}
        </div>
      )}

      {/* Workflow cards */}
      {loading ? (
        <div className="text-sm text-stone-600">Loading...</div>
      ) : (
        <div className="space-y-2">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className="flex items-center justify-between px-4 py-3.5 bg-stone-900/50 border border-stone-800/60 rounded-xl hover:border-stone-700/60 transition-colors"
            >
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-stone-200">{wf.name}</h3>
                <p className="text-xs text-stone-500 mt-0.5 truncate">{wf.description}</p>
                <span className="text-[10px] text-stone-600 mt-1 inline-block">{wf.stepsCount} steps</span>
              </div>
              <button
                onClick={() => handleTrigger(wf.id)}
                disabled={isRunning}
                className={`shrink-0 ml-4 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  isRunning && run?.workflowId === wf.id
                    ? "bg-amber-500/15 text-amber-400 cursor-wait"
                    : isRunning
                    ? "bg-stone-800/50 text-stone-600 cursor-not-allowed"
                    : "bg-stone-800 text-stone-200 hover:bg-stone-700 active:scale-95"
                }`}
              >
                {isRunning && run?.workflowId === wf.id ? "Running..." : "Run"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
