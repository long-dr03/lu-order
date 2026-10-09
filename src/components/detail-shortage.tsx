"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { type Api, message } from "@/lib/client";
import { type SessionInfo, permits } from "@/lib/permissions";
import { type OrderVariant } from "@/lib/types";
import { SHORTAGE_CAUSES, shortageBreakdown } from "@/lib/shortage";
import { Action, Field, ErrorNotice, Empty } from "./Primitives";
import { ACTION_LABELS, Detail, vnStamp } from "./order-detail-shared";

export function ShortagePanel({
  order,
  variant: v,
  session,
  api,
  onChanged,
  onClose,
}: {
  order: Detail;
  variant: OrderVariant;
  session: SessionInfo;
  api: Api;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const short = Math.max(0, v.quantity - v.delivered_qty);
  const same = (r: { color: string; size: string }) =>
    r.color === v.color && r.size === v.size;
  const entries = [
    ...(order.operations || [])
      .filter(
        (r) => same(r) && (r.action === "shortage" || r.reason || r.notes),
      )
      .map((r) => ({
        key: `op-${r.id}`,
        stamp: `${r.operation_date} ${r.operation_time || "00:00"}`,
        source: ACTION_LABELS[r.action] || r.action,
        who: r.worker_name,
        quantity: r.quantity,
        text: [r.reason, r.notes].filter(Boolean).join(": "),
      })),
    ...(order.production_reasons || []).filter(same).map((r) => ({
      key: `log-${r.id}`,
      stamp: `${r.log_date} 00:00`,
      source: r.stage,
      who: r.employee_name,
      quantity: r.quantity,
      text: r.reason,
    })),
    ...(order.shipments || [])
      .filter((s) => s.reason && s.items.some(same))
      .map((s) => ({
        key: `ship-${s.id}`,
        stamp: vnStamp(s.delivered_at),
        source: `Giao hàng ${s.code}`,
        who: s.worker_name,
        quantity: s.items.find(same)?.quantity || 0,
        text: s.reason || "",
      })),
  ]
    .filter((r) => r.text)
    .sort((a, b) => b.stamp.localeCompare(a.stamp));
  const explained = (order.operations || [])
    .filter((r) => r.action === "shortage" && same(r))
    .reduce((n, r) => n + r.quantity, 0);
  const open = Math.max(0, short - explained);
  const canRecord = [
    "production.create",
    "qc.manage",
    "delivery.manage",
    "orders.edit",
  ].some((p) => permits(session.user, p as Parameters<typeof permits>[1]));
  const breakdown = shortageBreakdown(v);
  return (
    <section
      className="quantity-group"
      aria-label={`Nguyên nhân thiếu ${v.color} size ${v.size}`}
    >
      <div className="stack">
        <div className="card-top">
          <h3>
            Thiếu {short} · {v.color} / {v.size}
          </h3>
          <Action type="button" tone="secondary" onClick={onClose}>
            Đóng
          </Action>
        </div>
        <ErrorNotice error={error} />
        <h4>Đang nằm ở đâu</h4>
        {breakdown.map((r) => (
          <p key={r.label}>
            {r.label}: <strong>{r.quantity}</strong>
          </p>
        ))}
        {order.materials?.items.some((m) => m.defect > 0) && (
          <p>
            NPL/vải lỗi đã ghi cho đơn:{" "}
            {order.materials.items
              .filter((m) => m.defect > 0)
              .map((m) => `${m.name} ${m.defect} ${m.unit}`)
              .join("; ")}
          </p>
        )}
        <h4>Nguyên nhân đã ghi</h4>
        {entries.slice(0, 20).map((r) => (
          <p key={r.key}>
            <span className="muted">{r.stamp.replace(" 00:00", "")}</span> ·{" "}
            {r.source}
            {r.who ? ` · ${r.who}` : ""} · <strong>{r.quantity}</strong> —{" "}
            {r.text}
          </p>
        ))}
        {!entries.length && (
          <Empty>
            Chưa có nguyên nhân nào cho màu–size này. Hãy ghi bên dưới để giải
            trình với khách.
          </Empty>
        )}
        {canRecord && open > 0 && (
          <form
            key={explained}
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              try {
                await api(
                  `/api/orders/${encodeURIComponent(order.id)}/shortages`,
                  {
                    color: v.color,
                    size: v.size,
                    quantity: Number(f.get("quantity")),
                    cause: f.get("cause"),
                    note: String(f.get("note") || ""),
                  },
                );
                await onChanged();
              } catch (err) {
                setError(message(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <h4>Ghi nguyên nhân thiếu (còn {open} chưa giải trình)</h4>
            <div className="form-grid">
              <Field label="Nguyên nhân">
                <select name="cause" required>
                  {SHORTAGE_CAUSES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Số sản phẩm thiếu do nguyên nhân này">
                <input
                  name="quantity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={open}
                  step={1}
                  defaultValue={open}
                  required
                />
              </Field>
            </div>
            <Field
              label="Giải thích thêm"
              hint="Ví dụ: 1 áo lỗi sợi vải, đã báo nhà cung cấp."
            >
              <textarea name="note" maxLength={1000} />
            </Field>
            <Action type="submit" busy={busy}>
              <Check size={18} />
              Lưu nguyên nhân
            </Action>
          </form>
        )}
      </div>
    </section>
  );
}
