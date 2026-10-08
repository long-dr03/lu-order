import { loadEnvConfig } from "@next/env";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";

loadEnvConfig(process.cwd());

async function main() {
  const { initializeDatabase } = await import("../src/lib/server/migrate");
  await initializeDatabase();
  const { db } = await import("../src/lib/db");
  const { hashPassword, verifyPassword, randomUUID } =
    await import("../src/lib/server/auth");
  const credentialPath = path.resolve(
    process.cwd(),
    ".env.seed-accounts.local",
  );
  const definitions = [
    {
      role: "director",
      username: "giamdoc",
      name: "Giám đốc mẫu",
      department: "management",
    },
    {
      role: "manager",
      username: "truongphong",
      name: "Trưởng phòng mẫu",
      department: "management",
    },
    {
      role: "assistant",
      username: "troly",
      name: "Trợ lý mẫu",
      department: "management",
    },
    {
      role: "leader",
      username: "phutrachcat",
      name: "Phụ trách Cắt",
      department: "cutting",
    },
    {
      role: "leader",
      username: "phutrachmay",
      name: "Phụ trách May",
      department: "sewing",
    },
    { role: "qc", username: "qc", name: "Phụ trách QC", department: "quality" },
    {
      role: "leader",
      username: "phutrachdonggoi",
      name: "Phụ trách Đóng gói",
      department: "packing",
    },
    {
      role: "leader",
      username: "phutrachgiaohang",
      name: "Phụ trách Giao hàng",
      department: "delivery",
    },
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
    const planned = (
      await Promise.all(
        definitions.map(async (item) => ({
          item,
          keep: await (async (definition) =>
            !(await db
              .prepare("SELECT 1 FROM accounts WHERE username=?")
              .get(definition.username)))(item),
        })),
      )
    )
      .filter((row) => row.keep)
      .map((row) => row.item);
    // Save credentials before inserting accounts, so they are recoverable locally.
    for (const definition of planned) {
      const key = `SEED_${definition.username.toUpperCase()}_PASSWORD`;
      if (!values[key]) {
        values[key] = randomBytes(18).toString("base64url") + "@1";
        localConfig += `\nSEED_${definition.username.toUpperCase()}_USERNAME=${definition.username}\n${key}=${values[key]}\n`;
      }
    }
    if (planned.length) {
      writeFileSync(credentialPath, localConfig, { mode: 0o600 });
      chmodSync(credentialPath, 0o600);
    }
    await db.transaction(async () => {
      for (const definition of planned) {
        if (
          await db
            .prepare("SELECT 1 FROM accounts WHERE username=?")
            .get(definition.username)
        )
          continue;
        if (
          !(await db
            .prepare("SELECT 1 FROM roles WHERE id=?")
            .get(definition.role))
        )
          throw new Error("Vai trò chưa tồn tại.");
        if (
          await db
            .prepare("SELECT 1 FROM accounts WHERE username=?")
            .get(definition.username)
        )
          throw new Error(
            "Tên đăng nhập đã được sử dụng; không ghi đè tài khoản.",
          );
        const password =
          values[`SEED_${definition.username.toUpperCase()}_PASSWORD`];
        const hash = hashPassword(password);
        if (!verifyPassword(password, hash))
          throw new Error("Không thể xác minh mật khẩu seed.");
        const id = randomUUID();
        const employeeId = `NV-SAMPLE-${definition.username.toUpperCase()}`;
        const role = (await db
          .prepare("SELECT name FROM roles WHERE id=?")
          .get(definition.role)) as { name: string };
        await db
          .prepare(
            "INSERT INTO employees(id,name,line_id,role) VALUES (?,?,?,?)",
          )
          .run(employeeId, definition.name, null, role.name);
        await db
          .prepare("INSERT INTO employee_departments VALUES (?,?)")
          .run(employeeId, definition.department);
        await db
          .prepare(
            "INSERT INTO accounts(id,username,name,password_hash,status,employee_id,line_ids,must_change_password) VALUES (?,?,?,?,'active',?,?,0)",
          )
          .run(
            id,
            definition.username,
            definition.name,
            hash,
            employeeId,
            "[]",
          );
        await db
          .prepare("INSERT INTO account_roles(account_id,role_id) VALUES (?,?)")
          .run(id, definition.role);
        await db
          .prepare(
            "INSERT INTO audit_logs(user_name,action,details) VALUES (?,?,?)",
          )
          .run(
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
    await db.close();
  }
}
main().catch(() => {
  console.error(
    "Seed tài khoản thất bại. Kiểm tra tên đăng nhập, vai trò và quyền ghi cấu hình local.",
  );
  process.exitCode = 1;
});
