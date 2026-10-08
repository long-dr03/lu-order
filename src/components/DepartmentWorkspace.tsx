"use client";
import { useEffect, useState } from "react";
import { Check, ClipboardList, Plus, Users, Truck, Pencil } from "lucide-react";
import { type Api, day, message, money } from "@/lib/client";
import { type SessionInfo, hasPermission, permits } from "@/lib/permissions";
import {
  DEPARTMENTS,
  departmentFor,
  departmentAccess,
  departmentName,
  isManagement,
  isAdmin,
  type DepartmentId,
} from "@/lib/departments";
import {
  LUUTA_STAGES,
  type Order,
  type Employee,
  type Line,
  type OrderVariant,
} from "@/lib/types";
import type { Rate } from "@/lib/server/business";
import {
  remainingOperation,
  transitionProblem,
  transitionPermissionProblem,
  cutLimit,
  sewLimit,
} from "@/lib/workflow";
import { SHORTAGE_CAUSES, shortageBreakdown } from "@/lib/shortage";
import { Action, Field, ErrorNotice, Empty, Modal } from "./Primitives";
import { Pagination } from "./Pagination";
import {
  ProductPhoto,
  ProductImagePicker,
  uploadProductImage,
} from "./ProductImage";

type Assignment = {
  id: string;
  stage: string;
  work_item_id: number | null;
  employee_id: string;
  employee_name: string;
  active: number;
  department_id: DepartmentId;
};
type Total = {
  stage: string;
  work_item_id: number | null;
  color: string;
  size: string;
  quantity: number;
};
type Shipment = {
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
type Detail = Order & {
  assignments?: Assignment[];
  shipments?: Shipment[];
  work_totals?: Total[];
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
const keyFor = (v: { color: string; size: string }) =>
  JSON.stringify([v.color, v.size]);
const workStages = ["Cắt", "May", "Sửa hàng", "Đóng gói"] as const;
const assignmentStages = [...workStages, "Giao hàng"];
const prepared = (o: Order) =>
  !["nhan_don", "kiem_npl", "kiem_rap", "hoan_thanh"].includes(o.current_stage);
function recordable(
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
      (ceiling ? cutLimit(v.quantity) : v.quantity) - (part ? paid : v.cut_qty),
    );
  if (stage === "May")
    return Math.max(0, sewLimit(v) - (part ? paid : v.sewn_qty));
  if (stage === "Sửa hàng") return remainingOperation(v, "rework");
  return remainingOperation(v, "pack");
}
function useDetail(api: Api, id: string, version?: number) {
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
export function ProductionForm({
  orders,
  employees,
  session,
  api,
  onSaved,
  initialOrderId,
  onAssign,
  rates,
}: {
  orders: Order[];
  employees: Employee[];
  session: SessionInfo;
  api: Api;
  onSaved: (notice?: string) => Promise<void>;
  initialOrderId?: string;
  rates: Rate[];
  onAssign?: (id: string) => void;
}) {
  const [id, setId] = useState(
    initialOrderId || orders.find((o) => o.status !== "completed")?.id || "",
  );
  const loaded = useDetail(api, id, orders.find((o) => o.id === id)?.version);
  const detail = loaded.data;
  const stages = workStages.filter(
    (s) =>
      (permits(session.user, "production.create", { stage: s }) ||
        (s === "Sửa hàng" &&
          permits(session.user, "qc.manage", { stage: s }))) &&
      departmentAccess(session.user, departmentFor(s)),
  );
  const [stageValue, setStage] = useState("");
  const stage = stages.includes(stageValue as (typeof workStages)[number])
    ? stageValue
    : stages.find(
        (s) => departmentFor(s) === departmentFor(detail?.current_stage || ""),
      ) ||
      stages[0] ||
      "";
  const parts = detail?.work_items?.filter((p) => p.stage === stage) || [];
  const [partValue, setPart] = useState(0);
  const part = parts.some((p) => p.id === partValue) ? partValue : parts[0]?.id;
  const assigned =
    detail?.assignments?.filter(
      (a) =>
        a.active === 1 &&
        a.stage === stage &&
        (a.work_item_id || 0) === (part || 0),
    ) || [];
  const people = employees.filter(
    (e) =>
      e.active !== 0 &&
      e.department_ids?.includes(departmentFor(stage)) &&
      assigned.some((a) => a.employee_id === e.id),
  );
  const [personValue, setPerson] = useState("");
  const person = people.some((e) => e.id === personValue)
    ? personValue
    : people[0]?.id || "";
  // Amounts per worker: one save can credit several assigned workers of the same task.
  const [byWorker, setByWorker] = useState<
    Record<string, Record<string, number>>
  >({});
  const amounts = byWorker[person] || {};
  const setAmounts = (next: Record<string, number>) =>
    setByWorker((all) => ({ ...all, [person]: next }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const qty = (worker: string, key: string) => byWorker[worker]?.[key] || 0;
  const workerTotal = (worker: string) =>
    Object.values(byWorker[worker] || {}).reduce((n, q) => n + (q || 0), 0);
  const base = (detail?.variants || []).map((v) => ({
    ...v,
    available: detail ? recordable(v, stage, detail, part) : 0,
    ceiling: detail ? recordable(v, stage, detail, part, true) : 0,
  }));
  const others = (v: (typeof base)[number]) =>
    people
      .filter((p) => p.id !== person)
      .reduce((n, p) => n + qty(p.id, keyFor(v)), 0);
  const rows = base.map((v) => ({
    ...v,
    remaining: Math.max(0, v.available - others(v)),
    limit: Math.max(0, v.ceiling - others(v)),
  }));
  const workers = people
    .map((p) => ({
      employee_id: p.id,
      entries: base
        .filter((v) => qty(p.id, keyFor(v)) > 0)
        .map((v) => ({
          color: v.color,
          size: v.size,
          quantity: qty(p.id, keyFor(v)),
        })),
    }))
    .filter((w) => w.entries.length);
  const total = people.reduce((n, p) => n + workerTotal(p.id), 0);
  const invalid = base.some((v) => {
    const parts = people.map((p) => qty(p.id, keyFor(v)));
    return (
      parts.some((q) => !Number.isInteger(q) || q < 0) ||
      parts.reduce((n, q) => n + q, 0) > v.ceiling
    );
  });
  const canSeePrice =
    !!stage &&
    (permits(session.user, "rates.manage", { stage }) ||
      permits(session.user, "payroll.view", { stage, employeeId: person }));
  const [fetchedRates, setFetchedRates] = useState<Rate[]>([]);
  useEffect(() => {
    let live = true;
    if (canSeePrice)
      void api<Rate[]>("/api/rates")
        .then((rows) => {
          if (live) setFetchedRates(rows);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, canSeePrice, detail?.version]);
  const rate = [...rates, ...fetchedRates].find(
    (r) =>
      r.order_id === id &&
      r.stage === stage &&
      (r.work_item_id || 0) === (part || 0),
  );
  const problem = !detail
    ? "Đang tải số lượng và phân công…"
    : !stage
      ? "Bạn không được nhập sản lượng ở bộ phận này."
      : !prepared(detail)
        ? "Quản lý cần hoàn tất chuẩn bị đơn trước khi sản xuất."
        : !person
          ? "Chưa có thợ được phân công cho công đoạn/phần việc này."
          : invalid
            ? "Có số lượng vượt mức còn lại hoặc không phải số nguyên."
            : "";
  return (
    <form
      className="stack department-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!detail || problem || !total) return;
        setBusy(true);
        setError("");
        const form = new FormData(e.currentTarget);
        try {
          const result = await api<{ pay_status?: string }>(
            "/api/production/log",
            {
              version: detail.version,
              order_id: id,
              stage,
              work_item_id: part,
              log_date: form.get("date"),
              reason: String(form.get("reason") || "").trim() || undefined,
              incident: form.get("incident") === "on",
              record_packing: stage === "Đóng gói",
              record_rework: stage === "Sửa hàng",
              ...(workers.length === 1 ? workers[0] : { workers }),
            },
          );
          setByWorker({});
          await onSaved(
            result.pay_status === "pending"
              ? "Đã đóng gói; công đang chờ đối chiếu do tháng lương đã khóa."
              : workers.length > 1
                ? `Đã ghi nhận sản lượng cho ${workers.length} thợ.`
                : "Đã ghi nhận sản lượng cho thợ.",
          );
        } catch (err) {
          setError(message(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <ErrorNotice error={error || loaded.error} />
      <p className="muted">
        Người ghi nhận: <strong>{session.user.name}</strong>. Thợ thực hiện
        không cần đăng nhập.
      </p>
      <div className="form-grid">
        <Field label="Ngày làm việc">
          <input
            name="date"
            type="date"
            required
            max={day()}
            min={detail?.order_date}
            defaultValue={day()}
          />
        </Field>
        <Field label="Đơn hàng">
          <select
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setByWorker({});
              setPart(0);
              setPerson("");
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
        <Field label="Công đoạn">
          <select
            value={stage}
            onChange={(e) => {
              setStage(e.target.value);
              setByWorker({});
              setPart(0);
              setPerson("");
            }}
          >
            {stages.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        {!!parts.length && (
          <Field label="Phần việc">
            <select
              value={part}
              onChange={(e) => {
                setPart(Number(e.target.value));
                setByWorker({});
              }}
            >
              {parts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {!!people.length && (
        <div className="field" role="group" aria-label="Thợ thực hiện">
          <span>Thợ thực hiện</span>
          <div className="rate-stage-grid">
            {people.map((p) => (
              <button
                type="button"
                key={p.id}
                className="rate-stage-card"
                aria-pressed={p.id === person}
                onClick={() => setPerson(p.id)}
              >
                <span>{p.name}</span>
                <strong>
                  {workerTotal(p.id)
                    ? `${workerTotal(p.id).toLocaleString("vi-VN")} sản phẩm`
                    : "Chưa nhập"}
                </strong>
              </button>
            ))}
          </div>
          <small>
            Chọn thợ rồi nhập số; chọn thợ khác để nhập tiếp. Một lần lưu ghi
            nhận cho tất cả thợ, mỗi thợ nhận công riêng.
          </small>
        </div>
      )}
      {problem && (
        <div className="entry-guidance">
          <p>{problem}</p>
          {!person && detail && onAssign && (
            <Action type="button" tone="secondary" onClick={() => onAssign(id)}>
              <Users size={18} />
              Mở đơn để phân công
            </Action>
          )}
        </div>
      )}
      {stage === "Cắt" && (
        <p className="muted">
          Được nhập cắt dư so với đơn (tối đa +50%); phần dư được ghi nhận nhưng
          May và các bước sau vẫn chỉ tính theo số lượng đặt.
        </p>
      )}
      <div className="panel-toolbar">
        <strong>
          {departmentName(departmentFor(stage))} · Nhập nhiều màu và size
          {people.length > 1 &&
            ` cho ${people.find((p) => p.id === person)?.name || ""}`}
        </strong>
        <Action
          type="button"
          tone="secondary"
          onClick={() =>
            setAmounts(
              Object.fromEntries(rows.map((v) => [keyFor(v), v.remaining])),
            )
          }
        >
          Điền tối đa còn lại
        </Action>
        <Action type="button" tone="secondary" onClick={() => setAmounts({})}>
          Xóa số đã nhập
        </Action>
      </div>
      <QuantityGrid rows={rows} amounts={amounts} onChange={setAmounts} />
      {canSeePrice && (
        <div className="pay-preview">
          {rate ? (
            <>
              <span>Đơn giá {money(rate.unit_price)} / sản phẩm</span>
              <strong>{money(rate.unit_price * total)}</strong>
            </>
          ) : (
            <span>Chưa cấu hình đơn giá cho công đoạn/phần việc này.</span>
          )}
        </div>
      )}
      <label className="check-label">
        <input type="checkbox" name="incident" />
        Có sự cố cần giải trình
      </label>
      <Field
        label="Nguyên nhân / ghi chú sự cố"
        hint="Bắt buộc nếu đánh dấu sự cố. Nhập từng phần bình thường không phải là sự cố."
      >
        <textarea name="reason" maxLength={2000} />
      </Field>
      <div className="modal-footer">
        <strong>Tổng lần này: {total.toLocaleString("vi-VN")} sản phẩm</strong>
        <Action type="submit" busy={busy} disabled={!!problem || total === 0}>
          <Check size={18} />
          Ghi nhận một lần
        </Action>
      </div>
    </form>
  );
}
function QuantityGrid({
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
export function OrderDetail({
  order: raw,
  session,
  api,
  employees,
  onChanged,
}: {
  order: Order;
  session: SessionInfo;
  api: Api;
  employees: Employee[];
  lines: Line[];
  onChanged: () => Promise<void>;
}) {
  const order = raw as Detail;
  const [tab, setTab] = useState(() =>
    isManagement(session.user) || !prepared(order)
      ? "progress"
      : permits(session.user, "qc.manage", { stage: "QC" })
        ? "qc"
        : permits(session.user, "delivery.manage", { stage: "Giao hàng" })
          ? "shipments"
          : workStages.some((s) =>
                permits(session.user, "production.create", { stage: s }),
              )
            ? "work"
            : "progress",
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const totals = (order.variants || []).reduce(
    (n, v) => ({
      cut: n.cut + v.cut_qty,
      sewn: n.sewn + v.sewn_qty,
      qc: n.qc + v.qc_passed_qty,
      packed: n.packed + v.packed_qty,
      delivered: n.delivered + v.delivered_qty,
    }),
    { cut: 0, sewn: 0, qc: 0, packed: 0, delivered: 0 },
  );
  const tabs = [
    { id: "progress", label: "Tiến độ" },
    { id: "assignments", label: "Phân công" },
    { id: "work", label: "Ghi sản lượng" },
    { id: "qc", label: "Kiểm QC" },
    { id: "shipments", label: "Đợt giao" },
    { id: "history", label: "Lịch sử" },
    ...(isManagement(session.user) && hasPermission(session.user, "orders.edit")
      ? [{ id: "edit", label: "Sửa thông tin" }]
      : []),
  ]
    .filter(
      (t) =>
        t.id !== "work" ||
        workStages.some(
          (s) =>
            permits(session.user, "production.create", { stage: s }) ||
            (s === "Sửa hàng" &&
              permits(session.user, "qc.manage", { stage: s })),
        ),
    )
    .filter(
      (t) =>
        t.id !== "qc" || permits(session.user, "qc.manage", { stage: "QC" }),
    );
  return (
    <div className="stack department-detail">
      <div className="order-detail-heading">
        <ProductPhoto url={order.image_url} name={order.product_name} large />
        <div>
          <h3>{order.product_name}</h3>
          <p>
            {order.customer} · {order.product_code}
          </p>
          <p className="muted">
            Hạn giao: {order.deadline.split("-").reverse().join("/")} ·{" "}
            {order.total_quantity} sản phẩm
          </p>
          <p>
            Bước điều phối:{" "}
            <strong>
              {LUUTA_STAGES.find((s) => s.key === order.current_stage)?.label}
            </strong>
          </p>
        </div>
      </div>
      <nav className="detail-tabs" aria-label="Chi tiết đơn">
        {tabs.map((t) => (
          <button
            type="button"
            key={t.id}
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <ErrorNotice error={error} />
      {tab === "progress" && (
        <>
          <div className="department-metrics">
            {[
              ["Đã cắt", totals.cut],
              ["Đã may", totals.sewn],
              ["QC đạt", totals.qc],
              ["Đóng gói", totals.packed],
              ["Đã giao", totals.delivered],
            ].map(([label, n]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>
                  {n}/{order.total_quantity}
                  {Number(n) > order.total_quantity &&
                    ` (dư ${Number(n) - order.total_quantity})`}
                </strong>
              </div>
            ))}
          </div>
          <p className="muted">
            Các bộ phận xử lý song song theo lượng thực tế. Vị trí Kanban không
            thay thế số lượng đã làm.
          </p>
          <StageTimeline order={order} />
          <VariantTable
            order={order}
            session={session}
            api={api}
            onChanged={onChanged}
          />
          <h3>Lịch sử giao hàng ({order.shipments?.length || 0})</h3>
          {order.shipments?.slice(0, 5).map((s) => (
            <p key={s.id}>
              <strong>{formatDateTime(s.delivered_at)}</strong> ·{" "}
              {s.items
                .map((r) => `${r.color}/${r.size} ×${r.quantity}`)
                .join(", ")}
              {s.reason ? ` — ${s.reason}` : ""}
            </p>
          ))}
          {!order.shipments?.length && (
            <Empty>Chưa có đợt giao. Ghi tại tab Đợt giao.</Empty>
          )}
          {(order.shipments?.length || 0) > 5 && (
            <p className="muted">Xem đầy đủ ở tab Đợt giao.</p>
          )}
          <StageMover
            order={order}
            session={session}
            busy={busy}
            onMove={async (change) => {
              setBusy(true);
              setError("");
              try {
                await api(
                  `/api/orders/${encodeURIComponent(order.id)}`,
                  { version: order.version, ...change },
                  "PATCH",
                );
                await onChanged();
              } catch (err) {
                setError(message(err));
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      )}
      {tab === "assignments" && (
        <AssignmentForm
          order={order}
          session={session}
          employees={employees}
          api={api}
          onChanged={onChanged}
        />
      )}
      {tab === "work" && (
        <ProductionForm
          initialOrderId={order.id}
          orders={[order]}
          employees={employees}
          session={session}
          api={api}
          rates={[]}
          onAssign={() => setTab("assignments")}
          onSaved={async () => {
            await onChanged();
            setTab("progress");
          }}
        />
      )}
      {tab === "qc" && (
        <QualityForm
          order={order}
          session={session}
          api={api}
          onChanged={onChanged}
        />
      )}
      {tab === "shipments" && (
        <ShipmentPanel
          order={order}
          session={session}
          employees={employees}
          api={api}
          onChanged={onChanged}
        />
      )}
      {tab === "history" && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ngày giờ thực tế</th>
                <th>Thao tác</th>
                <th>Màu / size</th>
                <th>Số lượng</th>
                <th>Người thực hiện</th>
                <th>Nguyên nhân</th>
              </tr>
            </thead>
            <tbody>
              {(order.operations || [])
                .slice((historyPage - 1) * 25, historyPage * 25)
                .map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.operation_date}{" "}
                      {r.operation_time || "Chưa có giờ lịch sử"}
                    </td>
                    <td>{ACTION_LABELS[r.action] || r.action}</td>
                    <td>
                      {r.color} / {r.size}
                    </td>
                    <td>{r.quantity}</td>
                    <td>{r.worker_name}</td>
                    <td>{r.reason || "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <Pagination
            page={historyPage}
            total={order.operations?.length || 0}
            pageSize={25}
            onChange={setHistoryPage}
          />
        </div>
      )}
      {tab === "edit" && (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              const imageUrl = imageFile
                ? await uploadProductImage(imageFile, session)
                : removeImage
                  ? null
                  : order.image_url;
              await api(
                `/api/orders/${encodeURIComponent(order.id)}`,
                {
                  version: order.version,
                  customer: f.get("customer"),
                  product_code: f.get("product_code"),
                  deadline: f.get("deadline"),
                  notes: f.get("notes"),
                  image_url: imageUrl,
                  responsible_id: f.get("responsible") || null,
                },
                "PATCH",
              );
              await onChanged();
              setTab("progress");
            } catch (err) {
              setError(message(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <ProductImagePicker
            existing={removeImage ? null : order.image_url}
            file={imageFile}
            onFile={(file) => {
              setImageFile(file);
              setRemoveImage(false);
            }}
            onRemove={() => {
              setImageFile(null);
              setRemoveImage(true);
            }}
          />
          <Field label="Đầu mối điều phối (không bắt buộc)">
            <select
              name="responsible"
              defaultValue={order.responsible_id || ""}
            >
              <option value="">Chưa chọn đầu mối</option>
              {employees
                .filter(
                  (e) =>
                    e.active !== 0 && e.department_ids?.includes("management"),
                )
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Khách hàng">
            <input name="customer" required defaultValue={order.customer} />
          </Field>
          <Field label="Mã sản phẩm">
            <input
              name="product_code"
              required
              defaultValue={order.product_code}
            />
          </Field>
          <Field label="Hạn giao">
            <input
              type="date"
              name="deadline"
              required
              defaultValue={order.deadline}
              min={order.order_date}
            />
          </Field>
          <Field label="Ghi chú">
            <textarea
              name="notes"
              maxLength={2000}
              defaultValue={order.notes || ""}
            />
          </Field>
          <Action type="submit" busy={busy}>
            Lưu thông tin
          </Action>
        </form>
      )}
    </div>
  );
}
const PREPARATION_STAGES = ["nhan_don", "kiem_npl", "kiem_rap"];
function StageMover({
  order,
  session,
  busy,
  onMove,
}: {
  order: Detail;
  session: SessionInfo;
  busy: boolean;
  onMove: (change: { stage: string } | { prepare: true }) => Promise<void>;
}) {
  const blocked = transitionPermissionProblem(session.user, order);
  const next = LUUTA_STAGES.filter(
    (s) =>
      !transitionProblem(order, s.key) &&
      (s.key !== "hoan_thanh" || isManagement(session.user)),
  );
  const preparing =
    PREPARATION_STAGES.includes(order.current_stage) &&
    isManagement(session.user);
  return (
    <div className="field" role="group" aria-label="Chuyển bước điều phối">
      <span>Chuyển bước điều phối</span>
      <div className="inline-actions">
        {preparing && (
          <Action
            type="button"
            busy={busy}
            disabled={!!blocked}
            onClick={() => void onMove({ prepare: true })}
          >
            <Check size={18} />
            Hoàn tất chuẩn bị → Cắt
          </Action>
        )}
        {next.map((s) => (
          <Action
            type="button"
            key={s.key}
            tone="secondary"
            busy={busy}
            disabled={!!blocked}
            onClick={() => void onMove({ stage: s.key })}
          >
            Chuyển sang {s.label}
          </Action>
        ))}
      </div>
      <small>
        {blocked ||
          (next.length
            ? preparing
              ? "Hoàn tất chuẩn bị chuyển qua Kiểm NPL/Vải và Kiểm rập trong một lần; lịch sử từng bước vẫn được lưu."
              : "Chuyển bước chỉ điều phối, không tạo số lượng."
            : "Chưa đủ điều kiện chuyển sang bước tiếp theo.")}
      </small>
    </div>
  );
}
const ACTION_LABELS: Record<string, string> = {
  qc: "QC",
  rework: "Sửa hàng",
  reinspect: "QC lại",
  pack: "Đóng gói",
  deliver: "Giao hàng",
  shortage: "Giải trình thiếu",
};
const vnStamp = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
function VariantTable({
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
  const [open, setOpen] = useState("");
  const selected = order.variants?.find((v) => keyFor(v) === open);
  return (
    <div className="stack">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {[
                "Màu",
                "Size",
                "Đặt",
                "Cắt",
                "May",
                "QC đạt",
                "Đóng gói",
                "Đã giao",
                "Thiếu",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.variants?.map((v) => {
              const short = Math.max(0, v.quantity - v.delivered_qty);
              return (
                <tr key={keyFor(v)}>
                  <td>{v.color}</td>
                  <td>{v.size}</td>
                  <td>{v.quantity}</td>
                  <td>
                    {v.cut_qty}
                    {v.cut_qty > v.quantity &&
                      ` (dư +${v.cut_qty - v.quantity})`}
                  </td>
                  <td>{v.sewn_qty}</td>
                  <td>{v.qc_passed_qty}</td>
                  <td>{v.packed_qty}</td>
                  <td>{v.delivered_qty}</td>
                  <td>
                    {short ? (
                      <Action
                        type="button"
                        tone="secondary"
                        aria-label={`Xem nguyên nhân thiếu ${v.color} size ${v.size}`}
                        aria-pressed={open === keyFor(v)}
                        onClick={() =>
                          setOpen(open === keyFor(v) ? "" : keyFor(v))
                        }
                      >
                        {short}
                      </Action>
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
      <p className="muted">
        Bấm số ở cột Thiếu để xem sản phẩm đang nằm ở công đoạn nào và nguyên
        nhân đã ghi.
      </p>
      {selected && (
        <ShortagePanel
          key={keyFor(selected)}
          order={order}
          variant={selected}
          session={session}
          api={api}
          onChanged={onChanged}
          onClose={() => setOpen("")}
        />
      )}
    </div>
  );
}
const STAGE_ASSIGNMENT: Record<string, string> = {
  cat: "Cắt",
  may: "May",
  sua_hang: "Sửa hàng",
  dong_goi: "Đóng gói",
  giao_hang: "Giao hàng",
};
// Stage times are stored as Vietnam local "YYYY-MM-DD HH:mm:ss"; only ISO values need conversion.
const stageTime = (v: string) =>
  v.includes("T") ? formatDateTime(v) : v.slice(0, 16);
function StageTimeline({ order }: { order: Detail }) {
  const rows = (order.stages || []).map((st) => {
    const flow = ["nhan_don", "kiem_npl", "kiem_rap"].includes(st.stage_key);
    const worked = st.completed_qty > 0 || st.received_qty > 0;
    const done = flow
      ? st.status === "completed"
      : st.received_qty > 0 && st.remaining_qty === 0 && st.completed_qty > 0;
    const trouble =
      st.status === "has_issue" ||
      (st.stage_key === order.current_stage &&
        ["delayed", "at_risk"].includes(order.status));
    const state = trouble
      ? { label: "Có vấn đề", css: "delayed" }
      : done || st.status === "completed"
        ? { label: "Hoàn thành", css: "completed" }
        : st.status === "in_progress" || (!flow && st.completed_qty > 0)
          ? { label: "Đang thực hiện", css: "on_track" }
          : { label: "Chưa bắt đầu", css: "" };
    const people = [
      ...new Set(
        (order.assignments || [])
          .filter(
            (a) => a.active === 1 && a.stage === STAGE_ASSIGNMENT[st.stage_key],
          )
          .map((a) => a.employee_name),
      ),
    ];
    return { st, flow, worked, state, people };
  });
  return (
    <div className="stack">
      <p className="muted">
        Tiến trình theo công đoạn; các bộ phận làm song song theo số lượng thực
        tế.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {[
                "Công đoạn",
                "Trạng thái",
                "Nhận",
                "Hoàn thành",
                "Còn lại",
                "Người được giao",
                "Bắt đầu",
                "Xong",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ st, flow, state, people }) => (
              <tr key={st.stage_key}>
                <td>
                  {LUUTA_STAGES.find((s) => s.key === st.stage_key)?.label ||
                    st.stage_name}
                </td>
                <td>
                  <span className={`status ${state.css}`.trim()}>
                    {state.label}
                  </span>
                </td>
                <td>{flow ? "—" : st.received_qty}</td>
                <td>{flow ? "—" : st.completed_qty}</td>
                <td>{flow ? "—" : st.remaining_qty}</td>
                <td>{people.join(", ") || "—"}</td>
                <td>{st.started_at ? stageTime(st.started_at) : "—"}</td>
                <td>{st.completed_at ? stageTime(st.completed_at) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function ShortagePanel({
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
function AssignmentForm({
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
  const stages = assignmentStages.filter((s) =>
    permits(session.user, "production.assign", { stage: s }),
  );
  const [stageValue, setStage] = useState(stages[0] || "");
  const stage = stages.includes(stageValue) ? stageValue : stages[0] || "";
  const parts = order.work_items?.filter((p) => p.stage === stage) || [];
  const [partValue, setPart] = useState(0);
  const part = parts.some((p) => p.id === partValue) ? partValue : parts[0]?.id;
  const ids =
    order.assignments
      ?.filter(
        (a) =>
          a.active === 1 &&
          a.stage === stage &&
          (a.work_item_id || 0) === (part || 0),
      )
      .map((a) => a.employee_id) || [];
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const people = employees.filter(
    (e) =>
      e.active !== 0 &&
      e.department_ids?.includes(departmentFor(stage)) &&
      e.name.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")),
  );
  const [page, setPage] = useState(1);
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(people.length / 20)),
  );
  const unassigned = stages
    .flatMap((st) => {
      const ps = order.work_items?.filter((p) => p.stage === st) || [];
      return ps.length
        ? ps.map((p) => ({ stage: st, part: p.id, label: `${st} · ${p.name}` }))
        : [{ stage: st, part: 0, label: st }];
    })
    .filter(
      (t) =>
        !order.assignments?.some(
          (a) =>
            a.active === 1 &&
            a.stage === t.stage &&
            (a.work_item_id || 0) === t.part,
        ) &&
        employees.some(
          (e) =>
            e.active !== 0 &&
            e.department_ids?.includes(departmentFor(t.stage)),
        ),
    );
  return (
    <div className="stack">
      <p>
        Chọn nhiều thợ cho công đoạn hoặc phần việc. Phân công không tự tạo sản
        lượng hay tiền công.
      </p>
      <ErrorNotice error={error} />
      {!!unassigned.length && order.status !== "completed" && (
        <div className="entry-guidance">
          <p>
            Chưa có thợ: {unassigned.map((t) => t.label).join(", ")}. Phân công
            nhanh giao mọi thợ đang làm của từng bộ phận; phần đã phân công giữ
            nguyên, có thể bỏ bớt người sau.
          </p>
          <Action
            type="button"
            tone="secondary"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api(
                  `/api/orders/${encodeURIComponent(order.id)}/assignments`,
                  { version: order.version, quick: true },
                );
                setChosen(null);
                await onChanged();
              } catch (e) {
                setError(message(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Users size={18} />
            Phân công nhanh cả bộ phận
          </Action>
        </div>
      )}
      {!!stages.length && (
        <>
          <div className="form-grid">
            <Field label="Công đoạn">
              <select
                value={stage}
                onChange={(e) => {
                  setStage(e.target.value);
                  setPart(0);
                  setChosen(null);
                  setPage(1);
                }}
              >
                {stages.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            {!!parts.length && (
              <Field label="Phần việc">
                <select
                  value={part}
                  onChange={(e) => {
                    setPart(Number(e.target.value));
                    setChosen(null);
                  }}
                >
                  {parts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <Field
            label={`Tìm thợ bộ phận ${departmentName(departmentFor(stage))}`}
          >
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </Field>
          <fieldset>
            <legend>Thợ được giao ({(chosen || ids).length})</legend>
            {people.length > 1 && (
              <div className="inline-actions">
                <Action
                  type="button"
                  tone="secondary"
                  onClick={() =>
                    setChosen([
                      ...new Set([
                        ...(chosen || ids),
                        ...people.map((e) => e.id),
                      ]),
                    ])
                  }
                >
                  Chọn tất cả {people.length} thợ
                </Action>
                <Action
                  type="button"
                  tone="secondary"
                  onClick={() => setChosen([])}
                >
                  Bỏ chọn
                </Action>
              </div>
            )}
            {people.slice((currentPage - 1) * 20, currentPage * 20).map((e) => (
              <label className="check-label" key={e.id}>
                <input
                  type="checkbox"
                  checked={(chosen || ids).includes(e.id)}
                  onChange={(ev) =>
                    setChosen(
                      ev.target.checked
                        ? [...(chosen || ids), e.id]
                        : (chosen || ids).filter((id) => id !== e.id),
                    )
                  }
                />
                {e.name}
              </label>
            ))}
            {!people.length && (
              <Empty>
                Chưa có thợ đang hoạt động thuộc bộ phận này. Khai báo tại Danh
                sách thợ.
              </Empty>
            )}
          </fieldset>
          <Pagination
            page={currentPage}
            total={people.length}
            pageSize={20}
            onChange={setPage}
          />
          <Action
            busy={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api(
                  `/api/orders/${encodeURIComponent(order.id)}/assignments`,
                  {
                    version: order.version,
                    stage,
                    work_item_id: part,
                    employee_ids: chosen || ids,
                  },
                );
                setChosen(null);
                await onChanged();
              } catch (e) {
                setError(message(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Users size={18} />
            Lưu phân công
          </Action>
        </>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Công đoạn</th>
              <th>Thợ</th>
              <th>Phân công</th>
            </tr>
          </thead>
          <tbody>
            {order.assignments
              ?.filter((a) => a.active === 1)
              .map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.stage}
                    {a.work_item_id
                      ? ` · ${order.work_items?.find((w) => w.id === a.work_item_id)?.name || "Phần việc"}`
                      : ""}
                  </td>
                  <td>{a.employee_name}</td>
                  <td>{departmentName(a.department_id)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function QualityForm({
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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [action, setAction] = useState<"qc" | "reinspect">("qc");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [passed, setPassed] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = (order.variants || [])
    .map((v) => ({ ...v, remaining: remainingOperation(v, action) }))
    .filter((v) => v.remaining > 0);
  const entries = rows
    .filter((v) => (qty[keyFor(v)] || 0) > 0)
    .map((v) => ({
      color: v.color,
      size: v.size,
      quantity: qty[keyFor(v)],
      passed: passed[keyFor(v)] ?? qty[keyFor(v)],
    }));
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          const imageUrl = imageFile
            ? await uploadProductImage(imageFile, session)
            : undefined;
          await api(`/api/orders/${encodeURIComponent(order.id)}/operations`, {
            version: order.version,
            action,
            operation_date: f.get("date"),
            operation_time: f.get("time"),
            image_url: imageUrl,
            defect_type: String(f.get("defect") || ""),
            reason: String(f.get("reason") || "").trim() || undefined,
            entries,
          });
          setQty({});
          setPassed({});
          setImageFile(null);
          await onChanged();
        } catch (err) {
          setError(message(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Người kiểm: <strong>{session.user.name}</strong>. Sửa hàng được ghi tại
        “Ghi sản lượng” bởi người phụ trách QC cho thợ đã phân công.
      </p>
      <ErrorNotice error={error} />
      <div className="form-grid">
        <Field label="Loại kiểm">
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value as "qc" | "reinspect");
              setQty({});
              setPassed({});
            }}
          >
            <option value="qc">Kiểm lần đầu</option>
            <option value="reinspect">Kiểm lại sau sửa</option>
          </select>
        </Field>
        <Field label="Ngày kiểm">
          <input
            name="date"
            type="date"
            required
            max={day()}
            min={order.order_date}
            defaultValue={day()}
          />
        </Field>
        <Field label="Giờ kiểm">
          <input
            name="time"
            type="time"
            required
            defaultValue={new Intl.DateTimeFormat("en-GB", {
              timeZone: "Asia/Ho_Chi_Minh",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date())}
          />
        </Field>
      </div>
      {rows.map((v) => (
        <div className="qc-entry" key={keyFor(v)}>
          <strong>
            {v.color} / {v.size} · Chờ kiểm {v.remaining}
          </strong>
          <Field label="Số kiểm">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={v.remaining}
              value={qty[keyFor(v)] || ""}
              placeholder="0"
              onChange={(e) =>
                setQty({ ...qty, [keyFor(v)]: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Số đạt">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={qty[keyFor(v)] || 0}
              value={passed[keyFor(v)] ?? qty[keyFor(v)] ?? ""}
              onChange={(e) =>
                setPassed({ ...passed, [keyFor(v)]: Number(e.target.value) })
              }
            />
          </Field>
        </div>
      ))}
      {!rows.length && (
        <Empty>Chưa có số lượng chờ kiểm ở loại kiểm này.</Empty>
      )}
      <Field label="Mô tả lỗi">
        <textarea name="defect" maxLength={500} />
      </Field>
      <ProductImagePicker
        file={imageFile}
        onFile={setImageFile}
        onRemove={() => setImageFile(null)}
        label="Ảnh lỗi"
        prompt="Thêm ảnh để đối chiếu lỗi"
      />
      <Field label="Nguyên nhân / giải trình">
        <textarea name="reason" maxLength={2000} />
      </Field>
      <Action type="submit" busy={busy} disabled={!entries.length}>
        Lưu kết quả QC
      </Action>
    </form>
  );
}
function ShipmentPanel({
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
const localDateTime = () =>
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
const formatDateTime = (v: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(v));

export function DepartmentsPanel({
  orders,
  session,
  onOpen,
  initialDepartment,
}: {
  orders: Order[];
  session: SessionInfo;
  onOpen: (id: string) => void;
  initialDepartment?: DepartmentId;
}) {
  const [department, setDepartment] = useState(
    initialDepartment ||
      (isManagement(session.user)
        ? ""
        : session.user.department_ids?.[0] || ""),
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const rows = orders.filter(
    (o) =>
      o.status !== "completed" &&
      `${o.id} ${o.product_name} ${o.customer}`
        .toLocaleLowerCase("vi")
        .includes(search.toLocaleLowerCase("vi")) &&
      (!department ||
        department === departmentFor(o.current_stage) ||
        (o.variants || []).some((v) =>
          department === "sewing"
            ? v.cut_qty > v.sewn_qty
            : department === "quality"
              ? remainingOperation(v, "qc") > 0 ||
                remainingOperation(v, "rework") > 0 ||
                remainingOperation(v, "reinspect") > 0
              : department === "packing"
                ? remainingOperation(v, "pack") > 0
                : department === "delivery"
                  ? remainingOperation(v, "deliver") > 0
                  : false,
        )),
  );
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / 20)));
  return (
    <section className="panel department-panel">
      <div className="panel-toolbar">
        <Field label="Bộ phận">
          <select
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Toàn xưởng</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tìm đơn">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Mã đơn, sản phẩm, khách hàng…"
          />
        </Field>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Đơn / sản phẩm</th>
              <th>Bước điều phối</th>
              <th>Đã may</th>
              <th>QC đạt</th>
              <th>Đã giao</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice((current - 1) * 20, current * 20).map((o) => (
              <tr key={o.id}>
                <td>
                  <strong>{o.id}</strong>
                  <p>{o.product_name}</p>
                </td>
                <td>
                  {LUUTA_STAGES.find((s) => s.key === o.current_stage)?.label}
                </td>
                <td>
                  {o.variants?.reduce((n, v) => n + v.sewn_qty, 0)}/
                  {o.total_quantity}
                </td>
                <td>
                  {o.variants?.reduce((n, v) => n + v.qc_passed_qty, 0)}/
                  {o.total_quantity}
                </td>
                <td>
                  {o.variants?.reduce((n, v) => n + v.delivered_qty, 0)}/
                  {o.total_quantity}
                </td>
                <td>
                  <Action tone="secondary" onClick={() => onOpen(o.id)}>
                    <ClipboardList size={18} />
                    Mở công việc
                  </Action>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <Empty>Chưa có đơn phù hợp.</Empty>}
      <Pagination
        page={current}
        total={rows.length}
        pageSize={20}
        onChange={setPage}
      />
    </section>
  );
}
export function StaffPanel({
  session,
  api,
  onSaved,
}: {
  session: SessionInfo;
  api: Api;
  onSaved: () => Promise<void>;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void api<{ employees: Employee[] }>("/api/departments")
      .then((r) => {
        if (live) setEmployees(r.employees);
      })
      .catch((e) => {
        if (live) setError(message(e));
      });
    return () => {
      live = false;
    };
  }, [api, revision]);
  const rows = employees.filter(
    (e) =>
      e.name.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")) &&
      (!department ||
        (department === "unclassified"
          ? !e.department_ids?.length
          : e.department_ids?.includes(department as DepartmentId))),
  );
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / 25)));
  return (
    <section className="panel department-panel">
      <div className="panel-toolbar">
        <Field label="Tìm hồ sơ">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </Field>
        <Field label="Bộ phận">
          <select
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả</option>
            <option value="unclassified">Chưa phân loại</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Action
          onClick={() => {
            setSelected(null);
            setOpen(true);
          }}
        >
          <Plus size={18} />
          Khai báo thợ
        </Action>
      </div>
      <ErrorNotice error={error} />
      <p className="padded muted">
        Thợ không cần tài khoản. Hồ sơ chưa phân loại phải được Admin gán bộ
        phận trước khi phân công.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Họ tên</th>
              <th>Bộ phận</th>
              <th>Loại hồ sơ</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice((current - 1) * 25, current * 25).map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td>
                  {e.department_ids?.map(departmentName).join(", ") ||
                    "Chưa phân loại"}
                </td>
                <td>
                  {e.has_account
                    ? "Có tài khoản quản lý / lịch sử"
                    : "Thợ gia công"}
                </td>
                <td>{e.active === 0 ? "Ngừng làm" : "Đang làm"}</td>
                <td>
                  {(!e.has_account || isAdmin(session.user)) && (
                    <Action
                      tone="secondary"
                      onClick={() => {
                        setSelected(e);
                        setOpen(true);
                      }}
                    >
                      <Pencil size={18} />
                      Cấu hình
                    </Action>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={current}
        total={rows.length}
        pageSize={25}
        onChange={setPage}
      />
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={selected ? "Cấu hình hồ sơ" : "Khai báo thợ"}
        description="Chọn bộ phận thực tế; có thể kiêm nhiệm nhiều bộ phận."
      >
        <StaffForm
          key={selected?.id || "new"}
          employee={selected}
          session={session}
          busy={busy}
          error={error}
          onSave={async (input) => {
            setBusy(true);
            setError("");
            try {
              await api("/api/departments", input);
              setOpen(false);
              setRevision((r) => r + 1);
              await onSaved();
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      </Modal>
    </section>
  );
}
function StaffForm({
  employee,
  session,
  busy,
  error,
  onSave,
}: {
  employee: Employee | null;
  session: SessionInfo;
  busy: boolean;
  error: string;
  onSave: (v: unknown) => Promise<void>;
}) {
  const [ids, setIds] = useState(employee?.department_ids || []);
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void onSave({
          action: employee ? "update" : "create",
          id: employee?.id,
          name: f.get("name"),
          phone: f.get("phone"),
          role: f.get("role"),
          department_ids: ids,
          active: Number(f.get("active") || 1),
        });
      }}
    >
      <ErrorNotice error={error} />
      <Field label="Họ tên">
        <input
          name="name"
          required
          maxLength={160}
          defaultValue={employee?.name || ""}
        />
      </Field>
      <Field label="Chuyên môn">
        <input
          name="role"
          maxLength={100}
          defaultValue={employee?.role || "Thợ gia công"}
        />
      </Field>
      <Field label="Điện thoại (không bắt buộc)">
        <input
          name="phone"
          type="tel"
          maxLength={40}
          defaultValue={employee?.phone || ""}
        />
      </Field>
      <fieldset>
        <legend>Bộ phận</legend>
        {DEPARTMENTS.filter(
          (d) =>
            (d.id !== "management" || isAdmin(session.user)) &&
            departmentAccess(session.user, d.id),
        ).map((d) => (
          <label className="check-label" key={d.id}>
            <input
              type="checkbox"
              checked={ids.includes(d.id)}
              onChange={(e) =>
                setIds(
                  e.target.checked
                    ? [...ids, d.id]
                    : ids.filter((id) => id !== d.id),
                )
              }
            />
            {d.name}
          </label>
        ))}
      </fieldset>
      <Field label="Trạng thái">
        <select name="active" defaultValue={employee?.active ?? 1}>
          <option value={1}>Đang làm</option>
          <option value={0}>Ngừng làm</option>
        </select>
      </Field>
      <Action type="submit" busy={busy} disabled={!ids.length}>
        Lưu hồ sơ
      </Action>
    </form>
  );
}
