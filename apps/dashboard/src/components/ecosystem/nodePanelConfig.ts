import {
  getStatus,
  getMemoryStats,
  getMemoryQuality,
  getGitHubPRs,
  getGitHubCommits,
  getVercelDeployments,
  getSupabaseHealth,
  getGmailInbox,
  getCalendarToday,
  getCalendarFree,
  getSchedulerStatus,
  getNotionTasks,
} from '../../api';
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
import type { ColorScheme } from './ecosystemConfig';

// ─── Panel data types ───

export type PanelDataType =
  | { kind: 'status'; status: StatusResponse }
  | { kind: 'memory'; stats: MemoryStats; quality: MemoryQuality }
  | { kind: 'github'; prs: GitHubPR[]; commits: GitHubCommit[] }
  | { kind: 'vercel'; deployments: VercelDeployment[] }
  | { kind: 'supabase'; health: SupabaseProjectHealth; tables: SupabaseTableInfo[] }
  | { kind: 'gmail'; emails: EmailSummary[] }
  | { kind: 'calendar'; events: CalendarEvent[]; freeSlots: FreeSlot[] }
  | { kind: 'scheduler'; jobs: SchedulerJob[]; running: boolean; timezone: string }
  | { kind: 'notion'; tasks: NotionTask[] }
  | { kind: 'static'; description: string };

export interface NodePanelDef {
  title: string;
  subtitle: string;
  colorScheme: ColorScheme;
  fetchData: () => Promise<PanelDataType>;
  chatHint: string;
  pageLink?: string;
}

// ─── Config per node ───

