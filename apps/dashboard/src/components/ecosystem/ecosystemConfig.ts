export type ColorScheme = 'violet' | 'emerald' | 'amber' | 'stone';
export type EdgeType = 'core' | 'monitors' | 'proves' | 'child';

export interface EcosystemNodeDef {
  id: string;
  type: 'hub' | 'project' | 'feature';
  label: string;
  subtitle?: string;
  colorScheme: ColorScheme;
  parentId?: string;
  initialPosition: { x: number; y: number };
  expandable?: boolean;
}

export interface EcosystemEdgeDef {
  id: string;
  source: string;
  target: string;
  edgeType: EdgeType;
}

export const nodeDefs: EcosystemNodeDef[] = [
  // ── BODHI HUB ──
  { id: 'bodhi-hub', type: 'hub', label: 'BODHI', subtitle: 'Personal AI Companion', colorScheme: 'violet', initialPosition: { x: 0, y: 0 } },

  // ── BODHI Subsystems ──
  { id: 'bodhi-core', type: 'project', label: 'Core Engine', subtitle: 'Agent + Bridge + MCP', colorScheme: 'violet', initialPosition: { x: -250, y: -220 }, expandable: true },
  { id: 'bodhi-memory', type: 'project', label: 'Memory', subtitle: 'Embeddings + pgvector', colorScheme: 'violet', initialPosition: { x: 50, y: -280 }, expandable: true },
  { id: 'bodhi-awareness', type: 'project', label: 'Awareness', subtitle: '6 connected services', colorScheme: 'violet', initialPosition: { x: 300, y: -180 }, expandable: true },
  { id: 'bodhi-scheduler', type: 'project', label: 'Scheduler', subtitle: '4 cron jobs', colorScheme: 'violet', initialPosition: { x: -320, y: 80 } },
  { id: 'bodhi-dashboard', type: 'project', label: 'Dashboard', subtitle: '11 pages', colorScheme: 'violet', initialPosition: { x: -180, y: 220 } },
  { id: 'bodhi-skills', type: 'project', label: 'Skills', subtitle: '9 slash commands', colorScheme: 'violet', initialPosition: { x: 180, y: 220 } },

  // ── Core children ──
  { id: 'core-agent', type: 'feature', label: 'Agent + ContextEngine', colorScheme: 'violet', parentId: 'bodhi-core', initialPosition: { x: -400, y: -350 } },
  { id: 'core-bridge', type: 'feature', label: 'Bridge ($0 via Max)', colorScheme: 'violet', parentId: 'bodhi-core', initialPosition: { x: -250, y: -380 } },
  { id: 'core-mcp', type: 'feature', label: 'MCP Server (8 tools)', colorScheme: 'violet', parentId: 'bodhi-core', initialPosition: { x: -100, y: -350 } },

  // ── Memory children ──
  { id: 'mem-embeddings', type: 'feature', label: 'Voyage AI + pgvector', colorScheme: 'violet', parentId: 'bodhi-memory', initialPosition: { x: -50, y: -420 } },
  { id: 'mem-synthesizer', type: 'feature', label: 'MemorySynthesizer', colorScheme: 'violet', parentId: 'bodhi-memory', initialPosition: { x: 100, y: -440 } },
  { id: 'mem-insight', type: 'feature', label: 'InsightGenerator', colorScheme: 'violet', parentId: 'bodhi-memory', initialPosition: { x: 230, y: -420 } },
  { id: 'mem-crossref', type: 'feature', label: 'Cross-session Reasoning', colorScheme: 'violet', parentId: 'bodhi-memory', initialPosition: { x: 50, y: -480 } },

  // ── Awareness integrations ──
  { id: 'bodhi-github', type: 'project', label: 'GitHub', subtitle: 'Commits & PRs', colorScheme: 'violet', initialPosition: { x: 480, y: -280 } },
  { id: 'bodhi-vercel', type: 'project', label: 'Vercel', subtitle: 'Deployments', colorScheme: 'violet', initialPosition: { x: 520, y: -130 } },
  { id: 'bodhi-supabase', type: 'project', label: 'Supabase', subtitle: 'DB health', colorScheme: 'violet', initialPosition: { x: 500, y: 30 } },
  { id: 'bodhi-gmail', type: 'project', label: 'Gmail', subtitle: 'Email context', colorScheme: 'violet', initialPosition: { x: 440, y: 170 } },
  { id: 'bodhi-calendar', type: 'project', label: 'Calendar', subtitle: 'Schedule', colorScheme: 'violet', initialPosition: { x: 340, y: 280 } },
  { id: 'bodhi-notion', type: 'project', label: 'Notion', subtitle: 'Knowledge base', colorScheme: 'violet', initialPosition: { x: 460, y: -400 } },

  // ── Jewelry Platform ──
  { id: 'jewelry', type: 'project', label: 'Jewelry Platform', subtitle: 'Shigtgee / Zuusgel', colorScheme: 'emerald', initialPosition: { x: -500, y: -50 }, expandable: true },
  { id: 'jewelry-storefront', type: 'feature', label: 'Storefront + Checkout', colorScheme: 'emerald', parentId: 'jewelry', initialPosition: { x: -700, y: -200 } },
  { id: 'jewelry-admin', type: 'feature', label: 'Admin Panel (15 pages)', colorScheme: 'emerald', parentId: 'jewelry', initialPosition: { x: -730, y: -60 } },
  { id: 'jewelry-photo', type: 'feature', label: 'Photo Studio (Gemini AI)', colorScheme: 'emerald', parentId: 'jewelry', initialPosition: { x: -720, y: 80 } },
  { id: 'jewelry-chatbot', type: 'feature', label: 'FB Chatbot (dual-brand)', colorScheme: 'emerald', parentId: 'jewelry', initialPosition: { x: -660, y: 200 } },
  { id: 'jewelry-quiz', type: 'feature', label: 'Stone Quiz (25 gems)', colorScheme: 'emerald', parentId: 'jewelry', initialPosition: { x: -560, y: 300 } },

  // ── Business Strategy ──
  { id: 'strategy', type: 'project', label: 'Business Strategy', subtitle: 'Mongolia-first AI Tools', colorScheme: 'amber', initialPosition: { x: 0, y: 400 }, expandable: true },
  { id: 'strategy-phase1', type: 'feature', label: 'Phase 1: Service (3-5 shops)', colorScheme: 'amber', parentId: 'strategy', initialPosition: { x: -180, y: 520 } },
  { id: 'strategy-phase2', type: 'feature', label: 'Phase 2: Platform', colorScheme: 'amber', parentId: 'strategy', initialPosition: { x: 0, y: 560 } },
  { id: 'strategy-phase3', type: 'feature', label: 'Phase 3: Scale ($9K/mo)', colorScheme: 'amber', parentId: 'strategy', initialPosition: { x: 180, y: 520 } },

  // ── Other Projects ──
  { id: 'edubook', type: 'project', label: 'EduBook', subtitle: 'Paused', colorScheme: 'stone', initialPosition: { x: -380, y: 420 } },
  { id: 'moodfit', type: 'project', label: 'MoodFit', subtitle: 'Hypothesis', colorScheme: 'stone', initialPosition: { x: 380, y: 450 } },
];

