"use client";
import {
  ProductPhoto,
  ProductImagePicker,
  uploadProductImage,
} from "./ProductImage";
import { GarmentColors, SizeSelect } from "./SmartInputs";
import { createViewPreference } from "@/lib/view-preference";
import { Pagination } from "./Pagination";
import { useState, useSyncExternalStore } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Eye,
  Plus,
  List,
  Columns3,
  ArrowRight,
  Download,
  Search,
  AlertTriangle,
} from "lucide-react";
import type { SessionInfo } from "@/lib/permissions";
import { permits, hasPermission } from "@/lib/permissions";
import type { Order, Line, StageKey } from "@/lib/types";
import { LUUTA_STAGES } from "@/lib/types";
import {
  transitionProblem,
  transitionPermissionProblem,
  exceptionalTransitionProblem,
} from "@/lib/workflow";
import { type Api, message, day } from "@/lib/client";
import { Action, Field, Modal, ErrorNotice, Empty } from "./Primitives";

const viewPreference = createViewPreference(() => localStorage);
function subscribeView(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("luuta-view", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("luuta-view", callback);
  };
}
function readView() {
  return viewPreference.read();
}
function saveView(view: "list" | "board") {
  viewPreference.save(view);
  window.dispatchEvent(new Event("luuta-view"));
}
const statusLabels: Record<Order["status"], string> = {
  on_track: "Đúng tiến độ",
  at_risk: "Nguy cơ trễ",
  delayed: "Đã trễ hạn",
  completed: "Hoàn thành",
};
export function Status({ order }: { order: Order }) {
  return (
    <span className={`status ${order.status}`} title={order.risk_reason}>
      {order.status === "at_risk" || order.status === "delayed" ? (
        <AlertTriangle size={14} />
      ) : null}
      {statusLabels[order.status]}
    </span>
  );
}
export function OrderWorkspace({
  orders,
  lines,
  session,
  api,
  onOpen,
  onCreate,
  onChanged,
}: {
  orders: Order[];
  lines: Line[];
  session: SessionInfo;
  api: Api;
  onOpen: (o: Order) => void;
  onCreate: () => void;
  onChanged: () => Promise<void>;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [line, setLine] = useState("all");
  const view = useSyncExternalStore(
    subscribeView,
    readView,
    () => "list" as const,
  );
  const setView = saveView;
  const [exceptionEnabled, setExceptionEnabled] = useState(false);
  const [reason, setReason] = useState("");
  const [columnLimits, setColumnLimits] = useState<Record<string, number>>({});
  const [group, setGroup] = useState<"line" | "stage">("stage");
  const [showEmptyColumns, setShowEmptyColumns] = useState(false);
  const [move, setMove] = useState<{
    order: Order;
    target: string;
    mode: "line" | "stage";
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const filtered = orders.filter(
    (o) =>
      (line === "all" || o.line_id === Number(line)) &&
      (status === "all" ||
        (status === "running"
          ? o.status !== "completed"
          : status === "needs_attention"
            ? ["at_risk", "delayed"].includes(o.status)
            : status === "cho_qc"
              ? ["qc", "qc_lai"].includes(o.current_stage)
              : status === "cho_dong_goi"
                ? o.current_stage === "dong_goi"
                : status === "cho_giao"
                  ? o.current_stage === "giao_hang" && !o.delivered_complete
                  : status === "da_giao_du"
                    ? !!o.delivered_complete
                    : o.status === status)) &&
      [
        o.id,
        o.customer,
        o.product_name,
        ...(o.variants || []).flatMap((v) => [v.color, v.size]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  function problem(order: Order, target: string, mode: "line" | "stage") {
    const permission = mode === "line" ? "orders.assign" : "orders.move";
    if (
      !permits(session.user, permission, { lineId: order.line_id }) ||
      (mode === "line" &&
        !permits(session.user, permission, { lineId: Number(target) }))
    )
      return "Bạn không có quyền chuyển đơn đến vị trí này.";
    if (mode === "line")
      return order.status === "completed"
        ? "Đơn đã hoàn thành không thể đổi chuyền."
        : null;
    const permissionProblem = transitionPermissionProblem(session.user, order);
    if (permissionProblem) return permissionProblem;
    if (exceptionEnabled) {
      if (!permits(session.user, "orders.override", { lineId: order.line_id }))
        return "Bạn không có quyền chuyển bước ngoại lệ.";
      return exceptionalTransitionProblem(order, target as StageKey);
    }
    return transitionProblem(order, target as StageKey);
  }
  function requestMove(order: Order, target: string, mode: "line" | "stage") {
    setError("");
    const issue = problem(order, target, mode);
    if (issue) {
      setError(issue);
      return;
    }
    setReason("");
    setMove({ order, target, mode });
  }
  function drop(event: DragEndEvent) {
    if (!event.over) return;
    const order = orders.find((o) => o.id === event.active.id);
    if (!order) return;
    const target = String(event.over.id);
    if (
      target ===
      (group === "line" ? String(order.line_id) : order.current_stage)
    )
      return;
    requestMove(order, target, group);
  }
  async function confirmMove() {
    if (!move) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/orders/${move.order.id}`,
        {
          version: move.order.version,
          ...(move.mode === "line"
            ? { line_id: Number(move.target) }
            : {
                stage: move.target,
                ...(exceptionEnabled ? { exception: true, reason } : {}),
              }),
        },
        "PATCH",
      );
      setMove(null);
      await onChanged();
    } catch (e) {
      setError(message(e));
      await onChanged();
    } finally {
      setBusy(false);
    }
  }
  const columns =
    group === "line"
      ? lines.map((l) => ({ id: String(l.id), label: l.name }))
      : LUUTA_STAGES.map((s) => ({ id: s.key, label: s.label }));
  const listPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 25)));
  const visible = filtered.slice((listPage - 1) * 25, listPage * 25);
  const stageChoices = (order: Order) => (
    <select
      className="order-stage-select"
      aria-label={`Chuyển bước ${order.id}`}
      value=""
      disabled={
        !permits(session.user, "orders.move", { lineId: order.line_id })
      }
      onChange={(e) => requestMove(order, e.target.value, "stage")}
    >
      <option value="">Chuyển bước…</option>
      {LUUTA_STAGES.filter((s) => s.key !== order.current_stage).map((s) => (
        <option
          key={s.key}
          value={s.key}
          disabled={!!problem(order, s.key, "stage")}
        >
          {s.label}
          {problem(order, s.key, "stage")
            ? ` — ${problem(order, s.key, "stage")}`
            : ""}
        </option>
      ))}
    </select>
  );
  const exportParams = new URLSearchParams({
    dataset: "orders",
    search,
    status,
    ...(line !== "all" ? { line_id: line } : {}),
  });
  return (
    <section className="panel order-workspace">
      <div className="panel-toolbar">
        <div className="search-input">
          <Search size={20} />
          <input
            aria-label="Tìm đơn hàng"
            placeholder="Mã đơn, khách hàng, sản phẩm…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="inline-actions">
          {(permits(session.user, "export.data", {}) ||
            orders.some((o) =>
              permits(session.user, "export.data", { lineId: o.line_id }),
            )) && (
            <a
              className="action secondary"
              href={`/api/export/excel?${exportParams}`}
            >
              <Download size={18} />
              Excel
            </a>
          )}
          {hasPermission(session.user, "orders.create") && (
            <Action onClick={onCreate}>
              <Plus size={18} />
              Tạo đơn
            </Action>
          )}
        </div>
      </div>
      <div className="panel-toolbar">
        <div className="inline-actions">
          <select
            aria-label="Trạng thái"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="running">Đang sản xuất</option>
            <option value="needs_attention">Cần chú ý</option>
            <option value="on_track">Đúng tiến độ</option>
            <option value="at_risk">Nguy cơ trễ</option>
            <option value="delayed">Đã trễ</option>
            <option value="cho_qc">Chờ QC</option>
            <option value="cho_dong_goi">Chờ đóng gói</option>
            <option value="cho_giao">Chờ giao</option>
            <option value="da_giao_du">Đã giao đủ</option>
            <option value="completed">Hoàn thành</option>
          </select>
          <select
            aria-label="Tổ phụ trách"
            value={line}
            onChange={(e) => {
              setLine(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Tất cả tổ phụ trách</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="segmented">
          <button
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List size={18} />
            Danh sách
          </button>
          <button
            aria-pressed={view === "board"}
            onClick={() => setView("board")}
          >
            <Columns3 size={18} />
            Kanban
          </button>
        </div>
      </div>
      {(view === "list" || group === "stage") &&
        orders.some((o) =>
          permits(session.user, "orders.override", { lineId: o.line_id }),
        ) && (
          <div className="padded order-exception-toggle">
            <label className="check-label">
              <input
                type="checkbox"
                checked={exceptionEnabled}
                onChange={(e) => setExceptionEnabled(e.target.checked)}
              />{" "}
              Cho phép quay lại / nhảy bước (ngoại lệ)
            </label>
            {exceptionEnabled && (
              <p className="muted">
                Bắt buộc ghi lý do; giữ nguyên số lượng và tiền công. Hoàn thành
                vẫn cần giao đủ.
              </p>
            )}
          </div>
        )}
      <ErrorNotice error={error} />
      {view === "board" ? (
        <>
          <div className="board-heading">
            <span>Kéo tay nắm để chuyển đơn, hoặc dùng “Chuyển đến…”</span>
            <select
              aria-label="Nhóm Kanban"
              value={group}
              onChange={(e) => setGroup(e.target.value as "line" | "stage")}
            >
              <option value="line">Theo tổ phụ trách</option>
              <option value="stage">Theo bước sản xuất</option>
            </select>
          </div>
          {group === "stage" && (
            <p className="padded muted">
              QC đạt đủ → Đóng gói. Chỉ chuyển Sửa hàng → QC lại khi có sản phẩm
              lỗi.
            </p>
          )}
          <DndContext
            sensors={sensors}
            onDragEnd={drop}
            accessibility={{
              announcements: {
                onDragStart: ({ active }) => `Đang di chuyển đơn ${active.id}`,
                onDragOver: ({ over }) =>
                  over ? `Đích ${over.id}` : "Ngoài vùng thả",
                onDragEnd: ({ over }) =>
                  over ? "Mở xác nhận chuyển đơn" : "Đã hủy di chuyển",
                onDragCancel: () => "Đã hủy di chuyển",
              },
            }}
          >
            <label className="check-label mobile-board-options">
              <input
                type="checkbox"
                checked={showEmptyColumns}
                onChange={(event) => setShowEmptyColumns(event.target.checked)}
              />
              Hiện cả bước chưa có đơn
            </label>
            <div
              className={`kanban ${showEmptyColumns ? "show-empty-columns" : ""}`}
            >
              {columns.map((c) => (
                <DropColumn
                  key={c.id}
                  id={c.id}
                  label={c.label}
                  orders={filtered.filter(
                    (o) =>
                      (group === "line"
                        ? String(o.line_id)
                        : o.current_stage) === c.id,
                  )}
                  problem={(o) => problem(o, c.id, group)}
                >
                  {filtered
                    .filter(
                      (o) =>
                        (group === "line"
                          ? String(o.line_id)
                          : o.current_stage) === c.id,
                    )
                    .slice(0, columnLimits[`${group}:${c.id}`] || 10)
                    .map((o) => (
                      <DragCard
                        key={o.id}
                        order={o}
                        disabled={
                          !permits(
                            session.user,
                            group === "line" ? "orders.assign" : "orders.move",
                            { lineId: o.line_id },
                          )
                        }
                        onOpen={() => onOpen(o)}
                        columns={columns}
                        current={
                          group === "line" ? String(o.line_id) : o.current_stage
                        }
                        onMove={(target) => requestMove(o, target, group)}
                        problem={(target) => problem(o, target, group)}
                      />
                    ))}
                  {filtered.filter(
                    (o) =>
                      (group === "line"
                        ? String(o.line_id)
                        : o.current_stage) === c.id,
                  ).length > (columnLimits[`${group}:${c.id}`] || 10) && (
                    <button
                      className="action secondary"
                      onClick={() =>
                        setColumnLimits((old) => ({
                          ...old,
                          [`${group}:${c.id}`]:
                            (old[`${group}:${c.id}`] || 10) + 10,
                        }))
                      }
                    >
                      Xem thêm 10 đơn
                    </button>
                  )}
                </DropColumn>
              ))}
            </div>
          </DndContext>
        </>
      ) : (
        <>
          <div className="desktop-table table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Sản phẩm / khách</th>
                  <th>Tổ phụ trách</th>
                  <th>Số lượng</th>
                  <th>Hạn giao</th>
                  <th>Công đoạn</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <button className="text-button" onClick={() => onOpen(o)}>
                        {o.id}
                      </button>
                    </td>
                    <td>
                      <div className="product-table-cell">
                        <ProductPhoto url={o.image_url} name={o.product_name} />
                        <div>
                          <strong>{o.product_name}</strong>
                          <span className="table-subtitle">{o.customer}</span>
                        </div>
                      </div>
                    </td>
                    <td>{o.line_id}</td>
                    <td>{o.total_quantity}</td>
                    <td>{o.deadline.split("-").reverse().join("/")}</td>
                    <td>
                      {
                        LUUTA_STAGES.find((s) => s.key === o.current_stage)
                          ?.label
                      }
                      <div className="progress-track">
                        <span style={{ width: `${o.progress}%` }} />
                      </div>
                    </td>
                    <td>
                      <Status order={o} />
                      {o.delivered_complete && (
                        <span className="status on_track">Đã giao đủ</span>
                      )}
                    </td>
                    <td>
                      {stageChoices(o)}
                      <button
                        className="icon-button"
                        aria-label={`Xem ${o.id}`}
                        onClick={() => onOpen(o)}
                      >
                        <Eye size={20} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-order-list">
            {visible.map((o) => (
              <article className="mobile-order" key={o.id}>
                <div>
                  <strong>{o.id}</strong>
                  <Status order={o} />
                </div>
                <div className="mobile-order-product">
                  <ProductPhoto url={o.image_url} name={o.product_name} />
                  <div>
                    <button className="text-button" onClick={() => onOpen(o)}>
                      {o.product_name}
                    </button>
                    <p>{o.customer}</p>
                  </div>
                </div>
                <p className="mobile-order-stage">
                  {LUUTA_STAGES.find((s) => s.key === o.current_stage)?.label}
                  <span> · {Math.round(o.progress)}% hoàn thành</span>
                </p>
                <div className="muted">
                  <span>
                    Chuyền {o.line_id} · {o.total_quantity} sản phẩm
                  </span>
                  <span>Hạn {o.deadline.split("-").reverse().join("/")}</span>
                </div>
                <div className="mobile-order-actions">
                  {permits(session.user, "orders.move", {
                    lineId: o.line_id,
                  }) && stageChoices(o)}
                  <Action tone="secondary" onClick={() => onOpen(o)}>
                    <Eye size={18} /> Chi tiết
                  </Action>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {!filtered.length && <Empty>Không có đơn hàng phù hợp.</Empty>}
      {view === "list" ? (
        <Pagination
          page={listPage}
          total={filtered.length}
          onChange={setPage}
        />
      ) : (
        <div className="panel-footer">
          {filtered.length} đơn hàng · Mỗi cột hiển thị theo từng nhóm 10 đơn
        </div>
      )}
      <Modal
        open={!!move}
        onClose={() => {
          if (!busy) setMove(null);
        }}
        title="Xác nhận chuyển đơn"
        description={
          move
            ? `${move.order.id} → ${move.mode === "line" ? `Chuyền ${move.target}` : LUUTA_STAGES.find((s) => s.key === move.target)?.label}`
            : undefined
        }
      >
        <div className="stack">
          <p>
            Dữ liệu sẽ được kiểm tra lại trước khi lưu. Thao tác được ghi vào
            nhật ký hệ thống.
          </p>
          {move?.mode === "stage" && exceptionEnabled && (
            <Field label="Lý do chuyển bước ngoại lệ">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={5}
                maxLength={1000}
                required
                placeholder="VD: Báo cáo nhầm công đoạn, cần đưa về Cắt…"
              />
            </Field>
          )}
          <ErrorNotice error={error} />
          <div className="inline-actions">
            <Action
              tone="secondary"
              disabled={busy}
              onClick={() => setMove(null)}
            >
              Hủy
            </Action>
            <Action
              busy={busy}
              disabled={
                move?.mode === "stage" &&
                exceptionEnabled &&
                reason.trim().length < 5
              }
              onClick={confirmMove}
            >
              Xác nhận
              <ArrowRight size={18} />
            </Action>
          </div>
        </div>
      </Modal>
    </section>
  );
}
function DropColumn({
  id,
  label,
  orders,
  problem,
  children,
}: {
  id: string;
  label: string;
  orders: Order[];
  problem: (o: Order) => string | null;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id });
  const dragged = active?.data.current?.order as Order | undefined;
  const issue = dragged ? problem(dragged) : null;
  return (
    <div
      ref={setNodeRef}
      className={`kanban-column ${orders.length ? "" : "empty-column"} ${isOver ? (issue ? "blocked" : "allowed") : ""}`}
    >
      <h3>
        {label}
        <span>{orders.length}</span>
      </h3>
      {["sua_hang", "qc_lai"].includes(id) && (
        <p className="muted">Chỉ khi có sản phẩm lỗi</p>
      )}
      {isOver && (
        <p className={issue ? "error-text" : "muted"}>
          {issue || "Thả để mở xác nhận"}
        </p>
      )}
      <div className="stack">{children}</div>
    </div>
  );
}
function DragCard({
  order,
  disabled,
  onOpen,
  columns,
  current,
  onMove,
  problem,
}: {
  order: Order;
  disabled: boolean;
  onOpen: () => void;
  columns: { id: string; label: string }[];
  current: string;
  onMove: (target: string) => void;
  problem: (target: string) => string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: order.id, data: { order }, disabled });
  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 20 : undefined,
      }}
      className={`kanban-card ${isDragging ? "dragging" : ""}`}
    >
      <div className="card-top">
        <button className="text-button" onClick={onOpen}>
          {order.id}
        </button>
        <button
          className="drag-handle"
          aria-label={`Kéo đơn ${order.id}`}
          disabled={disabled}
          {...listeners}
          {...attributes}
        >
          <GripVertical size={20} />
        </button>
      </div>
      <ProductPhoto url={order.image_url} name={order.product_name} large />
      <h4>{order.product_name}</h4>
      <p>{order.customer}</p>
      <Status order={order} />
      {["qc", "qc_lai"].includes(order.current_stage) &&
        transitionProblem(order, "dong_goi") === null && (
          <p>QC đã đạt đủ · Bước tiếp theo: Đóng gói</p>
        )}
      <p className="muted">
        {order.total_quantity} sản phẩm ·{" "}
        {order.deadline.split("-").reverse().join("/")}
      </p>
      <select
        aria-label={`Chuyển ${order.id} đến`}
        value=""
        onChange={(e) => onMove(e.target.value)}
        disabled={disabled}
      >
        <option value="">Chuyển đến…</option>
        {columns
          .filter((c) => c.id !== current)
          .map((c) => (
            <option key={c.id} value={c.id} disabled={!!problem(c.id)}>
              {c.label}
              {problem(c.id) ? ` — ${problem(c.id)}` : ""}
            </option>
          ))}
      </select>
    </article>
  );
}
export function CreateOrderForm({
  api,
  session,
  lines,
  nextCode,
  employees,
  onSaved,
}: {
  api: Api;
  session: SessionInfo;
  lines: Line[];
  employees: import("@/lib/types").Employee[];
  nextCode?: string;
  onSaved: () => Promise<void>;
}) {
  const orderCode = nextCode || "";
  const [selectedLine, setSelectedLine] = useState(lines[0]?.id || 1);
  const [productCode] = useState(
    () => `SP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [variants, setVariants] = useState([
    {
      color: "",
      color_hex: "#808080",
      colors: [{ name: "", hex: "#808080" }],
      size: "M",
      quantity: 1,
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    try {
      let url = imageUrl;
      if (imageFile && !url) {
        url = await uploadProductImage(
          imageFile,
          session,
          Number(form.get("line_id")),
        );
        setImageUrl(url);
      }
      await api("/api/orders", {
        image_url: url,
        customer: form.get("customer"),
        product_name: form.get("product_name"),
        responsible_id: String(form.get("responsible_id") || "") || null,
        order_code: String(form.get("order_code") || "") || undefined,
        product_code: form.get("product_code"),
        order_date: form.get("order_date"),
        deadline: form.get("deadline"),
        line_id: Number(form.get("line_id")),
        priority: form.get("priority"),
        notes: form.get("notes"),
        variants,
      });
      await onSaved();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit(new FormData(event.currentTarget));
      }}
      className="stack"
    >
      <ErrorNotice error={error} />
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
      <div className="form-grid">
        <Field label="Mã đơn hàng">
          <input
            name="order_code"
            maxLength={40}
            placeholder="Tự sinh LU-001… khi lưu"
            pattern="[A-Za-z0-9_-]+"
            defaultValue={orderCode}
          />
        </Field>
        <Field label="Khách hàng">
          <input name="customer" required maxLength={160} />
        </Field>
        <Field label="Tên sản phẩm">
          <input name="product_name" required maxLength={160} />
        </Field>
        <Field label="Mã sản phẩm">
          <input
            name="product_code"
            required
            maxLength={160}
            defaultValue={productCode}
          />
        </Field>
        <Field label="Tổ phụ trách">
          <select
            name="line_id"
            value={selectedLine}
            onChange={(e) => setSelectedLine(Number(e.target.value))}
          >
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Người phụ trách"
          hint="Đầu mối theo dõi đơn; nhiều nhân viên vẫn có thể cùng ghi nhận công việc."
        >
          <select name="responsible_id" key={selectedLine}>
            <option value="">Chưa phân công cá nhân</option>
            {employees
              .filter((e) => e.line_id === selectedLine)
              .map((e) => (
                <option value={e.id} key={e.id}>
                  {e.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Ngày nhận">
          <input type="date" name="order_date" required defaultValue={day()} />
        </Field>
        <Field label="Hạn giao">
          <input type="date" name="deadline" required />
        </Field>
      </div>
      <Field label="Ưu tiên">
        <select name="priority">
          <option value="normal">Bình thường</option>
          <option value="high">Cao</option>
          <option value="urgent">Gấp</option>
        </select>
      </Field>
      <h3>Phân bổ màu và size</h3>
      {variants.map((v, i) => (
        <div className="variant-row variant-card" key={i}>
          <div className="variant-card-heading">
            <strong>Biến thể {i + 1}</strong>{" "}
            <Action
              type="button"
              tone="secondary"
              disabled={variants.length === 1}
              onClick={() => setVariants(variants.filter((_, n) => n !== i))}
            >
              Xóa biến thể
            </Action>
          </div>
          <div className="field variant-colors">
            <span>Màu / phối màu</span>
            <GarmentColors
              colors={v.colors}
              onChange={(color, colors) =>
                setVariants(
                  variants.map((x, n) =>
                    n === i
                      ? { ...x, color, colors, color_hex: colors[0].hex }
                      : x,
                  ),
                )
              }
            />
          </div>
          <div className="variant-name">
            <Field label="Tên phối màu / mã vải">
              <input
                value={v.color}
                required
                maxLength={160}
                placeholder="VD: Đen / Trắng, Kẻ caro"
                onChange={(e) =>
                  setVariants(
                    variants.map((x, n) =>
                      n === i ? { ...x, color: e.target.value } : x,
                    ),
                  )
                }
              />
            </Field>
          </div>
          <Field label="Size">
            <SizeSelect
              value={v.size}
              onChange={(size) =>
                setVariants(
                  variants.map((x, n) => (n === i ? { ...x, size } : x)),
                )
              }
            />
          </Field>
          <Field label="Số lượng">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={1000000}
              required
              value={v.quantity}
              onChange={(e) =>
                setVariants(
                  variants.map((x, n) =>
                    n === i ? { ...x, quantity: Number(e.target.value) } : x,
                  ),
                )
              }
            />
          </Field>
        </div>
      ))}
      <Action
        type="button"
        tone="secondary"
        onClick={() =>
          setVariants([
            ...variants,
            {
              color: "",
              color_hex: "#808080",
              colors: [{ name: "", hex: "#808080" }],
              size: "M",
              quantity: 1,
            },
          ])
        }
      >
        <Plus size={18} />
        Thêm biến thể màu / size
      </Action>
      <p className="muted">
        Tổng: {variants.reduce((n, v) => n + v.quantity, 0)} sản phẩm
      </p>
      <Field label="Ghi chú">
        <textarea name="notes" maxLength={2000} />
      </Field>
      <div className="mobile-form-footer">
        <Action type="submit" busy={busy} className="mobile-form-submit">
          Tạo đơn hàng
        </Action>
      </div>
    </form>
  );
}
