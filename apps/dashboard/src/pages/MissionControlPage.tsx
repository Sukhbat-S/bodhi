import { useEffect, useState, useCallback } from "react";
import {
  subscribeSessionStream,
  dispatchMission,
  cancelMission,
  getMissions,
  type ActiveSession,
  type SessionMessage,
  type FileOwnership,
} from "../api";
import SessionCard from "../components/SessionCard";
import CommandBar from "../components/CommandBar";
import MissionCard, { type Mission, type MissionTask } from "../components/MissionCard";

export default function MissionControlPage() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [files, setFiles] = useState<FileOwnership[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [connected, setConnected] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  // Load mission history on mount
  useEffect(() => {
    getMissions().then(({ missions: hist }) => {
      setMissions(hist.map((m) => ({
        id: m.id,
        goal: m.goal,
        model: m.model,
        status: (m.status === "completed" ? "completed" : m.status === "failed" ? "failed" : "running") as Mission["status"],
        tasks: (m.tasks || []).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status as MissionTask["status"],
          progress: [],
          result: t.result,
          error: t.error,
        })),
        progress: [],
        result: m.result,
        error: m.error,
        startedAt: m.startedAt,
        completedAt: m.completedAt,
      })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const unsub = subscribeSessionStream({
      onInit(data) {
        setSessions(data.sessions);
        setMessages(data.messages);
        setFiles(data.files);
        setConnected(true);
      },
      onSessionChange(event) {
        if (event.type === "session:registered") {
          const s = event.session as ActiveSession;
          setSessions((prev) => {
            const idx = prev.findIndex((p) => p.id === s.id);
            return idx >= 0 ? prev.map((p, i) => (i === idx ? s : p)) : [...prev, s];
          });
        } else if (event.type === "session:deregistered") {
          setSessions((prev) => prev.filter((s) => s.id !== event.sessionId));
        } else if (event.type === "session:pinged") {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === event.sessionId
                ? { ...s, lastPingAt: new Date().toISOString(), currentFile: (event.currentFile as string) ?? s.currentFile }
                : s
            )
          );
        }
      },
      onMessageSent(data) {
        setMessages((prev) => [...prev, data.message]);
      },
      onMissionUpdate(data) {
        const { missionId, type } = data;
        setMissions((prev) => {
          const idx = prev.findIndex((m) => m.id === missionId);
          if (idx < 0) {
            if (type === "mission:dispatched") {
              return [...prev, {
                id: missionId,
                goal: (data.goal as string) || "",
                model: (data.model as string) || "sonnet",
                status: "dispatching" as const,
                tasks: [],
                progress: [],
                startedAt: new Date().toISOString(),
              }];
            }
            return prev;
          }
          return prev.map((m, i) => {
            if (i !== idx) return m;

            // Orchestrator events
            if (type === "mission:planning") {
              return { ...m, status: "planning" as const };
            }
            if (type === "mission:planned") {
              const plan = data.plan as { phases: { tasks: { id: string; title: string }[] }[] };
              const tasks: MissionTask[] = plan.phases.flatMap((p) =>
                p.tasks.map((t) => ({ id: t.id, title: t.title, status: "pending" as const, progress: [] }))
              );
              return { ...m, tasks };
            }
            if (type === "mission:phase") {
              return { ...m, status: "running" as const, phase: data.phase as string };
            }

            // Task-level events
            if (type === "task:running") {
              return { ...m, tasks: m.tasks.map((t) => t.id === data.taskId ? { ...t, status: "running" as const } : t) };
            }
            if (type === "task:progress") {
              return { ...m, tasks: m.tasks.map((t) =>
                t.id === data.taskId ? { ...t, progress: [...t.progress, data.chunk as string] } : t
              )};
            }
            if (type === "task:completed") {
              return { ...m, tasks: m.tasks.map((t) =>
                t.id === data.taskId ? { ...t, status: "completed" as const, result: data.result as string } : t
              )};
            }
            if (type === "task:failed") {
              return { ...m, tasks: m.tasks.map((t) =>
                t.id === data.taskId ? { ...t, status: "failed" as const, error: data.error as string } : t
              )};
            }

            // Simple mission events
            if (type === "mission:progress") {
              return { ...m, status: "running" as const, progress: [...m.progress, data.chunk as string] };
            }
            if (type === "mission:completed") {
              return { ...m, status: "completed" as const, result: data.result as string, completedAt: new Date().toISOString() };
            }
            if (type === "mission:failed") {
              return { ...m, status: "failed" as const, error: (data.error as string) || undefined, completedAt: new Date().toISOString() };
            }
            if (type === "mission:cancelled") {
              return { ...m, status: "cancelled" as const, completedAt: new Date().toISOString() };
            }
            return m;
          });
        });
      },
      onDisconnect() {
        setConnected(false);
      },
    });
    return unsub;
  }, []);

  const handleDispatch = useCallback(async (goal: string, model: string) => {
    setDispatching(true);
    try {
      const { missionId } = await dispatchMission(goal, model);
      setMissions((prev) => [
        {
          id: missionId,
          goal,
          model,
          status: "dispatching",
          tasks: [],
          progress: [],
          startedAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch (err) {
      console.error("Dispatch failed:", err);
    } finally {
      setDispatching(false);
    }
  }, []);

  const handleCancel = useCallback(async (id: string) => {
    try {
      await cancelMission(id);
    } catch (err) {
      console.error("Cancel failed:", err);
    }
  }, []);

  const activeMissions = missions.filter((m) => m.status === "dispatching" || m.status === "running");
  const completedMissions = missions.filter((m) => m.status !== "dispatching" && m.status !== "running");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-100">Mission Control</h1>
          <p className="text-sm text-stone-500 mt-1">
            {sessions.length} session{sessions.length !== 1 ? "s" : ""} active
            {activeMissions.length > 0 && ` \u00b7 ${activeMissions.length} mission${activeMissions.length !== 1 ? "s" : ""} running`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`} />
          <span className="text-xs text-stone-500">{connected ? "Connected" : "Disconnected"}</span>
        </div>
      </div>

      {/* Command Bar */}
      <CommandBar onDispatch={handleDispatch} disabled={dispatching} />

      {/* Active Missions */}
      {activeMissions.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">Running</h2>
          <div className="space-y-3">
            {activeMissions.map((m) => (
              <MissionCard key={m.id} mission={m} onCancel={handleCancel} />
            ))}
          </div>
        </section>
      )}

      {/* Active Sessions */}
      {sessions.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">Sessions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} files={files} />
            ))}
          </div>
        </section>
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">Messages</h2>
          <div className="bg-stone-900/50 border border-stone-800/60 rounded-xl p-4 max-h-48 overflow-y-auto space-y-2">
            {messages.slice(-20).map((msg) => (
              <div key={msg.id} className="flex items-start gap-2 text-xs">
                <span className={`font-mono shrink-0 ${msg.toSession ? "text-stone-500" : "text-amber-500"}`}>
                  {msg.fromSession}
                </span>
                <span className="text-stone-600">{msg.toSession ? `\u2192 ${msg.toSession}` : "(broadcast)"}</span>
                <span className="text-stone-300 break-all">{msg.message}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Completed Missions */}
      {completedMissions.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">Completed</h2>
          <div className="space-y-3">
            {completedMissions.map((m) => (
              <MissionCard key={m.id} mission={m} onCancel={handleCancel} />
            ))}
          </div>
        </section>
      )}

      {/* Empty State */}
      {sessions.length === 0 && missions.length === 0 && (
        <div className="text-center py-16">
          <p className="text-stone-500 mb-2">No active sessions or missions.</p>
          <p className="text-xs text-stone-600">
            Type a goal above to dispatch work, or open a terminal and run <code className="text-amber-500">/session-start</code>
          </p>
        </div>
      )}
    </div>
  );
}
