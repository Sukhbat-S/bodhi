import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./src/schema/conversations.ts",
    "./src/schema/memories.ts",
    "./src/schema/push-subscriptions.ts",
    "./src/schema/briefings.ts",
    "./src/schema/entities.ts",
  ],
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
