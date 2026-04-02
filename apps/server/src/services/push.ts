// ============================================================
// BODHI — Push Notification Service
// Web Push via VAPID (RFC 8292) for PWA notifications
// ============================================================

import webpush from "web-push";
import { eq } from "drizzle-orm";
import { pushSubscriptions, type Database } from "@seneca/db";

export interface PushPayload {
  title: string;
  body: string;
  type?: "morning" | "evening" | "weekly";
  url?: string;
  timestamp?: string;
}

export class PushService {
  private db: Database;

  constructor(
    db: Database,
    vapidPublicKey: string,
    vapidPrivateKey: string,
    vapidSubject: string,
  ) {
    this.db = db;
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  }

  /**
   * Store or update a push subscription
   */
  async subscribe(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ): Promise<void> {
    await (this.db as any)
      .insert(pushSubscriptions)
      .values({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userAgent: userAgent || null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          keys: subscription.keys,
          userAgent: userAgent || null,
        },
      });
  }

  /**
   * Remove a push subscription by endpoint
   */
  async unsubscribe(endpoint: string): Promise<void> {
    await this.db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
  }

  /**
   * Send a push notification to all subscribed devices.
   * Auto-removes expired/invalid subscriptions (404/410).
   */
  async sendToAll(
    payload: PushPayload,
  ): Promise<{ sent: number; failed: number }> {
    const subs = await this.db.select().from(pushSubscriptions);
    let sent = 0;
    let failed = 0;

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys as { p256dh: string; auth: string },
          },
          JSON.stringify({
            ...payload,
            timestamp: payload.timestamp || new Date().toISOString(),
          }),
        );

        // Update lastUsedAt
        await this.db
          .update(pushSubscriptions)
          .set({ lastUsedAt: new Date() })
          .where(eq(pushSubscriptions.id, sub.id));

        sent++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription expired or invalid — clean up
          await this.db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, sub.id));
          console.log(
            `[push] Removed expired subscription: ${sub.endpoint.slice(0, 50)}...`,
          );
        } else {
          console.error(
            `[push] Failed to send to ${sub.endpoint.slice(0, 50)}:`,
            err instanceof Error ? err.message : err,
          );
        }
        failed++;
      }
    }

    return { sent, failed };
  }

  /**
   * Get the count of active push subscriptions
   */
  async getSubscriptionCount(): Promise<number> {
    const result = await this.db.select().from(pushSubscriptions);
    return result.length;
  }
}
