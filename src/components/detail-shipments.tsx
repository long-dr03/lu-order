"use client";
import { useState } from "react";
import { Pencil, Trash2, Truck } from "lucide-react";
import { type Api, message } from "@/lib/client";
import { type SessionInfo, permits } from "@/lib/permissions";
import { type Employee } from "@/lib/types";
import { remainingOperation } from "@/lib/workflow";
import { Action, Field, ErrorNotice, Empty, Modal } from "./Primitives";
import { Pagination } from "./Pagination";
import {
  Detail,
  QuantityGrid,
  formatDateTime,
  keyFor,
  localDateTime,
  unrecordedDelivered,
  DeliveryTable,
  type Shipment,
} from "./order-detail-shared";
import { DateInput } from "./DateInput";

/** Vietnam-local "YYYY-MM-DDTHH:mm" for the date picker, from an ISO delivery time. */
const viDateTime = (value: string) => {
  const d = new Date(value);
  return `${new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)}T${new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d)}`;
};

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
  const [editing, setEditing] = useState<Shipment | null>(null);
  const isAdmin = session.user.roles?.some((r) => r.id === "admin") ?? false;
  // While editing a batch, its own pieces count as "đã đóng gói chưa giao" until the fix saves.
  const rows = (order.variants || []).map((v) => ({
    ...v,
    remaining:
      remainingOperation(v, "deliver") +
      (editing
        ? (editing.items.find(
            (i) => i.color === v.color && i.size === v.size,
          )?.quantity ?? 0)
        : 0),
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
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const canWrite = permits(session.user, "delivery.manage", {
    stage: "Giao hàng",
  });
  return (
    <div className="stack">
      <ErrorNotice error={error} />
      {canWrite && editing && (
        <div className="panel-toolbar">
          <strong>Đang sửa đợt giao {editing.code}</strong>
          <Action
            type="button"
            tone="secondary"
            onClick={() => {
              setEditing(null);
              setQty({});
              setWhen(localDateTime());
            }}
          >
            Hủy sửa
          </Action>
        </div>
      )}
      {canWrite && (
        <form
          className="stack"
          key={editing?.id || "new"}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              await api(
                editing
                  ? `/api/orders/${encodeURIComponent(order.id)}/shipments/${encodeURIComponent(editing.id)}`
                  : `/api/orders/${encodeURIComponent(order.id)}/shipments`,
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
                editing ? "PATCH" : undefined,
              );
              setQty({});
              setWhen(localDateTime());
              setEditing(null);
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
              <select
                name="worker"
                required
                defaultValue={editing?.worker_id || ""}
              >
                <option value="">Chọn người đã phân công</option>
                {people.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ngày giờ giao thực tế">
              <DateInput
                name="datetime"
                mode="datetime"
                required
                value={when}
                onChange={setWhen}
              />
            </Field>
            <Field label="Số kiện đợt này">
              <input
                name="packages"
                type="number"
                inputMode="numeric"
                min={0}
                max={1000000}
                step={1}
                defaultValue={editing?.packages ?? 0}
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
              defaultValue={editing?.reason || ""}
            />
          </Field>
          <Field
            label="Đối soát / ghi chú"
            hint="Ví dụ mã vận đơn, người nhận, biển số xe."
          >
            <textarea
              name="notes"
              maxLength={2000}
              defaultValue={editing?.notes || ""}
            />
          </Field>
          <Action
            type="submit"
            busy={busy}
            disabled={
              !people.length || !rows.some((v) => (qty[keyFor(v)] || 0) > 0)
            }
          >
            <Truck size={18} />
            {editing ? "Lưu thay đổi" : "Lưu đợt giao"}
          </Action>
        </form>
      )}
      <h3>Lịch sử đợt giao ({order.shipments?.length || 0})</h3>
      <DeliveryTable order={order} />
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
            {isAdmin && !s.id.startsWith("earlier-") && (
              <div className="panel-toolbar">
                <Action
                  type="button"
                  tone="secondary"
                  onClick={() => {
                    setEditing(s);
                    setQty(
                      Object.fromEntries(
                        s.items.map((r) => [keyFor(r), r.quantity]),
                      ),
                    );
                    setWhen(viDateTime(s.delivered_at));
                  }}
                >
                  <Pencil size={16} />
                  Sửa đợt giao
                </Action>
                <Action
                  type="button"
                  tone="secondary"
                  onClick={() => setRemoving(s.id)}
                >
                  <Trash2 size={16} />
                  Xóa đợt giao
                </Action>
              </div>
            )}
          </div>
        </details>
      ))}
      {!order.shipments?.length && !unrecordedDelivered(order) && (
        <Empty>Chưa có đợt giao.</Empty>
      )}
      <Pagination
        page={page}
        total={order.shipments?.length || 0}
        pageSize={10}
        onChange={setPage}
      />
      <Modal
        open={!!removing}
        onClose={() => {
          if (!removeBusy) setRemoving(null);
        }}
        title="Xóa đợt giao"
      >
        <div className="stack">
          <p>
            Đợt giao bị xóa hẳn; số sản phẩm của đợt này trở lại thành đã đóng
            gói chưa giao. Không khôi phục được.
          </p>
          <Action
            busy={removeBusy}
            tone="danger"
            onClick={async () => {
              if (!removing) return;
              setRemoveBusy(true);
              setError("");
              try {
                await api(
                  `/api/orders/${encodeURIComponent(order.id)}/shipments/${encodeURIComponent(removing)}`,
                  { version: order.version },
                  "DELETE",
                );
                setRemoving(null);
                await onChanged();
              } catch (err) {
                setError(message(err));
                setRemoving(null);
              } finally {
                setRemoveBusy(false);
              }
            }}
          >
            Xóa đợt giao
          </Action>
        </div>
      </Modal>
    </div>
  );
}
