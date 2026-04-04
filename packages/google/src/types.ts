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

// ---- Write operation types ----

export interface DraftInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}

export interface DraftResult {
  id: string;
  threadId?: string;
  message: string; // human-readable confirmation
}

export interface EventInput {
  summary: string;
  start: string; // ISO 8601 datetime
  end: string;   // ISO 8601 datetime
  description?: string;
  location?: string;
  attendees?: string[]; // email addresses
}

export interface EventResult {
  id: string;
  htmlLink?: string;
  message: string;
}
