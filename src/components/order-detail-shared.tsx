"use client";
import { useEffect, useState } from "react";
import { type Api, message } from "@/lib/client";
import { type DepartmentId } from "@/lib/departments";
import { type Order, type OrderVariant } from "@/lib/types";
import {
  remainingOperation,
  cutLimit,
  sewLimit,
  OUTPUT_STAGES,
  creditedStageBase,
} from "@/lib/workflow";
import { Policy } from "@/lib/policy";

export type Assignment = {
  id: string;
  stage: string;
  work_item_id: number | null;
  employee_id: string;
  employee_name: string;
  active: number;
  department_id: DepartmentId;
};

export type Total = {
  stage: string;
  work_item_id: number | null;
  color: string;
  size: string;
  quantity: number;
};

export type Shipment = {
  id: string;
  code: string;
  worker_name: string;
  actor_name: string;
  delivered_at: string;
  packages: number;
  reason: string | null;
  notes: string;
  items: { color: string; size: string; quantity: number }[];
};

export type Material = {
  id: number;
  name: string;
  unit: string;
  required: number;
  notes: string;
  received: number;
  defect: number;
  used: number;
  returned: number;
};

export type MaterialMovement = {
  id: number;
  material_id: number;
  material_name: string;
  unit: string;
  kind: "receive" | "defect" | "use" | "return";
  quantity: number;
  movement_date: string;
  notes: string;
  actor_name: string;
};

export type Detail = Order & {
  assignments?: Assignment[];
  shipments?: Shipment[];
  work_totals?: Total[];
  policy?: Policy;
  materials?: {
    items: Material[];
    movements: MaterialMovement[];
  };
  defects?: {
    id: number;
    color: string;
    size: string;
    stage: string;
    quantity: number;
    employee_name: string;
  }[];
  production_reasons?: {
    id: number;
    log_date: string;
    stage: string;
    color: string;
    size: string;
    quantity: number;
    employee_name: string;
    reason: string;
  }[];
  pending_totals?: { color: string; size: string; quantity: number }[];
};

export const keyFor = (v: { color: string; size: string }) =>
  JSON.stringify([v.color, v.size]);

export const workStages = ["Cắt", "May", "Sửa hàng", "Đóng gói"] as const;

export const preparationStages = ["Kiểm NPL/Vải", "Kiểm rập"];

/** Every stage of an order takes workers and output, checks and delivery included. */
export const outputStages: readonly string[] = OUTPUT_STAGES;
export const assignmentStages = [...OUTPUT_STAGES];

/** The output stage an order's current step corresponds to. */
export const OUTPUT_STAGE_OF: Record<string, string> = {
  kiem_npl: "Kiểm NPL/Vải",
  kiem_rap: "Kiểm rập",
  cat: "Cắt",
  may: "May",
  qc: "QC",
  sua_hang: "Sửa hàng",
  qc_lai: "QC",
  dong_goi: "Đóng gói",
  giao_hang: "Giao hàng",
};

export const prepared = (o: Order) =>
  !["nhan_don", "kiem_npl", "kiem_rap", "hoan_thanh"].includes(o.current_stage);

export function recordable(
  v: OrderVariant,
  stage: string,
  detail: Detail,
  part?: number,
  ceiling = false,
) {
  const paid =
    detail.work_totals
      ?.filter(
        (r) =>
          r.stage === stage &&
          (r.work_item_id || 0) === (part || 0) &&
          r.color === v.color &&
          r.size === v.size,
      )
      .reduce((n, r) => n + r.quantity, 0) || 0;
  // Checks, QC and delivery: what the order shows, less what has already been credited.
  const base = creditedStageBase(
    stage,
    v as Parameters<typeof creditedStageBase>[1],
  );
  if (base !== null) return Math.max(0, base - paid);
  if (stage === "Cắt")
    return Math.max(
      0,
      (ceiling
        ? cutLimit(v.quantity, detail.policy?.overcut_percent)
        : v.quantity) - (part ? paid : v.cut_qty),
    );
  if (stage === "May")
    return Math.max(0, sewLimit(v) - (part ? paid : v.sewn_qty));
  if (stage === "Sửa hàng") return remainingOperation(v, "rework");
  return remainingOperation(v, "pack");
}

