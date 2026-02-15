/**
 * Run database migrations.
 *
 * Usage:
 *   npx tsx scripts/migrate.ts
 *
 * Requires DATABASE_URL in .env.local or environment.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Add it to .env.local");
    process.exit(1);
  }

  const sql = neon(url);

  console.log("Creating tables...");

  await sql`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'custom',
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ended_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_runs_task ON runs (task)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_runs_status ON runs (status)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      ts TIMESTAMPTZ NOT NULL DEFAULT now(),
      type TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT 'agent',
      content TEXT NOT NULL DEFAULT '',
      metadata JSONB
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_events_run_id ON events (run_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_events_run_idx ON events (run_id, idx)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      start_idx INTEGER NOT NULL,
      end_idx INTEGER NOT NULL,
      label TEXT NOT NULL,
      what_happened TEXT NOT NULL DEFAULT '',
      verdict TEXT NOT NULL DEFAULT 'good',
      root_cause_guess TEXT,
      fix_suggestion TEXT,
      confidence REAL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sections_run_id ON sections (run_id)
  `;

  console.log("Migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
