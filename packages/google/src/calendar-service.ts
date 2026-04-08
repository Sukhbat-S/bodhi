// ============================================================
// BODHI — Google Calendar Service
// Read-only access to Calendar for briefings and queries
// ============================================================

import { google } from "googleapis";
import type { GoogleAuth } from "./auth.js";
import type { CalendarEvent, FreeSlot, EventInput, EventResult } from "./types.js";

export class CalendarService {
  private calendar;

  constructor(auth: GoogleAuth) {
    this.calendar = google.calendar({ version: "v3", auth: auth.getClient() });
  }

  async getTodayEvents(): Promise<CalendarEvent[]> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    return this.getEvents(startOfDay, endOfDay);
  }

  async getUpcoming(days = 7): Promise<CalendarEvent[]> {
    const now = new Date();
    const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return this.getEvents(now, end);
  }

  async getFreeTime(): Promise<FreeSlot[]> {
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0); // until 8 PM

    // If past work hours, return empty
    if (now >= endOfDay) return [];

    const workStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0);
    const effectiveStart = now > workStart ? now : workStart;

    const events = await this.getEvents(effectiveStart, endOfDay);

    // Sort by start time
    const sorted = events
      .filter((e) => !e.isAllDay)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    const slots: FreeSlot[] = [];
    let cursor = effectiveStart;

    for (const event of sorted) {
      const eventStart = new Date(event.start);
      if (eventStart > cursor) {
        const durationMinutes = Math.round((eventStart.getTime() - cursor.getTime()) / 60000);
        if (durationMinutes >= 15) {
          slots.push({
            start: cursor.toISOString(),
            end: eventStart.toISOString(),
            durationMinutes,
          });
        }
      }
      const eventEnd = new Date(event.end);
      if (eventEnd > cursor) {
        cursor = eventEnd;
      }
    }

    // Gap after last event until end of day
    if (cursor < endOfDay) {
      const durationMinutes = Math.round((endOfDay.getTime() - cursor.getTime()) / 60000);
      if (durationMinutes >= 15) {
        slots.push({
          start: cursor.toISOString(),
          end: endOfDay.toISOString(),
          durationMinutes,
        });
      }
    }

    return slots;
  }

  async createEvent(input: EventInput): Promise<EventResult> {
    const res = await this.calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: input.summary,
        description: input.description,
        location: input.location,
        start: { dateTime: input.start },
        end: { dateTime: input.end },
        attendees: input.attendees?.map((email) => ({ email })),
      },
    });

    const startTime = this.formatTime(input.start);
    const day = this.formatDay(input.start);
    return {
      id: res.data.id!,
      htmlLink: res.data.htmlLink || undefined,
      message: `Event created: "${input.summary}" on ${day} at ${startTime}`,
    };
  }

  async updateEvent(
    eventId: string,
    updates: Partial<EventInput>
  ): Promise<EventResult> {
    const body: Record<string, unknown> = {};
    if (updates.summary) body.summary = updates.summary;
    if (updates.description) body.description = updates.description;
    if (updates.location) body.location = updates.location;
    if (updates.start) body.start = { dateTime: updates.start };
    if (updates.end) body.end = { dateTime: updates.end };
    if (updates.attendees) body.attendees = updates.attendees.map((email) => ({ email }));

    const res = await this.calendar.events.patch({
      calendarId: "primary",
      eventId,
      requestBody: body,
    });

    return {
      id: res.data.id!,
      htmlLink: res.data.htmlLink || undefined,
      message: `Event updated: "${res.data.summary}"`,
    };
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.calendar.events.delete({
      calendarId: "primary",
      eventId,
    });
  }

  async listEvents(timeMin: string, timeMax: string): Promise<Array<{ id: string; summary: string; start: string; end: string }>> {
    const events = await this.getEvents(new Date(timeMin), new Date(timeMax));
    return events.map((e) => ({ id: e.id, summary: e.summary, start: e.start, end: e.end }));
  }

  async ping(): Promise<boolean> {
    try {
      await this.calendar.calendarList.list({ maxResults: 1 });
      return true;
    } catch {
      return false;
    }
  }

  async getBriefingSummary(type: "morning" | "evening" = "morning"): Promise<string> {
    const parts: string[] = [];

    if (type === "morning") {
      // Today's events + week preview
      try {
        const todayEvents = await this.getTodayEvents();
        if (todayEvents.length > 0) {
          const lines = todayEvents.map((e) => {
            const time = e.isAllDay ? "All day" : `${this.formatTime(e.start)} - ${this.formatTime(e.end)}`;
            const loc = e.location ? ` @ ${e.location}` : "";
            return `  - ${time}: ${e.summary}${loc}`;
          });
          parts.push(`Today's schedule (${todayEvents.length} events):\n${lines.join("\n")}`);
        } else {
          parts.push("Today's schedule: No events");
        }
      } catch (err) {
        console.error("[calendar] Failed to get today's events:", err instanceof Error ? err.message : err);
      }

      try {
        const upcoming = await this.getUpcoming(7);
        // Exclude today's events from week preview
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        const futureEvents = upcoming.filter((e) => new Date(e.start) >= tomorrow);
        if (futureEvents.length > 0) {
          const lines = futureEvents.slice(0, 5).map((e) => {
            const day = this.formatDay(e.start);
            const time = e.isAllDay ? "All day" : this.formatTime(e.start);
            return `  - ${day} ${time}: ${e.summary}`;
          });
          parts.push(`This week ahead (${futureEvents.length} events):\n${lines.join("\n")}`);
        }
      } catch (err) {
        console.error("[calendar] Failed to get upcoming:", err instanceof Error ? err.message : err);
      }
    } else {
      // Evening: today recap + tomorrow preview
      try {
        const todayEvents = await this.getTodayEvents();
        if (todayEvents.length > 0) {
          const lines = todayEvents.map((e) => {
            const time = e.isAllDay ? "All day" : `${this.formatTime(e.start)} - ${this.formatTime(e.end)}`;
            return `  - ${time}: ${e.summary}`;
          });
          parts.push(`Today's events (${todayEvents.length}):\n${lines.join("\n")}`);
        }
      } catch (err) {
        console.error("[calendar] Failed to get today's events:", err instanceof Error ? err.message : err);
      }

      try {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
        const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);

        const tomorrowEvents = await this.getEvents(tomorrowStart, tomorrowEnd);
        if (tomorrowEvents.length > 0) {
          const lines = tomorrowEvents.map((e) => {
            const time = e.isAllDay ? "All day" : this.formatTime(e.start);
            return `  - ${time}: ${e.summary}`;
          });
          parts.push(`Tomorrow's schedule (${tomorrowEvents.length}):\n${lines.join("\n")}`);
        } else {
          parts.push("Tomorrow: No events scheduled");
        }
      } catch (err) {
        console.error("[calendar] Failed to get tomorrow:", err instanceof Error ? err.message : err);
      }
    }

    return parts.join("\n\n");
  }

  private async getEvents(start: Date, end: Date): Promise<CalendarEvent[]> {
    const res = await this.calendar.events.list({
      calendarId: "primary",
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });

    return (res.data.items || []).map((event) => ({
      id: event.id!,
      summary: event.summary || "(no title)",
      description: event.description || undefined,
      start: event.start?.dateTime || event.start?.date || "",
      end: event.end?.dateTime || event.end?.date || "",
      location: event.location || undefined,
      attendees: (event.attendees || []).map((a) => a.displayName || a.email || ""),
      isAllDay: !event.start?.dateTime,
      status: event.status || "confirmed",
      htmlLink: event.htmlLink || undefined,
    }));
  }

  private formatTime(isoStr: string): string {
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return isoStr;
    }
  }

  private formatDay(isoStr: string): string {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    } catch {
      return isoStr;
    }
  }
}
