import { useState, useEffect, useCallback } from 'react';
import {
  getStatus,
  getMemoryStats,
  getGitHubStatus,
  getGitHubActivity,
  getVercelDeployments,
  getSupabaseHealth,
  getGmailUnread,
  getCalendarToday,
  getSchedulerStatus,
} from '../../api';

export interface NodeLiveData {
  services?: { name: string; ok: boolean }[];
  memoryCount?: number;
  stat?: string;
  statColor?: string;
}

export function useEcosystemData() {
  const [nodeData, setNodeData] = useState<Record<string, NodeLiveData>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [status, memStats, ghStatus, ghActivity, vercelDeps, sbHealth, gmailUnread, calToday, scheduler] =
      await Promise.all([
        getStatus().catch(() => null),
        getMemoryStats().catch(() => null),
        getGitHubStatus().catch(() => null),
        getGitHubActivity().catch(() => null),
        getVercelDeployments(1).catch(() => null),
        getSupabaseHealth().catch(() => null),
        getGmailUnread().catch(() => null),
        getCalendarToday().catch(() => null),
        getSchedulerStatus().catch(() => null),
      ]);

    const data: Record<string, NodeLiveData> = {};

    // BODHI Hub
    const services: { name: string; ok: boolean }[] = [];
    if (status) {
      const s = status as unknown as Record<string, unknown>;
      services.push(
        { name: 'Agent', ok: (s.agent as string) === 'online' },
        { name: 'Bridge', ok: (s.bridge as string) !== 'error' },
        { name: 'Memory', ok: (s.memory as string) === 'connected' },
      );
    }
    data['bodhi-hub'] = { services, memoryCount: memStats?.totalMemories };

    // Memory
    data['bodhi-memory'] = {
      stat: memStats ? `${memStats.totalMemories} memories` : '?',
      statColor: 'text-violet-300',
    };

    // GitHub
    const ghConnected = (ghStatus as Record<string, unknown>)?.connected;
    data['bodhi-github'] = {
      stat: ghActivity
        ? `${(ghActivity as Record<string, unknown[]>).prs?.length ?? 0} PRs, ${(ghActivity as Record<string, unknown[]>).commits?.length ?? 0} commits`
        : 'disconnected',
      statColor: ghConnected ? 'text-emerald-400' : 'text-stone-500',
    };

    // Vercel
    const deps = vercelDeps as Record<string, unknown[]> | null;
    const latestDep = deps?.deployments?.[0] as Record<string, string> | undefined;
    data['bodhi-vercel'] = {
      stat: latestDep ? latestDep.state : 'disconnected',
      statColor: latestDep?.state === 'READY' ? 'text-emerald-400' : 'text-amber-400',
    };

    // Supabase
    const sb = sbHealth as Record<string, unknown> | null;
    const sbProject = sb?.project as Record<string, string> | undefined;
    data['bodhi-supabase'] = {
      stat: sbProject ? sbProject.status : 'disconnected',
      statColor: sbProject?.status === 'ACTIVE_HEALTHY' ? 'text-emerald-400' : 'text-amber-400',
    };

    // Gmail
    const unread = gmailUnread as Record<string, number> | null;
    data['bodhi-gmail'] = {
      stat: unread ? `${unread.unread ?? unread.count ?? 0} unread` : 'disconnected',
      statColor: unread ? 'text-blue-400' : 'text-stone-500',
    };

    // Calendar
    const cal = calToday as Record<string, unknown[]> | null;
    const events = cal?.events ?? [];
    data['bodhi-calendar'] = {
      stat: cal ? `${events.length} events today` : 'disconnected',
      statColor: cal ? 'text-blue-400' : 'text-stone-500',
    };

    // Scheduler
    const sched = scheduler as Record<string, unknown> | null;
    const jobs = (sched?.jobs ?? []) as unknown[];
    data['bodhi-scheduler'] = {
      stat: sched ? `${jobs.length} jobs` : '?',
      statColor: sched ? 'text-emerald-400' : 'text-stone-500',
    };

    setNodeData(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  return { nodeData, loading, reload: load };
}
