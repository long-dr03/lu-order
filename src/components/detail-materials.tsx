"use client";
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { type Api, day, message } from "@/lib/client";
import { type SessionInfo, permits } from "@/lib/permissions";
import { Action, Field, ErrorNotice, Empty } from "./Primitives";
import { Detail, round2 } from "./order-detail-shared";

export const MATERIAL_UNITS = ["m", "kg", "cuộn", "cái", "bộ", "hộp"];

export const MOVEMENT_LABELS: Record<string, string> = {
  receive: "Nhận về",
  defect: "Lỗi",
  use: "Đã dùng",
  return: "Trả lại",
};

export function MaterialsPanel({
  order,
  session,
  api,
  onChanged,
}: {
  order: Detail;
  session: SessionInfo;
  api: Api;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const items = order.materials?.items || [];
  const canDefine = permits(session.user, "orders.edit", {
    stage: "nhan_don",
  });
  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/orders/${encodeURIComponent(order.id)}/materials`, body);
      await onChanged();
      return true;
    } catch (err) {
      setError(message(err));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <p>
        Kiểm NPL/Vải: khai báo vải và phụ liệu cần cho đơn, rồi ghi số nhận về,
        số lỗi, số đã dùng để biết thiếu vải hay lỗi vải khi đơn bị thiếu hàng.
      </p>
      <ErrorNotice error={error} />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {[
                "NPL / Vải",
                "Cần",
                "Nhận về",
                "Lỗi",
                "Đã dùng",
                "Trả lại",
                "Còn trong kho",
                "Còn thiếu so với cần",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((m) => {
              const good = m.received - m.returned - m.defect;
              return (
                <tr key={m.id}>
                  <td>
                    {m.name} ({m.unit})
                  </td>
                  <td>{m.required}</td>
                  <td>{m.received}</td>
                  <td>{m.defect}</td>
                  <td>{m.used}</td>
                  <td>{m.returned}</td>
                  <td>{round2(good - m.used)}</td>
                  <td>
                    {m.required > good ? (
                      <strong>{round2(m.required - good)}</strong>
                    ) : (
                      0
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!items.length && (
        <Empty>
          Chưa khai báo NPL/vải cho đơn này.
          {canDefine
            ? " Thêm bên dưới nếu đơn cần theo dõi."
            : " Báo bộ phận Quản lý khai báo."}
        </Empty>
      )}
      {canDefine && (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            if (
              await send({
                action: "add",
                name: String(f.get("name") || "").trim(),
                unit: f.get("unit"),
                required_qty: Number(f.get("required") || 0),
                notes: String(f.get("notes") || "").trim(),
              })
            )
              form.reset();
          }}
        >
          <h3>Khai báo NPL/vải</h3>
          <div className="form-grid">
            <Field label="Tên NPL / vải">
              <input name="name" required maxLength={80} />
            </Field>
            <Field label="Đơn vị">
              <select name="unit">
                {MATERIAL_UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Field>
            <Field label="Số lượng cần cho đơn">
              <input
                name="required"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                defaultValue={0}
              />
            </Field>
          </div>
          <Field label="Ghi chú">
            <textarea name="notes" maxLength={500} />
          </Field>
          <Action type="submit" busy={busy}>
            <Plus size={18} />
            Thêm NPL/vải
          </Action>
        </form>
      )}
      {!!items.length && (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            if (
              await send({
                action: "move",
                material_id: Number(f.get("material")),
                kind: f.get("kind"),
                quantity: Number(f.get("quantity")),
                movement_date: f.get("date"),
                ...(String(f.get("notes") || "").trim()
                  ? { notes: String(f.get("notes")).trim() }
                  : {}),
              })
            )
              form.reset();
          }}
        >
          <h3>Ghi nhận nhận về / lỗi / đã dùng</h3>
          <div className="form-grid">
            <Field label="NPL / vải">
              <select name="material" required>
                {items.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.unit})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nội dung">
              <select name="kind">
                {Object.entries(MOVEMENT_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Số lượng">
              <input
                name="quantity"
                type="number"
                min={0.01}
                step="0.01"
                inputMode="decimal"
                required
              />
            </Field>
            <Field label="Ngày">
              <input
                name="date"
                type="date"
                required
                max={day()}
                min={order.order_date}
                defaultValue={day()}
              />
            </Field>
          </div>
          <Field label="Ghi chú" hint="Ví dụ: cuộn vải số 3 bị loang màu.">
            <textarea name="notes" maxLength={500} />
          </Field>
          <Action type="submit" busy={busy}>
            <Check size={18} />
            Lưu ghi nhận
          </Action>
        </form>
      )}
      {!!order.materials?.movements.length && (
        <>
          <h3>Lịch sử NPL/vải</h3>
          {order.materials.movements.slice(0, 20).map((v) => (
            <p key={v.id}>
              <span className="muted">{v.movement_date}</span> ·{" "}
              {v.material_name} · {MOVEMENT_LABELS[v.kind]}{" "}
              <strong>
                {v.quantity} {v.unit}
              </strong>
              {v.notes ? ` — ${v.notes}` : ""} · {v.actor_name}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
