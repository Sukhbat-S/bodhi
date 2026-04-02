// ============================================================
// BODHI PWA — Push Notification Client Library
// Manages Web Push subscription lifecycle
// ============================================================

const VAPID_KEY_CACHE = "bodhi_vapid_public_key";

/**
 * Fetch the server's VAPID public key (cached in sessionStorage)
 */
async function getVapidPublicKey(): Promise<string | null> {
  const cached = sessionStorage.getItem(VAPID_KEY_CACHE);
  if (cached) return cached;

  try {
    const res = await fetch("/api/push/vapid-key");
    if (!res.ok) return null;
    const { publicKey } = await res.json();
    if (publicKey) {
      sessionStorage.setItem(VAPID_KEY_CACHE, publicKey);
    }
    return publicKey || null;
  } catch {
    return null;
  }
}

/**
 * Check if push notifications are supported in this browser
 */
export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window;
}

/**
 * Check if push notifications are currently subscribed
 */
export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
}

/**
 * Subscribe to push notifications.
 * Requests permission, creates PushSubscription, sends to server.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) {
    console.warn("[push] Push notifications not supported in this browser");
    return false;
  }

  // Request permission
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    console.warn("[push] Notification permission denied");
    return false;
  }

  // Get VAPID key from server
  const publicKey = await getVapidPublicKey();
  if (!publicKey) {
    console.error("[push] Server has no VAPID key configured");
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    const keyArray = urlBase64ToUint8Array(publicKey);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyArray.buffer as ArrayBuffer,
    });

    // Send subscription to server
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });

    if (!res.ok) {
      console.error("[push] Failed to register subscription on server");
      return false;
    }

    // Request persistent storage to prevent iOS from evicting data
    if (navigator.storage?.persist) {
      await navigator.storage.persist().catch(() => {});
    }

    return true;
  } catch (err) {
    console.error("[push] Subscription failed:", err);
    return false;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Tell server to remove subscription
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => {});

      await subscription.unsubscribe();
    }

    return true;
  } catch (err) {
    console.error("[push] Unsubscribe failed:", err);
    return false;
  }
}

/**
 * Re-validate push subscription (call on app open).
 * iOS kills service workers aggressively — subscription may need refresh.
 */
export async function revalidateSubscription(): Promise<void> {
  if (!isPushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Re-send subscription to server (handles re-registration)
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      }).catch(() => {});
    }
  } catch {
    // Silent fail — not critical
  }
}

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}
