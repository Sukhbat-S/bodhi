// ============================================================
// BODHI — Meta Service (Facebook + Instagram)
// Posts to Facebook Page and Instagram via Graph API
// ============================================================

import type { MetaConfig, PostResult } from "./types.js";

export class MetaService {
  private pageId: string;
  private pageAccessToken: string;
  private instagramAccountId?: string;
  private baseUrl = "https://graph.facebook.com/v21.0";

  constructor(config: MetaConfig) {
    this.pageId = config.pageId;
    this.pageAccessToken = config.pageAccessToken;
    this.instagramAccountId = config.instagramAccountId;
  }

  // --- Health check ---

  async ping(): Promise<boolean> {
    try {
      await this.metaFetch<{ name: string }>(`/${this.pageId}?fields=name`);
      return true;
    } catch {
      return false;
    }
  }

  // --- Facebook Page posting ---

  async postToPage(message: string, options?: { link?: string; imageUrl?: string }): Promise<PostResult> {
    try {
      let data: { id: string };

      if (options?.imageUrl) {
        // Post as photo with caption
        data = await this.metaFetch<{ id: string }>(
          `/${this.pageId}/photos`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, url: options.imageUrl }),
          }
        );
      } else {
        // Text-only post
        const body: Record<string, string> = { message };
        if (options?.link) body.link = options.link;

        data = await this.metaFetch<{ id: string }>(
          `/${this.pageId}/feed`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
      }

      return {
        platform: "facebook",
        success: true,
        postId: data.id,
        postUrl: `https://facebook.com/${data.id}`,
      };
    } catch (err) {
      console.error("[meta] Failed to post to Facebook:", err instanceof Error ? err.message : err);
      return {
        platform: "facebook",
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // --- Instagram posting (requires image) ---

  async postToInstagram(caption: string, imageUrl: string): Promise<PostResult> {
    if (!this.instagramAccountId) {
      return {
        platform: "instagram",
        success: false,
        error: "Instagram account not configured (META_INSTAGRAM_ACCOUNT_ID missing)",
      };
    }

    try {
      // Step 1: Create media container
      const container = await this.metaFetch<{ id: string }>(
        `/${this.instagramAccountId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: imageUrl,
            caption,
          }),
        }
      );

      // Step 2: Publish the container
      const published = await this.metaFetch<{ id: string }>(
        `/${this.instagramAccountId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: container.id,
          }),
        }
      );

      return {
        platform: "instagram",
        success: true,
        postId: published.id,
        postUrl: `https://instagram.com/p/${published.id}`,
      };
    } catch (err) {
      console.error("[meta] Failed to post to Instagram:", err instanceof Error ? err.message : err);
      return {
        platform: "instagram",
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // --- Facebook carousel (multi-photo album post) ---

  async postCarouselToPage(caption: string, imageUrls: string[]): Promise<PostResult> {
    try {
      // Step 1: Upload each image as unpublished photo
      const photoIds: string[] = [];
      for (const url of imageUrls) {
        const photo = await this.metaFetch<{ id: string }>(
          `/${this.pageId}/photos`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, published: false }),
          }
        );
        photoIds.push(photo.id);
      }

      // Step 2: Create album post with attached_media
      const attachedMedia = photoIds.reduce<Record<string, string>>((acc, id, i) => {
        acc[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
        return acc;
      }, {});

      const data = await this.metaFetch<{ id: string }>(
        `/${this.pageId}/feed`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: caption, ...attachedMedia }),
        }
      );

      return {
        platform: "facebook",
        success: true,
        postId: data.id,
        postUrl: `https://facebook.com/${data.id}`,
      };
    } catch (err) {
      console.error("[meta] Failed to post carousel to Facebook:", err instanceof Error ? err.message : err);
      return { platform: "facebook", success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // --- Instagram carousel ---

  async postCarouselToInstagram(caption: string, imageUrls: string[]): Promise<PostResult> {
    if (!this.instagramAccountId) {
      return { platform: "instagram", success: false, error: "Instagram account not configured" };
    }

    try {
      // Step 1: Create image containers for each slide
      const childIds: string[] = [];
      for (const url of imageUrls) {
        const child = await this.metaFetch<{ id: string }>(
          `/${this.instagramAccountId}/media`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_url: url, is_carousel_item: true }),
          }
        );
        childIds.push(child.id);
      }

      // Step 2: Create carousel container
      const container = await this.metaFetch<{ id: string }>(
        `/${this.instagramAccountId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caption,
            media_type: "CAROUSEL",
            children: childIds.join(","),
          }),
        }
      );

      // Step 3: Publish
      const published = await this.metaFetch<{ id: string }>(
        `/${this.instagramAccountId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creation_id: container.id }),
        }
      );

      return {
        platform: "instagram",
        success: true,
        postId: published.id,
        postUrl: `https://instagram.com/p/${published.id}`,
      };
    } catch (err) {
      console.error("[meta] Failed to post carousel to Instagram:", err instanceof Error ? err.message : err);
      return { platform: "instagram", success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // --- Messenger conversations (for client intelligence) ---

  async getConversations(since: Date): Promise<{ totalMessages: number; summary: string }> {
    try {
      const sinceUnix = Math.floor(since.getTime() / 1000);
      const data = await this.metaFetch<{
        data: Array<{
          messages: { data: Array<{ message: string; from: { name: string }; created_time: string }> };
        }>;
      }>(`/${this.pageId}/conversations?fields=messages{message,from,created_time}&since=${sinceUnix}&limit=50`);

      // Aggregate — strip PII, extract patterns
      let totalMessages = 0;
      const questionPatterns: Record<string, number> = {};
      const productMentions: Record<string, number> = {};

      for (const convo of data.data || []) {
        for (const msg of convo.messages?.data || []) {
          totalMessages++;
          const text = (msg.message || "").toLowerCase();

          // Count common question patterns
          if (text.includes("үнэ") || text.includes("хэд вэ")) {
            questionPatterns["price_inquiry"] = (questionPatterns["price_inquiry"] || 0) + 1;
          }
          if (text.includes("хүргэлт") || text.includes("хэзээ")) {
            questionPatterns["delivery"] = (questionPatterns["delivery"] || 0) + 1;
          }
          if (text.includes("размер") || text.includes("хэмжээ")) {
            questionPatterns["size"] = (questionPatterns["size"] || 0) + 1;
          }

          // Count product mentions
          for (const product of ["ээмэг", "бөгж", "гинж", "бугуйвч", "зүүлт"]) {
            if (text.includes(product)) {
              productMentions[product] = (productMentions[product] || 0) + 1;
            }
          }
        }
      }

      const summary = [
        `${totalMessages} messages in ${data.data?.length || 0} conversations`,
        Object.entries(questionPatterns).map(([k, v]) => `${k}: ${v}`).join(", ") || "no patterns",
        Object.entries(productMentions).map(([k, v]) => `${k}: ${v}`).join(", ") || "no product mentions",
      ].join("\n");

      return { totalMessages, summary };
    } catch (err) {
      console.error("[meta] Failed to fetch conversations:", err instanceof Error ? err.message : err);
      return { totalMessages: 0, summary: `Error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  // --- Internal ---

  private async metaFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const separator = path.includes("?") ? "&" : "?";
    const url = `${this.baseUrl}${path}${separator}access_token=${this.pageAccessToken}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "User-Agent": "BODHI",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Meta API error: ${response.status} ${response.statusText} — ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }
}
