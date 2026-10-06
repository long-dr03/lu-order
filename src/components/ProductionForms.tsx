"use client";
import {
  ProductPhoto,
  ProductImagePicker,
  uploadProductImage,
} from "./ProductImage";
import { StageEditor } from "./RequirementPanels";
import { MoneyInput, parseMoney } from "./SmartInputs";
import { useState } from "react";
import { Check, Save, Plus, X } from "lucide-react";
import {
  LUUTA_STAGES,
  type Order,
  type Employee,
  type Line,
} from "@/lib/types";
import type { SessionInfo } from "@/lib/permissions";
import { permits, hasPermission, canRecordProduction } from "@/lib/permissions";
import { type Api, type ViewLog, money, message, day } from "@/lib/client";
import { type Variant, type Rate } from "@/lib/server/business";
import {
  transitionProblem,
  transitionPermissionProblem,
  availableOperations,
  remainingOperation,
} from "@/lib/workflow";
import { Action, Field, ErrorNotice, Empty } from "./Primitives";
import { Status } from "./OrderWorkspace";
export function ProductionForm({
  initialOrderId,
  api,
  orders,
  employees,
  rates,
  session,
  onSaved,
}: {
  api: Api;
  initialOrderId?: string;
  orders: Order[];
  employees: Employee[];
  rates: Rate[];
  session: SessionInfo;
  onSaved: (notice?: string) => Promise<void>;
}) {
  const firstOrder =
    orders.find((o) => o.id === initialOrderId) ||
    orders.find(
      (o) =>
        o.status !== "completed" &&
        employees.some((e) => canRecordProduction(session.user, e, o)),
    );
  const stageFor = (order?: Order) =>
    ({
      nhan_don: "Cắt",
      kiem_npl: "Cắt",
      kiem_rap: "Cắt",
      hoan_thanh: "Đóng gói",
      cat: "Cắt",
      may: "May",
      qc: "QC",
      qc_lai: "QC",
      sua_hang: "Sửa hàng",
      dong_goi: "Đóng gói",
      giao_hang: "Đóng gói",
    })[order?.current_stage || "may"] || "May";
  const [id, setId] = useState(firstOrder?.id || "");
  const [workId, setWorkId] = useState(0);
  const [variantIndex, setVariantIndex] = useState(0);
  const [stage, setStage] = useState(stageFor(firstOrder));
  const [emp, setEmp] = useState(
    session.user.employee_id || employees[0]?.id || "",
  );
  const [qty, setQty] = useState(1);
  const [packingWagesOnly, setPackingWagesOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const order = orders.find((o) => o.id === id);
  const variants = order?.variants || [];
  const variant = variants[variantIndex];
  const packingBlocked =
    stage === "Đóng gói" &&
    !!variant &&
    (packingWagesOnly
      ? qty > variant.packed_qty
      : order?.current_stage !== "dong_goi" ||
        qty > variant.qc_passed_qty - variant.packed_qty);
  const workItems = (order?.work_items || []).filter((p) => p.stage === stage);
  const selectedWork = workItems.find((p) => p.id === workId) || workItems[0];
  const rate = rates.find(
    (r) =>
      r.order_id === id &&
      r.stage === stage &&
      (selectedWork ? r.work_item_id === selectedWork.id : !r.work_item_id),
  );
  const allowedEmployees = employees.filter(
    (e) => !!order && canRecordProduction(session.user, e, order),
  );
  const selectedEmp = allowedEmployees.some((e) => e.id === emp)
    ? emp
    : allowedEmployees[0]?.id || "";
  const canSeeRates =
    hasPermission(session.user, "payroll.view") ||
    hasPermission(session.user, "rates.manage");
  const entryProblem = !selectedEmp
    ? "Chưa có nhân viên hợp lệ trong chuyền của đơn. Nhờ quản lý kiểm tra chuyền được giao."
    : !variant
      ? "Chọn màu và size cần ghi nhận."
      : order?.status === "completed"
        ? "Đơn đã hoàn thành, không thể ghi nhận thêm."
        : ["Cắt", "May"].includes(stage) &&
            order?.current_stage !== (stage === "Cắt" ? "cat" : "may")
          ? `Đơn chưa ở bước ${stage}. Quản lý cần chuyển đơn đến đúng bước trước.`
          : canSeeRates && !rate
            ? "Chưa có đơn giá cho công đoạn này. Nhờ quản lý mở Đơn giá, chọn đơn và công đoạn để cấu hình."
            : !Number.isInteger(qty) || qty <= 0
              ? "Nhập số lượng nguyên lớn hơn 0."
              : packingBlocked
                ? !packingWagesOnly && order?.current_stage !== "dong_goi"
                  ? "Quản lý cần chuyển đơn đến Đóng gói trước."
                  : "Số đóng gói vượt số lượng có thể ghi nhận."
                : null;
  async function submit(form: FormData) {
    if (!order || !variant || !selectedEmp || entryProblem || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ pay_status?: string; message?: string }>(
        "/api/production/log",
        {
          log_date: form.get("date"),
          employee_id: selectedEmp,
          order_id: id,
          color: variant.color,
          size: variant.size,
          stage,
          ...(stage === "Đóng gói"
            ? { record_packing: !packingWagesOnly }
            : {}),
          ...(selectedWork ? { work_item_id: selectedWork.id } : {}),
          quantity: qty,
          version: order.version,
        },
      );
      await onSaved(
        result.pay_status === "pending" ? result.message : undefined,
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (!orders.length || !employees.length)
    return (
      <Empty>
        Chưa có đơn hàng hoặc nhân viên trong phạm vi nhập sản lượng.
      </Empty>
    );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit(new FormData(event.currentTarget));
      }}
      className="stack"
    >
      <ErrorNotice error={error} />
      {!selectedEmp && (
        <ErrorNotice
          error={`Không thể ghi nhận đơn thuộc Chuyền ${order?.line_id}: chưa có quyền ghi nhận cho nhân viên tại chuyền này. Chọn đơn thuộc các chuyền được giao hoặc liên hệ quản lý kiểm tra quyền.`}
        />
      )}
      <div className="form-grid">
        <Field label="Ngày làm việc">
          <input
            type="date"
            name="date"
            defaultValue={day()}
            max={day()}
            required
          />
        </Field>
        <Field label="Đơn hàng">
          <select
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setPackingWagesOnly(false);
              setStage(stageFor(orders.find((o) => o.id === e.target.value)));
              setWorkId(0);
              setVariantIndex(0);
            }}
          >
            {orders
              .filter((o) => o.status !== "completed")
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id} · {o.product_name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Nhân viên">
          <select
            value={selectedEmp}
            onChange={(e) => setEmp(e.target.value)}
            required
          >
            {!allowedEmployees.length && (
              <option value="">Không có nhân viên phù hợp</option>
            )}
            {allowedEmployees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Công đoạn">
          <select
            value={stage}
            onChange={(e) => {
              setStage(e.target.value);
              setPackingWagesOnly(false);
            }}
          >
            {["Cắt", "May", "QC", "Sửa hàng", "Đóng gói"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        {!!workItems.length && (
          <Field label="Phần việc tôi đã làm">
            <select
              value={selectedWork?.id || ""}
              onChange={(e) => setWorkId(Number(e.target.value))}
            >
              {workItems.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Màu / size">
          <select
            value={variantIndex}
            onChange={(e) => {
              setVariantIndex(Number(e.target.value));
              setPackingWagesOnly(false);
            }}
          >
            {variants.map((v, i) => (
              <option key={v.id} value={i}>
                {v.color} / {v.size}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Số lượng">
          <input
            type="number"
            min={1}
            max={1000000}
            required
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />
        </Field>
      </div>
      {hasPermission(session.user, "payroll.view") && (
        <div className="amount-preview">
          <span>Đơn giá {rate ? money(rate.unit_price) : "chưa cấu hình"}</span>
          <strong>
            {rate ? money(qty * rate.unit_price) : "Liên hệ quản lý"}
          </strong>
        </div>
      )}
      {stage === "Đóng gói" && variant && (
        <div role="status" className="padded">
          <strong>
            QC đạt: {variant.qc_passed_qty} · Đã đóng gói: {variant.packed_qty}{" "}
            · Còn có thể đóng gói:{" "}
            {Math.max(0, variant.qc_passed_qty - variant.packed_qty)}
          </strong>
          <p>
            Một lần lưu xác nhận số bạn đã đóng gói và ghi tiền công cho bạn.
            Quản lý chuyển bước khi đã đủ số lượng. Nếu tháng lương đã khóa, số
            đóng gói vẫn được lưu; công chuyển sang chờ quản lý đối chiếu, chưa
            cộng vào lương.
          </p>
          {variant.packed_qty > 0 && (
            <label>
              <input
                type="checkbox"
                checked={packingWagesOnly}
                onChange={(e) => setPackingWagesOnly(e.target.checked)}
              />{" "}
              Chỉ bổ sung tiền công cho số đã được xác nhận đóng gói trước đó
            </label>
          )}
          {packingBlocked && (
            <p className="error-text">
              {!packingWagesOnly && order?.current_stage !== "dong_goi"
                ? "Quản lý cần chuyển đơn đến Đóng gói trước."
                : "Số lượng nhập vượt số có thể ghi nhận."}
            </p>
          )}
        </div>
      )}
      <p className="muted">
        {workItems.length > 0 &&
          "Mỗi người ghi phần việc mình làm; sản phẩm chỉ hoàn thành công đoạn khi đủ tất cả phần việc. "}
        Đơn giá do quản lý cấu hình. QC và sửa hàng cần được ghi nhận xử lý
        trước khi tính công.
      </p>
      {entryProblem && (
        <p role="status" className="error-text">
          {entryProblem}
        </p>
      )}
      <Action type="submit" busy={busy} disabled={!!entryProblem}>
        <Check size={18} />
        {stage === "Đóng gói" && !packingWagesOnly
          ? "Xác nhận đóng gói và ghi công"
          : "Ghi nhận sản lượng"}
      </Action>
    </form>
  );
}
export function OrderDetail({
  order,
  session,
  api,
  lines,
  employees,
  onChanged,
}: {
  order: Order;
  session: SessionInfo;
  api: Api;
  lines: Line[];
  employees: Employee[];
  onChanged: () => Promise<void>;
}) {
  const [defectFile, setDefectFile] = useState<File | null>(null);
  const [defectUrl, setDefectUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(order.image_url);
  async function saveDetails(form: FormData) {
    setBusy(true);
    setError("");
    try {
      let url = imageUrl;
      if (imageFile && !url) {
        url = await uploadProductImage(imageFile, session, order.line_id);
        setImageUrl(url);
      }
      await save(
        `/api/orders/${order.id}`,
        {
          version: order.version,
          ...(permits(session.user, "orders.edit", { lineId: order.line_id })
            ? {
                responsible_id:
                  String(form.get("responsible_id") || "") || null,
                product_code: form.get("product_code"),
                customer: form.get("customer"),
                deadline: form.get("deadline"),
                notes: form.get("notes"),
                image_url: url,
              }
            : {}),
          ...(permits(session.user, "orders.assign", { lineId: order.line_id })
            ? { line_id: Number(form.get("line_id")) }
            : {}),
        },
        "PATCH",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const available = availableOperations(session.user, order);
  const [tab, setTab] = useState<
    "variants" | "workflow" | "edit" | "operation"
  >(available.length ? "operation" : "variants");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState("qc");
  const [variantIndex, setVariantIndex] = useState(() =>
    Math.max(
      0,
      (order.variants || []).findIndex(
        (v) => remainingOperation(v, available[0]?.key) > 0,
      ),
    ),
  );
  const [qty, setQty] = useState(1);
  const [passed, setPassed] = useState(1);
  const variants = order.variants as Variant[];
  async function save(path: string, input: unknown, method = "POST") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(path, input, method);
      await onChanged();
      setNotice("Đã lưu kết quả xử lý.");
    } catch (e) {
      setError(message(e));
      await onChanged();
    } finally {
      setBusy(false);
    }
  }
  const chosen = available.some((a) => a.key === action)
    ? action
    : available[0]?.key;
  const variant = variants[variantIndex];
  const remaining = remainingOperation(variant, chosen);
  const selfDelivery =
    chosen === "deliver" &&
    !permits(session.user, "delivery.manage", { lineId: order.line_id });
  return (
    <div className="stack">
      <div className="detail-product">
        <ProductPhoto url={order.image_url} name={order.product_name} large />
        <div className="detail-summary">
          <div>
            <strong>{order.customer}</strong>
            <p>
              {order.product_name} · {order.product_code}
            </p>
            <p className="muted">
              Ngày nhận: {order.order_date} · Phụ trách: {order.assigned_to}
            </p>
            <p className="muted">
              {LUUTA_STAGES.find((s) => s.key === order.current_stage)?.label} ·
              Tổ {order.line_id} · {order.total_quantity} sản phẩm · Hạn{" "}
              {order.deadline}
            </p>
          </div>
          <Status order={order} />
          {order.delivered_complete && (
            <span className="status on_track">Đã giao đủ</span>
          )}
        </div>
      </div>
      {!!order.work_items?.length && (
        <details className="record-disclosure">
          <summary>Tiến độ phần việc của nhiều người</summary>
          <ul className="work-progress-list padded">
            {order.work_items.map((p) => (
              <li key={p.id}>
                <span>
                  {p.stage} · {p.name}
                </span>
                <strong>
                  {p.recorded_quantity || 0}/{order.total_quantity}
                </strong>
              </li>
            ))}
          </ul>
          <p className="muted padded">
            Mỗi phần việc có số lượng riêng; sản phẩm hoàn thành khi đủ mọi phần
            của công đoạn.
          </p>
        </details>
      )}
      <div className="segmented">
        {!!available.length && (
          <button
            aria-pressed={tab === "operation"}
            onClick={() => setTab("operation")}
          >
            {available[0].label}
          </button>
        )}
        <button
          aria-pressed={tab === "variants"}
          onClick={() => setTab("variants")}
        >
          Màu và size
        </button>
        <button
          aria-pressed={tab === "workflow"}
          onClick={() => setTab("workflow")}
        >
          Công đoạn
        </button>
        {(hasPermission(session.user, "orders.edit") ||
          hasPermission(session.user, "orders.assign")) && (
          <button aria-pressed={tab === "edit"} onClick={() => setTab("edit")}>
            Chỉnh sửa
          </button>
        )}
      </div>
      <ErrorNotice error={error} />
      {notice && (
        <p role="status" className="rate-save-notice">
          {notice}
        </p>
      )}
      {tab === "operation" && available.length > 0 && (
        <form
          className="stack operation-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            if (!variant || busy || remaining <= 0 || qty > remaining) return;
            setBusy(true);
            try {
              let url = defectUrl;
              if (defectFile && !url && ["qc", "reinspect"].includes(chosen)) {
                url = await uploadProductImage(
                  defectFile,
                  session,
                  order.line_id,
                );
                setDefectUrl(url);
              }
              await save(`/api/orders/${order.id}/operations`, {
                version: order.version,
                color: variant.color,
                size: variant.size,
                action: chosen,
                quantity: qty,
                image_url: ["qc", "reinspect"].includes(chosen)
                  ? url
                  : undefined,
                operation_date: form.get("operation_date"),
                ...(!["qc", "reinspect"].includes(chosen) && !selfDelivery
                  ? {
                      worker_id:
                        String(form.get("worker_id") || "") || undefined,
                    }
                  : {}),
                packages: Number(form.get("packages") || 0),
                notes: String(form.get("operation_notes") || ""),
                ...(["qc", "reinspect"].includes(chosen)
                  ? {
                      passed,
                      defect_type: String(form.get("defect_type") || ""),
                    }
                  : {}),
              });
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>
            {available.find((a) => a.key === chosen)?.label} theo màu / size
          </h3>
          <div className="record-totals">
            <span>
              Còn chờ xử lý: <strong>{remaining}</strong>
            </span>
            {["qc", "reinspect"].includes(chosen) && (
              <span>
                Số lỗi: <strong>{Math.max(0, qty - passed)}</strong>
              </span>
            )}
          </div>
          {remaining === 0 && (
            <p role="status" className="muted">
              Màu–size này đã xử lý đủ hoặc chưa có đầu vào. Chọn màu–size khác;
              khi đã xong, mở Công đoạn để chuyển bước phù hợp.
            </p>
          )}
          <div className="form-grid">
            <Field label="Ngày xử lý">
              <input
                name="operation_date"
                type="date"
                defaultValue={day()}
                min={order.order_date}
                max={day()}
                required
              />
            </Field>
            {["qc", "reinspect"].includes(chosen) || selfDelivery ? (
              <div className="field">
                <span>
                  {selfDelivery ? "Người giao hàng" : "Người kiểm QC"}
                </span>
                <strong>{session.user.name}</strong>
                <span className="muted">
                  Tự ghi nhận theo tài khoản đang thao tác.
                </span>
              </div>
            ) : (
              <Field label="Người thực hiện">
                <select name="worker_id">
                  <option value="">Tài khoản đang thao tác</option>
                  {employees
                    .filter((e) => e.line_id === order.line_id)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            {chosen === "pack" && (
              <Field label="Số kiện">
                <input
                  name="packages"
                  type="number"
                  min={1}
                  max={1000000}
                  defaultValue={1}
                  required
                />
              </Field>
            )}
            <Field label="Thao tác">
              <select
                value={chosen}
                onChange={(e) => setAction(e.target.value)}
              >
                {available.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Màu / size">
              <select
                value={variantIndex}
                onChange={(e) => {
                  setVariantIndex(Number(e.target.value));
                  setQty(1);
                  setPassed(1);
                  setNotice("");
                }}
              >
                {variants.map((v, i) => (
                  <option key={v.id} value={i}>
                    {v.color} / {v.size}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Số lượng xử lý">
              <input
                type="number"
                min={1}
                max={Math.max(1, remaining)}
                value={qty}
                required
                onChange={(e) => {
                  const q = Number(e.target.value);
                  setQty(q);
                  setPassed(Math.min(passed, q));
                }}
              />
            </Field>
            {["qc", "reinspect"].includes(chosen) && (
              <Field label="Số đạt">
                <input
                  type="number"
                  min={0}
                  max={qty}
                  value={passed}
                  required
                  onChange={(e) => setPassed(Number(e.target.value))}
                />
              </Field>
            )}
          </div>
          {["qc", "reinspect"].includes(chosen) && (
            <Field label="Mô tả lỗi">
              <input name="defect_type" maxLength={500} />
            </Field>
          )}
          {["qc", "reinspect"].includes(chosen) && (
            <div>
              <h3>Ảnh lỗi (nếu có)</h3>
              <ProductImagePicker
                existing={defectUrl}
                file={defectFile}
                onFile={(f) => {
                  setDefectFile(f);
                  setDefectUrl(null);
                }}
                onRemove={() => {
                  setDefectFile(null);
                  setDefectUrl(null);
                }}
              />
            </div>
          )}
          <Field label="Ghi chú xử lý">
            <textarea name="operation_notes" maxLength={2000} />
          </Field>
          <Action
            type="submit"
            busy={busy}
            disabled={!variant || remaining <= 0 || qty > remaining}
          >
            {["qc", "reinspect"].includes(chosen)
              ? "Lưu kết quả QC"
              : "Lưu xử lý"}
          </Action>
        </form>
      )}

      {tab === "operation" && !available.length && (
        <Empty>Đơn đã chuyển bước. Mở Công đoạn để xem tiến độ.</Empty>
      )}
      {tab === "variants" && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Màu</th>
                  <th>Size</th>
                  <th>Yêu cầu</th>
                  <th>Cắt</th>
                  <th>May</th>
                  <th>QC đạt</th>
                  <th>Đóng gói</th>
                  <th>Đã giao</th>
                  <th>Thiếu</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.id}>
                    <td>
                      {(v.colors?.length
                        ? v.colors
                        : v.color_hex
                          ? [{ name: v.color, hex: v.color_hex }]
                          : []
                      ).map((c, i) => (
                        <span
                          key={i}
                          className="color-dot"
                          title={c.name}
                          style={{
                            backgroundColor: c.hex,
                            opacity: c.alpha === undefined ? 1 : c.alpha / 100,
                          }}
                        />
                      ))}{" "}
                      {v.color}
                    </td>
                    <td>{v.size}</td>
                    <td>{v.quantity}</td>
                    <td>{v.cut_qty}</td>
                    <td>{v.sewn_qty}</td>
                    <td>{v.qc_passed_qty}</td>
                    <td>{v.packed_qty}</td>
                    <td>{v.delivered_qty}</td>
                    <td>{v.quantity - v.delivered_qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {order.notes && <p className="muted">{order.notes}</p>}
          <p className="muted">{order.risk_reason}</p>
          <h3>Lịch sử xử lý / đóng gói / giao hàng</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Thao tác</th>
                  <th>Màu / size</th>
                  <th>Số lượng</th>
                  <th>Số kiện</th>
                  <th>Người thực hiện</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {order.operations?.map((r) => (
                  <tr key={r.id}>
                    <td>{r.operation_date}</td>
                    <td>
                      {{
                        qc: "QC",
                        rework: "Sửa hàng",
                        reinspect: "QC lại",
                        pack: "Đóng gói",
                        deliver: "Giao hàng",
                      }[r.action] || r.action}
                    </td>
                    <td>
                      {r.color}/{r.size}
                    </td>
                    <td>{r.quantity}</td>
                    <td>{r.packages || "—"}</td>
                    <td>{r.worker_name}</td>
                    <td>
                      {r.notes}
                      {r.image_url && (
                        <ProductPhoto url={r.image_url} name="Ảnh lỗi QC" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === "workflow" && (
        <>
          <ol className="timeline">
            {LUUTA_STAGES.map((s) => {
              const current = order.current_stage === s.key;
              const info = order.stages?.find((x) => x.stage_key === s.key);
              const done = info?.status === "completed";
              const reason = transitionProblem(order, s.key);
              const allowed =
                !reason && !transitionPermissionProblem(session.user, order);
              return (
                <li
                  key={s.key}
                  className={current ? "current" : done ? "done" : ""}
                >
                  <span>{done ? <Check size={16} /> : s.step}</span>
                  <div>
                    <strong>{s.label}</strong>
                    <small>
                      {
                        {
                          pending: "Chưa bắt đầu",
                          in_progress: "Đang thực hiện",
                          completed: "Hoàn thành",
                          has_issue: "Có vấn đề",
                        }[info?.status || "pending"]
                      }
                    </small>
                    {info && (
                      <small>
                        {info.assignee || "Chưa nhận việc"} · Nhận{" "}
                        {info.received_qty} · Hoàn thành {info.completed_qty} ·
                        Còn {info.remaining_qty}
                      </small>
                    )}
                    {info?.received_at && (
                      <small>Nhận lúc: {info.received_at}</small>
                    )}
                    {info?.started_at && (
                      <small>Bắt đầu: {info.started_at}</small>
                    )}
                    {info?.completed_at && (
                      <small>Hoàn thành: {info.completed_at}</small>
                    )}
                    {info?.notes && <small>{info.notes}</small>}
                  </div>
                  {allowed && (
                    <Action
                      tone="secondary"
                      busy={busy}
                      onClick={() =>
                        save(
                          `/api/orders/${order.id}`,
                          { version: order.version, stage: s.key },
                          "PATCH",
                        )
                      }
                    >
                      Chuyển đến
                    </Action>
                  )}
                </li>
              );
            })}
          </ol>
          {!transitionPermissionProblem(session.user, order) && (
            <StageEditor
              order={order}
              employees={employees}
              api={api}
              onChanged={onChanged}
            />
          )}
          <p className="muted">
            Chỉ chuyển công đoạn khi đã đủ điều kiện. QC đạt và giao đủ được
            kiểm tra theo từng màu–size.
          </p>
        </>
      )}
      {tab === "edit" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveDetails(new FormData(event.currentTarget));
          }}
          className="stack"
        >
          {permits(session.user, "orders.edit", { lineId: order.line_id }) && (
            <>
              <ProductImagePicker
                existing={imageUrl}
                file={imageFile}
                onFile={(file) => {
                  setImageFile(file);
                  setImageUrl(null);
                }}
                onRemove={() => {
                  setImageFile(null);
                  setImageUrl(null);
                }}
              />
              <Field label="Mã sản phẩm">
                <input
                  name="product_code"
                  defaultValue={order.product_code}
                  required
                  maxLength={160}
                />
              </Field>
              <Field label="Người phụ trách">
                <select
                  name="responsible_id"
                  defaultValue={order.responsible_id || ""}
                >
                  <option value="">Chưa phân công cá nhân</option>
                  {employees
                    .filter((e) => e.line_id === order.line_id)
                    .map((e) => (
                      <option value={e.id} key={e.id}>
                        {e.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Khách hàng">
                <input name="customer" defaultValue={order.customer} required />
              </Field>
              <Field label="Hạn giao">
                <input
                  name="deadline"
                  type="date"
                  defaultValue={order.deadline}
                  required
                />
              </Field>
              <Field label="Ghi chú">
                <textarea name="notes" defaultValue={order.notes || ""} />
              </Field>
            </>
          )}
          {permits(session.user, "orders.assign", {
            lineId: order.line_id,
          }) && (
            <Field label="Tổ phụ trách">
              <select name="line_id" defaultValue={order.line_id}>
                {lines
                  .filter((l) =>
                    permits(session.user, "orders.assign", { lineId: l.id }),
                  )
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Action type="submit" busy={busy}>
            <Save size={18} />
            Lưu thay đổi
          </Action>
        </form>
      )}
    </div>
  );
}
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
          <table>
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
                  <td>
                    <strong>{rate.order_id}</strong>
                    <span className="table-subtitle">
                      {rate.order.product_name}
                    </span>
                  </td>
                  <td>
                    {rate.stage}
                    {rate.work_item_name && (
                      <span className="table-subtitle">
                        {rate.work_item_name}
                      </span>
                    )}
                  </td>
                  <td className="rate-price">{money(rate.unit_price)}</td>
                  <td>
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
      <table>
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
              <td>{l.log_date}</td>
              {!hideEmployee && <td>{l.employee_name}</td>}
              <td>
                {l.order_id}
                <span className="table-subtitle">
                  {l.color} / {l.size}
                </span>
              </td>
              <td>
                {l.stage}
                {l.work_item_name && (
                  <span className="table-subtitle">{l.work_item_name}</span>
                )}
              </td>
              <td>{l.quantity}</td>
              <td>
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
        "Đã lưu phần việc. Nhân viên có thể chọn phần việc khi ghi nhận.",
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
          <div className="form-grid" key={row.key}>
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
