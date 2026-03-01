import { useEffect, useState, useCallback } from "react";
import {
  getCalendarStatus,
  getCalendarToday,
  getCalendarUpcoming,
  getCalendarFree,
  type CalendarEvent,
  type FreeSlot,
} from "../api";

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function formatDay(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const day = new Date(event.start).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    const existing = groups.get(day) || [];
    existing.push(event);
    groups.set(day, existing);
  }
  return groups;
}

export default function CalendarPage() {
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [freeSlots, setFreeSlots] = useState<FreeSlot[]>([]);
  const [upcoming, setUpcoming] = useState<CalendarEvent[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const status = await getCalendarStatus().catch(() => ({
        connected: false,
        reason: "Server unreachable",
      }));
      setConnected(status.connected);
      if (!status.connected) {
        setReason(status.reason || "Not connected");
        setLoading(false);
        return;
      }

      const [today, free, week] = await Promise.all([
        getCalendarToday().catch(() => ({ events: [] })),
        getCalendarFree().catch(() => ({ slots: [] })),
        getCalendarUpcoming(7).catch(() => ({ events: [] })),
      ]);

      setTodayEvents(today.events);
      setFreeSlots(free.slots);

      // Filter out today's events from upcoming
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      const futureEvents = week.events.filter(
        (e) => new Date(e.start) > endOfToday
      );
      setUpcoming(futureEvents);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-stone-500 animate-pulse">Loading...</div>
      </div>
    );
  }

  if (connected === false) {
    return (
      <div className="p-8 max-w-4xl">
        <h2 className="text-2xl font-bold text-stone-100 mb-6">Calendar</h2>
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-8 text-center">
          <div className="text-4xl mb-4">📅</div>
          <h3 className="text-lg font-medium text-stone-200 mb-2">
            Calendar Not Connected
          </h3>
          <p className="text-sm text-stone-400 mb-4">
            {reason || "Google OAuth not configured"}
          </p>
          <p className="text-xs text-stone-500">
            Visit{" "}
            <code className="bg-stone-800 px-1.5 py-0.5 rounded">
              /api/google/auth
            </code>{" "}
            to connect your Google account
          </p>
        </div>
      </div>
    );
  }

  const todayFormatted = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const dayGroups = groupByDay(upcoming);

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-stone-100">Calendar</h2>
        <p className="text-sm text-stone-400 mt-1">{todayFormatted}</p>
      </div>

      {error && (
        <div className="text-red-400 bg-red-500/10 px-4 py-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Today's Schedule */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-stone-100 mb-4">
          Today's Schedule
        </h3>
        {todayEvents.length === 0 ? (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 text-center">
            <p className="text-sm text-stone-400">No events today</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayEvents.map((event) => (
              <div
                key={event.id}
                className={`bg-stone-900 border border-stone-800 rounded-lg px-4 py-3 ${
                  event.isAllDay ? "bg-blue-500/5 border-l-2 border-l-blue-500/50" : ""
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="text-xs text-stone-500 w-28 flex-shrink-0 pt-0.5">
                    {event.isAllDay
                      ? "All day"
                      : `${formatTime(event.start)} – ${formatTime(event.end)}`}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-stone-200">
                      {event.summary}
                    </p>
                    {event.location && (
                      <p className="text-xs text-stone-500 mt-0.5">
                        {event.location}
                      </p>
                    )}
                    {event.attendees.length > 0 && (
                      <p className="text-xs text-stone-600 mt-0.5">
                        {event.attendees.slice(0, 3).join(", ")}
                        {event.attendees.length > 3 &&
                          ` +${event.attendees.length - 3}`}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Free Time */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-stone-100 mb-4">
          Free Time
        </h3>
        {freeSlots.length === 0 ? (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 text-center">
            <p className="text-sm text-stone-400">
              No free time remaining today
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {freeSlots.map((slot, i) => (
              <div
                key={i}
                className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-emerald-400">
                    {formatTime(slot.start)} – {formatTime(slot.end)}
                  </span>
                  <span className="text-xs text-emerald-500/70">
                    {slot.durationMinutes >= 60
                      ? `${Math.floor(slot.durationMinutes / 60)}h ${slot.durationMinutes % 60 ? `${slot.durationMinutes % 60}m` : ""}`
                      : `${slot.durationMinutes}m`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* This Week */}
      <div>
        <h3 className="text-lg font-semibold text-stone-100 mb-4">
          This Week
        </h3>
        {upcoming.length === 0 ? (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 text-center">
            <p className="text-sm text-stone-400">
              No upcoming events this week
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(dayGroups.entries()).map(([day, events]) => (
              <div key={day}>
                <h4 className="text-sm font-medium text-stone-400 mb-2">
                  {day}
                </h4>
                <div className="space-y-1">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="bg-stone-900 border border-stone-800 rounded-lg px-4 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-stone-500 w-20 flex-shrink-0">
                          {event.isAllDay
                            ? "All day"
                            : formatTime(event.start)}
                        </span>
                        <span className="text-sm text-stone-300 truncate">
                          {event.summary}
                        </span>
                        {event.location && (
                          <span className="text-xs text-stone-600 truncate ml-auto">
                            {event.location}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 text-xs text-stone-600 text-center">
        {todayEvents.length} today · {upcoming.length} upcoming · Auto-refreshes
        every 5m
      </div>
    </div>
  );
}
