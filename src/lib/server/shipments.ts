import { z } from "zod";
import { db, getOrderById } from "../db";
import {
  type Context,
  ensure,
  requirePermission,
  audit,
  randomUUID,
} from "./auth";
import { text, quantity } from "./validation";
import { requireAssignment } from "./departments";

export const shipmentSchema = z
  .object({
    version: z.number().int().positive(),
    worker_id: text,
    delivered_at: z.string().datetime({ offset: true }),
    packages: z.number().int().min(0).max(1000000).default(0),
    notes: z.string().max(2000).default(""),
    reason: z.string().trim().max(2000).optional(),
    incident: z.boolean().optional(),
    items: z
      .array(z.object({ color: text, size: text, quantity }).strict())
      .min(1)
      .max(100),
  })
  .strict();
export async function shipmentsFor(id: string) {
  const shipments = (await db
    .prepare(
      "SELECT s.*,e.name worker_name,a.name actor_name FROM shipments s JOIN employees e ON e.id=s.worker_id JOIN accounts a ON a.id=s.actor_id WHERE s.order_id=? ORDER BY s.delivered_at DESC,s.created_at DESC",
    )
    .all(id)) as { id: string }[];
  return Promise.all(
    shipments.map(async (s) => ({
      ...s,
      items: await db
        .prepare(
          "SELECT color,size,quantity FROM shipment_items WHERE shipment_id=? ORDER BY color,size",
        )
        .all(s.id),
    })),
  );
}
export async function createShipment(
  ctx: Context,
  id: string,
  input: z.infer<typeof shipmentSchema>,
) {
  requirePermission(ctx, "delivery.manage", { stage: "Giao hàng" });
  return db.transaction(async () => {
    const o = await getOrderById(id);
    ensure(o, 404, "Không tìm thấy đơn.");
    ensure(
      o.version === input.version,
      409,
      "Đơn đã thay đổi. Tải lại trước khi giao.",
    );
    ensure(
      o.status !== "completed" &&
        !["nhan_don", "kiem_npl", "kiem_rap"].includes(o.current_stage),
      422,
      "Đơn chưa đủ điều kiện giao hoặc đã hoàn thành.",
    );
    await requireAssignment(ctx, id, "Giao hàng", input.worker_id);
    const delivered = new Date(input.delivered_at);
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(delivered);
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(delivered);
    ensure(
      delivered.getTime() <= Date.now() && date >= o.order_date,
      422,
      "Thời điểm giao phải từ ngày nhận đơn đến hiện tại.",
    );
    ensure(
      !(date > o.deadline || input.incident) || !!input.reason,
      422,
      "Giao sau hạn hoặc có sự cố cần ghi rõ nguyên nhân.",
    );
    ensure(
      new Set(input.items.map((r) => JSON.stringify([r.color, r.size])))
        .size === input.items.length,
      422,
      "Không nhập trùng màu–size trong một đợt giao.",
    );
    for (const r of input.items) {
      const v = o.variants?.find(
        (v) => v.color === r.color && v.size === r.size,
      );
      ensure(
        v && v.delivered_qty + r.quantity <= v.packed_qty,
        422,
        `Lượng giao ${r.color}/${r.size} vượt lượng đã đóng gói chưa giao.`,
      );
    }
    const shipment = randomUUID();
    const code = `GH-${date.replaceAll("-", "")}-${shipment.slice(0, 8).toUpperCase()}`;
    await db
      .prepare(
        "INSERT INTO shipments(id,code,order_id,worker_id,delivered_at,packages,notes,reason,actor_id,represented_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        shipment,
        code,
        id,
        input.worker_id,
        input.delivered_at,
        input.packages,
        input.notes,
        input.reason || null,
        ctx.actor.id,
        ctx.representing ? ctx.user.id : null,
      );
    for (const r of input.items) {
      await db
        .prepare("INSERT INTO shipment_items VALUES (?,?,?,?,?)")
        .run(randomUUID(), shipment, r.color, r.size, r.quantity);
      await db
        .prepare(
          "UPDATE order_variants SET delivered_qty=delivered_qty+? WHERE order_id=? AND color=? AND size=?",
        )
        .run(r.quantity, id, r.color, r.size);
      await db
        .prepare(
          "INSERT INTO operation_records(order_id,action,color,size,quantity,passed,packages,operation_date,operation_time,worker_id,notes,reason,actor_id,represented_id,department_id,shipment_id) VALUES (?,'deliver',?,?,?,NULL,0,?,?,?,?,?,?,?,'delivery',?)",
        )
        .run(
          id,
          r.color,
          r.size,
          r.quantity,
          date,
          time,
          input.worker_id,
          input.notes,
          input.reason || null,
          ctx.actor.id,
          ctx.representing ? ctx.user.id : null,
          shipment,
        );
    }
    await db.prepare("UPDATE orders SET version=version+1 WHERE id=?").run(id);
    await audit(
      ctx,
      "Giao hàng theo đợt",
      `${id} ${code}: ${JSON.stringify(input)}`,
      undefined,
      "delivery",
    );
    return { id: shipment, code };
  })();
}
export async function legacyDelivery(
  ctx: Context,
  id: string,
  input: {
    version: number;
    worker_id?: string;
    operation_date?: string;
    operation_time?: string;
    color: string;
    size: string;
    quantity: number;
    packages?: number;
    notes?: string;
    reason?: string;
    incident?: boolean;
  },
) {
  ensure(input.worker_id, 422, "Chọn người giao đã được phân công.");
  ensure(
    input.operation_date && input.operation_time,
    422,
    "Nhập ngày và giờ giao thực tế.",
  );
  return createShipment(
    ctx,
    id,
    shipmentSchema.parse({
      version: input.version,
      worker_id: input.worker_id,
      delivered_at: `${input.operation_date}T${input.operation_time}:00+07:00`,
      packages: input.packages || 0,
      notes: input.notes || "",
      reason: input.reason,
      incident: input.incident,
      items: [
        { color: input.color, size: input.size, quantity: input.quantity },
      ],
    }),
  );
}