export const panelConfig: Record<string, NodePanelDef> = {
  'bodhi-hub': {
    title: 'BODHI',
    subtitle: 'Personal AI Companion',
    colorScheme: 'violet',
    fetchData: async () => {
      const status = await getStatus();
      return { kind: 'status', status };
    },
    chatHint: 'The user is looking at the central BODHI system hub. Provide an overview of the system health, services, and capabilities.',
    pageLink: '/',
  },
  'bodhi-memory': {
    title: 'Memory',
    subtitle: 'Embeddings + pgvector',
    colorScheme: 'violet',
    fetchData: async () => {
      const [stats, quality] = await Promise.all([getMemoryStats(), getMemoryQuality()]);
      return { kind: 'memory', stats, quality };
    },
    chatHint: 'The user is looking at the Memory subsystem. Focus on memory statistics, quality, tag patterns, and knowledge management.',
    pageLink: '/memories',
  },
  'bodhi-github': {
    title: 'GitHub',
    subtitle: 'Commits & PRs',
    colorScheme: 'violet',
    fetchData: async () => {
      const [{ prs }, { commits }] = await Promise.all([getGitHubPRs(), getGitHubCommits(5)]);
      return { kind: 'github', prs, commits };
    },
    chatHint: 'The user is looking at GitHub integration. Focus on pull requests, recent commits, and repository activity.',
    pageLink: '/github',
  },
  'bodhi-vercel': {
    title: 'Vercel',
    subtitle: 'Deployments',
    colorScheme: 'violet',
    fetchData: async () => {
      const { deployments } = await getVercelDeployments(5);
      return { kind: 'vercel', deployments };
    },
    chatHint: 'The user is looking at Vercel deployments. Focus on deployment status, build times, and deployment history.',
    pageLink: '/vercel',
  },
  'bodhi-supabase': {
    title: 'Supabase',
    subtitle: 'DB health',
    colorScheme: 'violet',
    fetchData: async () => {
      const { health, tables } = await getSupabaseHealth();
      return { kind: 'supabase', health, tables };
    },
    chatHint: 'The user is looking at Supabase integration. Focus on database health, table statistics, and project status.',
    pageLink: '/supabase',
  },
  'bodhi-gmail': {
    title: 'Gmail',
    subtitle: 'Email context',
    colorScheme: 'violet',
    fetchData: async () => {
      const { emails } = await getGmailInbox(5);
      return { kind: 'gmail', emails };
    },
    chatHint: 'The user is looking at Gmail integration. Focus on recent emails, unread messages, and email patterns.',
    pageLink: '/inbox',
  },
  'bodhi-calendar': {
    title: 'Calendar',
    subtitle: 'Schedule',
    colorScheme: 'violet',
    fetchData: async () => {
      const [{ events }, { slots }] = await Promise.all([getCalendarToday(), getCalendarFree()]);
      return { kind: 'calendar', events, freeSlots: slots };
    },
    chatHint: "The user is looking at Calendar integration. Focus on today's events, upcoming schedule, and free time slots.",
    pageLink: '/calendar',
  },
  'bodhi-scheduler': {
    title: 'Scheduler',
    subtitle: '4 cron jobs',
    colorScheme: 'violet',
    fetchData: async () => {
      const data = await getSchedulerStatus();
      return { kind: 'scheduler', jobs: data.jobs, running: data.running, timezone: data.timezone };
    },
    chatHint: 'The user is looking at the Scheduler subsystem. Focus on briefing jobs, cron schedules, and last run results.',
  },
  'bodhi-notion': {
    title: 'Notion',
    subtitle: 'Knowledge base',
    colorScheme: 'violet',
    fetchData: async () => {
      const { tasks } = await getNotionTasks('active');
      return { kind: 'notion', tasks };
    },
    chatHint: 'The user is looking at Notion integration. Focus on active tasks, development sessions, and knowledge base status.',
    pageLink: '/notion',
  },
  'bodhi-core': {
    title: 'Core Engine',
    subtitle: 'Agent + Bridge + MCP',
    colorScheme: 'violet',
    fetchData: async () => ({
      kind: 'static',
      description: 'The core runtime: Agent orchestrates context gathering + AI reasoning. Bridge connects to Claude Code CLI ($0 via Max). MCP Server exposes 8 tools for Claude Code sessions.',
    }),
    chatHint: 'The user is looking at the Core Engine. Focus on the Agent, Bridge, ContextEngine, and MCP server architecture.',
  },
  'bodhi-awareness': {
    title: 'Awareness',
    subtitle: '6 connected services',
    colorScheme: 'violet',
    fetchData: async () => ({
      kind: 'static',
      description: 'Monitors 6 external services: GitHub (commits, PRs), Vercel (deployments), Supabase (DB health), Gmail (emails), Calendar (events), Notion (tasks). Each provides context to the AI agent.',
    }),
    chatHint: 'The user is looking at the Awareness subsystem. Focus on integration status and monitoring capabilities.',
  },
  'bodhi-dashboard': {
    title: 'Dashboard',
    subtitle: '11 pages',
    colorScheme: 'violet',
    fetchData: async () => ({
      kind: 'static',
      description: 'React 19 + Vite 6 + Tailwind 3 SPA. 11 pages: Status, Ecosystem, Memories, Quality, Notion, Inbox, Calendar, GitHub, Vercel, Supabase, Chat. Served from Hono in production.',
    }),
    chatHint: 'The user is looking at the Dashboard subsystem. Focus on the SPA architecture, pages, and frontend stack.',
  },
  'bodhi-skills': {
    title: 'Skills',
    subtitle: '9 slash commands',
    colorScheme: 'violet',
    fetchData: async () => ({
      kind: 'static',
      description: 'Claude Code slash commands: /session-save, /session-start, /reflect, /learn, /recall, /briefing, /deploy, /commit, /status. Each triggers structured workflows for knowledge capture.',
    }),
    chatHint: 'The user is looking at the Skills subsystem. Focus on slash commands, session workflows, and knowledge capture.',
  },
  'jewelry': {
    title: 'Jewelry Platform',
    subtitle: 'Shigtgee / Zuusgel',
    colorScheme: 'emerald',
    fetchData: async () => ({
      kind: 'static',
      description: 'Full-stack e-commerce: Next.js storefront + admin panel (15 pages), Photo Studio (Gemini AI + bg removal), Facebook chatbot (dual-brand), Stone Quiz (25 gems). Deployed on Vercel + Supabase.',
    }),
    chatHint: 'The user is looking at the Jewelry Platform (Shigtgee). Focus on e-commerce features, Photo Studio AI, and business operations.',
  },
  'strategy': {
    title: 'Business Strategy',
    subtitle: 'Mongolia-first AI Tools',
    colorScheme: 'amber',
    fetchData: async () => ({
      kind: 'static',
      description: 'Phase 1: Service (3-5 local shops, prove AI value). Phase 2: Platform (SaaS tools for Mongolian SMBs). Phase 3: Scale (target $9K/mo recurring). Jewelry platform is the proving ground.',
    }),
    chatHint: 'The user is looking at Business Strategy. Focus on the Mongolia-first approach, phased plan, and growth targets.',
  },
  'edubook': {
    title: 'EduBook',
    subtitle: 'Paused',
    colorScheme: 'stone',
    fetchData: async () => ({
      kind: 'static',
      description: 'Educational content platform. Currently paused — waiting for Jewelry platform to generate revenue first.',
    }),
    chatHint: 'The user is looking at EduBook. This project is paused. Focus on its concept and when it might resume.',
  },
  'moodfit': {
    title: 'MoodFit',
    subtitle: 'Hypothesis',
    colorScheme: 'stone',
    fetchData: async () => ({
      kind: 'static',
      description: 'Mental health + fitness tracking concept. Still in hypothesis phase — needs validation research.',
    }),
    chatHint: 'The user is looking at MoodFit. This is in hypothesis phase. Focus on the concept and validation needs.',
  },
};

// Fallback for feature nodes not in config
export function getPanelDef(nodeId: string): NodePanelDef | null {
  if (panelConfig[nodeId]) return panelConfig[nodeId];
  return null;
}
