"use client";
import { useState } from "react";
import { Users } from "lucide-react";
import { type Api, message } from "@/lib/client";
import { type SessionInfo, permits } from "@/lib/permissions";
import { departmentFor, departmentName } from "@/lib/departments";
import { type Employee } from "@/lib/types";
import { Action, Field, ErrorNotice, Empty } from "./Primitives";
import { Pagination } from "./Pagination";
import { Detail, assignmentStages } from "./order-detail-shared";

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
