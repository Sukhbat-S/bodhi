// ============================================================
// SENECA — Server Configuration
// Validates environment variables at startup
// ============================================================

import { z } from "zod";

const envSchema = z.object({
  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  TELEGRAM_ALLOWED_USER_ID: z
    .string()
    .min(1, "TELEGRAM_ALLOWED_USER_ID is required"),

  // Database
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL").optional(),

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

  return result.data;
}
