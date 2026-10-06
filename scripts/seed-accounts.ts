import { loadEnvConfig } from "@next/env";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";

loadEnvConfig(process.cwd());

async function main() {
  const { db } = await import("../src/lib/db");
  const { hashPassword, verifyPassword, randomUUID } =
    await import("../src/lib/server/auth");
  const credentialPath = path.resolve(
    process.cwd(),
    ".env.seed-accounts.local",
  );
  const definitions = [
    { role: "director", username: "giamdoc", name: "Giám đốc mẫu" },
    { role: "assistant", username: "troly", name: "Trợ lý sản xuất mẫu" },
    { role: "qc", username: "qc", name: "QC mẫu" },
  ];
  let localConfig = "";
  try {
    localConfig = readFileSync(credentialPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const values = Object.fromEntries(
    localConfig
      .split("\n")
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
  const created: string[] = [];
  try {
    const planned = definitions.filter(
      (definition) =>
        !db
          .prepare("SELECT 1 FROM account_roles WHERE role_id=?")
          .get(definition.role),
    );
    // Save credentials before inserting accounts, so they are recoverable locally.
    for (const definition of planned) {
      const key = `SEED_${definition.role.toUpperCase()}_PASSWORD`;
      if (!values[key]) {
        values[key] = randomBytes(18).toString("base64url") + "@1";
        localConfig += `\nSEED_${definition.role.toUpperCase()}_USERNAME=${definition.username}\n${key}=${values[key]}\n`;
      }
    }
    if (planned.length) {
      writeFileSync(credentialPath, localConfig, { mode: 0o600 });
      chmodSync(credentialPath, 0o600);
    }
    db.transaction(() => {
      for (const definition of planned) {
        if (
          db
            .prepare("SELECT 1 FROM account_roles WHERE role_id=?")
            .get(definition.role)
        )
          continue;
        if (!db.prepare("SELECT 1 FROM roles WHERE id=?").get(definition.role))
          throw new Error("Vai trò chưa tồn tại.");
        if (
          db
            .prepare("SELECT 1 FROM accounts WHERE username=?")
            .get(definition.username)
        )
          throw new Error(
            "Tên đăng nhập đã được sử dụng; không ghi đè tài khoản.",
          );
        const password =
          values[`SEED_${definition.role.toUpperCase()}_PASSWORD`];
        const hash = hashPassword(password);
        if (!verifyPassword(password, hash))
          throw new Error("Không thể xác minh mật khẩu seed.");
        const id = randomUUID();
        const employeeId = `NV-SAMPLE-${definition.role.toUpperCase()}`;
        const line = db
          .prepare("SELECT id FROM lines ORDER BY id LIMIT 1")
          .get() as { id: number } | undefined;
        if (!line)
          throw new Error("Cần có chuyền để liên kết hồ sơ nhân viên mẫu.");
        const role = db
          .prepare("SELECT name FROM roles WHERE id=?")
          .get(definition.role) as { name: string };
        db.prepare(
          "INSERT INTO employees(id,name,line_id,role) VALUES (?,?,?,?)",
        ).run(employeeId, definition.name, line.id, role.name);
        db.prepare(
          "INSERT INTO accounts(id,username,name,password_hash,status,employee_id,line_ids,must_change_password) VALUES (?,?,?,?,'active',?,?,0)",
        ).run(
          id,
          definition.username,
          definition.name,
          hash,
          employeeId,
          JSON.stringify([line.id]),
        );
        db.prepare(
          "INSERT INTO account_roles(account_id,role_id) VALUES (?,?)",
        ).run(id, definition.role);
        db.prepare(
          "INSERT INTO audit_logs(user_name,action,details) VALUES (?,?,?)",
        ).run(
          "Thiết lập local",
          "Seed tài khoản mẫu",
          `${definition.username}: ${definition.role}`,
        );
        created.push(definition.username);
      }
    })();
    console.log(
      created.length
        ? `Đã tạo tài khoản: ${created.join(", ")}.`
        : "Các vai trò đã có tài khoản; không thay đổi dữ liệu.",
    );
    console.log(
      "Mật khẩu nằm trong .env.seed-accounts.local; tài khoản mẫu đã sẵn sàng để thử góc nhìn.",
    );
  } finally {
    db.close();
  }
}
main().catch(() => {
  console.error(
    "Seed tài khoản thất bại. Kiểm tra tên đăng nhập, vai trò và quyền ghi cấu hình local.",
  );
  process.exitCode = 1;
});
