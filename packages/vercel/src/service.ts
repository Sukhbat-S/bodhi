// ============================================================
// BODHI — Vercel Service
// Tracks deployments and project status
// ============================================================

import type { VercelConfig, VercelDeployment, VercelProject } from "./types.js";

export class VercelService {
  private token: string;
  private projectId: string | null;
  private teamId: string | null;
  private baseUrl = "https://api.vercel.com";

  constructor(config: VercelConfig) {
    this.token = config.token;
    this.projectId = config.projectId || null;
    this.teamId = config.teamId || null;
  }

  // --- Core API Methods ---

  async getDeployments(limit = 10): Promise<VercelDeployment[]> {
    let path = `/v6/deployments?limit=${limit}`;
    if (this.projectId) path += `&projectId=${this.projectId}`;
    if (this.teamId) path += `&teamId=${this.teamId}`;

    const data = await this.vercelFetch<{ deployments: any[] }>(path);

    return data.deployments.map((d: any) => ({
      id: d.uid,
      name: d.name,
      url: d.url ? `https://${d.url}` : "",
      state: d.state || d.readyState || "QUEUED",
      createdAt: d.createdAt || d.created,
      readyAt: d.ready || undefined,
      buildDuration: d.buildingAt && d.ready ? d.ready - d.buildingAt : undefined,
      source: d.source || "unknown",
      target: d.target || null,
      meta: d.meta
        ? {
            branch: d.meta.githubCommitRef || d.meta.gitlabCommitRef || undefined,
            commit: d.meta.githubCommitSha?.slice(0, 7) || d.meta.gitlabCommitSha?.slice(0, 7) || undefined,
            commitMessage: d.meta.githubCommitMessage || d.meta.gitlabCommitMessage || undefined,
          }
        : undefined,
      inspectorUrl: d.inspectorUrl || "",
    }));
  }

  async getProject(): Promise<VercelProject | null> {
    if (!this.projectId) return null;

    let path = `/v9/projects/${this.projectId}`;
    if (this.teamId) path += `?teamId=${this.teamId}`;

    const data = await this.vercelFetch<any>(path);

    return {
      id: data.id,
      name: data.name,
      framework: data.framework || null,
    };
  }

  // --- Health check ---

  async ping(): Promise<boolean> {
    try {
      await this.vercelFetch<any>("/v2/user");
      return true;
    } catch {
      return false;
    }
  }

  // --- Summary for briefings ---

  async getBriefingSummary(): Promise<string> {
    const parts: string[] = [];

    try {
      const deployments = await this.getDeployments(5);

      if (deployments.length > 0) {
        const lines = deployments.map((d) => {
          const state = d.state;
          const target = d.target === "production" ? " [PRODUCTION]" : "";
          const age = formatAge(d.createdAt);
          const duration = d.buildDuration ? ` (${Math.round(d.buildDuration / 1000)}s)` : "";
          const commit = d.meta?.commitMessage ? ` — ${d.meta.commitMessage.split("\n")[0]}` : "";
          return `  - ${d.name} [${state}]${target}${duration}${commit} (${age})`;
        });

        // Highlight any errors or building
        const errors = deployments.filter((d) => d.state === "ERROR");
        const building = deployments.filter((d) => d.state === "BUILDING");

        let header = `Vercel Deployments (${deployments.length} recent):`;
        if (errors.length > 0) header += ` [${errors.length} ERROR]`;
        if (building.length > 0) header += ` [${building.length} BUILDING]`;

        parts.push(`${header}\n${lines.join("\n")}`);
      }
    } catch (err) {
      console.error("[vercel] Failed to build briefing summary:", err instanceof Error ? err.message : err);
    }

    return parts.join("\n\n");
  }

  // --- Internal ---

  private async vercelFetch<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Vercel API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }
}

function formatAge(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}
