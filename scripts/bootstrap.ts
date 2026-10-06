import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { db } = await import("../src/lib/db");
  const { hashPassword, randomUUID } = await import("../src/lib/server/auth");
  db.exec("CREATE TABLE IF NOT EXISTS local_setup (key TEXT PRIMARY KEY)");
  if (
    db.prepare("SELECT 1 FROM local_setup WHERE key='admin_initialized'").get()
  ) {
    console.log("Admin đã được khởi tạo; không thay đổi tài khoản.");
    return;
  }
  const username = process.env.INITIAL_ADMIN_USERNAME;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!username || !password || password.length < 10)
    throw new Error(
      "Thiếu cấu hình admin local hoặc mật khẩu chưa đủ 10 ký tự.",
    );
  db.transaction(() => {
    if (db.prepare("SELECT 1 FROM accounts").get())
      throw new Error(
        "Database đã có tài khoản; cần quản trị viên xử lý thiết lập.",
      );
    const id = randomUUID();
    db.prepare(
      "INSERT INTO accounts(id,username,name,password_hash,status) VALUES (?,?,?,?,'active')",
    ).run(id, username, "Quản trị viên", hashPassword(password));
    db.prepare("INSERT INTO account_roles VALUES (?,?)").run(id, "admin");
    db.prepare("INSERT INTO local_setup VALUES ('admin_initialized')").run();
  })();
  console.log("Đã khởi tạo admin local.");
}
main().catch(() => {
  console.error(
    "Khởi tạo admin thất bại. Kiểm tra cấu hình local và trạng thái database.",
  );
  process.exitCode = 1;
});
