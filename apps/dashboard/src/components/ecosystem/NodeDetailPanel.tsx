import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatMessage from '../ChatMessage';
import { streamChat } from '../../api';
import type { PanelState } from './useNodePanel';
import type { PanelDataType } from './nodePanelConfig';
import type {
  StatusResponse,
  MemoryStats,
  MemoryQuality,
  GitHubPR,
  GitHubCommit,
  VercelDeployment,
  SupabaseProjectHealth,
  SupabaseTableInfo,
  EmailSummary,
  CalendarEvent,
  FreeSlot,
  SchedulerJob,
  NotionTask,
} from '../../api';

// ─── Color maps ───

const accentMap: Record<string, string> = {
  violet: 'border-violet-500/60',
  emerald: 'border-emerald-500/60',
  amber: 'border-amber-500/60',
  stone: 'border-stone-600/60',
};

const dotMap: Record<string, string> = {
  violet: 'bg-violet-400',
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  stone: 'bg-stone-400',
};

// ─── Main Panel ───

interface Props {
  panel: PanelState | null;
  onClose: () => void;
}

export default function NodeDetailPanel({ panel, onClose }: Props) {
  const navigate = useNavigate();
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [input, setInput] = useState('');
  const [chatThreadId, setChatThreadId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevNodeId = useRef<string | null>(null);

  // Reset chat when switching nodes
  useEffect(() => {
    if (panel && panel.nodeId !== prevNodeId.current) {
      setChatMessages([]);
      setStreamingContent('');
      setStreaming(false);
      setInput('');
      setChatThreadId(undefined);
      prevNodeId.current = panel.nodeId;
    }
  }, [panel]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, streamingContent]);

  // Focus input when panel opens
  useEffect(() => {
    if (panel) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [panel]);

  const sendMessage = useCallback(async () => {
    const msg = input.trim();
    if (!msg || streaming || !panel) return;

    // Prepend chat hint on first message
    const isFirst = chatMessages.length === 0;
    const fullMsg = isFirst
      ? `[Context: ${panel.def.chatHint}]\n\n${msg}`
      : msg;

    setChatMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setInput('');
    setStreaming(true);
    setStreamingContent('');

    let accumulated = '';
    try {
      const threadId = await streamChat(
        fullMsg,
        (chunk) => {
          accumulated += chunk;
          setStreamingContent(accumulated);
        },
        (full, tid) => {
          setChatMessages((prev) => [...prev, { role: 'assistant', content: full }]);
          setStreamingContent('');
          setStreaming(false);
          if (tid) setChatThreadId(tid);
        },
        chatThreadId,
      );
      if (threadId && !chatThreadId) setChatThreadId(threadId);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Failed to connect. Is the server running?' },
      ]);
      setStreaming(false);
      setStreamingContent('');
    }
  }, [input, streaming, panel, chatMessages.length, chatThreadId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  const isOpen = panel !== null;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="absolute inset-0 bg-black/30 z-10 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`absolute top-0 right-0 h-full w-[420px] bg-stone-900 border-l border-stone-800 z-20 flex flex-col transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {panel && (
          <>
            {/* Header */}
            <div className={`flex items-center justify-between px-4 py-3 border-b-2 ${accentMap[panel.def.colorScheme]}`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotMap[panel.def.colorScheme]}`} />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-stone-100 truncate">{panel.def.title}</h2>
                  <p className="text-xs text-stone-500 truncate">{panel.def.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {panel.def.pageLink && (
                  <button
                    onClick={() => { navigate(panel.def.pageLink!); onClose(); }}
                    className="px-2 py-1 text-xs text-stone-400 hover:text-stone-200 bg-stone-800/60 rounded hover:bg-stone-800 transition-colors"
                  >
                    Full Page
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1 text-stone-500 hover:text-stone-200 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Info Section */}
            <div className="flex-shrink-0 max-h-[45%] overflow-y-auto p-4 border-b border-stone-800/60">
              {panel.loading ? (
                <div className="flex items-center gap-2 text-stone-500 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Loading...
                </div>
              ) : panel.error ? (
                <div className="text-sm text-red-400/80">{panel.error}</div>
              ) : panel.data ? (
                <InfoRenderer data={panel.data} />
              ) : null}
            </div>

            {/* Chat Section */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
                {chatMessages.length === 0 && !streaming && (
                  <div className="text-center text-stone-600 text-xs mt-8">
                    Ask BODHI about {panel.def.title}...
                  </div>
                )}
                {chatMessages.map((m, i) => (
                  <ChatMessage key={i} role={m.role} content={m.content} />
                ))}
                {streaming && streamingContent && (
                  <ChatMessage role="assistant" content={streamingContent} isStreaming />
                )}
                {streaming && !streamingContent && (
                  <ChatMessage role="assistant" content="" isStreaming />
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="px-4 py-3 border-t border-stone-800/60">
                <div className="flex gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Ask about ${panel.def.title}...`}
                    rows={1}
                    className="flex-1 bg-stone-800/60 border border-stone-700/60 rounded-lg px-3 py-2 text-sm text-stone-200 placeholder-stone-600 resize-none focus:outline-none focus:border-stone-600 transition-colors"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || streaming}
                    className="px-3 py-2 bg-violet-600/80 text-white text-sm rounded-lg hover:bg-violet-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m-7 7l7-7 7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Info Renderers ───

