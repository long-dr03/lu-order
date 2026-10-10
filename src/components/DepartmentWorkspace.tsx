"use client";
import {
  useEffect,
  useState,
  lazy,
  Suspense,
  ComponentType,
  LazyExoticComponent,
} from "react";
import { Check, ClipboardList, Plus, Users, Pencil } from "lucide-react";
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
import { Rate } from "@/lib/server/business";
import {
  remainingOperation,
  transitionProblem,
  transitionPermissionProblem,
  sewLimit,
} from "@/lib/workflow";
import { Action, Field, ErrorNotice, Empty, Modal } from "./Primitives";
import { Pagination } from "./Pagination";
import { RatesSetup, useOrderRates } from "./detail-rates";
import {
  ProductPhotoGallery,
  ProductPhotosField,
  type PhotoDraft,
  photoDraftsFrom,
  resolvePhotos,
} from "./ProductImage";
import {
  ACTION_LABELS,
  Detail,
  QuantityGrid,
  STAGE_ASSIGNMENT,
  assignmentStages,
  formatDateTime,
  keyFor,
  preparationStages,
  prepared,
  recordable,
  stageTime,
  useDetail,
  workStages,
} from "./order-detail-shared";

/** Tabs and panels that are not the default view load on first use, so opening an order stays fast. */
function Suspended<P extends object>(
  Component: LazyExoticComponent<ComponentType<P>>,
) {
  return function SuspendedPanel(props: P) {
    return (
      <Suspense fallback={<p className="muted">Đang tải…</p>}>
        <Component {...props} />
      </Suspense>
    );
  };
}
const MaterialsPanel = Suspended(
  lazy(() =>
    import("./detail-materials").then((m) => ({ default: m.MaterialsPanel })),
  ),
);
const ShortagePanel = Suspended(
  lazy(() =>
    import("./detail-shortage").then((m) => ({ default: m.ShortagePanel })),
  ),
);
const AssignmentForm = Suspended(
  lazy(() =>
    import("./detail-assignments").then((m) => ({ default: m.AssignmentForm })),
  ),
);
const QualityForm = Suspended(
  lazy(() =>
    import("./detail-quality").then((m) => ({ default: m.QualityForm })),
  ),
);
const ShipmentPanel = Suspended(
  lazy(() =>
    import("./detail-shipments").then((m) => ({ default: m.ShipmentPanel })),
  ),
);
const PreparationCheck = Suspended(
  lazy(() =>
    import("./detail-preparation").then((m) => ({
      default: m.PreparationCheck,
    })),
  ),
);

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
      permits(session.user, "production.create", { stage: s }) &&
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
  const [date, setDate] = useState(day());
  const [editDate, setEditDate] = useState(false);
  const embedded = !!initialOrderId && orders.length === 1;
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
  const [ratesReady, setRatesReady] = useState(false);
  useEffect(() => {
    let live = true;
    if (canSeePrice)
      void api<Rate[]>("/api/rates")
        .then((rows) => {
          if (!live) return;
          setFetchedRates(rows);
          setRatesReady(true);
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
  // Without a rate the server refuses the record, so say so before the worker types anything.
  const missingRate = canSeePrice && ratesReady && !!detail && !rate;
  const problem = !detail
    ? "Đang tải số lượng và phân công…"
    : !stage
      ? "Bạn không được nhập sản lượng ở bộ phận này."
      : !prepared(detail)
        ? "Quản lý cần hoàn tất chuẩn bị đơn trước khi sản xuất."
        : !person
          ? "Chưa có thợ được phân công cho công đoạn/phần việc này."
          : missingRate
            ? `Chưa có đơn giá ${stage}. Quản lý đặt ở tab Tiến độ → Đơn giá công đoạn rồi mới ghi sản lượng.`
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
              log_date: date,
              reason: String(form.get("reason") || "").trim() || undefined,
              incident: form.get("incident") === "on",
              record_packing: stage === "Đóng gói",
              record_rework: stage === "Sửa hàng",
              ...(workers.length === 1 ? workers[0] : { workers }),
            },
          );
          setByWorker({});
          setEditDate(false);
          setDate(day());
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
      <div className="form-grid">
        {!embedded && (
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
        )}
        {stages.length === 1 ? (
          <div className="field">
            <span>Công đoạn</span>
            <strong>{stage}</strong>
          </div>
        ) : (
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
        )}
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
          Được nhập cắt dư so với đơn (tối đa +
          {detail?.policy?.overcut_percent ?? 10}
          %).{" "}
          {detail?.policy?.overcut_paid === false
            ? "Phần dư không tính công cắt. "
            : "Phần dư vẫn tính công cắt. "}
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
      <div className="field">
        <span>Ngày làm việc</span>
        {editDate ? (
          <input
            name="date"
            type="date"
            required
            max={day()}
            min={detail?.order_date}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        ) : (
          <div className="inline-actions">
            <strong>Hôm nay, {date.split("-").reverse().join("/")}</strong>
            <Action
              type="button"
              tone="secondary"
              onClick={() => setEditDate(true)}
            >
              Làm vào ngày khác
            </Action>
          </div>
        )}
      </div>
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
      <p className="muted">
        Bạn ({session.user.name}) nhập thay cho thợ; thợ không cần đăng nhập.
      </p>
      <div className="modal-footer">
        <strong>
          {total === 0
            ? "Chưa nhập số lượng nào"
            : `Tổng lần này: ${total.toLocaleString("vi-VN")} sản phẩm`}
        </strong>
        <Action type="submit" busy={busy} disabled={!!problem || total === 0}>
          <Check size={18} />
          Ghi nhận một lần
        </Action>
      </div>
    </form>
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
  const firstTab =
    !isManagement(session.user) &&
    order.current_stage === "kiem_npl" &&
    permits(session.user, "production.create", { stage: "Kiểm NPL/Vải" })
      ? "materials"
      : !isManagement(session.user) &&
          order.current_stage === "kiem_rap" &&
          permits(session.user, "production.create", { stage: "Kiểm rập" })
        ? "pattern"
        : isManagement(session.user) || !prepared(order)
          ? "progress"
          : permits(session.user, "qc.manage", { stage: "QC" })
            ? "qc"
            : permits(session.user, "delivery.manage", { stage: "Giao hàng" })
              ? "shipments"
              : workStages.some((s) =>
                    permits(session.user, "production.create", { stage: s }),
                  )
                ? "work"
                : "progress";
  const [tab, setTab] = useState(firstTab);
  const [photos, setPhotos] = useState<PhotoDraft[]>(() =>
    photoDraftsFrom(order.photos, order.image_url),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const manager = isManagement(session.user);
  const rates = useOrderRates(order, session, api, manager);
  // Rates are fixed before production, so the order cannot leave preparation without a cutting rate.
  const rateBlock =
    manager && rates.ready && rates.canPrice && !rates.cutPriced
      ? "Đặt đơn giá Cắt ở mục “Đơn giá công đoạn” (tab Tiến độ) trước khi hoàn tất chuẩn bị."
      : "";
  async function move(change: { stage: string } | { prepare: true }) {
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
  }
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
  const allTabs = [
    { id: "progress", label: "Tiến độ" },
    { id: "assignments", label: "Phân công" },
    ...(permits(session.user, "orders.edit", { stage: "nhan_don" }) ||
    permits(session.user, "production.create", { stage: "Cắt" }) ||
    permits(session.user, "production.create", { stage: "Kiểm NPL/Vải" })
      ? [{ id: "materials", label: "NPL/Vải" }]
      : []),
    { id: "pattern", label: "Kiểm rập" },
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
        workStages.some((s) =>
          permits(session.user, "production.create", { stage: s }),
        ),
    )
    .filter(
      (t) =>
        t.id !== "qc" || permits(session.user, "qc.manage", { stage: "QC" }),
    );
  // The tab a person works in most comes first, so it is the first thing they see.
  const tabs = [
    ...allTabs.filter((t) => t.id === firstTab),
    ...allTabs.filter((t) => t.id !== firstTab),
  ];
  return (
    <div className="stack department-detail">
      <div className="order-detail-heading">
        <ProductPhotoGallery
          photos={order.photos}
          fallbackUrl={order.image_url}
          name={order.product_name}
        />
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
            Đơn đang ở bước:{" "}
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
            onClick={(e) => {
              setTab(t.id);
              // Tabs share one scrolling row; bring the picked one fully into view.
              e.currentTarget.scrollIntoView({
                block: "nearest",
                inline: "nearest",
                behavior: "smooth",
              });
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <ErrorNotice error={error} />
      {tab === "progress" && (
        <>
          {manager && (
            <>
              <NextStep
                order={order}
                onGo={setTab}
                busy={busy}
                rateBlock={rateBlock}
                onPrepare={
                  transitionPermissionProblem(session.user, order)
                    ? undefined
                    : () => void move({ prepare: true })
                }
              />
              <RatesSetup
                order={order}
                session={session}
                api={api}
                rates={rates}
                onChanged={onChanged}
              />
            </>
          )}
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
          <p className="muted desktop-hint">
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
            rateBlock={rateBlock}
            onMove={move}
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
        <>
          <QualityForm
            order={order}
            session={session}
            api={api}
            onChanged={onChanged}
          />
          <h3>Lỗi đã quy cho thợ ({order.defects?.length || 0})</h3>
          {order.defects?.slice(0, 20).map((d) => (
            <p key={d.id}>
              <strong>{d.employee_name}</strong> ({d.stage}) · {d.color} /{" "}
              {d.size}: {d.quantity} sản phẩm lỗi
            </p>
          ))}
          {!order.defects?.length && (
            <Empty>Chưa quy lỗi nào cho thợ trong đơn này.</Empty>
          )}
        </>
      )}
      {tab === "materials" && (
        <div className="stack">
          <PreparationCheck
            stage="Kiểm NPL/Vải"
            order={order}
            session={session}
            api={api}
            employees={employees}
            onChanged={onChanged}
          />
          <PrepareCallout
            stage="kiem_npl"
            order={order}
            session={session}
            busy={busy}
            rateBlock={rateBlock}
            onPrepare={() => void move({ prepare: true })}
          />
          <MaterialsPanel
            order={order}
            session={session}
            api={api}
            onChanged={onChanged}
          />
        </div>
      )}
      {tab === "pattern" && (
        <div className="stack">
          <PreparationCheck
            stage="Kiểm rập"
            order={order}
            session={session}
            api={api}
            employees={employees}
            onChanged={onChanged}
          />
          <PrepareCallout
            stage="kiem_rap"
            order={order}
            session={session}
            busy={busy}
            rateBlock={rateBlock}
            onPrepare={() => void move({ prepare: true })}
          />
        </div>
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
              const uploaded = await resolvePhotos(photos, session);
              await api(
                `/api/orders/${encodeURIComponent(order.id)}`,
                {
                  version: order.version,
                  customer: f.get("customer"),
                  product_code: f.get("product_code"),
                  deadline: f.get("deadline"),
                  notes: f.get("notes"),
                  photos: uploaded,
                  responsible_id: f.get("responsible") || null,
                },
                "PATCH",
              );
              setPhotos(
                photoDraftsFrom(
                  uploaded.map((p, position) => ({
                    id: position,
                    position,
                    ...p,
                  })),
                ),
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
          <ProductPhotosField
            photos={photos}
            onChange={setPhotos}
            colors={(order.variants || []).map((v) => v.color)}
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
  rateBlock,
  onMove,
}: {
  order: Detail;
  session: SessionInfo;
  busy: boolean;
  rateBlock: string;
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
    <div
      className="field"
      role="group"
      aria-label="Chuyển đơn sang bước kế tiếp"
    >
      <span>Chuyển đơn sang bước kế tiếp</span>
      <div className="inline-actions">
        {preparing && (
          <Action
            type="button"
            busy={busy}
            disabled={!!blocked || !!rateBlock}
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
          (preparing && rateBlock) ||
          (next.length
            ? preparing
              ? "Hoàn tất chuẩn bị chuyển qua Kiểm NPL/Vải và Kiểm rập trong một lần; lịch sử từng bước vẫn được lưu."
              : "Chuyển bước chỉ điều phối, không tạo số lượng."
            : "Chưa đủ điều kiện chuyển sang bước tiếp theo.")}
      </small>
      {preparing && !order.materials?.items.length && (
        <small>
          Chưa khai báo NPL/vải cho đơn này. Nếu đơn cần kiểm vải, khai báo ở
          tab NPL/Vải trước khi hoàn tất chuẩn bị.
        </small>
      )}
    </div>
  );
}

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

/** Latest recorded result of a preparation stage, or undefined when it has not been checked. */
const lastCheck = (order: Detail, stage: "kiem_npl" | "kiem_rap") =>
  (order.checks || []).filter((c) => c.stage === stage).at(-1);

/**
 * Recording a check does not move the order: several rounds (proto, fit, PPS…) may be needed.
 * Once a round passes, this offers the move right where the checker is standing.
 */
function PrepareCallout({
  stage,
  order,
  session,
  busy,
  rateBlock,
  onPrepare,
}: {
  stage: "kiem_npl" | "kiem_rap";
  order: Detail;
  session: SessionInfo;
  busy: boolean;
  rateBlock: string;
  onPrepare: () => void;
}) {
  const last = lastCheck(order, stage);
  if (!last || !PREPARATION_STAGES.includes(order.current_stage)) return null;
  const name = stage === "kiem_rap" ? "Kiểm rập" : "Kiểm NPL/Vải";
  const here = LUUTA_STAGES.find((s) => s.key === order.current_stage)?.label;
  if (last.result === "khong_dat")
    return (
      <div className="entry-guidance" role="status">
        <p>
          <strong>Lượt {name} gần nhất chưa đạt.</strong> Sửa rồi ghi thêm một
          lượt kiểm mới; đơn vẫn ở bước {here}.
        </p>
      </div>
    );
  const blocked = transitionPermissionProblem(session.user, order);
  if (!isManagement(session.user) || blocked)
    return (
      <div className="entry-guidance" role="status">
        <p>
          <strong>Đã ghi kết quả {name}: đạt.</strong> Đơn vẫn ở bước {here} cho
          tới khi quản lý bấm “Hoàn tất chuẩn bị → Cắt”.
        </p>
      </div>
    );
  return (
    <div className="entry-guidance prepare-callout" role="status">
      <p>
        <strong>{name} đã đạt.</strong> Ghi kết quả không tự chuyển bước (có thể
        cần kiểm thêm lượt khác). Khi đã sẵn sàng cắt, bấm nút dưới đây — đơn
        đang ở bước {here}.
      </p>
      <Action
        type="button"
        busy={busy}
        disabled={!!rateBlock}
        onClick={onPrepare}
      >
        <Check size={18} />
        Hoàn tất chuẩn bị → Cắt
      </Action>
      {rateBlock && <small>{rateBlock}</small>}
    </div>
  );
}

function NextStep({
  order,
  onGo,
  onPrepare,
  busy,
  rateBlock,
}: {
  order: Detail;
  onGo: (tab: string) => void;
  onPrepare?: () => void;
  busy?: boolean;
  rateBlock?: string;
}) {
  if (order.status === "completed") return null;
  const unassigned = assignmentStages.filter(
    (st) =>
      (!preparationStages.includes(st) || !prepared(order)) &&
      !(order.assignments || []).some(
        (a) => a.active === 1 && a.stage === st,
      ) &&
      !(order.work_items || []).some((w) => w.stage === st),
  );
  const variants = order.variants || [];
  const shortage = variants.reduce(
    (n, v) => n + Math.max(0, v.quantity - v.delivered_qty),
    0,
  );
  const left = daysLeft(order.deadline);
  let text = "";
  let tab = "";
  let label = "";
  let prepare = false;
  const checked = (key: string) =>
    (order.checks || []).some((c) => c.stage === key);
  const failed =
    (order.current_stage === "kiem_npl" ||
      order.current_stage === "kiem_rap") &&
    lastCheck(order, order.current_stage)?.result === "khong_dat";
  if (order.current_stage === "kiem_npl" && !checked("kiem_npl")) {
    text =
      "Đơn đang ở bước Kiểm NPL/Vải. Ghi kết quả kiểm vải và phụ liệu trước khi chuẩn bị cắt.";
    tab = "materials";
    label = "Ghi kết quả Kiểm NPL/Vải";
  } else if (order.current_stage === "kiem_rap" && !checked("kiem_rap")) {
    text =
      "Đơn đang ở bước Kiểm rập. Ghi kết quả kiểm rập (phiên bản, số mảnh, bảng đo) trước khi cắt.";
    tab = "pattern";
    label = "Ghi kết quả Kiểm rập";
  } else if (failed) {
    text =
      "Lượt kiểm gần nhất chưa đạt. Sửa rồi ghi thêm một lượt kiểm mới trước khi cắt.";
    tab = order.current_stage === "kiem_rap" ? "pattern" : "materials";
    label = "Ghi lượt kiểm mới";
  } else if (!prepared(order) && order.current_stage !== "hoan_thanh") {
    prepare = true;
    if (order.current_stage === "nhan_don") {
      text =
        "Đơn mới nhận. Giao thợ cho từng công đoạn, khai báo vải nếu cần, rồi bấm “Hoàn tất chuẩn bị → Cắt” để bắt đầu sản xuất.";
      tab = "assignments";
      label = "Giao thợ cho công đoạn";
    } else {
      text = `Đã có kết quả kiểm đạt. Ghi kết quả không tự chuyển bước — bấm “Hoàn tất chuẩn bị → Cắt” để đưa đơn vào sản xuất.${unassigned.length ? ` Còn chưa giao thợ cho: ${unassigned.join(", ")}.` : ""}`;
      if (unassigned.length) {
        tab = "assignments";
        label = "Giao thợ";
      }
    }
  } else if (unassigned.length) {
    text = `Chưa giao thợ cho: ${unassigned.join(", ")}. Chưa giao thì chưa nhập được sản lượng.`;
    tab = "assignments";
    label = "Giao thợ";
  } else if (variants.length && shortage === 0) {
    text =
      "Đã giao đủ số lượng. Có thể bấm “Chuyển sang Hoàn thành” ở cuối trang.";
  } else if (left < 0) {
    text = `Đơn đã trễ hạn ${-left} ngày, còn ${shortage} sản phẩm chưa giao. Bấm số ở cột Thiếu để ghi nguyên nhân giải trình với khách.`;
  } else {
    text = `Còn ${shortage} sản phẩm chưa giao, hạn giao ${left === 0 ? "là hôm nay" : `còn ${left} ngày`}.`;
  }
  return (
    <div className="entry-guidance" role="status">
      <p>
        <strong>Việc tiếp theo:</strong> {text}
      </p>
      {(tab || (prepare && onPrepare)) && (
        <div className="inline-actions">
          {prepare && onPrepare && (
            <Action
              type="button"
              busy={busy}
              disabled={!!rateBlock}
              onClick={onPrepare}
            >
              <Check size={18} />
              Hoàn tất chuẩn bị → Cắt
            </Action>
          )}
          {tab && (
            <Action type="button" tone="secondary" onClick={() => onGo(tab)}>
              {label}
            </Action>
          )}
        </div>
      )}
    </div>
  );
}
// Stage times are stored as Vietnam local "YYYY-MM-DD HH:mm:ss"; only ISO values need conversion.

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

type Workload = { label: string; todo: number; done: string };
/** What one department still has to do on an order, in plain words. */

function workload(department: string, o: Order): Workload {
  const vs = o.variants || [];
  const sum = (f: (v: OrderVariant) => number) =>
    vs.reduce((n, v) => n + f(v), 0);
  const total = o.total_quantity;
  if (department === "cutting")
    return {
      label: "Cần cắt thêm",
      todo: sum((v) => Math.max(0, v.quantity - v.cut_qty)),
      done: `Đã cắt ${sum((v) => v.cut_qty)}/${total}`,
    };
  if (department === "sewing")
    return {
      label: "Có thể may ngay",
      todo:
        sum((v) => Math.max(0, sewLimit(v) - v.sewn_qty)) +
        sum((v) => remainingOperation(v, "rework")),
      done: `Đã may ${sum((v) => v.sewn_qty)}/${total}`,
    };
  if (department === "quality")
    return {
      label: "Chờ kiểm",
      todo:
        sum((v) => remainingOperation(v, "qc")) +
        sum((v) => remainingOperation(v, "reinspect")),
      done: `QC đạt ${sum((v) => v.qc_passed_qty)}/${total}`,
    };
  if (department === "packing")
    return {
      label: "Chờ đóng gói",
      todo: sum((v) => remainingOperation(v, "pack")),
      done: `Đã đóng gói ${sum((v) => v.packed_qty)}/${total}`,
    };
  if (department === "delivery")
    return {
      label: "Chờ giao",
      todo: sum((v) => remainingOperation(v, "deliver")),
      done: `Đã giao ${sum((v) => v.delivered_qty)}/${total}`,
    };
  return {
    label: "Còn phải giao",
    todo: sum((v) => Math.max(0, v.quantity - v.delivered_qty)),
    done: `Đã giao ${sum((v) => v.delivered_qty)}/${total}`,
  };
}

const ACTION_BY_DEPARTMENT: Record<string, string> = {
  cutting: "Ghi sản lượng",
  sewing: "Ghi sản lượng",
  packing: "Ghi sản lượng",
  quality: "Kiểm hàng",
  delivery: "Ghi giao hàng",
};

const daysLeft = (deadline: string) =>
  Math.round((Date.parse(deadline) - Date.parse(day())) / 86400000);

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
  const matches = (o: Order) =>
    o.status !== "completed" &&
    `${o.id} ${o.product_name} ${o.customer}`
      .toLocaleLowerCase("vi")
      .includes(search.toLocaleLowerCase("vi"));
  const rows = orders
    .filter(
      (o) =>
        matches(o) &&
        (!department ||
          department === departmentFor(o.current_stage) ||
          workload(department, o).todo > 0),
    )
    .map((o) => ({ o, w: workload(department, o) }))
    .sort(
      (a, b) =>
        Number(b.w.todo > 0) - Number(a.w.todo > 0) ||
        a.o.deadline.localeCompare(b.o.deadline),
    );
  const elsewhere = orders.filter(matches).length - rows.length;
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / 20)));
  const action = ACTION_BY_DEPARTMENT[department] || "Mở đơn";
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
        <table className="mobile-stack-table">
          <thead>
            <tr>
              <th>Đơn / sản phẩm</th>
              <th>Hạn giao</th>
              <th>Việc cần làm</th>
              <th>Đơn đang ở bước</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice((current - 1) * 20, current * 20).map(({ o, w }) => {
              const left = daysLeft(o.deadline);
              return (
                <tr key={o.id}>
                  <td data-label="Đơn / sản phẩm">
                    <strong>{o.product_name}</strong>
                    <p>
                      {o.id} · {o.customer}
                    </p>
                  </td>
                  <td data-label="Hạn giao">
                    {o.deadline.split("-").reverse().join("/")}
                    <p>
                      <span
                        className={`status ${left < 0 ? "delayed" : left <= 3 ? "at_risk" : "on_track"}`}
                      >
                        {left < 0
                          ? `Trễ ${-left} ngày`
                          : left === 0
                            ? "Hôm nay"
                            : `Còn ${left} ngày`}
                      </span>
                    </p>
                  </td>
                  <td data-label="Việc cần làm">
                    <strong>
                      {w.label}: {w.todo.toLocaleString("vi-VN")}
                    </strong>
                    <p className="muted">{w.done}</p>
                  </td>
                  <td data-label="Đơn đang ở bước">
                    {LUUTA_STAGES.find((s) => s.key === o.current_stage)?.label}
                  </td>
                  <td data-label="Thao tác">
                    <Action
                      tone={w.todo > 0 ? "primary" : "secondary"}
                      onClick={() => onOpen(o.id)}
                    >
                      <ClipboardList size={18} />
                      {action}
                    </Action>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <Empty>
          {department
            ? `Chưa có đơn nào đến lượt ${departmentName(department)}.`
            : "Chưa có đơn nào đang chạy."}
          {elsewhere > 0 &&
            ` Có ${elsewhere} đơn khác đang ở bước khác; khi đến lượt sẽ hiện ở đây.`}
        </Empty>
      )}
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
      <div className="panel-toolbar staff-toolbar">
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
        medium
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
      <div className="form-grid">
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
        <Field label="Trạng thái">
          <select name="active" defaultValue={employee?.active ?? 1}>
            <option value={1}>Đang làm</option>
            <option value={0}>Ngừng làm</option>
          </select>
        </Field>
      </div>
      <fieldset>
        <legend>Bộ phận</legend>
        <div className="check-grid">
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
        </div>
      </fieldset>
      <Action type="submit" busy={busy} disabled={!ids.length}>
        Lưu hồ sơ
      </Action>
    </form>
  );
}
