import { loadEnvConfig } from "@next/env";
import Database from "better-sqlite3";
import { resolve, dirname, join } from "node:path";
import { mkdirSync, existsSync, chmodSync } from "node:fs";
loadEnvConfig(process.cwd());
async function main() {
  const source = resolve(process.env.DATABASE_PATH || "lu_order.db");
  if (!existsSync(source)) throw new Error("Chưa có database để sao lưu.");
  const folder = join(dirname(source), "backups");
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const destination = join(
    folder,
    `LUUTA-${new Date().toISOString().replaceAll(":", "-")}.db`,
  );
  const database = new Database(source, { readonly: true });
  try {
    await database.backup(destination);
    chmodSync(destination, 0o600);
    console.log(`Đã sao lưu SQLite: ${destination}`);
  } finally {
    database.close();
  }
}
main().catch(() => {
  console.error(
    "Không thể sao lưu database. Kiểm tra đường dẫn và quyền truy cập.",
  );
  process.exitCode = 1;
});
