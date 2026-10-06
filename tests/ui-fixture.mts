// Only creates disposable browser-test data under /tmp, never the live database.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const folder = mkdtempSync(join(tmpdir(), "luuta-ui-"));
process.env.DATABASE_PATH = join(folder, "ui.db");
const { db } = await import("../src/lib/db");
const { seedSampleData } = await import("../scripts/sample-data");
seedSampleData();
const { hashPassword, randomUUID } = await import("../src/lib/server/auth");
const employee = db
  .prepare("SELECT id,line_id,name FROM employees WHERE line_id=1 LIMIT 1")
  .get() as { id: string; line_id: number; name: string };
const id = randomUUID();
db.prepare(
  "INSERT INTO accounts(id,username,name,password_hash,status,employee_id,line_ids) VALUES (?,?,?,?,'active',?,?)",
).run(
  id,
  "uiworker",
  employee.name,
  hashPassword("Fixture-Only-42!"),
  employee.id,
  "[1]",
);
db.prepare("INSERT INTO account_roles VALUES (?,'worker')").run(id);
const adminId = randomUUID();
db.prepare(
  "INSERT INTO accounts(id,username,name,password_hash,status) VALUES (?,?,?,?,'active')",
).run(
  adminId,
  "uiadmin",
  "Quản trị kiểm thử",
  hashPassword("Fixture-Only-42!"),
);
db.prepare("INSERT INTO account_roles VALUES (?,'admin')").run(adminId);
const sharp = (await import("sharp")).default;
const dress = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><rect width="600" height="800" fill="#f1ece8"/><ellipse cx="300" cy="730" rx="160" ry="18" fill="#ded4cd"/><path d="M262 105h76v90h-76z" fill="#bca897"/><path d="M300 80v-30c0-25 38-25 38 0" stroke="#75665b" stroke-width="5" fill="none"/><path d="M300 80L200 148h200z" fill="none" stroke="#75665b" stroke-width="5"/><path d="M230 145q70 54 140 0l65 56-40 75-43-33-15 112 123 355q-155 42-320 0l123-355-15-112-43 33-40-75z" fill="#c97892"/><path d="M230 145q70 54 140 0l-18 98q-52 34-104 0z" fill="#d893a8"/><path d="M263 355h74M263 363h74" stroke="#ac5e79" stroke-width="5"/><path d="M277 369l-45 340M300 369v352M324 369l45 340" stroke="#b66884" stroke-width="4" fill="none"/><path d="M232 180q68 54 136 0" stroke="#e4b3c2" stroke-width="4" fill="none"/><text x="300" y="775" text-anchor="middle" font-family="Arial" font-size="20" fill="#80736a">ẢNH MẪU KIỂM THỬ</text></svg>`;
await sharp(Buffer.from(dress)).png().toFile(join(folder, "product.png"));
console.log(process.env.DATABASE_PATH);
console.log(join(folder, "product.png"));
db.close();
