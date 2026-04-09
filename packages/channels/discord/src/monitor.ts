// ============================================================
// BODHI — Discord Monitor
// Read-only intelligence from Discord servers.
// Watches configured channels, surfaces highlights in briefings.
// ============================================================

import { Client, GatewayIntentBits, type TextChannel, type Message } from "discord.js";

export interface DiscordMonitorConfig {
  token: string;
  /** Guild IDs to monitor (empty = all guilds the bot is in) */
  guildIds?: string[];
  /** Specific channel IDs to watch (empty = all text channels in monitored guilds) */
  channelIds?: string[];
}

export interface DiscordDigestItem {
  guild: string;
  channel: string;
  author: string;
  content: string;
  timestamp: string;
  reactions: number;
  replies: number;
}

export class DiscordMonitor {
  private client: Client;
  private config: DiscordMonitorConfig;
  private ready = false;

  constructor(config: DiscordMonitorConfig) {
    this.config = config;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.once("ready", () => {
        const guilds = this.client.guilds.cache.map((g) => g.name).join(", ");
        console.log(`[discord] Connected — monitoring: ${guilds}`);
        this.ready = true;
        resolve();
      });
      this.client.once("error", reject);
      this.client.login(this.config.token).catch(reject);
    });
  }

  async stop(): Promise<void> {
    this.ready = false;
    await this.client.destroy();
    console.log("[discord] Disconnected");
  }

  async ping(): Promise<boolean> {
    return this.ready && this.client.ws.ping > 0;
  }

  /**
   * Get recent high-signal messages from monitored channels.
   * "High signal" = has reactions, is from a non-bot, or contains links/code.
   */
  async getDigest(hours = 24, limit = 20): Promise<DiscordDigestItem[]> {
    if (!this.ready) return [];

    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const items: DiscordDigestItem[] = [];

    const guilds = this.config.guildIds?.length
      ? this.client.guilds.cache.filter((g) => this.config.guildIds!.includes(g.id))
      : this.client.guilds.cache;

    for (const [, guild] of guilds) {
      const channels = guild.channels.cache.filter((ch) => {
        if (!ch.isTextBased() || ch.isDMBased()) return false;
        if (this.config.channelIds?.length) return this.config.channelIds.includes(ch.id);
        return true;
      });

      // Cap at 10 channels per guild to stay within Discord rate limits
      const channelList = [...channels.values()].slice(0, 10);
      for (const channel of channelList) {
        try {
          const messages = await (channel as TextChannel).messages.fetch({ limit: 50 });
          for (const [, msg] of messages) {
            if (msg.createdTimestamp < cutoff) continue;
            if (msg.author.bot) continue;

            const reactions = msg.reactions.cache.reduce((sum, r) => sum + (r.count ?? 0), 0);
            const isSignal = reactions >= 2 || msg.content.includes("http") || msg.content.includes("```") || msg.content.length > 200;

            if (isSignal) {
              items.push({
                guild: guild.name,
                channel: channel.name,
                author: msg.author.displayName || msg.author.username,
                content: truncate(msg.content, 300),
                timestamp: msg.createdAt.toISOString(),
                reactions,
                replies: await countReplies(msg),
              });
            }
          }
          // Brief pause between channel fetches to respect rate limits
          await new Promise((r) => setTimeout(r, 200));
        } catch (err: unknown) {
          const status = (err as { httpStatus?: number }).httpStatus;
          if (status === 429) {
            console.warn(`[discord] Rate limited on #${channel.name}, skipping remaining channels in ${guild.name}`);
            break;
          }
          // Other errors (permissions, etc.) — skip silently
        }
      }
    }

    // Sort by signal strength (reactions + replies)
    items.sort((a, b) => (b.reactions + b.replies) - (a.reactions + a.replies));
    return items.slice(0, limit);
  }

  /**
   * Formatted summary for morning briefings.
   */
  async getBriefingSummary(hours = 24): Promise<string> {
    const items = await this.getDigest(hours, 10);
    if (items.length === 0) return "";

    const lines = items.map((item) => {
      const signal = item.reactions > 0 ? ` (${item.reactions} reactions)` : "";
      return `- **#${item.channel}** ${item.author}: ${item.content.slice(0, 120)}${item.content.length > 120 ? "..." : ""}${signal}`;
    });

    return `Discord highlights (${items.length} items from ${items[0]?.guild || "unknown"}):\n${lines.join("\n")}`;
  }

  /**
   * Search messages across monitored channels.
   */
  async search(query: string, limit = 10): Promise<DiscordDigestItem[]> {
    if (!this.ready) return [];

    const queryLower = query.toLowerCase();
    const items: DiscordDigestItem[] = [];

    const guilds = this.config.guildIds?.length
      ? this.client.guilds.cache.filter((g) => this.config.guildIds!.includes(g.id))
      : this.client.guilds.cache;

    for (const [, guild] of guilds) {
      const channels = guild.channels.cache.filter((ch) => {
        if (!ch.isTextBased() || ch.isDMBased()) return false;
        if (this.config.channelIds?.length) return this.config.channelIds.includes(ch.id);
        return true;
      });

      const searchChannels = [...channels.values()].slice(0, 10);
      for (const channel of searchChannels) {
        if (items.length >= limit) break;
        try {
          const messages = await (channel as TextChannel).messages.fetch({ limit: 100 });
          for (const [, msg] of messages) {
            if (msg.author.bot) continue;
            if (msg.content.toLowerCase().includes(queryLower)) {
              items.push({
                guild: guild.name,
                channel: channel.name,
                author: msg.author.displayName || msg.author.username,
                content: truncate(msg.content, 300),
                timestamp: msg.createdAt.toISOString(),
                reactions: msg.reactions.cache.reduce((sum, r) => sum + (r.count ?? 0), 0),
                replies: 0,
              });
            }
          }
          await new Promise((r) => setTimeout(r, 200));
        } catch (err: unknown) {
          const status = (err as { httpStatus?: number }).httpStatus;
          if (status === 429) {
            console.warn(`[discord] Rate limited during search, stopping early`);
            break;
          }
        }
      }
    }

    return items.slice(0, limit);
  }

  getGuilds(): { id: string; name: string; memberCount: number }[] {
    return this.client.guilds.cache.map((g) => ({
      id: g.id,
      name: g.name,
      memberCount: g.memberCount,
    }));
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

async function countReplies(msg: Message): Promise<number> {
  if (!msg.thread) return 0;
  try {
    const threadMessages = await msg.thread.messages.fetch({ limit: 100 });
    return threadMessages.size;
  } catch {
    return 0;
  }
}
