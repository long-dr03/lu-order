import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { db } = await import("../src/lib/server/database");
  try {
    const { initializeDatabase } = await import("../src/lib/server/migrate");
    const { runBackup } = await import("../src/lib/server/backup");
    await initializeDatabase();
    console.log(await runBackup());
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error("Backup failed. Check database and backup directory.");
  process.exitCode = 1;
});
