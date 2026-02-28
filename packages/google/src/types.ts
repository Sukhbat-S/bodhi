// ============================================================
// BODHI — Google Integration Types
// ============================================================

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenPath?: string; // defaults to .google-token.json
}

export interface EmailSummary {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
  labels: string[];
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  attendees: string[];
  isAllDay: boolean;
  status: string;
  htmlLink?: string;
}

export interface FreeSlot {
  start: string;
  end: string;
  durationMinutes: number;
}
