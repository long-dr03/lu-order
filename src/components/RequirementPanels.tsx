"use client";
import { DEPARTMENTS, departmentFor } from "@/lib/departments";
import { Pagination } from "./Pagination";
import { useState, useEffect } from "react";
import { type Api, type ViewLog, day, money, message } from "@/lib/client";
import { type Order, type Line } from "@/lib/types";
import type { SessionInfo } from "@/lib/permissions";
import { permits, hasPermission } from "@/lib/permissions";
import { Action, Field, Modal, ErrorNotice } from "./Primitives";
import { MoneyInput, parseMoney } from "./SmartInputs";
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
  void lines;
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
        <h3>Sản lượng tháng theo bộ phận</h3>
        <span className="muted">{DEPARTMENTS.length} bộ phận</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th className="nowrap">Bộ phận</th>
              <th className="num-col nowrap">Lượt CV</th>
              <th className="num-col nowrap">May TT / ngày</th>
              <th className="num-col nowrap">Đơn rủi ro</th>
            </tr>
          </thead>
          <tbody>
            {DEPARTMENTS.map((l) => {
              const rows = logs.filter(
                  (r) => (r.department_id || departmentFor(r.stage)) === l.id,
                ),
                may = rows.filter((r) => r.stage === "May");
              const atRisk = orders.filter(
                (o) =>
                  departmentFor(o.current_stage) === l.id &&
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
                  departmentId:
                    rows[0]?.department_id ||
                    departmentFor(rows[0]?.stage || ""),
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
    permits(session.user, "payroll.adjust", {
      departmentId: l.department_id || departmentFor(l.stage),
      employeeId: l.employee_id,
    }),
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
