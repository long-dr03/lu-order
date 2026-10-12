import { db } from "../db";

/**
 * Migration 23: which colours and sizes of the order each assigned worker takes.
 * JSON arrays; an empty array means "all", so existing assignments keep meaning what they did.
 */
export async function migrateAssignmentScope() {
  if (
    await db.prepare("SELECT 1 FROM schema_migrations WHERE version=23").get()
  )
    return;
  await db.exec(`
    ALTER TABLE work_assignments ADD COLUMN IF NOT EXISTS colors TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE work_assignments ADD COLUMN IF NOT EXISTS sizes TEXT NOT NULL DEFAULT '[]';
  `);
  await db.prepare("INSERT INTO schema_migrations(version) VALUES (23)").run();
}
