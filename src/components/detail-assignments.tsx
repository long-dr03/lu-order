"use client";
import { useState } from "react";
import { ChevronDown, Users } from "lucide-react";
import { type Api, message } from "@/lib/client";
import { type SessionInfo, permits } from "@/lib/permissions";
import { departmentFor } from "@/lib/departments";
import { type Employee } from "@/lib/types";
import { Action, ErrorNotice } from "./Primitives";
import { Detail, assignmentStages } from "./order-detail-shared";

/** Above this many workers in a department, a search box is worth its space. */
const SEARCH_FROM = 12;

/**
 * One row per stage (or work part) showing who is assigned; tapping a row opens it in place
 * to pick workers. The list is the overview, so there is no separate table to scroll to.
 */
export function AssignmentForm({
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
  const tasks = assignmentStages.flatMap((stage) => {
    const parts = order.work_items?.filter((p) => p.stage === stage) || [];
    const editable = permits(session.user, "production.assign", { stage });
    return (parts.length ? parts : [null]).map((p) => {
      const part = p?.id || 0;
      const assigned = (order.assignments || []).filter(
        (a) =>
          a.active === 1 && a.stage === stage && (a.work_item_id || 0) === part,
      );
      return {
        key: `${stage}:${part}`,
        stage,
        part,
        label: p ? `${stage} · ${p.name}` : stage,
        editable,
        ids: assigned.map((a) => a.employee_id),
        names: assigned.map((a) => a.employee_name),
        staff: employees.filter(
          (e) =>
            e.active !== 0 && e.department_ids?.includes(departmentFor(stage)),
        ),
      };
    });
  });
  // Someone who cannot assign a stage still sees who works on it.
  const shown = tasks.filter((t) => t.editable || t.ids.length);
  const [openKey, setOpenKey] = useState("");
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const empty = tasks.filter(
    (t) => t.editable && !t.ids.length && t.staff.length,
  );
  const toggle = (key: string) => {
    setOpenKey(openKey === key ? "" : key);
    setChosen(null);
    setSearch("");
    setError("");
  };
  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/orders/${encodeURIComponent(order.id)}/assignments`, {
        version: order.version,
        ...body,
      });
      setChosen(null);
      await onChanged();
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack assignments">
      <p className="desktop-hint">
        Chạm vào công đoạn để chọn thợ. Phân công không tự tạo sản lượng hay
        tiền công.
      </p>
      {!openKey && <ErrorNotice error={error} />}
      {!!empty.length && order.status !== "completed" && (
        <Action
          type="button"
          tone="secondary"
          busy={busy}
          onClick={() => void send({ quick: true })}
        >
          <Users size={18} />
          Phân công nhanh cả bộ phận
        </Action>
      )}
      <ul className="assign-list">
        {shown.map((t) => {
          const open = openKey === t.key && t.editable;
          const picked = open ? chosen || t.ids : t.ids;
          const people = t.staff.filter((e) =>
            e.name
              .toLocaleLowerCase("vi")
              .includes(search.toLocaleLowerCase("vi")),
          );
          const changed =
            open &&
            !!chosen &&
            (chosen.length !== t.ids.length ||
              chosen.some((id) => !t.ids.includes(id)));
          return (
            <li key={t.key} className={open ? "open" : undefined}>
              <button
                type="button"
                className="assign-row"
                aria-expanded={t.editable ? open : undefined}
                disabled={!t.editable}
                onClick={() => toggle(t.key)}
              >
                <strong>{t.label}</strong>
                <span className={t.names.length ? undefined : "assign-none"}>
                  {t.names.length ? t.names.join(", ") : "Chưa giao"}
                </span>
                {t.editable && <ChevronDown size={18} aria-hidden="true" />}
              </button>
              {open && (
                <div className="assign-edit">
                  <ErrorNotice error={error} />
                  {t.staff.length >= SEARCH_FROM && (
                    <input
                      type="search"
                      aria-label={`Tìm thợ cho ${t.label}`}
                      placeholder="Tìm tên thợ…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  )}
                  {t.staff.length ? (
                    <div
                      className="size-chips"
                      role="group"
                      aria-label={`Thợ cho ${t.label}`}
                    >
                      {people.map((e) => (
                        <button
                          type="button"
                          key={e.id}
                          aria-pressed={picked.includes(e.id)}
                          onClick={() =>
                            setChosen(
                              picked.includes(e.id)
                                ? picked.filter((id) => id !== e.id)
                                : [...picked, e.id],
                            )
                          }
                        >
                          {e.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">
                      Bộ phận này chưa có thợ đang làm. Khai báo ở Danh sách
                      thợ.
                    </p>
                  )}
                  {!!t.staff.length && (
                    <div className="assign-actions">
                      {t.staff.length > 1 && (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() =>
                            setChosen(
                              picked.length === t.staff.length
                                ? []
                                : t.staff.map((e) => e.id),
                            )
                          }
                        >
                          {picked.length === t.staff.length
                            ? "Bỏ chọn hết"
                            : `Chọn cả ${t.staff.length} thợ`}
                        </button>
                      )}
                      <Action
                        type="button"
                        busy={busy}
                        disabled={!changed}
                        onClick={async () => {
                          if (
                            await send({
                              stage: t.stage,
                              work_item_id: t.part || undefined,
                              employee_ids: picked,
                            })
                          )
                            setOpenKey("");
                        }}
                      >
                        Lưu ({picked.length})
                      </Action>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
