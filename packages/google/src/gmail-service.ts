// ============================================================
// BODHI — Gmail Service
// Read-only access to Gmail inbox for briefings and queries
// ============================================================

import { google } from "googleapis";
import type { GoogleAuth } from "./auth.js";
import type { EmailSummary } from "./types.js";

export class GmailService {
  private gmail;

  constructor(auth: GoogleAuth) {
    this.gmail = google.gmail({ version: "v1", auth: auth.getClient() });
  }

  async getRecent(limit = 10): Promise<EmailSummary[]> {
    const res = await this.gmail.users.messages.list({
      userId: "me",
      maxResults: limit,
      labelIds: ["INBOX"],
    });

    if (!res.data.messages?.length) return [];

    const emails = await Promise.all(
      res.data.messages.map((msg) => this.getMessageMetadata(msg.id!))
    );

    return emails.filter((e): e is EmailSummary => e !== null);
  }

  async getUnreadCount(): Promise<number> {
    const res = await this.gmail.users.labels.get({
      userId: "me",
      id: "INBOX",
    });
    return res.data.messagesUnread || 0;
  }

  async search(query: string, limit = 10): Promise<EmailSummary[]> {
    const res = await this.gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: limit,
    });

    if (!res.data.messages?.length) return [];

    const emails = await Promise.all(
      res.data.messages.map((msg) => this.getMessageMetadata(msg.id!))
    );

    return emails.filter((e): e is EmailSummary => e !== null);
  }

  async getTodayEmails(): Promise<EmailSummary[]> {
    const today = new Date();
    const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}`;
    return this.search(`after:${dateStr}`);
  }

  async ping(): Promise<boolean> {
    try {
      await this.gmail.users.getProfile({ userId: "me" });
      return true;
    } catch {
      return false;
    }
  }

  async getBriefingSummary(): Promise<string> {
    const parts: string[] = [];

    try {
      const unreadCount = await this.getUnreadCount();
      parts.push(`Unread emails: ${unreadCount}`);
    } catch (err) {
      console.error("[gmail] Failed to get unread count:", err instanceof Error ? err.message : err);
    }

    try {
      const recent = await this.getRecent(5);
      if (recent.length > 0) {
        const emailLines = recent.map((e) => {
          const unread = e.isUnread ? " [UNREAD]" : "";
          return `  - ${e.from}: ${e.subject}${unread} (${e.date})`;
        });
        parts.push(`Recent inbox (${recent.length}):\n${emailLines.join("\n")}`);
      }
    } catch (err) {
      console.error("[gmail] Failed to get recent:", err instanceof Error ? err.message : err);
    }

    return parts.join("\n\n");
  }

  private async getMessageMetadata(messageId: string): Promise<EmailSummary | null> {
    try {
      const res = await this.gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });

      const headers = res.data.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

      return {
        id: res.data.id!,
        threadId: res.data.threadId!,
        from: this.parseFrom(getHeader("From")),
        subject: getHeader("Subject") || "(no subject)",
        snippet: res.data.snippet || "",
        date: this.formatDate(getHeader("Date")),
        isUnread: res.data.labelIds?.includes("UNREAD") || false,
        labels: res.data.labelIds || [],
      };
    } catch {
      return null;
    }
  }

  private parseFrom(from: string): string {
    // Extract name from "Name <email>" format
    const match = from.match(/^"?([^"<]+)"?\s*</);
    return match ? match[1].trim() : from.split("@")[0];
  }

  private formatDate(dateStr: string): string {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) {
        return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  }
}
