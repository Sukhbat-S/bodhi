// ============================================================
// BODHI — Google OAuth2 Authentication
// Shared auth for Gmail + Calendar (same credentials)
// ============================================================

import { google } from "googleapis";
import * as fs from "node:fs";
import * as path from "node:path";
import type { GoogleConfig } from "./types.js";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export class GoogleAuth {
  private oauth2Client;
  private tokenPath: string;
  private _authenticated = false;

  constructor(config: GoogleConfig) {
    this.oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );
    this.tokenPath = config.tokenPath || path.resolve(process.cwd(), ".google-token.json");

    // Auto-refresh tokens on update
    this.oauth2Client.on("tokens", (tokens) => {
      this.saveTokens(tokens as Record<string, unknown>);
      console.log("[google-auth] Tokens refreshed and saved");
    });

    // Try loading saved tokens
    this.loadSavedTokens();
  }

  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
    });
  }

  async handleCallback(code: string): Promise<void> {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    this.saveTokens(tokens as Record<string, unknown>);
    this._authenticated = true;
    console.log("[google-auth] Authenticated successfully");
  }

  isAuthenticated(): boolean {
    return this._authenticated;
  }

  getClient() {
    return this.oauth2Client;
  }

  private loadSavedTokens(): void {
    try {
      if (fs.existsSync(this.tokenPath)) {
        const tokens = JSON.parse(fs.readFileSync(this.tokenPath, "utf-8"));
        this.oauth2Client.setCredentials(tokens);
        this._authenticated = true;
        console.log("[google-auth] Loaded saved tokens");
      }
    } catch (err) {
      console.error(
        "[google-auth] Failed to load tokens:",
        err instanceof Error ? err.message : err
      );
    }
  }

  private saveTokens(tokens: Record<string, unknown>): void {
    try {
      // Merge with existing tokens (keep refresh_token if new response omits it)
      let existing: Record<string, unknown> = {};
      try {
        if (fs.existsSync(this.tokenPath)) {
          existing = JSON.parse(fs.readFileSync(this.tokenPath, "utf-8"));
        }
      } catch {
        // ignore
      }

      const merged = { ...existing, ...tokens };
      fs.writeFileSync(this.tokenPath, JSON.stringify(merged, null, 2));
    } catch (err) {
      console.error(
        "[google-auth] Failed to save tokens:",
        err instanceof Error ? err.message : err
      );
    }
  }
}
