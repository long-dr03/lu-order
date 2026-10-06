import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
const { Pool } = await import("pg");
if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    "TEST_DATABASE_URL must point to a disposable PostgreSQL test server",
  );
const adminPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const testDatabase = "luuta_test_" + randomUUID().replaceAll("-", "");
const restoredDatabase = testDatabase + "_restore";
await adminPool.query(`CREATE DATABASE "${testDatabase}"`);
const testUrl = new URL(process.env.TEST_DATABASE_URL);
testUrl.pathname = "/" + testDatabase;
process.env.DATABASE_URL = testUrl.toString();
const { readSnapshot } = await import("../src/lib/server/snapshot");
const directory = mkdtempSync(join(tmpdir(), "luuta-tests-"));
process.env.BACKUP_DIR = join(directory, "backups");
process.env.SESSION_COOKIE_SECURE = "false";
process.env.APP_ORIGIN = "http://localhost:3003";
const { db, getOrderById } = await import("../src/lib/db");
await (await import("../src/lib/server/migrate")).initializeDatabase();
assert.equal(
  ((await db.prepare("SELECT COUNT(*) n FROM orders").get()) as { n: number })
    .n,
  0,
);
const { seedSampleData } = await import("../scripts/sample-data");
await seedSampleData();
const seeded = await db
  .prepare("SELECT SUM(total_pay) total FROM production_logs")
  .get();
await seedSampleData();
assert.deepEqual(
  await db.prepare("SELECT SUM(total_pay) total FROM production_logs").get(),
  seeded,
);
const auth = await import("../src/lib/server/auth");
const business = await import("../src/lib/server/business");
const authRoutes = await import("../src/app/api/auth/[action]/route");
const orderRoutes = await import("../src/app/api/orders/route");
const detailRoutes = await import("../src/app/api/orders/[id]/route");
const productionRoutes = await import("../src/app/api/production/log/route");
const payrollRoutes = await import("../src/app/api/payroll/route");
const adminRoutes = await import("../src/app/api/admin/[section]/route");
const exportRoutes = await import("../src/app/api/export/excel/route");
const operationRoutes =
  await import("../src/app/api/orders/[id]/operations/route");
const auditRoutes = await import("../src/app/api/audit/route");
const imageRoutes = await import("../src/app/api/product-images/route");
const imageDetailRoutes =
  await import("../src/app/api/product-images/[id]/route");
