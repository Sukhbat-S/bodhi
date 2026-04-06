import { useEffect, useState, useCallback, useRef } from "react";
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
  return `${(ms / 1000).toFixed(1)}s`;
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - startedAt), 100);
    return () => clearInterval(interval);
  }, [startedAt]);
  return <span className="text-amber-400 text-xs font-mono">{(elapsed / 1000).toFixed(1)}s</span>;
}

function StepIndicator({ status }: { status: StepStatus }) {
  switch (status) {
    case "completed":
      return (
        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    case "running":
      return (
        <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
        </div>
      );
    case "failed":
      return (
        <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      );
    case "skipped":
      return (
        <div className="w-6 h-6 rounded-full bg-stone-800 flex items-center justify-center shrink-0">
          <div className="w-2 h-0.5 bg-stone-600 rounded" />
        </div>
      );
    default:
      return (
        <div className="w-6 h-6 rounded-full border border-stone-700 shrink-0" />
      );
  }
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<RunState | null>(null);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const stepsRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const { workflows: wfs } = await getWorkflows();
      setWorkflows(wfs);
    } catch { /* */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleTrigger = async (id: string) => {
    setRun({ workflowId: id, steps: [], status: "running" });
    setExpandedStep(null);

    try {
      await streamWorkflow(
        id,
        // onStart
        (data) => {
          setRun((prev) =>
            prev
              ? {
                  ...prev,
                  steps: data.steps.map((name) => ({ name, status: "pending" as StepStatus })),
                }
              : prev
          );
        },
        // onProgress
        (progress) => {
          setRun((prev) => {
            if (!prev) return prev;
            const steps = [...prev.steps];
            if (steps[progress.currentStep]) {
              steps[progress.currentStep] = {
                ...steps[progress.currentStep],
                status: progress.status === "running" ? "running" : steps[progress.currentStep].status,
                startedAt: progress.status === "running" ? Date.now() : steps[progress.currentStep].startedAt,
              };
            }
            return { ...prev, steps };
          });
        },
        // onStepDone
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
        // onDone
        (result) => {
          setRun((prev) =>
            prev
              ? {
                  ...prev,
                  status: result.status as RunState["status"],
                  totalDurationMs: result.totalDurationMs,
                  error: result.error,
                }
              : prev
          );
        }
      );
    } catch (e) {
      setRun((prev) =>
        prev
          ? { ...prev, status: "failed", error: e instanceof Error ? e.message : "Failed" }
          : prev
      );
    }
  };

  const isRunning = run?.status === "running";

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-stone-100">Workflows</h2>
        <p className="text-sm text-stone-500 mt-1">Multi-step agent pipelines</p>
      </div>

      {/* Active run: step timeline */}
      {run && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-stone-300">
              {workflows.find((w) => w.id === run.workflowId)?.name || run.workflowId}
            </h3>
            {run.status && run.status !== "running" && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                run.status === "completed" ? "bg-emerald-500/15 text-emerald-400"
                : run.status === "paused" ? "bg-amber-500/15 text-amber-400"
                : "bg-red-500/15 text-red-400"
              }`}>
                {run.status} {run.totalDurationMs ? `in ${formatDuration(run.totalDurationMs)}` : ""}
              </span>
            )}
          </div>

          <div ref={stepsRef} className="space-y-1">
            {run.steps.map((step, i) => (
              <div key={i}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    step.status === "running" ? "bg-amber-500/5 border border-amber-500/20" :
                    step.status === "completed" ? "bg-stone-900/50 cursor-pointer hover:bg-stone-800/50" :
                    "bg-stone-950"
                  }`}
                  onClick={() => step.output && setExpandedStep(expandedStep === i ? null : i)}
                >
                  <StepIndicator status={step.status} />
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${
                      step.status === "running" ? "text-amber-300 font-medium" :
                      step.status === "completed" ? "text-stone-300" :
                      step.status === "failed" ? "text-red-400" :
                      "text-stone-600"
                    }`}>
                      {step.name}
                    </span>
                  </div>
                  <div className="shrink-0">
                    {step.status === "running" && step.startedAt && (
                      <ElapsedTimer startedAt={step.startedAt} />
                    )}
                    {step.status === "completed" && step.durationMs != null && (
                      <span className="text-xs text-stone-600 font-mono">
                        {formatDuration(step.durationMs)}
                      </span>
                    )}
                    {step.output && (
                      <svg className={`w-4 h-4 text-stone-600 ml-2 inline transition-transform ${expandedStep === i ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </div>
                </div>

                {/* Expanded output */}
                {expandedStep === i && step.output && (
                  <div className="ml-9 mt-1 mb-2 p-3 bg-stone-950 border border-stone-800 rounded-lg">
                    <pre className="text-xs text-stone-400 whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {step.output}
                    </pre>
                  </div>
                )}

                {/* Connector line */}
                {i < run.steps.length - 1 && (
                  <div className="ml-[23px] h-1 border-l border-stone-800" />
                )}
              </div>
            ))}
          </div>

          {run.error && (
            <div className="mt-3 p-3 bg-red-500/5 border border-red-500/20 rounded-lg text-xs text-red-400">
              {run.error}
            </div>
          )}
        </div>
      )}

      {/* Workflow list */}
      {loading ? (
        <div className="text-sm text-stone-600">Loading workflows...</div>
      ) : workflows.length === 0 ? (
        <div className="text-sm text-stone-600">No workflows registered</div>
      ) : (
        <div className="space-y-3">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className="bg-stone-900 border border-stone-800 rounded-lg p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-stone-200">{wf.name}</h3>
                  <p className="text-xs text-stone-500 mt-0.5">{wf.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] uppercase font-medium text-stone-600 bg-stone-800 px-1.5 py-0.5 rounded">
                      {wf.stepsCount} steps
                    </span>
                    <span className="text-[10px] text-stone-600 font-mono">{wf.id}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleTrigger(wf.id)}
                  disabled={isRunning}
                  className={`shrink-0 ml-4 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isRunning && run?.workflowId === wf.id
                      ? "bg-amber-500/20 text-amber-400 cursor-wait"
                      : isRunning
                      ? "bg-stone-800 text-stone-600 cursor-not-allowed"
                      : "bg-stone-800 text-stone-200 hover:bg-stone-700"
                  }`}
                >
                  {isRunning && run?.workflowId === wf.id ? "Running..." : "Run"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
