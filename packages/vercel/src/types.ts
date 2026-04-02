// ============================================================
// BODHI — Vercel Types
// ============================================================

export interface VercelConfig {
  token: string;
  projectId?: string;
  teamId?: string;
}

export interface VercelDeployment {
  id: string;
  name: string;
  url: string;
  state: "BUILDING" | "READY" | "ERROR" | "QUEUED" | "CANCELED" | "INITIALIZING";
  createdAt: number; // timestamp ms
  readyAt?: number;
  buildDuration?: number; // ms
  source: string; // "git", "cli", etc.
  target: string | null; // "production" or null (preview)
  meta?: {
    branch?: string;
    commit?: string;
    commitMessage?: string;
  };
  inspectorUrl: string;
}

export interface VercelProject {
  id: string;
  name: string;
  framework: string | null;
}
