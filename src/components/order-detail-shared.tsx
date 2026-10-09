"use client";
import { useEffect, useState } from "react";
import { type Api, message } from "@/lib/client";
import { type DepartmentId } from "@/lib/departments";
import { type Order, type OrderVariant } from "@/lib/types";
import { remainingOperation, cutLimit, sewLimit } from "@/lib/workflow";
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

export const assignmentStages = [
  ...preparationStages,
  ...workStages,
  "Giao hàng",
];

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

export function useDetail(api: Api, id: string, version?: number) {
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
  }, [api, id, version]);
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
