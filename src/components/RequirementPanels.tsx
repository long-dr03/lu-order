"use client";
import { Pagination } from "./Pagination";
import { useState, useEffect } from "react";
import { type Api, type ViewLog, day, money, message } from "@/lib/client";
import {
  LUUTA_STAGES,
  type Order,
  type Employee,
  type Line,
} from "@/lib/types";
import type { SessionInfo } from "@/lib/permissions";
import { permits, hasPermission } from "@/lib/permissions";
import { Action, Field, Modal, ErrorNotice, Empty } from "./Primitives";
import { MoneyInput, parseMoney } from "./SmartInputs";
export function LinesPanel({
  lines,
  orders,
  onOpen,
}: {
  lines: Line[];
  orders: Order[];
  onOpen: (o: Order) => void;
}) {
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const line = lines.find((l) => String(l.id) === selected) || lines[0];
  const active = orders.filter(
    (o) => o.line_id === line?.id && o.status !== "completed",
  );
  const filtered = active.filter((o) =>
    `${o.id} ${o.product_name} ${o.customer}`
      .toLocaleLowerCase("vi")
      .includes(search.toLocaleLowerCase("vi")),
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(filtered.length / 25)),
  );
  if (!line) return <Empty>Chưa có chuyền trong phạm vi của bạn.</Empty>;
  return (
    <section className="panel">
      <div className="panel-toolbar">
        <Field label="Chuyền phụ trách">
          <select
            value={line.id}
            onChange={(e) => {
              setSelected(e.target.value);
              setPage(1);
            }}
          >
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ·{" "}
                {
                  orders.filter(
                    (o) => o.line_id === l.id && o.status !== "completed",
                  ).length
                }{" "}
                đơn đang làm
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tìm đơn trong chuyền">
          <input
            type="search"
            value={search}
            placeholder="Mã đơn, sản phẩm, khách hàng…"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </Field>
      </div>
      <div className="padded">
        <h2>{line.name}</h2>
        <p className="muted">
          {line.leader_name} · {line.workers_count} nhân viên · Kế hoạch{" "}
          {line.capacity_per_day} SP/ngày
        </p>
        <p>
          {active.length} đơn đang làm ·{" "}
          {
            active.filter((o) => ["at_risk", "delayed"].includes(o.status))
              .length
          }{" "}
          đơn cần chú ý
        </p>
      </div>
      <div className="table-scroll">
        <table className="mobile-stack-table">
          <thead>
            <tr>
              <th>Đơn / sản phẩm</th>
              <th>Công đoạn</th>
              <th>Hạn giao</th>
              <th>Số nhận</th>
              <th>Đã may</th>
              <th>Chưa giao</th>
              <th>Tiến độ</th>
            </tr>
          </thead>
          <tbody>
            {filtered
              .slice((currentPage - 1) * 25, currentPage * 25)
              .map((o) => (
                <tr key={o.id}>
                  <td data-label="Đơn / sản phẩm">
                    <div className="mobile-cell-value">
                      <button className="text-button" onClick={() => onOpen(o)}>
                        {o.id} · {o.product_name}
                      </button>
                      <span className="table-subtitle">{o.customer}</span>
                    </div>
                  </td>
                  <td data-label="Công đoạn">
                    {LUUTA_STAGES.find((s) => s.key === o.current_stage)?.label}
                  </td>
                  <td data-label="Hạn giao">
                    {o.deadline.split("-").reverse().join("/")}
                  </td>
                  <td data-label="Số nhận">
                    {o.total_quantity.toLocaleString("vi-VN")}
                  </td>
                  <td data-label="Đã may">
                    {(o.variants || []).reduce((n, v) => n + v.sewn_qty, 0)}
                  </td>
                  <td data-label="Chưa giao">
                    {(o.variants || []).reduce(
                      (n, v) => n + Math.max(0, v.quantity - v.delivered_qty),
                      0,
                    )}
                  </td>
                  <td data-label="Tiến độ">
                    <span title={o.risk_reason}>
                      {o.status === "delayed"
                        ? "Trễ hạn"
                        : o.status === "at_risk"
                          ? "Cần chú ý"
                          : "Trong kế hoạch"}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && <Empty>Không có đơn đang làm phù hợp.</Empty>}
      <Pagination
        page={currentPage}
        total={filtered.length}
        onChange={setPage}
      />
    </section>
  );
}
export function DashboardInsights({
  api,
  orders,
  lines,
  session,
}: {
  api: Api;
  orders: Order[];
  lines: Line[];
  session: SessionInfo;
}) {
  const [logs, setLogs] = useState<ViewLog[]>([]),
    [error, setError] = useState("");
  const [peoplePage, setPeoplePage] = useState(1);
  useEffect(() => {
    let live = true;
    void api<{ logs: ViewLog[] }>(
      `/api/production/log?month=${day().slice(0, 7)}`,
    )
      .then((v) => {
        if (live) setLogs(v.logs);
      })
      .catch((e) => {
        if (live) setError(message(e));
      });
    return () => {
      live = false;
    };
  }, [api]);
  const people = [...new Set(logs.map((l) => l.employee_id))];
  const currentPeoplePage = Math.min(
    peoplePage,
    Math.max(1, Math.ceil(people.length / 25)),
  );
  return (
    <section className="panel padded stack">
      <h2>Tình hình xưởng</h2>
      <ErrorNotice error={error} />
      <div className="record-totals">
        <span>
          Hoàn thành:{" "}
          <strong>
            {orders.filter((o) => o.status === "completed").length}
          </strong>
        </span>
        <span>
          Chờ QC:{" "}
          <strong>
            {
              orders.filter((o) => ["qc", "qc_lai"].includes(o.current_stage))
                .length
            }
          </strong>
        </span>
        <span>
          Chờ giao:{" "}
          <strong>
            {
              orders.filter(
                (o) => o.current_stage === "giao_hang" && !o.delivered_complete,
              ).length
            }
          </strong>
        </span>
        <span>
          Đã giao đủ:{" "}
          <strong>{orders.filter((o) => o.delivered_complete).length}</strong>
        </span>
      </div>
      <div className="section-head">
        <h3>Sản lượng tháng theo chuyền</h3>
        <span className="muted">{lines.length} chuyền may</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th className="nowrap">Chuyền</th>
              <th className="num-col nowrap">Lượt CV</th>
              <th className="num-col nowrap">May TT / ngày</th>
              <th className="num-col nowrap">Đơn rủi ro</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const rows = logs.filter((r) => r.line_id === l.id),
                may = rows.filter((r) => r.stage === "May");
              const atRisk = orders.filter(
                (o) =>
                  o.line_id === l.id &&
                  ["at_risk", "delayed"].includes(o.status),
              ).length;
              return (
                <tr key={l.id}>
                  <td className="nowrap">
                    <strong>{l.name}</strong>
                  </td>
                  <td className="num-col">
                    {rows
                      .reduce((n, r) => n + r.quantity, 0)
                      .toLocaleString("vi-VN")}
                  </td>
                  <td className="num-col">
                    {(
                      may.reduce((n, r) => n + r.quantity, 0) /
                      Math.max(1, new Set(may.map((r) => r.log_date)).size)
                    ).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}
                  </td>
                  <td className="num-col">
                    {atRisk > 0 ? (
                      <span className="status delayed">{atRisk} đơn</span>
                    ) : (
                      <span className="muted">0</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="section-head">
        <h3>Lượt công việc và tiền công theo nhân viên</h3>
        <span className="muted">{people.length} nhân viên</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th className="nowrap">Nhân viên</th>
              <th className="num-col nowrap">Sản lượng</th>
              <th className="num-col nowrap">Tiền công</th>
            </tr>
          </thead>
          <tbody>
            {people
              .slice((currentPeoplePage - 1) * 25, currentPeoplePage * 25)
              .map((id) => {
                const rows = logs.filter((l) => l.employee_id === id);
                const canViewPay = permits(session.user, "payroll.view", {
                  employeeId: id,
                  lineId: rows[0]?.line_id,
                });
                return (
                  <tr key={id}>
                    <td className="nowrap">
                      <strong>{rows[0]?.employee_name}</strong>
                    </td>
                    <td className="num-col">
                      {rows
                        .reduce((n, r) => n + r.quantity, 0)
                        .toLocaleString("vi-VN")}
                    </td>
                    <td className="num-col">
                      {canViewPay ? (
                        <strong>
                          {money(
                            rows.reduce((n, r) => n + (r.total_pay || 0), 0),
                          )}
                        </strong>
                      ) : (
                        <span className="muted">Không có quyền xem</span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {people.length > 25 && (
        <Pagination
          page={currentPeoplePage}
          total={people.length}
          onChange={setPeoplePage}
        />
      )}
    </section>
  );
}
export function StageEditor({
  order,
  employees,
  api,
  onChanged,
}: {
  order: Order;
  employees: Employee[];
  api: Api;
  onChanged: () => Promise<void>;
}) {
  const current = order.stages?.find(
    (s) => s.stage_key === order.current_stage,
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!current) return null;
  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/orders/${order.id}/stages`,
        {
          version: order.version,
          stage: order.current_stage,
          status: form.get("status"),
          employee_id: form.get("employee"),
          received_qty: Number(form.get("received")),
          completed_qty: Number(form.get("completed")),
          notes: form.get("notes"),
          received_at: form.get("received_at")
            ? new Date(String(form.get("received_at"))).toISOString()
            : undefined,
          started_at: form.get("started_at")
            ? new Date(String(form.get("started_at"))).toISOString()
            : undefined,
        },
        "PATCH",
      );
      await onChanged();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      key={`${order.id}-${order.version}`}
      className="panel padded stack"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(new FormData(e.currentTarget));
      }}
    >
      <h3>Hồ sơ bước {current.stage_name}</h3>
      <ErrorNotice error={error} />
      <div className="form-grid">
        <Field label="Trạng thái công đoạn">
          <select name="status" defaultValue={current.status}>
            <option value="pending">Chưa bắt đầu</option>
            <option value="in_progress">Đang thực hiện</option>
            <option value="completed">Hoàn thành</option>
            <option value="has_issue">Có vấn đề</option>
          </select>
        </Field>
        <Field label="Người nhận việc">
          <select
            name="employee"
            required
            defaultValue={
              employees.find((e) => e.name === current.assignee)?.id || ""
            }
          >
            <option value="">Chọn nhân viên</option>
            {employees
              .filter((e) => e.line_id === order.line_id)
              .map((e) => (
                <option value={e.id} key={e.id}>
                  {e.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Số lượng nhận">
          <input
            name="received"
            type="number"
            min={0}
            max={order.total_quantity}
            defaultValue={current.received_qty}
            required
          />
        </Field>
        <Field label="Số lượng hoàn thành">
          <input
            name="completed"
            type="number"
            min={0}
            max={current.received_qty}
            defaultValue={current.completed_qty}
            readOnly={
              !["nhan_don", "kiem_npl", "kiem_rap", "hoan_thanh"].includes(
                order.current_stage,
              )
            }
            required
          />
        </Field>
        <Field label="Thời gian nhận việc (để trống: giữ nguyên / hiện tại)">
          <input name="received_at" type="datetime-local" />
        </Field>
        <Field label="Thời gian bắt đầu (để trống: giữ nguyên / hiện tại)">
          <input name="started_at" type="datetime-local" />
        </Field>
      </div>
      <Field label="Ghi chú công đoạn">
        <textarea
          name="notes"
          maxLength={2000}
          defaultValue={current.notes || ""}
        />
      </Field>
      <Action busy={busy}>Lưu hồ sơ công đoạn</Action>
    </form>
  );
}
export function AdjustmentControls({
  logs,
  api,
  session,
  onChanged,
}: {
  logs: ViewLog[];
  api: Api;
  session: SessionInfo;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<ViewLog | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const allowed = logs.filter((l) =>
    permits(session.user, "payroll.adjust", { lineId: l.line_id }),
  );
  const filtered = allowed.filter((l) =>
    `${l.id} ${l.employee_name} ${l.order_id} ${l.stage}`
      .toLocaleLowerCase("vi")
      .includes(search.toLocaleLowerCase("vi")),
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(filtered.length / 5)),
  );
  if (!hasPermission(session.user, "payroll.adjust") || !allowed.length)
    return null;
  async function submit(f: FormData) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api(
        "/api/production/log",
        {
          log_id: selected.id,
          version: selected.version,
          quantity: Number(f.get("quantity")),
          unit_price: parseMoney(String(f.get("price"))),
          reason: f.get("reason"),
        },
        "PATCH",
      );
      setSelected(null);
      onChanged();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <details className="panel padded adjustment-panel" open>
        <summary>Điều chỉnh số liệu</summary>
        <p className="muted">
          Chọn bản ghi cần sửa. Mọi thay đổi lưu lý do và lịch sử trước–sau.
        </p>
        <input
          type="search"
          aria-label="Tìm bản ghi cần điều chỉnh"
          placeholder="Mã đơn, nhân viên…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {filtered.slice((currentPage - 1) * 5, currentPage * 5).map((l) => (
          <div className="adjustment-entry" key={l.id}>
            <span>
              <strong>{l.employee_name}</strong>
              <span className="table-subtitle">
                {l.log_date} · {l.order_id} · {l.stage}
              </span>
              <span className="table-subtitle">
                {l.color}/{l.size} · {l.quantity} lượt
              </span>
            </span>
            <Action
              tone="secondary"
              onClick={() => {
                setError("");
                setSelected(l);
              }}
            >
              Điều chỉnh
            </Action>
          </div>
        ))}
        {filtered.length > 5 && (
          <Pagination
            page={currentPage}
            total={filtered.length}
            pageSize={5}
            onChange={setPage}
          />
        )}
        {!filtered.length && <p className="muted">Không có bản ghi phù hợp.</p>}
      </details>
      <Modal
        open={!!selected}
        onClose={() => {
          if (!busy) setSelected(null);
        }}
        title="Điều chỉnh số liệu"
        description="Bắt buộc ghi lý do; lịch sử gốc được lưu lại."
      >
        {selected && (
          <form
            key={selected.id}
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(new FormData(e.currentTarget));
            }}
          >
            <ErrorNotice error={error} />
            <Field label="Số lượng đúng">
              <input
                name="quantity"
                type="number"
                min={0}
                max={1000000}
                required
                defaultValue={selected.quantity}
              />
            </Field>
            <Field label="Đơn giá đúng">
              <MoneyInput
                name="price"
                required
                defaultValue={selected.unit_price || 0}
              />
            </Field>
            <Field label="Lý do điều chỉnh">
              <textarea name="reason" required minLength={5} maxLength={1000} />
            </Field>
            <Action busy={busy}>Lưu điều chỉnh</Action>
          </form>
        )}
      </Modal>
    </>
  );
}
