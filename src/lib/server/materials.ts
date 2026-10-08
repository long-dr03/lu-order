import { z } from "zod";
import { db, getOrderById } from "../db";
import { permits } from "../permissions";
import { type Context, audit, ensure } from "./auth";
import { text, today } from "./validation";

export const MATERIAL_UNITS = ["m", "kg", "cuộn", "cái", "bộ", "hộp"] as const;
export const MOVEMENT_KINDS = ["receive", "defect", "use", "return"] as const;
const amount = z
  .number()
  .positive()
  .max(10000000)
  .refine((n) => Math.round(n * 100) / 100 === n, "Tối đa 2 chữ số thập phân.");

export const materialSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("add"),
      name: z.string().trim().min(1).max(80),
      unit: z.enum(MATERIAL_UNITS),
      required_qty: z.number().min(0).max(10000000).default(0),
      notes: z.string().trim().max(500).default(""),
    })
    .strict(),
  z
    .object({
      action: z.literal("move"),
      material_id: z.number().int().positive(),
      kind: z.enum(MOVEMENT_KINDS),
      quantity: amount,
      movement_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      notes: text.max(500).optional(),
    })
    .strict(),
]);

export async function materialsFor(orderId: string) {
  const items = (await db
    .prepare(
      `SELECT m.id,m.name,m.unit,m.required_qty required,m.notes,
        COALESCE(SUM(CASE WHEN v.kind='receive' THEN v.quantity END),0) received,
        COALESCE(SUM(CASE WHEN v.kind='defect' THEN v.quantity END),0) defect,
        COALESCE(SUM(CASE WHEN v.kind='use' THEN v.quantity END),0) used,
        COALESCE(SUM(CASE WHEN v.kind='return' THEN v.quantity END),0) returned
       FROM order_materials m LEFT JOIN material_movements v ON v.material_id=m.id
       WHERE m.order_id=? GROUP BY m.id ORDER BY m.id`,
    )
    .all(orderId)) as {
    id: number;
    name: string;
    unit: string;
    required: number;
    notes: string;
    received: number;
    defect: number;
    used: number;
    returned: number;
  }[];
  const movements = await db
    .prepare(
      `SELECT v.id,v.material_id,m.name material_name,m.unit,v.kind,v.quantity,v.movement_date,v.notes,a.name actor_name,v.created_at
       FROM material_movements v JOIN order_materials m ON m.id=v.material_id JOIN accounts a ON a.id=COALESCE(v.represented_id,v.actor_id)
       WHERE v.order_id=? ORDER BY v.id DESC LIMIT 100`,
    )
    .all(orderId);
  return { items, movements };
}

export async function saveMaterial(
  ctx: Context,
  orderId: string,
  input: z.infer<typeof materialSchema>,
) {
  const canDefine = permits(ctx.user, "orders.edit", { stage: "nhan_don" });
  const canMove =
    canDefine || permits(ctx.user, "production.create", { stage: "Cắt" });
  ensure(
    input.action === "add" ? canDefine : canMove,
    403,
    input.action === "add"
      ? "Chỉ bộ phận Quản lý được khai báo NPL/vải."
      : "Bạn không có quyền ghi nhận NPL/vải.",
  );
  return db.transaction(async () => {
    const order = await getOrderById(orderId);
    ensure(order, 404, "Không tìm thấy đơn.");
    ensure(order.status !== "completed", 422, "Đơn đã hoàn thành.");
    if (input.action === "add") {
      ensure(
        !(await db
          .prepare(
            "SELECT 1 FROM order_materials WHERE order_id=? AND lower(name)=lower(?)",
          )
          .get(orderId, input.name)),
        409,
        "NPL/vải này đã được khai báo cho đơn.",
      );
      await db
        .prepare(
          "INSERT INTO order_materials(order_id,name,unit,required_qty,notes,created_by) VALUES (?,?,?,?,?,?)",
        )
        .run(
          orderId,
          input.name,
          input.unit,
          input.required_qty,
          input.notes,
          ctx.actor.id,
        );
      await audit(
        ctx,
        "Khai báo NPL/vải",
        `${orderId}: ${input.name} cần ${input.required_qty} ${input.unit}`,
        order.line_id,
        "management",
      );
    } else {
      const material = (await db
        .prepare(
          "SELECT name,unit FROM order_materials WHERE id=? AND order_id=?",
        )
        .get(input.material_id, orderId)) as
        { name: string; unit: string } | undefined;
      ensure(material, 422, "NPL/vải không thuộc đơn.");
      const date = input.movement_date || today();
      ensure(
        date <= today() && date >= order.order_date,
        422,
        "Ngày ghi nhận phải từ ngày nhận đơn đến hôm nay.",
      );
      if (["use", "defect", "return"].includes(input.kind)) {
        const totals = (await materialsFor(orderId)).items.find(
          (m) => m.id === input.material_id,
        )!;
        const onHand =
          totals.received - totals.returned - totals.defect - totals.used;
        ensure(
          Math.round((onHand - input.quantity) * 100) >= 0,
          422,
          `Chỉ còn ${Math.round(onHand * 100) / 100} ${material.unit} ${material.name} trong kho đơn này.`,
        );
      }
      await db
        .prepare(
          "INSERT INTO material_movements(material_id,order_id,kind,quantity,movement_date,notes,actor_id,represented_id) VALUES (?,?,?,?,?,?,?,?)",
        )
        .run(
          input.material_id,
          orderId,
          input.kind,
          input.quantity,
          date,
          input.notes || "",
          ctx.actor.id,
          ctx.representing ? ctx.user.id : null,
        );
      await audit(
        ctx,
        "Ghi nhận NPL/vải",
        `${orderId}: ${material.name} ${input.kind} ${input.quantity} ${material.unit}`,
        order.line_id,
        permits(ctx.user, "orders.edit", { stage: "nhan_don" })
          ? "management"
          : "cutting",
      );
    }
    await db
      .prepare("UPDATE orders SET version=version+1 WHERE id=?")
      .run(orderId);
    return materialsFor(orderId);
  })();
}
