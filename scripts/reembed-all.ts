#!/usr/bin/env npx tsx
// ============================================================
// BODHI — Re-embed All Memories
//
// Fetches all memories from the database, generates new embeddings
// using the current model (voyage-4-lite), and updates each row.
// Used after model upgrades to ensure consistent vector space.
//
// Usage:
//   npx tsx scripts/reembed-all.ts --dry-run    # Preview only
//   npx tsx scripts/reembed-all.ts              # Re-embed all
// ============================================================

import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "@seneca/db";
import { embed } from "@seneca/memory";

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 2_000; // 2s between batches (Tier 1: 2000 RPM)
const DRY_RUN = process.argv.includes("--dry-run");

interface MemoryRow {
  id: string;
  content: string;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const voyageApiKey = process.env.VOYAGE_API_KEY;
  if (!voyageApiKey) {
    console.error("VOYAGE_API_KEY is required in .env");
    process.exit(1);
  }

  const db = getDb();

  // Fetch all memories
  const rows = (await db.execute(
    sql`SELECT id, content FROM memories ORDER BY created_at ASC`
  )) as MemoryRow[];

  console.log(`Found ${rows.length} memories to re-embed`);

  if (DRY_RUN) {
    console.log("Dry run — no changes made.");
    console.log(`Would process ${Math.ceil(rows.length / BATCH_SIZE)} batches of ${BATCH_SIZE}`);
    process.exit(0);
  }

  let updated = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

    console.log(`Batch ${batchNum}/${totalBatches} (${batch.length} memories)...`);

    try {
      // Embed all texts in this batch
      const texts = batch.map((r) => r.content);
      const embeddings = await embed(texts, voyageApiKey);

      // Update each memory's embedding
      for (let j = 0; j < batch.length; j++) {
        const { id } = batch[j];
        const embedding = embeddings[j];
        await db.execute(
          sql`UPDATE memories SET embedding = ${JSON.stringify(embedding)}::vector, updated_at = now() WHERE id = ${id}`
        );
      }

      updated += batch.length;
      console.log(`  ✓ ${updated}/${rows.length} updated`);
    } catch (err: any) {
      console.error(`  ✗ Batch ${batchNum} failed: ${err.message}`);
      errors += batch.length;

      // If rate limited, wait longer and retry once
      if (err.message.includes("429")) {
        console.log("  Rate limited — waiting 30s before retry...");
        await sleep(30_000);
        try {
          const texts = batch.map((r) => r.content);
          const embeddings = await embed(texts, voyageApiKey);
          for (let j = 0; j < batch.length; j++) {
            await db.execute(
              sql`UPDATE memories SET embedding = ${JSON.stringify(embeddings[j])}::vector, updated_at = now() WHERE id = ${batch[j].id}`
            );
          }
          updated += batch.length;
          errors -= batch.length;
          console.log(`  ✓ Retry succeeded: ${updated}/${rows.length}`);
        } catch (retryErr: any) {
          console.error(`  ✗ Retry also failed: ${retryErr.message}`);
        }
      }
    }

    // Delay between batches
    if (i + BATCH_SIZE < rows.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(`\nDone! Updated: ${updated}, Errors: ${errors}`);
  process.exit(errors > 0 ? 1 : 0);
}

main();
