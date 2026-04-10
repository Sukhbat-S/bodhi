// ============================================================
// BODHI — Mongolian Terminology Guide + Curriculum
// Used by the content generation pipeline to ensure consistent
// Mongolian translations and proper technical vocabulary.
// ============================================================

/** Terms that should ALWAYS stay in English (no translation) */
export const KEEP_ENGLISH = [
  "Claude Code", "Claude", "Anthropic", "API", "MCP", "hooks", "skills",
  "CLAUDE.md", "CLI", "JSON", "TypeScript", "JavaScript", "React",
  "Node.js", "npm", "git", "GitHub", "Supabase", "Vercel", "Drizzle",
  "SSH", "Docker", "REST", "GraphQL", "SSE", "WebSocket", "UUID",
  "Opus", "Sonnet", "Haiku", "token", "prompt", "context window",
] as const;

/** Approved Mongolian translations for common dev terms */
export const MONGOLIAN_TERMS: Record<string, string> = {
  // Actions
  install: "суулгах",
  deploy: "deploy хийх",
  debug: "алдаа засах",
  commit: "commit хийх",
  push: "push хийх",
  pull: "pull хийх",
  build: "build хийх",
  run: "ажиллуулах",
  test: "тест хийх",
  search: "хайх",
  create: "үүсгэх",
  delete: "устгах",
  update: "шинэчлэх",
  configure: "тохируулах",
  connect: "холбох",

  // Concepts
  file: "файл",
  folder: "хавтас",
  project: "төсөл",
  database: "мэдээллийн сан",
  server: "сервер",
  function: "функц",
  variable: "хувьсагч",
  component: "компонент",
  permission: "зөвшөөрөл",
  workflow: "ажлын урсгал",
  automation: "автоматжуулалт",
  schedule: "хуваарь",
  template: "загвар",
  memory: "санах ой",
  agent: "agent (AI туслагч)",
  terminal: "терминал",
  command: "команд",
  shortcut: "товчлол",
  extension: "өргөтгөл",
  plugin: "plugin",
  tool: "хэрэгсэл",
  model: "загвар (AI model)",
  code: "код",
  editor: "засварлагч",
  browser: "хөтөч",
  feature: "боломж",
  bug: "алдаа",
  error: "алдаа",
  warning: "анхааруулга",
  output: "гаралт",
  input: "оролт",
};

/** 30-topic curriculum: beginner → advanced */
export interface CurriculumTopic {
  lessonNumber: number;
  titleMN: string;
  titleEN: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced" | "mastery";
  slideCount: number;
  hasCode: boolean;
}

