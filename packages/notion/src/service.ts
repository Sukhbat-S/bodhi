// ============================================================
// BODHI — Notion Service
// Reads tasks, dev sessions, and pages from Notion workspace
// ============================================================

import { Client } from "@notionhq/client";

// --- Types ---

export interface NotionTask {
  id: string;
  title: string;
  status: string | null;
  due: string | null;
  url: string;
}

export interface NotionSession {
  id: string;
  sessionNumber: string;
  focus: string | null;
  status: string | null;
  phase: string | null;
  date: string | null;
  keyDecisions: string | null;
  pendingItems: string | null;
  patternsDiscovered: string | null;
  complexity: string | null;
  deployed: boolean;
  url: string;
}

export interface NotionConfig {
  apiKey: string;
  tasksDatabaseId?: string;
  sessionsDatabaseId?: string;
}

// --- Service ---

export class NotionService {
  private client: Client;
  private tasksDatabaseId: string | null;
  private sessionsDatabaseId: string | null;

  constructor(config: NotionConfig) {
    this.client = new Client({ auth: config.apiKey });
    this.tasksDatabaseId = config.tasksDatabaseId || null;
    this.sessionsDatabaseId = config.sessionsDatabaseId || null;
  }

  // --- Tasks ---

  async getTasks(filter: "all" | "active" | "todo" = "active"): Promise<NotionTask[]> {
    if (!this.tasksDatabaseId) return [];

    const filterObj = this.buildTaskFilter(filter);

    const response = await this.client.databases.query({
      database_id: this.tasksDatabaseId,
      ...(filterObj && { filter: filterObj }),
      sorts: [{ property: "Due", direction: "ascending" }],
      page_size: 20,
    });

    return response.results.map((page: any) => ({
      id: page.id,
      title: this.extractTitle(page.properties["Task name"] || page.properties["Name"]),
      status: this.extractStatus(page.properties["Status"]),
      due: this.extractDate(page.properties["Due"]),
      url: page.url,
    }));
  }

  // --- Dev Sessions ---

  async getSessions(limit = 10): Promise<NotionSession[]> {
    if (!this.sessionsDatabaseId) return [];

    const response = await this.client.databases.query({
      database_id: this.sessionsDatabaseId,
      sorts: [{ property: "Date", direction: "descending" }],
      page_size: limit,
    });

    return response.results.map((page: any) => ({
      id: page.id,
      sessionNumber: this.extractTitle(page.properties["Session #"]),
      focus: this.extractRichText(page.properties["Focus"]),
      status: this.extractSelect(page.properties["Status"]),
      phase: this.extractSelect(page.properties["Phase"]),
      date: this.extractDate(page.properties["Date"]),
      keyDecisions: this.extractRichText(page.properties["Key Decisions"]),
      pendingItems: this.extractRichText(page.properties["Pending Items"]),
      patternsDiscovered: this.extractRichText(page.properties["Patterns Discovered"]),
      complexity: this.extractSelect(page.properties["Complexity"]),
      deployed: this.extractCheckbox(page.properties["Deployed"]),
      url: page.url,
    }));
  }

  async getRecentSessions(days = 7): Promise<NotionSession[]> {
    if (!this.sessionsDatabaseId) return [];

    const since = new Date();
    since.setDate(since.getDate() - days);

    const response = await this.client.databases.query({
      database_id: this.sessionsDatabaseId,
      filter: {
        property: "Date",
        date: { on_or_after: since.toISOString().split("T")[0] },
      },
      sorts: [{ property: "Date", direction: "descending" }],
      page_size: 20,
    });

    return response.results.map((page: any) => ({
      id: page.id,
      sessionNumber: this.extractTitle(page.properties["Session #"]),
      focus: this.extractRichText(page.properties["Focus"]),
      status: this.extractSelect(page.properties["Status"]),
      phase: this.extractSelect(page.properties["Phase"]),
      date: this.extractDate(page.properties["Date"]),
      keyDecisions: this.extractRichText(page.properties["Key Decisions"]),
      pendingItems: this.extractRichText(page.properties["Pending Items"]),
      patternsDiscovered: this.extractRichText(page.properties["Patterns Discovered"]),
      complexity: this.extractSelect(page.properties["Complexity"]),
      deployed: this.extractCheckbox(page.properties["Deployed"]),
      url: page.url,
    }));
  }

