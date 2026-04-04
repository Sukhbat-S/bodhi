// ============================================================
// BODHI — Gmail Service
// Read-only access to Gmail inbox for briefings and queries
// ============================================================

import { google } from "googleapis";
import type { GoogleAuth } from "./auth.js";
import type { EmailSummary, DraftInput, DraftResult } from "./types.js";

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

  async getMessageBody(messageId: string): Promise<string | null> {
    try {
      const res = await this.gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });

      const payload = res.data.payload;
      if (!payload) return null;

      // Try plain text first, then HTML
      const getBody = (part: typeof payload): string | null => {
        if (part.mimeType === "text/plain" && part.body?.data) {
          return Buffer.from(part.body.data, "base64").toString("utf-8");
        }
        if (part.parts) {
          for (const sub of part.parts) {
            const text = getBody(sub);
            if (text) return text;
          }
        }
        if (part.body?.data) {
          return Buffer.from(part.body.data, "base64").toString("utf-8");
        }
        return null;
      };

      return getBody(payload);
    } catch {
      return null;
    }
  }

  async createDraft(input: DraftInput): Promise<DraftResult> {
    const headers = [
      `To: ${input.to}`,
      `Subject: ${input.subject}`,
      `Content-Type: text/plain; charset="UTF-8"`,
    ];
    if (input.cc) headers.push(`Cc: ${input.cc}`);
    if (input.bcc) headers.push(`Bcc: ${input.bcc}`);

    const raw = Buffer.from(
      headers.join("\r\n") + "\r\n\r\n" + input.body
    ).toString("base64url");

    const res = await this.gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw } },
    });

    return {
      id: res.data.id!,
      threadId: res.data.message?.threadId || undefined,
      message: `Draft created: "${input.subject}" to ${input.to}`,
    };
  }

  async sendDraft(draftId: string): Promise<{ messageId: string; threadId: string }> {
    const res = await this.gmail.users.drafts.send({
      userId: "me",
      requestBody: { id: draftId },
    });

    return {
      messageId: res.data.id!,
      threadId: res.data.threadId!,
    };
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
