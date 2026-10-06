import { completedWork, refreshWorkCompletion } from "./work-items";
import { transitionPermissionProblem } from "../workflow";
import { z } from "zod";
import { db, getOrderById } from "../db";
import { LUUTA_STAGES, type ProductionLog } from "../types";
import { type Context, requirePermission, ensure, audit } from "./auth";
import { text } from "./validation";
export const stageInfoSchema = z
  .object({
    version: z.number().int().positive(),
    stage: z.enum(
      LUUTA_STAGES.map((s) => s.key) as [
        (typeof LUUTA_STAGES)[number]["key"],
        ...(typeof LUUTA_STAGES)[number]["key"][],
      ],
    ),
    status: z.enum(["pending", "in_progress", "completed", "has_issue"]),
    employee_id: text,
    received_qty: z.number().int().min(0).max(100000000),
    completed_qty: z.number().int().min(0).max(100000000),
    notes: z.string().max(2000),
    received_at: z.string().max(30).optional(),
    started_at: z.string().max(30).optional(),
  })
  .strict();
export function updateStageInfo(
  ctx: Context,
  id: string,
  input: z.infer<typeof stageInfoSchema>,
) {
  const o = getOrderById(id);
  ensure(o, 404, "Không tìm thấy đơn.");
  const permissionProblem = transitionPermissionProblem(ctx.user, o);
  ensure(!permissionProblem, 403, permissionProblem || "");
  ensure(o.version === input.version, 409, "Đơn đã thay đổi. Tải lại dữ liệu.");
  if (["qc", "sua_hang", "qc_lai"].includes(input.stage))
    requirePermission(ctx, "qc.manage", { lineId: o.line_id });
  if (["dong_goi", "giao_hang"].includes(input.stage))
    requirePermission(ctx, "delivery.manage", { lineId: o.line_id });
  const employee = db
    .prepare("SELECT * FROM employees WHERE id=? AND line_id=?")
    .get(input.employee_id, o.line_id) as { name: string } | undefined;
  ensure(employee, 422, "Người phụ trách phải thuộc chuyền của đơn.");
  const before = db
    .prepare("SELECT * FROM order_stages WHERE order_id=? AND stage_key=?")
    .get(id, input.stage) as { status: string } | undefined;
  ensure(before, 404, "Không tìm thấy công đoạn.");
  ensure(
    input.stage === o.current_stage,
    422,
    "Chỉ cập nhật hồ sơ công đoạn hiện tại.",
  );
  ensure(
    input.completed_qty <= input.received_qty &&
      input.received_qty <= o.total_quantity,
    422,
    "Số hoàn thành không vượt số nhận; số nhận không vượt số đặt.",
  );
  const physical: Record<string, string> = {
    cat: "cut_qty",
    may: "sewn_qty",
    qc: "qc_inspected_qty",
    sua_hang: "reworked_qty",
    qc_lai: "reinspected_qty",
    dong_goi: "packed_qty",
    giao_hang: "delivered_qty",
  };
  if (physical[input.stage]) {
    const actual = (o.variants || []).reduce(
      (n, v) =>
        n +
        Number(
          (v as unknown as Record<string, number>)[physical[input.stage]] || 0,
        ),
      0,
    );
    ensure(
      input.completed_qty === actual,
      422,
      "Số hoàn thành công đoạn này lấy từ sản lượng/xử lý thực tế.",
    );
  }
  if (input.status === "completed")
    ensure(
      input.completed_qty === input.received_qty && input.received_qty > 0,
      422,
      "Chỉ hoàn thành khi đã xử lý đủ số nhận.",
    );
  for (const value of [input.received_at, input.started_at])
    if (value)
      ensure(
        !Number.isNaN(Date.parse(value)) && Date.parse(value) <= Date.now(),
        422,
        "Thời gian không hợp lệ hoặc ở tương lai.",
      );
  db.prepare(
    "UPDATE order_stages SET status=?,assignee=?,received_qty=?,completed_qty=?,remaining_qty=?,notes=?,received_at=COALESCE(NULLIF(?,''),received_at,CURRENT_TIMESTAMP),started_at=CASE WHEN ?='pending' THEN started_at ELSE COALESCE(NULLIF(?,''),started_at,CURRENT_TIMESTAMP) END,completed_at=CASE WHEN ?='completed' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE order_id=? AND stage_key=?",
  ).run(
    input.status,
    employee.name,
    input.received_qty,
    input.completed_qty,
    input.received_qty - input.completed_qty,
    input.notes,
    input.received_at || "",
    input.status,
    input.started_at || "",
    input.status,
    id,
    input.stage,
  );
  const after = db
    .prepare("SELECT * FROM order_stages WHERE order_id=? AND stage_key=?")
    .get(id, input.stage);
  db.prepare(
    "INSERT INTO stage_events(order_id,stage_key,before_json,after_json,actor_id,represented_id) VALUES (?,?,?,?,?,?)",
  ).run(
    id,
    input.stage,
    JSON.stringify(before),
    JSON.stringify(after),
    ctx.actor.id,
    ctx.representing ? ctx.user.id : null,
  );
  db.prepare("UPDATE orders SET version=version+1 WHERE id=?").run(id);
  audit(
    ctx,
    "Cập nhật hồ sơ công đoạn",
    `${id} ${input.stage}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`,
    o.line_id,
  );
  return getOrderById(id);
}
export const adjustmentSchema = z
  .object({
    log_id: z.number().int().positive(),
    version: z.number().int().positive(),
    quantity: z.number().int().min(0).max(1000000),
    unit_price: z.number().int().min(0),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();
export function adjustProduction(
  ctx: Context,
  input: z.infer<typeof adjustmentSchema>,
) {
  const old = db
    .prepare("SELECT * FROM production_logs WHERE id=?")
    .get(input.log_id) as ProductionLog | undefined;
  ensure(old, 404, "Không tìm thấy sản lượng.");
  requirePermission(ctx, "payroll.adjust", { lineId: old.line_id });
  ensure(
    old.version === input.version,
    409,
    "Dòng sản lượng đã thay đổi. Tải lại dữ liệu.",
  );
  const o = getOrderById(old.order_id);
  ensure(o, 404, "Không tìm thấy đơn.");
  const v = o.variants?.find(
    (v) => v.color === old.color && v.size === old.size,
  );
  ensure(v, 422, "Không tìm thấy biến thể.");
  const delta = input.quantity - old.quantity;
  const column =
    old.stage === "Cắt" ? "cut_qty" : old.stage === "May" ? "sewn_qty" : null;
  if (column) {
    const next = old.work_item_id
      ? completedWork(o.id, old.stage, old.color, old.size, {
          workId: old.work_item_id,
          delta,
        })
      : v[column] + delta;
    if (old.work_item_id) {
      const paid = (
        db
          .prepare(
            "SELECT COALESCE(SUM(quantity),0) n FROM production_logs WHERE work_item_id=? AND color=? AND size=?",
          )
          .get(old.work_item_id, old.color, old.size) as { n: number }
      ).n;
      ensure(
        paid + delta <= (column === "cut_qty" ? v.quantity : v.cut_qty),
        422,
        "Phần việc vượt số lượng đầu vào.",
      );
    }
    const min =
      column === "cut_qty"
        ? v.sewn_qty
        : Number(
            (v as unknown as { qc_inspected_qty: number }).qc_inspected_qty,
          );
    const max = column === "cut_qty" ? v.quantity : v.cut_qty;
    ensure(
      next >= min && next <= max,
      422,
      "Điều chỉnh làm sai đầu vào/đầu ra của công đoạn tiếp theo.",
    );
    db.prepare(`UPDATE order_variants SET ${column}=? WHERE id=?`).run(
      next,
      v.id,
    );
  } else {
    const processed =
      old.stage === "QC"
        ? Number(
            (
              v as unknown as {
                qc_inspected_qty: number;
                reinspected_qty: number;
              }
            ).qc_inspected_qty,
          ) +
          Number((v as unknown as { reinspected_qty: number }).reinspected_qty)
        : old.stage === "Sửa hàng"
          ? Number((v as unknown as { reworked_qty: number }).reworked_qty)
          : v.packed_qty;
    const paid = (
      db
        .prepare(
          "SELECT COALESCE(SUM(quantity),0) n FROM production_logs WHERE order_id=? AND color=? AND size=? AND stage=?",
        )
        .get(old.order_id, old.color, old.size, old.stage) as { n: number }
    ).n;
    const reserved =
      old.stage === "Đóng gói"
        ? (
            db
              .prepare(
                "SELECT COALESCE(SUM(quantity),0) n FROM pending_packing_pay WHERE order_id=? AND color=? AND size=? AND settled_log_id IS NULL",
              )
              .get(old.order_id, old.color, old.size) as { n: number }
          ).n
        : 0;
    ensure(
      paid + reserved + delta <= processed,
      422,
      "Tiền công không được vượt số thực tế đã xử lý.",
    );
  }
  const total = input.quantity * input.unit_price;
  const global = (
    db
      .prepare("SELECT COALESCE(SUM(total_pay),0) n FROM production_logs")
      .get() as { n: number }
  ).n;
  ensure(
    Number.isSafeInteger(total) &&
      Number.isSafeInteger(global - old.total_pay + total),
    422,
    "Tổng tiền vượt khả năng tính chính xác.",
  );
  db.prepare(
    "UPDATE production_logs SET quantity=?,unit_price=?,total_pay=?,version=version+1 WHERE id=?",
  ).run(input.quantity, input.unit_price, total, old.id);
  if (old.work_item_id)
    refreshWorkCompletion(o.id, old.stage, old.color, old.size);
  else
    db.prepare(
      "UPDATE production_logs SET completed_quantity=? WHERE id=?",
    ).run(input.quantity, old.id);
  const after = db
    .prepare("SELECT * FROM production_logs WHERE id=?")
    .get(old.id);
  db.prepare(
    "INSERT INTO production_adjustments(log_id,before_json,after_json,reason,actor_id,represented_id) VALUES (?,?,?,?,?,?)",
  ).run(
    old.id,
    JSON.stringify(old),
    JSON.stringify(after),
    input.reason,
    ctx.actor.id,
    ctx.representing ? ctx.user.id : null,
  );
  db.prepare("UPDATE orders SET version=version+1 WHERE id=?").run(o.id);
  audit(
    ctx,
    "Điều chỉnh sản lượng/tiền công",
    `${old.id}: ${JSON.stringify(old)} → ${JSON.stringify(after)}; Lý do: ${input.reason}; ${old.is_locked ? "Tháng đã chốt" : "Chưa chốt"}`,
    old.line_id,
  );
  return after;
}
