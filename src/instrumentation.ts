export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { initializeDatabase } = await import("./lib/server/migrate");
    await initializeDatabase();
    const { startBackupScheduler } = await import("./lib/server/backup");
    startBackupScheduler();
  }
}
