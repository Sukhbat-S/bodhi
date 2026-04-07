/// <reference lib="webworker" />
// ============================================================
// BODHI PWA — Service Worker
// Handles precaching (Workbox) + push notifications
// ============================================================

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// Force new SW to take over immediately (no waiting for old tabs to close)
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });

// Workbox precache injection point (vite-plugin-pwa fills this at build time)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// --------------------------------------------------
// Push Notification Handler
// --------------------------------------------------
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload: {
    title: string;
    body: string;
    type?: "morning" | "evening" | "weekly";
    url?: string;
    timestamp?: string;
  };

  try {
    payload = event.data.json();
  } catch {
    // Fallback for plain text push
    payload = {
      title: "BODHI",
      body: event.data.text(),
    };
  }

  // Extended notification options (vibrate + timestamp exist in browsers but not in TS lib types)
  const options: NotificationOptions & { vibrate?: number[]; timestamp?: number } = {
    body: payload.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.type || "bodhi-notification",
    data: { url: payload.url || "/briefings" },
    vibrate: [200, 100, 200],
    timestamp: payload.timestamp
      ? new Date(payload.timestamp).getTime()
      : Date.now(),
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

// --------------------------------------------------
// Notification Click Handler
// --------------------------------------------------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data?.url as string) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus existing BODHI tab if open
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // Open new tab
        return self.clients.openWindow(targetUrl);
      }),
  );
});
