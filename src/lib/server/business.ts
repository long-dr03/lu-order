import { completedWork } from "./work-items";
import {
  transitionProblem,
  exceptionalTransitionProblem,
  transitionPermissionProblem,
} from "../workflow";
import { z } from "zod";
import {
  db,
  getAllOrders,
  getOrderById,
  getEmployees,
  getLines,
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
  account,
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
}
export function visibleOrders(
  ctx: Context,
  permission: Permission = "orders.view",
) {
  return getAllOrders().filter((o) =>
    permits(ctx.user, permission, { lineId: o.line_id }),
  );
}
export function orderFor(ctx: Context, id: string, permission: Permission) {
  const order = getOrderById(id);
  ensure(order, 404, "Không tìm thấy đơn hàng.");
  requirePermission(ctx, permission, { lineId: order.line_id });
  return {
    ...order,
    operations: db
      .prepare(
        "SELECT r.*,COALESCE(e.name,a.name) worker_name FROM operation_records r LEFT JOIN employees e ON e.id=r.worker_id LEFT JOIN accounts a ON a.id=COALESCE(r.represented_id,r.actor_id) WHERE r.order_id=? ORDER BY r.id DESC",
      )
      .all(id),
  };
}
export function employeesFor(
  ctx: Context,
  permission: Permission = "production.view",
) {
  return getEmployees().filter((e) =>
    [e.line_id, ...(e.assigned_line_ids || [])].some((lineId) =>
      permits(ctx.user, permission, { employeeId: e.id, lineId }),
    ),
  );
}
export function linesFor(ctx: Context) {
  return getLines().filter(
    (l) =>
      ctx.user.roles
        .flatMap((r) => r.grants)
        .some(
          (g) =>
            g.scope === "all" ||
            (g.scope === "lines" && ctx.user.line_ids.includes(l.id)),
        ) || ctx.user.line_ids.includes(l.id),
  );
}
export function logsFor(
  ctx: Context,
  permission: Permission = "production.view",
) {
  return (
    db
      .prepare("SELECT * FROM production_logs ORDER BY log_date DESC,id DESC")
      .all() as ProductionLog[]
  )
    .filter((l) =>
      permits(ctx.user, permission, {
        employeeId: l.employee_id,
        lineId: l.line_id,
      }),
    )
    .map((l) => ({
      ...l,
      product_code:
        (
          db
            .prepare("SELECT product_code FROM orders WHERE id=?")
            .get(l.order_id) as { product_code: string } | undefined
        )?.product_code || "",
    }));
}
export interface Filters {
  month?: string;
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
export function filterLogs(logs: ProductionLog[], f: Filters) {
  return logs.filter(
    (l) =>
      (!f.month || l.month === f.month) &&
      (!f.employee_id || l.employee_id === f.employee_id) &&
      (!f.line_id || l.line_id === f.line_id) &&
      (!f.stage || l.stage === f.stage) &&
      (!f.product ||
        [
          l.order_id,
          l.product_name,
          (
            db
              .prepare("SELECT product_code FROM orders WHERE id=?")
              .get(l.order_id) as { product_code: string } | undefined
          )?.product_code || "",
        ]
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
    if (f.line_id && o.line_id !== f.line_id) return false;
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
      return ["qc", "qc_lai"].includes(o.current_stage);
    if (f.status === "cho_dong_goi") return o.current_stage === "dong_goi";
    if (f.status === "cho_giao")
      return o.current_stage === "giao_hang" && !o.delivered_complete;
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
    line_id: z.coerce.number().int().min(1).max(5).optional(),
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
          "line_id",
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
export function payrollFor(ctx: Context, f: Filters) {
  requirePermission(ctx, "payroll.view");
  const month = f.month || (f.from || f.to ? "" : today().slice(0, 7));
  const logs = filterLogs(logsFor(ctx, "payroll.view"), { ...f, month });
  const grouped = new Map<
    string,
    {
      employee_id: string;
      employee_name: string;
      line_id: number;
      total_qty: number;
      total_salary: number;
      total_entries: number;
    }
  >();
  for (const log of logs) {
    const groupKey = `${log.employee_id}:${log.line_id}`;
    const current = grouped.get(groupKey) || {
      employee_id: log.employee_id,
      employee_name: log.employee_name,
      line_id: log.line_id,
      total_qty: 0,
      total_salary: 0,
      total_entries: 0,
    };
    current.total_qty += log.quantity;
    current.total_salary += log.total_pay;
    current.total_entries++;
    grouped.set(groupKey, current);
  }
  const lock = db
    .prepare("SELECT * FROM payroll_locks WHERE month=?")
    .get(month) as { locked_by: string; locked_at: string } | undefined;
  return {
    month,
    logs,
    summary: [...grouped.values()],
    isLocked: !!lock,
    lockedBy: lock?.locked_by,
    lockedAt: lock?.locked_at,
  };
}
export function qcFor(ctx: Context) {
  const orders = visibleOrders(ctx, "qc.view");
  return (
    db.prepare("SELECT * FROM qc_records ORDER BY id DESC").all() as QcEntry[]
  ).filter((q) => orders.some((o) => o.id === q.order_id));
}
export function auditFor(ctx: Context) {
  requirePermission(ctx, "audit.view");
  return (
    db
      .prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500")
      .all() as AuditEntry[]
  ).filter((a) =>
    permits(ctx.user, "audit.view", {
      employeeId: account(a.represented_id || a.actor_id || "")?.employee_id,
      lineId: a.line_id ?? undefined,
    }),
  );
}
export function dashboard(ctx: Context) {
  const orders = visibleOrders(ctx);
  const logs = hasPermission(ctx.user, "production.view")
    ? filterLogs(logsFor(ctx), { month: today().slice(0, 7) })
    : [];
  const payroll = hasPermission(ctx.user, "payroll.view")
    ? payrollFor(ctx, {})
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
    employeesCount: employeesFor(ctx).length,
  };
}
export function unlocked(month: string) {
  ensure(
    !db.prepare("SELECT 1 FROM payroll_locks WHERE month=?").get(month),
    409,
    "Tháng lương đã chốt; không thể ghi thêm sản lượng.",
  );
}
export function idempotent<T>(
  ctx: Context,
  request: Request,
  input: unknown,
  operation: () => T,
): T {
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
  return db.transaction(() => {
    const old = db
      .prepare(
        "SELECT payload_hash,response FROM idempotency WHERE actor_id=? AND request_key=?",
      )
      .get(ctx.actor.id, key) as
      { payload_hash: string; response: string } | undefined;
    if (old) {
      ensure(
        old.payload_hash === signature,
        409,
        "Mã thao tác đã dùng cho dữ liệu khác.",
      );
      return JSON.parse(old.response) as T;
    }
    const result = operation();
    db.prepare("INSERT INTO idempotency VALUES (?,?,?,?)").run(
      ctx.actor.id,
      key,
      signature,
      JSON.stringify(result),
    );
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
function validateProductImage(
  ctx: Context,
  url: string | null | undefined,
  current?: string | null,
) {
  if (!url || url === current) return;
  const image = db
    .prepare("SELECT owner_id FROM product_images WHERE id=?")
    .get(url.split("/").pop()) as { owner_id: string } | undefined;
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
    line_id: line,
    priority: z.enum(["normal", "high", "urgent"]).default("normal"),
    notes: z.string().max(2000).default(""),
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
export function createOrder(
  ctx: Context,
  input: z.infer<typeof createOrderSchema>,
) {
  requirePermission(ctx, "orders.create", { lineId: input.line_id });
  ensure(
    input.deadline >= input.order_date,
    422,
    "Hạn giao phải từ ngày nhận đơn trở đi.",
  );
  if (input.responsible_id)
    ensure(
      db
        .prepare("SELECT 1 FROM employees WHERE id=? AND line_id=?")
        .get(input.responsible_id, input.line_id),
      422,
      "Người phụ trách phải thuộc chuyền được chọn.",
    );
  validateProductImage(ctx, input.image_url);
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
      !db.prepare("SELECT 1 FROM orders WHERE id=?").get(input.order_code),
    409,
    "Mã đơn đã tồn tại. Chọn mã khác.",
  );
  const order = createOrderWithVariants(
    {
      order: {
        id: input.order_code || generateNextOrderCode(),
        customer: input.customer,
        product_name: input.product_name,
        product_code:
          input.product_code ||
          `SP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        deadline: input.deadline,
        order_date: input.order_date,
        line_id: input.line_id,
        priority: input.priority,
        notes: input.notes,
        image_url: input.image_url || null,
        total_quantity: 0,
        current_stage: "nhan_don",
        assigned_to: `Chuyền ${input.line_id}`,
      },
      variants: input.variants,
    },
    actorLabel(ctx),
  );
  for (const v of input.variants) {
    db.prepare(
      "UPDATE order_variants SET color_hex=?,colors_json=? WHERE order_id=? AND color=? AND size=?",
    ).run(
      v.colors?.[0].hex || v.color_hex || null,
      v.colors ? JSON.stringify(v.colors) : null,
      order.id,
      v.color,
      v.size,
    );
  }
  if (input.responsible_id) {
    const employee = db
      .prepare("SELECT name FROM employees WHERE id=?")
      .get(input.responsible_id) as { name: string };
    db.prepare(
      "UPDATE orders SET responsible_id=?,assigned_to=? WHERE id=?",
    ).run(input.responsible_id, employee.name, order.id);
  }
  // Enrich the legacy creation audit with verified identities.
  db.prepare(
    "UPDATE audit_logs SET actor_id=?,represented_id=?,line_id=? WHERE id=(SELECT MAX(id) FROM audit_logs)",
  ).run(ctx.actor.id, ctx.representing ? ctx.user.id : null, input.line_id);
  return getOrderById(order.id)!;
}
export const moveSchema = z
  .object({
    version: z.number().int().positive(),
    image_url: productImageUrl.optional(),
    stage: stageSchema.optional(),
    exception: z.boolean().optional(),
    reason: z.string().trim().min(5).max(1000).optional(),
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
      v.notes !== undefined,
  );
export function moveOrder(
  ctx: Context,
  id: string,
  input: z.infer<typeof moveSchema>,
) {
  const o = getOrderById(id);
  ensure(o, 404, "Không tìm thấy đơn.");
  assertVersion(o, input.version);
  ensure(
    !input.exception || (input.stage && input.reason),
    422,
    "Chuyển bước ngoại lệ cần chọn bước và ghi lý do (ít nhất 5 ký tự).",
  );
  if (input.stage) {
    if (input.exception)
      requirePermission(ctx, "orders.override", { lineId: o.line_id });
    const permissionProblem = transitionPermissionProblem(ctx.user, o);
    ensure(!permissionProblem, 403, permissionProblem || "");
    const problem = input.exception
      ? exceptionalTransitionProblem(o, input.stage)
      : transitionProblem(o, input.stage);
    ensure(!problem, 422, problem || "");
  }
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
    input.image_url !== undefined
  )
    requirePermission(ctx, "orders.edit", { lineId: o.line_id });
  ensure(
    !input.deadline || input.deadline >= o.order_date,
    422,
    "Hạn giao không được trước ngày nhận đơn.",
  );
  validateProductImage(ctx, input.image_url, o.image_url);
  const responsible =
    input.responsible_id === undefined
      ? input.line_id && input.line_id !== o.line_id
        ? null
        : o.responsible_id || null
      : input.responsible_id;
  const person = responsible
    ? (db
        .prepare("SELECT name FROM employees WHERE id=? AND line_id=?")
        .get(responsible, input.line_id || o.line_id) as
        { name: string } | undefined)
    : undefined;
  ensure(
    !responsible || person,
    422,
    "Người phụ trách phải thuộc chuyền của đơn.",
  );
  const stage = input.stage || o.current_stage;
  const index = LUUTA_STAGES.findIndex((s) => s.key === stage);
  db.prepare(
    "UPDATE orders SET responsible_id=?,product_code=?,current_stage=?,line_id=?,assigned_to=?,customer=?,deadline=?,notes=?,image_url=?,progress=?,status=?,version=version+1 WHERE id=?",
  ).run(
    responsible,
    input.product_code || o.product_code,
    stage,
    input.line_id || o.line_id,
    person?.name || `Chuyền ${input.line_id || o.line_id}`,
    input.customer || o.customer,
    input.deadline || o.deadline,
    input.notes ?? o.notes,
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
    db.prepare(
      "UPDATE order_stages SET status='pending',completed_at=NULL WHERE order_id=? AND status='in_progress'",
    ).run(id);
    db.prepare(
      "UPDATE order_stages SET status='in_progress',started_at=CURRENT_TIMESTAMP,completed_at=NULL WHERE order_id=? AND stage_key=?",
    ).run(id, input.stage);
    if (stage === "hoan_thanh")
      db.prepare(
        "UPDATE order_stages SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE order_id=? AND stage_key=?",
      ).run(id, stage);
  } else if (input.stage) {
    db.prepare(
      "UPDATE order_stages SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE order_id=? AND stage_key=?",
    ).run(id, o.current_stage);
    if (["nhan_don", "kiem_npl", "kiem_rap"].includes(o.current_stage))
      db.prepare(
        "UPDATE order_stages SET completed_qty=received_qty,remaining_qty=0 WHERE order_id=? AND stage_key=?",
      ).run(id, o.current_stage);
    db.prepare(
      "UPDATE order_stages SET status=?,started_at=COALESCE(started_at,CURRENT_TIMESTAMP),completed_at=? WHERE order_id=? AND stage_key=?",
    ).run(
      stage === "hoan_thanh" ? "completed" : "in_progress",
      stage === "hoan_thanh" ? new Date().toISOString() : null,
      id,
      stage,
    );
  }
  audit(
    ctx,
    input.exception ? "Chuyển bước ngoại lệ" : "Cập nhật đơn",
    `${id}: Trước ${JSON.stringify({ customer: o.customer, product_code: o.product_code, deadline: o.deadline, line_id: o.line_id, notes: o.notes, image_url: o.image_url })}; Sau ${JSON.stringify(input)}; ${input.stage ? `${LUUTA_STAGES.find((s) => s.key === o.current_stage)?.label} → ${LUUTA_STAGES[index].label}` : ""}${input.line_id ? ` → Chuyền ${input.line_id}` : ""}${input.exception ? `; Lý do: ${input.reason}` : ""}`,
    input.line_id || o.line_id,
  );
  return getOrderById(id);
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
    quantity,
    version: z.number().int().positive(),
  })
  .strict();
export function recordProduction(
  ctx: Context,
  input: z.infer<typeof logSchema>,
) {
  const o = getOrderById(input.order_id);
  ensure(o, 404, "Không tìm thấy đơn.");
  assertVersion(o, input.version);
  const emp = getEmployees().find((e) => e.id === input.employee_id);
  ensure(emp, 422, "Nhân viên không hợp lệ.");
  ensure(
    canRecordProduction(ctx.user, emp, o),
    403,
    "Bạn không có quyền ghi nhận cho nhân viên này tại chuyền của đơn. Kiểm tra các chuyền được giao.",
  );
  ensure(
    input.log_date <= today(),
    422,
    "Không ghi sản lượng trong tương lai.",
  );
  const deferPackingPay =
    input.record_packing &&
    input.stage === "Đóng gói" &&
    !!db
      .prepare("SELECT 1 FROM payroll_locks WHERE month=?")
      .get(input.log_date.slice(0, 7));
  if (!deferPackingPay) unlocked(input.log_date.slice(0, 7));
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
  const parts = db
    .prepare(
      "SELECT id,name,unit_price FROM order_work_items WHERE order_id=? AND stage=? ORDER BY id",
    )
    .all(o.id, input.stage) as {
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
  const rate =
    part ||
    (db
      .prepare(
        "SELECT unit_price FROM order_rates WHERE order_id=? AND stage=?",
      )
      .get(o.id, input.stage) as { unit_price: number } | undefined);
  let completedQuantity = input.quantity;
  ensure(rate, 422, "Chưa có đơn giá cho công đoạn. Liên hệ quản lý.");
  const totalPay = input.quantity * rate.unit_price;
  const existingPay = (
    db
      .prepare(
        "SELECT (SELECT COALESCE(SUM(total_pay),0) FROM production_logs)+(SELECT COALESCE(SUM(total_pay),0) FROM pending_packing_pay WHERE settled_log_id IS NULL) total",
      )
      .get() as { total: number }
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
      input.stage === "Cắt"
        ? o.current_stage === "cat"
        : o.current_stage === "may",
      422,
      "Đơn hàng chưa ở công đoạn cần nhập.",
    );
    const maximum = input.stage === "Cắt" ? v.quantity : v.cut_qty;
    const paidPart = part
      ? (
          db
            .prepare(
              "SELECT COALESCE(SUM(quantity),0) n FROM production_logs WHERE work_item_id=? AND color=? AND size=?",
            )
            .get(part.id, v.color, v.size) as { n: number }
        ).n
      : v[column];
    ensure(
      paidPart + input.quantity <= maximum,
      422,
      "Số lượng vượt quá đầu vào của màu–size.",
    );
    const next = part
      ? completedWork(o.id, input.stage, v.color, v.size, {
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
    db.prepare(`UPDATE order_variants SET ${column}=? WHERE id=?`).run(
      next,
      v.id,
    );
  } else if (input.record_packing) {
    ensure(
      o.current_stage === "dong_goi",
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
    db.prepare(
      "UPDATE order_variants SET packed_qty=packed_qty+? WHERE id=?",
    ).run(input.quantity, v.id);
    const packingRecord = db
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
  } else {
    const processed =
      input.stage === "QC"
        ? v.qc_inspected_qty + v.reinspected_qty
        : input.stage === "Sửa hàng"
          ? v.reworked_qty
          : v.packed_qty;
    const paid = (
      db
        .prepare(
          "SELECT COALESCE(SUM(quantity),0) qty FROM production_logs WHERE order_id=? AND color=? AND size=? AND stage=?",
        )
        .get(o.id, v.color, v.size, input.stage) as { qty: number }
    ).qty;
    const reserved =
      input.stage === "Đóng gói"
        ? (
            db
              .prepare(
                "SELECT COALESCE(SUM(quantity),0) n FROM pending_packing_pay WHERE order_id=? AND color=? AND size=? AND settled_log_id IS NULL",
              )
              .get(o.id, v.color, v.size) as { n: number }
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
    const pending = db
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
    db.prepare("UPDATE orders SET version=version+1 WHERE id=?").run(o.id);
    audit(
      ctx,
      "Đóng gói chờ đối chiếu công",
      `${emp.name}: ${o.id} ${v.color}/${v.size} +${input.quantity}; ngày ${input.log_date}; tháng đã khóa, chưa cộng lương`,
      o.line_id,
    );
    return {
      pay_status: "pending" as const,
      pending_id: Number(pending.lastInsertRowid),
      message:
        "Đã xác nhận đóng gói. Tháng lương đã khóa; tiền công đang chờ quản lý đối chiếu trong Lương sản phẩm, chưa cộng vào lương.",
    };
  }
  const result = db
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
  db.prepare("UPDATE orders SET version=version+1 WHERE id=?").run(o.id);
  audit(
    ctx,
    "Nhập sản lượng",
    `${emp.name}: ${o.id} ${v.color}/${v.size} ${input.stage}${part ? ` · ${part.name}` : ""} +${input.quantity}; hoàn thành công đoạn +${completedQuantity}`,
    o.line_id,
  );
  return db
    .prepare("SELECT * FROM production_logs WHERE id=?")
    .get(result.lastInsertRowid) as ProductionLog;
}
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
  })
  .strict();
export function recordOperation(
  ctx: Context,
  id: string,
  input: z.infer<typeof operationSchema>,
) {
  const o = getOrderById(id);
  ensure(o, 404, "Không tìm thấy đơn.");
  assertVersion(o, input.version);
  const quality = ["qc", "rework", "reinspect"].includes(input.action);
  const selfDelivery =
    input.action === "deliver" &&
    !permits(ctx.user, "delivery.manage", { lineId: o.line_id });
  if (selfDelivery) {
    requirePermission(ctx, "delivery.record", { lineId: o.line_id });
    ensure(
      !!ctx.user.employee_id && ctx.user.line_ids.includes(o.line_id),
      403,
      "Cần hồ sơ nhân viên và chuyền được giao để ghi nhận giao hàng.",
    );
    ensure(
      !input.worker_id || input.worker_id === ctx.user.employee_id,
      403,
      "Chỉ được ghi nhận giao hàng cho chính mình.",
    );
  } else
    requirePermission(ctx, quality ? "qc.manage" : "delivery.manage", {
      lineId: o.line_id,
    });
  const v = o.variants?.find(
    (v) => v.color === input.color && v.size === input.size,
  ) as Variant | undefined;
  ensure(v, 422, "Màu–size không hợp lệ.");
  const expected = {
    qc: "qc",
    rework: "sua_hang",
    reinspect: "qc_lai",
    pack: "dong_goi",
    deliver: "giao_hang",
  };
  ensure(
    o.current_stage === expected[input.action],
    422,
    "Đơn hàng không ở công đoạn phù hợp.",
  );
  validateProductImage(ctx, input.image_url);
  const operationDate = input.operation_date || today();
  ensure(
    operationDate <= today() && operationDate >= o.order_date,
    422,
    "Ngày xử lý phải từ ngày nhận đơn đến hôm nay.",
  );
  const inspection = ["qc", "reinspect"].includes(input.action);
  ensure(
    !inspection || !input.worker_id || input.worker_id === ctx.user.employee_id,
    403,
    "Người kiểm QC được xác định từ tài khoản đang thao tác; không được chọn người khác.",
  );
  if (input.worker_id && input.worker_id !== ctx.user.employee_id) {
    const performer = getEmployees().find((e) => e.id === input.worker_id);
    ensure(
      performer &&
        (performer.line_id === o.line_id ||
          performer.assigned_line_ids?.includes(o.line_id)),
      422,
      "Người thực hiện phải thuộc hoặc được giao hỗ trợ chuyền của đơn.",
    );
  }
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
    db.prepare(
      "UPDATE order_variants SET qc_inspected_qty=qc_inspected_qty+?,qc_passed_qty=qc_passed_qty+?,defect_qty=defect_qty+? WHERE id=?",
    ).run(input.quantity, passed, input.quantity - passed, v.id);
  } else if (input.action === "rework") {
    ensure(
      v.reworked_qty + input.quantity <=
        v.defect_qty + v.reinspected_qty - v.repassed_qty,
      422,
      "Số sửa vượt số lỗi đang chờ.",
    );
    db.prepare(
      "UPDATE order_variants SET reworked_qty=reworked_qty+? WHERE id=?",
    ).run(input.quantity, v.id);
  } else if (input.action === "reinspect") {
    ensure(
      v.reinspected_qty + input.quantity <= v.reworked_qty,
      422,
      "Số kiểm lại vượt số đã sửa.",
    );
    db.prepare(
      "UPDATE order_variants SET reinspected_qty=reinspected_qty+?,repassed_qty=repassed_qty+?,qc_passed_qty=qc_passed_qty+? WHERE id=?",
    ).run(input.quantity, passed, passed, v.id);
  } else if (input.action === "pack") {
    ensure(
      v.packed_qty + input.quantity <= v.qc_passed_qty,
      422,
      "Chỉ đóng gói số lượng đã QC đạt.",
    );
    db.prepare(
      "UPDATE order_variants SET packed_qty=packed_qty+? WHERE id=?",
    ).run(input.quantity, v.id);
  } else {
    ensure(
      v.delivered_qty + input.quantity <= v.packed_qty,
      422,
      "Chỉ giao số lượng đã đóng gói.",
    );
    db.prepare(
      "UPDATE order_variants SET delivered_qty=delivered_qty+? WHERE id=?",
    ).run(input.quantity, v.id);
  }
  db.prepare(
    "INSERT INTO operation_records(order_id,action,color,size,quantity,passed,packages,operation_date,worker_id,notes,image_url,actor_id,represented_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    id,
    input.action,
    v.color,
    v.size,
    input.quantity,
    ["qc", "reinspect"].includes(input.action) ? passed : null,
    input.packages || 0,
    operationDate,
    inspection ? ctx.user.employee_id : input.worker_id || ctx.user.employee_id,
    input.notes || "",
    input.image_url || null,
    ctx.actor.id,
    ctx.representing ? ctx.user.id : null,
  );
  if (quality)
    db.prepare(
      "INSERT INTO qc_records(order_id,color,size,inspected_qty,passed_qty,defect_qty,defect_type,rework_qty,reinspected_qty,repassed_qty,inspector) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
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
  db.prepare("UPDATE orders SET version=version+1 WHERE id=?").run(id);
  audit(
    ctx,
    "Ghi nhận công đoạn",
    `${id} ${v.color}/${v.size}: ${input.action} +${input.quantity}`,
    o.line_id,
  );
  return getOrderById(id);
}
