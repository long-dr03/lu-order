import { z } from "zod";
import { db } from "../db";
import { departmentAccess, departmentFor } from "../departments";
import { permits } from "../permissions";
import { type Context, audit, ensure } from "./auth";
import { orderFor } from "./business";
import { text } from "./validation";

export const copyRatesSchema = z
  .object({
    order_id: text,
    copy_from: text,
    version: z.number().int().positive(),
  })
  .strict();

type Part = { stage: string; name: string; unit_price: number };

/**
 * Copies stage rates and Cắt/May work parts from an earlier order. Stages the
 * operator cannot price, or whose parts are already locked by output or
 * assignments, are skipped and reported instead of being overwritten.
 */
export async function copyRates(
  ctx: Context,
  input: z.infer<typeof copyRatesSchema>,
) {
  ensure(
    input.order_id !== input.copy_from,
    422,
    "Chọn một đơn khác để sao chép đơn giá.",
  );
  const target = await orderFor(ctx, input.order_id, "rates.manage");
  const source = await orderFor(ctx, input.copy_from, "rates.manage");
  return db.transaction(async () => {
    const fresh = (await db
      .prepare("SELECT version FROM orders WHERE id=?")
      .get(target.id)) as { version: number };
    ensure(
      fresh.version === input.version,
      409,
      "Đơn đã thay đổi; tải lại trước khi sao chép đơn giá.",
    );
    const allowed = (stage: string) =>
      permits(ctx.user, "rates.manage", { stage }) &&
      departmentAccess(ctx.user, departmentFor(stage));
    const copied: string[] = [];
    const skipped: string[] = [];
    const sourceParts = (await db
      .prepare(
        "SELECT stage,name,unit_price FROM order_work_items WHERE order_id=? ORDER BY id",
      )
      .all(source.id)) as Part[];
    const targetParts = (await db
      .prepare(
        "SELECT id,stage,name FROM order_work_items WHERE order_id=? ORDER BY id",
      )
      .all(target.id)) as (Part & { id: number })[];
    for (const stage of [...new Set(sourceParts.map((p) => p.stage))]) {
      if (!allowed(stage)) continue;
      const parts = sourceParts.filter((p) => p.stage === stage);
      const existing = targetParts.filter((p) => p.stage === stage);
      if (existing.length) {
        let matched = 0;
        for (const part of existing) {
          const same = parts.find(
            (p) =>
              p.name.toLocaleLowerCase("vi") ===
              part.name.toLocaleLowerCase("vi"),
          );
          if (!same) continue;
          await db
            .prepare("UPDATE order_work_items SET unit_price=? WHERE id=?")
            .run(same.unit_price, part.id);
          matched++;
        }
        (matched ? copied : skipped).push(
          matched
            ? `${stage}: ${matched} phần việc`
            : `${stage}: phần việc khác tên với đơn nguồn`,
        );
        continue;
      }
      const column = stage === "Cắt" ? "cut_qty" : "sewn_qty";
      const locked =
        (await db
          .prepare(
            "SELECT 1 FROM production_logs WHERE order_id=? AND stage=? LIMIT 1",
          )
          .get(target.id, stage)) ||
        (await db
          .prepare(
            `SELECT 1 FROM order_variants WHERE order_id=? AND ${column}>0 LIMIT 1`,
          )
          .get(target.id)) ||
        (await db
          .prepare(
            "SELECT 1 FROM work_assignments WHERE order_id=? AND stage=? LIMIT 1",
          )
          .get(target.id, stage));
      if (locked) {
        skipped.push(`${stage}: đã có phân công hoặc sản lượng`);
        continue;
      }
      for (const part of parts)
        await db
          .prepare(
            "INSERT INTO order_work_items(order_id,stage,name,unit_price) VALUES (?,?,?,?)",
          )
          .run(target.id, stage, part.name, part.unit_price);
      copied.push(`${stage}: ${parts.length} phần việc`);
    }
    const rates = (await db
      .prepare("SELECT stage,unit_price FROM order_rates WHERE order_id=?")
      .all(source.id)) as { stage: string; unit_price: number }[];
    const partStages = new Set(
      (
        (await db
          .prepare(
            "SELECT DISTINCT stage FROM order_work_items WHERE order_id=?",
          )
          .all(target.id)) as { stage: string }[]
      ).map((p) => p.stage),
    );
    for (const rate of rates) {
      if (!allowed(rate.stage) || partStages.has(rate.stage)) continue;
      await db
        .prepare(
          "INSERT INTO order_rates VALUES (?,?,?) ON CONFLICT(order_id,stage) DO UPDATE SET unit_price=excluded.unit_price",
        )
        .run(target.id, rate.stage, rate.unit_price);
      copied.push(rate.stage);
    }
    ensure(
      copied.length,
      422,
      skipped.length
        ? `Không sao chép được: ${skipped.join("; ")}.`
        : "Đơn nguồn chưa có đơn giá bạn được cấu hình.",
    );
    await db
      .prepare("UPDATE orders SET version=version+1 WHERE id=?")
      .run(target.id);
    await audit(
      ctx,
      "Sao chép đơn giá",
      `${source.id} → ${target.id}: ${copied.join(", ")}${skipped.length ? `; Bỏ qua: ${skipped.join("; ")}` : ""}`,
      target.line_id,
      "management",
    );
    return { copied, skipped };
  })();
}
