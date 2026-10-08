"use client";
import { MoneyInput, parseMoney } from "./SmartInputs";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { Order } from "@/lib/types";
import { type Api, type ViewLog, money, message } from "@/lib/client";
import type { Rate } from "@/lib/server/business";
import { Action, Field, ErrorNotice, Empty } from "./Primitives";
export { ProductionForm, OrderDetail } from "./DepartmentWorkspace";

export function RatesPanel({
  orders,
  rates,
  api,
  onSaved,
}: {
  orders: Order[];
  rates: Rate[];
  api: Api;
  onSaved: () => Promise<void>;
}) {
  const [id, setId] = useState(orders[0]?.id || "");
  const [stage, setStage] = useState("May");
  const [workId, setWorkId] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const stages = ["Cắt", "May", "QC", "Sửa hàng", "Đóng gói"];
  const selectedOrder = orders.find((o) => o.id === id);
  const parts = (selectedOrder?.work_items || []).filter(
    (p) => p.stage === stage,
  );
  const chosenPart = parts.find((p) => p.id === workId) || parts[0];
  const currentRate = rates.find(
    (r) =>
      r.order_id === id &&
      r.stage === stage &&
      (chosenPart ? r.work_item_id === chosenPart.id : !r.work_item_id),
  );
  // Earlier orders that already carry prices; the same product is suggested first.
  const sources = orders
    .filter((o) => o.id !== id && rates.some((r) => r.order_id === o.id))
    .sort(
      (a, b) =>
        Number(
          !!selectedOrder &&
            (b.product_code === selectedOrder.product_code ||
              b.product_name === selectedOrder.product_name),
        ) -
          Number(
            !!selectedOrder &&
              (a.product_code === selectedOrder.product_code ||
                a.product_name === selectedOrder.product_name),
          ) || (b.order_date || "").localeCompare(a.order_date || ""),
    );
  const [sourceValue, setSource] = useState("");
  const source = sources.some((o) => o.id === sourceValue)
    ? sourceValue
    : sources[0]?.id || "";
  async function copyFrom() {
    if (!selectedOrder || !source) return;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const result = await api<{ copied: string[]; skipped: string[] }>(
        "/api/rates",
        { order_id: id, copy_from: source, version: selectedOrder.version },
      );
      await onSaved();
      setSaved(
        `Đã sao chép đơn giá từ ${source} sang ${id}: ${result.copied.join(", ")}.${result.skipped.length ? ` Bỏ qua: ${result.skipped.join("; ")}.` : ""}`,
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const visibleRates = rates.flatMap((rate) => {
    const order = orders.find((o) => o.id === rate.order_id);
    return order &&
      (rate.work_item_id ||
        !(order.work_items || []).some((p) => p.stage === rate.stage))
      ? [{ ...rate, order }]
      : [];
  });
  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await api("/api/rates", {
        order_id: id,
        stage,
        ...(chosenPart ? { work_item_id: chosenPart.id } : {}),
        unit_price: parseMoney(String(form.get("price"))),
      });
      await onSaved();
      setSaved(
        `Đã lưu ${id} · ${stage}${chosenPart ? ` · ${chosenPart.name}` : ""}: ${money(parseMoney(String(form.get("price"))))} / sản phẩm.`,
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack rates-workspace">
      <section className="panel padded">
        <h2>Đơn giá công đoạn</h2>
        <p className="muted">
          Áp dụng cho lần ghi nhận tiếp theo; tiền công đã lưu giữ nguyên.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(new FormData(event.currentTarget));
          }}
          className="stack"
        >
          <ErrorNotice error={error} />
          <div className="form-grid">
            <Field label="Đơn hàng">
              <select value={id} onChange={(e) => setId(e.target.value)}>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id} · {o.product_name}
                  </option>
                ))}
              </select>
            </Field>
            {!!sources.length && (
              <Field
                label="Sao chép từ đơn trước"
                hint="Chép giá mọi công đoạn và phần việc Cắt/May; công đoạn đã có phân công hoặc sản lượng được giữ nguyên."
              >
                <div className="inline-actions">
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    {sources.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.id} · {o.product_name}
                      </option>
                    ))}
                  </select>
                  <Action
                    type="button"
                    tone="secondary"
                    busy={busy}
                    disabled={!id}
                    onClick={() => void copyFrom()}
                  >
                    Sao chép
                  </Action>
                </div>
              </Field>
            )}
            <Field label="Công đoạn">
              <select value={stage} onChange={(e) => setStage(e.target.value)}>
                {stages.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            {!!parts.length && (
              <Field label="Phần việc">
                <select
                  value={chosenPart?.id || ""}
                  onChange={(e) => setWorkId(Number(e.target.value))}
                >
                  {parts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Đơn giá (đ / sản phẩm)">
              <MoneyInput
                key={`${id}-${stage}-${chosenPart?.id}-${currentRate?.unit_price}`}
                name="price"
                defaultValue={currentRate?.unit_price || 0}
                required
              />
            </Field>
          </div>
          <p className="muted">
            Giá đang áp dụng:{" "}
            <strong>
              {currentRate
                ? `${money(currentRate.unit_price)} / sản phẩm`
                : "Chưa cấu hình cho công đoạn này"}
            </strong>
          </p>
          {saved && (
            <p role="status" className="rate-save-notice">
              {saved}
            </p>
          )}
          <Action type="submit" busy={busy} disabled={!id}>
            Lưu đơn giá
          </Action>
        </form>
        {selectedOrder && ["Cắt", "May"].includes(stage) && (
          <WorkPlanForm
            key={`${id}-${stage}`}
            order={selectedOrder}
            stage={stage}
            rates={rates}
            api={api}
            onSaved={onSaved}
          />
        )}
        {!!parts.length && (
          <div className="stack padded">
            {parts.map((p) => (
              <div className="card-top" key={p.id}>
                <strong>{p.name}</strong>
                <span>
                  {money(
                    rates.find((r) => r.work_item_id === p.id)?.unit_price || 0,
                  )}{" "}
                  / sản phẩm
                </span>
              </div>
            ))}
          </div>
        )}
        {selectedOrder && (
          <div className="rate-preview">
            <h3>
              Đơn giá của {selectedOrder.id} · {selectedOrder.product_name}
            </h3>
            <div className="rate-stage-grid">
              {stages.map((step) => {
                const rate = rates.find(
                  (r) => r.order_id === id && r.stage === step,
                );
                return (
                  <button
                    type="button"
                    key={step}
                    className="rate-stage-card"
                    aria-pressed={stage === step}
                    onClick={() => {
                      setStage(step);
                      setSaved("");
                    }}
                  >
                    <span>{step}</span>
                    <strong>
                      {(selectedOrder.work_items || []).some(
                        (p) => p.stage === step,
                      )
                        ? "Theo phần việc"
                        : rate
                          ? money(rate.unit_price)
                          : "Chưa đặt giá"}
                    </strong>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-toolbar">
          <h2>Đơn giá đã lưu</h2>
          <span className="muted">{visibleRates.length} mức giá</span>
        </div>
        <div className="table-scroll">
          <table className="mobile-stack-table">
            <thead>
              <tr>
                <th>Đơn hàng / sản phẩm</th>
                <th>Công đoạn</th>
                <th>Đơn giá (đ / sản phẩm)</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {visibleRates.map((rate) => (
                <tr
                  key={`${rate.order_id}-${rate.stage}-${rate.work_item_id || "whole"}`}
                >
                  <td data-label="Đơn / sản phẩm">
                    <div className="mobile-cell-value">
                      <strong>{rate.order_id}</strong>
                      <span className="table-subtitle">
                        {rate.order.product_name}
                      </span>
                    </div>
                  </td>
                  <td data-label="Công đoạn">
                    <div className="mobile-cell-value">
                      {rate.stage}
                      {rate.work_item_name && (
                        <span className="table-subtitle">
                          {rate.work_item_name}
                        </span>
                      )}
                    </div>
                  </td>
                  <td data-label="Đơn giá / sản phẩm" className="rate-price">
                    {money(rate.unit_price)}
                  </td>
                  <td data-label="Thao tác">
                    <button
                      type="button"
                      className="action secondary"
                      aria-label={`Chỉnh giá ${rate.order_id} ${rate.stage}`}
                      onClick={() => {
                        setId(rate.order_id);
                        setStage(rate.stage);
                        setWorkId(rate.work_item_id || 0);
                        setSaved("");
                      }}
                    >
                      Chỉnh giá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visibleRates.length && (
          <Empty>
            Chưa có đơn giá được lưu. Chọn đơn hàng và công đoạn để đặt giá.
          </Empty>
        )}
      </section>
    </div>
  );
}
export function ProductionHistory({
  logs,
  hideEmployee = false,
}: {
  logs: ViewLog[];
  hideEmployee?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table className="mobile-stack-table">
        <thead>
          <tr>
            <th>Ngày</th>
            {!hideEmployee && <th>Nhân viên</th>}
            <th>Đơn / màu / size</th>
            <th>Công đoạn</th>
            <th>Số lượng</th>
            <th>Tiền công</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td data-label="Ngày">{l.log_date}</td>
              {!hideEmployee && (
                <td data-label="Nhân viên">{l.employee_name}</td>
              )}
              <td data-label="Đơn / màu / size">
                <div className="mobile-cell-value">
                  {l.order_id}
                  <span className="table-subtitle">
                    {l.color} / {l.size}
                  </span>
                </div>
              </td>
              <td data-label="Công đoạn">
                <div className="mobile-cell-value">
                  {l.stage}
                  {l.work_item_name && (
                    <span className="table-subtitle">{l.work_item_name}</span>
                  )}
                </div>
              </td>
              <td data-label="Số lượng">
                {l.quantity.toLocaleString("vi-VN")}
              </td>
              <td data-label="Tiền công">
                {l.total_pay === null
                  ? "Không có quyền xem"
                  : money(l.total_pay)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!logs.length && <Empty>Chưa có dữ liệu theo bộ lọc.</Empty>}
    </div>
  );
}

function WorkPlanForm({
  order,
  stage,
  rates,
  api,
  onSaved,
}: {
  order: Order;
  stage: string;
  rates: Rate[];
  api: Api;
  onSaved: () => Promise<void>;
}) {
  const existing = (order.work_items || []).filter((p) => p.stage === stage);
  const [rows, setRows] = useState(
    existing.length
      ? existing.map((p) => ({
          key: String(p.id),
          name: p.name,
          unit_price:
            rates.find((r) => r.work_item_id === p.id)?.unit_price || 0,
        }))
      : [
          { key: "initial-1", name: "", unit_price: 0 },
          { key: "initial-2", name: "", unit_price: 0 },
        ],
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/rates", {
        order_id: order.id,
        stage,
        version: order.version,
        work_items: rows.map(({ name, unit_price }) => ({ name, unit_price })),
      });
      await onSaved();
      setNotice(
        "Đã lưu phần việc. Người quản lý có thể phân công thợ và ghi nhận từng phần việc.",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="record-disclosure">
      <summary>Chia {stage} thành các phần việc cho nhiều người</summary>
      <form
        className="stack padded"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="muted">
          Mỗi sản phẩm cần đủ tất cả phần việc dưới đây. Nhiều người có thể chia
          nhau cùng một phần việc; tổng số lượng mỗi phần không vượt đầu vào.
          Cấu hình trước khi có sản lượng công đoạn; sau đó chỉ sửa đơn giá ở
          form phía trên.
        </p>
        {rows.map((row, i) => (
          <div className="form-grid work-plan-row" key={row.key}>
            <Field label={`Phần việc ${i + 1}`}>
              <input
                required
                maxLength={80}
                placeholder="Ví dụ: May thân, may tay, ráp áo"
                value={row.name}
                onChange={(e) =>
                  setRows(
                    rows.map((r, n) =>
                      n === i ? { ...r, name: e.target.value } : r,
                    ),
                  )
                }
              />
            </Field>
            <Field label="Đơn giá phần việc / sản phẩm">
              <MoneyInput
                defaultValue={row.unit_price}
                onValueChange={(value) =>
                  setRows(
                    rows.map((r, n) =>
                      n === i ? { ...r, unit_price: value } : r,
                    ),
                  )
                }
              />
            </Field>
            <Action
              type="button"
              tone="secondary"
              disabled={rows.length === 1}
              onClick={() => setRows(rows.filter((_, n) => n !== i))}
            >
              <X size={18} />
              Bỏ phần việc
            </Action>
          </div>
        ))}
        <Action
          type="button"
          tone="secondary"
          disabled={rows.length >= 30}
          onClick={() =>
            setRows([
              ...rows,
              { key: crypto.randomUUID(), name: "", unit_price: 0 },
            ])
          }
        >
          <Plus size={18} />
          Thêm phần việc
        </Action>
        <ErrorNotice error={error} />
        {notice && <p role="status">{notice}</p>}
        <Action type="submit" busy={busy}>
          Lưu danh sách phần việc
        </Action>
      </form>
    </details>
  );
}
