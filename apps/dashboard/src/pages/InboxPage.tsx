import { useEffect, useState, useRef, useCallback } from "react";
import {
  getGmailStatus,
  getGmailInbox,
  getGmailUnread,
  searchGmail,
  type EmailSummary,
} from "../api";

export default function InboxPage() {
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [unread, setUnread] = useState<number | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const loadInbox = useCallback(async () => {
    try {
      const status = await getGmailStatus().catch(() => ({ connected: false, reason: "Server unreachable" }));
      setConnected(status.connected);
      if (!status.connected) {
        setReason(status.reason || "Not connected");
        setLoading(false);
        return;
      }

      const [inbox, unreadRes] = await Promise.all([
        getGmailInbox(20).catch(() => ({ emails: [] })),
        getGmailUnread().catch(() => ({ unread: 0 })),
      ]);

      setEmails(inbox.emails);
      setUnread(unreadRes.unread);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInbox();
    const interval = setInterval(loadInbox, 60000);
    return () => clearInterval(interval);
  }, [loadInbox]);

  useEffect(() => {
    if (!connected) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!search.trim()) {
      // Reset to inbox view
      loadInbox();
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchGmail(search.trim());
        setEmails(res.emails);
      } catch {
        // Keep current list on search error
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, connected, loadInbox]);

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
        <h2 className="text-2xl font-bold text-stone-100 mb-6">Inbox</h2>
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-8 text-center">
          <div className="text-4xl mb-4">📧</div>
          <h3 className="text-lg font-medium text-stone-200 mb-2">Gmail Not Connected</h3>
          <p className="text-sm text-stone-400 mb-4">
            {reason || "Google OAuth not configured"}
          </p>
          <p className="text-xs text-stone-500">
            Visit <code className="bg-stone-800 px-1.5 py-0.5 rounded">/api/google/auth</code> to connect your Google account
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-2xl font-bold text-stone-100">Inbox</h2>
        {unread !== null && unread > 0 && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
            {unread} unread
          </span>
        )}
      </div>

      {error && (
        <div className="text-red-400 bg-red-500/10 px-4 py-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emails..."
          className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:border-stone-600 transition-colors"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-stone-600 border-t-stone-300 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Email List */}
      {emails.length === 0 ? (
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-8 text-center">
          <p className="text-sm text-stone-400">
            {search ? "No emails match your search" : "Inbox is empty"}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {emails.map((email) => (
            <div
              key={email.id}
              className={`bg-stone-900 border border-stone-800 rounded-lg px-4 py-3 hover:bg-stone-800/70 transition-colors ${
                email.isUnread ? "border-l-2 border-l-blue-500" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className={`text-sm truncate ${
                        email.isUnread
                          ? "font-semibold text-stone-100"
                          : "font-medium text-stone-400"
                      }`}
                    >
                      {email.from}
                    </span>
                  </div>
                  <p
                    className={`text-sm truncate ${
                      email.isUnread ? "text-stone-200" : "text-stone-400"
                    }`}
                  >
                    {email.subject}
                  </p>
                  <p className="text-xs text-stone-500 truncate mt-0.5">
                    {email.snippet}
                  </p>
                </div>
                <span className="text-xs text-stone-500 whitespace-nowrap flex-shrink-0">
                  {email.date}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer info */}
      <div className="mt-4 text-xs text-stone-600 text-center">
        {search ? `${emails.length} results` : `Showing ${emails.length} emails`}
        {" · "}
        Auto-refreshes every 60s
      </div>
    </div>
  );
}
