"use client";
import { useEffect, useState } from "react";
import type { PendingPacking } from "@/lib/server/pending-packing";
import type { SessionInfo } from "@/lib/permissions";
import { permits } from "@/lib/permissions";
import { type Api, money, message, day } from "@/lib/client";
import { Action, Field, Modal, ErrorNotice } from "./Primitives";
import { Pagination } from "./Pagination";
export function PendingPackingPanel({
  api,
  session,
  onSettled,
}: {
  api: Api;
  session: SessionInfo;
  onSettled: () => void;
}) {
  const [rows, setRows] = useState<PendingPacking[]>([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PendingPacking | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    api<PendingPacking[]>("/api/production/pending")
      .then((r) => {
        if (live) {
          setRows(r);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(message(e));
      });
    return () => {
      live = false;
    };
  }, [api, revision]);
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / 5)));
  if (!rows.length && !error && !notice) return null;
  return (
    <section
      className="panel padded stack pending-pay-panel"
      aria-label="Công đóng gói chờ đối chiếu"
    >
      <h3>Công đóng gói chờ đối chiếu ({rows.length})</h3>
      <p className="muted">
        Số đóng gói đã được xác nhận trong tháng khóa. Các khoản dưới đây chưa
        cộng vào lương; danh sách gồm mọi tháng trong phạm vi của bạn.
      </p>
      <ErrorNotice error={error} />
      {notice && <p role="status">{notice}</p>}
      <div className="pending-pay-list">
        {rows.slice((current - 1) * 5, current * 5).map((r) => (
          <article className="pending-pay-entry" key={r.id}>
            <strong>{r.employee_name}</strong>
            <span className="muted">
              {r.work_date} · {r.order_id}
            </span>
            <span className="muted">
              {r.color} / {r.size} · {r.quantity} sản phẩm
            </span>
            <div className="inline-actions">
              <strong>
                {r.total_pay === null
                  ? "Không có quyền xem tiền"
                  : money(r.total_pay)}
              </strong>
              {permits(session.user, "payroll.adjust", { lineId: r.line_id }) &&
              permits(session.user, "payroll.view", {
                employeeId: r.employee_id,
                lineId: r.line_id,
              }) ? (
                <Action
                  tone="secondary"
                  onClick={() => {
                    setError("");
                    setSelected(r);
                  }}
                >
                  Đối chiếu
                </Action>
              ) : (
                <span className="muted">Chờ quản lý</span>
              )}
            </div>
          </article>
        ))}
      </div>
      {rows.length > 5 && (
        <Pagination
          page={current}
          total={rows.length}
          pageSize={5}
          onChange={setPage}
        />
      )}
      <Modal
        open={!!selected}
        onClose={() => {
          if (!busy) setSelected(null);
        }}
        title="Đối chiếu công đóng gói"
        description="Chọn kỳ lương còn mở. Không thay đổi ngày làm thực tế hoặc số đã đóng gói."
      >
        {selected && (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              const form = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              try {
                await api("/api/production/pending", {
                  id: selected.id,
                  pay_date: form.get("pay_date"),
                  reason: form.get("reason"),
                });
                setNotice(
                  `Đã hạch toán công ${selected.order_id}. Ngày làm thực tế ${selected.work_date} được giữ nguyên.`,
                );
                setSelected(null);
                setRevision((r) => r + 1);
                onSettled();
              } catch (err) {
                setError(message(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              {selected.employee_name} · {selected.order_id} ·{" "}
              {selected.quantity} sản phẩm ·{" "}
              {selected.total_pay === null ? "" : money(selected.total_pay)}
            </p>
            <p>
              Ngày làm: {selected.work_date}. Đơn giá được giữ tại thời điểm
              đóng gói:{" "}
              {selected.unit_price === null ? "" : money(selected.unit_price)}.
            </p>
            <Field label="Ngày hạch toán vào kỳ lương còn mở">
              <input
                name="pay_date"
                type="date"
                min={selected.work_date}
                max={day()}
                required
              />
            </Field>
            <Field label="Lý do hạch toán khác kỳ">
              <textarea name="reason" minLength={5} maxLength={1000} required />
            </Field>
            <ErrorNotice error={error} />
            <Action type="submit" busy={busy}>
              Xác nhận hạch toán tiền công
            </Action>
          </form>
        )}
      </Modal>
    </section>
  );
}