const sharp = (await import("sharp")).default;
const ratesRoutes = await import("../src/app/api/rates/route");
const { day } = await import("../src/lib/client");
const { permits, canRecordProduction } = await import("../src/lib/permissions");
const testPassword = "Local-Test-Password-42!";
const people: Record<string, { id: string; cookie: string; csrf: string }> = {};
async function person(
  username: string,
  role: string,
  employee: string | null,
  lineIds: number[],
) {
  const id = randomUUID();
  await db
    .prepare(
      "INSERT INTO accounts(id,username,name,password_hash,status,employee_id,line_ids) VALUES (?,?,?,?,'active',?,?)",
    )
    .run(
      id,
      username,
      username,
      auth.hashPassword(testPassword),
      employee,
      JSON.stringify(lineIds),
    );
  await db.prepare("INSERT INTO account_roles VALUES (?,?)").run(id, role);
  return await newSession(id);
}
async function newSession(id: string) {
  const token = randomUUID();
  const csrf = randomUUID();
  await db
    .prepare(
      "INSERT INTO sessions(token_hash,account_id,csrf,expires_at) VALUES (?,?,?,?)",
    )
    .run(auth.hashToken(token), id, csrf, Date.now() + 86400000);
  return { id, cookie: `luuta_session=${token}`, csrf };
}
function request(
  path: string,
  who?: keyof typeof people,
  input?: unknown,
  options: {
    origin?: string;
    csrf?: string;
    key?: string;
    method?: string;
  } = {},
) {
  const p = who ? people[who] : undefined;
  return new Request("http://localhost:3003" + path, {
    method: input === undefined ? "GET" : options.method || "POST",
    headers: {
      ...(p ? { cookie: p.cookie } : {}),
      ...(input === undefined
        ? {}
        : {
            origin: options.origin ?? "http://localhost:3003",
            "content-type": "application/json",
            "x-csrf-token": options.csrf ?? p?.csrf ?? "",
            "idempotency-key": options.key || randomUUID(),
          }),
    },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
}
const context = async (who: string) =>
  await auth.authenticate(request("/api/orders", who));
const params = async (key: string, value: string) =>
  ({ params: Promise.resolve({ [key]: value }) }) as {
    params: Promise<{ action: string; section: string; id: string }>;
  };
async function fixture(stage = "may", quantity = 5) {
  const id = (
    await business.createOrder(await context("admin"), {
      customer: '=HYPERLINK("danger")',
      product_name: "Sản phẩm kiểm thử",
      product_code: "TEST",
      deadline: "2027-10-12",
      order_date: "2026-01-01",
      line_id: 1,
      priority: "normal",
      notes: "",
      variants: [{ color: "Đen", size: "M", quantity }],
    })
  ).id;
  await db
    .prepare("UPDATE orders SET current_stage=? WHERE id=?")
    .run(stage, id);
  await db
    .prepare("UPDATE order_variants SET cut_qty=? WHERE order_id=?")
    .run(stage === "cat" ? 0 : quantity, id);
  await db
    .prepare("INSERT INTO order_rates VALUES (?,?,?)")
    .run(id, "May", 12000);
  await db
    .prepare("INSERT INTO order_rates VALUES (?,?,?)")
    .run(id, "Cắt", 5000);
  return (await getOrderById(id))!;
}
before(async () => {
  await db
    .prepare(
      "INSERT INTO employees(id,name,line_id,role,phone) VALUES (?,?,?,?,?)",
    )
    .run("TEST-W1", "Nhân viên A", 1, "May", "");
  await db
    .prepare(
      "INSERT INTO employees(id,name,line_id,role,phone) VALUES (?,?,?,?,?)",
    )
    .run("TEST-W2", "Nhân viên B", 2, "May", "");
  people.admin = await person("testadmin", "admin", null, []);
  people.worker = await person("workerone", "worker", "TEST-W1", [1]);
  people.other = await person("workertwo", "worker", "TEST-W2", [2]);
  people.leader = await person("leaderone", "leader", null, [1]);
});
after(async () => {
  await db.close();
  await adminPool.query(
    `DROP DATABASE IF EXISTS "${restoredDatabase}" WITH (FORCE)`,
  );
  await adminPool.query(`DROP DATABASE "${testDatabase}" WITH (FORCE)`);
  await adminPool.end();
  rmSync(directory, { recursive: true, force: true });
});
test("migration is versioned, repeatable, and preserves historical wages", async () => {
  const before = await db
    .prepare("SELECT SUM(total_pay) total FROM production_logs")
    .get();
  const { migrate } = await import("../src/lib/server/migrate");
  await migrate();
  assert.deepEqual(
    await db.prepare("SELECT SUM(total_pay) total FROM production_logs").get(),
    before,
  );
  assert.equal(
    (
      (await db
        .prepare("SELECT COUNT(*) qty FROM schema_migrations")
        .get()) as {
        qty: number;
      }
    ).qty,
    10,
  );
});
test("password hashes have different salts and support verification", () => {
  const a = auth.hashPassword(testPassword),
    b = auth.hashPassword(testPassword);
  assert.notEqual(a, b);
  assert(auth.verifyPassword(testPassword, a));
  assert(!auth.verifyPassword("wrong", a));
  assert(!a.includes(testPassword));
});
test("all business endpoints reject anonymous API access", async () => {
  for (const handler of [
    orderRoutes.GET,
    productionRoutes.GET,
    payrollRoutes.GET,
    exportRoutes.GET,
    auditRoutes.GET,
    ratesRoutes.GET,
  ])
    assert.equal((await handler(request("/api/orders"))).status, 401);
});
test("registration stays pending and cannot login until approved", async () => {
  const response = await authRoutes.POST(
    request("/api/auth/register", undefined, {
      username: "newworker",
      name: "Người mới",
      password: testPassword,
    }),
    await params("action", "register"),
  );
  assert.equal(response.status, 201);
  const row = (await db
    .prepare("SELECT status FROM accounts WHERE username=?")
    .get("newworker")) as { status: string };
  assert.equal(row.status, "pending");
  assert.equal(
    (
      await authRoutes.POST(
        request("/api/auth/login", undefined, {
          username: "newworker",
          password: testPassword,
        }),
        await params("action", "login"),
      )
    ).status,
    403,
  );
});
test("approval links existing employee, grants roles, and revokes sessions", async () => {
  const row = (await db
    .prepare("SELECT id FROM accounts WHERE username=?")
    .get("newworker")) as { id: string };
  await db
    .prepare("INSERT INTO employees(id,name,line_id,role) VALUES (?,?,?,?)")
    .run("TEST-W3", "Người mới", 1, "May");
  const r = await adminRoutes.POST(
    request("/api/admin/users", "admin", {
      id: row.id,
      action: "approve",
      employeeId: "TEST-W3",
      lineIds: [1],
      roleIds: ["worker"],
    }),
    await params("section", "users"),
  );
  assert.equal(r.status, 200);
  assert.equal((await auth.account(row.id))?.status, "active");
  const login = await authRoutes.POST(
    request("/api/auth/login", undefined, {
      username: "newworker",
      password: testPassword,
    }),
    await params("action", "login"),
  );
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie") || "", /HttpOnly/i);
  assert.match(login.headers.get("set-cookie") || "", /SameSite=lax/i);
});
test("login throttling blocks repeated invalid passwords", async () => {
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await authRoutes.POST(
          request("/api/auth/login", undefined, {
            username: "unknownuser",
            password: "wrong",
          }),
          await params("action", "login"),
        )
      ).status,
      401,
    );
  assert.equal(
    (
      await authRoutes.POST(
        request("/api/auth/login", undefined, {
          username: "unknownuser",
          password: "wrong",
        }),
        await params("action", "login"),
      )
    ).status,
    429,
  );
});
test("sessions expire and only token hashes are persisted", async () => {
  const p = await newSession(people.worker.id);
  await db
    .prepare("UPDATE sessions SET expires_at=0 WHERE token_hash=?")
    .run(auth.hashToken(p.cookie.slice(14)));
  await assert.rejects(
    async () =>
      await auth.authenticate(
        new Request("http://localhost:3003/api/orders", {
          headers: { cookie: p.cookie },
        }),
      ),
    /đăng nhập/,
  );
  assert(
    !JSON.stringify(
      await db.prepare("SELECT token_hash FROM sessions").all(),
    ).includes(people.worker.cookie.slice(14)),
  );
});
test("origin and CSRF are enforced on authenticated writes", async () => {
  const input = { month: "2025-01" };
  assert.equal(
    (
      await payrollRoutes.POST(
        request("/api/payroll", "admin", input, {
          origin: "http://evil.local",
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await payrollRoutes.POST(
        request("/api/payroll", "admin", input, { csrf: "incorrect" }),
      )
    ).status,
    403,
  );
});
test("worker cannot read another employee salary by changing query IDs", async () => {
  const r = await payrollRoutes.GET(
    request("/api/payroll?employee_id=TEST-W2", "worker"),
  );
  assert.equal(r.status, 200);
  const json = await r.json();
  assert.deepEqual(json.data.logs, []);
  assert.deepEqual(json.data.summary, []);
  const orders = await orderRoutes.GET(request("/api/orders", "worker"));
  const data = await orders.json();
  assert(data.data.orders.every((o: { line_id: number }) => o.line_id === 1));
  assert.equal(
    (
      await detailRoutes.GET(
        request("/api/orders/LU-002", "worker"),
        await params("id", "LU-002"),
      )
    ).status,
    403,
  );
});
test("production-only roles cannot read monetary fields", async () => {
  const response = await productionRoutes.GET(
    request("/api/production/log", "leader"),
  );
  const json = await response.json();
  assert(json.data.logs.length > 0);
  assert(
    json.data.logs.every(
      (l: { unit_price: null; total_pay: null }) =>
        l.unit_price === null && l.total_pay === null,
    ),
  );
  assert.equal(
    (await payrollRoutes.GET(request("/api/payroll", "leader"))).status,
    403,
  );
});
test("multiple roles combine permission scopes without widening each grant", async () => {
  await db
    .prepare("INSERT INTO account_roles VALUES (?,?)")
    .run(people.worker.id, "leader");
  const user = (await auth.account(people.worker.id))!;
  assert(
    permits(user, "production.create", { employeeId: "TEST-W3", lineId: 1 }),
  );
  assert(
    !permits(user, "production.create", { employeeId: "TEST-W2", lineId: 2 }),
  );
  assert(!permits(user, "payroll.view", { employeeId: "TEST-W3", lineId: 1 }));
  await db
    .prepare(
      "DELETE FROM account_roles WHERE account_id=? AND role_id='leader'",
    )
    .run(people.worker.id);
});
test("employees cannot spoof wage, identity, or another line in production payload", async () => {
  const o = await fixture();
  const base = {
    log_date: day(),
    employee_id: "TEST-W1",
    order_id: o.id,
    color: "Đen",
    size: "M",
    stage: "May",
    quantity: 1,
    version: o.version,
  };
  assert.equal(
    (
      await productionRoutes.POST(
        request("/api/production/log", "worker", {
          ...base,
          unit_price: 999999,
        }),
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await productionRoutes.POST(
        request("/api/production/log", "worker", {
          ...base,
          employee_id: "TEST-W2",
        }),
      )
    ).status,
    403,
  );
});
test("production uses server rate, transactions, version checks, and idempotency", async () => {
  const o = await fixture();
  const input = {
    log_date: day(),
    employee_id: "TEST-W1",
    order_id: o.id,
    color: "Đen",
    size: "M",
    stage: "May",
    quantity: 2,
    version: o.version,
  };
  const key = randomUUID();
  const a = await productionRoutes.POST(
    request("/api/production/log", "worker", input, { key }),
  );
  assert.equal(a.status, 201);
  const data = await a.json();
  assert.equal(data.data.total_pay, 24000);
  const b = await productionRoutes.POST(
    request("/api/production/log", "worker", input, { key }),
  );
  assert.equal(b.status, 201);
  assert.equal((await b.json()).data.id, data.data.id);
  assert.equal((await getOrderById(o.id))?.variants?.[0].sewn_qty, 2);
  assert.equal(
    (
      await productionRoutes.POST(
        request("/api/production/log", "worker", input),
      )
    ).status,
    409,
  );
  const changed = {
    ...input,
    version: (await getOrderById(o.id))!.version,
    quantity: 4,
  };
  assert.equal(
    (
      await productionRoutes.POST(
        request("/api/production/log", "worker", changed),
      )
    ).status,
    422,
  );
  assert.equal((await getOrderById(o.id))?.variants?.[0].sewn_qty, 2);
});
test("strict workflow prevents skipping, QC shortfall, and incomplete delivery", async () => {
  const o = await fixture("cat");
  const move = async (stage: string) =>
    await detailRoutes.PATCH(
      request(
        `/api/orders/${o.id}`,
        "admin",
        { version: (await getOrderById(o.id))!.version, stage },
        { method: "PATCH" },
      ),
      await params("id", o.id),
    );
  assert.equal((await move("hoan_thanh")).status, 422);
  assert.equal((await move("may")).status, 422);
  await db.prepare("UPDATE orders SET current_stage='qc' WHERE id=?").run(o.id);
  assert.equal((await move("dong_goi")).status, 422);
  await db
    .prepare("UPDATE orders SET current_stage='giao_hang' WHERE id=?")
    .run(o.id);
  assert.equal((await move("hoan_thanh")).status, 422);
});
test("QC, rework, repeated QC, packing and delivery preserve per-variant bounds", async () => {
  const o = await fixture("qc", 5);
  await db
    .prepare("UPDATE order_variants SET sewn_qty=5 WHERE order_id=?")
    .run(o.id);
  const op = async (action: string, quantity: number, passed?: number) =>
    await operationRoutes.POST(
      request(`/api/orders/${o.id}/operations`, "admin", {
        version: (await getOrderById(o.id))!.version,
        color: "Đen",
        size: "M",
        action,
        quantity,
        ...(passed !== undefined ? { passed } : {}),
      }),
      await params("id", o.id),
    );
  const move = async (stage: string) =>
    await detailRoutes.PATCH(
      request(
        `/api/orders/${o.id}`,
        "admin",
        { version: (await getOrderById(o.id))!.version, stage },
        { method: "PATCH" },
      ),
      await params("id", o.id),
    );
  assert.equal((await op("qc", 5, 3)).status, 200);
  assert.equal((await move("dong_goi")).status, 422);
  assert.equal((await move("sua_hang")).status, 200);
  assert.equal((await op("rework", 3)).status, 422);
  assert.equal((await op("rework", 2)).status, 200);
  assert.equal((await move("qc_lai")).status, 200);
  assert.equal((await op("reinspect", 2, 1)).status, 200);
  assert.equal((await move("sua_hang")).status, 200);
  assert.equal((await op("rework", 1)).status, 200);
  assert.equal((await move("qc_lai")).status, 200);
  assert.equal((await op("reinspect", 1, 1)).status, 200);
  assert.equal((await move("dong_goi")).status, 200);
  assert.equal((await op("pack", 6)).status, 422);
  assert.equal((await op("pack", 5)).status, 200);
  assert.equal((await move("giao_hang")).status, 200);
  assert.equal((await op("deliver", 5)).status, 200);
  assert.equal((await move("hoan_thanh")).status, 200);
  assert.equal((await getOrderById(o.id))?.status, "completed");
});
test("role management cannot mutate self, protected admin, or grant equal hierarchy", async () => {
  assert.equal(
    (
      await adminRoutes.POST(
        request("/api/admin/users", "admin", {
          id: people.admin.id,
          action: "lock",
        }),
        await params("section", "users"),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await adminRoutes.POST(
        request("/api/admin/users", "admin", {
          id: people.worker.id,
          action: "update",
          employeeId: "TEST-W1",
          lineIds: [1],
          roleIds: ["admin"],
        }),
        await params("section", "users"),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await adminRoutes.POST(
        request("/api/admin/roles", "admin", {
          id: "admin",
          name: "Admin",
          position: 99,
          grants: [],
        }),
        await params("section", "roles"),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await adminRoutes.GET(
        request("/api/admin/users", "worker"),
        await params("section", "users"),
      )
    ).status,
    403,
  );
});
test("representation uses worker ceiling and records actor plus represented identity", async () => {
  const start = await authRoutes.POST(
    request("/api/auth/represent", "admin", {
      accountId: people.worker.id,
      password: testPassword,
    }),
    await params("action", "represent"),
  );
  assert.equal(start.status, 200);
  const ctx = await context("admin");
  assert(ctx.representing);
  assert.equal(ctx.user.id, people.worker.id);
  assert.equal(
    (
      await adminRoutes.GET(
        request("/api/admin/users", "admin"),
        await params("section", "users"),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await payrollRoutes.POST(
        request("/api/payroll", "admin", { month: "2025-02" }),
      )
    ).status,
    403,
  );
  const o = await fixtureForRepresent();
  const r = await productionRoutes.POST(
    request("/api/production/log", "admin", {
      log_date: day(),
      employee_id: "TEST-W1",
      order_id: o.id,
      color: "Đen",
      size: "M",
      stage: "May",
      quantity: 1,
      version: o.version,
    }),
  );
  assert.equal(r.status, 201);
  const audit = (await db
    .prepare(
      "SELECT actor_id,represented_id FROM audit_logs WHERE action='Nhập sản lượng' ORDER BY id DESC LIMIT 1",
    )
    .get()) as { actor_id: string; represented_id: string };
  assert.equal(audit.actor_id, people.admin.id);
  assert.equal(audit.represented_id, people.worker.id);
  assert.equal(
    (
      await authRoutes.POST(
        request("/api/auth/stop-represent", "admin", {}),
        await params("action", "stop-represent"),
      )
    ).status,
    200,
  );
  async function fixtureForRepresent() {
    const actor = (await auth.account(people.admin.id))!;
    const raw = { ...ctx, user: actor, representing: false };
    const o = await business.createOrder(raw, {
      customer: "Test",
      product_name: "Represent",
      product_code: "R",
      deadline: "2027-10-12",
      order_date: "2026-01-01",
      line_id: 1,
      priority: "normal",
      notes: "",
      variants: [{ color: "Đen", size: "M", quantity: 2 }],
    });
    await db
      .prepare("UPDATE orders SET current_stage='may' WHERE id=?")
      .run(o.id);
    await db
      .prepare("UPDATE order_variants SET cut_qty=2 WHERE order_id=?")
      .run(o.id);
    await db
      .prepare("INSERT INTO order_rates VALUES (?,?,?)")
      .run(o.id, "May", 10000);
    return (await getOrderById(o.id))!;
  }
});
test("Excel export retains literal text, respects all filters and employee boundaries", async () => {
  const response = await exportRoutes.GET(
    request("/api/export/excel?dataset=orders", "admin"),
  );
  assert.equal(response.status, 200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const sheet = workbook.getWorksheet("Đơn hàng")!;
  assert(sheet.rowCount > 1);
  const literal = sheet
    .getColumn(2)
    .values.find((v) => typeof v === "string" && v.startsWith("=HYPERLINK"));
  assert.equal(typeof literal, "string");
  assert.equal(sheet.views[0].state, "frozen");
  assert(sheet.getRow(2).getCell(5).value instanceof Date);
  assert.equal(sheet.getRow(2).getCell(5).numFmt, "dd/mm/yyyy");
  const worker = await exportRoutes.GET(
    request(
      `/api/export/excel?dataset=payroll&month=${day().slice(0, 7)}&employee_id=TEST-W2`,
      "worker",
    ),
  );
  assert.equal(worker.status, 200);
  const personal = new ExcelJS.Workbook();
  await personal.xlsx.load(await worker.arrayBuffer());
  assert.equal(personal.getWorksheet("Chi tiết sản lượng")?.rowCount, 1);
  for (const dataset of ["production", "payroll", "qc", "delivery"])
    assert.equal(
      (
        await exportRoutes.GET(
          request(`/api/export/excel?dataset=${dataset}`, "admin"),
        )
      ).status,
      200,
    );
});
test("password reset forces change and account lock revokes all sessions", async () => {
  const id = people.other.id;
  const result = await adminRoutes.POST(
    request("/api/admin/users", "admin", {
      id,
      action: "reset",
      temporaryPassword: "New-Temporary-42!",
    }),
    await params("section", "users"),
  );
  assert.equal(result.status, 200);
  assert.equal((await auth.account(id))?.must_change_password, 1);
  await assert.rejects(async () => await context("other"), /đăng nhập/);
  const p = await newSession(id);
  people.other = p;
  await assert.rejects(async () => await context("other"), /đổi mật khẩu/);
  const change = await authRoutes.POST(
    request("/api/auth/password", "other", {
      currentPassword: "New-Temporary-42!",
      newPassword: "Changed-Password-42!",
    }),
    await params("action", "password"),
  );
  assert.equal(change.status, 200);
  assert.equal((await auth.account(id))?.must_change_password, 0);
  await assert.rejects(async () => await context("other"), /đăng nhập/);
  people.other = await newSession(id);
  assert.equal(
    (
      await adminRoutes.POST(
        request("/api/admin/users", "admin", { id, action: "lock" }),
        await params("section", "users"),
      )
    ).status,
    200,
  );
  await assert.rejects(async () => await context("other"), /đăng nhập/);
});
test("month locks prevent production writes without partial updates", async () => {
  const o = await fixture("may", 5);
  assert.equal(
    (
      await payrollRoutes.POST(
        request("/api/payroll", "admin", { month: day().slice(0, 7) }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await productionRoutes.POST(
        request("/api/production/log", "worker", {
          log_date: day(),
          employee_id: "TEST-W1",
          order_id: o.id,
          color: "Đen",
          size: "M",
          stage: "May",
          quantity: 1,
          version: o.version,
        }),
      )
    ).status,
    409,
  );
  assert.equal((await getOrderById(o.id))?.variants?.[0].sewn_qty, 0);
});

test("administration needs whole-workshop scope and cannot assign stronger business grants", async () => {
  await db
    .prepare(
      "INSERT INTO roles(id,name,position) VALUES ('limited-admin','Limited',90)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO role_grants VALUES ('limited-admin','users.manage','self')",
    )
    .run();
  people.limited = await person("limitedadmin", "limited-admin", null, []);
  assert.equal(
    (
      await adminRoutes.GET(
        request("/api/admin/users", "limited"),
        await params("section", "users"),
      )
    ).status,
    403,
  );
  await db
    .prepare("UPDATE role_grants SET scope='all' WHERE role_id='limited-admin'")
    .run();
  assert.equal(
    (
      await adminRoutes.POST(
        request("/api/admin/users", "limited", {
          id: people.other.id,
          action: "update",
          roleIds: ["director"],
          lineIds: [2],
        }),
        await params("section", "users"),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await adminRoutes.POST(
        request("/api/admin/roles", "admin", {
          name: "Invalid self management",
          position: 20,
          grants: [{ permission: "users.manage", scope: "self" }],
        }),
        await params("section", "roles"),
      )
    ).status,
    422,
  );
});

test("personal audit scope excludes another employee and Excel totals match filtered SQLite data", async () => {
  await db
    .prepare(
      "INSERT INTO roles(id,name,position) VALUES ('personal-audit','Personal audit',15)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO role_grants VALUES ('personal-audit','audit.view','self')",
    )
    .run();
  await db
    .prepare("INSERT INTO account_roles VALUES (?, 'personal-audit')")
    .run(people.worker.id);
  const rows = await business.auditFor(await context("worker"));
  assert(rows.length > 0);
  assert(
    rows.every((row) =>
      [people.worker.id].includes(row.represented_id || row.actor_id || ""),
    ),
  );
  const month = day().slice(0, 7);
  const response = await exportRoutes.GET(
    request(`/api/export/excel?dataset=payroll&month=${month}`, "worker"),
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const sheet = workbook.getWorksheet("Chi tiết sản lượng")!;
  let quantity = 0,
    salary = 0;
  sheet.eachRow((row, number) => {
    if (number > 1) {
      assert.equal(row.getCell(2).value, "TEST-W1");
      quantity += Number(row.getCell(10).value);
      salary += Number(row.getCell(12).value);
    }
  });
  const expected = (await db
    .prepare(
      "SELECT SUM(quantity) qty, SUM(total_pay) pay FROM production_logs WHERE employee_id=? AND month=?",
    )
    .get("TEST-W1", month)) as { qty: number; pay: number };
  assert.equal(quantity, expected.qty || 0);
  assert.equal(salary, expected.pay || 0);
  const summary = workbook.getWorksheet("Tổng hợp lương")!;
  assert.equal(Number(summary.getRow(2).getCell(5).value), salary);
});

test("product images validate content and dimensions, require CSRF and scoped permissions", async () => {
  const valid = await sharp({
    create: { width: 1800, height: 2000, channels: 3, background: "pink" },
  })
    .png()
    .toBuffer();
  const upload = async (
    who: string | undefined,
    data: Uint8Array,
    type = "image/png",
    lineId = 1,
    csrf?: string,
  ) => {
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(data)], { type }), "product.png");
    form.set("line_id", String(lineId));
    return await imageRoutes.POST(
      new Request("http://localhost:3003/api/product-images", {
        method: "POST",
        headers: {
          origin: "http://localhost:3003",
          ...(who
            ? {
                cookie: people[who].cookie,
                "x-csrf-token": csrf || people[who].csrf,
              }
            : {}),
        },
        body: form,
      }),
    );
  };
  assert.equal((await upload(undefined, valid)).status, 401);
  assert.equal((await upload("worker", valid)).status, 403);
  assert.equal(
    (await upload("admin", valid, "image/png", 1, "bad")).status,
    403,
  );
  assert.equal(
    (await upload("admin", Buffer.from("<svg/>"), "image/svg+xml")).status,
    422,
  );
  assert.equal(
    (await upload("admin", Buffer.from("not an image"))).status,
    422,
  );
  assert.equal(
    (await upload("admin", new Uint8Array(5 * 1024 * 1024 + 1))).status,
    413,
  );
  await db
    .prepare(
      "INSERT INTO roles(id,name,position) VALUES ('image-editor','Image editor',20)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO role_grants VALUES ('image-editor','orders.edit','lines')",
    )
    .run();
  people.imageeditor = await person("imageeditor", "image-editor", null, [1]);
  assert.equal(
    (await upload("imageeditor", valid, "image/png", 2)).status,
    403,
  );
  const hugeDimensions = await sharp({
    create: { width: 5000, height: 4001, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  assert.equal((await upload("admin", hugeDimensions)).status, 422);
  assert.equal(
    (
      await upload(
        "admin",
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
        ),
        "image/png",
      )
    ).status,
    422,
  );
  const uploaded = await upload("admin", valid);
  assert.equal(uploaded.status, 201);
  const {
    data: { url },
  } = await uploaded.json();
  const imageId = url.split("/").pop();
  assert.equal(
    (
      await imageDetailRoutes.GET(
        request(url, "worker"),
        await params("id", imageId),
      )
    ).status,
    403,
  );
  const read = await imageDetailRoutes.GET(
    request(url, "admin"),
    await params("id", imageId),
  );
  assert.equal(read.status, 200);
  assert.equal(read.headers.get("cache-control"), "private, no-store");
  const metadata = await sharp(
    Buffer.from(await read.arrayBuffer()),
  ).metadata();
  assert.equal(metadata.format, "jpeg");
  assert((metadata.width || 0) <= 1400);
  assert((metadata.height || 0) <= 1400);
  assert.equal(metadata.exif, undefined);
  assert.equal(
    (
      await authRoutes.POST(
        request("/api/auth/represent", "admin", {
          accountId: people.worker.id,
          password: testPassword,
        }),
        await params("action", "represent"),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await imageDetailRoutes.GET(
        request(url, "admin"),
        await params("id", imageId),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await authRoutes.POST(
        request("/api/auth/stop-represent", "admin", {}),
        await params("action", "stop-represent"),
      )
    ).status,
    200,
  );
  await db
    .prepare("INSERT INTO account_roles VALUES (?,'image-editor')")
    .run(people.worker.id);
  assert.equal(
    (
      await authRoutes.POST(
        request("/api/auth/represent", "admin", {
          accountId: people.worker.id,
          password: testPassword,
        }),
        await params("action", "represent"),
      )
    ).status,
    200,
  );
  const representedUpload = await upload("admin", valid);
  assert.equal(representedUpload.status, 201);
  const representedUrl = (await representedUpload.json()).data.url;
  const representedId = representedUrl.split("/").pop();
  assert.equal(
    (
      (await db
        .prepare("SELECT owner_id FROM product_images WHERE id=?")
        .get(representedId)) as { owner_id: string }
    ).owner_id,
    people.worker.id,
  );
  assert.equal(
    (
      await imageDetailRoutes.GET(
        request(representedUrl, "admin"),
        await params("id", representedId),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await authRoutes.POST(
        request("/api/auth/stop-represent", "admin", {}),
        await params("action", "stop-represent"),
      )
    ).status,
    200,
  );
  await db
    .prepare(
      "DELETE FROM account_roles WHERE account_id=? AND role_id='image-editor'",
    )
    .run(people.worker.id);
  assert.equal(
    (
      await imageDetailRoutes.GET(
        request(representedUrl, "admin"),
        await params("id", representedId),
      )
    ).status,
    403,
  );
  const o = await fixture();
  const attach = await detailRoutes.PATCH(
    request(`/api/orders/${o.id}`, "admin", {
      version: o.version,
      image_url: url,
    }),
    await params("id", o.id),
  );
  assert.equal(attach.status, 200);
  assert.equal((await getOrderById(o.id))?.image_url, url);
  const blankOrder = await fixture();
  assert.equal(
    (
      await detailRoutes.PATCH(
        request(`/api/orders/${blankOrder.id}`, "imageeditor", {
          version: blankOrder.version,
          image_url: url,
        }),
        await params("id", blankOrder.id),
      )
    ).status,
    422,
  );
  const create = await orderRoutes.POST(
    request("/api/orders", "admin", {
      customer: "Test ảnh",
      product_name: "Mẫu ảnh",
      product_code: "PHOTO",
      order_date: "2026-01-01",
      deadline: "2027-01-01",
      line_id: 1,
      image_url: url,
      variants: [{ color: "Hồng", size: "M", quantity: 2 }],
    }),
  );
  assert.equal(create.status, 201);
  const created = await create.json();
  assert.equal((await getOrderById(created.data.id))?.image_url, url);

  assert.equal(
    (await imageDetailRoutes.GET(request(url), await params("id", imageId)))
      .status,
    401,
  );
  assert.equal(
    (
      await imageDetailRoutes.GET(
        request(url, "worker"),
        await params("id", imageId),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await imageDetailRoutes.GET(
        request(url, "other"),
        await params("id", imageId),
      )
    ).status,
    401,
  );
  const otherActive = await person("imageother", "worker", null, [2]);

  people.imagereader = otherActive;
  assert.equal(
    (
      await imageDetailRoutes.GET(
        request(url, "imagereader"),
        await params("id", imageId),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await detailRoutes.PATCH(
        request(`/api/orders/${o.id}`, "worker", {
          version: (await getOrderById(o.id))!.version,
          image_url: null,
        }),
        await params("id", o.id),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await detailRoutes.PATCH(
        request(`/api/orders/${o.id}`, "admin", {
          version: (await getOrderById(o.id))!.version,
          image_url: "https://example.com/photo.jpg",
        }),
        await params("id", o.id),
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await detailRoutes.PATCH(
        request(`/api/orders/${o.id}`, "admin", {
          version: (await getOrderById(o.id))!.version,
          image_url: null,
        }),
        await params("id", o.id),
      )
    ).status,
    200,
  );
  assert.equal((await getOrderById(o.id))?.image_url, null);
});

test("custom colors and sizes persist, codes generate and remain editable with scoped permissions", async () => {
  const payload = {
    customer: "Seed kiểm thử",
    product_name: "Áo theo số đo",
    order_date: day(),
    deadline: "2027-10-12",
    line_id: 1,
    priority: "normal",
    notes: "",
    variants: [
      {
        color: "Hồng vải mẫu",
        color_hex: "#f9a8d4",
        size: "Theo số đo 92/70",
        quantity: 2,
      },
    ],
  };
  const response = await orderRoutes.POST(
    request("/api/orders", "admin", payload),
  );
  assert.equal(response.status, 201);
  const created = (await response.json()).data;
  const o = (await getOrderById(created.id))!;
  assert.match(o.product_code, /^SP-/);
  assert.equal(o.variants![0].size, "Theo số đo 92/70");
  assert.equal(o.variants![0].color_hex, "#f9a8d4");
  assert.equal(
    (
      await detailRoutes.PATCH(
        request(
          `/api/orders/${o.id}`,
          "worker",
          { version: o.version, product_code: "CUSTOM" },
          { method: "PATCH" },
        ),
        await params("id", o.id),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await detailRoutes.PATCH(
        request(
          `/api/orders/${o.id}`,
          "admin",
          { version: o.version, product_code: "CUSTOM" },
          { method: "PATCH" },
        ),
        await params("id", o.id),
      )
    ).status,
    200,
  );
  assert.equal((await getOrderById(o.id))!.product_code, "CUSTOM");
  assert.equal(
    (
      await orderRoutes.POST(
        request("/api/orders", "admin", { ...payload, order_code: o.id }),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await orderRoutes.POST(
        request("/api/orders", "admin", {
          ...payload,
          variants: [{ ...payload.variants[0], color_hex: "bad" }],
        }),
      )
    ).status,
    422,
  );
  const { parseMoney } = await import("../src/components/SmartInputs");
  assert.equal(parseMoney("1.234.567"), 1234567);
  assert.equal(parseMoney("1,234,567"), 1234567);
});

test("scheduled backups use consistent PostgreSQL snapshots, date archives and admin-only downloads", async () => {
  const routes = await import("../src/app/api/admin/backups/route");
  const backup = await import("../src/lib/server/backup");
  assert.equal((await routes.GET(request("/api/admin/backups"))).status, 401);
  assert.equal(
    (await routes.GET(request("/api/admin/backups", "worker"))).status,
    403,
  );
  assert.equal(
    (
      await routes.POST(
        request("/api/admin/backups", "admin", {
          enabled: true,
          intervalHours: 0,
          windowDays: 30,
        }),
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await routes.POST(
        request(
          "/api/admin/backups",
          "admin",
          { enabled: true, intervalHours: 24, windowDays: 30 },
          { csrf: "bad" },
        ),
      )
    ).status,
    403,
  );
  await backup.configureBackup({
    enabled: true,
    intervalHours: 1,
    windowDays: 30,
  });
  const due = (await backup.backupConfig()).nextAt;
  assert.equal(await backup.checkBackupDue(due - 1), undefined);
  const files = await backup.checkBackupDue(due);
  assert.ok(files);
  assert.equal((await backup.backupConfig()).lastAt, due);
  const { gunzipSync } = await import("node:zlib");
  const archive = JSON.parse(
    gunzipSync((await backup.readBackup(files.archive))!).toString(),
  );
  assert.equal(archive.format, "LUUTA-business-v1");
  assert.equal("accounts" in archive, false);
  assert.ok(
    archive.production.every(
      (r: { log_date: string }) =>
        r.log_date >= archive.from && r.log_date <= archive.until,
    ),
  );
  const snapshot = await readSnapshot(
    join(directory, "backups", files.snapshot),
  );
  const sorted = (rows: Record<string, unknown>[]) =>
    rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  assert.deepEqual(
    sorted(snapshot.tables.production_logs),
    sorted(
      JSON.parse(
        JSON.stringify(await db.prepare("SELECT * FROM production_logs").all()),
      ),
    ),
  );
  assert.deepEqual(
    sorted(snapshot.tables.product_images),
    sorted(
      JSON.parse(
        JSON.stringify(await db.prepare("SELECT * FROM product_images").all()),
      ),
    ),
  );
  assert.equal(
    (
      await routes.GET(
        request("/api/admin/backups?file=" + files.snapshot, "worker"),
      )
    ).status,
    403,
  );
  const download = await routes.GET(
    request("/api/admin/backups?file=" + files.snapshot, "admin"),
  );
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("Cache-Control"), "private, no-store");
  assert.equal(
    (
      await routes.GET(
        request("/api/admin/backups?file=..%2F.env.local", "admin"),
      )
    ).status,
    404,
  );
  assert.equal(await backup.checkBackupDue(due), undefined);
  await backup.configureBackup({
    enabled: false,
    intervalHours: 24,
    windowDays: 30,
  });
  assert.equal(await backup.checkBackupDue(due + 99999999), undefined);
});

test("prices above previous business cap save, unsafe wages reject without partial updates", async () => {
  const o = await fixture();
  const setRate = async (price: number) =>
    await ratesRoutes.POST(
      request("/api/rates", "admin", {
        order_id: o.id,
        stage: "May",
        unit_price: price,
      }),
    );
  assert.equal((await setRate(1234567890)).status, 200);
  assert.equal(
    (
      (await db
        .prepare(
          "SELECT unit_price FROM order_rates WHERE order_id=? AND stage='May'",
        )
        .get(o.id)) as { unit_price: number }
    ).unit_price,
    1234567890,
  );
  assert.equal((await setRate(-1)).status, 422);
  assert.equal((await setRate(Number.MAX_SAFE_INTEGER + 1)).status, 422);
  assert.equal((await setRate(Number.MAX_SAFE_INTEGER)).status, 200);
  const before = await db
    .prepare("SELECT sewn_qty FROM order_variants WHERE order_id=?")
    .get(o.id);
  const response = await productionRoutes.POST(
    request("/api/production/log", "admin", {
      order_id: o.id,
      version: o.version,
      employee_id: "TEST-W1",
      log_date: "2026-01-02",
      color: "Đen",
      size: "M",
      stage: "May",
      quantity: 2,
    }),
  );
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /tính chính xác/);
  assert.deepEqual(
    await db
      .prepare("SELECT sewn_qty FROM order_variants WHERE order_id=?")
      .get(o.id),
    before,
  );
});

test("exceptional transitions require scoped permission and reason, preserve quantities and wages, and audit both steps", async () => {
  const o = await fixture();
  const patch = async (who: string, payload: unknown, key?: string) =>
    await detailRoutes.PATCH(
      request("/api/orders/" + o.id, who, payload, { method: "PATCH", key }),
      await params("id", o.id),
    );
  const snapshot = async () => ({
    variants: await db
      .prepare("SELECT * FROM order_variants WHERE order_id=?")
      .all(o.id),
    wages: await db.prepare("SELECT * FROM production_logs").all(),
  });
  const before = await snapshot();
  assert.equal(
    (await patch("admin", { version: o.version, stage: "cat" })).status,
    422,
  );
  assert.equal(
    (
      await patch("admin", {
        version: o.version,
        stage: "cat",
        exception: true,
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await patch("leader", {
        version: o.version,
        stage: "cat",
        exception: true,
        reason: "Báo cáo nhầm bước",
      })
    ).status,
    403,
  );
  const key = randomUUID(),
    payload = {
      version: o.version,
      stage: "cat",
      exception: true,
      reason: "Báo cáo nhầm bước May",
    };
  assert.equal((await patch("admin", payload, key)).status, 200);
  assert.equal((await patch("admin", payload, key)).status, 200);
  let current = (await getOrderById(o.id))!;
  assert.equal(current.current_stage, "cat");
  assert.deepEqual(await snapshot(), before);
  assert.equal((await patch("admin", { ...payload, stage: "qc" })).status, 409);
  assert.equal(
    (
      await patch("admin", {
        version: current.version,
        stage: "qc",
        exception: true,
        reason: "Khách yêu cầu bỏ bước May",
      })
    ).status,
    200,
  );
  current = (await getOrderById(o.id))!;
  assert.deepEqual(await snapshot(), before);
  assert.equal(
    (
      await patch("admin", {
        version: current.version,
        stage: "hoan_thanh",
        exception: true,
        reason: "Muốn kết thúc ngay",
      })
    ).status,
    422,
  );
  const log = (await db
    .prepare(
      "SELECT details FROM audit_logs WHERE action='Chuyển bước ngoại lệ' AND details LIKE ? ORDER BY id LIMIT 1",
    )
    .get(o.id + ":%")) as { details: string };
  assert.match(log.details, /May → Cắt/);
  assert.match(log.details, /Báo cáo nhầm bước May/);
  await db
    .prepare(
      "UPDATE orders SET current_stage='hoan_thanh',status='completed' WHERE id=?",
    )
    .run(o.id);
  assert.equal(
    (
      await patch("admin", {
        version: current.version,
        stage: "may",
        exception: true,
        reason: "Mở lại để kiểm tra báo cáo",
      })
    ).status,
    200,
  );
  assert.notEqual((await getOrderById(o.id))!.status, "completed");
});

test("deadline risk follows remaining quantities, measured throughput and time instead of stored seed status", async () => {
  const { assessOrders } = await import("../src/lib/progress");
  const raw = await fixture();
  const line = {
    id: 1,
    name: "Chuyền 1",
    leader_name: "",
    workers_count: 1,
    capacity_per_day: 100,
  };
  let orders = assessOrders(
    [
      {
        ...raw,
        status: "on_track",
        deadline: "2026-10-09",
        variants: [{ ...raw.variants![0], quantity: 100, delivered_qty: 0 }],
      },
    ],
    [line],
    [{ line_id: 1, daily: 20 }],
    new Date("2026-10-06T04:00:00Z"),
  );
  assert.equal(orders[0].status, "at_risk");
  assert.match(orders[0].risk_reason!, /thực tế/);
  orders = assessOrders(
    [{ ...orders[0], deadline: "2026-10-05" }],
    [line],
    [],
    new Date("2026-10-06T04:00:00Z"),
  );
  assert.equal(orders[0].status, "delayed");
  orders = assessOrders(
    [
      {
        ...raw,
        status: "at_risk",
        deadline: "2026-10-07",
        variants: [
          { ...raw.variants![0], delivered_qty: raw.variants![0].quantity },
        ],
      },
    ],
    [line],
    [{ line_id: 1, daily: 1 }],
    new Date("2026-10-06T04:00:00Z"),
  );
  assert.equal(orders[0].status, "on_track");
  assert.equal(orders[0].delivered_complete, true);
});

test("packing and delivery retain dated records, notes, worker, packages and operate after wage lock", async () => {
  const o = await fixture("dong_goi");
  await db
    .prepare(
      "UPDATE order_variants SET sewn_qty=quantity,qc_inspected_qty=quantity,qc_passed_qty=quantity WHERE order_id=?",
    )
    .run(o.id);
  const record = async (payload: unknown) =>
    await operationRoutes.POST(
      request("/api/orders/" + o.id + "/operations", "admin", payload),
      await params("id", o.id),
    );
  assert.equal(
    (
      await record({
        version: o.version,
        color: "Đen",
        size: "M",
        action: "pack",
        quantity: 3,
        packages: 2,
        worker_id: "TEST-W2",
        operation_date: day(),
        notes: "Kiện mẫu",
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await record({
        version: o.version,
        color: "Đen",
        size: "M",
        action: "pack",
        quantity: 3,
        packages: 2,
        worker_id: "TEST-W1",
        operation_date: day(),
        notes: "Kiện mẫu",
      })
    ).status,
    200,
  );
  const packing = (await db
    .prepare(
      "SELECT * FROM operation_records WHERE order_id=? AND action='pack'",
    )
    .get(o.id)) as {
    quantity: number;
    packages: number;
    notes: string;
    operation_date: string;
  };
  assert.equal(packing.packages, 2);
  assert.equal(packing.notes, "Kiện mẫu");
  assert.equal(packing.operation_date, day());
  let current = (await getOrderById(o.id))!;
  await db
    .prepare("UPDATE orders SET current_stage='giao_hang' WHERE id=?")
    .run(o.id);
  assert.equal(
    (
      await record({
        version: current.version,
        color: "Đen",
        size: "M",
        action: "deliver",
        quantity: 2,
        worker_id: "TEST-W1",
        operation_date: day(),
        notes: "Giao lần 1",
      })
    ).status,
    200,
  );
  current = (await getOrderById(o.id))!;
  assert.equal(current.variants![0].delivered_qty, 2);
  assert.equal(current.delivered_complete, false);
  const details = await detailRoutes.GET(
    request("/api/orders/" + o.id, "admin"),
    await params("id", o.id),
  );
  assert.equal((await details.json()).data.operations.length, 2);
  const file = await exportRoutes.GET(
    request("/api/export/excel?dataset=delivery&search=" + o.id, "admin"),
  );
  assert.equal(file.status, 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  assert.equal(book.getWorksheet("Lịch sử đóng và giao")!.rowCount, 3);
});

test("stage dossiers record real status and people, skips do not complete untouched stages, shipping bypass preserves QC", async () => {
  const routes = await import("../src/app/api/orders/[id]/stages/route");
  const o = await fixture("nhan_don");
  const payload = {
    version: o.version,
    stage: "nhan_don",
    status: "has_issue",
    employee_id: "TEST-W1",
    received_qty: 5,
    completed_qty: 0,
    notes: "Thiếu thông tin vải",
  };
  assert.equal(
    (
      await routes.PATCH(
        request("/api/orders/" + o.id + "/stages", "worker", payload, {
          method: "PATCH",
        }),
        await params("id", o.id),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await routes.PATCH(
        request("/api/orders/" + o.id + "/stages", "admin", payload, {
          method: "PATCH",
        }),
        await params("id", o.id),
      )
    ).status,
    200,
  );
  let current = (await getOrderById(o.id))!;
  assert.equal(
    current.stages!.find((s) => s.stage_key === "nhan_don")!.status,
    "has_issue",
  );
  assert.equal(
    (
      (await db
        .prepare("SELECT COUNT(*) n FROM stage_events WHERE order_id=?")
        .get(o.id)) as { n: number }
    ).n,
    1,
  );
  assert.equal(
    (
      await detailRoutes.PATCH(
        request(
          "/api/orders/" + o.id,
          "admin",
          {
            version: current.version,
            stage: "may",
            exception: true,
            reason: "Điều phối ngoại lệ thử nghiệm",
          },
          { method: "PATCH" },
        ),
        await params("id", o.id),
      )
    ).status,
    200,
  );
  current = (await getOrderById(o.id))!;
  assert.equal(
    current.stages!.find((s) => s.stage_key === "kiem_rap")!.status,
    "pending",
  );
  assert.equal(
    (
      await detailRoutes.PATCH(
        request(
          "/api/orders/" + o.id,
          "admin",
          {
            version: current.version,
            stage: "dong_goi",
            exception: true,
            reason: "Thử bỏ QC chưa đạt",
          },
          { method: "PATCH" },
        ),
        await params("id", o.id),
      )
    ).status,
    422,
  );
});

test("privileged payroll corrections preserve before/after history, respect downstream quantities and locked periods", async () => {
  const o = await fixture();
  const created = await productionRoutes.POST(
    request("/api/production/log", "admin", {
      version: o.version,
      employee_id: "TEST-W1",
      order_id: o.id,
      color: "Đen",
      size: "M",
      stage: "May",
      quantity: 3,
      log_date: "2026-01-02",
    }),
  );
  assert.equal(created.status, 201);
  const log = (await created.json()).data;
  await payrollRoutes.POST(
    request("/api/payroll", "admin", { month: "2026-01" }),
  );
  const payload = {
    log_id: log.id,
    version: log.version,
    quantity: 2,
    unit_price: 45000,
    reason: "Sửa báo cáo nhầm số lượng",
  };
  assert.equal(
    (
      await productionRoutes.PATCH(
        request("/api/production/log", "worker", payload, { method: "PATCH" }),
      )
    ).status,
    403,
  );
  const key = randomUUID();
  assert.equal(
    (
      await productionRoutes.PATCH(
        request("/api/production/log", "admin", payload, {
          method: "PATCH",
          key,
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await productionRoutes.PATCH(
        request("/api/production/log", "admin", payload, {
          method: "PATCH",
          key,
        }),
      )
    ).status,
    200,
  );
  const adjusted = (await db
    .prepare("SELECT * FROM production_logs WHERE id=?")
    .get(log.id)) as {
    quantity: number;
    total_pay: number;
    version: number;
    is_locked: number;
  };
  assert.equal(adjusted.quantity, 2);
  assert.equal(adjusted.total_pay, 90000);
  assert.equal(adjusted.is_locked, 1);
  assert.equal((await getOrderById(o.id))!.variants![0].sewn_qty, 2);
  const history = (await db
    .prepare(
      "SELECT before_json,after_json,reason FROM production_adjustments WHERE log_id=?",
    )
    .get(log.id)) as { before_json: string; after_json: string };
  assert.equal(JSON.parse(history.before_json).quantity, 3);
  assert.equal(JSON.parse(history.after_json).quantity, 2);
  assert.equal(
    (
      await productionRoutes.PATCH(
        request("/api/production/log", "admin", payload, { method: "PATCH" }),
      )
    ).status,
    409,
  );
  await db
    .prepare("UPDATE order_variants SET qc_inspected_qty=2 WHERE order_id=?")
    .run(o.id);
  assert.equal(
    (
      await productionRoutes.PATCH(
        request(
          "/api/production/log",
          "admin",
          { ...payload, version: adjusted.version, quantity: 1 },
          { method: "PATCH" },
        ),
      )
    ).status,
    422,
  );
  assert.equal((await getOrderById(o.id))!.variants![0].sewn_qty, 2);
});

test("composite report filters match exported totals and sequential codes are assigned by server", async () => {
  const ctx = await context("admin");
  const logs = await business.logsFor(ctx);
  const row = logs.find((l) => l.quantity > 0)!;
  const filtered = await business.filterLogs(logs, {
    from: row.log_date,
    to: row.log_date,
    product: row.order_id,
    color: row.color,
    size: row.size,
    stage: row.stage,
  });
  assert.ok(filtered.length > 0);
  assert.ok(
    filtered.every(
      (l) =>
        l.order_id === row.order_id &&
        l.color === row.color &&
        l.size === row.size &&
        l.log_date === row.log_date,
    ),
  );
  const qs = new URLSearchParams({
    dataset: "production",
    from: row.log_date,
    to: row.log_date,
    product: row.order_id,
    color: row.color,
    size: row.size,
    stage: row.stage,
  });
  const response = await exportRoutes.GET(
    request("/api/export/excel?" + qs, "admin"),
  );
  assert.equal(response.status, 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await response.arrayBuffer());
  assert.equal(
    book.getWorksheet("Chi tiết sản lượng")!.rowCount,
    filtered.length + 1,
  );
  assert.ok(book.getWorksheet("Theo mã hàng"));
  assert.equal(
    (
      await productionRoutes.GET(
        request("/api/production/log?from=2026-10-10&to=2026-10-01", "admin"),
      )
    ).status,
    422,
  );
  const before = await (
    await orderRoutes.GET(request("/api/orders", "admin"))
  ).json();
  const next = before.data.nextCode;
  const responseOrder = await orderRoutes.POST(
    request("/api/orders", "admin", {
      customer: "Khách mẫu",
      product_name: "Áo theo đơn",
      order_date: day(),
      deadline: "2027-10-12",
      line_id: 1,
      responsible_id: "TEST-W1",
      variants: [{ color: "Đen", size: "M", quantity: 1 }],
    }),
  );
  assert.equal(responseOrder.status, 201);
  const data = (await responseOrder.json()).data;
  assert.equal(data.id, next);
  assert.equal(data.assigned_to, "Nhân viên A");
});

test("multiple garment colors persist as one variant and one quantity in API, SQLite and Excel", async () => {
  const colors = [
    { name: "Đen", hex: "#171717", alpha: 35 },
    { name: "Trắng", hex: "#ffffff" },
    { name: "Viền hồng", hex: "#f9a8d4" },
  ];
  const payload = {
    customer: "Khách kiểm thử phối màu",
    product_name: "Áo phối ba màu",
    order_date: day(),
    deadline: "2027-10-12",
    line_id: 1,
    variants: [
      { color: "Đen / Trắng / Viền hồng", colors, size: "M", quantity: 7 },
    ],
  };
  const response = await orderRoutes.POST(
    request("/api/orders", "admin", payload),
  );
  assert.equal(response.status, 201);
  const o = (await response.json()).data;
  assert.equal(o.total_quantity, 7);
  assert.equal(o.variants.length, 1);
  assert.deepEqual(o.variants[0].colors, colors);
  assert.deepEqual((await getOrderById(o.id))!.variants![0].colors, colors);
  const detail = await detailRoutes.GET(
    request("/api/orders/" + o.id, "worker"),
    await params("id", o.id),
  );
  assert.deepEqual((await detail.json()).data.variants[0].colors, colors);
  const file = await exportRoutes.GET(
    request("/api/export/excel?dataset=orders&search=" + o.id, "admin"),
  );
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const sheet = book.getWorksheet("Màu - Size")!;
  assert.equal(sheet.rowCount, 2);
  assert.equal(sheet.getCell("D2").value, 7);
  assert.match(String(sheet.getCell("K2").value), /Trắng \(#ffffff\)/);
  for (const invalid of [
    [{ name: "Đen", hex: "invalid" }],
    [{ name: "Đen", hex: "#171717", alpha: 101 }],
    [{ name: "Đen", hex: "#171717", alpha: -1 }],
    Array.from({ length: 9 }, () => colors[0]),
  ]) {
    const bad = await orderRoutes.POST(
      request("/api/orders", "admin", {
        ...payload,
        variants: [{ ...payload.variants[0], colors: invalid }],
      }),
    );
    assert.equal(bad.status, 422);
  }
  const { hexToHsv, hsvToHex } = await import("../src/lib/colors");
  for (const hex of ["#ffffff", "#000000", "#dc2626", "#808080", "#f9a8d4"]) {
    const hsv = hexToHsv(hex);
    assert.equal(hsvToHex(hsv.h, hsv.s, hsv.v), hex);
  }
});

test("QA: all six default roles enforce API scope and administrator boundaries", async () => {
  for (const role of [
    "admin",
    "director",
    "assistant",
    "leader",
    "qc",
    "worker",
  ]) {
    const who = `qa-${role}`;
    const employeeId = `QA-${role}`;
    await db
      .prepare("INSERT INTO employees(id,name,line_id,role) VALUES (?,?,?,?)")
      .run(employeeId, who, 1, role);
    people[who] = await person(who, role, employeeId, [1]);
    const response = await orderRoutes.GET(request("/api/orders", who));
    assert.equal(response.status, 200, `${role}: đọc đơn`);
    const orders = (await response.json()).data.orders;
    assert.ok(orders.length > 0);
    if (["leader", "worker"].includes(role))
      assert.ok(
        orders.every((o: { line_id: number }) => o.line_id === 1),
        `${role}: không lộ chuyền 2`,
      );
    const users = await adminRoutes.GET(
      request("/api/admin/users", who),
      await params("section", "users"),
    );
    assert.equal(
      users.status,
      role === "admin" ? 200 : 403,
      `${role}: quản trị tài khoản`,
    );
    const rate = await ratesRoutes.POST(
      request("/api/rates", who, {
        order_id: "LU-001",
        stage: "May",
        unit_price: 35000,
      }),
    );
    assert.equal(
      rate.status,
      ["admin", "director", "assistant"].includes(role) ? 200 : 403,
      `${role}: cấu hình giá`,
    );
    assert.equal((await auth.account(people[who].id))!.roles.length, 1);
  }
});

test("QA: director assistant and QC representative views use target roles and remain escapable", async () => {
  const actor = "qa-represent-admin";
  people[actor] = await person(actor, "admin", null, []);
  for (const role of ["director", "assistant", "qc"]) {
    const target = people[`qa-${role}`];
    const start = await authRoutes.POST(
      request("/api/auth/represent", actor, {
        accountId: target.id,
        password: testPassword,
      }),
      await params("action", "represent"),
    );
    assert.equal(start.status, 200, `Đại diện ${role}`);
    const ctx = await context(actor);
    assert.equal(ctx.actor.id, people[actor].id);
    assert.equal(ctx.user.id, target.id);
    assert.deepEqual(
      ctx.user.roles.map((r) => r.id),
      [role],
    );
    assert.equal(ctx.representing, true);
    assert.equal(
      (
        await adminRoutes.GET(
          request("/api/admin/users", actor),
          await params("section", "users"),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await authRoutes.POST(
          request("/api/auth/password", actor, {
            currentPassword: testPassword,
            newPassword: "QA-Replacement-Password-42!",
          }),
          await params("action", "password"),
        )
      ).status,
      403,
    );
    const stop = await authRoutes.POST(
      request("/api/auth/stop-represent", actor, {}),
      await params("action", "stop-represent"),
    );
    assert.equal(stop.status, 200);
    assert.equal((await context(actor)).user.id, people[actor].id);
    const audit = (await db
      .prepare(
        "SELECT actor_id,represented_id FROM audit_logs WHERE action='Bắt đầu đại diện' AND actor_id=? ORDER BY id DESC LIMIT 1",
      )
      .get(people[actor].id)) as { actor_id: string; represented_id: string };
    assert.equal(audit.represented_id, target.id);
  }
});

test("QA: QC role cannot pack or deliver and wrong-stage inspection changes no quantities", async () => {
  const o = await fixture("may", 5);
  await db
    .prepare("UPDATE order_variants SET cut_qty=5,sewn_qty=5 WHERE order_id=?")
    .run(o.id);
  const before = (await getOrderById(o.id))!;
  for (const action of ["qc", "pack", "deliver"]) {
    const response = await operationRoutes.POST(
      request(`/api/orders/${o.id}/operations`, "qa-qc", {
        version: before.version,
        action,
        color: "Đen",
        size: "M",
        quantity: 1,
        passed: 1,
      }),
      await params("id", o.id),
    );
    assert.equal(response.status, action === "qc" ? 422 : 403);
    assert.deepEqual((await getOrderById(o.id))!.variants, before.variants);
    assert.equal((await getOrderById(o.id))!.version, before.version);
  }
});

test("QA ACL-01: QC cannot move cutting into sewing even when quantities are complete", async () => {
  const o = await fixture("cat", 5);
  await db
    .prepare("UPDATE order_variants SET cut_qty=5 WHERE order_id=?")
    .run(o.id);
  const before = (await getOrderById(o.id))!;
  const response = await detailRoutes.PATCH(
    request(
      `/api/orders/${o.id}`,
      "qa-qc",
      { version: before.version, stage: "may" },
      { method: "PATCH" },
    ),
    await params("id", o.id),
  );
  assert.equal(response.status, 403);
  assert.equal((await getOrderById(o.id))!.current_stage, "cat");
  assert.equal((await getOrderById(o.id))!.version, before.version);
});

test("QA journey: roles execute new multi-variant order through rework, partial delivery and locked wages", async () => {
  const date = "2024-02-01";
  const created = await orderRoutes.POST(
    request("/api/orders", "qa-assistant", {
      customer: "Khách QA",
      product_name: "Áo/quần QA",
      order_date: "2024-01-01",
      deadline: "2027-12-31",
      line_id: 1,
      responsible_id: "QA-worker",
      variants: [
        { color: "Đen", size: "M", quantity: 5 },
        { color: "Trắng", size: "L", quantity: 3 },
      ],
    }),
  );
  assert.equal(created.status, 201);
  const id = (await created.json()).data.id;
  for (const stage of ["Cắt", "May"])
    assert.equal(
      (
        await ratesRoutes.POST(
          request("/api/rates", "qa-assistant", {
            order_id: id,
            stage,
            unit_price: stage === "Cắt" ? 5000 : 12000,
          }),
        )
      ).status,
      200,
    );
  const move = async (stage: string, who = "qa-assistant") =>
    await detailRoutes.PATCH(
      request(
        `/api/orders/${id}`,
        who,
        { version: (await getOrderById(id))!.version, stage },
        { method: "PATCH" },
      ),
      await params("id", id),
    );
  for (const stage of ["kiem_npl", "kiem_rap", "cat"])
    assert.equal((await move(stage)).status, 200);
  const production = async (
    stage: string,
    color: string,
    size: string,
    quantity: number,
    key = randomUUID(),
    version?: number,
  ) =>
    await productionRoutes.POST(
      request(
        "/api/production/log",
        "qa-worker",
        {
          order_id: id,
          employee_id: "QA-worker",
          log_date: date,
          stage,
          color,
          size,
          quantity,
          version: version ?? (await getOrderById(id))!.version,
        },
        { key },
      ),
    );
  assert.equal((await production("Cắt", "Đen", "M", 5)).status, 201);
  assert.equal((await production("Cắt", "Trắng", "L", 3)).status, 201);
  assert.equal((await move("may", "qa-leader")).status, 200);
  assert.equal((await production("May", "Đen", "M", 3)).status, 201);
  const version = (await getOrderById(id))!.version,
    key = randomUUID();
  const retries = await Promise.all([
    await production("May", "Đen", "M", 2, key, version),
    await production("May", "Đen", "M", 2, key, version),
  ]);
  assert.ok(retries.every((r) => r.status === 201));
  assert.equal(
    (await getOrderById(id))!.variants!.find((v) => v.color === "Đen")!
      .sewn_qty,
    5,
  );
  assert.equal((await production("May", "Trắng", "L", 3)).status, 201);
  const stale = await production("May", "Trắng", "L", 1, randomUUID(), version);
  assert.equal(stale.status, 409);
  assert.equal(
    (
      await payrollRoutes.POST(
        request("/api/payroll", "qa-director", { month: "2024-02" }),
      )
    ).status,
    200,
  );
  assert.equal((await move("qc")).status, 200);
  const op = async (
    action: string,
    color: string,
    size: string,
    quantity: number,
    passed?: number,
  ) =>
    await operationRoutes.POST(
      request(
        `/api/orders/${id}/operations`,
        ["qc", "rework", "reinspect"].includes(action)
          ? "qa-qc"
          : "qa-assistant",
        {
          version: (await getOrderById(id))!.version,
          action,
          color,
          size,
          quantity,
          operation_date: date,
          ...(["qc", "reinspect"].includes(action)
            ? {}
            : { worker_id: "QA-worker" }),
          ...(passed !== undefined ? { passed } : {}),
          ...(action === "qc" ? { defect_type: "Lỗi đường may" } : {}),
        },
      ),
      await params("id", id),
    );
  assert.equal((await op("qc", "Đen", "M", 5, 4)).status, 200);
  assert.equal((await op("qc", "Trắng", "L", 3, 3)).status, 200);
  assert.equal((await move("dong_goi", "qa-qc")).status, 422);
  assert.equal((await move("sua_hang", "qa-qc")).status, 200);
  assert.equal((await op("rework", "Đen", "M", 1)).status, 200);
  assert.equal((await move("qc_lai", "qa-qc")).status, 200);
  assert.equal((await op("reinspect", "Đen", "M", 1, 1)).status, 200);
  assert.equal((await move("dong_goi", "qa-qc")).status, 200);
  assert.equal((await op("pack", "Đen", "M", 5)).status, 200);
  assert.equal((await op("pack", "Trắng", "L", 3)).status, 200);
  assert.equal((await move("giao_hang")).status, 200);
  assert.equal((await op("deliver", "Đen", "M", 5)).status, 200);
  assert.equal((await op("deliver", "Trắng", "L", 2)).status, 200);
  assert.equal(
    (await getOrderById(id))!.variants!.find((v) => v.color === "Trắng")!
      .delivered_qty,
    2,
  );
  assert.equal((await move("hoan_thanh")).status, 422);
  assert.equal((await op("deliver", "Trắng", "L", 1)).status, 200);
  assert.equal((await move("hoan_thanh")).status, 200);
  const result = (await getOrderById(id))!;
  assert.equal(result.status, "completed");
  assert.ok(result.variants!.every((v) => v.delivered_qty === v.quantity));
  const logs = (await db
    .prepare("SELECT * FROM production_logs WHERE order_id=?")
    .all(id)) as { quantity: number; total_pay: number; is_locked: number }[];
  assert.equal(logs.length, 5);
  assert.equal(
    logs.reduce((n, r) => n + r.total_pay, 0),
    136000,
  );
  assert.ok(logs.every((r) => r.is_locked === 1));
  const file = await exportRoutes.GET(
    request(
      `/api/export/excel?dataset=payroll&month=2024-02&product=${id}`,
      "qa-worker",
    ),
  );
  assert.equal(file.status, 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  assert.equal(book.getWorksheet("Chi tiết sản lượng")!.rowCount, 6);
});

test("QA restore: full snapshot boots APIs from a separate restored database and preserves images wages and permissions", async () => {
  const backup = await import("../src/lib/server/backup");
  const files = await backup.runBackup();
  const { execFileSync } = await import("node:child_process");
  const sourcePath = join(directory, "backups", files.snapshot);
  await adminPool.query(`CREATE DATABASE "${restoredDatabase}"`);
  const restoredUrl = new URL(testUrl);
  restoredUrl.pathname = "/" + restoredDatabase;
  const restoreEnv = { ...process.env, DATABASE_URL: restoredUrl.toString() };
  execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/restore.ts", sourcePath],
    { env: restoreEnv },
  );
  const restoredPool = new Pool({ connectionString: restoredUrl.toString() });
  const source = await readSnapshot(sourcePath);
  try {
    for (const [name, rows] of Object.entries(source.tables)) {
      const actual = JSON.parse(
        JSON.stringify(
          (await restoredPool.query(`SELECT * FROM "${name}"`)).rows,
        ),
      );
      const normalize = (items: unknown[]) =>
        items
          .map((r) => JSON.stringify(r, Object.keys(r as object).sort()))
          .sort();
      assert.deepEqual(normalize(actual), normalize(rows), name);
    }
    // Sequences are advanced after explicit IDs are restored.
    const added = await restoredPool.query(
      "INSERT INTO audit_logs(user_name,action,details) VALUES ('QA','restore','sequence') RETURNING id",
    );
    assert.ok(
      Number(added.rows[0].id) >
        Math.max(...source.tables.audit_logs.map((r) => Number(r.id))),
    );
  } finally {
    await restoredPool.end();
  }
  const probe = `const {db}=require('./src/lib/db.ts');const orders=require('./src/app/api/orders/route.ts');const payroll=require('./src/app/api/payroll/route.ts');(async()=>{const req=(url)=>new Request('http://localhost:3003'+url,{headers:{cookie:${JSON.stringify(people["qa-worker"].cookie)}}});const a=await orders.GET(req('/api/orders'));const b=await payroll.GET(req('/api/payroll?month=2024-02'));console.log(JSON.stringify({ordersStatus:a.status,orders:(await a.json()).data.orders,payrollStatus:b.status,payroll:(await b.json()).data,migrations:(await db.prepare('SELECT COUNT(*) n FROM schema_migrations').get()).n}));await db.close();})().catch(()=>process.exit(1));`;
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "-e", probe],
    { env: restoreEnv, encoding: "utf8" },
  );
  const data = JSON.parse(output);
  assert.equal(data.ordersStatus, 200);
  assert.equal(data.payrollStatus, 200);
  assert.equal(data.migrations, 10);
  assert.ok(
    data.orders.length > 0 &&
      data.orders.every((o: { line_id: number }) => o.line_id === 1),
  );
  assert.ok(
    data.payroll.logs.every(
      (r: { employee_id: string }) => r.employee_id === "QA-worker",
    ),
  );
  assert.equal(
    data.payroll.logs.reduce(
      (n: number, r: { total_pay: number }) => n + r.total_pay,
      0,
    ),
    136000,
  );
});

test("QA ACL-01 dossier: QC cannot edit a cutting stage dossier", async () => {
  const routes = await import("../src/app/api/orders/[id]/stages/route");
  const o = await fixture("cat", 5);
  const before = await db
    .prepare("SELECT * FROM order_stages WHERE order_id=? ORDER BY id")
    .all(o.id);
  const response = await routes.PATCH(
    request(
      `/api/orders/${o.id}/stages`,
      "qa-qc",
      {
        version: o.version,
        stage: "cat",
        status: "in_progress",
        employee_id: "QA-qc",
        received_qty: 5,
        completed_qty: 0,
        notes: "QC thử sửa bước Cắt",
      },
      { method: "PATCH" },
    ),
    await params("id", o.id),
  );
  assert.equal(response.status, 403);
  assert.deepEqual(
    await db
      .prepare("SELECT * FROM order_stages WHERE order_id=? ORDER BY id")
      .all(o.id),
    before,
  );
});

test("QA personnel: account keeps its own profile when leader transfers and manages existing crew", async () => {
  const employeeId = "QA-TRANSFER-LEADER";
  await db
    .prepare(
      "INSERT INTO employees(id,name,line_id,role) VALUES (?,?,1,'Tổ trưởng')",
    )
    .run(employeeId, "Tổ trưởng điều chuyển");
  people.transferLeader = await person(
    "transfer-leader",
    "leader",
    employeeId,
    [1],
  );
  const id = people.transferLeader.id;
  const beforeWages = await db
    .prepare(
      "SELECT id,employee_id,line_id,total_pay FROM production_logs ORDER BY id",
    )
    .all();
  const crew = (await db
    .prepare("SELECT id FROM employees WHERE line_id=4 ORDER BY id")
    .all()) as { id: string }[];
  const r = await adminRoutes.POST(
    request("/api/admin/users", "admin", {
      id,
      action: "update",
      name: "Tổ trưởng mới của chuyền 4",
      roleIds: ["leader"],
      lineIds: [4],
      homeLineId: 4,
    }),
    await params("section", "users"),
  );
  assert.equal(r.status, 200);
  assert.equal((await auth.account(id))!.employee_id, employeeId);
  assert.deepEqual((await auth.account(id))!.line_ids, [4]);
  assert.deepEqual(
    await db
      .prepare("SELECT name,line_id FROM employees WHERE id=?")
      .get(employeeId),
    { name: "Tổ trưởng mới của chuyền 4", line_id: 4 },
  );
  assert.deepEqual(
    await db
      .prepare("SELECT id FROM employees WHERE line_id=4 AND id<>? ORDER BY id")
      .all(employeeId),
    crew,
  );
  assert.deepEqual(
    await db
      .prepare(
        "SELECT id,employee_id,line_id,total_pay FROM production_logs ORDER BY id",
      )
      .all(),
    beforeWages,
  );
  assert.equal(
    await db.prepare("SELECT 1 FROM sessions WHERE account_id=?").get(id),
    undefined,
  );
  people.transferLeader = await newSession(id);
  const result = await orderRoutes.GET(
    request("/api/orders", "transferLeader"),
  );
  const data = (await result.json()).data;
  assert.ok(
    data.orders.length > 0 &&
      data.orders.every((o: { line_id: number }) => o.line_id === 4),
  );
  assert.ok(
    crew.every((member: { id: string }) =>
      data.employees.some((e: { id: string }) => e.id === member.id),
    ),
  );
  for (const attack of [
    { employeeId: "NV-07" },
    { employeeId: null },
    { createEmployee: true },
  ]) {
    const bad = await adminRoutes.POST(
      request("/api/admin/users", "admin", {
        id,
        action: "update",
        roleIds: ["leader"],
        lineIds: [4],
        homeLineId: 4,
        ...attack,
      }),
      await params("section", "users"),
    );
    assert.equal(bad.status, 422);
    assert.equal((await auth.account(id))!.employee_id, employeeId);
  }
  const invalid = await adminRoutes.POST(
    request("/api/admin/users", "admin", {
      id,
      action: "update",
      roleIds: ["leader"],
      lineIds: [4],
      homeLineId: 1,
    }),
    await params("section", "users"),
  );
  assert.equal(invalid.status, 422);
  assert.equal(
    (
      (await db
        .prepare("SELECT line_id FROM employees WHERE id=?")
        .get(employeeId)) as { line_id: number }
    ).line_id,
    4,
  );
  const audit = (await db
    .prepare(
      "SELECT details FROM audit_logs WHERE action='Điều chỉnh hồ sơ và chuyền' AND details LIKE '%transfer-leader%' ORDER BY id DESC LIMIT 1",
    )
    .get()) as { details: string };
  assert.match(audit.details, /Trước/);
  assert.match(audit.details, /Sau/);
});

test("worker entry availability follows assigned lines and personal production scope", async () => {
  await db
    .prepare("INSERT INTO employees(id,name,line_id,role) VALUES (?,?,1,?)")
    .run("QA-UI-WORKER", "Nhân viên QA giao diện", "Nhân viên");
  const sample = await person("ui-worker", "worker", "QA-UI-WORKER", [1, 4]);
  const user = (await auth.account(sample.id))!;
  const own = { id: "QA-UI-WORKER", line_id: 1 };
  assert.equal(canRecordProduction(user, own, { line_id: 1 }), true);
  assert.equal(canRecordProduction(user, own, { line_id: 4 }), true);
  assert.equal(
    canRecordProduction(user, { id: "NV-08", line_id: 4 }, { line_id: 4 }),
    false,
  );
  const removedScope = { ...user, line_ids: [4] };
  assert.equal(canRecordProduction(removedScope, own, { line_id: 1 }), false);
  const admin = (await auth.account(people.admin.id))!;
  assert.equal(
    canRecordProduction(admin, { id: "NV-08", line_id: 4 }, { line_id: 4 }),
    true,
  );
  assert.equal(canRecordProduction(admin, own, { line_id: 4 }), false);
  assert.equal(
    canRecordProduction(
      admin,
      { ...own, assigned_line_ids: [1, 4] },
      { line_id: 4 },
    ),
    true,
  );
});

test("multi-person work items pay separately and complete garments only after every required part", async () => {
  const order = await fixture("may", 5);
  for (const n of [1, 2, 3]) {
    const employee = `QA-PART-${n}`;
    await db
      .prepare(
        "INSERT INTO employees(id,name,line_id,role) VALUES (?,?,1,'May')",
      )
      .run(employee, employee);
    people[`part${n}`] = await person(`part${n}`, "worker", employee, [1]);
  }
  const plan = {
    order_id: order.id,
    stage: "May",
    version: order.version,
    work_items: [
      { name: "May thân", unit_price: 1000 },
      { name: "May tay", unit_price: 2000 },
      { name: "Ráp áo", unit_price: 3000 },
    ],
  };
  assert.equal(
    (await ratesRoutes.POST(request("/api/rates", "part1", plan))).status,
    403,
  );
  assert.equal(
    (await ratesRoutes.POST(request("/api/rates", "admin", plan))).status,
    200,
  );
  const parts = (await getOrderById(order.id))!.work_items!;
  assert.equal(parts.length, 3);
  assert.equal(
    (await ratesRoutes.POST(request("/api/rates", "admin", plan))).status,
    409,
  );
  const record = async (
    who: string,
    index: number,
    quantity: number,
    extra: object = {},
  ) =>
    await productionRoutes.POST(
      request("/api/production/log", who, {
        log_date: "2023-07-01",
        employee_id: `QA-PART-${who.slice(-1)}`,
        order_id: order.id,
        color: "Đen",
        size: "M",
        stage: "May",
        work_item_id: parts[index].id,
        quantity,
        version: (await getOrderById(order.id))!.version,
        ...extra,
      }),
    );
  assert.equal((await record("part1", 0, 5)).status, 201);
  assert.equal((await getOrderById(order.id))!.variants![0].sewn_qty, 0);
  assert.equal((await record("part2", 1, 2)).status, 201);
  assert.equal((await record("part1", 1, 3)).status, 201);
  assert.equal((await getOrderById(order.id))!.variants![0].sewn_qty, 0);
  assert.equal((await record("part3", 2, 3)).status, 201);
  assert.equal((await getOrderById(order.id))!.variants![0].sewn_qty, 3);
  assert.equal(
    (
      await detailRoutes.PATCH(
        request(
          `/api/orders/${order.id}`,
          "admin",
          { version: (await getOrderById(order.id))!.version, stage: "qc" },
          { method: "PATCH" },
        ),
        await params("id", order.id),
      )
    ).status,
    422,
  );
  assert.equal((await record("part2", 0, 1)).status, 422);
  assert.equal(
    (await record("part2", 0, 1, { work_item_id: undefined })).status,
    422,
  );
  assert.equal(
    (await record("part2", 0, 1, { work_item_id: 999999 })).status,
    422,
  );
  assert.equal((await record("part2", 0, 1, { unit_price: 1 })).status, 422);
  const started = { ...plan, version: (await getOrderById(order.id))!.version };
  assert.equal(
    (await ratesRoutes.POST(request("/api/rates", "admin", started))).status,
    422,
  );
  const old = (await db
    .prepare(
      "SELECT * FROM production_logs WHERE order_id=? AND work_item_id=?",
    )
    .get(order.id, parts[2].id)) as {
    id: number;
    unit_price: number;
    version: number;
    quantity: number;
  };
  assert.equal(
    (
      await ratesRoutes.POST(
        request("/api/rates", "admin", {
          order_id: order.id,
          stage: "May",
          work_item_id: parts[2].id,
          unit_price: 4000,
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      (await db
        .prepare("SELECT unit_price FROM production_logs WHERE id=?")
        .get(old.id)) as { unit_price: number }
    ).unit_price,
    3000,
  );
  assert.equal(
    (
      await productionRoutes.PATCH(
        request(
          "/api/production/log",
          "admin",
          {
            log_id: old.id,
            version: old.version,
            quantity: 2,
            unit_price: 3000,
            reason: "Điều chỉnh phần ráp áo báo nhầm",
          },
          { method: "PATCH" },
        ),
      )
    ).status,
    200,
  );
  assert.equal((await getOrderById(order.id))!.variants![0].sewn_qty, 2);
  assert.equal((await record("part3", 2, 3)).status, 201);
  assert.equal((await getOrderById(order.id))!.variants![0].sewn_qty, 5);
  const totals = (await db
    .prepare(
      "SELECT SUM(quantity) work,SUM(completed_quantity) garments,SUM(total_pay) pay FROM production_logs WHERE order_id=?",
    )
    .get(order.id)) as { work: number; garments: number; pay: number };
  assert.deepEqual(totals, { work: 15, garments: 5, pay: 33000 });
  const response = await productionRoutes.GET(
    request("/api/production/log?month=2023-07", "part2"),
  );
  const logs = (await response.json()).data.logs;
  assert.equal(logs.length, 1);
  assert.equal(logs[0].work_item_name, "May tay");
  assert.equal(logs[0].total_pay, 4000);
  const excel = await exportRoutes.GET(
    request("/api/export/excel?dataset=production&month=2023-07", "part2"),
  );
  assert.equal(excel.status, 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await excel.arrayBuffer()) as never);
  assert.equal(
    book.getWorksheet("Chi tiết sản lượng")!.getCell("M2").value,
    "May tay",
  );
  await db
    .prepare(
      "UPDATE order_variants SET qc_inspected_qty=5,qc_passed_qty=5 WHERE order_id=?",
    )
    .run(order.id);
  const correction = (await db
    .prepare("SELECT version FROM production_logs WHERE id=?")
    .get(old.id)) as { version: number };
  assert.equal(
    (
      await productionRoutes.PATCH(
        request(
          "/api/production/log",
          "admin",
          {
            log_id: old.id,
            version: correction.version,
            quantity: 1,
            unit_price: 3000,
            reason: "Không được giảm dưới số đã QC",
          },
          { method: "PATCH" },
        ),
      )
    ).status,
    422,
  );
  assert.equal((await getOrderById(order.id))!.variants![0].sewn_qty, 5);
});

test("cutting work items enforce per-part input, duplicate protection, locked month and downstream bounds", async () => {
  const order = await fixture("cat", 4);
  const plan = {
    order_id: order.id,
    stage: "Cắt",
    version: order.version,
    work_items: [
      { name: "Cắt thân", unit_price: 100 },
      { name: "Cắt tay", unit_price: 200 },
    ],
  };
  assert.equal(
    (
      await ratesRoutes.POST(
        request("/api/rates", "admin", {
          ...plan,
          work_items: [
            { name: "Cắt thân", unit_price: 100 },
            { name: "cắt thân", unit_price: 200 },
          ],
        }),
      )
    ).status,
    422,
  );
  assert.equal(
    (await ratesRoutes.POST(request("/api/rates", "admin", plan))).status,
    200,
  );
  const parts = (await getOrderById(order.id))!.work_items!;
  const payload = {
    log_date: "2023-08-01",
    employee_id: "QA-PART-1",
    order_id: order.id,
    color: "Đen",
    size: "M",
    stage: "Cắt",
    quantity: 4,
    work_item_id: parts[0].id,
    version: (await getOrderById(order.id))!.version,
  };
  const key = randomUUID();
  const replies = await Promise.all([
    await productionRoutes.POST(
      request("/api/production/log", "part1", payload, { key }),
    ),
    await productionRoutes.POST(
      request("/api/production/log", "part1", payload, { key }),
    ),
  ]);
  assert.deepEqual(
    replies.map((r) => r.status),
    [201, 201],
  );
  assert.equal(
    (
      (await db
        .prepare("SELECT COUNT(*) n FROM production_logs WHERE order_id=?")
        .get(order.id)) as { n: number }
    ).n,
    1,
  );
  assert.equal((await getOrderById(order.id))!.variants![0].cut_qty, 0);
  assert.equal(
    (
      await productionRoutes.POST(
        request("/api/production/log", "part1", payload),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await productionRoutes.POST(
        request("/api/production/log", "part1", {
          ...payload,
          work_item_id: parts[1].id,
          quantity: 5,
          version: (await getOrderById(order.id))!.version,
        }),
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await payrollRoutes.POST(
        request("/api/payroll", "admin", { month: "2023-08" }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await productionRoutes.POST(
        request("/api/production/log", "part1", {
          ...payload,
          work_item_id: parts[1].id,
          version: (await getOrderById(order.id))!.version,
        }),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await productionRoutes.POST(
        request("/api/production/log", "part1", {
          ...payload,
          work_item_id: parts[1].id,
          log_date: "2023-09-01",
          version: (await getOrderById(order.id))!.version,
        }),
      )
    ).status,
    201,
  );
  assert.equal((await getOrderById(order.id))!.variants![0].cut_qty, 4);
  assert.equal(
    (
      await detailRoutes.PATCH(
        request(
          `/api/orders/${order.id}`,
          "admin",
          { version: (await getOrderById(order.id))!.version, stage: "may" },
          { method: "PATCH" },
        ),
        await params("id", order.id),
      )
    ).status,
    200,
  );
});

test("work item plans and personal work records survive full snapshots and dated archives", async () => {
  const backup = await import("../src/lib/server/backup");
  await backup.configureBackup({
    enabled: false,
    intervalHours: 24,
    windowDays: 3650,
  });
  const files = await backup.runBackup();
  const { gunzipSync } = await import("node:zlib");
  const archive = JSON.parse(
    gunzipSync((await backup.readBackup(files.archive))!).toString(),
  );
  assert.ok(archive.workItems.length >= 5);
  assert.ok(
    archive.production.some(
      (p: { work_item_name?: string }) => p.work_item_name === "May thân",
    ),
  );
  const restored = await readSnapshot(
    join(directory, "backups", files.snapshot),
  );
  const normalize = (rows: unknown[]) => JSON.parse(JSON.stringify(rows));
  assert.deepEqual(
    restored.tables.order_work_items.sort(
      (a, b) => Number(a.id) - Number(b.id),
    ),
    normalize(
      await db.prepare("SELECT * FROM order_work_items ORDER BY id").all(),
    ),
  );
  assert.deepEqual(
    restored.tables.production_logs
      .filter((r) => r.work_item_id !== null)
      .sort((a, b) => Number(a.id) - Number(b.id)),
    normalize(
      await db
        .prepare(
          "SELECT * FROM production_logs WHERE work_item_id IS NOT NULL ORDER BY id",
        )
        .all(),
    ),
  );
});

test("employees support assigned lines using their own identity and the order line in reports", async () => {
  const employee = "QA-SUPPORT";
  await db
    .prepare("INSERT INTO employees(id,name,line_id,role) VALUES (?,?,1,'May')")
    .run(employee, "Nhân viên hỗ trợ");
  people.support = await person("support-worker", "worker", employee, [1, 4]);
  people.supportLeader = await person("support-leader", "leader", null, [4]);
  const order = await fixture("cat", 5);
  await db.prepare("UPDATE orders SET line_id=4 WHERE id=?").run(order.id);
  const input = {
    order_id: order.id,
    employee_id: employee,
    stage: "Cắt",
    color: "Đen",
    size: "M",
    quantity: 2,
    log_date: "2023-10-01",
    version: (await getOrderById(order.id))!.version,
  };
  const response = await productionRoutes.POST(
    request("/api/production/log", "support", input),
  );
  assert.equal(response.status, 201);
  const result = (await response.json()).data;
  assert.equal(result.employee_id, employee);
  assert.equal(result.line_id, 4);
  assert.equal(result.total_pay, 10000);
  assert.equal(
    (
      (await db
        .prepare("SELECT line_id FROM employees WHERE id=?")
        .get(employee)) as {
        line_id: number;
      }
    ).line_id,
    1,
  );
  const other = await fixture("cat", 3);
  assert.equal(
    (
      await productionRoutes.POST(
        request("/api/production/log", "support", {
          ...input,
          order_id: other.id,
          quantity: 1,
          version: other.version,
        }),
      )
    ).status,
    201,
  );
  const pay = (
    await (
      await payrollRoutes.GET(request("/api/payroll?month=2023-10", "support"))
    ).json()
  ).data;
  assert.deepEqual(
    pay.summary.map((s: { line_id: number }) => s.line_id).sort(),
    [1, 4],
  );
  assert.equal(
    pay.summary.reduce(
      (n: number, s: { total_salary: number }) => n + s.total_salary,
      0,
    ),
    15000,
  );
  const listed = (
    await (
      await orderRoutes.GET(request("/api/orders", "supportLeader"))
    ).json()
  ).data;
  const listedEmployee = listed.employees.find(
    (e: { id: string }) => e.id === employee,
  );
  assert.ok(listedEmployee);
  assert.equal(
    canRecordProduction(
      (await auth.account(people.supportLeader.id))!,
      listedEmployee,
      {
        line_id: 4,
      },
    ),
    true,
  );
  const leaderLogs = (
    await (
      await productionRoutes.GET(
        request("/api/production/log?month=2023-10", "supportLeader"),
      )
    ).json()
  ).data.logs;
  assert.equal(leaderLogs.length, 1);
  assert.equal(leaderLogs[0].line_id, 4);
  assert.equal(
    (
      await productionRoutes.POST(
        request("/api/production/log", "support", {
          ...input,
          employee_id: "NV-08",
          version: (await getOrderById(order.id))!.version,
        }),
      )
    ).status,
    403,
  );
  const outside = await fixture("cat", 3);
  await db.prepare("UPDATE orders SET line_id=2 WHERE id=?").run(outside.id);
  assert.equal(
    (
      await productionRoutes.POST(
        request("/api/production/log", "support", {
          ...input,
          order_id: outside.id,
          version: outside.version,
        }),
      )
    ).status,
    403,
  );
  await db
    .prepare("UPDATE accounts SET line_ids='[1]' WHERE id=?")
    .run(people.support.id);
  assert.equal(
    (
      await productionRoutes.POST(
        request("/api/production/log", "support", {
          ...input,
          version: (await getOrderById(order.id))!.version,
        }),
      )
    ).status,
    403,
  );
  assert.equal((await getOrderById(order.id))!.variants![0].cut_qty, 2);
});

test("global QC opens an actionable form and records inspection across home lines including representation", async () => {
  const employee = "QA-QC-GLOBAL";
  await db
    .prepare("INSERT INTO employees(id,name,line_id,role) VALUES (?,?,1,'QC')")
    .run(employee, "QC toàn xưởng");
  people.globalQc = await person("global-qc-ui", "qc", employee, [1]);
  const order = await fixture("qc", 3);
  await db.prepare("UPDATE orders SET line_id=4 WHERE id=?").run(order.id);
  await db
    .prepare("UPDATE order_variants SET sewn_qty=3 WHERE order_id=?")
    .run(order.id);
  const { availableOperations, remainingOperation } =
    await import("../src/lib/workflow");
  const session = auth.sessionData(await context("globalQc"));
  const current = (await getOrderById(order.id))!;
  assert.equal(availableOperations(session.user, current)[0].key, "qc");
  assert.equal(remainingOperation(current.variants![0], "qc"), 3);
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { OrderDetail } = await import("../src/components/ProductionForms");
  const render = (o: typeof current) =>
    renderToStaticMarkup(
      React.createElement(OrderDetail, {
        order: o,
        session,
        api: async () => {
          throw new Error("UI test must not send requests");
        },
        lines: [],
        employees: [],
        onChanged: async () => {},
      }),
    );
  const html = render(current);
  assert.match(html, /Lưu kết quả QC/);
  assert.doesNotMatch(html, /name="worker_id"/);
  assert.match(html, /Người kiểm QC/);
  assert.match(html, /Còn chờ xử lý/);
  assert.doesNotMatch(html, /<ol class="timeline"/);
  const input = {
    version: current.version,
    action: "qc",
    color: "Đen",
    size: "M",
    quantity: 2,
    passed: 1,
    worker_id: employee,
  };
  for (const action of ["qc", "reinspect"]) {
    await db
      .prepare("UPDATE orders SET current_stage=? WHERE id=?")
      .run(action === "qc" ? "qc" : "qc_lai", order.id);
    const before = (await getOrderById(order.id))!;
    assert.equal(
      (
        await operationRoutes.POST(
          request(`/api/orders/${order.id}/operations`, "globalQc", {
            ...input,
            action,
            worker_id: "NV-08",
          }),
          await params("id", order.id),
        )
      ).status,
      403,
    );
    assert.deepEqual((await getOrderById(order.id))!.variants, before.variants);
  }
  await db
    .prepare("UPDATE orders SET current_stage='qc' WHERE id=?")
    .run(order.id);
  assert.equal(
    (
      await operationRoutes.POST(
        request(`/api/orders/${order.id}/operations`, "globalQc", input),
        await params("id", order.id),
      )
    ).status,
    200,
  );
  const partly = (await getOrderById(order.id))!;
  assert.equal(remainingOperation(partly.variants![0], "qc"), 1);
  assert.equal(
    (
      await operationRoutes.POST(
        request(`/api/orders/${order.id}/operations`, "globalQc", {
          ...input,
          version: partly.version,
          quantity: 2,
          passed: 2,
        }),
        await params("id", order.id),
      )
    ).status,
    422,
  );
  people.qcUiAdmin = await person("qc-ui-admin", "admin", null, []);
  assert.equal(
    (
      await authRoutes.POST(
        request("/api/auth/represent", "qcUiAdmin", {
          accountId: people.globalQc.id,
          password: testPassword,
        }),
        await params("action", "represent"),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await operationRoutes.POST(
        request(`/api/orders/${order.id}/operations`, "qcUiAdmin", {
          ...input,
          version: partly.version,
          quantity: 1,
          passed: 1,
        }),
        await params("id", order.id),
      )
    ).status,
    200,
  );
  const record = (await db
    .prepare(
      "SELECT actor_id,represented_id,worker_id FROM operation_records WHERE order_id=? ORDER BY id DESC LIMIT 1",
    )
    .get(order.id)) as {
    actor_id: string;
    represented_id: string;
    worker_id: string;
  };
  assert.deepEqual(record, {
    actor_id: people.qcUiAdmin.id,
    represented_id: people.globalQc.id,
    worker_id: employee,
  });
  const inspector = (await db
    .prepare(
      "SELECT inspector FROM qc_records WHERE order_id=? ORDER BY id DESC LIMIT 1",
    )
    .get(order.id)) as { inspector: string };
  assert.equal(inspector.inspector, session.user.name);
  const done = (await getOrderById(order.id))!;
  assert.equal(remainingOperation(done.variants![0], "qc"), 0);
  const doneHtml = render(done);
  assert.match(doneHtml, /Màu–size này đã xử lý đủ/);
  const submit = doneHtml.match(/<button[^>]*>Lưu kết quả QC<\/button>/)?.[0];
  assert.ok(submit);
  assert.match(submit, /disabled/);
  assert.deepEqual(
    availableOperations(session.user, { ...done, current_stage: "may" }),
    [],
  );
  assert.deepEqual(
    availableOperations(session.user, { ...done, current_stage: "dong_goi" }),
    [],
  );
  assert.equal(
    (
      await operationRoutes.POST(
        request(`/api/orders/${order.id}/operations`, "qcUiAdmin", {
          ...input,
          version: done.version,
          action: "pack",
          quantity: 1,
          passed: 1,
        }),
        await params("id", order.id),
      )
    ).status,
    403,
  );
});

test("QC fully passed: director moves directly to packing and repair explains the optional branch", async () => {
  const order = await fixture("qc", 3);
  await db
    .prepare(
      "UPDATE order_variants SET sewn_qty=3,qc_inspected_qty=3,qc_passed_qty=3,defect_qty=0 WHERE order_id=?",
    )
    .run(order.id);
  const before = (await getOrderById(order.id))!;
  const move = async (stage: string) =>
    await detailRoutes.PATCH(
      request(
        `/api/orders/${order.id}`,
        "qa-director",
        { version: before.version, stage },
        { method: "PATCH" },
      ),
      await params("id", order.id),
    );
  const repair = await move("sua_hang");
  assert.equal(repair.status, 422);
  assert.match(
    JSON.stringify(await repair.json()),
    /Hãy chuyển thẳng sang Đóng gói/,
  );
  assert.equal((await getOrderById(order.id))!.version, before.version);
  const packing = await move("dong_goi");
  assert.equal(packing.status, 200);
  assert.equal((await getOrderById(order.id))!.current_stage, "dong_goi");
  assert.deepEqual((await getOrderById(order.id))!.variants, before.variants);
});

test("Packing wages explain missing physical confirmation and prevent double payment", async () => {
  const order = await fixture("dong_goi", 3);
  await db
    .prepare("INSERT INTO order_rates VALUES (?,?,?)")
    .run(order.id, "Đóng gói", 200000);
  const input = {
    order_id: order.id,
    employee_id: "TEST-W1",
    log_date: "2022-05-01",
    color: "Đen",
    size: "M",
    stage: "Đóng gói",
    quantity: 3,
    version: order.version,
  };
  const post = async () =>
    await productionRoutes.POST(
      request("/api/production/log", "worker", {
        ...input,
        version: (await getOrderById(order.id))!.version,
      }),
    );
  const blocked = await post();
  assert.equal(blocked.status, 422);
  assert.match(
    JSON.stringify(await blocked.json()),
    /Đã xác nhận đóng gói 0, đã ghi công 0/,
  );
  assert.equal((await getOrderById(order.id))!.version, order.version);
  await db
    .prepare("UPDATE order_variants SET packed_qty=3 WHERE order_id=?")
    .run(order.id);
  assert.equal((await post()).status, 201);
  const duplicate = await post();
  assert.equal(duplicate.status, 422);
  assert.match(
    JSON.stringify(await duplicate.json()),
    /còn 0 sản phẩm có thể ghi công/,
  );
});

test("Employees pack and earn once atomically, sharing a batch without exceeding QC", async () => {
  await db
    .prepare(
      "INSERT INTO employees(id,name,line_id,role,phone) VALUES ('PACK-OUT','Outside',2,'May','')",
    )
    .run();
  people.packOutside = await person("packOutside", "worker", "PACK-OUT", [2]);
  const order = await fixture("dong_goi", 3);
  await db
    .prepare("UPDATE orders SET order_date=? WHERE id=?")
    .run("2022-06-01", order.id);
  await db
    .prepare(
      "UPDATE order_variants SET sewn_qty=3,qc_inspected_qty=3,qc_passed_qty=3 WHERE order_id=?",
    )
    .run(order.id);
  await db
    .prepare("INSERT INTO order_rates VALUES (?,?,?)")
    .run(order.id, "Đóng gói", 200000);
  await db
    .prepare(
      "INSERT INTO employees(id,name,line_id,role,phone) VALUES ('PACK-W2','Packer B',1,'Đóng gói','')",
    )
    .run();
  people.packerB = await person("packerB", "worker", "PACK-W2", [1]);
  const makeInput = async (employee: string, qty: number) => ({
    order_id: order.id,
    employee_id: employee,
    log_date: "2022-06-15",
    color: "Đen",
    size: "M",
    stage: "Đóng gói",
    quantity: qty,
    version: (await getOrderById(order.id))!.version,
    record_packing: true,
  });
  const input = await makeInput("TEST-W1", 2);
  const key = randomUUID();
  const send = async () =>
    await productionRoutes.POST(
      request("/api/production/log", "worker", input, { key }),
    );
  assert.equal((await send()).status, 201);
  assert.equal((await send()).status, 201);
  assert.equal((await getOrderById(order.id))!.variants![0].packed_qty, 2);
  assert.equal(
    (
      await productionRoutes.POST(
        request(
          "/api/production/log",
          "packerB",
          await makeInput("PACK-W2", 2),
        ),
      )
    ).status,
    422,
  );
  assert.equal((await getOrderById(order.id))!.variants![0].packed_qty, 2);
  assert.equal(
    (
      await productionRoutes.POST(
        request(
          "/api/production/log",
          "packerB",
          await makeInput("PACK-W2", 1),
        ),
      )
    ).status,
    201,
  );
  assert.equal((await getOrderById(order.id))!.variants![0].packed_qty, 3);
  assert.deepEqual(
    await db
      .prepare(
        "SELECT COUNT(*) n,SUM(quantity) qty,SUM(total_pay) pay FROM production_logs WHERE order_id=?",
      )
      .get(order.id),
    { n: 2, qty: 3, pay: 600000 },
  );
  assert.deepEqual(
    await db
      .prepare(
        "SELECT COUNT(*) n,SUM(quantity) qty FROM operation_records WHERE order_id=? AND action='pack'",
      )
      .get(order.id),
    { n: 2, qty: 3 },
  );
  assert.equal(
    (
      await productionRoutes.POST(
        request(
          "/api/production/log",
          "packOutside",
          await makeInput("PACK-OUT", 1),
        ),
      )
    ).status,
    403,
  );
  const stale = await productionRoutes.POST(
    request("/api/production/log", "worker", input),
  );
  assert.equal(stale.status, 409);
  const notReady = await fixture("qc", 1);
  await db
    .prepare("INSERT INTO order_rates VALUES (?,?,?)")
    .run(notReady.id, "Đóng gói", 200000);
  assert.equal(
    (
      await productionRoutes.POST(
        request("/api/production/log", "worker", {
          ...input,
          order_id: notReady.id,
          version: notReady.version,
          quantity: 1,
        }),
      )
    ).status,
    422,
  );
  assert.equal((await getOrderById(notReady.id))!.variants![0].packed_qty, 0);
});

test("Assigned delivery employee records own partial shipments without management rights", async () => {
  await db
    .prepare(
      "INSERT INTO employees(id,name,line_id,role,phone) VALUES ('SHIP-W','Shipper',1,'Giao hàng','')",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO roles(id,name,position) VALUES ('ship-only','Giao hàng test',11)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO role_grants VALUES ('ship-only','delivery.record','lines')",
    )
    .run();
  people.shipper = await person("shipper", "ship-only", "SHIP-W", [1]);
  const order = await fixture("giao_hang", 3);
  await db
    .prepare(
      "UPDATE order_variants SET qc_passed_qty=3,packed_qty=3 WHERE order_id=?",
    )
    .run(order.id);
  const input = {
    version: order.version,
    color: "Đen",
    size: "M",
    action: "deliver",
    quantity: 2,
    operation_date: "2026-01-15",
    notes: "Giao đợt 1",
  };
  const send = async (who: string, data: unknown, key?: string) =>
    await operationRoutes.POST(
      request(`/api/orders/${order.id}/operations`, who, data, { key }),
      await params("id", order.id),
    );
  assert.equal((await send("worker", input)).status, 403);
  assert.equal(
    (await send("shipper", { ...input, worker_id: "TEST-W1" })).status,
    403,
  );
  const key = randomUUID();
  assert.equal((await send("shipper", input, key)).status, 200);
  assert.equal((await send("shipper", input, key)).status, 200);
  assert.equal((await getOrderById(order.id))!.variants![0].delivered_qty, 2);
  const next = { ...input, version: (await getOrderById(order.id))!.version };
  assert.equal((await send("shipper", next)).status, 422);
  assert.equal((await send("shipper", { ...next, quantity: 1 })).status, 200);
  assert.equal((await getOrderById(order.id))!.variants![0].delivered_qty, 3);
  assert.equal((await getOrderById(order.id))!.current_stage, "giao_hang");
  assert.deepEqual(
    await db
      .prepare(
        "SELECT COUNT(*) n,SUM(quantity) qty FROM operation_records WHERE order_id=? AND worker_id='SHIP-W'",
      )
      .get(order.id),
    { n: 2, qty: 3 },
  );
  assert.equal(
    (
      (await db
        .prepare("SELECT COUNT(*) n FROM production_logs WHERE order_id=?")
        .get(order.id)) as { n: number }
    ).n,
    0,
  );
  const fresh = {
    ...input,
    version: (await getOrderById(order.id))!.version,
    quantity: 1,
  };
  assert.equal(
    (await send("shipper", { ...fresh, action: "pack" })).status,
    403,
  );
  await db
    .prepare("UPDATE accounts SET line_ids='[2]' WHERE id=?")
    .run(people.shipper.id);
  assert.equal((await send("shipper", fresh)).status, 403);
});

test("Large order lists render bounded rows with stage actions and line pagination", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { OrderWorkspace } = await import("../src/components/OrderWorkspace");
  const { LinesPanel } = await import("../src/components/RequirementPanels");
  const { OperationsPanel } = await import("../src/components/RecordsPanel");
  const base = await fixture("qc", 3);
  const orders = Array.from({ length: 120 }, (_, i) => ({
    ...base,
    id: `UX-${String(i + 1).padStart(3, "0")}`,
  }));
  const session = auth.sessionData(await context("admin"));
  const noop = () => {};
  const html = renderToStaticMarkup(
    React.createElement(OrderWorkspace, {
      orders,
      lines: [],
      session,
      api: async () => {
        throw Error("No requests in render test");
      },
      onOpen: noop,
      onCreate: noop,
      onChanged: async () => {},
    }),
  );
  assert.match(html, /Chuyển bước UX-001/);
  assert.match(html, /UX-025/);
  assert.doesNotMatch(html, /UX-026/);
  assert.match(html, /Trang 1\/5/);
  const { getLines } = await import("../src/lib/db");
  const linesHtml = renderToStaticMarkup(
    React.createElement(LinesPanel, {
      orders,
      lines: await getLines(),
      onOpen: noop,
    }),
  );
  assert.match(linesHtml, /UX-025/);
  assert.doesNotMatch(linesHtml, /UX-026/);
  assert.match(linesHtml, /Trang 1\/5/);
  const qcHtml = renderToStaticMarkup(
    React.createElement(OperationsPanel, {
      orders,
      mode: "qc",
      session,
      onOpen: noop,
    }),
  );
  assert.match(qcHtml, /UX-012/);
  assert.doesNotMatch(qcHtml, /UX-013/);
  assert.match(qcHtml, /Trang 1\/10/);
});

test("UX USE-22: missing rate blocks production with an actionable explanation", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ProductionForm } = await import("../src/components/ProductionForms");
  const { getEmployees } = await import("../src/lib/db");
  const order = await fixture("may", 3);
  const html = renderToStaticMarkup(
    React.createElement(ProductionForm, {
      orders: [order],
      employees: await getEmployees(),
      rates: [],
      session: auth.sessionData(await context("worker")),
      api: async () => {
        throw Error("Must not submit");
      },
      onSaved: async () => {},
    }),
  );
  const button = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0];
  assert.ok(button);
  assert.match(button, /disabled/);
  assert.match(html, /Đơn giá/);
  assert.match(html, /quản lý/);
});

test("UX USE-04: view changes still work when browser storage is denied or full", async () => {
  const { createViewPreference } = await import("../src/lib/view-preference");
  const denied = createViewPreference(() => {
    throw Error("SecurityError");
  });
  assert.equal(denied.read(), "list");
  denied.save("board");
  assert.equal(denied.read(), "board");
  denied.save("list");
  assert.equal(denied.read(), "list");
  const full = createViewPreference(() => ({
    getItem: () => "list",
    setItem: () => {
      throw Error("QuotaExceededError");
    },
  }));
  full.save("board");
  assert.equal(full.read(), "board");
  const values = new Map<string, string>();
  const storage = () => ({
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  });
  createViewPreference(storage).save("board");
  assert.equal(createViewPreference(storage).read(), "board");
  values.set("luuta-orders-view", "invalid");
  assert.equal(createViewPreference(storage).read(), "list");
});

test("UX USE-22: zero rates and hidden monetary permissions do not block valid work", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ProductionForm } = await import("../src/components/ProductionForms");
  const { getEmployees } = await import("../src/lib/db");
  const order = await fixture("may", 3);
  const session = auth.sessionData(await context("worker"));
  const render = async (
    o: typeof order,
    rates: Array<{ order_id: string; stage: string; unit_price: number }>,
    who = session,
  ) =>
    renderToStaticMarkup(
      React.createElement(ProductionForm, {
        orders: [o],
        employees: await getEmployees(),
        rates,
        session: who,
        api: async () => {
          throw Error("No submit");
        },
        onSaved: async () => {},
      }),
    );
  const submit = (html: string) =>
    html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] || "";
  assert.doesNotMatch(
    submit(
      await render(order, [
        { order_id: order.id, stage: "May", unit_price: 0 },
      ]),
    ),
    /disabled/,
  );
  const hidden = {
    ...session,
    user: {
      ...session.user,
      roles: session.user.roles.map((r) => ({
        ...r,
        grants: r.grants.filter(
          (g) => !["payroll.view", "rates.manage"].includes(g.permission),
        ),
      })),
    },
  };
  assert.doesNotMatch(submit(await render(order, [], hidden)), /disabled/);
  const wrong = await render({ ...order, current_stage: "nhan_don" }, [
    { order_id: order.id, stage: "Cắt", unit_price: 5000 },
  ]);
  assert.match(submit(wrong), /disabled/);
  assert.match(wrong, /Đơn chưa ở bước Cắt/);
});

test("UX USE-24: client retries network failure with the same key and clears validation failures", async () => {
  const { apiFor } = await import("../src/lib/client");
  const original = globalThis.fetch;
  const keys: string[] = [];
  let calls = 0;
  try {
    globalThis.fetch = (async (_url, options) => {
      keys.push(new Headers(options?.headers).get("idempotency-key")!);
      calls++;
      if (calls === 1) throw Error("Simulated lost response");
      return new Response(JSON.stringify({ data: { saved: true } }), {
        status: 200,
      });
    }) as typeof fetch;
    const api = apiFor(auth.sessionData(await context("worker")), () => {});
    await assert.rejects(api("/api/production/log", { qaRetry: 1 }));
    await api("/api/production/log", { qaRetry: 1 });
    assert.equal(keys[0], keys[1]);
    globalThis.fetch = (async (_url, options) => {
      keys.push(new Headers(options?.headers).get("idempotency-key")!);
      return new Response(JSON.stringify({ error: "Invalid quantity" }), {
        status: 422,
      });
    }) as typeof fetch;
    await assert.rejects(api("/api/production/log", { qaRetry: 2 }));
    await assert.rejects(api("/api/production/log", { qaRetry: 2 }));
    assert.notEqual(keys[2], keys[3]);
  } finally {
    globalThis.fetch = original;
  }
});

test("UX USE-31: locked month saves packing with pending wages and no change to locked payroll", async () => {
  const order = await fixture("dong_goi", 3);
  await db
    .prepare("UPDATE orders SET order_date='2021-01-01' WHERE id=?")
    .run(order.id);
  await db
    .prepare("UPDATE order_variants SET qc_passed_qty=3 WHERE order_id=?")
    .run(order.id);
  await db
    .prepare("INSERT INTO order_rates VALUES (?,?,?)")
    .run(order.id, "Đóng gói", 200000);
  const lock = await payrollRoutes.POST(
    request("/api/payroll", "qa-director", { month: "2021-01" }),
  );
  assert.equal(lock.status, 200);
  const response = await productionRoutes.POST(
    request("/api/production/log", "worker", {
      order_id: order.id,
      version: order.version,
      employee_id: "TEST-W1",
      log_date: "2021-01-15",
      color: "Đen",
      size: "M",
      stage: "Đóng gói",
      quantity: 1,
      record_packing: true,
    }),
  );
  assert.equal(response.status, 201);
  assert.equal((await response.json()).data.pay_status, "pending");
  const physicalOnly = await operationRoutes.POST(
    request(`/api/orders/${order.id}/operations`, "worker", {
      version: (await getOrderById(order.id))!.version,
      color: "Đen",
      size: "M",
      action: "pack",
      quantity: 1,
      operation_date: "2021-01-15",
    }),
    await params("id", order.id),
  );
  assert.equal(physicalOnly.status, 403);

  assert.equal((await getOrderById(order.id))!.variants![0].packed_qty, 1);
  assert.equal(
    (
      (await db
        .prepare("SELECT COUNT(*) n FROM operation_records WHERE order_id=?")
        .get(order.id)) as { n: number }
    ).n,
    1,
  );
  assert.equal(
    (
      (await db
        .prepare("SELECT COUNT(*) n FROM production_logs WHERE order_id=?")
        .get(order.id)) as { n: number }
    ).n,
    0,
  );
});

test("Pending packing reserves quantities and settles once into an explicitly selected open period", async () => {
  const pendingRoutes = await import("../src/app/api/production/pending/route");
  const order = await fixture("dong_goi", 3);
  await db
    .prepare("UPDATE orders SET order_date='2021-01-01' WHERE id=?")
    .run(order.id);
  await db
    .prepare("UPDATE order_variants SET qc_passed_qty=3 WHERE order_id=?")
    .run(order.id);
  await db
    .prepare("INSERT INTO order_rates VALUES (?,?,?)")
    .run(order.id, "Đóng gói", 200000);
  const input = {
    order_id: order.id,
    version: order.version,
    employee_id: "TEST-W1",
    log_date: "2021-01-20",
    color: "Đen",
    size: "M",
    stage: "Đóng gói",
    quantity: 2,
    record_packing: true,
  };
  const key = randomUUID();
  const record = async () =>
    await productionRoutes.POST(
      request("/api/production/log", "worker", input, { key }),
    );
  const first = await record();
  assert.equal(first.status, 201);
  const pendingId = (await first.json()).data.pending_id;
  assert.equal((await record()).status, 201);
  assert.equal((await getOrderById(order.id))!.variants![0].packed_qty, 2);
  assert.equal(
    (
      (await db
        .prepare("SELECT COUNT(*) n FROM pending_packing_pay WHERE order_id=?")
        .get(order.id)) as { n: number }
    ).n,
    1,
  );
  const wagesOnly = await productionRoutes.POST(
    request("/api/production/log", "worker", {
      ...input,
      version: (await getOrderById(order.id))!.version,
      record_packing: false,
      log_date: "2021-02-01",
    }),
  );
  assert.equal(wagesOnly.status, 422);
  const own = await pendingRoutes.GET(
    request("/api/production/pending", "worker"),
  );
  assert.equal(own.status, 200);
  assert.ok(
    (await own.json()).data.some((p: { id: number }) => p.id === pendingId),
  );
  const outside = await pendingRoutes.GET(
    request("/api/production/pending", "packOutside"),
  );
  assert.equal(outside.status, 200);
  assert.ok(
    !(await outside.json()).data.some(
      (p: { id: number }) => p.id === pendingId,
    ),
  );
  const settle = {
    id: pendingId,
    pay_date: "2021-02-01",
    reason: "Đối chiếu công kỳ trước đã chốt",
  };
  assert.equal(
    (
      await pendingRoutes.POST(
        request("/api/production/pending", "worker", settle),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await pendingRoutes.POST(
        request("/api/production/pending", "qa-director", {
          ...settle,
          pay_date: "2021-01-21",
        }),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await pendingRoutes.POST(
        request("/api/production/pending", "qa-director", {
          ...settle,
          pay_date: "2020-12-31",
        }),
      )
    ).status,
    422,
  );
  await db
    .prepare(
      "UPDATE order_rates SET unit_price=999999 WHERE order_id=? AND stage='Đóng gói'",
    )
    .run(order.id);
  await db
    .prepare(
      "UPDATE orders SET current_stage='hoan_thanh',status='completed' WHERE id=?",
    )
    .run(order.id);
  const payKey = randomUUID();
  const commit = async () =>
    await pendingRoutes.POST(
      request("/api/production/pending", "qa-director", settle, {
        key: payKey,
      }),
    );
  const paid = await commit();
  assert.equal(paid.status, 200);
  const logId = (await paid.json()).data.log_id;
  assert.equal((await commit()).status, 200);
  assert.equal(
    (
      await pendingRoutes.POST(
        request("/api/production/pending", "qa-director", settle),
      )
    ).status,
    409,
  );
  const log = await db
    .prepare(
      "SELECT quantity,unit_price,total_pay,log_date,month,employee_id FROM production_logs WHERE id=?",
    )
    .get(logId);
  assert.deepEqual(log, {
    quantity: 2,
    unit_price: 200000,
    total_pay: 400000,
    log_date: "2021-02-01",
    month: "2021-02",
    employee_id: "TEST-W1",
  });
  assert.equal((await getOrderById(order.id))!.variants![0].packed_qty, 2);
  assert.equal(
    (
      (await db
        .prepare(
          "SELECT COUNT(*) n FROM production_logs WHERE order_id=? AND month='2021-01'",
        )
        .get(order.id)) as { n: number }
    ).n,
    0,
  );
  assert.ok(
    await db.prepare("SELECT 1 FROM payroll_locks WHERE month='2021-01'").get(),
  );
  assert.deepEqual(
    await db
      .prepare(
        "SELECT work_date,settled_log_id FROM pending_packing_pay WHERE id=?",
      )
      .get(pendingId),
    { work_date: "2021-01-20", settled_log_id: logId },
  );
});

test("Pending packing privacy, price snapshot, representation and backups preserve the unresolved work", async () => {
  const pendingRoutes = await import("../src/app/api/production/pending/route");
  assert.equal(
    (await pendingRoutes.GET(request("/api/production/pending"))).status,
    401,
  );
  const order = await fixture("dong_goi", 2);
  await db
    .prepare("UPDATE orders SET order_date='2021-01-01' WHERE id=?")
    .run(order.id);
  await db
    .prepare("UPDATE order_variants SET qc_passed_qty=2 WHERE order_id=?")
    .run(order.id);
  await db
    .prepare("INSERT INTO order_rates VALUES (?,?,?)")
    .run(order.id, "Đóng gói", 100000);
  await db
    .prepare(
      "INSERT INTO employees(id,name,line_id,role,phone) VALUES ('PEND-PRIVATE','Private worker',1,'Đóng gói','')",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO roles(id,name,position) VALUES ('pending-private','Pending no salary',9)",
    )
    .run();
  for (const [permission, scope] of [
    ["production.create", "self"],
    ["production.view", "self"],
    ["orders.view", "lines"],
  ])
    await db
      .prepare("INSERT INTO role_grants VALUES ('pending-private',?,?)")
      .run(permission, scope);
  people.pendingPrivate = await person(
    "pendingPrivate",
    "pending-private",
    "PEND-PRIVATE",
    [1],
  );
  people.pendingAdmin = await person("pendingAdmin", "admin", null, []);
  const represented = await authRoutes.POST(
    request("/api/auth/represent", "pendingAdmin", {
      password: testPassword,
      accountId: people.pendingPrivate.id,
    }),
    await params("action", "represent"),
  );
  assert.equal(represented.status, 200);
  const input = {
    order_id: order.id,
    version: order.version,
    employee_id: "PEND-PRIVATE",
    log_date: "2021-01-21",
    color: "Đen",
    size: "M",
    stage: "Đóng gói",
    quantity: 1,
    record_packing: true,
  };
  const result = await productionRoutes.POST(
    request("/api/production/log", "pendingAdmin", input),
  );
  assert.equal(result.status, 201);
  const pendingId = (await result.json()).data.pending_id;
  const hidden = await pendingRoutes.GET(
    request("/api/production/pending", "pendingPrivate"),
  );
  const row = (await hidden.json()).data.find(
    (p: { id: number }) => p.id === pendingId,
  );
  assert.equal(row.unit_price, null);
  assert.equal(row.total_pay, null);
  assert.deepEqual(
    await db
      .prepare(
        "SELECT actor_id,represented_id,worker_id FROM operation_records WHERE order_id=?",
      )
      .get(order.id),
    {
      actor_id: people.pendingAdmin.id,
      represented_id: people.pendingPrivate.id,
      worker_id: "PEND-PRIVATE",
    },
  );
  const failed = await productionRoutes.POST(
    request("/api/production/log", "pendingPrivate", {
      ...input,
      version: (await getOrderById(order.id))!.version,
      quantity: 2,
    }),
  );
  assert.equal(failed.status, 422);
  assert.equal((await getOrderById(order.id))!.variants![0].packed_qty, 1);
  const { runBackup, configureBackup } =
    await import("../src/lib/server/backup");
  await configureBackup({ enabled: false, intervalHours: 24, windowDays: 30 });
  const files = await runBackup(Date.parse("2021-01-25T12:00:00Z"));
  const { readFileSync } = await import("node:fs");
  const { gunzipSync } = await import("node:zlib");
  const archive = JSON.parse(
    gunzipSync(
      readFileSync(join(directory, "backups", files.archive)),
    ).toString(),
  );
  assert.ok(
    archive.pendingPackingPay.some((p: { id: number }) => p.id === pendingId),
  );
  const restored = await readSnapshot(
    join(directory, "backups", files.snapshot),
  );
  assert.ok(
    restored.tables.pending_packing_pay.some(
      (r) => r.id === pendingId && r.settled_log_id === null,
    ),
  );
});

test("PostgreSQL concurrent writes share a transaction lock and enforce stale versions", async () => {
  const order = await fixture("may", 5);
  const input = {
    order_id: order.id,
    employee_id: "TEST-W1",
    log_date: "2026-06-01",
    stage: "May",
    color: "Đen",
    size: "M",
    quantity: 3,
    version: order.version,
  };
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      productionRoutes.POST(request("/api/production/log", "worker", input)),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409, 409]);
  assert.equal((await getOrderById(order.id))!.variants![0].sewn_qty, 3);
  assert.equal(
    (
      (await db
        .prepare("SELECT COUNT(*) n FROM production_logs WHERE order_id=?")
        .get(order.id)) as { n: number }
    ).n,
    1,
  );
});

test("PostgreSQL concurrent retries return the same saved result exactly once", async () => {
  const order = await fixture("may", 5);
  const key = randomUUID();
  const input = {
    order_id: order.id,
    employee_id: "TEST-W1",
    log_date: "2026-06-01",
    stage: "May",
    color: "Đen",
    size: "M",
    quantity: 2,
    version: order.version,
  };
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      productionRoutes.POST(
        request("/api/production/log", "worker", input, { key }),
      ),
    ),
  );
  const rows = await Promise.all(results.map((r) => r.json()));
  assert.ok(results.every((r) => r.status === 201));
  assert.equal(new Set(rows.map((r) => r.data.id)).size, 1);
  assert.equal((await getOrderById(order.id))!.variants![0].sewn_qty, 2);
});

test("PostgreSQL rollback, binding and concurrent login counters retain guarantees", async () => {
  const { bind } = await import("../src/lib/server/database");
  assert.deepEqual(
    bind("SELECT '?' literal, ? value, '@name' literal2", ["O'Reilly"]),
    {
      text: "SELECT '?' literal, $1 value, '@name' literal2",
      values: ["O'Reilly"],
    },
  );
  const key = "rollback-" + randomUUID();
  await assert.rejects(
    db.transaction(async () => {
      await db
        .prepare("INSERT INTO app_settings VALUES (?,?)")
        .run(key, "temporary");
      throw new Error("rollback");
    })(),
    /rollback/,
  );
  assert.equal(
    await db.prepare("SELECT 1 FROM app_settings WHERE key=?").get(key),
    undefined,
  );
  const attempts = await Promise.allSettled(
    Array.from({ length: 10 }, () => auth.limit(key, 5)),
  );
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 5);
  assert.equal(
    (
      (await db
        .prepare("SELECT count FROM auth_attempts WHERE key=?")
        .get(key)) as { count: number }
    ).count,
    5,
  );
});

test("PostgreSQL snapshots refuse to replace a populated database", async () => {
  const { captureSnapshot, restoreSnapshot } =
    await import("../src/lib/server/snapshot");
  const snapshot = await captureSnapshot();
  const before = await db
    .prepare("SELECT COUNT(*) n,SUM(total_pay) wages FROM production_logs")
    .get();
  await assert.rejects(restoreSnapshot(snapshot), /empty database/);
  assert.deepEqual(
    await db
      .prepare("SELECT COUNT(*) n,SUM(total_pay) wages FROM production_logs")
      .get(),
    before,
  );
});
