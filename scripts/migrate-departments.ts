import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.DATABASE_URL || !process.env.TEST_DATABASE_URL)
    throw Error(
      "Cần DATABASE_URL và TEST_DATABASE_URL riêng để kiểm thử bản sao trước migration.",
    );
  const applying = process.argv.includes("--apply");
  if (
    applying &&
    !["127.0.0.1", "localhost", "::1"].includes(
      new URL(process.env.DATABASE_URL).hostname,
    )
  )
    throw Error(
      "Lệnh này chỉ áp dụng trên database local. Chưa nghiệm thu triển khai.",
    );
  const { db } = await import("../src/lib/server/database");
  const { captureSnapshot, writeSnapshot } =
    await import("../src/lib/server/snapshot");
  const test = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const name = "luuta_migration_" + randomUUID().replaceAll("-", "");
  let created = false;
  try {
    const before = await captureSnapshot();
    const backupFolder = resolve(process.env.BACKUP_DIR || "backups");
    mkdirSync(backupFolder, { recursive: true, mode: 0o700 });
    const backup = resolve(
      backupFolder,
      `LUUTA-before-departments-${new Date().toISOString().replaceAll(":", "-")}.pg.json.gz`,
    );
    await writeSnapshot(backup, before);
    await test.query(`CREATE DATABASE "${name}"`);
    created = true;
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.pathname = "/" + name;
    const report = execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/verify-department-migration.ts", backup],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: url.toString() },
        encoding: "utf8",
      },
    );
    const verification = JSON.parse(report.trim());
    if (applying)
      await (await import("../src/lib/server/migrate")).initializeDatabase();
    mkdirSync("artifacts", { recursive: true });
    writeFileSync(
      "artifacts/department-migration.json",
      JSON.stringify({ backup, applying, ...verification }, null, 2),
      { mode: 0o600 },
    );
    console.log(
      applying
        ? "Đã kiểm thử bản sao và áp dụng migration 11 trên local."
        : "Đã kiểm thử bản sao; chưa đổi schema nguồn.",
    );
    console.log(
      `Giữ nguyên ${verification.orders} đơn, ${verification.people} hồ sơ, ${verification.logs} dòng công và tổng lương. Hồ sơ chưa phân loại: ${verification.unclassified}.`,
    );
    console.log("Backup riêng và báo cáo: artifacts/department-migration.json");
  } finally {
    if (created) await test.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await test.end();
    await db.close();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migration failed");
  process.exitCode = 1;
});