export function useDetail(
  api: Api,
  id: string,
  version?: number,
  /** Change to read the order again when its list version has not caught up yet. */
  reload = 0,
) {
  const [state, setState] = useState<{
    id: string;
    version?: number;
    data: Detail | null;
    error: string;
  }>({ id: "", data: null, error: "" });
  useEffect(() => {
    let live = true;
    if (id)
      void api<Detail>(`/api/orders/${encodeURIComponent(id)}`)
        .then((data) => {
          if (live) setState({ id, version, data, error: "" });
        })
        .catch((e) => {
          if (live) setState({ id, version, data: null, error: message(e) });
        });
    return () => {
      live = false;
    };
  }, [api, id, version, reload]);
  return state.id === id && state.version === version
    ? state
    : { id, data: null, error: "" };
}

export const STAGE_ASSIGNMENT: Record<string, string> = {
  cat: "Cắt",
  may: "May",
  sua_hang: "Sửa hàng",
  dong_goi: "Đóng gói",
  giao_hang: "Giao hàng",
};
/** One plain sentence telling a manager what to do next, with a button that goes there. */

export const vnStamp = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

export const localDateTime = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .replace(" ", "T");

/** Pieces counted as delivered that no delivery record explains (entered before deliveries were logged). */
export const unrecordedDelivered = (o: Detail) =>
  Math.max(
    0,
    (o.variants || []).reduce((n, v) => n + v.delivered_qty, 0) -
      (o.shipments || []).reduce(
        (n, s) => n + s.items.reduce((m, r) => m + r.quantity, 0),
        0,
      ),
  );

export const formatDateTime = (v: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(v));

