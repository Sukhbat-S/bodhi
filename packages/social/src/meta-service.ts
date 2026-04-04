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
