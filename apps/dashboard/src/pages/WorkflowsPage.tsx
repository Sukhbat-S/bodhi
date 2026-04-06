import { useEffect, useState, useCallback } from "react";
import { getWorkflows, triggerWorkflow, type WorkflowInfo } from "../api";

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    id: string;
    status: string;
    content?: string;
    error?: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const { workflows: wfs } = await getWorkflows();
      setWorkflows(wfs);
    } catch {
      // Failed to load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleTrigger = async (id: string) => {
    setRunning(id);
    setLastResult(null);
    try {
      const result = await triggerWorkflow(id);
      setLastResult({ id, ...result });
    } catch (e) {
      setLastResult({
        id,
        status: "error",
        error: e instanceof Error ? e.message : "Failed",
      });
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-stone-100">Workflows</h2>
          <p className="text-sm text-stone-500 mt-1">
            Multi-step agent pipelines
          </p>
        </div>
      </div>

      {/* Result banner */}
      {lastResult && (
        <div
          className={`mb-6 p-4 rounded-lg border ${
            lastResult.status === "error" || lastResult.status === "failed"
              ? "bg-red-500/5 border-red-500/20 text-red-400"
              : lastResult.status === "paused"
              ? "bg-amber-500/5 border-amber-500/20 text-amber-400"
              : "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {lastResult.status === "error" || lastResult.status === "failed"
                ? "Workflow failed"
                : lastResult.status === "paused"
                ? "Workflow paused"
                : "Workflow completed"}
            </span>
            <button
              onClick={() => setLastResult(null)}
              className="text-stone-500 hover:text-stone-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {lastResult.content && (
            <p className="text-xs mt-1 text-stone-400">{lastResult.content}</p>
          )}
          {lastResult.error && (
            <p className="text-xs mt-1">{lastResult.error}</p>
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
                  <h3 className="text-sm font-medium text-stone-200">
                    {wf.name}
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {wf.description}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] uppercase font-medium text-stone-600 bg-stone-800 px-1.5 py-0.5 rounded">
                      {wf.stepsCount} steps
                    </span>
                    <span className="text-[10px] text-stone-600 font-mono">
                      {wf.id}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleTrigger(wf.id)}
                  disabled={running !== null}
                  className={`shrink-0 ml-4 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    running === wf.id
                      ? "bg-amber-500/20 text-amber-400 cursor-wait"
                      : running
                      ? "bg-stone-800 text-stone-600 cursor-not-allowed"
                      : "bg-stone-800 text-stone-200 hover:bg-stone-700"
                  }`}
                >
                  {running === wf.id ? "Running..." : "Run"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CLI hint */}
      <div className="mt-8 text-xs text-stone-600">
        <p>
          Trigger via CLI:{" "}
          <code className="text-stone-500 bg-stone-900 px-1.5 py-0.5 rounded">
            curl -X POST localhost:4000/api/workflows/morning-research/run
          </code>
        </p>
      </div>
    </div>
  );
}
