import { hasPermission } from "@/lib/permissions";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  authenticate,
  guardWrite,
  ok,
  failure,
  requirePermission,
  audit,
  ensure,
} from "@/lib/server/auth";
import {
  visibleOrders,
  orderFor,
  STAGES,
  type Rate,
  idempotent,
} from "@/lib/server/business";
import { body, text } from "@/lib/server/validation";
import { initializeDatabase } from "@/lib/server/migrate";

export async function GET(request: Request) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    requirePermission(ctx, "orders.view");
    if (
      !hasPermission(ctx.user, "rates.manage") &&
      !hasPermission(ctx.user, "payroll.view")
    )
      return ok([]);
    const orders = await visibleOrders(ctx);
    return ok(
      (
        [
          ...(await db.prepare("SELECT * FROM order_rates").all()),
          ...(await db
            .prepare(
              "SELECT order_id,stage,unit_price,id work_item_id,name work_item_name FROM order_work_items",
            )
            .all()),
        ] as Rate[]
      ).filter((r) => orders.some((o) => o.id === r.order_id)),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    guardWrite(request, ctx);
    const input = z
      .object({
        order_id: text,
        stage: z.enum(STAGES),
        unit_price: z
          .number()
          .int()
          .min(0)
          .max(Number.MAX_SAFE_INTEGER)
          .optional(),
        work_item_id: z.number().int().positive().optional(),
        version: z.number().int().positive().optional(),
        work_items: z
          .array(
            z
              .object({
                name: z.string().trim().min(1).max(80),
                unit_price: z
                  .number()
                  .int()
                  .min(0)
                  .max(Number.MAX_SAFE_INTEGER),
              })
              .strict(),
          )
          .min(1)
          .max(30)
          .optional(),
      })
      .strict()
      .parse(await body(request));
    const order = await orderFor(ctx, input.order_id, "rates.manage");
    return ok(
      await idempotent(ctx, request, input, async () => {
        if (input.work_items) {
          ensure(
            ["Cắt", "May"].includes(input.stage),
            422,
            "Chỉ chia phần việc ở Cắt hoặc May.",
          );
          ensure(
            input.work_item_id === undefined && input.unit_price === undefined,
            422,
            "Không kết hợp cấu hình phần việc và đơn giá chung.",
          );
          const fresh = (await db
            .prepare("SELECT version FROM orders WHERE id=?")
            .get(order.id)) as { version: number };
          ensure(
            input.version === fresh.version,
            409,
            "Đơn đã thay đổi; tải lại trước khi cấu hình phần việc.",
          );
          ensure(
            new Set(input.work_items.map((p) => p.name.toLocaleLowerCase("vi")))
              .size === input.work_items.length,
            422,
            "Tên phần việc không được trùng.",
          );
          const column = input.stage === "Cắt" ? "cut_qty" : "sewn_qty";
          ensure(
            !(await db
              .prepare(
                "SELECT 1 FROM production_logs WHERE order_id=? AND stage=? LIMIT 1",
              )
              .get(order.id, input.stage)) &&
              !(await db
                .prepare(
                  `SELECT 1 FROM order_variants WHERE order_id=? AND ${column}>0 LIMIT 1`,
                )
                .get(order.id)),
            422,
            "Công đoạn đã có sản lượng. Không đổi danh sách phần việc để giữ lịch sử và tiến độ; chỉ sửa đơn giá cho lần sau.",
          );
          await db
            .prepare(
              "DELETE FROM order_work_items WHERE order_id=? AND stage=?",
            )
            .run(order.id, input.stage);
          for (const part of input.work_items)
            await db
              .prepare(
                "INSERT INTO order_work_items(order_id,stage,name,unit_price) VALUES (?,?,?,?)",
              )
              .run(order.id, input.stage, part.name, part.unit_price);
          await db
            .prepare("UPDATE orders SET version=version+1 WHERE id=?")
            .run(order.id);
          await audit(
            ctx,
            "Cấu hình phần việc",
            `${order.id} ${input.stage}: ${JSON.stringify(input.work_items)}`,
            order.line_id,
          );
          return input;
        }
        ensure(input.unit_price !== undefined, 422, "Thiếu đơn giá.");
        if (input.work_item_id) {
          ensure(
            await db
              .prepare(
                "SELECT 1 FROM order_work_items WHERE id=? AND order_id=? AND stage=?",
              )
              .get(input.work_item_id, order.id, input.stage),
            422,
            "Phần việc không thuộc đơn/công đoạn.",
          );
          await db
            .prepare("UPDATE order_work_items SET unit_price=? WHERE id=?")
            .run(input.unit_price, input.work_item_id);
          await audit(
            ctx,
            "Đơn giá phần việc",
            `${order.id} ${input.stage} #${input.work_item_id}: ${input.unit_price}`,
            order.line_id,
          );
          return input;
        }
        ensure(
          !(await db
            .prepare(
              "SELECT 1 FROM order_work_items WHERE order_id=? AND stage=?",
            )
            .get(order.id, input.stage)),
          422,
          "Công đoạn đã chia phần việc: hãy chọn phần việc để đặt giá.",
        );
        await db
          .prepare(
            "INSERT INTO order_rates VALUES (?,?,?) ON CONFLICT(order_id,stage) DO UPDATE SET unit_price=excluded.unit_price",
          )
          .run(input.order_id, input.stage, input.unit_price);
        await audit(
          ctx,
          "Cấu hình đơn giá",
          `${input.order_id} ${input.stage}: ${input.unit_price}`,
          order.line_id,
        );
        return input;
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