export const edgeDefs: EcosystemEdgeDef[] = [
  // Hub → subsystems
  { id: 'e-hub-core', source: 'bodhi-hub', target: 'bodhi-core', edgeType: 'core' },
  { id: 'e-hub-memory', source: 'bodhi-hub', target: 'bodhi-memory', edgeType: 'core' },
  { id: 'e-hub-awareness', source: 'bodhi-hub', target: 'bodhi-awareness', edgeType: 'core' },
  { id: 'e-hub-scheduler', source: 'bodhi-hub', target: 'bodhi-scheduler', edgeType: 'core' },
  { id: 'e-hub-dashboard', source: 'bodhi-hub', target: 'bodhi-dashboard', edgeType: 'core' },
  { id: 'e-hub-skills', source: 'bodhi-hub', target: 'bodhi-skills', edgeType: 'core' },

  // Core → children
  { id: 'e-core-agent', source: 'bodhi-core', target: 'core-agent', edgeType: 'child' },
  { id: 'e-core-bridge', source: 'bodhi-core', target: 'core-bridge', edgeType: 'child' },
  { id: 'e-core-mcp', source: 'bodhi-core', target: 'core-mcp', edgeType: 'child' },

  // Memory → children
  { id: 'e-mem-emb', source: 'bodhi-memory', target: 'mem-embeddings', edgeType: 'child' },
  { id: 'e-mem-syn', source: 'bodhi-memory', target: 'mem-synthesizer', edgeType: 'child' },
  { id: 'e-mem-ins', source: 'bodhi-memory', target: 'mem-insight', edgeType: 'child' },
  { id: 'e-mem-cross', source: 'bodhi-memory', target: 'mem-crossref', edgeType: 'child' },

  // Awareness → integrations
  { id: 'e-aware-gh', source: 'bodhi-awareness', target: 'bodhi-github', edgeType: 'monitors' },
  { id: 'e-aware-ver', source: 'bodhi-awareness', target: 'bodhi-vercel', edgeType: 'monitors' },
  { id: 'e-aware-sb', source: 'bodhi-awareness', target: 'bodhi-supabase', edgeType: 'monitors' },
  { id: 'e-aware-gm', source: 'bodhi-awareness', target: 'bodhi-gmail', edgeType: 'monitors' },
  { id: 'e-aware-cal', source: 'bodhi-awareness', target: 'bodhi-calendar', edgeType: 'monitors' },
  { id: 'e-aware-not', source: 'bodhi-awareness', target: 'bodhi-notion', edgeType: 'monitors' },

  // Hub → external projects
  { id: 'e-hub-jewelry', source: 'bodhi-hub', target: 'jewelry', edgeType: 'monitors' },
  { id: 'e-hub-strategy', source: 'bodhi-hub', target: 'strategy', edgeType: 'proves' },
  { id: 'e-hub-edubook', source: 'bodhi-hub', target: 'edubook', edgeType: 'monitors' },
  { id: 'e-hub-moodfit', source: 'bodhi-hub', target: 'moodfit', edgeType: 'proves' },

  // Jewelry → features
  { id: 'e-jew-store', source: 'jewelry', target: 'jewelry-storefront', edgeType: 'child' },
  { id: 'e-jew-admin', source: 'jewelry', target: 'jewelry-admin', edgeType: 'child' },
  { id: 'e-jew-photo', source: 'jewelry', target: 'jewelry-photo', edgeType: 'child' },
  { id: 'e-jew-chat', source: 'jewelry', target: 'jewelry-chatbot', edgeType: 'child' },
  { id: 'e-jew-quiz', source: 'jewelry', target: 'jewelry-quiz', edgeType: 'child' },

  // Strategy → phases
  { id: 'e-strat-p1', source: 'strategy', target: 'strategy-phase1', edgeType: 'child' },
  { id: 'e-strat-p2', source: 'strategy', target: 'strategy-phase2', edgeType: 'child' },
  { id: 'e-strat-p3', source: 'strategy', target: 'strategy-phase3', edgeType: 'child' },

  // Cross-system connections
  { id: 'e-jewelry-strategy', source: 'jewelry', target: 'strategy', edgeType: 'proves' },
];
