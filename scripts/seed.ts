import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { initializeDatabase } = await import("../src/lib/server/migrate");
  await initializeDatabase();
  const { db } = await import("../src/lib/db");
  try {
    const { seedSampleData } = await import("./sample-data");
    const created = await seedSampleData();
    const { migrate } = await import("../src/lib/server/migrate");
    await migrate();
    console.log(
      created
        ? "Đã seed hồ sơ và đơn mẫu theo 6 bộ phận vào PostgreSQL."
        : "Database đã có dữ liệu; không thêm hay thay đổi dữ liệu mẫu.",
    );
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error("Không thể seed dữ liệu. Kiểm tra database và quyền ghi.");
  process.exitCode = 1;
});
