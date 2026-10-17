import { z } from "zod";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/departments";
import { type Context, ensure, audit } from "./auth";
import { text } from "./validation";

export const deleteOrderSchema = z.object({ confirm: text }).strict();

/**
 * Removes an order and everything recorded on it: quantities, assignments, pay, shipments,
 * checks and photos. Admin only, the order code typed back as confirmation, and never when
 * its pay sits in a month that has been closed.
 */
export async function deleteOrder(
  ctx: Context,
  id: string,
  input: z.infer<typeof deleteOrderSchema>,
) {
  ensure(isAdmin(ctx.user), 403, "Chỉ Admin được xóa đơn hàng.");
  ensure(input.confirm.trim() === id, 422, "Gõ đúng mã đơn để xác nhận xóa.");
  return db.transaction(async () => {
    ensure(
      await db.prepare("SELECT 1 FROM orders WHERE id=?").get(id),
      404,
      "Không tìm thấy đơn.",
    );
    ensure(
      !(await db
        .prepare(
          "SELECT 1 FROM production_logs l JOIN payroll_locks p ON p.month=substr(l.log_date,1,7) WHERE l.order_id=? LIMIT 1",
        )
        .get(id)),
      422,
      "Đơn có tiền công trong tháng lương đã chốt; không xóa được.",
    );
    await db.exec("SET CONSTRAINTS ALL DEFERRED");
    await db
      .prepare(
        "DELETE FROM production_adjustments WHERE log_id IN (SELECT id FROM production_logs WHERE order_id=?)",
      )
      .run(id);
    await db
      .prepare(
        "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE order_id=?)",
      )
      .run(id);
    // Every table that records something per order, so a table added later is not left behind.
    const tables = (await db
      .prepare(
        "SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='order_id' AND table_name<>'orders'",
      )
      .all()) as { table_name: string }[];
    for (const { table_name } of tables)
      await db
        .prepare(
          `DELETE FROM "${table_name.replace(/"/g, "")}" WHERE order_id=?`,
        )
        .run(id);
    await db.prepare("DELETE FROM orders WHERE id=?").run(id);
    // Pictures nothing points at any more.
    await db.exec(
      "DELETE FROM product_images p WHERE NOT EXISTS (SELECT 1 FROM orders WHERE image_url='/api/product-images/' || p.id) AND NOT EXISTS (SELECT 1 FROM order_photos WHERE image_url='/api/product-images/' || p.id) AND NOT EXISTS (SELECT 1 FROM preparation_checks WHERE photos LIKE '%/api/product-images/' || p.id || '%') AND NOT EXISTS (SELECT 1 FROM operation_records WHERE image_url='/api/product-images/' || p.id)",
    );
    await audit(ctx, "Xóa đơn hàng", id);
    return { deleted: id };
  })();
}
