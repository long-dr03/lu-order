import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { Pool } from "pg";
import type { DepartmentId } from "../src/lib/departments";
import type { Order } from "../src/lib/types";

if (!process.env.TEST_DATABASE_URL)
  throw Error("TEST_DATABASE_URL must be a disposable PostgreSQL server");
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const name = "luuta_dept_" + randomUUID().replaceAll("-", "");
await pool.query(`CREATE DATABASE "${name}"`);
const url = new URL(process.env.TEST_DATABASE_URL);
url.pathname = "/" + name;
process.env.DATABASE_URL = url.toString();
const folder = mkdtempSync(join(tmpdir(), "luuta-department-tests-"));
process.env.BACKUP_DIR = join(folder, "backups");
process.env.APP_ORIGIN = "http://localhost:3003";
process.env.SESSION_COOKIE_SECURE = "false";
const { db, getOrderById } = await import("../src/lib/db");
const migration = await import("../src/lib/server/migrate");
await migration.initializeDatabase();
const auth = await import("../src/lib/server/auth");
const business = await import("../src/lib/server/business");
const authApi = await import("../src/app/api/auth/[action]/route");
const ordersApi = await import("../src/app/api/orders/route");
const detailApi = await import("../src/app/api/orders/[id]/route");
const staffApi = await import("../src/app/api/departments/route");
const assignmentApi =
  await import("../src/app/api/orders/[id]/assignments/route");
const productionApi = await import("../src/app/api/production/log/route");
const operationApi =
  await import("../src/app/api/orders/[id]/operations/route");
const shipmentApi = await import("../src/app/api/orders/[id]/shipments/route");
const adminApi = await import("../src/app/api/admin/[section]/route");
const ratesApi = await import("../src/app/api/rates/route");
const shortageApi = await import("../src/app/api/orders/[id]/shortages/route");
const payrollApi = await import("../src/app/api/payroll/route");
const exportApi = await import("../src/app/api/export/excel/route");
const { today } = await import("../src/lib/server/validation");
const { DEPARTMENTS } = await import("../src/lib/departments");
const password = "Disposable-Test-Password-42!";
type Person = { id: string; csrf: string; cookie: string };
const people: Record<string, Person> = {};
async function session(id: string) {
  const token = randomUUID(),
    csrf = randomUUID();
  await db
    .prepare(
      "INSERT INTO sessions(token_hash,account_id,csrf,expires_at) VALUES (?,?,?,?)",
    )
    .run(auth.hashToken(token), id, csrf, Date.now() + 86400000);
  return { id, csrf, cookie: `luuta_session=${token}` };
}
async function worker(id: string, departments: DepartmentId[]) {
  await db
    .prepare(
      "INSERT INTO employees(id,name,line_id,role,phone) VALUES (?,?,4,'Thợ gia công','private-phone')",
    )
    .run(id, id);
  for (const d of departments)
    await db
      .prepare("INSERT INTO employee_departments VALUES (?,?)")
      .run(id, d);
  return id;
}
async function operator(
  key: string,
  role: string,
  departments: DepartmentId[],
) {
  const id = randomUUID();
  const employee = await worker("EMP-" + key, departments);
  await db
    .prepare(
      "INSERT INTO accounts(id,username,name,password_hash,status,employee_id) VALUES (?,?,?,?,'active',?)",
    )
    .run(id, key, key, auth.hashPassword(password), employee);
  await db.prepare("INSERT INTO account_roles VALUES (?,?)").run(id, role);
  people[key] = await session(id);
}
await operator("admin", "admin", []);
await operator("management", "manager", ["management"]);
for (const d of DEPARTMENTS.filter((d) => d.id !== "management"))
  await operator(d.id, d.id === "quality" ? "qc" : "leader", [d.id]);
await operator("multi", "leader", ["cutting", "sewing"]);
await operator("unclassified", "leader", []);
await operator("worker", "worker", ["sewing"]);
const workers: Record<string, string[]> = {};
for (const d of DEPARTMENTS)
  workers[d.id] = [
    await worker("W-" + d.id, [d.id]),
    await worker("W2-" + d.id, [d.id]),
  ];
