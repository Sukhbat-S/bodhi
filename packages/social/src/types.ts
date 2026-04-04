// ============================================================
// BODHI — Social / Meta Types
// ============================================================

export interface MetaConfig {
  pageId: string;
  pageAccessToken: string;
  instagramAccountId?: string;
}

export type Platform = "twitter" | "facebook" | "instagram";

export interface PostResult {
  platform: Platform;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

export interface AdaptedContent {
  twitter: string;   // English, max 280 chars
  facebook: string;  // Mongolian, conversational
  instagram: string; // Mongolian, caption + hashtags
}

export interface PostRequest {
  content: string;
  platforms?: Platform[];
  imageUrl?: string;
}

export interface PostResponse {
  adaptedContent: AdaptedContent;
  results: PostResult[];
}
