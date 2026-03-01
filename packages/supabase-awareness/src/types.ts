// ============================================================
// BODHI — Supabase Awareness Types
// ============================================================

export interface SupabaseAwarenessConfig {
  accessToken: string;
  projectRef: string;
}

export interface SupabaseProjectHealth {
  ref: string;
  name: string;
  status: string; // "ACTIVE_HEALTHY", "COMING_UP", "PAUSED", etc.
  region: string;
  createdAt: string;
  dbVersion: string;
}

export interface SupabaseTableInfo {
  schema: string;
  name: string;
  rowCount: number;
}
