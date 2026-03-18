import { useState, useEffect } from "react";
import {
  isPushSupported,
  isPushSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
  revalidateSubscription,
} from "../lib/push";

export default function NotificationToggle() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const check = async () => {
      const sup = isPushSupported();
      setSupported(sup);
      if (sup) {
        const sub = await isPushSubscribed();
        setSubscribed(sub);
        // Re-validate subscription on each app open (iOS kills SW aggressively)
        if (sub) {
          revalidateSubscription();
        }
      }
    };
    check();
  }, []);

  if (!supported) return null;

  const toggle = async () => {
    setLoading(true);
    try {
      if (subscribed) {
        await unsubscribeFromPush();
        setSubscribed(false);
      } else {
        const ok = await subscribeToPush();
        setSubscribed(ok);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={subscribed ? "Disable notifications" : "Enable notifications"}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        subscribed
          ? "text-amber-400 hover:bg-stone-800/50"
          : "text-stone-500 hover:text-stone-300 hover:bg-stone-800/50"
      } disabled:opacity-50`}
    >
      {loading ? (
        <div className="w-5 h-5 border-2 border-stone-600 border-t-stone-300 rounded-full animate-spin" />
      ) : subscribed ? (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 22c1.1 0 2-.9 2-2h-4a2 2 0 002 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
      )}
      <span className="hidden md:inline">
        {subscribed ? "Notifications on" : "Notifications"}
      </span>
    </button>
  );
}
