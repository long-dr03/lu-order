import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { db } = await import("../src/lib/server/database");
  try {
    const file = process.argv[2];
    if (!file) throw new Error("Usage: restore <snapshot.pg.json.gz>");
    const { initializeDatabase } = await import("../src/lib/server/migrate");
    const { readSnapshot, restoreSnapshot } =
      await import("../src/lib/server/snapshot");
    await initializeDatabase();
    await restoreSnapshot(await readSnapshot(file));
    console.log("Snapshot restored into empty PostgreSQL database.");
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    "Restore failed; database must be empty and backup compatible.",
  );
  process.exitCode = 1;
});
