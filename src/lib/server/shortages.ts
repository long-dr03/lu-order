import { z } from "zod";
import { db, getOrderById } from "../db";
import { departmentFor } from "../departments";
import { permits } from "../permissions";
import { type Context, audit, ensure } from "./auth";
import { text, today } from "./validation";
import { SHORTAGE_CAUSES } from "../shortage";

export const shortageSchema = z
  .object({
    color: text,
    size: text,
    quantity: z.number().int().min(1).max(1000000),
    cause: z.enum(SHORTAGE_CAUSES),
    note: z.string().trim().max(1000).default(""),
  })
  .strict();

const RECORDERS = [
  "production.create",
  "qc.manage",
  "delivery.manage",
  "orders.edit",
] as const;

/**
 * Explains why part of a colour–size has not been delivered. It is an
 * operation record (action 'shortage') so it stays in the history, audit and
 * exports, but it never moves any production quantity.
 */
export async function recordShortage(
  ctx: Context,
  orderId: string,
  input: z.infer<typeof shortageSchema>,
) {
  ensure(
    RECORDERS.some((p) => permits(ctx.user, p)),
    403,
    "Bạn không có quyền ghi nguyên nhân thiếu.",
  );
  return db.transaction(async () => {
    const order = await getOrderById(orderId);
    ensure(order, 404, "Không tìm thấy đơn.");
    const v = order.variants?.find(
      (x) => x.color === input.color && x.size === input.size,
    );
    ensure(v, 422, "Màu–size không thuộc đơn hàng.");
    const shortage = Math.max(0, v.quantity - v.delivered_qty);
    ensure(shortage > 0, 422, "Màu–size này đã giao đủ, không còn thiếu.");
    const explained = (
      (await db
        .prepare(
          "SELECT COALESCE(SUM(quantity),0) n FROM operation_records WHERE order_id=? AND color=? AND size=? AND action='shortage'",
        )
        .get(orderId, v.color, v.size)) as { n: number }
    ).n;
    ensure(
      Number(explained) + input.quantity <= shortage,
      422,
      `Chỉ còn ${Math.max(0, shortage - Number(explained))} sản phẩm thiếu chưa giải trình.`,
    );
    const department =
      ctx.user.department_ids?.[0] ||
      (ctx.user.roles.some((r) => r.id === "admin")
        ? "management"
        : departmentFor("nhan_don"));
    const time = new Date().toLocaleTimeString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    await db
      .prepare(
        "INSERT INTO operation_records(order_id,action,color,size,quantity,passed,packages,operation_date,operation_time,worker_id,notes,reason,actor_id,represented_id,department_id) VALUES (?,'shortage',?,?,?,NULL,0,?,?,NULL,?,?,?,?,?)",
      )
      .run(
        orderId,
        v.color,
        v.size,
        input.quantity,
        today(),
        time,
        input.note,
        input.cause,
        ctx.actor.id,
        ctx.representing ? ctx.user.id : null,
        department,
      );
    await db
      .prepare("UPDATE orders SET version=version+1 WHERE id=?")
      .run(orderId);
    await audit(
      ctx,
      "Ghi nguyên nhân thiếu",
      `${orderId} ${v.color}/${v.size}: ${input.quantity} — ${input.cause}${input.note ? `: ${input.note}` : ""}`,
      order.line_id,
      department,
    );
    return { explained: Number(explained) + input.quantity, shortage };
  })();
}
