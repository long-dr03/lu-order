"use client";
import { useState } from "react";
import { ChevronDown, Users } from "lucide-react";
import { type Api, message } from "@/lib/client";
import { type SessionInfo, permits } from "@/lib/permissions";
import { departmentFor } from "@/lib/departments";
import { type Employee } from "@/lib/types";
import { Action, ErrorNotice } from "./Primitives";
import {
  type AssignmentScope,
  Detail,
  assignmentStages,
  scopeLabel,
} from "./order-detail-shared";

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
        names: assigned.map((a) => {
          const part = scopeLabel(a);
          return part ? `${a.employee_name} (${part})` : a.employee_name;
        }),
        scopes: Object.fromEntries(
          assigned.map((a) => [
            a.employee_id,
            { colors: a.colors || [], sizes: a.sizes || [] },
          ]),
        ) as Record<string, AssignmentScope>,
        // The department's people, plus anyone lent to this stage from elsewhere.
        staff: employees.filter(
          (e) =>
            e.active !== 0 &&
            (e.department_ids?.includes(departmentFor(stage)) ||
              assigned.some((a) => a.employee_id === e.id)),
        ),
      };
    });
  });
  // Someone who cannot assign a stage still sees who works on it.
  const shown = tasks.filter((t) => t.editable || t.ids.length);
  const [openKey, setOpenKey] = useState("");
  const [chosen, setChosen] = useState<string[] | null>(null);
  // Colours and sizes per worker while a row is open; null until something is changed.
  const [scopeDraft, setScopeDraft] = useState<Record<
    string,
    AssignmentScope
  > | null>(null);
  const colors = [...new Set((order.variants || []).map((v) => v.color))];
  const sizes = [...new Set((order.variants || []).map((v) => v.size))];
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const empty = tasks.filter(
    (t) => t.editable && !t.ids.length && t.staff.length,
  );
  const toggle = (key: string) => {
    setOpenKey(openKey === key ? "" : key);
    setChosen(null);
    setScopeDraft(null);
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
      setScopeDraft(null);
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
            (!!scopeDraft ||
              (!!chosen &&
                (chosen.length !== t.ids.length ||
                  chosen.some((id) => !t.ids.includes(id)))));
          const scopeOf = (id: string): AssignmentScope =>
            scopeDraft?.[id] || t.scopes[id] || { colors: [], sizes: [] };
          const setScope = (id: string, next: AssignmentScope) =>
            setScopeDraft({
              ...Object.fromEntries(picked.map((p) => [p, scopeOf(p)])),
              [id]: next,
            });
          const flip = (values: string[], value: string) =>
            values.includes(value)
              ? values.filter((v) => v !== value)
              : [...values, value];
          // One colour (or size) per worker in turn: three colours, three sewers, one tap.
          const dealOut = (field: "colors" | "sizes") => {
            const values = field === "colors" ? colors : sizes;
            setScopeDraft(
              Object.fromEntries(
                picked.map((id, i) => [
                  id,
                  {
                    ...scopeOf(id),
                    // More workers than colours: go round again rather than leave someone with "all".
                    [field]:
                      values.length >= picked.length
                        ? values.filter((_, n) => n % picked.length === i)
                        : [values[i % values.length]],
                  },
                ]),
              ),
            );
          };
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
                  {!!picked.length &&
                    (colors.length > 1 || sizes.length > 1) && (
                      <div className="assign-scope">
                        <div className="assign-scope-head">
                          <strong>Chia màu / size</strong>
                          <small>Không chọn gì = làm tất cả</small>
                          {picked.length > 1 && colors.length > 1 && (
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => dealOut("colors")}
                            >
                              Mỗi thợ một màu
                            </button>
                          )}
                          {picked.length > 1 && sizes.length > 1 && (
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => dealOut("sizes")}
                            >
                              Mỗi thợ một size
                            </button>
                          )}
                        </div>
                        {picked.map((id) => {
                          const scope = scopeOf(id);
                          const name =
                            employees.find((e) => e.id === id)?.name || id;
                          return (
                            <div
                              className="assign-scope-row"
                              key={id}
                              role="group"
                              aria-label={`Màu và size của ${name}`}
                            >
                              <span>{name}</span>
                              <div className="scope-chips">
                                {colors.length > 1 &&
                                  colors.map((c) => (
                                    <button
                                      type="button"
                                      key={`c-${c}`}
                                      aria-pressed={scope.colors.includes(c)}
                                      onClick={() =>
                                        setScope(id, {
                                          ...scope,
                                          colors: flip(scope.colors, c),
                                        })
                                      }
                                    >
                                      {c}
                                    </button>
                                  ))}
                                {sizes.length > 1 &&
                                  sizes.map((z) => (
                                    <button
                                      type="button"
                                      key={`s-${z}`}
                                      className="size"
                                      aria-pressed={scope.sizes.includes(z)}
                                      onClick={() =>
                                        setScope(id, {
                                          ...scope,
                                          sizes: flip(scope.sizes, z),
                                        })
                                      }
                                    >
                                      {z}
                                    </button>
                                  ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
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
                              scopes: Object.fromEntries(
                                picked.map((id) => [id, scopeOf(id)]),
                              ),
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
