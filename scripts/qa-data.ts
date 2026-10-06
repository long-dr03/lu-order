import { loadEnvConfig } from "@next/env";
import { db as database } from "../src/lib/server/database";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
loadEnvConfig(process.cwd());
async function main() {
  try {
    const variants = (await database
      .prepare(
        "SELECT order_id,color,size,quantity,cut_qty,sewn_qty,qc_passed_qty,packed_qty,delivered_qty FROM order_variants ORDER BY order_id,color,size",
      )
      .all()) as {
      order_id: string;
      color: string;
      size: string;
      quantity: number;
      cut_qty: number;
      sewn_qty: number;
      qc_passed_qty: number;
      packed_qty: number;
      delivered_qty: number;
    }[];
    const completionColumn = true;
    const findings: object[] = [];
    for (const row of variants) {
      const fields = [
        "quantity",
        "cut_qty",
        "sewn_qty",
        "qc_passed_qty",
        "packed_qty",
        "delivered_qty",
      ] as const;
      for (let index = 0; index < fields.length; index++) {
        const field = fields[index];
        if (
          row[field] < 0 ||
          (index > 0 && row[field] > row[fields[index - 1]])
        )
          findings.push({
            kind: "quantity_bounds",
            order: row.order_id,
            color: row.color,
            size: row.size,
            field,
            value: row[field],
            ...(index > 0
              ? { inputField: fields[index - 1], input: row[fields[index - 1]] }
              : {}),
          });
      }
      for (const [stage, column] of [
        ["Cắt", "cut_qty"],
        ["May", "sewn_qty"],
      ] as const) {
        const logged = (
          (await database
            .prepare(
              `SELECT COALESCE(SUM(${completionColumn ? "COALESCE(completed_quantity,quantity)" : "quantity"}),0) qty FROM production_logs WHERE order_id=? AND color=? AND size=? AND stage=?`,
            )
            .get(row.order_id, row.color, row.size, stage)) as { qty: number }
        ).qty;
        if (logged !== row[column])
          findings.push({
            kind: "history_reconciliation",
            order: row.order_id,
            color: row.color,
            size: row.size,
            stage,
            counter: row[column],
            logged,
            note: "Cần đối chiếu nguồn lịch sử; chưa kết luận bộ đếm hay log sai.",
          });
      }
    }
    const totals = await database
      .prepare(
        "SELECT o.id,o.total_quantity,COALESCE(SUM(v.quantity),0) variant_total FROM orders o LEFT JOIN order_variants v ON v.order_id=o.id GROUP BY o.id HAVING o.total_quantity<>COALESCE(SUM(v.quantity),0)",
      )
      .all();
    const report = {
      generatedAt: new Date().toISOString(),
      mode: "readonly",
      databaseEngine: "PostgreSQL",
      orderTotalMismatches: totals,
      findings,
      baseline: {
        orders: (
          (await database.prepare("SELECT COUNT(*) n FROM orders").get()) as {
            n: number;
          }
        ).n,
        variants: variants.length,
        productionLogs: (
          (await database
            .prepare("SELECT COUNT(*) n FROM production_logs")
            .get()) as {
            n: number;
          }
        ).n,
        totalWages: (
          (await database
            .prepare("SELECT COALESCE(SUM(total_pay),0) n FROM production_logs")
            .get()) as { n: number }
        ).n,
      },
      decision:
        "Không tự chỉnh dữ liệu hoặc tiền công. Quản lý đối chiếu nguồn và ghi lý do/lịch sử nếu điều chỉnh.",
    };
    mkdirSync("artifacts", { recursive: true });
    writeFileSync(
      resolve("artifacts/data-integrity-report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      `Đã kiểm tra chỉ đọc: ${variants.length} biến thể, ${findings.length} điểm cần đối chiếu; ${totals.length} tổng đơn không khớp. Báo cáo: artifacts/data-integrity-report.json`,
    );
  } finally {
    await database.close();
  }
}
main().catch(() => {
  console.error("Data check failed");
  process.exitCode = 1;
});