  // --- Search ---

  async search(query: string, limit = 5): Promise<{ title: string; url: string; type: string }[]> {
    const response = await this.client.search({
      query,
      page_size: limit,
      sort: { direction: "descending", timestamp: "last_edited_time" },
    });

    return response.results.map((result: any) => {
      let title = "Untitled";
      if (result.object === "database") {
        // Database objects have title as an array of rich text
        title = result.title?.map((t: any) => t.plain_text).join("") || "Untitled";
      } else if (result.properties) {
        // Page objects have properties with a title type
        title = this.extractAnyTitle(result.properties);
      }
      return {
        title,
        url: result.url,
        type: result.object,
      };
    });
  }

  // --- Health check ---

  async ping(): Promise<boolean> {
    try {
      await this.client.users.me({});
      return true;
    } catch {
      return false;
    }
  }

  // --- Summary for briefings ---

  async getBriefingSummary(): Promise<string> {
    const parts: string[] = [];

    // Active tasks
    try {
      const tasks = await this.getTasks("active");
      if (tasks.length > 0) {
        const taskLines = tasks.map((t) => {
          const due = t.due ? ` (due: ${t.due})` : "";
          const status = t.status ? ` [${t.status}]` : "";
          return `  - ${t.title}${status}${due}`;
        });
        parts.push(`Active Notion Tasks (${tasks.length}):\n${taskLines.join("\n")}`);
      }
    } catch (err) {
      console.error("[notion] Failed to fetch tasks:", err instanceof Error ? err.message : err);
    }

    // Recent dev sessions
    try {
      const sessions = await this.getRecentSessions(7);
      if (sessions.length > 0) {
        const sessionLines = sessions.slice(0, 5).map((s) => {
          const focus = s.focus ? ` — ${s.focus}` : "";
          const status = s.status ? ` [${s.status}]` : "";
          return `  - Session ${s.sessionNumber}${focus}${status}`;
        });
        parts.push(`Recent Dev Sessions (last 7 days):\n${sessionLines.join("\n")}`);
      }
    } catch (err) {
      console.error("[notion] Failed to fetch sessions:", err instanceof Error ? err.message : err);
    }

    return parts.join("\n\n");
  }

  // --- Property extractors ---

  private extractTitle(prop: any): string {
    if (!prop) return "Untitled";
    if (prop.type === "title") {
      return prop.title?.map((t: any) => t.plain_text).join("") || "Untitled";
    }
    return "Untitled";
  }

  private extractAnyTitle(properties: any): string {
    if (!properties || typeof properties !== "object") return "Untitled";
    for (const key of Object.keys(properties)) {
      const prop = properties[key];
      if (prop?.type === "title" && Array.isArray(prop.title)) {
        return prop.title.map((t: any) => t.plain_text).join("") || "Untitled";
      }
    }
    return "Untitled";
  }

  private extractRichText(prop: any): string | null {
    if (!prop || prop.type !== "rich_text") return null;
    const text = prop.rich_text?.map((t: any) => t.plain_text).join("") || "";
    return text || null;
  }

  private extractSelect(prop: any): string | null {
    if (!prop) return null;
    if (prop.type === "select") return prop.select?.name || null;
    if (prop.type === "status") return prop.status?.name || null;
    return null;
  }

  private extractStatus(prop: any): string | null {
    if (!prop) return null;
    if (prop.type === "status") return prop.status?.name || null;
    if (prop.type === "select") return prop.select?.name || null;
    return null;
  }

  private extractDate(prop: any): string | null {
    if (!prop || prop.type !== "date") return null;
    return prop.date?.start || null;
  }

  private extractCheckbox(prop: any): boolean {
    if (!prop || prop.type !== "checkbox") return false;
    return prop.checkbox || false;
  }

  private buildTaskFilter(filter: "all" | "active" | "todo"): any {
    if (filter === "all") return undefined;

    if (filter === "active") {
      return {
        or: [
          { property: "Status", status: { equals: "In progress" } },
          { property: "Status", status: { equals: "Not started" } },
        ],
      };
    }

    if (filter === "todo") {
      return {
        property: "Status",
        status: { equals: "Not started" },
      };
    }

    return undefined;
  }
}
