import { db } from "@/lib/db";
export async function completedWork(
  orderId: string,
  stage: string,
  color: string,
  size: string,
  change?: { workId: number; delta: number },
) {
  const parts = (await db
    .prepare("SELECT id FROM order_work_items WHERE order_id=? AND stage=?")
    .all(orderId, stage)) as { id: number }[];
  if (!parts.length) return 0;
  return Math.min(
    ...(await Promise.all(
      parts.map(async (p) => {
        const n = (
          (await db
            .prepare(
              "SELECT COALESCE(SUM(quantity),0) n FROM production_logs WHERE work_item_id=? AND color=? AND size=?",
            )
            .get(p.id, color, size)) as { n: number }
        ).n;
        return n + (change?.workId === p.id ? change.delta : 0);
      }),
    )),
  );
}

export async function refreshWorkCompletion(
  orderId: string,
  stage: string,
  color: string,
  size: string,
) {
  const ids = (
    (await db
      .prepare("SELECT id FROM order_work_items WHERE order_id=? AND stage=?")
      .all(orderId, stage)) as { id: number }[]
  ).map((p) => p.id);
  const counts = new Map(ids.map((id) => [id, 0]));
  let before = 0;
  const logs = (await db
    .prepare(
      "SELECT id,work_item_id,quantity FROM production_logs WHERE order_id=? AND stage=? AND color=? AND size=? ORDER BY id",
    )
    .all(orderId, stage, color, size)) as {
    id: number;
    work_item_id: number;
    quantity: number;
  }[];
  for (const log of logs) {
    counts.set(
      log.work_item_id,
      (counts.get(log.work_item_id) || 0) + log.quantity,
    );
    const next = Math.min(...ids.map((id) => counts.get(id) || 0));
    await db
      .prepare("UPDATE production_logs SET completed_quantity=? WHERE id=?")
      .run(next - before, log.id);
    before = next;
  }
}