export const stageTime = (v: string) =>
  v.includes("T") ? formatDateTime(v) : v.slice(0, 16);

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function QuantityGrid({
  rows,
  amounts,
  onChange,
}: {
  rows: (OrderVariant & { remaining: number; limit?: number })[];
  amounts: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
}) {
  return (
    <div className="quantity-groups">
      {Array.from(new Set(rows.map((v) => v.color))).map((color) => (
        <section className="quantity-group" key={color}>
          <h3>{color}</h3>
          <div className="quantity-rows">
            {rows
              .filter((v) => v.color === color)
              .map((v) => (
                <label className="quantity-row" key={keyFor(v)}>
                  <span>
                    <strong>Size {v.size}</strong>
                    <span className="muted">
                      Còn {v.remaining.toLocaleString("vi-VN")}
                      {(amounts[keyFor(v)] || 0) > v.remaining &&
                        ` · cắt dư +${((amounts[keyFor(v)] || 0) - v.remaining).toLocaleString("vi-VN")}`}
                    </span>
                  </span>
                  <input
                    aria-label={`Số lượng ${color}, size ${v.size}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={v.limit ?? v.remaining}
                    step={1}
                    value={amounts[keyFor(v)] || ""}
                    placeholder="0"
                    onChange={(e) =>
                      onChange({
                        ...amounts,
                        [keyFor(v)]: Number(e.target.value),
                      })
                    }
                  />
                </label>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export const ACTION_LABELS: Record<string, string> = {
  qc: "QC",
  rework: "Sửa hàng",
  reinspect: "QC lại",
  pack: "Đóng gói",
  deliver: "Giao hàng",
  shortage: "Giải trình thiếu",
};

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL"];
const sizeRank = (size: string) => {
  const at = SIZE_ORDER.indexOf(size.trim().toUpperCase());
  return at < 0 ? SIZE_ORDER.length : at;
};
const dayMonthYear = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const hourMinute = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Delivery ledger the way workshops keep it on paper or in Excel: per colour, the ordered
 * quantities, then one line per delivery with the quantity of each size, the date, and what is
 * still owed after it.
 */
export function DeliveryTable({ order }: { order: Detail }) {
  const variants = order.variants || [];
  const sizes = [...new Set(variants.map((v) => v.size))].sort(
    (a, b) => sizeRank(a) - sizeRank(b) || a.localeCompare(b, "vi"),
  );
  const colors = [...new Set(variants.map((v) => v.color))];
  const shipments = [...(order.shipments || [])].sort(
    (a, b) => Date.parse(a.delivered_at) - Date.parse(b.delivered_at),
  );
  const sum = (bySize: Record<string, number>) =>
    Object.values(bySize).reduce((n, q) => n + q, 0);
  const blocks = colors.map((color) => {
    const ordered: Record<string, number> = {};
    const recorded: Record<string, number> = {};
    for (const v of variants.filter((v) => v.color === color))
      ordered[v.size] = (ordered[v.size] || 0) + v.quantity;
    const lines = shipments.flatMap((s) => {
      const bySize: Record<string, number> = {};
      for (const r of s.items.filter((r) => r.color === color)) {
        bySize[r.size] = (bySize[r.size] || 0) + r.quantity;
        recorded[r.size] = (recorded[r.size] || 0) + r.quantity;
      }
      return sum(bySize)
        ? [
            {
              key: s.id,
              date: dayMonthYear.format(new Date(s.delivered_at)),
              time: hourMinute.format(new Date(s.delivered_at)),
              who: s.worker_name,
              note: s.reason || "",
              bySize,
            },
          ]
        : [];
    });
    // Delivered pieces no record explains were entered before deliveries were logged.
    const before: Record<string, number> = {};
    for (const v of variants.filter((v) => v.color === color)) {
      const gap = v.delivered_qty - (recorded[v.size] || 0);
      if (gap > 0) before[v.size] = (before[v.size] || 0) + gap;
    }
    const all = [
      ...(sum(before)
        ? [
            {
              key: "before",
              date: "Trước đây",
              time: "",
              who: "Không có phiếu",
              note: "",
              bySize: before,
            },
          ]
        : []),
      ...lines,
    ];
    let left = sum(ordered);
    return {
      color,
      ordered,
      lines: all.map((line) => {
        left -= sum(line.bySize);
        return { ...line, total: sum(line.bySize), left };
      }),
      left,
    };
  });
  if (!blocks.some((b) => b.lines.length)) return null;
  return (
    <div className="table-scroll">
      <table className="delivery-table">
        <thead>
          <tr>
            <th>Ngày giao</th>
            {sizes.map((s) => (
              <th key={s} className="num">
                {s}
              </th>
            ))}
            <th className="num">Tổng</th>
            <th className="num">Còn lại</th>
            <th>Người giao</th>
          </tr>
        </thead>
        {blocks.map((b) => (
          <tbody key={b.color}>
            <tr className="delivery-ordered">
              <th scope="row">{b.color} · Đặt</th>
              {sizes.map((s) => (
                <td key={s} className="num">
                  {b.ordered[s] || ""}
                </td>
              ))}
              <td className="num">{sum(b.ordered)}</td>
              <td className="num">{sum(b.ordered)}</td>
              <td />
            </tr>
            {b.lines.map((line) => (
              <tr key={line.key}>
                <th scope="row">
                  {line.date}
                  {line.time && <small> {line.time}</small>}
                </th>
                {sizes.map((s) => (
                  <td key={s} className="num">
                    {line.bySize[s] || ""}
                  </td>
                ))}
                <td className="num">
                  <strong>{line.total}</strong>
                </td>
                <td className={`num${line.left > 0 ? " owed" : ""}`}>
                  {line.left}
                </td>
                <td>
                  {line.who}
                  {line.note && <small> · {line.note}</small>}
                </td>
              </tr>
            ))}
            {!b.lines.length && (
              <tr>
                <td colSpan={sizes.length + 4} className="muted">
                  Chưa giao
                </td>
              </tr>
            )}
          </tbody>
        ))}
      </table>
    </div>
  );
}
