import sharp from "sharp";
import { db } from "@/lib/db";
import {
  authenticate,
  failure,
  requirePermission,
  audit,
} from "@/lib/server/auth";
import {
  visibleOrders,
  queryFilters,
  filterOrders,
} from "@/lib/server/business";
import { permits } from "@/lib/permissions";
import { today } from "@/lib/server/validation";
import { initializeDatabase } from "@/lib/server/migrate";
import {
  trackingWorkbook,
  type TrackingLine,
  type TrackingOrder,
} from "@/lib/server/tracking-export";

/** Vietnam-local calendar day of a stored timestamp. */
const vnDay = (value: string | Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

function group<T extends { order_id: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows)
    map.set(row.order_id, [...(map.get(row.order_id) || []), row]);
  return map;
}
/** Lines of the same day (or the same delivery) gathered into one row of the sheet. */
function byKey<T extends TrackingLine & { key: string; date: string }>(
  rows: T[],
) {
  const out = new Map<string, { date: string; items: TrackingLine[] }>();
  for (const r of rows) {
    const entry = out.get(r.key) || { date: r.date, items: [] };
    const same = entry.items.find(
      (i) => i.color === r.color && i.size === r.size,
    );
    if (same) same.quantity += Number(r.quantity);
    else
      entry.items.push({
        color: r.color,
        size: r.size,
        quantity: Number(r.quantity),
      });
    out.set(r.key, entry);
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** The workshop's tracking workbook, one sheet per customer, from the orders the user may export. */
export async function GET(request: Request) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    requirePermission(ctx, "export.data");
    requirePermission(ctx, "orders.view");
    const orders = filterOrders(
      (await visibleOrders(ctx, "orders.view")).filter((o) =>
        permits(ctx.user, "export.data", { lineId: o.line_id }),
      ),
      queryFilters(request),
    );
    const ids = orders.map((o) => o.id);
    const all = <T>(sql: string) => db.prepare(sql).all(ids) as Promise<T[]>;
    const shipped = await all<
      TrackingLine & { order_id: string; shipment_id: string; at: Date }
    >(
      "SELECT s.order_id,s.id shipment_id,s.delivered_at at,i.color,i.size,i.quantity FROM shipments s JOIN shipment_items i ON i.shipment_id=s.id WHERE s.order_id=ANY(?::text[])",
    );
    // Deliveries recorded before shipment batches existed.
    const earlier = await all<
      TrackingLine & {
        order_id: string;
        id: number;
        operation_date: string;
      }
    >(
      "SELECT order_id,id,color,size,quantity,operation_date FROM operation_records WHERE action='deliver' AND shipment_id IS NULL AND order_id=ANY(?::text[])",
    );
    const sewn = await all<
      TrackingLine & { order_id: string; log_date: string }
    >(
      "SELECT order_id,log_date,color,size,SUM(COALESCE(completed_quantity,quantity)) quantity FROM production_logs WHERE stage='May' AND order_id=ANY(?::text[]) GROUP BY order_id,log_date,color,size HAVING SUM(COALESCE(completed_quantity,quantity))>0",
    );
    const cutLogs = await all<{ order_id: string; day: string }>(
      "SELECT order_id,MAX(log_date) AS day FROM production_logs WHERE stage='Cắt' AND order_id=ANY(?::text[]) GROUP BY order_id",
    );
    const stages = await all<{
      order_id: string;
      stage_key: string;
      started_at: string | null;
      completed_at: string | null;
    }>(
      "SELECT order_id,stage_key,started_at,completed_at FROM order_stages WHERE stage_key IN ('cat','may') AND order_id=ANY(?::text[])",
    );
    const sewers = await all<{
      order_id: string;
      name: string;
      since: string;
    }>(
      "SELECT w.order_id,e.name,MIN(w.created_at) since FROM work_assignments w JOIN employees e ON e.id=w.employee_id WHERE w.stage='May' AND w.active=1 AND w.order_id=ANY(?::text[]) GROUP BY w.order_id,e.name ORDER BY 3",
    );
    const imageIds = [
      ...new Set(
        orders.flatMap((o) => {
          const id = (o.image_url || "").match(/([0-9a-f-]{36})$/)?.[1];
          return id ? [id] : [];
        }),
      ),
    ];
    const pictures = new Map<string, TrackingOrder["image"]>();
    for (const row of (await db
      .prepare("SELECT id,data FROM product_images WHERE id=ANY(?::text[])")
      .all(imageIds)) as { id: string; data: Buffer }[]) {
      try {
        // Small copies keep a workbook with a hundred products easy to send.
        const { data, info } = await sharp(row.data)
          .resize({ width: 360, height: 480, fit: "inside" })
          .jpeg({ quality: 80 })
          .toBuffer({ resolveWithObject: true });
        pictures.set(row.id, {
          buffer: data,
          width: info.width,
          height: info.height,
        });
      } catch {
        // A picture that cannot be read is left out; the row still exports.
      }
    }
    const shippedBy = group(shipped);
    const earlierBy = group(earlier);
    const sewnBy = group(sewn);
    const stagesBy = group(stages);
    const sewersBy = group(sewers);
    const cutBy = new Map(cutLogs.map((r) => [r.order_id, r.day]));
    const rows: TrackingOrder[] = orders.map((o) => {
      const variants = (o.variants || []).map((v) => ({
        color: v.color,
        size: v.size,
        quantity: Number(v.quantity),
        cut_qty: Number(v.cut_qty),
        delivered_qty: Number(v.delivered_qty),
      }));
      const stage = (key: string) =>
        (stagesBy.get(o.id) || []).find((s) => s.stage_key === key);
      const cutFinished = variants.every((v) => v.cut_qty >= v.quantity);
      const team = sewersBy.get(o.id) || [];
      return {
        id: o.id,
        customer: o.customer,
        product_name: o.product_name,
        order_date: o.order_date,
        deadline: o.deadline,
        notes: o.notes || "",
        completed: o.status === "completed",
        variants,
        deliveries: byKey([
          ...(shippedBy.get(o.id) || []).map((r) => ({
            ...r,
            key: `s:${r.shipment_id}`,
            date: vnDay(r.at),
          })),
          ...(earlierBy.get(o.id) || []).map((r) => ({
            ...r,
            key: `o:${r.id}`,
            date: r.operation_date,
          })),
        ]),
        sewing: byKey(
          (sewnBy.get(o.id) || []).map((r) => ({
            ...r,
            key: r.log_date,
            date: r.log_date,
          })),
        ),
        cutDone: cutFinished
          ? cutBy.get(o.id) || stage("cat")?.completed_at?.slice(0, 10)
          : undefined,
        sewingStart:
          team[0]?.since?.slice(0, 10) ||
          stage("may")?.started_at?.slice(0, 10),
        sewers: team.map((t) => t.name),
        image: pictures.get(
          (o.image_url || "").match(/([0-9a-f-]{36})$/)?.[1] || "",
        ),
      };
    });
    const buffer = await trackingWorkbook(rows).xlsx.writeBuffer();
    await audit(ctx, "Xuất Excel", `Mẫu theo dõi đơn hàng, ${rows.length} đơn`);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="THEO_DOI_DON_HANG_${today()}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