export const CURRICULUM: CurriculumTopic[] = [
  // Week 1-2: Basics
  { lessonNumber: 1, titleMN: "Claude Code гэж юу вэ?", titleEN: "What is Claude Code?", description: "Introduction to Claude Code — what it does, how it differs from ChatGPT, why developers use it", difficulty: "beginner", slideCount: 6, hasCode: false },
  { lessonNumber: 2, titleMN: "Суулгах, эхлүүлэх", titleEN: "Install & get started", description: "Step-by-step installation on Mac/Windows/Linux, first run, basic navigation", difficulty: "beginner", slideCount: 7, hasCode: true },
  { lessonNumber: 3, titleMN: "Эхний код бичих", titleEN: "Write your first code", description: "Ask Claude Code to create a simple project, understand the conversation flow", difficulty: "beginner", slideCount: 6, hasCode: true },
  { lessonNumber: 4, titleMN: "CLAUDE.md — төслийн тохиргоо", titleEN: "CLAUDE.md — project instructions", description: "How to give Claude Code persistent instructions about your project", difficulty: "beginner", slideCount: 5, hasCode: true },
  { lessonNumber: 5, titleMN: "Зөвшөөрлийн горим", titleEN: "Permission modes", description: "Accept edits, auto-accept, plan mode — when to use each", difficulty: "beginner", slideCount: 5, hasCode: false },
  { lessonNumber: 6, titleMN: "Контекст цонх ойлгох", titleEN: "Understanding context window", description: "What the 1M token context means, how to manage it, when it matters", difficulty: "beginner", slideCount: 5, hasCode: false },

  // Week 3-4: Daily Workflows
  { lessonNumber: 7, titleMN: "Session эхлэх, хадгалах", titleEN: "Session workflow", description: "/session-start and /session-save — how to structure your work sessions", difficulty: "intermediate", slideCount: 6, hasCode: true },
  { lessonNumber: 8, titleMN: "Skills хэрхэн бичих", titleEN: "Writing skills", description: "Create reusable .md skill files that Claude auto-loads for specific tasks", difficulty: "intermediate", slideCount: 7, hasCode: true },
  { lessonNumber: 9, titleMN: "Hooks автоматжуулалт", titleEN: "Automation with hooks", description: "PostToolUse hooks — run type-checks, linters, or custom scripts after every edit", difficulty: "intermediate", slideCount: 6, hasCode: true },
  { lessonNumber: 10, titleMN: "Git commit + PR workflow", titleEN: "Git commit + PR workflow", description: "How Claude Code handles git — staging, commits, PR creation", difficulty: "intermediate", slideCount: 6, hasCode: true },
  { lessonNumber: 11, titleMN: "Алдаа засах (Debugging)", titleEN: "Debugging with Claude Code", description: "Let Claude read error messages, trace bugs, suggest fixes", difficulty: "intermediate", slideCount: 6, hasCode: true },
  { lessonNumber: 12, titleMN: "Олон файл засварлах", titleEN: "Multi-file editing", description: "How Claude navigates and edits across large codebases", difficulty: "intermediate", slideCount: 5, hasCode: true },

  // Week 5-6: Advanced
  { lessonNumber: 13, titleMN: "MCP серверүүд", titleEN: "MCP servers", description: "Connect Claude Code to external tools — databases, APIs, services", difficulty: "advanced", slideCount: 7, hasCode: true },
  { lessonNumber: 14, titleMN: "/schedule автомат ажил", titleEN: "Scheduled tasks", description: "Run prompts on a schedule — daily audits, research, monitoring", difficulty: "advanced", slideCount: 6, hasCode: true },
  { lessonNumber: 15, titleMN: "Subagents — олон agent", titleEN: "Subagents — parallel agents", description: "Spawn multiple agents for research, testing, deployment", difficulty: "advanced", slideCount: 6, hasCode: true },
  { lessonNumber: 16, titleMN: "Supabase + Claude Code", titleEN: "Supabase + Claude Code", description: "Database operations, migrations, type generation with Claude", difficulty: "advanced", slideCount: 7, hasCode: true },
  { lessonNumber: 17, titleMN: "Vercel deploy автоматжуулалт", titleEN: "Vercel deploy automation", description: "Deploy, preview, rollback — all from the terminal", difficulty: "advanced", slideCount: 6, hasCode: true },
  { lessonNumber: 18, titleMN: "AI SDK холболт", titleEN: "AI SDK integration", description: "Build AI-powered features using Vercel AI SDK with Claude", difficulty: "advanced", slideCount: 7, hasCode: true },

  // Week 7-8: Real Projects
  { lessonNumber: 19, titleMN: "Вэб сайт бүтээх", titleEN: "Build a website", description: "Create a full website from scratch with Claude Code — start to deploy", difficulty: "advanced", slideCount: 7, hasCode: true },
  { lessonNumber: 20, titleMN: "Хэрэгсэл дуудах (Tool Use)", titleEN: "Tool Use and Function Calling", description: "Teach Claude to call your own functions — weather, database, APIs — with typed JSON responses", difficulty: "advanced", slideCount: 7, hasCode: true },
  { lessonNumber: 21, titleMN: "RAG: мэдлэгийн сан", titleEN: "RAG: Knowledge Base", description: "Retrieval-Augmented Generation — embed docs, search with pgvector, inject context into prompts", difficulty: "advanced", slideCount: 7, hasCode: true },
  { lessonNumber: 22, titleMN: "Мэдэгдлийн систем бүтээх", titleEN: "Building Notification Systems", description: "Send Telegram/email alerts on events — cron triggers, webhook listeners, alert routing", difficulty: "advanced", slideCount: 7, hasCode: true },
  { lessonNumber: 23, titleMN: "Хуваарьт автомат ажлууд", titleEN: "Scheduled Automated Tasks", description: "node-cron schedules, idempotent jobs, retry logic, and monitoring for autonomous AI workflows", difficulty: "advanced", slideCount: 7, hasCode: true },
  { lessonNumber: 24, titleMN: "Dashboard бүтээх", titleEN: "Building Dashboards", description: "React + Tailwind dashboard with live data, charts, status cards, and API-driven updates", difficulty: "advanced", slideCount: 7, hasCode: true },

  // Week 9-10: Mastery
  { lessonNumber: 25, titleMN: "Telegram бот хийх", titleEN: "Building a Telegram Bot", description: "Full Telegraf bot with commands, conversation memory, AI responses, and single-user access gate", difficulty: "mastery", slideCount: 7, hasCode: true },
  { lessonNumber: 26, titleMN: "Бүтээмж 10x нэмэгдүүлэх", titleEN: "10x productivity", description: "Workflow optimization, context management, parallel work patterns", difficulty: "mastery", slideCount: 6, hasCode: false },
  { lessonNumber: 27, titleMN: "AI аппын аюулгүй байдал", titleEN: "Security Best Practices", description: "Secure your AI-powered apps — secrets management, input validation, auth, safe deployment", difficulty: "mastery", slideCount: 6, hasCode: true },
  { lessonNumber: 28, titleMN: "AI систем өргөтгөх", titleEN: "Scaling AI Systems", description: "Scale AI apps from prototype to production — caching, rate limits, queues, cost control", difficulty: "mastery", slideCount: 6, hasCode: true },
  { lessonNumber: 29, titleMN: "AI бизнес загвар", titleEN: "AI Business Models", description: "Monetize AI apps — subscription vs usage pricing, cost structure, positioning in the market", difficulty: "mastery", slideCount: 6, hasCode: false },
  { lessonNumber: 30, titleMN: "Олон нийтэд бүтээх — Capstone", titleEN: "Building in Public Capstone", description: "Ship your AI project publicly — launch checklist, build-in-public strategy, grow an audience", difficulty: "mastery", slideCount: 7, hasCode: false },
];
