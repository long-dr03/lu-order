import type { Order, Line } from "./types";
export interface Throughput {
  line_id: number | null;
  daily: number;
}
export function assessOrders(
  orders: Order[],
  lines: Line[],
  rates: Throughput[],
  now = new Date(),
) {
  void lines;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  for (const o of orders) {
    const variants = o.variants || [];
    o.delivered_complete =
      variants.length > 0 &&
      variants.every((v) => v.delivered_qty >= v.quantity);
    if (o.total_quantity > 0)
      o.progress = Math.min(
        100,
        Math.round(
          (variants.reduce(
            (n, v) =>
              n +
              v.cut_qty +
              v.sewn_qty +
              v.qc_passed_qty +
              v.packed_qty +
              v.delivered_qty,
            0,
          ) /
            (o.total_quantity * 5)) *
            100,
        ),
      );
    if (o.status === "completed") {
      o.risk_reason = "Đơn đã hoàn thành";
      continue;
    }
    const measured = rates.reduce((n, r) => n + r.daily, 0);
    const capacity = measured;
    const remaining = variants.reduce(
      (n, v) => n + Math.max(0, v.quantity - v.delivered_qty),
      0,
    );
    const days = Math.floor(
      (Date.parse(o.deadline) - Date.parse(today)) / 86400000,
    );
    const backlog = orders
      .filter((x) => x.status !== "completed" && x.deadline <= o.deadline)
      .reduce(
        (n, x) =>
          n +
          (x.variants || []).reduce(
            (sum, v) => sum + Math.max(0, v.quantity - v.delivered_qty),
            0,
          ),
        0,
      );
    if (days < 0 && remaining > 0) {
      o.status = "delayed";
      o.risk_reason = `Quá hạn ${-days} ngày; còn ${remaining} sản phẩm chưa giao`;
    } else if (
      remaining > 0 &&
      (capacity > 0 ? backlog / capacity > Math.max(0, days) : days <= 1)
    ) {
      o.status = "at_risk";
      o.risk_reason = `Còn ${remaining} sản phẩm; tải xưởng đến hạn ${backlog}; ${measured ? "năng suất may thực tế 14 ngày" : "chưa đủ dữ liệu năng suất"} ${Math.round(capacity)} SP/ngày; còn ${days} ngày`;
    } else {
      o.status = "on_track";
      o.risk_reason = o.delivered_complete
        ? "Đã giao đủ, chờ hoàn thành"
        : `Đủ thời gian; ${measured ? "năng suất may thực tế 14 ngày" : "chưa đủ dữ liệu năng suất"} ${Math.round(capacity)} SP/ngày; tải đến hạn ${backlog} SP; còn ${days} ngày`;
    }
  }
  return orders.sort(
    (a, b) =>
      ({ delayed: 0, at_risk: 1, on_track: 2, completed: 3 })[a.status] -
        { delayed: 0, at_risk: 1, on_track: 2, completed: 3 }[b.status] ||
      a.deadline.localeCompare(b.deadline),
  );
}
