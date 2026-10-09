"use client";
import { useState } from "react";
import { Truck } from "lucide-react";
import { type Api, message } from "@/lib/client";
import { type SessionInfo, permits } from "@/lib/permissions";
import { type Employee } from "@/lib/types";
import { remainingOperation } from "@/lib/workflow";
import { Action, Field, ErrorNotice, Empty } from "./Primitives";
import { Pagination } from "./Pagination";
import {
  Detail,
  QuantityGrid,
  formatDateTime,
  keyFor,
  localDateTime,
} from "./order-detail-shared";

export function ShipmentPanel({
  order,
  session,
  employees,
  api,
  onChanged,
}: {
  order: Detail;
  session: SessionInfo;
  employees: Employee[];
  api: Api;
  onChanged: () => Promise<void>;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [when, setWhen] = useState(localDateTime);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = (order.variants || []).map((v) => ({
    ...v,
    remaining: remainingOperation(v, "deliver"),
  }));
  const ready = rows.reduce((n, v) => n + v.remaining, 0);
  const ids =
    order.assignments
      ?.filter((a) => a.active === 1 && a.stage === "Giao hàng")
      .map((a) => a.employee_id) || [];
  const people = employees.filter(
    (e) =>
      e.active !== 0 &&
      e.department_ids?.includes("delivery") &&
      ids.includes(e.id),
  );
  const [page, setPage] = useState(1);
  const canWrite = permits(session.user, "delivery.manage", {
    stage: "Giao hàng",
  });
  return (
    <div className="stack">
      <p>
        Một đợt gồm nhiều màu–size. Có thể giao phần đã đóng gói trong khi phần
        còn lại tiếp tục sản xuất.
      </p>
      <ErrorNotice error={error} />
      {canWrite && (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              await api(
                `/api/orders/${encodeURIComponent(order.id)}/shipments`,
                {
                  version: order.version,
                  worker_id: f.get("worker"),
                  delivered_at: `${f.get("datetime")}:00+07:00`,
                  packages: Number(f.get("packages")),
                  notes: String(f.get("notes") || ""),
                  reason: String(f.get("reason") || "").trim() || undefined,
                  incident: f.get("incident") === "on",
                  items: rows
                    .filter((v) => (qty[keyFor(v)] || 0) > 0)
                    .map((v) => ({
                      color: v.color,
                      size: v.size,
                      quantity: qty[keyFor(v)],
                    })),
                },
              );
              setQty({});
              setWhen(localDateTime());
              await onChanged();
            } catch (err) {
              setError(message(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <Field label="Người giao">
              <select name="worker" required>
                <option value="">Chọn người đã phân công</option>
                {people.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ngày giờ giao thực tế (Việt Nam)">
              <div className="inline-actions">
                <input
                  name="datetime"
                  type="datetime-local"
                  required
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
                <Action
                  type="button"
                  tone="secondary"
                  onClick={() => setWhen(localDateTime())}
                >
                  Bây giờ
                </Action>
              </div>
            </Field>
            <Field label="Số kiện đợt này">
              <input
                name="packages"
                type="number"
                inputMode="numeric"
                min={0}
                max={1000000}
                step={1}
                defaultValue={0}
              />
            </Field>
          </div>
          {!people.length && (
            <p className="entry-guidance">
              Chưa có người giao: mở tab Phân công → Giao hàng.
            </p>
          )}
          <div className="panel-toolbar">
            <strong>
              Sẵn sàng giao: {ready.toLocaleString("vi-VN")} sản phẩm đã đóng
              gói
            </strong>
            <Action
              type="button"
              tone="secondary"
              disabled={!ready}
              onClick={() =>
                setQty(
                  Object.fromEntries(rows.map((v) => [keyFor(v), v.remaining])),
                )
              }
            >
              Giao hết phần đã đóng gói
            </Action>
            <Action type="button" tone="secondary" onClick={() => setQty({})}>
              Xóa số đã nhập
            </Action>
          </div>
          <QuantityGrid rows={rows} amounts={qty} onChange={setQty} />
          <label className="check-label">
            <input type="checkbox" name="incident" />
            Đợt giao có sự cố
          </label>
          <Field
            label="Nguyên nhân"
            hint={
              when.slice(0, 10) > order.deadline
                ? `Đợt này sau hạn giao ${order.deadline.split("-").reverse().join("/")}: bắt buộc ghi nguyên nhân.`
                : "Bắt buộc nếu giao sau hạn hoặc có sự cố."
            }
          >
            <textarea
              name="reason"
              maxLength={2000}
              required={when.slice(0, 10) > order.deadline}
            />
          </Field>
          <Field
            label="Đối soát / ghi chú"
            hint="Ví dụ mã vận đơn, người nhận, biển số xe."
          >
            <textarea name="notes" maxLength={2000} />
          </Field>
          <Action
            type="submit"
            busy={busy}
            disabled={
              !people.length || !rows.some((v) => (qty[keyFor(v)] || 0) > 0)
            }
          >
            <Truck size={18} />
            Lưu đợt giao
          </Action>
        </form>
      )}
      <h3>Lịch sử đợt giao ({order.shipments?.length || 0})</h3>
      {order.shipments?.slice((page - 1) * 10, page * 10).map((s) => (
        <details className="record-disclosure" key={s.id}>
          <summary>
            {s.code} · {formatDateTime(s.delivered_at)} ·{" "}
            {s.items.reduce((n, r) => n + r.quantity, 0)} sản phẩm
          </summary>
          <div className="padded stack">
            <p>
              Người giao: {s.worker_name} · Người ghi nhận: {s.actor_name} ·{" "}
              {s.packages} kiện
            </p>
            <p>Nguyên nhân: {s.reason || "—"}</p>
            <p>Đối soát: {s.notes || "—"}</p>
            {s.items.map((r) => (
              <p key={keyFor(r)}>
                {r.color} / {r.size}: <strong>{r.quantity}</strong>
              </p>
            ))}
          </div>
        </details>
      ))}
      {!order.shipments?.length && (
        <Empty>
          Chưa có đợt giao mới. Các lần giao trước chuyển đổi vẫn được giữ trong
          Lịch sử.
        </Empty>
      )}
      <Pagination
        page={page}
        total={order.shipments?.length || 0}
        pageSize={10}
        onChange={setPage}
      />
    </div>
  );
}
