import { z } from "zod";
import { db, getOrderById } from "../db";
import { permits, hasPermission } from "../permissions";
import {
  type Context,
  ensure,
  requirePermission,
  audit,
  actorLabel,
} from "./auth";
import { date, today } from "./validation";
export interface PendingPacking {
  id: number;
  order_id: string;
  employee_id: string;
  employee_name: string;
  product_name: string;
  line_id: number;
  color: string;
  size: string;
  work_date: string;
  quantity: number;
  unit_price: number | null;
  total_pay: number | null;
  settled_log_id: number | null;
}
export async function pendingPackingFor(ctx: Context) {
  ensure(
    hasPermission(ctx.user, "production.view") ||
      hasPermission(ctx.user, "payroll.view"),
    403,
    "Không có quyền xem công chờ đối chiếu.",
  );
  return (
    (await db
      .prepare(
        "SELECT id,order_id,employee_id,employee_name,product_name,line_id,color,size,work_date,quantity,unit_price,total_pay,settled_log_id FROM pending_packing_pay WHERE settled_log_id IS NULL ORDER BY work_date,id",
      )
      .all()) as PendingPacking[]
  )
    .filter(
      (p) =>
        permits(ctx.user, "production.view", {
          employeeId: p.employee_id,
          lineId: p.line_id,
        }) ||
        permits(ctx.user, "payroll.view", {
          employeeId: p.employee_id,
          lineId: p.line_id,
        }),
    )
    .map((p) =>
      permits(ctx.user, "payroll.view", {
        employeeId: p.employee_id,
        lineId: p.line_id,
      })
        ? p
        : { ...p, unit_price: null, total_pay: null },
    );
}
export const settlementSchema = z
  .object({
    id: z.number().int().positive(),
    pay_date: date,
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();
export async function settlePacking(
  ctx: Context,
  input: z.infer<typeof settlementSchema>,
) {
  const p = (await db
    .prepare("SELECT * FROM pending_packing_pay WHERE id=?")
    .get(input.id)) as PendingPacking | undefined;
  ensure(p, 404, "Không tìm thấy công chờ đối chiếu.");
  requirePermission(ctx, "payroll.adjust", { lineId: p.line_id });
  requirePermission(ctx, "payroll.view", {
    employeeId: p.employee_id,
    lineId: p.line_id,
  });
  ensure(
    !p.settled_log_id,
    409,
    "Khoản công này đã được đối chiếu. Tải lại danh sách.",
  );
  ensure(
    input.pay_date >= p.work_date && input.pay_date <= today(),
    422,
    "Ngày hạch toán phải từ ngày làm việc đến hôm nay.",
  );
  ensure(
    !(await db
      .prepare("SELECT 1 FROM payroll_locks WHERE month=?")
      .get(input.pay_date.slice(0, 7))),
    409,
    "Kỳ lương đã khóa. Chọn ngày hạch toán trong kỳ còn mở.",
  );
  const order = await getOrderById(p.order_id);
  ensure(order, 404, "Không tìm thấy đơn.");
  const variant = order.variants?.find(
    (v) => v.color === p.color && v.size === p.size,
  );
  ensure(variant, 422, "Không tìm thấy màu–size.");
  const paid = (
    (await db
      .prepare(
        "SELECT COALESCE(SUM(quantity),0) n FROM production_logs WHERE order_id=? AND color=? AND size=? AND stage='Đóng gói'",
      )
      .get(p.order_id, p.color, p.size)) as { n: number }
  ).n;
  const pending = (
    (await db
      .prepare(
        "SELECT COALESCE(SUM(quantity),0) n FROM pending_packing_pay WHERE order_id=? AND color=? AND size=? AND settled_log_id IS NULL",
      )
      .get(p.order_id, p.color, p.size)) as { n: number }
  ).n;
  ensure(
    paid + pending <= variant.packed_qty,
    422,
    "Công đóng gói không khớp số đã xử lý; cần đối chiếu dữ liệu trước.",
  );
  const total = (
    (await db
      .prepare("SELECT COALESCE(SUM(total_pay),0) n FROM production_logs")
      .get()) as { n: number }
  ).n;
  ensure(
    p.total_pay !== null && Number.isSafeInteger(total + p.total_pay),
    422,
    "Tổng tiền vượt khả năng tính chính xác.",
  );
  const log = await db
    .prepare(
      "INSERT INTO production_logs(log_date,employee_id,employee_name,line_id,order_id,product_name,color,size,stage,quantity,unit_price,total_pay,updated_by,month,completed_quantity) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      input.pay_date,
      p.employee_id,
      p.employee_name,
      p.line_id,
      p.order_id,
      p.product_name,
      p.color,
      p.size,
      "Đóng gói",
      p.quantity,
      p.unit_price,
      p.total_pay,
      actorLabel(ctx),
      input.pay_date.slice(0, 7),
      0,
    );
  const logId = Number(log.lastInsertRowid);
  await db
    .prepare(
      "UPDATE pending_packing_pay SET settled_log_id=?,settlement_reason=?,settled_at=to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD HH24:MI:SS') WHERE id=?",
    )
    .run(logId, input.reason, p.id);
  await db
    .prepare("UPDATE orders SET version=version+1 WHERE id=?")
    .run(p.order_id);
  await audit(
    ctx,
    "Đối chiếu công đóng gói",
    `Khoản ${p.id}: ${p.order_id} ${p.employee_name} ${p.quantity} sản phẩm; ngày làm ${p.work_date}; ngày hạch toán ${input.pay_date}; đơn giá giữ nguyên ${p.unit_price}; lý do ${input.reason}; bản ghi công ${logId}`,
    p.line_id,
  );
  return { log_id: logId };
}
