// ============================================================
// BODHI — Server Configuration
// Validates environment variables at startup
// ============================================================

import { z } from "zod";

const envSchema = z.object({
  // Anthropic (optional — reasoning now routes through Claude Code CLI / Max subscription)
  ANTHROPIC_API_KEY: z.string().optional(),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  TELEGRAM_ALLOWED_USER_ID: z
    .string()
    .min(1, "TELEGRAM_ALLOWED_USER_ID is required"),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Voyage AI (embeddings)
  VOYAGE_API_KEY: z.string().min(1, "VOYAGE_API_KEY is required"),

  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Persona
  PERSONA_PATH: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("Configuration errors:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data!;
}
