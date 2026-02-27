import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./src/schema/conversations.ts", "./src/schema/memories.ts"],
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
