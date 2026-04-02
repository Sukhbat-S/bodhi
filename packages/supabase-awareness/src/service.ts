// ============================================================
// BODHI — Supabase Awareness Service
// Monitors Supabase project health and database activity
// ============================================================

import type { SupabaseAwarenessConfig, SupabaseProjectHealth, SupabaseTableInfo } from "./types.js";

export class SupabaseAwarenessService {
  private token: string;
  private projectRef: string;
  private baseUrl = "https://api.supabase.com";

  constructor(config: SupabaseAwarenessConfig) {
    this.token = config.accessToken;
    this.projectRef = config.projectRef;
  }

  // --- Core API Methods ---

  async getProjectHealth(): Promise<SupabaseProjectHealth> {
    const data = await this.supabaseFetch<any>(`/v1/projects/${this.projectRef}`);

    return {
      ref: data.id || this.projectRef,
      name: data.name || "Unknown",
      status: data.status || "UNKNOWN",
      region: data.region || "unknown",
      createdAt: data.created_at || "",
      dbVersion: data.database?.version || "unknown",
    };
  }

  async getTableStats(): Promise<SupabaseTableInfo[]> {
    try {
      // Use the Management API query endpoint to get table stats via SQL
      const sql = `SELECT schemaname as schema, relname as name, n_live_tup as row_count
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY n_live_tup DESC`;

      const data = await this.supabaseQuery<
        { schema: string; name: string; row_count: number }[]
      >(sql);

      if (!Array.isArray(data)) return [];

      return data.map((t) => ({
        schema: t.schema || "public",
        name: t.name,
        rowCount: t.row_count || 0,
      }));
    } catch {
      // Fallback: return empty if endpoint not available
      return [];
    }
  }

  async getRecentActivity(): Promise<{
    health: SupabaseProjectHealth;
    tables: SupabaseTableInfo[];
  }> {
    const [health, tables] = await Promise.all([
      this.getProjectHealth(),
      this.getTableStats(),
    ]);
    return { health, tables };
  }

  // --- Health check ---

  async ping(): Promise<boolean> {
    try {
      await this.supabaseFetch<any>(`/v1/projects/${this.projectRef}`);
      return true;
    } catch {
      return false;
    }
  }

  // --- Summary for briefings ---

  async getBriefingSummary(): Promise<string> {
    const parts: string[] = [];

    try {
      const { health, tables } = await this.getRecentActivity();

      // Project health
      const statusEmoji = health.status === "ACTIVE_HEALTHY" ? "HEALTHY" : health.status;
      parts.push(`Supabase Project: ${health.name} [${statusEmoji}] (${health.region})`);

      // Table stats
      if (tables.length > 0) {
        const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);
        const tableLines = tables.map((t) => `  - ${t.name}: ${t.rowCount.toLocaleString()} rows`);
        parts.push(`Tables (${tables.length}, ${totalRows.toLocaleString()} total rows):\n${tableLines.join("\n")}`);
      }
    } catch (err) {
      console.error("[supabase] Failed to build briefing summary:", err instanceof Error ? err.message : err);
    }

    return parts.join("\n\n");
  }

  // --- Internal ---

  private async supabaseFetch<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private async supabaseQuery<T>(sql: string): Promise<T> {
    const url = `${this.baseUrl}/v1/projects/${this.projectRef}/database/query`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!response.ok) {
      throw new Error(`Supabase query error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }
}