function InfoRenderer({ data }: { data: PanelDataType }) {
  switch (data.kind) {
    case 'status':
      return <StatusInfo status={data.status} />;
    case 'memory':
      return <MemoryInfo stats={data.stats} quality={data.quality} />;
    case 'github':
      return <GitHubInfo prs={data.prs} commits={data.commits} />;
    case 'vercel':
      return <VercelInfo deployments={data.deployments} />;
    case 'supabase':
      return <SupabaseInfo health={data.health} tables={data.tables} />;
    case 'gmail':
      return <GmailInfo emails={data.emails} />;
    case 'calendar':
      return <CalendarInfo events={data.events} freeSlots={data.freeSlots} />;
    case 'scheduler':
      return <SchedulerInfo jobs={data.jobs} running={data.running} timezone={data.timezone} />;
    case 'notion':
      return <NotionInfo tasks={data.tasks} />;
    case 'static':
      return <StaticInfo description={data.description} />;
  }
}

function InfoCard({ children }: { children: React.ReactNode }) {
  return <div className="bg-stone-800/50 rounded-lg p-3 text-sm">{children}</div>;
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  const colors: Record<string, string> = {
    green: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50',
    amber: 'bg-amber-900/50 text-amber-300 border-amber-700/50',
    red: 'bg-red-900/50 text-red-300 border-red-700/50',
    blue: 'bg-blue-900/50 text-blue-300 border-blue-700/50',
    stone: 'bg-stone-800 text-stone-400 border-stone-700',
  };
  return (
    <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border ${colors[color] ?? colors.stone}`}>
      {children}
    </span>
  );
}

// ── Status ──

function StatusInfo({ status }: { status: StatusResponse }) {
  const services = ['agent', 'bridge', 'memory', 'notion', 'gmail', 'calendar', 'github', 'vercel', 'supabase', 'scheduler'] as const;
  return (
    <InfoCard>
      <div className="text-stone-400 text-xs font-medium mb-2">Services</div>
      <div className="grid grid-cols-2 gap-1.5">
        {services.map((s) => {
          const val = status[s as keyof StatusResponse];
          if (val === undefined) return null;
          const ok = val === 'ok' || val === 'running';
          return (
            <div key={s} className="flex items-center gap-1.5 text-xs">
              <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className="text-stone-300 capitalize">{s}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-xs text-stone-500">
        Uptime: {Math.round(status.uptime / 3600)}h {Math.round((status.uptime % 3600) / 60)}m
      </div>
    </InfoCard>
  );
}

// ── Memory ──

function MemoryInfo({ stats, quality }: { stats: MemoryStats; quality: MemoryQuality }) {
  return (
    <div className="space-y-2">
      <InfoCard>
        <div className="flex items-center justify-between">
          <span className="text-stone-400 text-xs">Total Memories</span>
          <span className="text-stone-200 font-medium">{stats.totalMemories}</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-stone-400 text-xs">Recent (7d)</span>
          <span className="text-stone-200">{stats.recentCount}</span>
        </div>
      </InfoCard>
      <InfoCard>
        <div className="text-stone-400 text-xs font-medium mb-1.5">Top Tags</div>
        <div className="flex flex-wrap gap-1">
          {stats.topTags.slice(0, 8).map((t) => (
            <span key={t.tag} className="text-xs bg-stone-700/60 text-stone-300 px-1.5 py-0.5 rounded">
              {t.tag} ({t.count})
            </span>
          ))}
        </div>
      </InfoCard>
      <InfoCard>
        <div className="text-stone-400 text-xs font-medium mb-1">Quality</div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-stone-500">Stale</span>
            <div className="text-amber-300">{quality.stale.length}</div>
          </div>
          <div>
            <span className="text-stone-500">Neglected</span>
            <div className="text-red-300">{quality.neglected.length}</div>
          </div>
          <div>
            <span className="text-stone-500">Frequent</span>
            <div className="text-emerald-300">{quality.frequent.length}</div>
          </div>
        </div>
      </InfoCard>
    </div>
  );
}

// ── GitHub ──

function GitHubInfo({ prs, commits }: { prs: GitHubPR[]; commits: GitHubCommit[] }) {
  return (
    <div className="space-y-2">
      <InfoCard>
        <div className="text-stone-400 text-xs font-medium mb-1.5">Open PRs ({prs.length})</div>
        {prs.length === 0 ? (
          <div className="text-stone-600 text-xs">No open PRs</div>
        ) : (
          <div className="space-y-1.5">
            {prs.slice(0, 5).map((pr) => (
              <div key={pr.number} className="text-xs">
                <div className="text-stone-200 truncate">#{pr.number} {pr.title}</div>
                <div className="text-stone-500">
                  <span className="text-emerald-400">+{pr.additions}</span>{' '}
                  <span className="text-red-400">-{pr.deletions}</span>{' '}
                  {pr.draft && <Badge color="stone">draft</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </InfoCard>
      <InfoCard>
        <div className="text-stone-400 text-xs font-medium mb-1.5">Recent Commits</div>
        <div className="space-y-1">
          {commits.map((c) => (
            <div key={c.sha} className="text-xs">
              <span className="text-stone-500 font-mono">{c.sha.slice(0, 7)}</span>{' '}
              <span className="text-stone-300 truncate">{c.message.split('\n')[0]}</span>
            </div>
          ))}
        </div>
      </InfoCard>
    </div>
  );
}

// ── Vercel ──

function VercelInfo({ deployments }: { deployments: VercelDeployment[] }) {
  return (
    <InfoCard>
      <div className="text-stone-400 text-xs font-medium mb-1.5">Recent Deployments</div>
      <div className="space-y-1.5">
        {deployments.map((d) => {
          const stateColor = d.state === 'READY' ? 'green' : d.state === 'BUILDING' ? 'amber' : 'red';
          return (
            <div key={d.id} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <Badge color={stateColor}>{d.state}</Badge>
                <span className="text-stone-400 truncate">{d.meta?.commitMessage?.split('\n')[0] ?? d.name}</span>
              </div>
              {d.buildDuration && (
                <span className="text-stone-600 flex-shrink-0">{Math.round(d.buildDuration / 1000)}s</span>
              )}
            </div>
          );
        })}
      </div>
    </InfoCard>
  );
}

// ── Supabase ──

function SupabaseInfo({ health, tables }: { health: SupabaseProjectHealth; tables: SupabaseTableInfo[] }) {
  const isHealthy = health.status.includes('HEALTHY');
  return (
    <div className="space-y-2">
      <InfoCard>
        <div className="flex items-center justify-between mb-1">
          <span className="text-stone-400 text-xs">Status</span>
          <Badge color={isHealthy ? 'green' : 'amber'}>{health.status}</Badge>
        </div>
        <div className="text-xs text-stone-500">
          {health.region} &middot; {health.dbVersion}
        </div>
      </InfoCard>
      <InfoCard>
        <div className="text-stone-400 text-xs font-medium mb-1.5">Tables ({tables.length})</div>
        <div className="space-y-0.5 max-h-32 overflow-y-auto">
          {tables.map((t) => (
            <div key={t.name} className="flex justify-between text-xs">
              <span className="text-stone-300">{t.name}</span>
              <span className="text-stone-500">{t.rowCount} rows</span>
            </div>
          ))}
        </div>
      </InfoCard>
    </div>
  );
}

// ── Gmail ──

function GmailInfo({ emails }: { emails: EmailSummary[] }) {
  return (
    <InfoCard>
      <div className="text-stone-400 text-xs font-medium mb-1.5">Recent Emails</div>
      <div className="space-y-2">
        {emails.map((e) => (
          <div key={e.id} className="text-xs">
            <div className="flex items-center gap-1.5">
              {e.isUnread && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />}
              <span className={`truncate ${e.isUnread ? 'text-stone-200 font-medium' : 'text-stone-400'}`}>
                {e.from.split('<')[0].trim()}
              </span>
            </div>
            <div className="text-stone-300 truncate">{e.subject}</div>
            <div className="text-stone-600 truncate">{e.snippet}</div>
          </div>
        ))}
      </div>
    </InfoCard>
  );
}

// ── Calendar ──

function CalendarInfo({ events, freeSlots }: { events: CalendarEvent[]; freeSlots: FreeSlot[] }) {
  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-2">
      <InfoCard>
        <div className="text-stone-400 text-xs font-medium mb-1.5">Today ({events.length} events)</div>
        {events.length === 0 ? (
          <div className="text-stone-600 text-xs">No events today</div>
        ) : (
          <div className="space-y-1">
            {events.map((ev) => (
              <div key={ev.id} className="text-xs">
                <span className="text-stone-500">{formatTime(ev.start)}</span>{' '}
                <span className="text-stone-200">{ev.summary}</span>
              </div>
            ))}
          </div>
        )}
      </InfoCard>
      {freeSlots.length > 0 && (
        <InfoCard>
          <div className="text-stone-400 text-xs font-medium mb-1.5">Free Slots</div>
          <div className="space-y-0.5">
            {freeSlots.slice(0, 4).map((s, i) => (
              <div key={i} className="text-xs text-stone-400">
                {formatTime(s.start)} - {formatTime(s.end)}{' '}
                <span className="text-stone-600">({s.durationMinutes}m)</span>
              </div>
            ))}
          </div>
        </InfoCard>
      )}
    </div>
  );
}

// ── Scheduler ──

function SchedulerInfo({ jobs, running, timezone }: { jobs: SchedulerJob[]; running: boolean; timezone: string }) {
  return (
    <InfoCard>
      <div className="flex items-center justify-between mb-2">
        <span className="text-stone-400 text-xs font-medium">Jobs ({jobs.length})</span>
        <Badge color={running ? 'green' : 'stone'}>{running ? 'Running' : 'Stopped'}</Badge>
      </div>
      <div className="space-y-1.5">
        {jobs.map((j) => (
          <div key={j.type} className="text-xs">
            <div className="flex items-center justify-between">
              <span className="text-stone-200 capitalize">{j.type}</span>
              {j.lastResult && (
                <Badge color={j.lastResult === 'sent' ? 'green' : j.lastResult === 'error' ? 'red' : 'stone'}>
                  {j.lastResult}
                </Badge>
              )}
            </div>
            {j.lastRun && (
              <div className="text-stone-600">
                Last: {new Date(j.lastRun).toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 text-xs text-stone-600">TZ: {timezone}</div>
    </InfoCard>
  );
}

// ── Notion ──

function NotionInfo({ tasks }: { tasks: NotionTask[] }) {
  const statusColor = (s: string | null) => {
    if (!s) return 'stone';
    const lower = s.toLowerCase();
    if (lower.includes('done') || lower.includes('complete')) return 'green';
    if (lower.includes('progress') || lower.includes('doing')) return 'blue';
    if (lower.includes('todo') || lower.includes('not')) return 'amber';
    return 'stone';
  };

  return (
    <InfoCard>
      <div className="text-stone-400 text-xs font-medium mb-1.5">Active Tasks ({tasks.length})</div>
      {tasks.length === 0 ? (
        <div className="text-stone-600 text-xs">No active tasks</div>
      ) : (
        <div className="space-y-1.5">
          {tasks.slice(0, 8).map((t) => (
            <div key={t.id} className="text-xs">
              <div className="flex items-center gap-1.5">
                <Badge color={statusColor(t.status)}>{t.status ?? 'N/A'}</Badge>
                <span className="text-stone-200 truncate">{t.title}</span>
              </div>
              {t.due && <div className="text-stone-600 ml-6">Due: {t.due}</div>}
            </div>
          ))}
        </div>
      )}
    </InfoCard>
  );
}

// ── Static ──

function StaticInfo({ description }: { description: string }) {
  return (
    <InfoCard>
      <div className="text-stone-300 text-xs leading-relaxed">{description}</div>
    </InfoCard>
  );
}
