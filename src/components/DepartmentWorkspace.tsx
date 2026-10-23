"use client";
import {
  useEffect,
  useState,
  lazy,
  Suspense,
  ComponentType,
  LazyExoticComponent,
  ReactNode,
} from "react";
import {
  Check,
  ClipboardList,
  Plus,
  Users,
  Pencil,
  Trash2,
  Copy,
  Scissors,
} from "lucide-react";
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
  creditedStageBase,
  batchCode,
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
  keyFor,
  preparationStages,
  prepared,
  recordable,
  stageTime,
  useDetail,
  workStages,
  unrecordedDelivered,
  DeliveryTable,
  outputStages,
  OUTPUT_STAGE_OF,
  scopeLabel,
  inScope,
} from "./order-detail-shared";
import { DateInput } from "./DateInput";

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
  // Start on an order that still has output to record; one in preparation cannot take any.
  const [id, setId] = useState(() => {
    const open = orders.filter((o) => o.status !== "completed");
    const ready = open.filter(prepared);
    const pending = ready.find((o) =>
      outputStages.some((s) =>
        (o.variants || []).some((v) => recordable(v, s, o as Detail) > 0),
      ),
    );
    return initialOrderId || (pending || ready[0] || open[0])?.id || "";
  });
  // Bumped after adding a helper, so the order is read again with its new assignment.
  const [reload, setReload] = useState(0);
  const loaded = useDetail(
    api,
    id,
    orders.find((o) => o.id === id)?.version,
    reload,
  );
  const detail = loaded.data;
  const stages = outputStages.filter(
    (s) =>
      permits(session.user, "production.create", { stage: s }) &&
      departmentAccess(session.user, departmentFor(s)),
  );
  // What each stage can still take on this order, so the form follows the order's real progress.
  const stageLeft = (s: string) => {
    if (!detail) return 0;
    const stageParts = detail.work_items?.filter((p) => p.stage === s) || [];
    const left = (partId?: number) =>
      (detail.variants || []).reduce(
        (n, v) => n + recordable(v, s, detail, partId),
        0,
      );
    return stageParts.length
      ? Math.max(...stageParts.map((p) => left(p.id)))
      : left();
  };
  // "Nothing to record" means two different things: the stage is finished, or its input has not arrived.
  const stageNote = (s: string) => {
    const left = stageLeft(s);
    if (left > 0) return `còn ${left}`;
    if (s === "Sửa hàng") return "không có hàng cần sửa";
    const sample = detail?.variants || [];
    if (s === "Kiểm NPL/Vải" || s === "Kiểm rập") return "đã ghi đủ";
    if (s === "QC" || s === "Giao hàng")
      return sample.some((v) => (creditedStageBase(s, v) || 0) > 0)
        ? "đã ghi đủ"
        : s === "QC"
          ? "chưa kiểm cái nào"
          : "chưa giao cái nào";
    const field =
      s === "Cắt" ? "cut_qty" : s === "May" ? "sewn_qty" : "packed_qty";
    const done = (detail?.variants || []).every((v) => v[field] >= v.quantity);
    return done ? "đã đủ" : "chưa có hàng tới";
  };
  const [stageValue, setStage] = useState("");
  const here = stages.find(
    (s) => s === OUTPUT_STAGE_OF[detail?.current_stage || ""],
  );
  // Default to the order's current stage, or failing that the first stage with work left.
  const stage = stages.includes(stageValue)
    ? stageValue
    : (here && stageLeft(here) > 0 ? here : undefined) ||
      stages.find((s) => stageLeft(s) > 0) ||
      here ||
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
  // Whoever is assigned, their own department aside: a helper lent to the stage counts too.
  const people = employees.filter(
    (e) => e.active !== 0 && assigned.some((a) => a.employee_id === e.id),
  );
  const canAssign =
    !!stage && permits(session.user, "production.assign", { stage });
  const [adding, setAdding] = useState(false);
  const [helperSearch, setHelperSearch] = useState("");
  // Department first, then (for Management) everyone else who could lend a hand.
  const candidates = employees
    .filter(
      (e) =>
        e.active !== 0 &&
        !assigned.some((a) => a.employee_id === e.id) &&
        (isManagement(session.user) ||
          e.department_ids?.includes(departmentFor(stage))) &&
        e.name
          .toLocaleLowerCase("vi")
          .includes(helperSearch.toLocaleLowerCase("vi")),
    )
    .sort(
      (a, b) =>
        Number(!!b.department_ids?.includes(departmentFor(stage))) -
        Number(!!a.department_ids?.includes(departmentFor(stage))),
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
  const [incident, setIncident] = useState(false);
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
  // A worker given certain colours or sizes sees just those lines, unless asked for the rest.
  const scopeFor = (employeeId: string) =>
    assigned.find((a) => a.employee_id === employeeId);
  const [allLines, setAllLines] = useState(false);
  const scoped = !!scopeLabel(scopeFor(person));
  const lines =
    scoped && !allLines
      ? rows.filter((v) => inScope(scopeFor(person), v))
      : rows;
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
  // Nothing left anywhere on this stage: say why instead of offering boxes that cannot be saved.
  const empty = !!detail && !!stage && rows.every((v) => v.limit === 0);
  const problem = !detail
    ? "Đang tải số lượng và phân công…"
    : !stage
      ? "Bạn không được nhập sản lượng ở bộ phận này."
      : !prepared(detail) && !preparationStages.includes(stage)
        ? "Quản lý cần hoàn tất chuẩn bị đơn trước khi sản xuất."
        : !person
          ? canAssign
            ? "Chưa có thợ cho công đoạn này. Bấm “Thêm thợ” để chọn người làm."
            : "Chưa có thợ được phân công cho công đoạn/phần việc này."
          : empty
            ? stage === "Sửa hàng"
              ? "Chưa có hàng lỗi chờ sửa. QC phải ghi số lỗi ở tab Kiểm QC thì mới có hàng để sửa."
              : `${stage}: ${stageNote(stage)}, không còn gì để ghi.`
            : missingRate
              ? `Chưa có đơn giá ${stage}. Quản lý đặt ở tab Tiến độ → Đơn giá công đoạn rồi mới ghi sản lượng.`
              : invalid
                ? "Có số lượng vượt mức còn lại hoặc không phải số nguyên."
                : "";
  /** Assigns one more worker to this stage of the order and selects them for entry. */
  async function addHelper(employeeId: string) {
    if (!detail) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/orders/${encodeURIComponent(id)}/assignments`, {
        version: detail.version,
        stage,
        work_item_id: part || undefined,
        employee_ids: [...assigned.map((a) => a.employee_id), employeeId],
      });
      setAdding(false);
      setPerson(employeeId);
      setReload((n) => n + 1);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
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
          setIncident(false);
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
                // A stage picked for the previous order says nothing about this one.
                setStage("");
                setByWorker({});
                setPart(0);
                setPerson("");
              }}
            >
              {orders
                .filter((o) => o.status !== "completed")
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id} · {o.product_name} —{" "}
                    {prepared(o)
                      ? LUUTA_STAGES.find((s) => s.key === o.current_stage)
                          ?.label
                      : "đang chuẩn bị"}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {stages.length === 1 ? (
          <div className="field">
            <span>Công đoạn</span>
            <strong>
              {stage}
              {detail && ` · ${stageNote(stage)}`}
            </strong>
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
                <option key={s} value={s}>
                  {s}
                  {detail && ` · ${stageNote(s)}`}
                </option>
              ))}
            </select>
          </Field>
        )}
        {!embedded && detail && (
          <p className="order-context">
            Đơn đang ở bước{" "}
            <strong>
              {LUUTA_STAGES.find((s) => s.key === detail.current_stage)?.label}
            </strong>
            {(
              [
                ["Cắt", "cut_qty"],
                ["May", "sewn_qty"],
                ["QC đạt", "qc_passed_qty"],
                ["Đóng gói", "packed_qty"],
                ["Đã giao", "delivered_qty"],
              ] as const
            ).map(([label, field]) => (
              <span key={field}>
                {label}{" "}
                <b>
                  {(detail.variants || []).reduce((n, v) => n + v[field], 0)}/
                  {detail.total_quantity}
                </b>
              </span>
            ))}
          </p>
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
      {detail && !!stage && (!!people.length || canAssign) && (
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
                <span>
                  {p.name}
                  {scopeLabel(scopeFor(p.id)) && (
                    <small> · {scopeLabel(scopeFor(p.id))}</small>
                  )}
                </span>
                <strong>
                  {workerTotal(p.id)
                    ? `${workerTotal(p.id).toLocaleString("vi-VN")} sản phẩm`
                    : "Chưa nhập"}
                </strong>
              </button>
            ))}
            {canAssign && (
              <button
                type="button"
                className="rate-stage-card add-helper"
                aria-expanded={adding}
                onClick={() => {
                  setAdding(!adding);
                  setHelperSearch("");
                }}
              >
                <span>
                  <Plus size={18} aria-hidden="true" /> Thêm thợ
                </span>
                <strong>
                  {people.length ? "người phụ thêm" : "chưa có ai"}
                </strong>
              </button>
            )}
          </div>
          {adding && (
            <div className="helper-picker">
              <input
                type="search"
                aria-label="Tìm thợ để thêm"
                placeholder="Tìm tên thợ…"
                value={helperSearch}
                onChange={(e) => setHelperSearch(e.target.value)}
              />
              <div className="size-chips">
                {candidates.slice(0, 40).map((e) => (
                  <button
                    type="button"
                    key={e.id}
                    disabled={busy}
                    onClick={() => void addHelper(e.id)}
                  >
                    {e.name}
                    {!e.department_ids?.includes(departmentFor(stage)) && (
                      <small>
                        {" · "}
                        {e.department_ids?.length
                          ? departmentName(e.department_ids[0])
                          : "chưa có bộ phận"}
                      </small>
                    )}
                  </button>
                ))}
              </div>
              {!candidates.length && (
                <p className="muted">Không còn thợ nào để thêm.</p>
              )}
            </div>
          )}
        </div>
      )}
      {problem && (
        <div className="entry-guidance">
          <p>{problem}</p>
          {!person && detail && onAssign && !canAssign && (
            <Action type="button" tone="secondary" onClick={() => onAssign(id)}>
              <Users size={18} />
              Mở đơn để phân công
            </Action>
          )}
        </div>
      )}
      {stage === "Cắt" && (
        <p className="muted desktop-hint">
          Được cắt dư tối đa +{detail?.policy?.overcut_percent ?? 10}%
          {detail?.policy?.overcut_paid === false
            ? ", phần dư không tính công."
            : ", phần dư vẫn tính công."}
        </p>
      )}
      {!empty && (
        <div className="fill-row">
          <strong>
            Số lượng theo màu / size
            {people.length > 1 &&
              ` · ${people.find((p) => p.id === person)?.name || ""}`}
            {scoped && (
              <button
                type="button"
                className="link-button lines-toggle"
                onClick={() => setAllLines(!allLines)}
              >
                {allLines
                  ? `Chỉ phần được giao (${scopeLabel(scopeFor(person))})`
                  : "Hiện cả màu / size khác"}
              </button>
            )}
          </strong>
          <div className="fill-actions">
            <Action
              type="button"
              tone="secondary"
              onClick={() =>
                setAmounts(
                  Object.fromEntries(
                    lines.map((v) => [keyFor(v), v.remaining]),
                  ),
                )
              }
            >
              Điền tối đa
            </Action>
            <Action
              type="button"
              tone="secondary"
              onClick={() => setAmounts({})}
            >
              Xóa số
            </Action>
          </div>
        </div>
      )}
      {empty ? null : (
        <QuantityGrid
          rows={lines}
          amounts={amounts}
          onChange={setAmounts}
          overcut={stage === "Cắt"}
        />
      )}
      {canSeePrice && (
        <div className="pay-preview">
          {rate ? (
            <>
              <span>Đơn giá {money(rate.unit_price)} / sản phẩm</span>
              <strong>{money(rate.unit_price * total)}</strong>
            </>
          ) : (
            // The reason is already given above when it blocks the entry.
            !missingRate && (
              <span>Chưa cấu hình đơn giá cho công đoạn/phần việc này.</span>
            )
          )}
        </div>
      )}
      <div className="field">
        <span>Ngày làm việc</span>
        {editDate ? (
          <DateInput
            name="date"
            label="Ngày làm việc"
            required
            max={day()}
            value={date}
            onChange={setDate}
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
        <input
          type="checkbox"
          name="incident"
          checked={incident}
          onChange={(e) => setIncident(e.target.checked)}
        />
        Có sự cố cần giải trình
      </label>
      {incident && (
        <Field label="Nguyên nhân sự cố">
          <textarea name="reason" maxLength={2000} required />
        </Field>
      )}
      <div className="modal-footer">
        <strong>
          {total === 0
            ? "Chưa nhập số lượng nào"
            : `Tổng lần này: ${total.toLocaleString("vi-VN")} sản phẩm`}
          {/* The reason is also at the top, but that is off screen once the form is scrolled. */}
          {total > 0 && invalid && (
            <small className="over-limit">
              Có ô vượt số còn lại, sửa lại mới ghi được.
            </small>
          )}
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
  initialTab,
  onDeleted,
  onDuplicate,
}: {
  order: Order;
  session: SessionInfo;
  api: Api;
  employees: Employee[];
  lines: Line[];
  onChanged: () => Promise<void>;
  /** Tab to land on when the caller already knows what the person came to do. */
  initialTab?: string;
  /** Called after the order is deleted, to close the dialog and reload the list. */
  onDeleted?: () => Promise<void>;
  /** Opens a new order prefilled from this one (a repeat batch of the same garment). */
  onDuplicate?: (order: Order) => void;
}) {
  const order = raw as Detail;
  // The received date shown in Sửa thông tin; it also bounds the deadline picker.
  const [received, setReceived] = useState(order.order_date);
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
  const [tabValue, setTab] = useState(initialTab || firstTab);
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
  const ratesPanel = (
    <RatesSetup
      order={order}
      session={session}
      api={api}
      rates={rates}
      onChanged={onChanged}
    />
  );
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
  const tab = allTabs.some((t) => t.id === tabValue) ? tabValue : firstTab;
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
          {/* Pieces move on at different speeds (part of an order is often delivered early),
              so the counts say more than the single stage label. */}
          <p className="order-progress">
            <span>
              Đã giao{" "}
              <b>
                {totals.delivered}/{order.total_quantity}
              </b>
            </span>
            <span>Đóng gói {totals.packed}</span>
            <span>QC đạt {totals.qc}</span>
            <span>May {totals.sewn}</span>
            <span>Cắt {totals.cut}</span>
          </p>
          {permits(session.user, "orders.create", { stage: "nhan_don" }) && (
            <div className="batch-actions">
              {onDuplicate && (
                <button
                  type="button"
                  className="batch-btn"
                  onClick={() => onDuplicate(order)}
                >
                  <Copy size={16} aria-hidden="true" />
                  Nhân bản đơn
                </button>
              )}
              {order.status !== "completed" &&
                permits(session.user, "orders.edit", { stage: "nhan_don" }) && (
                  <SplitOrder order={order} api={api} onChanged={onChanged} />
                )}
            </div>
          )}
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
              {ratesPanel}
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
          <StageTimeline order={order} />
          <VariantTable
            order={order}
            session={session}
            api={api}
            onChanged={onChanged}
          />
          <h3>Lịch sử giao hàng ({order.shipments?.length || 0} đợt)</h3>
          <DeliveryTable order={order} />
          {!order.shipments?.length && !unrecordedDelivered(order) && (
            <Empty>Chưa có đợt giao. Ghi tại tab Đợt giao.</Empty>
          )}
          <StageMover
            order={order}
            session={session}
            busy={busy}
            rateBlock={rateBlock}
            onMove={move}
          />
          {order.status !== "completed" &&
            totals.delivered > 0 &&
            totals.delivered < order.total_quantity &&
            isManagement(session.user) &&
            permits(session.user, "orders.override", {}) && (
              <CloseShort order={order} api={api} onChanged={onChanged} />
            )}
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
            employees={employees}
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
            ratesPanel={ratesPanel}
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
            ratesPanel={ratesPanel}
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
                  order_date: f.get("order_date"),
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
          <div className="form-grid">
            <Field
              label="Ngày nhận đơn"
              hint="Ngày xưởng nhận đơn thật, không phải ngày nhập vào hệ thống. Ghi sản lượng vào ngày sớm hơn thì ngày nhận tự lùi theo."
            >
              <DateInput
                name="order_date"
                required
                max={day()}
                value={received}
                onChange={setReceived}
              />
            </Field>
            <Field label="Hạn giao">
              <DateInput
                name="deadline"
                required
                defaultValue={order.deadline}
                min={received}
              />
            </Field>
          </div>
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
      {tab === "edit" && isAdmin(session.user) && onDeleted && (
        <DeleteOrder order={order} api={api} onDeleted={onDeleted} />
      )}
    </div>
  );
}

/**
 * Moves part of an order to a new batch at any time. Only pieces nobody has worked on can move,
 * so the form shows that limit per colour–size and offers the two usual choices in one tap.
 */
function SplitOrder({
  order,
  api,
  onChanged,
}: {
  order: Detail;
  api: Api;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [code, setCode] = useState("");
  const [deadline, setDeadline] = useState(order.deadline);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const rows = (order.variants || []).map((v) => {
    const paid = (order.work_totals || [])
      .filter((r) => r.color === v.color && r.size === v.size)
      .reduce((m, r) => Math.max(m, r.quantity), 0);
    const started = Math.max(
      v.cut_qty,
      v.sewn_qty,
      (v as { qc_inspected_qty?: number }).qc_inspected_qty || 0,
      v.packed_qty,
      v.delivered_qty,
      paid,
    );
    return { v, key: keyFor(v), free: Math.max(0, v.quantity - started) };
  });
  const moving = rows.reduce(
    (n, r) => n + Math.min(amounts[r.key] || 0, r.free),
    0,
  );
  const freeTotal = rows.reduce((n, r) => n + r.free, 0);
  const left = order.total_quantity - moving;
  const fill = (part: (free: number) => number) =>
    setAmounts(Object.fromEntries(rows.map((r) => [r.key, part(r.free)])));
  return (
    <>
      <button
        type="button"
        className="batch-btn"
        onClick={() => {
          setAmounts({});
          setError("");
          setOpen(true);
        }}
      >
        <Scissors size={16} aria-hidden="true" />
        Tách đợt
      </button>
      {done && (
        <p role="status" className="rate-save-notice">
          {done}
        </p>
      )}
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={`Tách đợt từ đơn ${order.id}`}
        description="Phần tách ra thành đơn mới, chép sẵn ảnh, đơn giá, rập, NPL."
        wide
      >
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const result = await api<{ id: string; moved: number }>(
                `/api/orders/${encodeURIComponent(order.id)}/split`,
                {
                  version: order.version,
                  order_code: code.trim(),
                  deadline,
                  entries: rows
                    .filter((r) => (amounts[r.key] || 0) > 0)
                    .map((r) => ({
                      color: r.v.color,
                      size: r.v.size,
                      quantity: Math.min(amounts[r.key], r.free),
                    })),
                },
              );
              setOpen(false);
              setDone(
                `Đã tách ${result.moved} sản phẩm sang đơn ${result.id}. Tìm mã ${order.product_code} để thấy cả hai đợt.`,
              );
              await onChanged();
            } catch (err) {
              setError(message(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {freeTotal === 0 ? (
            <Empty>
              Mọi sản phẩm của đơn đã được làm ít nhất một bước, không còn phần
              nào để tách.
            </Empty>
          ) : (
            <>
              <p className="muted">
                Chỉ tách được phần <b>chưa làm</b>. Phần đã cắt, đã ghi sản
                lượng hay đã giao vẫn ở đơn này.
              </p>
              <div className="split-quick" role="group" aria-label="Điền nhanh">
                <span>Điền nhanh:</span>
                <button
                  type="button"
                  onClick={() => fill((free) => Math.floor(free / 2))}
                >
                  Chia đôi
                </button>
                <button type="button" onClick={() => fill((free) => free)}>
                  Chuyển hết
                </button>
                <button type="button" onClick={() => setAmounts({})}>
                  Xóa số
                </button>
              </div>
              <table className="split-table">
                <thead>
                  <tr>
                    <th>Màu / size</th>
                    <th className="num">Đặt</th>
                    <th className="num">Chưa làm</th>
                    <th className="num">Sang đợt mới</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td>
                        <strong>
                          {r.v.color} / {r.v.size}
                        </strong>
                      </td>
                      <td className="num">{r.v.quantity}</td>
                      <td className="num">{r.free}</td>
                      <td className="num">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={r.free}
                          disabled={!r.free}
                          aria-label={`Chuyển ${r.v.color} size ${r.v.size}`}
                          value={amounts[r.key] || ""}
                          placeholder="0"
                          onFocus={(e) => e.target.select()}
                          onChange={(e) =>
                            setAmounts({
                              ...amounts,
                              [r.key]: Math.min(
                                r.free,
                                Math.max(0, Number(e.target.value) || 0),
                              ),
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="form-grid">
                <Field
                  label="Mã đơn mới"
                  hint="Để trống thì tự đặt theo đơn này: thêm -2, -3…"
                >
                  <input
                    value={code}
                    maxLength={40}
                    pattern="[A-Za-z0-9_-]+"
                    placeholder={batchCode(order.id, [order.id])}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </Field>
                <Field label="Hạn giao đợt mới">
                  <DateInput
                    required
                    value={deadline}
                    min={order.order_date}
                    onChange={setDeadline}
                  />
                </Field>
              </div>
            </>
          )}
          <ErrorNotice error={error} />
          <div className="split-footer">
            <p>
              <span>
                Ở lại {order.id}: <b>{left}</b>
              </span>
              <span>
                Sang đợt mới: <b>{moving}</b>
              </span>
            </p>
            <Action
              type="submit"
              busy={busy}
              disabled={!moving || left < 1 || !deadline}
            >
              <Scissors size={18} />
              Tách {moving || ""} sản phẩm
            </Action>
          </div>
        </form>
      </Modal>
    </>
  );
}

/**
 * Ends an order delivered only in part, when the customer accepts the shortfall: the order is
 * completed as it stands and the reason, with what is missing per colour and size, is kept.
 */
function CloseShort({
  order,
  api,
  onChanged,
}: {
  order: Detail;
  api: Api;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const short = (order.variants || []).filter(
    (v) => v.delivered_qty < v.quantity,
  );
  const missing = short.reduce((n, v) => n + v.quantity - v.delivered_qty, 0);
  return (
    <div className="close-short">
      <span className="muted">Khách nhận thiếu và không giao thêm nữa?</span>
      <Action type="button" tone="secondary" onClick={() => setOpen(true)}>
        Chốt đơn giao thiếu
      </Action>
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={`Chốt đơn ${order.id} khi giao thiếu`}
        description={`Còn thiếu ${missing} sản phẩm so với đơn đặt.`}
      >
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(
                `/api/orders/${encodeURIComponent(order.id)}`,
                {
                  version: order.version,
                  stage: "hoan_thanh",
                  exception: true,
                  close_short: true,
                  reason: reason.trim(),
                },
                "PATCH",
              );
              setOpen(false);
              await onChanged();
            } catch (err) {
              setError(message(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <ul className="close-short-list">
            {short.map((v) => (
              <li key={`${v.color}|${v.size}`}>
                {v.color} / {v.size}: giao {v.delivered_qty}/{v.quantity},{" "}
                <strong>thiếu {v.quantity - v.delivered_qty}</strong>
              </li>
            ))}
          </ul>
          <p className="muted">
            Đơn chuyển sang Hoàn thành và không ghi thêm sản lượng được nữa.
            Phần thiếu và lý do được lưu lại trên đơn.
          </p>
          <ErrorNotice error={error} />
          <Field label="Lý do">
            <textarea
              required
              minLength={5}
              maxLength={2000}
              value={reason}
              placeholder="Ví dụ: khách đồng ý nhận 140 cái, hết vải không làm thêm"
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Action type="submit" busy={busy} disabled={reason.trim().length < 5}>
            Chốt đơn
          </Action>
        </form>
      </Modal>
    </div>
  );
}

/** Admin-only removal of a whole order; the order code is typed back so it is never one tap. */
function DeleteOrder({
  order,
  api,
  onDeleted,
}: {
  order: Detail;
  api: Api;
  onDeleted: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="danger-zone">
      <div>
        <strong>Xóa đơn hàng</strong>
        <p className="muted">
          Xóa hẳn đơn cùng sản lượng, tiền công, phân công, đợt giao và ảnh.
          Không khôi phục được.
        </p>
      </div>
      <Action type="button" tone="danger" onClick={() => setOpen(true)}>
        <Trash2 size={18} />
        Xóa đơn
      </Action>
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={`Xóa đơn ${order.id}`}
        description={order.product_name}
      >
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(
                `/api/orders/${encodeURIComponent(order.id)}`,
                { confirm: typed },
                "DELETE",
              );
              setOpen(false);
              await onDeleted();
            } catch (err) {
              setError(message(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            Mọi dữ liệu của đơn này sẽ bị xóa và không khôi phục được. Gõ mã{" "}
            <strong>{order.id}</strong> để xác nhận.
          </p>
          <ErrorNotice error={error} />
          <Field label="Mã đơn">
            <input
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
            />
          </Field>
          <Action
            type="submit"
            tone="danger"
            busy={busy}
            disabled={typed.trim() !== order.id}
          >
            Xóa vĩnh viễn
          </Action>
        </form>
      </Modal>
    </section>
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
  ratesPanel,
  onPrepare,
}: {
  stage: "kiem_npl" | "kiem_rap";
  order: Detail;
  session: SessionInfo;
  busy: boolean;
  rateBlock: string;
  /** Shown in place while the cutting rate is missing, so the block can be cleared right here. */
  ratesPanel?: ReactNode;
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
      {rateBlock ? (
        <>
          <p>
            <strong>{name} đã đạt, nhưng đơn chưa có đơn giá Cắt.</strong> Nhập
            đơn giá ngay dưới đây rồi bấm lưu; nút chuyển sang Cắt sẽ mở.
          </p>
          {ratesPanel}
        </>
      ) : (
        <p>
          <strong>{name} đã đạt.</strong> Khi sẵn sàng cắt, bấm nút dưới đây để
          chuyển đơn sang Cắt.
        </p>
      )}
      <Action
        type="button"
        busy={busy}
        disabled={!!rateBlock}
        onClick={onPrepare}
      >
        <Check size={18} />
        Hoàn tất chuẩn bị → Cắt
      </Action>
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
  // A stage needs someone only while it still has work: nobody is chased for what is finished.
  const done = (
    field:
      "cut_qty" | "sewn_qty" | "qc_passed_qty" | "packed_qty" | "delivered_qty",
  ) => (order.variants || []).every((v) => v[field] >= v.quantity);
  const finished: Record<string, boolean> = {
    Cắt: done("cut_qty"),
    May: done("sewn_qty"),
    QC: done("qc_passed_qty"),
    "Sửa hàng": !(order.variants || []).some(
      (v) => remainingOperation(v, "rework") > 0,
    ),
    "Đóng gói": done("packed_qty"),
    "Giao hàng": done("delivered_qty"),
  };
  const unassigned = assignmentStages.filter(
    (st) =>
      !finished[st] &&
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
      {prepare && onPrepare && rateBlock && (
        <small>
          Nút đang khóa vì đơn chưa có đơn giá Cắt — nhập ở ô “Đơn giá công
          đoạn” ngay bên dưới.
        </small>
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
// The order detail tab where each department does that work.
const TAB_BY_DEPARTMENT: Record<string, string> = {
  cutting: "work",
  sewing: "work",
  packing: "work",
  quality: "qc",
  delivery: "shipments",
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
  onOpen: (id: string, tab?: string) => void;
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
        <Field label="Chọn bộ phận" className="field-strong">
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
            placeholder="Tìm đơn…"
          />
        </Field>
      </div>
      <div className="table-scroll">
        <table className="mobile-stack-table dept-table">
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
                      onClick={() =>
                        onOpen(o.id, TAB_BY_DEPARTMENT[department])
                      }
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
            placeholder="Tìm tên thợ…"
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
            <option value="">Mọi bộ phận</option>
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
      <div className="table-scroll">
        <table className="mobile-stack-table staff-table">
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
                <td>
                  <strong>{e.name}</strong>
                </td>
                <td>
                  {e.department_ids?.map(departmentName).join(", ") ||
                    "Chưa phân loại"}
                </td>
                <td>
                  {e.has_account
                    ? "Có tài khoản quản lý / lịch sử"
                    : "Thợ gia công"}
                </td>
                <td>
                  <span
                    className={`status ${e.active === 0 ? "" : "on_track"}`}
                  >
                    {e.active === 0 ? "Ngừng làm" : "Đang làm"}
                  </span>
                </td>
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
