import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { initializeDatabase } = await import("../src/lib/server/migrate");
  await initializeDatabase();
  const { db } = await import("../src/lib/db");
  try {
    const { seedSampleData } = await import("./sample-data");
    await seedSampleData();
    const { migrate } = await import("../src/lib/server/migrate");
    await migrate();
    console.log(
      "Dữ liệu mẫu đã seed vào PostgreSQL; dữ liệu đang có được giữ nguyên.",
    );
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error("Không thể seed dữ liệu. Kiểm tra database và quyền ghi.");
  process.exitCode = 1;
});
