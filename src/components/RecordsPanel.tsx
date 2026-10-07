"use client";
import { PendingPackingPanel } from "./PendingPackingPanel";
import { Pagination } from "./Pagination";
import { availableOperations } from "@/lib/workflow";
import { ProductPhoto } from "./ProductImage";
import { useEffect, useState } from "react";
import {
  Download,
  Lock,
  History,
  BriefcaseBusiness,
  Wallet,
  ClipboardCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import {
  type Api,
  type PayrollData,
  type ViewLog,
  money,
  message,
  day,
} from "@/lib/client";
import type { Employee, Line, Order } from "@/lib/types";
import type { SessionInfo } from "@/lib/permissions";
import { hasPermission, permits } from "@/lib/permissions";
import type { AuditEntry } from "@/lib/server/business";
import { Action, Field, Modal, ErrorNotice, Empty } from "./Primitives";
import { AdjustmentControls } from "./RequirementPanels";
import { ProductionHistory } from "./ProductionForms";
export function RecordsPanel({
  mode,
  api,
  session,
  employees,
  lines,
}: {
  mode: "production" | "payroll";
  api: Api;
  session: SessionInfo;
  employees: Employee[];
  lines: Line[];
}) {
  const personal =
    !!session.user.employee_id &&
    session.user.roles.length > 0 &&
    session.user.roles.every((r) => r.id === "worker");
  const [month, setMonth] = useState(day().slice(0, 7));
  const [employee, setEmployee] = useState("");
  const [line, setLine] = useState("");
  const [product, setProduct] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dimension, setDimension] = useState("product");
  const [stage, setStage] = useState("");
  const [logs, setLogs] = useState<ViewLog[]>([]);
  const [payroll, setPayroll] = useState<PayrollData | null>(null);
  const [error, setError] = useState("");
  const [lock, setLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [extraFilters, setExtraFilters] = useState(false);
  const [pages, setPages] = useState({
    query: "",
    history: 1,
    summary: 1,
    group: 1,
  });
  const params = new URLSearchParams({
    ...(month ? { month } : {}),
    ...(product ? { product } : {}),
    ...(color ? { color } : {}),
    ...(size ? { size } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(employee ? { employee_id: employee } : {}),
    ...(line ? { line_id: line } : {}),
    ...(stage ? { stage } : {}),
  }).toString();
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        if (mode === "payroll") {
          const data = await api<PayrollData>(`/api/payroll?${params}`);
          if (live) {
            setPayroll(data);
            setLogs(data.logs);
            setError("");
          }
        } else {
          const data = await api<{ logs: ViewLog[] }>(
            `/api/production/log?${params}`,
          );
          if (live) {
            setLogs(data.logs);
            setError("");
          }
        }
      } catch (e) {
        if (live) setError(message(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [api, mode, params, revision]);
  async function closeMonth() {
    setBusy(true);
    setError("");
    try {
      await api("/api/payroll", { month });
      setLock(false);
      setRevision((r) => r + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const allowedEmployees = employees.filter((e) =>
    [e.line_id, ...(e.assigned_line_ids || [])].some((lineId) =>
      permits(
        session.user,
        mode === "payroll" ? "payroll.view" : "production.view",
        { employeeId: e.id, lineId },
      ),
    ),
  );
  const pageFor = (key: "history" | "summary" | "group", total: number) =>
    Math.min(
      pages.query === params ? pages[key] : 1,
      Math.max(1, Math.ceil(total / 25)),
    );
  const changePage = (key: "history" | "summary" | "group", page: number) =>
    setPages((old) => ({
      ...(old.query === params
        ? old
        : { query: params, history: 1, summary: 1, group: 1 }),
      [key]: page,
    }));
  const historyPage = pageFor("history", logs.length);
  const summaryPage = pageFor("summary", payroll?.summary.length || 0);
  const visibleMoney =
    logs.length > 0 && logs.every((l) => l.total_pay !== null);
  const grouped = new Map<
    string,
    { quantity: number; total: number; visible: boolean }
  >();
  for (const l of logs) {
    const key =
      dimension === "order"
        ? l.order_id
        : dimension === "stage"
          ? l.stage
          : dimension === "size"
            ? l.size
            : dimension === "color"
              ? l.color
              : dimension === "day"
                ? l.log_date
                : l.product_code || l.product_name;
    const row = grouped.get(key) || { quantity: 0, total: 0, visible: true };
    row.quantity += l.quantity;
    row.total += l.total_pay || 0;
    row.visible &&= l.total_pay !== null;
    grouped.set(key, row);
  }
  const groups = [...grouped];
  const groupPage = pageFor("group", groups.length);
  return (
    <section className="records-workspace">
      <div className="records-actions">
        <div>
          <p className="muted">
            {mode === "payroll" && payroll?.isLocked
              ? `Đã chốt bởi ${payroll.lockedBy} · ${payroll.lockedAt}`
              : "Dữ liệu theo quyền và phạm vi của bạn"}
          </p>
        </div>
        <div className="inline-actions">
          {hasPermission(session.user, "export.data") && (
            <a
              className="action secondary"
              href={`/api/export/excel?dataset=${mode}&${params}`}
            >
              <Download size={18} />
              Xuất Excel
            </a>
          )}
          {mode === "payroll" && permits(session.user, "payroll.lock", {}) && (
            <Action
              disabled={payroll?.isLocked || !month}
              onClick={() => setLock(true)}
            >
              <Lock size={18} />
              {payroll?.isLocked ? "Đã chốt" : "Chốt tháng"}
            </Action>
          )}
        </div>
      </div>
      <div className="panel records-filter-panel">
        <div
          className={`filter-grid record-primary-filters ${personal ? "personal-filters" : ""}`}
        >
          <Field label="Tháng">
            <input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setFrom("");
                setTo("");
              }}
            />
          </Field>
          <Field label="Công đoạn">
            <select value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="">Tất cả công đoạn</option>
              {["Cắt", "May", "QC", "Sửa hàng", "Đóng gói"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Sản phẩm / mã đơn / mã hàng" className="filter-product-field">
            <input
              value={product}
              onChange={(e) => setProduct(e.target.value)}
            />
          </Field>
          {!personal && (
            <Field label="Nhân viên">
              <select
                value={employee}
                onChange={(e) => setEmployee(e.target.value)}
              >
                <option value="">Trong phạm vi của tôi</option>
                {allowedEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <button
            className="action secondary extra-filter-toggle"
            aria-expanded={extraFilters}
            aria-controls="records-extra-filters"
            onClick={() => setExtraFilters((open) => !open)}
          >
            <SlidersHorizontal size={18} />
            Lọc thêm
            {[from, to, color, size, line].filter(Boolean).length
              ? ` (${[from, to, color, size, line].filter(Boolean).length})`
              : ""}
          </button>
        </div>
        {extraFilters && (
          <div id="records-extra-filters">
            <div className="filter-grid">
              <Field label="Từ ngày">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setMonth("");
                  }}
                />
              </Field>
              <Field label="Đến ngày">
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setMonth("");
                  }}
                />
              </Field>
              <Field label="Màu">
                <input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="Đúng tên màu"
                />
              </Field>
              <Field label="Size">
                <input value={size} onChange={(e) => setSize(e.target.value)} />
              </Field>
              <Field label="Chuyền">
                <select value={line} onChange={(e) => setLine(e.target.value)}>
                  <option value="">Tất cả chuyền được cấp</option>
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        )}
      </div>
      <ErrorNotice error={error} />
      <div className="records-kpis">
        <article className="panel records-kpi">
          <span className="records-kpi-icon">
            <BriefcaseBusiness size={22} />
          </span>
          <div>
            <p>Lượt công việc</p>
            <strong>
              {logs
                .reduce((sum, l) => sum + l.quantity, 0)
                .toLocaleString("vi-VN")}
            </strong>
            <small>Tổng lượt làm theo bộ lọc</small>
          </div>
        </article>
        <article className="panel records-kpi">
          <span className="records-kpi-icon">
            <Wallet size={22} />
          </span>
          <div>
            <p>Tiền công đã ghi nhận</p>
            <strong>
              {visibleMoney
                ? money(logs.reduce((sum, l) => sum + (l.total_pay || 0), 0))
                : logs.length
                  ? "Không có quyền xem"
                  : "Chưa có dữ liệu"}
            </strong>
            <small>Chưa gồm khoản chờ đối chiếu</small>
          </div>
        </article>
        <article className="panel records-kpi">
          <span className="records-kpi-icon">
            <ClipboardCheck size={22} />
          </span>
          <div>
            <p>Lần ghi nhận</p>
            <strong>{logs.length.toLocaleString("vi-VN")}</strong>
            <small>
              {new Set(logs.map((l) => l.order_id)).size} đơn hàng theo bộ lọc
            </small>
          </div>
        </article>
      </div>
      {logs.some((l) => !!l.work_item_id) && (
        <p className="muted">
          Lượt công việc tính theo phần việc; xem số sản phẩm hoàn thành trong
          chi tiết đơn.
        </p>
      )}
      <div className="records-layout">
        <div className="records-main">
          {!personal && mode === "payroll" && !!payroll?.summary.length && (
            <section className="panel">
              <div className="records-section-title">
                <h3>
                  <Users size={20} />
                  Tổng hợp theo nhân viên
                </h3>
                <span className="muted">
                  {new Set(payroll.summary.map((r) => r.employee_id)).size} nhân
                  viên
                </span>
              </div>
              <div className="table-scroll">
                <table className="mobile-stack-table">
                  <thead>
                    <tr>
                      <th>Nhân viên</th>
                      <th>Chuyền</th>
                      <th>Lượt công việc</th>
                      <th>Tiền lương</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payroll.summary
                      .slice((summaryPage - 1) * 25, summaryPage * 25)
                      .map((s) => (
                        <tr key={`${s.employee_id}-${s.line_id}`}>
                          <td data-label="Nhân viên">
                            <button
                              className="text-button"
                              onClick={() => setEmployee(s.employee_id)}
                            >
                              {s.employee_name}
                            </button>
                          </td>
                          <td data-label="Chuyền">
                            {lines.find((l) => l.id === s.line_id)?.name ||
                              `Chuyền ${s.line_id}`}
                          </td>
                          <td data-label="Lượt công việc">
                            {s.total_qty.toLocaleString("vi-VN")}
                          </td>
                          <td data-label="Tiền lương">
                            {money(s.total_salary)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {payroll.summary.length > 25 && (
                <Pagination
                  page={summaryPage}
                  total={payroll.summary.length}
                  onChange={(page) => changePage("summary", page)}
                />
              )}
            </section>
          )}
          <details className="panel record-disclosure">
            <summary>Tổng hợp báo cáo</summary>
            <div className="padded stack">
              <Field label="Tổng hợp theo">
                <select
                  value={dimension}
                  onChange={(e) => {
                    setDimension(e.target.value);
                    changePage("group", 1);
                  }}
                >
                  <option value="product">Theo mã sản phẩm</option>
                  <option value="order">Theo đơn</option>
                  <option value="stage">Theo công đoạn</option>
                  <option value="size">Theo size</option>
                  <option value="color">Theo màu</option>
                  <option value="day">Theo ngày</option>
                </select>
              </Field>
              <div className="table-scroll">
                <table className="mobile-stack-table">
                  <thead>
                    <tr>
                      <th>Nhóm</th>
                      <th>Lượt công việc</th>
                      <th>Tiền công được xem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups
                      .slice((groupPage - 1) * 25, groupPage * 25)
                      .map(([group, row]) => (
                        <tr key={group}>
                          <td data-label="Nhóm">{group}</td>
                          <td data-label="Lượt công việc">
                            {row.quantity.toLocaleString("vi-VN")}
                          </td>
                          <td data-label="Tiền công">
                            {row.visible
                              ? money(row.total)
                              : "Không có quyền xem"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {groups.length > 25 && (
                  <Pagination
                    page={groupPage}
                    total={groups.length}
                    onChange={(page) => changePage("group", page)}
                  />
                )}
              </div>
            </div>
          </details>
          <section className="panel">
            <div className="records-section-title">
              <h3>Chi tiết sản lượng</h3>
              <span className="muted">{logs.length} bản ghi</span>
            </div>
            <ProductionHistory
              logs={logs.slice((historyPage - 1) * 25, historyPage * 25)}
              hideEmployee={personal}
            />
            <Pagination
              page={historyPage}
              total={logs.length}
              onChange={(page) => changePage("history", page)}
            />
          </section>
        </div>
        <aside className="records-side" aria-label="Đối chiếu và điều chỉnh">
          <PendingPackingPanel
            api={api}
            session={session}
            onSettled={() => setRevision((r) => r + 1)}
          />
          <AdjustmentControls
            logs={logs}
            api={api}
            session={session}
            onChanged={() => setRevision((r) => r + 1)}
          />
        </aside>
      </div>
      <Modal
        open={lock}
        onClose={() => {
          if (!busy) setLock(false);
        }}
        title="Chốt lương tháng"
        description={`Tháng ${month}`}
      >
        <div className="stack">
          <p>
            Thao tác khóa toàn bộ tháng, kể cả các dòng đang nằm ngoài bộ lọc.
            Sau khi chốt không thể ghi thêm sản lượng vào tháng này.
          </p>
          <ErrorNotice error={error} />
          <div className="inline-actions">
            <Action
              tone="secondary"
              onClick={() => setLock(false)}
              disabled={busy}
            >
              Hủy
            </Action>
            <Action busy={busy} onClick={closeMonth}>
              Chốt toàn bộ tháng
            </Action>
          </div>
        </div>
      </Modal>
    </section>
  );
}
export function AuditPanel({ api }: { api: Api }) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let live = true;
    void api<AuditEntry[]>("/api/audit")
      .then((data) => {
        if (live) setLogs(data);
      })
      .catch((e) => {
        if (live) setError(message(e));
      });
    return () => {
      live = false;
    };
  }, [api]);
  const filtered = logs.filter((l) =>
    `${l.user_name} ${l.action} ${l.details}`
      .toLocaleLowerCase("vi")
      .includes(search.toLocaleLowerCase("vi")),
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(filtered.length / 25)),
  );
  return (
    <section className="panel padded">
      <h2>
        <History size={22} /> Nhật ký thao tác
      </h2>
      <p className="muted">
        Lưu người thực hiện và người được đại diện; không có thao tác xóa lịch
        sử.
      </p>
      <ErrorNotice error={error} />
      <Field label="Tìm thao tác hoặc người thực hiện">
        <input
          type="search"
          value={search}
          placeholder="Tên, đơn hàng, nội dung thao tác…"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </Field>
      <div className="audit-list">
        {filtered.slice((currentPage - 1) * 25, currentPage * 25).map((l) => (
          <article key={l.id}>
            <div>
              <strong>{l.user_name}</strong>
              <span>{l.action}</span>
            </div>
            <p>{l.details}</p>
            <small>
              {l.created_at}
              {l.represented_id ? " · Thao tác đại diện" : ""}
            </small>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <Empty>Không có nhật ký phù hợp trong phạm vi được xem.</Empty>
      )}
      <Pagination
        page={currentPage}
        total={filtered.length}
        onChange={setPage}
      />
    </section>
  );
}
export function OperationsPanel({
  mode,
  orders,
  onOpen,
  session,
}: {
  mode: "qc" | "delivery";
  orders: Order[];
  onOpen: (order: Order) => void;
  session: SessionInfo;
}) {
  const [page, setPage] = useState(1);
  const [line, setLine] = useState("");
  const [search, setSearch] = useState("");
  const visible = orders.filter(
    (o) =>
      permits(session.user, mode === "qc" ? "qc.view" : "delivery.view", {
        lineId: o.line_id,
      }) &&
      (mode === "qc"
        ? ["may", "qc", "sua_hang", "qc_lai"].includes(o.current_stage)
        : ["dong_goi", "giao_hang", "hoan_thanh"].includes(o.current_stage)) &&
      (!line || o.line_id === Number(line)) &&
      `${o.id} ${o.customer} ${o.product_name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(visible.length / 12)),
  );
  return (
    <div className="stack">
      <div className="panel-toolbar panel">
        <input
          aria-label="Tìm đơn trong phân hệ"
          placeholder="Tìm đơn hàng…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Lọc chuyền"
          value={line}
          onChange={(e) => {
            setLine(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả chuyền</option>
          {[1, 2, 3, 4, 5].map((id) => (
            <option key={id} value={id}>
              Chuyền {id}
            </option>
          ))}
        </select>
        {hasPermission(session.user, "export.data") && (
          <a
            className="action secondary"
            href={`/api/export/excel?dataset=${mode}&${new URLSearchParams({ search, status: mode === "qc" ? "cho_qc" : "waiting_delivery", ...(line ? { line_id: line } : {}) })}`}
          >
            <Download size={18} />
            Excel
          </a>
        )}
      </div>
      <div className="operations-grid">
        {visible.slice((currentPage - 1) * 12, currentPage * 12).map((o) => (
          <article key={o.id} className="panel padded operation-card">
            <div className="operation-card-header">
              <ProductPhoto url={o.image_url} name={o.product_name} />
              <div className="operation-card-info">
                <div className="card-top">
                  <strong>{o.id}</strong>
                  <span className="muted">Chuyền {o.line_id}</span>
                </div>
                <h3>{o.product_name}</h3>
                <p className="muted">{o.customer}</p>
              </div>
            </div>
            <dl className="numbers">
              <div>
                <dt>Yêu cầu</dt>
                <dd>{o.total_quantity.toLocaleString("vi-VN")}</dd>
              </div>
              <div>
                <dt>{mode === "qc" ? "QC đạt" : "Đã giao"}</dt>
                <dd>
                  {o.variants
                    ?.reduce(
                      (n, v) =>
                        n + (mode === "qc" ? v.qc_passed_qty : v.delivered_qty),
                      0,
                    )
                    .toLocaleString("vi-VN")}
                </dd>
              </div>
              <div>
                <dt>Còn thiếu</dt>
                <dd>
                  {o.variants
                    ?.reduce(
                      (n, v) =>
                        n +
                        v.quantity -
                        (mode === "qc" ? v.qc_passed_qty : v.delivered_qty),
                      0,
                    )
                    .toLocaleString("vi-VN")}
                </dd>
              </div>
            </dl>
            {mode === "qc" && o.current_stage === "may" && (
              <p className="muted">
                Đang may; chờ chuyển sang QC để nhập kết quả.
              </p>
            )}
            <Action
              tone={
                availableOperations(session.user, o).length
                  ? "primary"
                  : "secondary"
              }
              onClick={() => onOpen(o)}
            >
              {availableOperations(session.user, o)[0]?.label ||
                "Xem chi tiết và tiến độ"}
            </Action>
          </article>
        ))}
      </div>
      <Pagination
        page={currentPage}
        total={visible.length}
        pageSize={12}
        onChange={setPage}
      />
      {!visible.length && <Empty>Chưa có đơn hàng ở phân hệ này.</Empty>}
    </div>
  );
}
