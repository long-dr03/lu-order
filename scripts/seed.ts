import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { db } = await import("../src/lib/db");
  try {
    const { seedSampleData } = await import("./sample-data");
    seedSampleData();
    const { migrate } = await import("../src/lib/server/migrate");
    migrate();
    console.log(
      "Dữ liệu mẫu đã seed vào SQLite; dữ liệu đang có được giữ nguyên.",
    );
  } finally {
    db.close();
  }
}
main().catch(() => {
  console.error("Không thể seed dữ liệu. Kiểm tra database và quyền ghi.");
  process.exitCode = 1;
});
