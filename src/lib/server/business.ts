import {
  DEPARTMENTS,
  departmentFor,
  isManagement,
  departmentAccess,
} from "../departments";
import {
  requireDepartment,
  requireAssignment,
  assignmentsFor,
} from "./departments";
import { completedWork } from "./work-items";
import { getPolicy } from "./policy";
import {
  remainingOperation,
  transitionProblem,
  exceptionalTransitionProblem,
  transitionPermissionProblem,
  cutLimit,
  sewLimit,
} from "../workflow";
import { z } from "zod";
import {
  db,
  getAllOrders,
  getOrderById,
  getEmployees,
  createOrderWithVariants,
  generateNextOrderCode,
} from "../db";
import {
  LUUTA_STAGES,
  type Order,
  type ProductionLog,
  type OrderVariant,
} from "../types";
import {
  hasPermission,
  permits,
  canRecordProduction,
  type Permission,
} from "../permissions";
import {
  type Context,
  ensure,
  requirePermission,
  audit,
  actorLabel,
  hashToken,
} from "./auth";
import { text, quantity, date, line, today } from "./validation";

export const STAGES = ["Cắt", "May", "QC", "Sửa hàng", "Đóng gói"] as const;
export const stageSchema = z.enum(
  LUUTA_STAGES.map((s) => s.key) as [
    Order["current_stage"],
    ...Order["current_stage"][],
  ],
);
export interface Variant extends OrderVariant {
  qc_inspected_qty: number;
  defect_qty: number;
  reworked_qty: number;
  reinspected_qty: number;
  repassed_qty: number;
}
export interface Rate {
  work_item_id?: number;
  work_item_name?: string;
  order_id: string;
  stage: string;
  unit_price: number;
}
export interface QcEntry {
  id: number;
  order_id: string;
  color: string;
  size: string;
  inspected_qty: number;
  passed_qty: number;
  defect_qty: number;
  rework_qty: number;
  reinspected_qty: number;
  repassed_qty: number;
  inspector: string;
  created_at: string;
  defect_type: string | null;
}
export interface AuditEntry {
  id: number;
  user_name: string;
  action: string;
  details: string;
  created_at: string;
  actor_id: string | null;
  represented_id: string | null;
  line_id: number | null;
  department_id?: string | null;
}
export async function visibleOrders(
  ctx: Context,
  permission: Permission = "orders.view",
) {
  return (await getAllOrders()).filter((o) =>
    permits(ctx.user, permission, { lineId: o.line_id }),
  );
}
export async function orderFor(
  ctx: Context,
  id: string,
  permission: Permission,
) {
  const order = await getOrderById(id);
  ensure(order, 404, "Không tìm thấy đơn hàng.");
  requirePermission(ctx, permission, { lineId: order.line_id });
  return {
    ...order,
    assignments: await assignmentsFor(id),
    shipments: await (await import("./shipments")).shipmentsFor(id),
    work_totals: await db
      .prepare(
        "SELECT stage,work_item_id,color,size,SUM(quantity) quantity FROM production_logs WHERE order_id=? GROUP BY stage,work_item_id,color,size",
      )
      .all(id),
    policy: await getPolicy(),
    materials: await (await import("./materials")).materialsFor(id),
    defects: await db
      .prepare(
        "SELECT d.id,d.color,d.size,d.stage,d.quantity,d.created_at,e.name employee_name FROM defect_attributions d JOIN employees e ON e.id=d.employee_id WHERE d.order_id=? ORDER BY d.id DESC",
      )
      .all(id),
    production_reasons: await db
      .prepare(
        "SELECT id,log_date,stage,color,size,quantity,employee_name,reason FROM production_logs WHERE order_id=? AND reason IS NOT NULL AND reason<>'' ORDER BY id DESC",
      )
      .all(id),
    pending_totals: await db
      .prepare(
        "SELECT color,size,SUM(quantity) quantity FROM pending_packing_pay WHERE order_id=? AND settled_log_id IS NULL GROUP BY color,size",
      )
      .all(id),
    operations: await db
      .prepare(
        "SELECT r.*,COALESCE(e.name,a.name) worker_name FROM operation_records r LEFT JOIN employees e ON e.id=r.worker_id LEFT JOIN accounts a ON a.id=COALESCE(r.represented_id,r.actor_id) WHERE r.order_id=? ORDER BY r.id DESC",
      )
      .all(id),
  };
}
export async function employeesFor(
  ctx: Context,
  permission: Permission = "production.view",
) {
  void permission;
  return (await getEmployees())
    .filter(
      (e) =>
        isManagement(ctx.user) ||
        e.department_ids?.some((d) => departmentAccess(ctx.user, d)),
    )
    .map((e) => ({
      ...e,
      phone: permits(ctx.user, "employees.manage") ? e.phone : "",
    }));
}
export async function linesFor(ctx: Context) {
  void ctx;
  return [];
}
export async function logsFor(
  ctx: Context,
  permission: Permission = "production.view",
) {
  return await Promise.all(
    (
      (await db
        .prepare("SELECT * FROM production_logs ORDER BY log_date DESC,id DESC")
        .all()) as ProductionLog[]
    )
      .filter((l) =>
        permits(ctx.user, permission, {
          employeeId: l.employee_id,
          departmentId: l.department_id || departmentFor(l.stage),
        }),
      )
      .map(async (l) => ({
        ...l,
        product_code:
          (
            (await db
              .prepare("SELECT product_code FROM orders WHERE id=?")
              .get(l.order_id)) as { product_code: string } | undefined
          )?.product_code || "",
      })),
  );
}
export interface Filters {
  month?: string;
  department_id?: string;
  employee_id?: string;
  line_id?: number;
  stage?: string;
  search?: string;
  status?: string;
  product?: string;
  color?: string;
  size?: string;
  from?: string;
  to?: string;
}
export async function filterLogs(logs: ProductionLog[], f: Filters) {
  const codes = new Map(
    f.product
      ? (
          (await db
            .prepare(
              "SELECT id,product_code FROM orders WHERE id=ANY(?::text[])",
            )
            .all([...new Set(logs.map((l) => l.order_id))])) as {
            id: string;
            product_code: string;
          }[]
        ).map((r) => [r.id, r.product_code])
      : [],
  );
  return logs.filter(
    (l) =>
      (!f.month || l.month === f.month) &&
      (!f.employee_id || l.employee_id === f.employee_id) &&
      (!f.department_id ||
        (l.department_id || departmentFor(l.stage)) === f.department_id) &&
      (!f.stage || l.stage === f.stage) &&
      (!f.product ||
        [l.order_id, l.product_name, codes.get(l.order_id) || ""]
          .join(" ")
          .toLowerCase()
          .includes(f.product.toLowerCase())) &&
      (!f.color || l.color.toLowerCase() === f.color.toLowerCase()) &&
      (!f.size || l.size.toLowerCase() === f.size.toLowerCase()) &&
      (!f.from || l.log_date >= f.from) &&
      (!f.to || l.log_date <= f.to),
  );
}
export function filterOrders(orders: Order[], f: Filters) {
  return orders.filter((o) => {
    if (
      f.department_id &&
      departmentFor(o.current_stage) !== f.department_id &&
      !(o.variants || []).some((v) =>
        f.department_id === "cutting"
          ? v.cut_qty > 0
          : f.department_id === "sewing"
            ? v.sewn_qty > 0
            : f.department_id === "quality"
              ? ((v as Variant).qc_inspected_qty || 0) > 0
              : f.department_id === "packing"
                ? v.packed_qty > 0
                : f.department_id === "delivery"
                  ? v.delivered_qty > 0
                  : false,
      )
    )
      return false;
    if (
      f.search &&
      ![
        o.id,
        o.customer,
        o.product_name,
        o.product_code,
        ...(o.variants || []).flatMap((v) => [v.color, v.size]),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(f.search.toLocaleLowerCase())
    )
      return false;
    if (!f.status || f.status === "all") return true;
    if (f.status === "running") return o.status !== "completed";
    if (f.status === "needs_attention")
      return ["at_risk", "delayed"].includes(o.status);
    if (f.status === "cho_qc")
      return (
        o.status !== "completed" &&
        (o.variants || []).some(
          (v) =>
            remainingOperation(v, "qc") > 0 ||
            remainingOperation(v, "reinspect") > 0,
        )
      );
    if (f.status === "cho_dong_goi")
      return (
        o.status !== "completed" &&
        (o.variants || []).some((v) => remainingOperation(v, "pack") > 0)
      );
    if (f.status === "cho_giao")
      return (
        o.status !== "completed" &&
        (o.variants || []).some((v) => remainingOperation(v, "deliver") > 0)
      );
    if (f.status === "da_giao_du") return !!o.delivered_complete;
    if (f.status === "waiting_delivery")
      return (
        ["dong_goi", "giao_hang"].includes(o.current_stage) &&
        !o.delivered_complete
      );
    return o.status === f.status;
  });
}
export function queryFilters(request: Request): Filters {
  const p = new URL(request.url).searchParams;
  const schema = z.object({
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
    employee_id: text.optional(),
    department_id: z
      .enum(DEPARTMENTS.map((d) => d.id) as [string, ...string[]])
      .optional(),
    stage: z.enum(STAGES).optional(),
    product: z.string().trim().max(160).optional(),
    color: text.optional(),
    size: text.optional(),
    from: date.optional(),
    to: date.optional(),
    search: z.string().max(160).optional(),
    status: z
      .enum([
        "all",
        "running",
        "needs_attention",
        "on_track",
        "at_risk",
        "delayed",
        "completed",
        "cho_qc",
        "waiting_delivery",
        "cho_dong_goi",
        "cho_giao",
        "da_giao_du",
      ])
      .optional(),
  });
  const parsed = schema.parse(
    Object.fromEntries(
      [...p].filter(([k]) =>
        [
          "month",
          "employee_id",
          "department_id",
          "stage",
          "search",
          "status",
          "product",
          "color",
          "size",
          "from",
          "to",
        ].includes(k),
      ),
    ),
  );
  ensure(
    !parsed.from || !parsed.to || parsed.from <= parsed.to,
    422,
    "Ngày bắt đầu phải trước ngày kết thúc.",
  );
  return parsed;
}
export async function payrollFor(ctx: Context, f: Filters) {
  requirePermission(ctx, "payroll.view");
  const month = f.month || (f.from || f.to ? "" : today().slice(0, 7));
  const logs = await filterLogs(await logsFor(ctx, "payroll.view"), {
    ...f,
    month,
  });
  const grouped = new Map<
    string,
    {
      employee_id: string;
      employee_name: string;
      line_id: number | null;
      department_id?: string | null;
      total_qty: number;
      total_salary: number;
      total_entries: number;
    }
  >();
  for (const log of logs) {
    const groupKey = `${log.employee_id}:${log.department_id || departmentFor(log.stage)}`;
    const current = grouped.get(groupKey) || {
      employee_id: log.employee_id,
      employee_name: log.employee_name,
      line_id: log.line_id,
      department_id: log.department_id || departmentFor(log.stage),
      total_qty: 0,
      total_salary: 0,
      total_entries: 0,
    };
    current.total_qty += log.quantity;
    current.total_salary += log.total_pay;
    current.total_entries++;
    grouped.set(groupKey, current);
  }
  const lock = (await db
    .prepare("SELECT * FROM payroll_locks WHERE month=?")
    .get(month)) as { locked_by: string; locked_at: string } | undefined;
  const percent = (await getPolicy()).defect_penalty_percent;
  const defects = (
    (await db
      .prepare(
        `SELECT d.employee_id,e.name employee_name,d.stage,SUM(d.quantity) quantity,
          COALESCE(SUM(d.quantity*(SELECT SUM(p.total_pay)/NULLIF(SUM(p.quantity),0) FROM production_logs p WHERE p.order_id=d.order_id AND p.employee_id=d.employee_id AND p.stage=d.stage)),0) value
         FROM defect_attributions d JOIN employees e ON e.id=d.employee_id
         WHERE ${month ? "substr(d.created_at,1,7)=?" : "TRUE"}
         GROUP BY d.employee_id,e.name,d.stage ORDER BY e.name,d.stage`,
      )
      .all(...(month ? [month] : []))) as {
      employee_id: string;
      employee_name: string;
      stage: string;
      quantity: number;
      value: number;
    }[]
  )
    .filter(
      (d) =>
        (!f.employee_id || d.employee_id === f.employee_id) &&
        permits(ctx.user, "payroll.view", {
          employeeId: d.employee_id,
          stage: d.stage,
        }),
    )
    .map((d) => ({
      ...d,
      value: Math.round(d.value),
      penalty: Math.round((d.value * percent) / 100),
    }));
  return {
    month,
    logs,
    summary: [...grouped.values()],
    defects,
    defect_penalty_percent: percent,
    isLocked: !!lock,
    lockedBy: lock?.locked_by,
    lockedAt: lock?.locked_at,
  };
}
export async function qcFor(ctx: Context) {
  const orders = await visibleOrders(ctx, "qc.view");
  return (
    (await db
      .prepare("SELECT * FROM qc_records ORDER BY id DESC")
      .all()) as QcEntry[]
  ).filter((q) => orders.some((o) => o.id === q.order_id));
}
export async function auditFor(ctx: Context) {
  requirePermission(ctx, "audit.view");
  const rows = (await db
    .prepare(
      "SELECT a.*,u.employee_id AS audit_employee_id FROM audit_logs a LEFT JOIN accounts u ON u.id=COALESCE(a.represented_id,a.actor_id) ORDER BY a.id DESC LIMIT 500",
    )
    .all()) as (AuditEntry & { audit_employee_id: string | null })[];
  return rows
    .filter(
      (a) =>
        (isManagement(ctx.user) ||
          !!a.department_id ||
          a.actor_id === ctx.actor.id) &&
        permits(ctx.user, "audit.view", {
          employeeId: a.audit_employee_id,
          departmentId: a.department_id,
        }),
    )
    .map(({ audit_employee_id, ...row }) => {
      void audit_employee_id;
      return row;
    });
}
export async function dashboard(ctx: Context) {
  const orders = await visibleOrders(ctx);
  const logs = hasPermission(ctx.user, "production.view")
    ? await filterLogs(await logsFor(ctx), { month: today().slice(0, 7) })
    : [];
  const payroll = hasPermission(ctx.user, "payroll.view")
    ? await payrollFor(ctx, {})
    : null;
  return {
    orders: {
      totalRunning: orders.filter((o) => o.status !== "completed").length,
      atRisk: orders.filter((o) => o.status === "at_risk").length,
      delayed: orders.filter((o) => o.status === "delayed").length,
      completed: orders.filter((o) => o.status === "completed").length,
      waitingQc: orders.filter((o) =>
        ["qc", "qc_lai"].includes(o.current_stage),
      ).length,
      waitingDelivery: orders.filter((o) =>
        ["dong_goi", "giao_hang"].includes(o.current_stage),
      ).length,
    },
    production: {
      monthlyQty: logs.reduce((a, l) => a + l.quantity, 0),
      monthlyPay: payroll
        ? payroll.logs.reduce((a, l) => a + l.total_pay, 0)
        : null,
    },
    employeesCount: (await employeesFor(ctx)).length,
  };
}
export async function unlocked(month: string) {
  ensure(
    !(await db.prepare("SELECT 1 FROM payroll_locks WHERE month=?").get(month)),
    409,
    "Tháng lương đã chốt; không thể ghi thêm sản lượng.",
  );
}
export async function idempotent<T>(
  ctx: Context,
  request: Request,
  input: unknown,
  operation: () => T | Promise<T>,
): Promise<T> {
  const key = request.headers.get("idempotency-key");
  ensure(
    key && /^[a-zA-Z0-9-]{16,80}$/.test(key),
    422,
    "Thiếu mã thao tác hợp lệ.",
  );
  const signature = hashToken(
    JSON.stringify({
      user: ctx.user.id,
      path: new URL(request.url).pathname,
      input,
    }),
  );
  return await db.transaction(async () => {
    const old = (await db
      .prepare(
        "SELECT payload_hash,response FROM idempotency WHERE actor_id=? AND request_key=?",
      )
      .get(ctx.actor.id, key)) as
      { payload_hash: string; response: string } | undefined;
    if (old) {
      ensure(
        old.payload_hash === signature,
        409,
        "Mã thao tác đã dùng cho dữ liệu khác.",
      );
      return JSON.parse(old.response) as T;
    }
    const result = await operation();
    await db
      .prepare("INSERT INTO idempotency VALUES (?,?,?,?)")
      .run(ctx.actor.id, key, signature, JSON.stringify(result));
    return result;
  })();
}
export function assertVersion(order: Order, version: number) {
  ensure(
    order.version === version,
    409,
    "Đơn hàng đã thay đổi. Vui lòng tải lại dữ liệu.",
  );
}
const productImageUrl = z
  .string()
  .regex(/^\/api\/product-images\/[0-9a-f-]{36}$/)
  .nullable();
async function validateProductImage(
  ctx: Context,
  url: string | null | undefined,
  current?: string | null,
) {
  if (!url || url === current) return;
  const image = (await db
    .prepare("SELECT owner_id FROM product_images WHERE id=?")
    .get(url.split("/").pop())) as { owner_id: string } | undefined;
  ensure(
    image && image.owner_id === ctx.user.id,
    422,
    "Ảnh chưa được tải lên bằng tài khoản của bạn.",
  );
}
export const createOrderSchema = z
  .object({
    customer: text,
    product_name: text,
    order_code: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    responsible_id: text.nullable().optional(),
    product_code: text.optional(),
    image_url: productImageUrl.optional(),
    deadline: date,
    order_date: date,
    line_id: line.optional(),
    priority: z.enum(["normal", "high", "urgent"]).default("normal"),
    notes: z.string().max(2000).default(""),
    reason: z.string().max(2000).optional(),
    variants: z
      .array(
        z
          .object({
            color: text,
            size: z.string().trim().min(1).max(40),
            color_hex: z
              .string()
              .regex(/^#[0-9a-fA-F]{6}$/)
              .nullable()
              .optional(),
            colors: z
              .array(
                z
                  .object({
                    name: text,
                    hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
                    alpha: z.number().int().min(0).max(100).optional(),
                  })
                  .strict(),
              )
              .min(1)
              .max(8)
              .optional(),
            quantity,
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export async function createOrder(
  ctx: Context,
  input: z.infer<typeof createOrderSchema>,
) {
  requirePermission(ctx, "orders.create", { stage: "nhan_don" });
  ensure(
    input.deadline >= input.order_date,
    422,
    "Hạn giao phải từ ngày nhận đơn trở đi.",
  );
  if (input.responsible_id)
    ensure(
      await db
        .prepare(
          "SELECT 1 FROM employee_departments WHERE employee_id=? AND department_id='management'",
        )
        .get(input.responsible_id),
      422,
      "Người điều phối phải thuộc bộ phận Quản lý.",
    );
  await validateProductImage(ctx, input.image_url);
  const keys = input.variants.map(
    (v) => `${v.color.toLocaleLowerCase()}|${v.size}`,
  );
  ensure(
    new Set(keys).size === keys.length,
    422,
    "Màu và size không được trùng.",
  );
  ensure(
    !input.order_code ||
      !(await db
        .prepare("SELECT 1 FROM orders WHERE id=?")
        .get(input.order_code)),
    409,
    "Mã đơn đã tồn tại. Chọn mã khác.",
  );
  const order = await createOrderWithVariants(
    {
      order: {
        id: input.order_code || (await generateNextOrderCode()),
        customer: input.customer,
        product_name: input.product_name,
        product_code:
          input.product_code ||
          `SP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        deadline: input.deadline,
        order_date: input.order_date,
        line_id: null,
        priority: input.priority,
        notes: input.notes,
        reason: input.reason || null,
        image_url: input.image_url || null,
        total_quantity: 0,
        current_stage: "nhan_don",
        assigned_to: "Bộ phận Quản lý",
      },
      variants: input.variants,
    },
    actorLabel(ctx),
  );
  for (const v of input.variants) {
    await db
      .prepare(
        "UPDATE order_variants SET color_hex=?,colors_json=? WHERE order_id=? AND color=? AND size=?",
      )
      .run(
        v.colors?.[0].hex || v.color_hex || null,
        v.colors ? JSON.stringify(v.colors) : null,
        order.id,
        v.color,
        v.size,
      );
  }
  if (input.responsible_id) {
    const employee = (await db
      .prepare("SELECT name FROM employees WHERE id=?")
      .get(input.responsible_id)) as { name: string };
    await db
      .prepare("UPDATE orders SET responsible_id=?,assigned_to=? WHERE id=?")
      .run(input.responsible_id, employee.name, order.id);
  }
  // Enrich the legacy creation audit with verified identities.
  await db
    .prepare(
      "UPDATE audit_logs SET actor_id=?,represented_id=?,line_id=?,department_id='management' WHERE id=(SELECT MAX(id) FROM audit_logs)",
    )
    .run(ctx.actor.id, ctx.representing ? ctx.user.id : null, null);
  return (await getOrderById(order.id))!;
}
export const moveSchema = z
  .object({
    version: z.number().int().positive(),
    image_url: productImageUrl.optional(),
    stage: stageSchema.optional(),
    exception: z.boolean().optional(),
    reason: z.string().trim().max(2000).nullable().optional(),
    line_id: line.optional(),
    responsible_id: text.nullable().optional(),
    product_code: text.optional(),
    customer: text.optional(),
    deadline: date.optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.responsible_id !== undefined ||
      v.product_code !== undefined ||
      v.image_url !== undefined ||
      v.stage !== undefined ||
      v.line_id !== undefined ||
      v.customer !== undefined ||
      v.deadline !== undefined ||
      v.notes !== undefined ||
      v.reason !== undefined,
  );
export async function moveOrder(
  ctx: Context,
  id: string,
  input: z.infer<typeof moveSchema>,
) {
  const o = await getOrderById(id);
  ensure(o, 404, "Không tìm thấy đơn.");
  assertVersion(o, input.version);
  ensure(
    !input.exception ||
      (input.stage && input.reason && input.reason.length >= 5),
    422,
    "Chuyển bước ngoại lệ cần chọn bước và ghi lý do (ít nhất 5 ký tự).",
  );
  if (input.stage) {
    requireDepartment(
      ctx,
      departmentFor(input.stage) === "management"
        ? input.stage
        : o.current_stage,
    );
    if (input.exception)
      requirePermission(ctx, "orders.override", { lineId: o.line_id });
    const permissionProblem = transitionPermissionProblem(ctx.user, o);
    ensure(!permissionProblem, 403, permissionProblem || "");
    const problem = input.exception
      ? exceptionalTransitionProblem(o, input.stage)
      : transitionProblem(o, input.stage);
    ensure(!problem, 422, problem || "");
  }
  ensure(
    !input.line_id,
    422,
    "Đơn đi qua nhiều bộ phận; không còn phân chuyền cho đơn.",
  );
  if (input.line_id) {
    requirePermission(ctx, "orders.assign", { lineId: o.line_id });
    requirePermission(ctx, "orders.assign", { lineId: input.line_id });
    ensure(
      o.status !== "completed",
      422,
      "Đơn đã hoàn thành không thể đổi chuyền.",
    );
  }
  if (
    input.responsible_id !== undefined ||
    input.product_code ||
    input.customer ||
    input.deadline ||
    input.notes !== undefined ||
    (input.reason !== undefined && !input.exception) ||
    input.image_url !== undefined
  )
    requirePermission(ctx, "orders.edit", { stage: "nhan_don" });
  ensure(
    !input.deadline || input.deadline >= o.order_date,
    422,
    "Hạn giao không được trước ngày nhận đơn.",
  );
  await validateProductImage(ctx, input.image_url, o.image_url);
  const responsible =
    input.responsible_id === undefined
      ? input.line_id && input.line_id !== o.line_id
        ? null
        : o.responsible_id || null
      : input.responsible_id;
  const person = responsible
    ? ((await db
        .prepare(
          "SELECT e.name FROM employees e JOIN employee_departments d ON d.employee_id=e.id WHERE e.id=? AND d.department_id='management'",
        )
        .get(responsible)) as { name: string } | undefined)
    : undefined;
  ensure(
    !responsible || person,
    422,
    "Người điều phối phải thuộc bộ phận Quản lý.",
  );
  const stage = input.stage || o.current_stage;
  const index = LUUTA_STAGES.findIndex((s) => s.key === stage);
  const updatedReason =
    input.reason !== undefined && !input.exception
      ? input.reason || null
      : o.reason || null;
  await db
    .prepare(
      "UPDATE orders SET responsible_id=?,product_code=?,current_stage=?,line_id=?,assigned_to=?,customer=?,deadline=?,notes=?,reason=?,image_url=?,progress=?,status=?,version=version+1 WHERE id=?",
    )
    .run(
      responsible,
      input.product_code || o.product_code,
      stage,
      input.line_id || o.line_id,
      person?.name || "Bộ phận Quản lý",
      input.customer || o.customer,
      input.deadline || o.deadline,
      input.notes ?? o.notes,
      updatedReason,
      input.image_url === undefined ? o.image_url : input.image_url,
      input.stage
        ? Math.round((index / (LUUTA_STAGES.length - 1)) * 100)
        : o.progress,
      stage === "hoan_thanh"
        ? "completed"
        : o.status === "completed"
          ? "on_track"
          : o.status,
      id,
    );
  if (input.stage && input.exception) {
    await db
      .prepare(
        "UPDATE order_stages SET status='pending',completed_at=NULL WHERE order_id=? AND status='in_progress'",
      )
      .run(id);
    await db
      .prepare(
        "UPDATE order_stages SET status='in_progress',started_at=to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD HH24:MI:SS'),completed_at=NULL WHERE order_id=? AND stage_key=?",
      )
      .run(id, input.stage);
    if (stage === "hoan_thanh")
      await db
        .prepare(
          "UPDATE order_stages SET status='completed',completed_at=to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD HH24:MI:SS') WHERE order_id=? AND stage_key=?",
        )
        .run(id, stage);
  } else if (input.stage) {
    await db
      .prepare(
        "UPDATE order_stages SET status='completed',completed_at=to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD HH24:MI:SS') WHERE order_id=? AND stage_key=?",
      )
      .run(id, o.current_stage);
    if (["nhan_don", "kiem_npl", "kiem_rap"].includes(o.current_stage))
      await db
        .prepare(
          "UPDATE order_stages SET completed_qty=received_qty,remaining_qty=0 WHERE order_id=? AND stage_key=?",
        )
        .run(id, o.current_stage);
    await db
      .prepare(
        "UPDATE order_stages SET status=?,started_at=COALESCE(started_at,to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD HH24:MI:SS')),completed_at=? WHERE order_id=? AND stage_key=?",
      )
      .run(
        stage === "hoan_thanh" ? "completed" : "in_progress",
        stage === "hoan_thanh" ? new Date().toISOString() : null,
        id,
        stage,
      );
  }
  await audit(
    ctx,
    input.exception ? "Chuyển bước ngoại lệ" : "Cập nhật đơn",
    `${id}: Trước ${JSON.stringify({ customer: o.customer, product_code: o.product_code, deadline: o.deadline, line_id: o.line_id, notes: o.notes, image_url: o.image_url })}; Sau ${JSON.stringify(input)}; ${input.stage ? `${LUUTA_STAGES.find((s) => s.key === o.current_stage)?.label} → ${LUUTA_STAGES[index].label}` : ""}${input.line_id ? ` → Chuyền ${input.line_id}` : ""}${input.exception ? `; Lý do: ${input.reason}` : ""}`,
    o.line_id,
    input.stage ? departmentFor(o.current_stage) : "management",
  );
  return await getOrderById(id);
}
export const prepareSchema = z
  .object({ version: z.number().int().positive(), prepare: z.literal(true) })
  .strict();
const PREPARATION = ["nhan_don", "kiem_npl", "kiem_rap"] as const;
/** Walks Nhận đơn → Kiểm NPL → Kiểm rập → Cắt in one step; every transition keeps its own audit/stage history. */
export async function prepareOrder(ctx: Context, id: string, version: number) {
  return db.transaction(async () => {
    let o = await getOrderById(id);
    ensure(o, 404, "Không tìm thấy đơn.");
    assertVersion(o, version);
    ensure(
      (PREPARATION as readonly string[]).includes(o.current_stage),
      422,
      "Đơn đã hoàn tất chuẩn bị.",
    );
    const start = LUUTA_STAGES.findIndex((s) => s.key === o!.current_stage);
    for (const step of LUUTA_STAGES.slice(start + 1)) {
      o = await moveOrder(ctx, id, { version: o!.version, stage: step.key });
      if (step.key === "cat") break;
    }
    return o;
  })();
}
export const logSchema = z
  .object({
    log_date: date,
    employee_id: text,
    order_id: text,
    color: text,
    size: text,
    stage: z.enum(STAGES),
    work_item_id: z.number().int().positive().optional(),
    record_packing: z.boolean().optional(),
    record_rework: z.boolean().optional(),
    reason: z.string().trim().max(2000).optional(),
    incident: z.boolean().optional(),
    quantity,
    version: z.number().int().positive(),
  })
  .strict();

export const batchEntrySchema = z
  .object({
    color: text.optional(),
    size: text,
    quantity,
  })
  .strict();

export const batchLogSchema = z
  .object({
    log_date: date,
    employee_id: text,
    order_id: text,
    color: text.optional(),
    stage: z.enum(STAGES),
    work_item_id: z.number().int().positive().optional(),
    record_packing: z.boolean().optional(),
    record_rework: z.boolean().optional(),
    reason: z.string().trim().max(2000).optional(),
    incident: z.boolean().optional(),
    version: z.number().int().positive(),
    entries: z.array(batchEntrySchema).min(1).max(100),
  })
  .strict();

export const multiWorkerLogSchema = batchLogSchema
  .omit({ employee_id: true, color: true, entries: true })
  .extend({
    workers: z
      .array(
        z
          .object({
            employee_id: text,
            entries: z.array(batchEntrySchema).min(1).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

export const productionInputSchema = z.union([
  multiWorkerLogSchema,
  batchLogSchema,
  logSchema,
]);
export type ProductionInput = z.infer<typeof productionInputSchema>;

/** Several workers of one stage/part in one atomic save; each still gets their own logs and wages. */
async function recordProductionForWorkers(
  ctx: Context,
  input: z.infer<typeof multiWorkerLogSchema>,
) {
  return db.transaction(async () => {
    const original = await getOrderById(input.order_id);
    ensure(original, 404, "Không tìm thấy đơn.");
    assertVersion(original, input.version);
    const ids = input.workers.map((w) => w.employee_id);
    ensure(
      new Set(ids).size === ids.length,
      422,
      "Mỗi thợ chỉ xuất hiện một lần trong một lần ghi nhận.",
    );
    const { workers, ...common } = input;
    const logs = [];
    for (const worker of workers) {
      const fresh = (await getOrderById(input.order_id))!;
      const result = await recordWorkerProduction(ctx, {
        ...common,
        employee_id: worker.employee_id,
        entries: worker.entries,
        version: fresh.version,
      });
      if ("logs" in result) logs.push(...result.logs);
    }
    return {
      logs,
      count: logs.length,
      workers: workers.length,
      pay_status: logs.some(
        (l) => !!l && typeof l === "object" && "pay_status" in l,
      )
        ? "pending"
        : "settled",
    };
  })();
}

export async function recordProduction(ctx: Context, input: ProductionInput) {
  return "workers" in input
    ? recordProductionForWorkers(ctx, input)
    : recordWorkerProduction(ctx, input);
}

async function recordWorkerProduction(
  ctx: Context,
  input: Exclude<ProductionInput, z.infer<typeof multiWorkerLogSchema>>,
) {
  return db.transaction(async () => {
    const original = await getOrderById(input.order_id);
    ensure(original, 404, "Không tìm thấy đơn.");
    assertVersion(original, input.version);
    const rows =
      "entries" in input
        ? input.entries.map((e) => ({
            color: e.color || input.color,
            size: e.size,
            quantity: e.quantity,
          }))
        : [{ color: input.color, size: input.size, quantity: input.quantity }];
    const keys = rows.map((r) => JSON.stringify([r.color, r.size]));
    ensure(
      new Set(keys).size === keys.length,
      422,
      "Không gửi trùng dòng màu–size trong một lần ghi nhận.",
    );
    ensure(
      !input.incident || !!input.reason?.trim(),
      422,
      "Cần nhập nguyên nhân sự cố.",
    );
    const logs = [];
    for (const r of rows) {
      ensure(r.color, 422, "Chọn màu cho từng dòng.");
      let fresh = (await getOrderById(input.order_id))!;
      if (input.record_rework) {
        ensure(
          input.stage === "Sửa hàng",
          422,
          "Chỉ xác nhận sửa ở công đoạn Sửa hàng.",
        );
        await recordOperation(ctx, input.order_id, {
          version: fresh.version,
          action: "rework",
          color: r.color,
          size: r.size,
          quantity: r.quantity,
          worker_id: input.employee_id,
          operation_date: input.log_date,
          reason: input.reason,
        });
        fresh = (await getOrderById(input.order_id))!;
      }
      for (const piece of await splitSurplus(input, r, fresh)) {
        if (piece.unpaid) fresh = (await getOrderById(input.order_id))!;
        logs.push(
          await recordProductionSingle(
            ctx,
            {
              log_date: input.log_date,
              employee_id: input.employee_id,
              order_id: input.order_id,
              stage: input.stage,
              work_item_id: input.work_item_id,
              record_packing: input.record_packing,
              reason: input.reason,
              incident: input.incident,
              version: fresh.version,
              color: r.color,
              size: r.size,
              quantity: piece.quantity,
            },
            { unpaid: piece.unpaid },
          ),
        );
      }
    }
    return "entries" in input
      ? {
          logs,
          count: logs.length,
          pay_status: logs.some((l) => "pay_status" in l)
            ? "pending"
            : "settled",
        }
      : logs[0];
  })();
}
/**
 * When the workshop does not pay for pieces cut above the order, the surplus
 * of one entry is saved as a separate zero-rate log so wages stay exact.
 */
async function splitSurplus(
  input: { stage: string; employee_id: string; work_item_id?: number },
  row: { color?: string; size: string; quantity: number },
  order: NonNullable<Awaited<ReturnType<typeof getOrderById>>>,
) {
  if (input.stage !== "Cắt" || (await getPolicy()).overcut_paid)
    return [{ quantity: row.quantity, unpaid: false }];
  const v = order.variants?.find(
    (x) => x.color === row.color && x.size === row.size,
  );
  if (!v) return [{ quantity: row.quantity, unpaid: false }];
  const done = input.work_item_id
    ? (
        (await db
          .prepare(
            "SELECT COALESCE(SUM(quantity),0) n FROM production_logs WHERE work_item_id=? AND color=? AND size=?",
          )
          .get(input.work_item_id, v.color, v.size)) as { n: number }
      ).n
    : v.cut_qty;
  const payable = Math.min(row.quantity, Math.max(0, v.quantity - done));
  return [
    ...(payable > 0 ? [{ quantity: payable, unpaid: false }] : []),
    ...(row.quantity - payable > 0
      ? [{ quantity: row.quantity - payable, unpaid: true }]
      : []),
  ];
}
async function recordProductionSingle(
  ctx: Context,
  input: z.infer<typeof logSchema>,
  options: { unpaid?: boolean } = {},
) {
  const o = await getOrderById(input.order_id);
  ensure(o, 404, "Không tìm thấy đơn.");
  assertVersion(o, input.version);
  const emp = (await getEmployees()).find((e) => e.id === input.employee_id);
  ensure(emp, 422, "Nhân viên không hợp lệ.");
  requirePermission(ctx, "production.create", { stage: input.stage });
  requireDepartment(ctx, input.stage);
  if (input.stage !== "QC")
    await requireAssignment(ctx, o.id, input.stage, emp.id, input.work_item_id);
  ensure(
    canRecordProduction(ctx.user, emp, o, input.stage),
    403,
    "Bạn không có quyền ghi nhận cho thợ tại bộ phận của công đoạn này.",
  );
  ensure(
    input.log_date <= today() && input.log_date >= o.order_date,
    422,
    "Không ghi sản lượng trong tương lai.",
  );
  const deferPackingPay =
    input.record_packing &&
    input.stage === "Đóng gói" &&
    !!(await db
      .prepare("SELECT 1 FROM payroll_locks WHERE month=?")
      .get(input.log_date.slice(0, 7)));
  if (!deferPackingPay) await unlocked(input.log_date.slice(0, 7));
  let packingOperationId: number | undefined;

  ensure(o.status !== "completed", 422, "Đơn hàng đã hoàn thành.");
  ensure(
    !input.record_packing || input.stage === "Đóng gói",
    422,
    "Chỉ xác nhận đóng gói ở công đoạn Đóng gói.",
  );
  const v = o.variants?.find(
    (v) => v.color === input.color && v.size === input.size,
  ) as Variant | undefined;
  ensure(v, 422, "Màu–size không thuộc đơn hàng.");
  const parts = (await db
    .prepare(
      "SELECT id,name,unit_price FROM order_work_items WHERE order_id=? AND stage=? ORDER BY id",
    )
    .all(o.id, input.stage)) as {
    id: number;
    name: string;
    unit_price: number;
  }[];
  const part = parts.find((p) => p.id === input.work_item_id);
  ensure(
    !parts.length ? !input.work_item_id : !!part,
    422,
    "Chọn phần việc đã được quản lý cấu hình; không ghi công chung khi công đoạn đã chia phần việc.",
  );
  const rate = options.unpaid
    ? { unit_price: 0 }
    : part ||
      ((await db
        .prepare(
          "SELECT unit_price FROM order_rates WHERE order_id=? AND stage=?",
        )
        .get(o.id, input.stage)) as { unit_price: number } | undefined);
  let completedQuantity = input.quantity;
  ensure(rate, 422, "Chưa có đơn giá cho công đoạn. Liên hệ quản lý.");
  const totalPay = input.quantity * rate.unit_price;
  const existingPay = (
    (await db
      .prepare(
        "SELECT (SELECT COALESCE(SUM(total_pay),0) FROM production_logs)+(SELECT COALESCE(SUM(total_pay),0) FROM pending_packing_pay WHERE settled_log_id IS NULL) total",
      )
      .get()) as { total: number }
  ).total;
  ensure(
    Number.isSafeInteger(totalPay) &&
      Number.isSafeInteger(existingPay + totalPay),
    422,
    "Tổng tiền vượt khả năng tính chính xác của hệ thống. Giảm số lượng hoặc đơn giá.",
  );
  const column =
    input.stage === "Cắt"
      ? "cut_qty"
      : input.stage === "May"
        ? "sewn_qty"
        : null;
  if (column) {
    ensure(
      !["nhan_don", "kiem_npl", "kiem_rap"].includes(o.current_stage),
      422,
      "Đơn hàng chưa ở công đoạn cần nhập.",
    );
    const maximum =
      input.stage === "Cắt"
        ? cutLimit(v.quantity, (await getPolicy()).overcut_percent)
        : sewLimit(v);
    const paidPart = part
      ? (
          (await db
            .prepare(
              "SELECT COALESCE(SUM(quantity),0) n FROM production_logs WHERE work_item_id=? AND color=? AND size=?",
            )
            .get(part.id, v.color, v.size)) as { n: number }
        ).n
      : v[column];
    ensure(
      paidPart + input.quantity <= maximum,
      422,
      input.stage === "Cắt"
        ? `Số cắt vượt mức cho phép: đơn ${v.quantity}, tối đa ${maximum} kể cả cắt dư.`
        : "Số lượng vượt quá đầu vào của màu–size.",
    );
    const next = part
      ? await completedWork(o.id, input.stage, v.color, v.size, {
          workId: part.id,
          delta: input.quantity,
        })
      : v[column] + input.quantity;
    completedQuantity = next - v[column];
    ensure(
      completedQuantity >= 0,
      422,
      "Dữ liệu phần việc không khớp tiến độ; liên hệ quản lý.",
    );
    await db
      .prepare(`UPDATE order_variants SET ${column}=? WHERE id=?`)
      .run(next, v.id);
  } else if (input.record_packing) {
    ensure(
      !["nhan_don", "kiem_npl", "kiem_rap"].includes(o.current_stage),
      422,
      "Đơn hàng chưa ở bước Đóng gói.",
    );
    ensure(
      input.log_date >= o.order_date,
      422,
      "Ngày đóng gói không được trước ngày nhận đơn.",
    );
    ensure(
      v.packed_qty + input.quantity <= v.qc_passed_qty,
      422,
      "Số đóng gói vượt lượng QC đạt còn lại.",
    );
    await db
      .prepare("UPDATE order_variants SET packed_qty=packed_qty+? WHERE id=?")
      .run(input.quantity, v.id);
    const packingRecord = await db
      .prepare(
        "INSERT INTO operation_records(order_id,action,color,size,quantity,passed,packages,operation_date,worker_id,notes,image_url,actor_id,represented_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        o.id,
        "pack",
        v.color,
        v.size,
        input.quantity,
        null,
        0,
        input.log_date,
        emp.id,
        deferPackingPay
          ? "Đã đóng gói; chờ đối chiếu công vì tháng lương đã khóa"
          : "Đóng gói và ghi công cùng một lần",
        null,
        ctx.actor.id,
        ctx.representing ? ctx.user.id : null,
      );
    packingOperationId = Number(packingRecord.lastInsertRowid);
    await db
      .prepare(
        "UPDATE operation_records SET department_id='packing',reason=?,operation_time=to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh','HH24:MI') WHERE id=?",
      )
      .run(input.reason || null, packingOperationId);
  } else {
    if (input.stage === "QC" && !isManagement(ctx.user))
      ensure(
        emp.id === ctx.user.employee_id,
        403,
        "Công kiểm QC phải thuộc người kiểm đang đăng nhập.",
      );
    const processed = (
      (await db
        .prepare(
          "SELECT COALESCE(SUM(quantity),0) n FROM operation_records WHERE order_id=? AND color=? AND size=? AND worker_id=? AND action=ANY(?::text[])",
        )
        .get(
          o.id,
          v.color,
          v.size,
          emp.id,
          input.stage === "QC"
            ? ["qc", "reinspect"]
            : input.stage === "Sửa hàng"
              ? ["rework"]
              : ["pack"],
        )) as { n: number }
    ).n;
    const paid = (
      (await db
        .prepare(
          "SELECT COALESCE(SUM(quantity),0) qty FROM production_logs WHERE order_id=? AND color=? AND size=? AND stage=? AND employee_id=?",
        )
        .get(o.id, v.color, v.size, input.stage, emp.id)) as { qty: number }
    ).qty;
    const reserved =
      input.stage === "Đóng gói"
        ? (
            (await db
              .prepare(
                "SELECT COALESCE(SUM(quantity),0) n FROM pending_packing_pay WHERE order_id=? AND color=? AND size=? AND employee_id=? AND settled_log_id IS NULL",
              )
              .get(o.id, v.color, v.size, emp.id)) as { n: number }
          ).n
        : 0;
    ensure(
      paid + reserved + input.quantity <= processed,
      422,
      input.stage === "Đóng gói"
        ? `Đã xác nhận đóng gói ${processed}, đã ghi công ${paid}; còn ${Math.max(0, processed - paid - reserved)} sản phẩm có thể ghi công. ${reserved ? "Phần chờ đối chiếu phải được quản lý xử lý tại Lương sản phẩm → Công đóng gói chờ đối chiếu." : "Quản lý cần vào Giao hàng → mở đơn → Đóng gói để xác nhận số lượng trước."}`
        : `Đã xử lý ${processed}, đã ghi công ${paid}; còn ${Math.max(0, processed - paid)} sản phẩm có thể ghi công ${input.stage}. Cần ghi nhận xử lý tại Kiểm soát chất lượng trước.`,
    );
  }
  if (deferPackingPay) {
    ensure(packingOperationId, 422, "Chưa ghi nhận đóng gói.");
    const pending = await db
      .prepare(
        "INSERT INTO pending_packing_pay(operation_id,order_id,employee_id,employee_name,product_name,line_id,color,size,work_date,quantity,unit_price,total_pay) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        packingOperationId,
        o.id,
        emp.id,
        emp.name,
        o.product_name,
        o.line_id,
        v.color,
        v.size,
        input.log_date,
        input.quantity,
        rate.unit_price,
        totalPay,
      );
    await db
      .prepare(
        "UPDATE pending_packing_pay SET department_id='packing' WHERE id=?",
      )
      .run(pending.lastInsertRowid);
    await db
      .prepare("UPDATE orders SET version=version+1 WHERE id=?")
      .run(o.id);
    await audit(
      ctx,
      "Đóng gói chờ đối chiếu công",
      `${emp.name}: ${o.id} ${v.color}/${v.size} +${input.quantity}; ngày ${input.log_date}; tháng đã khóa, chưa cộng lương`,
      o.line_id,
      "packing",
    );
    return {
      pay_status: "pending" as const,
      pending_id: Number(pending.lastInsertRowid),
      message:
        "Đã xác nhận đóng gói. Tháng lương đã khóa; tiền công đang chờ quản lý đối chiếu trong Lương sản phẩm, chưa cộng vào lương.",
    };
  }
  const result = await db
    .prepare(
      "INSERT INTO production_logs(log_date,employee_id,employee_name,line_id,order_id,product_name,color,size,stage,quantity,unit_price,total_pay,updated_by,month,work_item_id,work_item_name,completed_quantity) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      input.log_date,
      emp.id,
      emp.name,
      o.line_id,
      o.id,
      o.product_name,
      v.color,
      v.size,
      input.stage,
      input.quantity,
      rate.unit_price,
      totalPay,
      actorLabel(ctx),
      input.log_date.slice(0, 7),
      part?.id || null,
      part?.name || null,
      completedQuantity,
    );
  await db
    .prepare(
      "UPDATE production_logs SET department_id=?,reason=?,actor_id=?,represented_id=? WHERE id=?",
    )
    .run(
      departmentFor(input.stage),
      options.unpaid
        ? [input.reason, "Cắt dư so với đơn, không tính công"]
            .filter(Boolean)
            .join(" — ")
        : input.reason || null,
      ctx.actor.id,
      ctx.representing ? ctx.user.id : null,
      result.lastInsertRowid,
    );
  await db.prepare("UPDATE orders SET version=version+1 WHERE id=?").run(o.id);
  await audit(
    ctx,
    "Nhập sản lượng",
    `${emp.name}: ${o.id} ${v.color}/${v.size} ${input.stage}${part ? ` · ${part.name}` : ""} +${input.quantity}; hoàn thành công đoạn +${completedQuantity}`,
    o.line_id,
    departmentFor(input.stage),
  );
  return (await db
    .prepare("SELECT * FROM production_logs WHERE id=?")
    .get(result.lastInsertRowid)) as ProductionLog;
}
const blameSchema = z
  .array(
    z
      .object({
        employee_id: text,
        quantity,
        stage: z.enum(["May", "Cắt"]).default("May"),
      })
      .strict(),
  )
  .max(10)
  .optional();
export const operationSchema = z
  .object({
    version: z.number().int().positive(),
    color: text,
    size: text,
    action: z.enum(["qc", "rework", "reinspect", "pack", "deliver"]),
    quantity,
    passed: z.number().int().min(0).optional(),
    defect_type: z.string().max(500).optional(),
    image_url: productImageUrl.optional(),
    operation_date: date.optional(),
    worker_id: text.optional(),
    packages: z.number().int().min(0).max(1000000).optional(),
    notes: z.string().max(2000).optional(),
    reason: z.string().max(2000).optional(),
    operation_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    incident: z.boolean().optional(),
    blame: blameSchema,
  })
  .strict();
export const batchOperationSchema = operationSchema
  .omit({ color: true, size: true, quantity: true, passed: true })
  .extend({
    entries: z
      .array(
        z
          .object({
            color: text,
            size: text,
            quantity,
            passed: z.number().int().min(0).optional(),
            blame: blameSchema,
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export const operationInputSchema = z.union([
  batchOperationSchema,
  operationSchema,
]);
export async function recordOperations(
  ctx: Context,
  id: string,
  input: z.infer<typeof operationInputSchema>,
) {
  return db.transaction(async () => {
    const original = await getOrderById(id);
    ensure(original, 404, "Không tìm thấy đơn.");
    assertVersion(original, input.version);
    if (!("entries" in input)) return recordOperation(ctx, id, input);
    ensure(
      input.action !== "deliver",
      422,
      "Dùng Đợt giao để giao nhiều màu–size.",
    );
    const keys = input.entries.map((e) => JSON.stringify([e.color, e.size]));
    ensure(
      new Set(keys).size === keys.length,
      422,
      "Không gửi trùng màu–size.",
    );
    const { entries, ...common } = input;
    const result = [];
    for (const entry of entries) {
      const fresh = (await getOrderById(id))!;
      result.push(
        await recordOperation(ctx, id, {
          ...common,
          ...entry,
          version: fresh.version,
        }),
      );
    }
    return { count: result.length };
  })();
}
export async function recordOperation(
  ctx: Context,
  id: string,
  input: z.infer<typeof operationSchema>,
) {
  const o = await getOrderById(id);
  ensure(o, 404, "Không tìm thấy đơn.");
  assertVersion(o, input.version);
  requireDepartment(ctx, input.action);
  ensure(
    !input.incident || !!input.reason?.trim(),
    422,
    "Cần nhập nguyên nhân sự cố.",
  );
  ensure(o.status !== "completed", 422, "Đơn đã hoàn thành.");
  if (input.action === "deliver")
    return (await import("./shipments")).legacyDelivery(ctx, id, input);
  const quality = ["qc", "reinspect"].includes(input.action);
  requirePermission(ctx, quality ? "qc.manage" : "production.create", {
    stage: input.action,
  });
  const v = o.variants?.find(
    (v) => v.color === input.color && v.size === input.size,
  ) as Variant | undefined;
  ensure(v, 422, "Màu–size không hợp lệ.");
  ensure(
    !["nhan_don", "kiem_npl", "kiem_rap"].includes(o.current_stage),
    422,
    "Đơn hàng không ở công đoạn phù hợp.",
  );
  await validateProductImage(ctx, input.image_url);
  const operationDate = input.operation_date || today();
  ensure(
    operationDate <= today() && operationDate >= o.order_date,
    422,
    "Ngày xử lý phải từ ngày nhận đơn đến hôm nay.",
  );
  const inspection = ["qc", "reinspect"].includes(input.action);
  if (!inspection) {
    ensure(input.worker_id, 422, "Chọn thợ thực hiện đã phân công.");
    await requireAssignment(
      ctx,
      id,
      input.action === "rework" ? "Sửa hàng" : "Đóng gói",
      input.worker_id,
    );
  }
  ensure(
    !inspection || !input.worker_id || input.worker_id === ctx.user.employee_id,
    403,
    "Người kiểm QC được xác định từ tài khoản đang thao tác; không được chọn người khác.",
  );
  if (input.operation_time)
    ensure(
      new Date(`${operationDate}T${input.operation_time}:00+07:00`).getTime() <=
        Date.now(),
      422,
      "Ngày giờ xử lý không được ở tương lai.",
    );
  const passed = input.passed ?? input.quantity;
  ensure(
    passed <= input.quantity,
    422,
    "Số lượng đạt không được vượt số kiểm.",
  );
  if (input.action === "qc") {
    ensure(
      v.qc_inspected_qty + input.quantity <= v.sewn_qty,
      422,
      "Số kiểm vượt số đã may.",
    );
    await db
      .prepare(
        "UPDATE order_variants SET qc_inspected_qty=qc_inspected_qty+?,qc_passed_qty=qc_passed_qty+?,defect_qty=defect_qty+? WHERE id=?",
      )
      .run(input.quantity, passed, input.quantity - passed, v.id);
  } else if (input.action === "rework") {
    ensure(
      v.reworked_qty + input.quantity <=
        v.defect_qty + v.reinspected_qty - v.repassed_qty,
      422,
      "Số sửa vượt số lỗi đang chờ.",
    );
    await db
      .prepare(
        "UPDATE order_variants SET reworked_qty=reworked_qty+? WHERE id=?",
      )
      .run(input.quantity, v.id);
  } else if (input.action === "reinspect") {
    ensure(
      v.reinspected_qty + input.quantity <= v.reworked_qty,
      422,
      "Số kiểm lại vượt số đã sửa.",
    );
    await db
      .prepare(
        "UPDATE order_variants SET reinspected_qty=reinspected_qty+?,repassed_qty=repassed_qty+?,qc_passed_qty=qc_passed_qty+? WHERE id=?",
      )
      .run(input.quantity, passed, passed, v.id);
  } else if (input.action === "pack") {
    ensure(
      v.packed_qty + input.quantity <= v.qc_passed_qty,
      422,
      "Chỉ đóng gói số lượng đã QC đạt.",
    );
    await db
      .prepare("UPDATE order_variants SET packed_qty=packed_qty+? WHERE id=?")
      .run(input.quantity, v.id);
  } else {
    ensure(
      v.delivered_qty + input.quantity <= v.packed_qty,
      422,
      "Chỉ giao số lượng đã đóng gói.",
    );
    await db
      .prepare(
        "UPDATE order_variants SET delivered_qty=delivered_qty+? WHERE id=?",
      )
      .run(input.quantity, v.id);
  }
  const opTime =
    input.operation_time ||
    new Date().toLocaleTimeString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  const opResult = await db
    .prepare(
      "INSERT INTO operation_records(order_id,action,color,size,quantity,passed,packages,operation_date,operation_time,worker_id,notes,reason,image_url,actor_id,represented_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      id,
      input.action,
      v.color,
      v.size,
      input.quantity,
      ["qc", "reinspect"].includes(input.action) ? passed : null,
      input.packages || 0,
      operationDate,
      opTime,
      inspection
        ? ctx.user.employee_id
        : input.worker_id || ctx.user.employee_id,
      input.notes || input.defect_type || "",
      input.reason || null,
      input.image_url || null,
      ctx.actor.id,
      ctx.representing ? ctx.user.id : null,
    );
  await db
    .prepare("UPDATE operation_records SET department_id=? WHERE id=?")
    .run(departmentFor(input.action), opResult.lastInsertRowid);
  if (quality)
    await db
      .prepare(
        "INSERT INTO qc_records(order_id,color,size,inspected_qty,passed_qty,defect_qty,defect_type,rework_qty,reinspected_qty,repassed_qty,inspector) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        v.color,
        v.size,
        input.action === "qc" ? input.quantity : 0,
        input.action === "qc" ? passed : 0,
        input.action === "qc" ? input.quantity - passed : 0,
        input.defect_type || null,
        input.action === "rework" ? input.quantity : 0,
        input.action === "reinspect" ? input.quantity : 0,
        input.action === "reinspect" ? passed : 0,
        inspection ? ctx.user.name : actorLabel(ctx),
      );
  if (input.blame?.length) {
    ensure(input.action === "qc", 422, "Chỉ quy lỗi cho thợ khi QC lần đầu.");
    const defects = input.quantity - passed;
    ensure(
      input.blame.reduce((n, b) => n + b.quantity, 0) <= defects,
      422,
      `Số lỗi quy cho thợ vượt số lỗi QC (${defects}).`,
    );
    const people = await getEmployees();
    for (const b of input.blame) {
      const worker = people.find((e) => e.id === b.employee_id);
      ensure(
        worker?.department_ids?.includes(
          b.stage === "Cắt" ? "cutting" : "sewing",
        ),
        422,
        "Thợ gây lỗi phải thuộc bộ phận của công đoạn.",
      );
      const sum = async (table: string) =>
        Number(
          (
            (await db
              .prepare(
                `SELECT COALESCE(SUM(quantity),0) n FROM ${table} WHERE order_id=? AND color=? AND size=? AND employee_id=? AND stage=?`,
              )
              .get(id, v.color, v.size, b.employee_id, b.stage)) as {
              n: number;
            }
          ).n,
        );
      ensure(
        (await sum("defect_attributions")) + b.quantity <=
          (await sum("production_logs")),
        422,
        `${worker?.name} chưa ghi nhận đủ sản lượng ${b.stage} ở màu–size này để quy lỗi.`,
      );
      await db
        .prepare(
          "INSERT INTO defect_attributions(operation_id,order_id,color,size,employee_id,stage,quantity) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          opResult.lastInsertRowid,
          id,
          v.color,
          v.size,
          b.employee_id,
          b.stage,
          b.quantity,
        );
    }
  }
  await db.prepare("UPDATE orders SET version=version+1 WHERE id=?").run(id);
  await audit(
    ctx,
    "Ghi nhận công đoạn",
    `${id} ${v.color}/${v.size}: ${input.action} +${input.quantity}`,
    o.line_id,
    departmentFor(input.action),
  );
  return await getOrderById(id);
}