await worker("W-MULTI", ["cutting", "sewing"]);
function req(
  path: string,
  who?: string,
  input?: unknown,
  extra: { key?: string; origin?: string; csrf?: string; method?: string } = {},
) {
  const p = who ? people[who] : undefined;
  return new Request("http://localhost:3003" + path, {
    method: input === undefined ? "GET" : extra.method || "POST",
    headers: {
      ...(p ? { cookie: p.cookie } : {}),
      ...(input !== undefined
        ? {
            origin: extra.origin || process.env.APP_ORIGIN!,
            "content-type": "application/json",
            "x-csrf-token": extra.csrf ?? p?.csrf ?? "",
            "idempotency-key": extra.key || randomUUID(),
          }
        : {}),
    },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
}
const params = (key: string, value: string) =>
  ({ params: Promise.resolve({ [key]: value }) }) as {
    params: Promise<{ id: string; action: string; section: string }>;
  };
const ctx = (who: string) => auth.authenticate(req("/api/orders", who));
async function result<T = Record<string, unknown>>(
  response: Response,
  status = 200,
): Promise<T> {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body.data as T;
}
async function order(
  variants = [{ color: "Đen", size: "M", quantity: 100 }],
  stage = "cat",
) {
  const created = await business.createOrder(
    await ctx("admin"),
    business.createOrderSchema.parse({
      customer: '=HYPERLINK("unsafe")',
      product_name: "Áo kiểm thử",
      order_date: "2020-01-01",
      deadline: "2030-01-01",
      variants,
    }),
  );
  await db
    .prepare("UPDATE orders SET current_stage=? WHERE id=?")
    .run(stage, created.id);
  for (const stage of ["Cắt", "May", "Sửa hàng", "QC", "Đóng gói"])
    await db
      .prepare("INSERT INTO order_rates VALUES (?,?,1000)")
      .run(created.id, stage);
  return created.id;
}
const current = async (id: string) => (await getOrderById(id))!;
async function assign(
  id: string,
  stage: string,
  employees: string[],
  part?: number,
  who = "admin",
) {
  return result(
    await assignmentApi.POST(
      req(`/api/orders/${id}/assignments`, who, {
        version: (await current(id)).version,
        stage,
        employee_ids: employees,
        work_item_id: part,
      }),
      params("id", id),
    ),
  );
}
async function record(
  id: string,
  stage: string,
  employee: string,
  quantity: number,
  who = "admin",
  extra: Record<string, unknown> = {},
) {
  return productionApi.POST(
    req("/api/production/log", who, {
      version: (await current(id)).version,
      order_id: id,
      employee_id: employee,
      stage,
      log_date: today(),
      entries: [{ color: "Đen", size: "M", quantity }],
      ...extra,
    }),
  );
}
async function qc(
  id: string,
  quantity: number,
  passed = quantity,
  action = "qc",
  who = "quality",
) {
  return operationApi.POST(
    req(`/api/orders/${id}/operations`, who, {
      version: (await current(id)).version,
      action,
      operation_date: today(),
      entries: [{ color: "Đen", size: "M", quantity, passed }],
    }),
    params("id", id),
  );
}
const deliveredAt = () => new Date(Date.now() - 60000).toISOString();
async function ship(
  id: string,
  quantity: number,
  extra: Record<string, unknown> = {},
  who = "delivery",
) {
  return shipmentApi.POST(
    req(`/api/orders/${id}/shipments`, who, {
      version: (await current(id)).version,
      worker_id: workers.delivery[0],
      delivered_at: deliveredAt(),
      packages: 1,
      items: [{ color: "Đen", size: "M", quantity }],
      ...extra,
    }),
    params("id", id),
  );
}
after(async () => {
  await db.close();
  await pool.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await pool.end();
  rmSync(folder, { recursive: true, force: true });
});

test("Six stable departments; startup is repeatable and does not reinstate removed grants", async () => {
  assert.deepEqual(
    (
      (await db.prepare("SELECT id FROM departments ORDER BY id").all()) as {
        id: string;
      }[]
    ).map((d) => d.id),
    DEPARTMENTS.map((d) => d.id).sort(),
  );
  await db
    .prepare(
      "DELETE FROM role_grants WHERE role_id='leader' AND permission='export.data'",
    )
    .run();
  await migration.migrate();
  await (
    await import("../src/lib/server/department-migration")
  ).migrateDepartments();
  assert(
    !(await db
      .prepare(
        "SELECT 1 FROM role_grants WHERE role_id='leader' AND permission='export.data'",
      )
      .get()),
  );
  await db
    .prepare(
      "INSERT INTO role_grants VALUES ('leader','export.data','departments')",
    )
    .run();
  assert.equal(
    (
      (await db
        .prepare("SELECT MAX(version) n FROM schema_migrations")
        .get()) as { n: number }
    ).n,
    12,
  );
});
test("Passwords use distinct salts and verify without plaintext", () => {
  const first = auth.hashPassword(password);
  assert.notEqual(first, auth.hashPassword(password));
  assert(auth.verifyPassword(password, first));
  assert(!auth.verifyPassword("wrong", first));
  assert(!first.includes(password));
});
test("Anonymous, unclassified, and worker-only accounts cannot use business APIs", async () => {
  for (const who of [undefined, "unclassified", "worker"])
    for (const handler of [
      ordersApi.GET,
      productionApi.GET,
      staffApi.GET,
      exportApi.GET,
    ])
      assert.equal(
        (await handler(req("/api/orders", who))).status,
        who ? 403 : 401,
      );
});
test("Expired sessions reject API access", async () => {
  const p = await session(people.sewing.id);
  await db
    .prepare("UPDATE sessions SET expires_at=0 WHERE token_hash=?")
    .run(auth.hashToken(p.cookie.slice(14)));
  assert.equal(
    (
      await ordersApi.GET(
        new Request("http://localhost:3003/api/orders", {
          headers: { cookie: p.cookie },
        }),
      )
    ).status,
    401,
  );
});
test("Origin and CSRF checks reject direct forged writes", async () => {
  const input = {
    action: "create",
    name: "Rejected",
    department_ids: ["sewing"],
  };
  for (const extra of [
    { origin: "https://localhost.attacker.example" },
    { csrf: "invalid" },
  ])
    assert.equal(
      (await staffApi.POST(req("/api/departments", "admin", input, extra)))
        .status,
      403,
    );
});
test("Workers have profiles without accounts and intelligent lists only expose own departments", async () => {
  await result(
    await staffApi.POST(
      req("/api/departments", "sewing", {
        action: "create",
        name: "Thợ mới",
        department_ids: ["sewing"],
      }),
    ),
  );
  const rows = await result<{
    employees: { id: string; department_ids: DepartmentId[] }[];
  }>(await staffApi.GET(req("/api/departments", "sewing")));
  assert(rows.employees.some((e) => e.id === workers.sewing[0]));
  assert(!rows.employees.some((e) => e.id === workers.cutting[0]));
  assert(rows.employees.every((e) => e.department_ids.includes("sewing")));
  assert(
    !(await db.prepare("SELECT 1 FROM accounts WHERE name='Thợ mới'").get()),
  );
});
test("Non-Admin cannot grant Management, edit account-linked profiles, or modify own memberships", async () => {
  const inputs = [
    { action: "create", name: "Escalation", department_ids: ["management"] },
    {
      action: "update",
      id: "EMP-sewing",
      name: "sewing",
      department_ids: ["sewing", "cutting"],
    },
    {
      action: "update",
      id: "EMP-quality",
      name: "QC",
      department_ids: ["quality"],
    },
  ];
  for (const input of inputs)
    assert.equal(
      (await staffApi.POST(req("/api/departments", "management", input)))
        .status,
      403,
    );
});
test("Shared progress is visible across departments; whole-workshop grant cannot bypass department writes", async () => {
  const id = await order();
  await assign(id, "Cắt", workers.cutting);
  await db
    .prepare(
      "INSERT INTO role_grants VALUES ('leader','orders.create','all') ON CONFLICT DO NOTHING",
    )
    .run();
  assert.equal(
    (await detailApi.GET(req(`/api/orders/${id}`, "sewing"), params("id", id)))
      .status,
    200,
  );
  assert.equal(
    (await record(id, "Cắt", workers.cutting[0], 1, "sewing")).status,
    403,
  );
  assert.equal(
    (
      await ordersApi.POST(
        req("/api/orders", "sewing", {
          customer: "Khách",
          product_name: "Áo",
          order_date: today(),
          deadline: "2030-01-01",
          variants: [{ color: "Đen", size: "M", quantity: 1 }],
        }),
      )
    ).status,
    403,
  );
});
test("Management inputs every stage but has no automatic account, role, rate, or payroll access", async () => {
  const u = (await ctx("management")).user;
  const { permits } = await import("../src/lib/permissions");
  for (const stage of ["Cắt", "May", "Sửa hàng", "QC", "Đóng gói", "Giao hàng"])
    assert(
      permits(
        u,
        stage === "Giao hàng"
          ? "delivery.manage"
          : stage === "QC"
            ? "qc.manage"
            : "production.create",
        { stage },
      ),
    );
  for (const permission of [
    "users.manage",
    "roles.manage",
    "payroll.view",
    "payroll.lock",
    "rates.manage",
  ] as const)
    assert(!permits(u, permission));
  assert.equal(
    (await payrollApi.GET(req("/api/payroll", "management"))).status,
    403,
  );
});
test("Assignment rejects wrong-department, inactive, duplicate workers and stale versions", async () => {
  const id = await order();
  const common = { version: (await current(id)).version, stage: "May" };
  for (const employee_ids of [
    [workers.cutting[0]],
    [workers.sewing[0], workers.sewing[0]],
    ["missing"],
  ])
    assert.equal(
      (
        await assignmentApi.POST(
          req(`/api/orders/${id}/assignments`, "admin", {
            ...common,
            employee_ids,
          }),
          params("id", id),
        )
      ).status,
      422,
    );
  await assign(id, "May", workers.sewing);
  assert.equal(
    (
      await assignmentApi.POST(
        req(`/api/orders/${id}/assignments`, "admin", {
          ...common,
          employee_ids: workers.sewing,
        }),
        params("id", id),
      )
    ).status,
    409,
  );
  await db
    .prepare("UPDATE employees SET active=0 WHERE id=?")
    .run(workers.sewing[1]);
  assert.equal(
    (
      await assignmentApi.POST(
        req(`/api/orders/${id}/assignments`, "admin", {
          version: (await current(id)).version,
          stage: "May",
          employee_ids: [workers.sewing[1]],
        }),
        params("id", id),
      )
    ).status,
    422,
  );
  await db
    .prepare("UPDATE employees SET active=1 WHERE id=?")
    .run(workers.sewing[1]);
});
test("Assignment is required; client cannot choose a different department or submit prices", async () => {
  const id = await order();
  assert.equal(
    (await record(id, "Cắt", workers.cutting[0], 1, "cutting")).status,
    422,
  );
  await assign(id, "Cắt", workers.cutting);
  for (const extra of [{ unit_price: 1 }, { department_id: "cutting" }])
    assert.equal(
      (await record(id, "Cắt", workers.cutting[0], 1, "cutting", extra)).status,
      422,
    );
});
test("Multiple colors and sizes save once with exact historical wages and no double counting", async () => {
  const id = await order([
    { color: "Đen", size: "M", quantity: 7 },
    { color: "Đen", size: "L", quantity: 8 },
    { color: "Trắng", size: "M", quantity: 9 },
  ]);
  await assign(id, "Cắt", workers.cutting);
  const entries = [
    { color: "Đen", size: "M", quantity: 3 },
    { color: "Đen", size: "L", quantity: 4 },
    { color: "Trắng", size: "M", quantity: 5 },
  ];
  const response = await record(id, "Cắt", workers.cutting[0], 1, "cutting", {
    entries,
  });
  await result(response, 201);
  const logs = (await db
    .prepare(
      "SELECT quantity,total_pay,department_id,actor_id FROM production_logs WHERE order_id=?",
    )
    .all(id)) as {
    quantity: number;
    total_pay: number;
    department_id: string;
    actor_id: string;
  }[];
  assert.equal(logs.length, 3);
  assert.equal(
    logs.reduce((n, r) => n + r.total_pay, 0),
    12000,
  );
  assert(
    logs.every(
      (l) => l.department_id === "cutting" && l.actor_id === people.cutting.id,
    ),
  );
  assert.equal(
    (await current(id)).variants?.reduce((n, v) => n + v.cut_qty, 0),
    12,
  );
});
test("Duplicate rows and a single bad batch row roll back all physical progress and wages", async () => {
  for (const entries of [
    [
      { color: "Đen", size: "M", quantity: 1 },
      { color: "Đen", size: "M", quantity: 1 },
    ],
    [
      { color: "Đen", size: "M", quantity: 1 },
      { color: "Trắng", size: "L", quantity: 99 },
    ],
  ]) {
    const id = await order([
      { color: "Đen", size: "M", quantity: 5 },
      { color: "Trắng", size: "L", quantity: 5 },
    ]);
    await assign(id, "Cắt", workers.cutting);
    assert.equal(
      (await record(id, "Cắt", workers.cutting[0], 1, "cutting", { entries }))
        .status,
      422,
    );
    assert.equal(
      (await current(id)).variants?.reduce((n, v) => n + v.cut_qty, 0),
      0,
    );
    assert.equal(
      (
        (await db
          .prepare("SELECT COUNT(*) n FROM production_logs WHERE order_id=?")
          .get(id)) as { n: number }
      ).n,
      0,
    );
  }
});
test("Concurrent writes and retries cannot double-pay or exceed available input", async () => {
  const id = await order([{ color: "Đen", size: "M", quantity: 5 }]);
  await assign(id, "Cắt", workers.cutting);
  const input = {
    version: (await current(id)).version,
    order_id: id,
    employee_id: workers.cutting[0],
    stage: "Cắt",
    log_date: today(),
    entries: [{ color: "Đen", size: "M", quantity: 3 }],
  };
  const key = randomUUID();
  const responses = await Promise.all([
    productionApi.POST(req("/api/production/log", "cutting", input, { key })),
    productionApi.POST(req("/api/production/log", "cutting", input, { key })),
  ]);
  for (const response of responses) await result(response, 201);
  assert.equal((await current(id)).variants?.[0].cut_qty, 3);
  assert.equal(
    (
      await productionApi.POST(
        req(
          "/api/production/log",
          "cutting",
          { ...input, entries: [{ color: "Đen", size: "M", quantity: 1 }] },
          { key },
        ),
      )
    ).status,
    409,
  );
  const next = {
    ...input,
    version: (await current(id)).version,
    entries: [{ color: "Đen", size: "M", quantity: 2 }],
  };
  const statuses = await Promise.all(
    [0, 1].map(
      async () =>
        (await productionApi.POST(req("/api/production/log", "cutting", next)))
          .status,
    ),
  );
  assert.deepEqual(statuses.sort(), [201, 409]);
  assert.equal(
    (
      (await db
        .prepare(
          "SELECT SUM(total_pay) n FROM production_logs WHERE order_id=?",
        )
        .get(id)) as { n: number }
    ).n,
    5000,
  );
});
test("Two workers share a task without exceeding its limit", async () => {
  const id = await order([{ color: "Đen", size: "M", quantity: 5 }]);
  await assign(id, "Cắt", workers.cutting);
  await result(await record(id, "Cắt", workers.cutting[0], 3, "cutting"), 201);
  assert.equal(
    (await record(id, "Cắt", workers.cutting[1], 5, "cutting")).status,
    422,
  );
  await result(await record(id, "Cắt", workers.cutting[1], 2, "cutting"), 201);
  assert.equal((await current(id)).variants?.[0].cut_qty, 5);
});
test("Multiple required work parts complete only their minimum; workers earn separate historical rates", async () => {
  const id = await order([{ color: "Đen", size: "M", quantity: 5 }]);
  await result(
    await ratesApi.POST(
      req("/api/rates", "admin", {
        order_id: id,
        stage: "Cắt",
        version: (await current(id)).version,
        work_items: [
          { name: "Phần thân", unit_price: 1000 },
          { name: "Phần tay", unit_price: 2000 },
        ],
      }),
    ),
  );
  const parts = (await current(id)).work_items!;
  for (const p of parts) await assign(id, "Cắt", workers.cutting, p.id);
  await result(
    await record(id, "Cắt", workers.cutting[0], 5, "cutting", {
      work_item_id: parts[0].id,
    }),
    201,
  );
  assert.equal((await current(id)).variants?.[0].cut_qty, 0);
  await result(
    await record(id, "Cắt", workers.cutting[1], 3, "cutting", {
      work_item_id: parts[1].id,
    }),
    201,
  );
  assert.equal((await current(id)).variants?.[0].cut_qty, 3);
  assert.equal(
    (
      (await db
        .prepare(
          "SELECT SUM(total_pay) n FROM production_logs WHERE order_id=?",
        )
        .get(id)) as { n: number }
    ).n,
    11000,
  );
  await result(
    await ratesApi.POST(
      req("/api/rates", "admin", {
        order_id: id,
        stage: "Cắt",
        work_item_id: parts[1].id,
        unit_price: 3000,
      }),
    ),
  );
  await result(
    await record(id, "Cắt", workers.cutting[1], 2, "cutting", {
      work_item_id: parts[1].id,
    }),
    201,
  );
  assert.equal(
    (
      (await db
        .prepare(
          "SELECT SUM(total_pay) n FROM production_logs WHERE order_id=?",
        )
        .get(id)) as { n: number }
    ).n,
    17000,
  );
});
test("Removing assignment or worker department blocks new entries but retains history", async () => {
  const id = await order();
  await assign(id, "Cắt", ["W-MULTI"]);
  await result(await record(id, "Cắt", "W-MULTI", 1, "multi"), 201);
  await assign(id, "Cắt", []);
  assert.equal((await record(id, "Cắt", "W-MULTI", 1, "multi")).status, 422);
  await assign(id, "Cắt", ["W-MULTI"]);
  await result(
    await staffApi.POST(
      req("/api/departments", "admin", {
        action: "update",
        id: "W-MULTI",
        name: "Kiêm nhiệm",
        department_ids: ["sewing"],
      }),
    ),
  );
  assert.equal((await record(id, "Cắt", "W-MULTI", 1, "multi")).status, 422);
  assert.equal(
    (
      (await db
        .prepare("SELECT department_id FROM production_logs WHERE order_id=?")
        .get(id)) as { department_id: string }
    ).department_id,
    "cutting",
  );
});
test("QC identity comes from session, and repair belongs to Sewing rather than QC", async () => {
  const id = await order([{ color: "Đen", size: "M", quantity: 5 }]);
  await db
    .prepare("UPDATE order_variants SET cut_qty=5,sewn_qty=5 WHERE order_id=?")
    .run(id);
  assert.equal(
    (
      await operationApi.POST(
        req(`/api/orders/${id}/operations`, "quality", {
          version: (await current(id)).version,
          action: "qc",
          color: "Đen",
          size: "M",
          quantity: 5,
          passed: 3,
          worker_id: workers.sewing[0],
        }),
        params("id", id),
      )
    ).status,
    403,
  );
  await result(await qc(id, 5, 3));
  const inspection = (await db
    .prepare(
      "SELECT worker_id,actor_id,department_id FROM operation_records WHERE order_id=?",
    )
    .get(id)) as { worker_id: string; actor_id: string; department_id: string };
  assert.equal(inspection.worker_id, "EMP-quality");
  assert.equal(inspection.actor_id, people.quality.id);
  await assign(id, "Sửa hàng", workers.sewing);
  assert.equal(
    (
      await record(id, "Sửa hàng", workers.sewing[0], 2, "quality", {
        record_rework: true,
      })
    ).status,
    403,
  );
  await result(
    await record(id, "Sửa hàng", workers.sewing[0], 2, "sewing", {
      record_rework: true,
    }),
    201,
  );
  await result(await qc(id, 2, 1, "reinspect"));
  await result(
    await record(id, "Sửa hàng", workers.sewing[1], 1, "sewing", {
      record_rework: true,
    }),
    201,
  );
  await result(await qc(id, 1, 1, "reinspect"));
  assert.equal((await current(id)).variants?.[0].qc_passed_qty, 5);
  assert.equal(
    (
      await record(id, "Sửa hàng", workers.sewing[0], 1, "sewing", {
        record_rework: true,
      })
    ).status,
    422,
  );
});
let fullFlow = "";
test("100-product order produces and ships 20 then 80 without waiting for a whole-order stage", async () => {
  const id = await order();
  fullFlow = id;
  for (const [stage, depId] of [
    ["Cắt", "cutting"],
    ["May", "sewing"],
    ["Đóng gói", "packing"],
    ["Giao hàng", "delivery"],
  ])
    await assign(id, stage, workers[depId]);
  for (const quantity of [20, 80]) {
    await result(
      await record(id, "Cắt", workers.cutting[0], quantity, "cutting"),
      201,
    );
    await result(
      await record(id, "May", workers.sewing[0], quantity, "sewing"),
      201,
    );
    await result(await qc(id, quantity));
    await result(
      await record(id, "Đóng gói", workers.packing[0], quantity, "packing", {
        record_packing: true,
      }),
      201,
    );
    await result(await ship(id, quantity), 201);
  }
  const o = await current(id);
  assert.equal(o.current_stage, "cat");
  assert.equal(o.variants?.[0].delivered_qty, 100);
  const shipments = await result<{ items: { quantity: number }[] }[]>(
    await shipmentApi.GET(
      req(`/api/orders/${id}/shipments`, "management"),
      params("id", id),
    ),
  );
  assert.deepEqual(
    shipments.map((s) => s.items[0].quantity).sort((a, b) => a - b),
    [20, 80],
  );
  assert.equal(
    (
      (await db
        .prepare("SELECT SUM(packages) n FROM shipments WHERE order_id=?")
        .get(id)) as { n: number }
    ).n,
    2,
  );
});
test("Packing never exceeds QC; delivery never exceeds packing; blocked batches remain atomic", async () => {
  const id = await order([
    { color: "Đen", size: "M", quantity: 5 },
    { color: "Trắng", size: "L", quantity: 5 },
  ]);
  await db
    .prepare(
      "UPDATE order_variants SET cut_qty=5,sewn_qty=5,qc_passed_qty=3,qc_inspected_qty=5 WHERE order_id=?",
    )
    .run(id);
  await assign(id, "Đóng gói", workers.packing);
  assert.equal(
    (
      await record(id, "Đóng gói", workers.packing[0], 4, "packing", {
        record_packing: true,
      })
    ).status,
    422,
  );
  await result(
    await record(id, "Đóng gói", workers.packing[0], 3, "packing", {
      record_packing: true,
    }),
    201,
  );
  await assign(id, "Giao hàng", workers.delivery);
  assert.equal((await ship(id, 4)).status, 422);
  assert.equal(
    (
      await ship(id, 1, {
        items: [
          { color: "Đen", size: "M", quantity: 1 },
          { color: "Trắng", size: "L", quantity: 1 },
        ],
      })
    ).status,
    422,
  );
  assert.equal((await current(id)).variants?.[0].delivered_qty, 0);
  assert.equal(
    (
      (await db
        .prepare("SELECT COUNT(*) n FROM shipments WHERE order_id=?")
        .get(id)) as { n: number }
    ).n,
    0,
  );
});
test("Packing uses its production permission through both current and legacy APIs without requiring delivery privileges", async () => {
  await db
    .prepare("INSERT INTO roles VALUES ('packingqa','Packing QA',1,0)")
    .run();
  for (const permission of ["orders.view", "production.create"])
    await db
      .prepare("INSERT INTO role_grants VALUES (?,?, 'departments')")
      .run("packingqa", permission);
  await operator("packingonly", "packingqa", ["packing"]);
  const id = await order();
  await db
    .prepare(
      "UPDATE order_variants SET cut_qty=3,sewn_qty=3,qc_inspected_qty=3,qc_passed_qty=3 WHERE order_id=?",
    )
    .run(id);
  await assign(id, "Đóng gói", workers.packing);
  await result(
    await record(id, "Đóng gói", workers.packing[0], 1, "packingonly", {
      record_packing: true,
    }),
    201,
  );
  await result(
    await operationApi.POST(
      req(`/api/orders/${id}/operations`, "packingonly", {
        version: (await current(id)).version,
        action: "pack",
        color: "Đen",
        size: "M",
        quantity: 1,
        worker_id: workers.packing[0],
      }),
      params("id", id),
    ),
  );
  assert.equal((await current(id)).variants![0].packed_qty, 2);
  assert.equal((await ship(id, 1, {}, "packingonly")).status, 403);
});
test("Shipment has multi-line items, exact actual time, one package count and retry protection", async () => {
  const id = await order([
    { color: "Đen", size: "M", quantity: 5 },
    { color: "Trắng", size: "L", quantity: 5 },
  ]);
  await db
    .prepare(
      "UPDATE order_variants SET cut_qty=5,sewn_qty=5,qc_inspected_qty=5,qc_passed_qty=5,packed_qty=5 WHERE order_id=?",
    )
    .run(id);
  await assign(id, "Giao hàng", workers.delivery);
  const datetime = deliveredAt();
  const input = {
    version: (await current(id)).version,
    worker_id: workers.delivery[0],
    delivered_at: datetime,
    packages: 2,
    notes: "Người nhận đã ký",
    items: [
      { color: "Đen", size: "M", quantity: 2 },
      { color: "Trắng", size: "L", quantity: 3 },
    ],
  };
  const key = randomUUID();
  const a = await result<{ id: string }>(
    await shipmentApi.POST(
      req(`/api/orders/${id}/shipments`, "delivery", input, { key }),
      params("id", id),
    ),
    201,
  );
  const b = await result<{ id: string }>(
    await shipmentApi.POST(
      req(`/api/orders/${id}/shipments`, "delivery", input, { key }),
      params("id", id),
    ),
    201,
  );
  assert.equal(a.id, b.id);
  const header = (await db
    .prepare("SELECT packages,delivered_at,actor_id FROM shipments WHERE id=?")
    .get(a.id)) as { packages: number; delivered_at: Date; actor_id: string };
  assert.equal(header.packages, 2);
  assert.equal(header.delivered_at.toISOString(), datetime);
  assert.equal(header.actor_id, people.delivery.id);
  assert.equal(
    (
      (await db
        .prepare(
          "SELECT SUM(quantity) n FROM shipment_items WHERE shipment_id=?",
        )
        .get(a.id)) as { n: number }
    ).n,
    5,
  );
});
test("Late deliveries and incidents require per-event reasons; ordinary partial deliveries do not", async () => {
  const id = await order();
  await db
    .prepare("UPDATE order_variants SET packed_qty=100 WHERE order_id=?")
    .run(id);
  await assign(id, "Giao hàng", workers.delivery);
  await db
    .prepare("UPDATE orders SET deadline='2020-01-02' WHERE id=?")
    .run(id);
  assert.equal((await ship(id, 1)).status, 422);
  await result(await ship(id, 1, { reason: "Khách đổi lịch nhận" }), 201);
  assert.equal(
    (
      (await db
        .prepare("SELECT reason FROM shipments WHERE order_id=?")
        .get(id)) as { reason: string }
    ).reason,
    "Khách đổi lịch nhận",
  );
  assert.equal((await current(id)).reason, null);
  assert.equal(
    (
      await record(id, "Cắt", workers.cutting[0], 1, "cutting", {
        incident: true,
      })
    ).status,
    422,
  );
  assert.equal((await ship(id, 1, { incident: true, reason: "" })).status, 422);
  assert.equal(
    (
      await ship(id, 1, {
        delivered_at: "2099-01-01T00:00:00Z",
        reason: "Future",
      })
    ).status,
    422,
  );
});
test("Only Management can prepare or complete; Kanban moving cannot fabricate production", async () => {
  const id = await order(
    [{ color: "Đen", size: "M", quantity: 5 }],
    "nhan_don",
  );
  assert.equal(
    (
      await detailApi.PATCH(
        req(
          `/api/orders/${id}`,
          "cutting",
          { version: (await current(id)).version, stage: "kiem_npl" },
          { method: "PATCH" },
        ),
        params("id", id),
      )
    ).status,
    403,
  );
  for (const stage of ["kiem_npl", "kiem_rap", "cat"])
    await result(
      await detailApi.PATCH(
        req(
          `/api/orders/${id}`,
          "management",
          { version: (await current(id)).version, stage },
          { method: "PATCH" },
        ),
        params("id", id),
      ),
    );
  assert.equal((await current(id)).variants?.[0].cut_qty, 0);
  assert.equal(
    (
      await detailApi.PATCH(
        req(
          `/api/orders/${id}`,
          "management",
          { version: (await current(id)).version, stage: "may" },
          { method: "PATCH" },
        ),
        params("id", id),
      )
    ).status,
    422,
  );
  await db
    .prepare("UPDATE orders SET current_stage='giao_hang' WHERE id=?")
    .run(id);
  assert.equal(
    (
      await detailApi.PATCH(
        req(
          `/api/orders/${id}`,
          "management",
          { version: (await current(id)).version, stage: "hoan_thanh" },
          { method: "PATCH" },
        ),
        params("id", id),
      )
    ).status,
    422,
  );
  await db
    .prepare("UPDATE orders SET current_stage='giao_hang' WHERE id=?")
    .run(fullFlow);
  assert.equal(
    (
      await detailApi.PATCH(
        req(
          `/api/orders/${fullFlow}`,
          "delivery",
          { version: (await current(fullFlow)).version, stage: "hoan_thanh" },
          { method: "PATCH" },
        ),
        params("id", fullFlow),
      )
    ).status,
    403,
  );
  await result(
    await detailApi.PATCH(
      req(
        `/api/orders/${fullFlow}`,
        "management",
        { version: (await current(fullFlow)).version, stage: "hoan_thanh" },
        { method: "PATCH" },
      ),
      params("id", fullFlow),
    ),
  );
  assert.equal((await current(fullFlow)).status, "completed");
});
test("Payroll lock blocks batch wages; physical packing is recorded once as pending pay", async () => {
  const id = await order();
  await assign(id, "Cắt", workers.cutting);
  await assign(id, "Đóng gói", workers.packing);
  await db
    .prepare(
      "UPDATE order_variants SET cut_qty=10,sewn_qty=10,qc_passed_qty=10,qc_inspected_qty=10 WHERE order_id=?",
    )
    .run(id);
  const month = today().slice(0, 7);
  await db
    .prepare("INSERT INTO payroll_locks(month,locked_by) VALUES (?,'QA')")
    .run(month);
  try {
    assert.equal(
      (await record(id, "Cắt", workers.cutting[0], 1, "cutting")).status,
      409,
    );
    const saved = await result<{ pay_status: string }>(
      await record(id, "Đóng gói", workers.packing[0], 5, "packing", {
        record_packing: true,
      }),
      201,
    );
    assert.equal(saved.pay_status, "pending");
    assert.equal((await current(id)).variants?.[0].packed_qty, 5);
    assert.equal(
      (
        (await db
          .prepare(
            "SELECT SUM(quantity) n FROM pending_packing_pay WHERE order_id=?",
          )
          .get(id)) as { n: number }
      ).n,
      5,
    );
    assert.equal(
      (
        await record(id, "Đóng gói", workers.packing[0], 6, "packing", {
          record_packing: true,
        })
      ).status,
      422,
    );
  } finally {
    await db.prepare("DELETE FROM payroll_locks WHERE month=?").run(month);
  }
});
test("Financial data is masked, filtered by department, and cannot be obtained from rate or export API", async () => {
  const logs = await result<{
    logs: { department_id: string; total_pay: null }[];
  }>(await productionApi.GET(req("/api/production/log", "cutting")));
  assert(logs.logs.length > 0);
  assert(
    logs.logs.every(
      (l) => l.department_id === "cutting" && l.total_pay === null,
    ),
  );
  assert.deepEqual(
    await result(await ratesApi.GET(req("/api/rates", "cutting"))),
    [],
  );
  const response = await exportApi.GET(
    req("/api/export/excel?dataset=production", "cutting"),
  );
  assert.equal(response.status, 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
  const ws = book.getWorksheet("Chi tiết sản lượng")!;
  assert(ws.rowCount > 1);
  ws.eachRow((row, n) => {
    if (n > 1) {
      assert.equal(row.getCell(4).value, "Cắt");
      assert.equal(row.getCell(11).value, "");
      assert.equal(row.getCell(12).value, "");
    }
  });
});
test("Excel round trip preserves literal customer names, shipment totals, time, assignments and frozen headers", async () => {
  const response = await exportApi.GET(
    req("/api/export/excel?dataset=orders", "admin"),
  );
  assert.equal(response.status, 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
  const orders = book.getWorksheet("Đơn hàng")!;
  assert.equal(orders.getCell("B2").value, '=HYPERLINK("unsafe")');
  assert.equal(orders.views[0].state, "frozen");
  assert(book.getWorksheet("Phân công")!.rowCount > 1);
  const sheet = book.getWorksheet("Đợt giao")!;
  assert(sheet.rowCount > 1);
  assert.match(String(sheet.getCell("C2").value), /\d{2}:\d{2}/);
  const items = book.getWorksheet("Chi tiết đợt giao")!;
  let quantity = 0;
  items.eachRow((r, n) => {
    if (n > 1 && r.getCell(2).value === fullFlow)
      quantity += Number(r.getCell(5).value);
  });
  assert.equal(quantity, 100);
});
test("Excel delivery and assignment sheets honor worker, color and size filters together", async () => {
  const response = await exportApi.GET(
    req(
      `/api/export/excel?dataset=delivery&employee_id=${workers.delivery[0]}&color=Không-tồn-tại`,
      "admin",
    ),
  );
  assert.equal(response.status, 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
  assert.equal(book.getWorksheet("Đợt giao")!.rowCount, 1);
  assert.equal(book.getWorksheet("Chi tiết đợt giao")!.rowCount, 1);
  assert.equal(book.getWorksheet("Nhật ký nghiệp vụ")!.rowCount, 1);
  const assigned = book.getWorksheet("Phân công")!;
  assigned.eachRow((row, n) => {
    if (n > 1) assert.equal(row.getCell(4).value, workers.delivery[0]);
  });
});
test("Product and QC images use authenticated uploads and survive full snapshots", async () => {
  const sharp = (await import("sharp")).default;
  const upload = await import("../src/app/api/product-images/route");
  const imageApi = await import("../src/app/api/product-images/[id]/route");
  const bytes = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "#808080" },
  })
    .png()
    .toBuffer();
  const request = (who: string, data: Buffer = bytes) => {
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array(data)], "product.png", { type: "image/png" }),
    );
    return new Request("http://localhost:3003/api/product-images", {
      method: "POST",
      headers: {
        cookie: people[who].cookie,
        origin: process.env.APP_ORIGIN!,
        "x-csrf-token": people[who].csrf,
      },
      body: form,
    });
  };
  assert.equal((await upload.POST(request("sewing"))).status, 403);
  assert.equal(
    (await upload.POST(request("quality", Buffer.from("invalid image"))))
      .status,
    422,
  );
  const product = await result<{ url: string }>(
    await upload.POST(request("admin")),
    201,
  );
  const defect = await result<{ url: string }>(
    await upload.POST(request("quality")),
    201,
  );
  const id = await order();
  await db
    .prepare("UPDATE orders SET image_url=? WHERE id=?")
    .run(product.url, id);
  await db
    .prepare("UPDATE order_variants SET sewn_qty=1,cut_qty=1 WHERE order_id=?")
    .run(id);
  await result(
    await operationApi.POST(
      req(`/api/orders/${id}/operations`, "quality", {
        version: (await current(id)).version,
        action: "qc",
        image_url: defect.url,
        operation_date: today(),
        entries: [{ color: "Đen", size: "M", quantity: 1, passed: 0 }],
      }),
      params("id", id),
    ),
    200,
  );
  const read = await imageApi.GET(
    req(product.url, "sewing"),
    params("id", product.url.split("/").at(-1)!),
  );
  assert.equal(read.status, 200);
  assert.equal(read.headers.get("content-type"), "image/jpeg");
  assert((await read.arrayBuffer()).byteLength > 0);
  const saved = await (
    await import("../src/lib/server/snapshot")
  ).captureSnapshot();
  assert.equal(saved.tables.product_images.length, 2);
  assert(
    saved.tables.operation_records.some((r) => r.image_url === defect.url),
  );
});
test("Register waits approval; Admin links own profile with departments and rejects worker-only account role", async () => {
  const username = "pendingqa";
  await result(
    await authApi.POST(
      req("/api/auth/register", undefined, {
        username,
        name: "Người phụ trách mới",
        password,
      }),
      params("action", "register"),
    ),
    201,
  );
  const row = (await db
    .prepare("SELECT id,status FROM accounts WHERE username=?")
    .get(username)) as { id: string; status: string };
  assert.equal(row.status, "pending");
  assert.equal(
    (
      await authApi.POST(
        req("/api/auth/login", undefined, { username, password }),
        params("action", "login"),
      )
    ).status,
    403,
  );
  const input = {
    id: row.id,
    action: "approve",
    createEmployee: true,
    roleIds: ["leader"],
    departmentIds: ["sewing", "packing"],
  };
  await result(
    await adminApi.POST(
      req("/api/admin/users", "admin", input),
      params("section", "users"),
    ),
  );
  const person = (await auth.account(row.id))!;
  assert.deepEqual(person.department_ids?.sort(), ["packing", "sewing"]);
  assert.equal(person.status, "active");
  const login = await authApi.POST(
    req("/api/auth/login", undefined, { username, password }),
    params("action", "login"),
  );
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie") || "", /HttpOnly/i);
  assert.match(login.headers.get("set-cookie") || "", /SameSite=lax/i);
  assert.equal(
    (
      await adminApi.POST(
        req("/api/admin/users", "admin", {
          ...input,
          action: "update",
          createEmployee: false,
          roleIds: ["worker"],
        }),
        params("section", "users"),
      )
    ).status,
    422,
  );
});
test("Admin changes memberships on linked profile, revokes sessions, and data history retains original department", async () => {
  const old = people.multi;
  await result(
    await staffApi.POST(
      req("/api/departments", "admin", {
        action: "update",
        id: "EMP-multi",
        name: "Kiêm nhiệm",
        department_ids: ["sewing"],
      }),
    ),
  );
  assert.equal((await ordersApi.GET(req("/api/orders", "multi"))).status, 401);
  people.multi = await session(old.id);
  assert.deepEqual((await ctx("multi")).user.department_ids, ["sewing"]);
});
test("Admin impersonation uses the represented department, records both actors, and cannot mutate memberships", async () => {
  const own = people.admin;
  const represented = await session(own.id);
  await db
    .prepare("UPDATE sessions SET represented_id=? WHERE token_hash=?")
    .run(people.sewing.id, auth.hashToken(represented.cookie.slice(14)));
  people.represented = represented;
  const id = await order();
  await assign(id, "Cắt", workers.cutting);
  assert.equal(
    (await record(id, "Cắt", workers.cutting[0], 1, "represented")).status,
    403,
  );
  await db
    .prepare("UPDATE order_variants SET cut_qty=5 WHERE order_id=?")
    .run(id);
  await assign(id, "May", workers.sewing);
  await result(
    await record(id, "May", workers.sewing[0], 1, "represented"),
    201,
  );
  const log = (await db
    .prepare(
      "SELECT actor_id,represented_id FROM production_logs WHERE order_id=?",
    )
    .get(id)) as { actor_id: string; represented_id: string };
  assert.equal(log.actor_id, own.id);
  assert.equal(log.represented_id, people.sewing.id);
  assert.equal(
    (
      await staffApi.POST(
        req("/api/departments", "represented", {
          action: "create",
          name: "Denied",
          department_ids: ["sewing"],
        }),
      )
    ).status,
    403,
  );
});
test("New snapshots include departments, assignments, shipment items, historical wages and reasons", async () => {
  const { captureSnapshot, writeSnapshot, readSnapshot } =
    await import("../src/lib/server/snapshot");
  const original = await captureSnapshot();
  const filename = join(folder, "snapshot.pg.json.gz");
  await writeSnapshot(filename, original);
  const saved = await readSnapshot(filename);
  for (const table of [
    "departments",
    "employee_departments",
    "work_assignments",
    "shipments",
    "shipment_items",
  ])
    assert(saved.tables[table]?.length);
  assert.equal(
    saved.tables.production_logs.reduce((n, r) => n + Number(r.total_pay), 0),
    original.tables.production_logs.reduce(
      (n, r) => n + Number(r.total_pay),
      0,
    ),
  );
  assert(
    saved.tables.shipments.some((r) => r.reason === "Khách đổi lịch nhận"),
  );
});
test("Business archive includes new model and excludes account credentials", async () => {
  const { runBackup, readBackup } = await import("../src/lib/server/backup");
  const { gunzipSync } = await import("node:zlib");
  const files = await runBackup();
  const archive = JSON.parse(
    gunzipSync((await readBackup(files.archive))!).toString(),
  );
  for (const key of [
    "departments",
    "employeeDepartments",
    "assignments",
    "shipments",
    "shipmentItems",
  ])
    assert(Array.isArray(archive[key]));
  assert(!archive.accounts);
  assert(!JSON.stringify(archive).includes("password_hash"));
});
test("Long department lists render bounded accessible tables rather than hundreds of cards", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { DepartmentsPanel } =
    await import("../src/components/DepartmentWorkspace");
  const base = await current(fullFlow);
  const orders = Array.from({ length: 120 }, (_, i) => ({
    ...base,
    id: `UX-${String(i + 1).padStart(3, "0")}`,
    status: "on_track",
    current_stage: "cat",
  })) as Order[];
  const html = renderToStaticMarkup(
    React.createElement(DepartmentsPanel, {
      orders,
      session: auth.sessionData(await ctx("admin")),
      onOpen: () => {},
    }),
  );
  assert.match(html, /UX-020/);
  assert.doesNotMatch(html, /UX-021/);
  assert.match(html, /Trang 1\/6/);
  assert.match(html, /Mở công việc/);
  assert.doesNotMatch(html, /Chuyền/);
});
test("New orders and worker profiles carry no fabricated legacy line number", async () => {
  const id = await order();
  assert.equal((await current(id)).line_id, null);
  await result(
    await staffApi.POST(
      req("/api/departments", "admin", {
        action: "create",
        name: "Không có chuyền",
        department_ids: ["sewing"],
      }),
    ),
  );
  assert.equal(
    (
      (await db
        .prepare("SELECT line_id FROM employees WHERE name='Không có chuyền'")
        .get()) as { line_id: number | null }
    ).line_id,
    null,
  );
  assert(
    !("line_ids" in JSON.parse(JSON.stringify((await ctx("sewing")).user))),
  );
});
test("Multiple roles combine actions but never broaden a person's assigned departments", async () => {
  await db
    .prepare("INSERT INTO account_roles VALUES (?, 'qc')")
    .run(people.cutting.id);
  const { permits } = await import("../src/lib/permissions");
  const user = (await ctx("cutting")).user;
  assert(permits(user, "production.create", { stage: "Cắt" }));
  assert(!permits(user, "qc.manage", { stage: "QC" }));
  await db
    .prepare("DELETE FROM account_roles WHERE account_id=? AND role_id='qc'")
    .run(people.cutting.id);
});
test("Multi-department operator can use both stages; withdrawing one removes that access immediately", async () => {
  await operator("dualqa", "leader", ["cutting", "sewing"]);
  const id = await order();
  await assign(id, "Cắt", workers.cutting);
  await assign(id, "May", workers.sewing);
  await result(await record(id, "Cắt", workers.cutting[0], 3, "dualqa"), 201);
  await result(await record(id, "May", workers.sewing[0], 2, "dualqa"), 201);
  await result(
    await staffApi.POST(
      req("/api/departments", "admin", {
        action: "update",
        id: "EMP-dualqa",
        name: "Kiêm nhiệm",
        department_ids: ["sewing"],
      }),
    ),
  );
  people.dualqa = await session(people.dualqa.id);
  assert.equal(
    (await record(id, "Cắt", workers.cutting[0], 1, "dualqa")).status,
    403,
  );
});
test("Repair is recorded by the sewing department; QC keeps inspection and re-inspection only", async () => {
  const id = await order();
  await db
    .prepare(
      "UPDATE order_variants SET cut_qty=1,sewn_qty=1,qc_inspected_qty=1,defect_qty=1 WHERE order_id=?",
    )
    .run(id);
  // Sewers are eligible repairers; QC workers are not.
  await assign(id, "Sửa hàng", workers.sewing);
  assert.equal(
    (
      await assignmentApi.POST(
        req(`/api/orders/${id}/assignments`, "admin", {
          version: (await current(id)).version,
          stage: "Sửa hàng",
          employee_ids: workers.quality,
        }),
        params("id", id),
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await record(id, "Sửa hàng", workers.sewing[0], 1, "quality", {
        record_rework: true,
      })
    ).status,
    403,
  );
  await result(
    await record(id, "Sửa hàng", workers.sewing[0], 1, "sewing", {
      record_rework: true,
    }),
    201,
  );
  const op = (await db
    .prepare(
      "SELECT department_id FROM operation_records WHERE order_id=? AND action='rework'",
    )
    .get(id)) as { department_id: string };
  assert.equal(op.department_id, "sewing");
});
test("A worker cannot be credited for someone else's repair or QC inspection", async () => {
  const id = await order();
  await db
    .prepare(
      "UPDATE order_variants SET cut_qty=5,sewn_qty=5,qc_inspected_qty=5,defect_qty=5 WHERE order_id=?",
    )
    .run(id);
  await assign(id, "Sửa hàng", workers.sewing);
  await result(
    await operationApi.POST(
      req(`/api/orders/${id}/operations`, "sewing", {
        version: (await current(id)).version,
        action: "rework",
        color: "Đen",
        size: "M",
        quantity: 2,
        worker_id: workers.sewing[0],
      }),
      params("id", id),
    ),
  );
  assert.equal(
    (await record(id, "Sửa hàng", workers.sewing[1], 2, "sewing")).status,
    422,
  );
  await result(
    await record(id, "Sửa hàng", workers.sewing[0], 2, "sewing"),
    201,
  );
});
test("QC and shipment batches reject duplicate rows without adding records", async () => {
  const id = await order();
  await db
    .prepare(
      "UPDATE order_variants SET cut_qty=100,sewn_qty=100,packed_qty=100 WHERE order_id=?",
    )
    .run(id);
  await assign(id, "Giao hàng", workers.delivery);
  const duplicated = [
    { color: "Đen", size: "M", quantity: 1 },
    { color: "Đen", size: "M", quantity: 1 },
  ];
  assert.equal(
    (
      await operationApi.POST(
        req(`/api/orders/${id}/operations`, "quality", {
          version: (await current(id)).version,
          action: "qc",
          entries: duplicated,
        }),
        params("id", id),
      )
    ).status,
    422,
  );
  assert.equal((await ship(id, 1, { items: duplicated })).status, 422);
  assert.equal((await current(id)).variants?.[0].qc_passed_qty, 0);
});
test("Logging in as a worker-only account never issues a business session", async () => {
  const response = await authApi.POST(
    req("/api/auth/login", undefined, { username: "worker", password }),
    params("action", "login"),
  );
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("set-cookie"), null);
});
test("Account lock, password reset and password change revoke every old session", async () => {
  await operator("credentialsqa", "leader", ["sewing"]);
  const id = people.credentialsqa.id;
  await result(
    await adminApi.POST(
      req("/api/admin/users", "admin", { id, action: "lock" }),
      params("section", "users"),
    ),
  );
  assert.equal(
    (await ordersApi.GET(req("/api/orders", "credentialsqa"))).status,
    401,
  );
  await result(
    await adminApi.POST(
      req("/api/admin/users", "admin", { id, action: "unlock" }),
      params("section", "users"),
    ),
  );
  people.credentialsqa = await session(id);
  const temporary = "Temporary-QA-Password-123!";
  await result(
    await adminApi.POST(
      req("/api/admin/users", "admin", {
        id,
        action: "reset",
        temporaryPassword: temporary,
      }),
      params("section", "users"),
    ),
  );
  assert.equal(
    (await ordersApi.GET(req("/api/orders", "credentialsqa"))).status,
    401,
  );
  people.credentialsqa = await session(id);
  assert.equal(
    (await ordersApi.GET(req("/api/orders", "credentialsqa"))).status,
    403,
  );
  await result(
    await authApi.POST(
      req("/api/auth/password", "credentialsqa", {
        currentPassword: temporary,
        newPassword: "Changed-QA-Password-456!",
      }),
      params("action", "password"),
    ),
  );
  assert.equal(
    (await ordersApi.GET(req("/api/orders", "credentialsqa"))).status,
    401,
  );
  assert.equal((await auth.account(id))?.must_change_password, 0);
});
test("Login rate limit and registration duplicate checks are enforced", async () => {
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await authApi.POST(
          req("/api/auth/login", undefined, {
            username: "missingqa",
            password: "incorrect",
          }),
          params("action", "login"),
        )
      ).status,
      401,
    );
  assert.equal(
    (
      await authApi.POST(
        req("/api/auth/login", undefined, {
          username: "missingqa",
          password: "incorrect",
        }),
        params("action", "login"),
      )
    ).status,
    429,
  );
  assert.equal(
    (
      await authApi.POST(
        req("/api/auth/register", undefined, {
          username: "pendingqa",
          name: "Trùng tên",
          password,
        }),
        params("action", "register"),
      )
    ).status,
    422,
  );
});
test("Self-escalation and account identity substitution are rejected", async () => {
  assert.equal(
    (
      await adminApi.POST(
        req("/api/admin/users", "admin", {
          id: people.admin.id,
          action: "update",
          roleIds: ["admin"],
          departmentIds: ["management"],
        }),
        params("section", "users"),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await adminApi.POST(
        req("/api/admin/users", "admin", {
          id: people.sewing.id,
          action: "update",
          employeeId: workers.sewing[0],
          roleIds: ["leader"],
          departmentIds: ["sewing"],
        }),
        params("section", "users"),
      )
    ).status,
    422,
  );
});
test("Inactive linked profiles cannot log in; Admin profiles cannot be deactivated through worker management", async () => {
  await operator("inactiveqa", "leader", ["sewing"]);
  await result(
    await staffApi.POST(
      req("/api/departments", "admin", {
        action: "update",
        id: "EMP-inactiveqa",
        name: "Ngừng làm",
        department_ids: ["sewing"],
        active: 0,
      }),
    ),
  );
  assert.equal(
    (
      await authApi.POST(
        req("/api/auth/login", undefined, { username: "inactiveqa", password }),
        params("action", "login"),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await staffApi.POST(
        req("/api/departments", "admin", {
          action: "update",
          id: "EMP-admin",
          name: "Admin",
          department_ids: ["management"],
          active: 0,
        }),
      )
    ).status,
    403,
  );
});
test("Several workers save in one atomic entry, each with own logs and wages", async () => {
  const id = await order([
    { color: "Đen", size: "M", quantity: 10 },
    { color: "Trắng", size: "L", quantity: 10 },
  ]);
  await assign(id, "Cắt", workers.cutting);
  const [a, b] = workers.cutting;
  const send = async (list: unknown) =>
    productionApi.POST(
      req("/api/production/log", "cutting", {
        version: (await current(id)).version,
        order_id: id,
        stage: "Cắt",
        log_date: today(),
        workers: list,
      }),
    );
  const count = async () =>
    (
      (await db
        .prepare("SELECT COUNT(*) n FROM production_logs WHERE order_id=?")
        .get(id)) as { n: number }
    ).n;
  // The cut limit is shared across workers: 9 + 7 > floor(10 * 1.5) rolls back everything.
  assert.equal(
    (
      await send([
        { employee_id: a, entries: [{ color: "Đen", size: "M", quantity: 9 }] },
        { employee_id: b, entries: [{ color: "Đen", size: "M", quantity: 7 }] },
      ])
    ).status,
    422,
  );
  assert.equal(
    (
      await send([
        { employee_id: a, entries: [{ color: "Đen", size: "M", quantity: 1 }] },
        {
          employee_id: a,
          entries: [{ color: "Trắng", size: "L", quantity: 1 }],
        },
      ])
    ).status,
    422,
  );
  assert.equal(
    (
      await send([
        { employee_id: a, entries: [{ color: "Đen", size: "M", quantity: 1 }] },
        {
          employee_id: workers.sewing[0],
          entries: [{ color: "Trắng", size: "L", quantity: 1 }],
        },
      ])
    ).status,
    422,
  );
  assert.equal(await count(), 0);
  const saved = await result<{ count: number; workers: number }>(
    await send([
      {
        employee_id: a,
        entries: [
          { color: "Đen", size: "M", quantity: 6 },
          { color: "Trắng", size: "L", quantity: 4 },
        ],
      },
      {
        employee_id: b,
        entries: [
          { color: "Đen", size: "M", quantity: 4 },
          { color: "Trắng", size: "L", quantity: 6 },
        ],
      },
    ]),
    201,
  );
  assert.equal(saved.workers, 2);
  assert.equal(saved.count, 4);
  assert.deepEqual(
    (await current(id)).variants?.map((v) => v.cut_qty),
    [10, 10],
  );
  const pay = (await db
    .prepare(
      "SELECT employee_id,SUM(quantity) q,SUM(total_pay) p FROM production_logs WHERE order_id=? GROUP BY employee_id ORDER BY employee_id",
    )
    .all(id)) as { employee_id: string; q: number; p: number }[];
  assert.deepEqual(
    Object.fromEntries(
      pay.map((r) => [r.employee_id, [Number(r.q), Number(r.p)]]),
    ),
    { [a]: [10, 10000], [b]: [10, 10000] },
  );
});
test("Management prepares an order in one step and keeps every stage transition", async () => {
  const id = await order(
    [{ color: "Đen", size: "M", quantity: 5 }],
    "nhan_don",
  );
  const prepare = async (who: string) =>
    detailApi.PATCH(
      req(
        `/api/orders/${id}`,
        who,
        { version: (await current(id)).version, prepare: true },
        { method: "PATCH" },
      ),
      params("id", id),
    );
  assert.equal((await prepare("cutting")).status, 403);
  assert.equal((await current(id)).current_stage, "nhan_don");
  await result(await prepare("management"));
  assert.equal((await current(id)).current_stage, "cat");
  const stages = (await db
    .prepare(
      "SELECT stage_key,status FROM order_stages WHERE order_id=? AND stage_key IN ('nhan_don','kiem_npl','kiem_rap','cat') ORDER BY stage_key",
    )
    .all(id)) as { stage_key: string; status: string }[];
  assert.deepEqual(
    Object.fromEntries(stages.map((s) => [s.stage_key, s.status])),
    {
      cat: "in_progress",
      kiem_npl: "completed",
      kiem_rap: "completed",
      nhan_don: "completed",
    },
  );
  assert.equal((await current(id)).variants?.[0].cut_qty, 0);
  assert.equal((await prepare("management")).status, 422);
});
test("Quick assignment fills only unassigned tasks with each department's active workers", async () => {
  const id = await order([{ color: "Đen", size: "M", quantity: 5 }]);
  await result(
    await ratesApi.POST(
      req("/api/rates", "admin", {
        order_id: id,
        stage: "May",
        version: (await current(id)).version,
        work_items: [
          { name: "Ráp thân", unit_price: 1000 },
          { name: "Tra tay", unit_price: 1000 },
        ],
      }),
    ),
  );
  await assign(id, "Cắt", [workers.cutting[0]]);
  const quick = async (who: string) =>
    assignmentApi.POST(
      req(`/api/orders/${id}/assignments`, who, {
        version: (await current(id)).version,
        quick: true,
      }),
      params("id", id),
    );
  assert.equal((await quick("worker")).status, 403);
  await result(await quick("management"));
  const rows = (await db
    .prepare(
      "SELECT stage,work_item_id,employee_id FROM work_assignments WHERE order_id=? AND active=1",
    )
    .all(id)) as {
    stage: string;
    work_item_id: number | null;
    employee_id: string;
  }[];
  assert.deepEqual(
    rows.filter((r) => r.stage === "Cắt").map((r) => r.employee_id),
    [workers.cutting[0]],
  );
  const parts = (await current(id)).work_items!;
  assert.equal(parts.length, 2);
  for (const p of parts) {
    const ids = rows
      .filter((r) => r.stage === "May" && r.work_item_id === p.id)
      .map((r) => r.employee_id);
    assert.ok(
      ids.includes(workers.sewing[0]) && ids.includes(workers.sewing[1]),
    );
  }
  for (const stage of ["Sửa hàng", "Đóng gói", "Giao hàng"])
    assert.ok(rows.some((r) => r.stage === stage));
  const employees = (await db
    .prepare(
      "SELECT e.id,e.active,d.department_id FROM employees e JOIN employee_departments d ON d.employee_id=e.id",
    )
    .all()) as { id: string; active: number; department_id: string }[];
  for (const r of rows)
    assert.ok(
      employees.some(
        (e) =>
          e.id === r.employee_id &&
          e.active !== 0 &&
          e.department_id ===
            {
              Cắt: "cutting",
              May: "sewing",
              "Sửa hàng": "sewing",
              "Đóng gói": "packing",
              "Giao hàng": "delivery",
            }[r.stage],
      ),
    );
  // Nothing left to fill: a second run changes nothing.
  const before = rows.length;
  await result(await quick("management"));
  assert.equal(
    (
      (await db
        .prepare(
          "SELECT COUNT(*) n FROM work_assignments WHERE order_id=? AND active=1",
        )
        .get(id)) as { n: number }
    ).n,
    before,
  );
});
test("Rates copy from an earlier order without touching locked stages", async () => {
  const source = await order([{ color: "Đen", size: "M", quantity: 5 }]);
  await db
    .prepare(
      "UPDATE order_rates SET unit_price=2500 WHERE order_id=? AND stage='Cắt'",
    )
    .run(source);
  await result(
    await ratesApi.POST(
      req("/api/rates", "admin", {
        order_id: source,
        stage: "May",
        version: (await current(source)).version,
        work_items: [
          { name: "Ráp thân", unit_price: 1200 },
          { name: "Tra tay", unit_price: 800 },
        ],
      }),
    ),
  );
  const copy = async (target: string, who = "admin") =>
    ratesApi.POST(
      req("/api/rates", who, {
        order_id: target,
        copy_from: source,
        version: (await current(target)).version,
      }),
    );
  const fresh = await order([{ color: "Đen", size: "M", quantity: 5 }]);
  assert.equal((await copy(fresh, "management")).status, 403);
  const done = await result<{ copied: string[]; skipped: string[] }>(
    await copy(fresh),
  );
  assert.deepEqual(done.skipped, []);
  assert.equal(
    (
      (await db
        .prepare(
          "SELECT unit_price FROM order_rates WHERE order_id=? AND stage='Cắt'",
        )
        .get(fresh)) as { unit_price: number }
    ).unit_price,
    2500,
  );
  assert.deepEqual(
    (
      (await db
        .prepare(
          "SELECT name,unit_price FROM order_work_items WHERE order_id=? AND stage='May' ORDER BY id",
        )
        .all(fresh)) as { name: string; unit_price: number }[]
    ).map((p) => [p.name, Number(p.unit_price)]),
    [
      ["Ráp thân", 1200],
      ["Tra tay", 800],
    ],
  );
  const locked = await order([{ color: "Đen", size: "M", quantity: 5 }]);
  await assign(locked, "May", workers.sewing);
  const partial = await result<{ copied: string[]; skipped: string[] }>(
    await copy(locked),
  );
  assert.equal(partial.skipped.length, 1);
  assert.match(partial.skipped[0], /^May/);
  assert.equal((await current(locked)).work_items?.length || 0, 0);
  assert.equal(
    (
      (await db
        .prepare(
          "SELECT unit_price FROM order_rates WHERE order_id=? AND stage='Cắt'",
        )
        .get(locked)) as { unit_price: number }
    ).unit_price,
    2500,
  );
  assert.equal((await copy(source)).status, 422);
});
const policyApi = await import("../src/app/api/settings/policy/route");
const materialsApi = await import("../src/app/api/orders/[id]/materials/route");
const setPolicy = async (
  who: string,
  input: {
    overcut_percent: number;
    overcut_paid: boolean;
    defect_penalty_percent: number;
  },
) => policyApi.PUT(req("/api/settings/policy", who, input, { method: "PUT" }));
test("Overcut limit and payment follow the workshop policy; sewing never exceeds the order", async () => {
  const id = await order([{ color: "Đen", size: "M", quantity: 10 }]);
  await assign(id, "Cắt", workers.cutting);
  await assign(id, "May", workers.sewing);
  // Default policy: +10%, so 10 ordered allows 11 and rejects 12.
  const rejected = await record(id, "Cắt", workers.cutting[0], 12, "cutting");
  assert.equal(rejected.status, 422);
  assert.match(JSON.stringify(await rejected.json()), /tối đa 11/);
  // Only an account with the rate permission changes the policy.
  const wide = {
    overcut_percent: 50,
    overcut_paid: true,
    defect_penalty_percent: 0,
  };
  assert.equal((await setPolicy("management", wide)).status, 403);
  await result(await setPolicy("admin", wide));
  await result(await record(id, "Cắt", workers.cutting[0], 12, "cutting"), 201);
  assert.equal(
    (await record(id, "Cắt", workers.cutting[1], 4, "cutting")).status,
    422,
  );
  await result(await record(id, "Cắt", workers.cutting[1], 3, "cutting"), 201);
  assert.equal((await current(id)).variants?.[0].cut_qty, 15);
  // Surplus pieces are paid as cut, yet sewing stops at the ordered quantity.
  await result(await record(id, "May", workers.sewing[0], 10, "sewing"), 201);
  assert.equal(
    (await record(id, "May", workers.sewing[1], 1, "sewing")).status,
    422,
  );
  const cutPay = async (target: string) =>
    Number(
      (
        (await db
          .prepare(
            "SELECT COALESCE(SUM(total_pay),0) n FROM production_logs WHERE order_id=? AND stage='Cắt'",
          )
          .get(target)) as { n: number }
      ).n,
    );
  assert.equal(await cutPay(id), 15000);
  assert.equal(
    (await record(id, "May", workers.sewing[0], 1, "cutting")).status,
    403,
  );
  // Unpaid surplus: the part above the order is saved at zero rate.
  await result(await setPolicy("admin", { ...wide, overcut_paid: false }));
  const unpaid = await order([{ color: "Đen", size: "M", quantity: 10 }]);
  await assign(unpaid, "Cắt", workers.cutting);
  await result(
    await record(unpaid, "Cắt", workers.cutting[0], 13, "cutting"),
    201,
  );
  assert.equal((await current(unpaid)).variants?.[0].cut_qty, 13);
  assert.equal(await cutPay(unpaid), 10000);
  const rows = (await db
    .prepare(
      "SELECT quantity,unit_price,total_pay,reason FROM production_logs WHERE order_id=? ORDER BY id",
    )
    .all(unpaid)) as {
    quantity: number;
    unit_price: number;
    total_pay: number;
    reason: string;
  }[];
  assert.deepEqual(
    rows.map((r) => [
      Number(r.quantity),
      Number(r.unit_price),
      Number(r.total_pay),
    ]),
    [
      [10, 1000, 10000],
      [3, 0, 0],
    ],
  );
  assert.match(rows[1].reason, /không tính công/);
  await result(
    await setPolicy("admin", {
      overcut_percent: 10,
      overcut_paid: true,
      defect_penalty_percent: 0,
    }),
  );
  assert.equal(
    (
      await setPolicy("admin", {
        overcut_percent: 101,
        overcut_paid: true,
        defect_penalty_percent: 0,
      })
    ).status,
    422,
  );
});
test("QC attributes defects to the sewers who made them and the payroll view totals them", async () => {
  const id = await order([{ color: "Đen", size: "M", quantity: 10 }]);
  await db
    .prepare("UPDATE order_variants SET cut_qty=10 WHERE order_id=?")
    .run(id);
  await assign(id, "May", workers.sewing);
  await result(await record(id, "May", workers.sewing[0], 6, "sewing"), 201);
  await result(await record(id, "May", workers.sewing[1], 4, "sewing"), 201);
  const inspect = async (blame: unknown, passed = 7) =>
    operationApi.POST(
      req(`/api/orders/${id}/operations`, "quality", {
        version: (await current(id)).version,
        action: "qc",
        operation_date: today(),
        entries: [{ color: "Đen", size: "M", quantity: 10, passed, blame }],
      }),
      params("id", id),
    );
  const [a, b] = workers.sewing;
  // More blamed than defective, or more than the worker produced, is rejected.
  assert.equal((await inspect([{ employee_id: a, quantity: 4 }])).status, 422);
  assert.equal(
    (await inspect([{ employee_id: workers.cutting[0], quantity: 1 }])).status,
    422,
  );
  assert.equal(
    (await inspect([{ employee_id: b, quantity: 5 }], 4)).status,
    422,
  );
  assert.equal((await current(id)).variants?.[0].qc_passed_qty, 0);
  await result(
    await inspect([
      { employee_id: a, quantity: 2 },
      { employee_id: b, quantity: 1 },
    ]),
  );
  const totals = (await db
    .prepare(
      "SELECT employee_id,SUM(quantity) q FROM defect_attributions WHERE order_id=? GROUP BY employee_id",
    )
    .all(id)) as { employee_id: string; q: number }[];
  assert.deepEqual(
    Object.fromEntries(totals.map((t) => [t.employee_id, Number(t.q)])),
    { [a]: 2, [b]: 1 },
  );
  await result(
    await setPolicy("admin", {
      overcut_percent: 10,
      overcut_paid: true,
      defect_penalty_percent: 50,
    }),
  );
  const payroll = await result<{
    defects: {
      employee_id: string;
      quantity: number;
      value: number;
      penalty: number;
    }[];
  }>(await payrollApi.GET(req("/api/payroll", "admin")));
  const mine = payroll.defects.find((d) => d.employee_id === a)!;
  assert.equal(Number(mine.quantity) >= 2, true);
  assert.equal(mine.penalty, Math.round(mine.value / 2));
  await result(
    await setPolicy("admin", {
      overcut_percent: 10,
      overcut_paid: true,
      defect_penalty_percent: 0,
    }),
  );
  // Management has no payroll permission, so no wage figures leak.
  assert.equal(
    (await payrollApi.GET(req("/api/payroll", "management"))).status,
    403,
  );
});
test("Materials track needed, received, defective and used amounts per order", async () => {
  const id = await order([{ color: "Đen", size: "M", quantity: 10 }]);
  const send = async (who: string, input: Record<string, unknown>) =>
    materialsApi.POST(
      req(`/api/orders/${id}/materials`, who, input),
      params("id", id),
    );
  assert.equal(
    (
      await send("cutting", {
        action: "add",
        name: "Vải chính",
        unit: "m",
        required_qty: 20,
      })
    ).status,
    403,
  );
  const added = await result<{ items: { id: number }[] }>(
    await send("management", {
      action: "add",
      name: "Vải chính",
      unit: "m",
      required_qty: 20,
    }),
    201,
  );
  assert.equal(
    (await send("management", { action: "add", name: "vải chính", unit: "m" }))
      .status,
    409,
  );
  const material = added.items[0].id;
  const move = (who: string, kind: string, quantity: number) =>
    send(who, { action: "move", material_id: material, kind, quantity });
  await result(await move("management", "receive", 18.5), 201);
  await result(await move("management", "defect", 1.5), 201);
  // The cutting department records usage but cannot exceed what is on hand.
  assert.equal((await move("cutting", "use", 20)).status, 422);
  await result(await move("cutting", "use", 12.25), 201);
  assert.equal((await move("worker", "use", 1)).status, 403);
  const detail = await result<{
    materials: {
      items: {
        received: number;
        defect: number;
        used: number;
        required: number;
      }[];
    };
  }>(
    await detailApi.GET(
      req(`/api/orders/${id}`, "management"),
      params("id", id),
    ),
  );
  const item = detail.materials.items[0];
  assert.deepEqual(
    [item.required, item.received, item.defect, item.used],
    [20, 18.5, 1.5, 12.25],
  );
});
test("Shortage explanations are limited to the remaining shortage and never move quantities", async () => {
  const id = await order([
    { color: "Đen", size: "M", quantity: 10 },
    { color: "Trắng", size: "L", quantity: 10 },
  ]);
  const explain = async (who: string, input: Record<string, unknown>) =>
    shortageApi.POST(
      req(`/api/orders/${id}/shortages`, who, input),
      params("id", id),
    );
  const before = JSON.stringify((await current(id)).variants);
  assert.equal(
    (
      await explain("worker", {
        color: "Đen",
        size: "M",
        quantity: 1,
        cause: "Lỗi vải",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await explain("management", {
        color: "Đen",
        size: "M",
        quantity: 1,
        cause: "Không có trong danh sách",
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await explain("management", {
        color: "Đỏ",
        size: "M",
        quantity: 1,
        cause: "Lỗi vải",
      })
    ).status,
    422,
  );
  await result(
    await explain("management", {
      color: "Đen",
      size: "M",
      quantity: 6,
      cause: "Lỗi vải",
      note: "Cuộn vải bị loang",
    }),
    201,
  );
  await result(
    await explain("cutting", {
      color: "Đen",
      size: "M",
      quantity: 4,
      cause: "Cắt thiếu",
    }),
    201,
  );
  // Everything is explained now: more would exceed the shortage.
  assert.equal(
    (
      await explain("management", {
        color: "Đen",
        size: "M",
        quantity: 1,
        cause: "Khác",
      })
    ).status,
    422,
  );
  assert.equal(
    JSON.stringify(
      (await current(id)).variants?.map((v) => [v.cut_qty, v.delivered_qty]),
    ),
    JSON.stringify(
      JSON.parse(before).map(
        (v: { cut_qty: number; delivered_qty: number }) => [
          v.cut_qty,
          v.delivered_qty,
        ],
      ),
    ),
  );
  const detail = await result<{
    operations: {
      action: string;
      color: string;
      reason: string;
      notes: string;
    }[];
  }>(
    await detailApi.GET(
      req(`/api/orders/${id}`, "management"),
      params("id", id),
    ),
  );
  const rows = detail.operations.filter((r) => r.action === "shortage");
  assert.deepEqual(rows.map((r) => r.reason).sort(), ["Cắt thiếu", "Lỗi vải"]);
  assert.ok(rows.some((r) => r.notes === "Cuộn vải bị loang"));
  assert.ok(
    (
      (await db
        .prepare(
          "SELECT COUNT(*) n FROM audit_logs WHERE action='Ghi nguyên nhân thiếu'",
        )
        .get()) as { n: number }
    ).n >= 2,
  );
});
test("Workshop simulation: seven operators complete a 100-piece, two-shipment order and close piecework payroll", async () => {
  await operator("scenariofinance", "director", ["management"]);
  const trace: {
    actor: string;
    task: string;
    status: number;
    write: boolean;
  }[] = [];
  async function step<T = Record<string, unknown>>(
    actor: string,
    task: string,
    response: Promise<Response>,
    status = 200,
    write = true,
  ) {
    const reply = await response;
    trace.push({ actor, task, status: reply.status, write });
    return result<T>(reply, status);
  }
  const created = await step<Order>(
    "management",
    "Tạo đơn 100 áo: Trắng/M 60, Đen/L 40",
    ordersApi.POST(
      req("/api/orders", "management", {
        order_code: "SIM-XUONG-100",
        customer: "Khách mô phỏng",
        product_name: "Áo sơ mi mô phỏng",
        order_date: "2020-01-01",
        deadline: "2030-01-01",
        variants: [
          { color: "Trắng", size: "M", quantity: 60 },
          { color: "Đen", size: "L", quantity: 40 },
        ],
      }),
    ),
    201,
  );
  const id = created.id;
  for (const [stage, unit_price] of [
    ["Cắt", 2000],
    ["May", 10000],
    ["QC", 800],
    ["Sửa hàng", 3000],
    ["Đóng gói", 1000],
  ] as const)
    await step(
      "scenariofinance",
      `Đặt giá ${stage}: ${unit_price}`,
      ratesApi.POST(
        req("/api/rates", "scenariofinance", {
          order_id: id,
          stage,
          unit_price,
        }),
      ),
    );
  for (const [stage, dep] of [
    ["Cắt", "cutting"],
    ["May", "sewing"],
    ["Sửa hàng", "sewing"],
    ["Đóng gói", "packing"],
    ["Giao hàng", "delivery"],
  ] as const)
    await step(
      "management",
      `Phân công ${stage}`,
      assignmentApi.POST(
        req(`/api/orders/${id}/assignments`, "management", {
          version: (await current(id)).version,
          stage,
          employee_ids: workers[dep],
        }),
        params("id", id),
      ),
    );
  const move = async (stage: string) =>
    step(
      "management",
      `Điều phối → ${stage}`,
      detailApi.PATCH(
        req(
          `/api/orders/${id}`,
          "management",
          { version: (await current(id)).version, stage },
          { method: "PATCH" },
        ),
        params("id", id),
      ),
    );
  for (const stage of ["kiem_npl", "kiem_rap", "cat"]) await move(stage);
  const batch = async (
    who: string,
    stage: string,
    employee: string,
    white: number,
    black: number,
  ) =>
    step(
      who,
      `Ghi ${stage}: Trắng/M ${white}, Đen/L ${black}`,
      productionApi.POST(
        req("/api/production/log", who, {
          version: (await current(id)).version,
          order_id: id,
          employee_id: employee,
          stage,
          log_date: today(),
          record_packing: stage === "Đóng gói",
          record_rework: stage === "Sửa hàng",
          entries: [
            { color: "Trắng", size: "M", quantity: white },
            { color: "Đen", size: "L", quantity: black },
          ].filter((r) => r.quantity > 0),
        }),
      ),
      201,
    );
  const inspection = async (
    action: string,
    white: number,
    black: number,
    defects = 0,
  ) =>
    step(
      "quality",
      `${action}: kiểm ${white + black}, lỗi ${defects}`,
      operationApi.POST(
        req(`/api/orders/${id}/operations`, "quality", {
          version: (await current(id)).version,
          action,
          operation_date: today(),
          defect_type: defects ? "Lệch đường may" : "",
          entries: [
            {
              color: "Trắng",
              size: "M",
              quantity: white,
              passed: white - defects,
            },
            { color: "Đen", size: "L", quantity: black, passed: black },
          ].filter((r) => r.quantity > 0),
        }),
        params("id", id),
      ),
    );
  const shipment = async (white: number, black: number) =>
    step(
      "delivery",
      `Giao đợt ${white + black}`,
      shipmentApi.POST(
        req(`/api/orders/${id}/shipments`, "delivery", {
          version: (await current(id)).version,
          worker_id: workers.delivery[0],
          delivered_at: deliveredAt(),
          packages: white + black === 20 ? 1 : 4,
          notes: "Giao từng phần theo lịch nhận của khách",
          items: [
            { color: "Trắng", size: "M", quantity: white },
            { color: "Đen", size: "L", quantity: black },
          ],
        }),
        params("id", id),
      ),
      201,
    );
  await batch("cutting", "Cắt", workers.cutting[0], 12, 8);
  await move("may");
  await batch("sewing", "May", workers.sewing[0], 12, 8);
  await move("qc");
  await inspection("qc", 12, 8, 2);
  await move("sua_hang");
  await batch("sewing", "Sửa hàng", workers.sewing[0], 2, 0);
  await move("qc_lai");
  await inspection("reinspect", 2, 0);
  await move("dong_goi");
  await batch("packing", "Đóng gói", workers.packing[0], 12, 8);
  await move("giao_hang");
  await shipment(12, 8);
  await batch("cutting", "Cắt", workers.cutting[0], 48, 32);
  await batch("sewing", "May", workers.sewing[1], 48, 32);
  await inspection("qc", 48, 32);
  await batch("packing", "Đóng gói", workers.packing[0], 48, 32);
  await shipment(48, 32);
  await move("hoan_thanh");
  const logs = (await db
    .prepare(
      "SELECT employee_id,stage,quantity,total_pay FROM production_logs WHERE order_id=?",
    )
    .all(id)) as {
    employee_id: string;
    stage: string;
    quantity: number;
    total_pay: number;
  }[];
  const stages = [...new Set(logs.map((r) => r.stage))].map((stage) => ({
    stage,
    quantity: logs
      .filter((r) => r.stage === stage)
      .reduce((n, r) => n + r.quantity, 0),
    pay: logs
      .filter((r) => r.stage === stage)
      .reduce((n, r) => n + r.total_pay, 0),
  }));
  assert.equal(
    logs.reduce((n, r) => n + r.total_pay, 0),
    1306000,
  );
  assert.equal(
    logs.filter((r) => r.stage === "QC").length,
    0,
    "QC screen currently records physical inspection but not wages",
  );
  const final = await current(id);
  assert.equal(final.status, "completed");
  assert(final.variants!.every((v) => v.quantity === v.delivered_qty));
  await step(
    "management",
    "Không có quyền xem lương (kiểm tra giới hạn)",
    payrollApi.GET(
      req(`/api/payroll?month=${today().slice(0, 7)}`, "management"),
    ),
    403,
    false,
  );
  await step(
    "scenariofinance",
    "Đối chiếu lương tháng",
    payrollApi.GET(
      req(`/api/payroll?month=${today().slice(0, 7)}`, "scenariofinance"),
    ),
    200,
    false,
  );
  const excel = await exportApi.GET(
    req(
      `/api/export/excel?dataset=payroll&product=${id}&month=${today().slice(0, 7)}`,
      "scenariofinance",
    ),
  );
  assert.equal(excel.status, 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await excel.arrayBuffer()) as never);
  assert(book.worksheets.some((s) => s.rowCount > 1));
  trace.push({
    actor: "scenariofinance",
    task: "Xuất và đọc lại Excel lương",
    status: 200,
    write: false,
  });
  await step(
    "scenariofinance",
    "Chốt toàn bộ tháng lương",
    payrollApi.POST(
      req("/api/payroll", "scenariofinance", { month: today().slice(0, 7) }),
    ),
  );
  assert.equal(
    (
      (await db
        .prepare(
          "SELECT COUNT(*) n FROM production_logs WHERE order_id=? AND is_locked=1",
        )
        .get(id)) as { n: number }
    ).n,
    logs.length,
  );
  if (process.env.SIMULATION_REPORT_PATH) {
    const output = {
      scenario: "100 áo / 2 màu–size / 2 thợ May / 2 áo sửa / giao 20 rồi 80",
      database: "isolated PostgreSQL",
      trace,
      writeCount: trace.filter((r) => r.write).length,
      actors: [...new Set(trace.map((r) => r.actor))],
      stages,
      totalPay: 1306000,
      qcRecordedWithoutWage: true,
      shipments: 2,
      packages: 5,
      delivered: 100,
      completed: true,
      payrollLocked: true,
      uiVerified: false,
    };
    writeFileSync(
      process.env.SIMULATION_REPORT_PATH,
      JSON.stringify(output, null, 2),
    );
  }
});
test("Sample seed populates only an empty department database and never duplicates existing business data", async () => {
  const seedName = "luuta_seed_" + randomUUID().replaceAll("-", "");
  await pool.query(`CREATE DATABASE "${seedName}"`);
  const seedUrl = new URL(process.env.TEST_DATABASE_URL!);
  seedUrl.pathname = "/" + seedName;
  try {
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
      import assert from "node:assert/strict";
      const unwrap = m => m.default || m;
      const { initializeDatabase } = unwrap(await import("./src/lib/server/migrate.ts"));
      const { db } = unwrap(await import("./src/lib/db.ts"));
      const { seedSampleData } = unwrap(await import("./scripts/sample-data.ts"));
      try {
        await initializeDatabase();
        assert.equal(await seedSampleData(), true);
        assert.equal((await db.prepare("SELECT COUNT(*) n FROM orders").get()).n, 2);
        assert.equal((await db.prepare("SELECT COUNT(*) n FROM employee_departments").get()).n, 12);
        assert.equal((await db.prepare("SELECT COUNT(*) n FROM employees WHERE line_id IS NOT NULL").get()).n, 0);
        assert.equal(await seedSampleData(), false);
        assert.equal((await db.prepare("SELECT COUNT(*) n FROM orders").get()).n, 2);
      } finally { await db.close(); }
    `,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: seedUrl.toString() },
        stdio: "pipe",
      },
    );
  } finally {
    await pool.query(`DROP DATABASE "${seedName}" WITH (FORCE)`);
  }
});
test("Snapshots restore the full new model with shipments, assignments, images and wage history", async () => {
  const snapshot = await import("../src/lib/server/snapshot");
  const saved = await snapshot.captureSnapshot();
  await db.transaction(async () => {
    await db.exec("SET CONSTRAINTS ALL DEFERRED");
    for (const table of [...snapshot.TABLES].reverse())
      await db.exec(`DELETE FROM "${table}"`);
  })();
  await snapshot.restoreSnapshot(saved);
  const restored = await snapshot.captureSnapshot();
  for (const table of snapshot.TABLES)
    assert.deepEqual(
      restored.tables[table].map((r) => JSON.stringify(r)).sort(),
      saved.tables[table].map((r) => JSON.stringify(r)).sort(),
      table,
    );
});
test("Backup restoration upgrades a pre-department snapshot without guessing memberships or manufacturing shipment times", async () => {
  const snap = await import("../src/lib/server/snapshot");
  const original = await snap.captureSnapshot();
  const old = JSON.parse(JSON.stringify(original)) as typeof original;
  for (const table of [
    "departments",
    "employee_departments",
    "work_assignments",
    "shipments",
    "shipment_items",
  ])
    delete old.tables[table];
  old.tables.schema_migrations = old.tables.schema_migrations.filter(
    (r) => Number(r.version) < 11,
  );
  for (const r of old.tables.role_grants) {
    if (r.scope === "departments") r.scope = "lines";
  }
  for (const table of [
    "production_logs",
    "operation_records",
    "audit_logs",
    "pending_packing_pay",
  ])
    for (const r of old.tables[table]) {
      delete r.department_id;
      if (table === "operation_records") delete r.shipment_id;
    }
  // Empty the disposable test database only, then restore through the application migration path.
  await db.transaction(async () => {
    await db.exec("SET CONSTRAINTS ALL DEFERRED");
    for (const table of [...snap.TABLES].reverse())
      await db.exec(`DELETE FROM "${table}"`);
  })();
  await snap.restoreSnapshot(old);
  assert.equal(
    (
      (await db.prepare("SELECT COUNT(*) n FROM departments").get()) as {
        n: number;
      }
    ).n,
    6,
  );
  assert.equal(
    (
      (await db
        .prepare("SELECT COUNT(*) n FROM employee_departments")
        .get()) as { n: number }
    ).n,
    0,
  );
  assert.equal(
    (
      (await db.prepare("SELECT COUNT(*) n FROM sessions").get()) as {
        n: number;
      }
    ).n,
    0,
  );
  assert.equal(
    (
      (await db
        .prepare("SELECT status FROM accounts WHERE id=?")
        .get(people.worker.id)) as { status: string }
    ).status,
    "locked",
  );
  assert.equal(
    (
      (await db.prepare("SELECT COUNT(*) n FROM shipments").get()) as {
        n: number;
      }
    ).n,
    0,
  );
  assert.equal(
    (
      (await db
        .prepare("SELECT SUM(total_pay) n FROM production_logs")
        .get()) as { n: number }
    ).n,
    original.tables.production_logs.reduce(
      (n, r) => n + Number(r.total_pay),
      0,
    ),
  );
  assert.deepEqual(
    await db.prepare("SELECT id,line_id FROM orders ORDER BY id").all(),
    original.tables.orders
      .map((r) => ({ id: r.id, line_id: r.line_id }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
  );
});
