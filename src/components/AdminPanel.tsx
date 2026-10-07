"use client";
import { useEffect, useState } from "react";
import {
  UserCheck,
  UserRoundCog,
  Plus,
  Shield,
  Eye,
  Lock,
  KeyRound,
} from "lucide-react";
import {
  PERMISSIONS,
  permissionGroups,
  SCOPE_LABELS,
  scopesForPermission,
  type Account,
  type Role,
  type Grant,
  type SessionInfo,
} from "@/lib/permissions";
import type { Employee, Line } from "@/lib/types";
import { type Api, message } from "@/lib/client";
import { Action, Modal, Field, ErrorNotice, Empty } from "./Primitives";
import { Pagination } from "./Pagination";
interface AdminData {
  users: Account[];
  roles: Role[];
  employees: Employee[];
  lines: Line[];
}
export function AdminPanel({
  api,
  session,
  onRepresent,
  mode,
}: {
  api: Api;
  session: SessionInfo;
  onRepresent: () => Promise<void>;
  mode: "users" | "roles";
}) {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Account | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [represent, setRepresent] = useState<Account | null>(null);
  const [reset, setReset] = useState<Account | null>(null);
  const [confirm, setConfirm] = useState<{
    user: Account;
    action: "lock" | "unlock";
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  useEffect(() => {
    let live = true;
    void api<AdminData>(`/api/admin/${mode}`)
      .then((v) => {
        if (live) {
          setData(v);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(message(e));
      });
    return () => {
      live = false;
    };
  }, [api, mode, revision]);
  const top = Math.max(...session.user.roles.map((r) => r.position), 0);
  async function act(input: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/${mode}`, input);
      setSelected(null);
      setRole(null);
      setReset(null);
      setConfirm(null);
      setRevision((r) => r + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const users =
    data?.users.filter(
      (u) =>
        `${u.name} ${u.username}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (filter === "all" || u.status === filter),
    ) || [];
  const currentPage = Math.min(page, Math.max(1, Math.ceil(users.length / 25)));
  return (
    <div className="stack">
      <ErrorNotice error={error} />
      {mode === "users" ? (
        <section className="panel">
          <div className="panel-toolbar">
            <input
              type="search"
              aria-label="Tìm tài khoản"
              placeholder="Tên hoặc tài khoản…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <select
              aria-label="Trạng thái tài khoản"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Tất cả tài khoản</option>
              <option value="pending">Chờ duyệt</option>
              <option value="active">Đang hoạt động</option>
              <option value="locked">Đã khóa</option>
            </select>
          </div>
          <div className="admin-users">
            {users.slice((currentPage - 1) * 25, currentPage * 25).map((u) => {
              const editable =
                u.id !== session.user.id &&
                u.roles.every((r) => r.position < top);
              return (
                <article key={u.id} className="account-list-entry">
                  <div>
                    <strong>{u.name}</strong>
                    <p className="muted">
                      {u.username} ·{" "}
                      {u.status === "pending"
                        ? "Chờ duyệt"
                        : u.status === "locked"
                          ? "Đã khóa"
                          : "Đang hoạt động"}
                    </p>
                    <div className="role-tags">
                      {u.roles.map((r) => (
                        <span key={r.id}>{r.name}</span>
                      ))}
                    </div>
                    <p className="muted">
                      {u.line_ids
                        .map(
                          (id) =>
                            data?.lines.find((line) => line.id === id)?.name ||
                            `Chuyền ${id}`,
                        )
                        .join(", ") || "Chưa gán chuyền"}
                    </p>
                  </div>
                  <div className="inline-actions account-actions">
                    {editable && (
                      <Action tone="secondary" onClick={() => setSelected(u)}>
                        {u.status === "pending" ? (
                          <UserCheck size={16} />
                        ) : (
                          <UserRoundCog size={16} />
                        )}{" "}
                        {u.status === "pending" ? "Duyệt" : "Cấu hình"}
                      </Action>
                    )}
                    {u.status === "active" &&
                      u.employee_id &&
                      !u.must_change_password &&
                      session.user.roles.some((r) => r.id === "admin") &&
                      session.permissions.some(
                        (g) => g.permission === "users.represent",
                      ) &&
                      !u.roles.some((r) => r.id === "admin") && (
                        <Action
                          tone="secondary"
                          onClick={() => setRepresent(u)}
                        >
                          <Eye size={16} />
                          Thao tác thay
                        </Action>
                      )}
                    {editable && u.status !== "pending" && (
                      <>
                        <Action
                          tone="secondary"
                          onClick={() => setReset(u)}
                        >
                          <KeyRound size={16} />
                          Đổi mật khẩu
                        </Action>
                        <Action
                          tone="secondary"
                          onClick={() =>
                            setConfirm({
                              user: u,
                              action:
                                u.status === "locked" ? "unlock" : "lock",
                            })
                          }
                        >
                          <Lock size={16} />
                          {u.status === "locked" ? "Mở khóa" : "Khóa"}
                        </Action>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {!users.length && <Empty>Không có tài khoản phù hợp.</Empty>}
          <Pagination
            page={currentPage}
            total={users.length}
            onChange={setPage}
          />
        </section>
      ) : (
        <>
          <div className="inline-actions">
            <Action
              onClick={() =>
                setRole({
                  id: "",
                  name: "",
                  position: 5,
                  protected: 0,
                  grants: [],
                })
              }
            >
              <Plus size={18} />
              Tạo vai trò
            </Action>
          </div>
          <div className="operations-grid">
            {data?.roles.map((r) => (
              <article key={r.id} className="panel padded">
                <h3>
                  <Shield size={20} />
                  {r.name}
                </h3>
                <p className="muted">
                  Thứ bậc {r.position} · {r.grants.length} quyền
                </p>
                <Action
                  tone="secondary"
                  disabled={!!r.protected || r.position >= top}
                  onClick={() => setRole(r)}
                >
                  Cấu hình quyền
                </Action>
              </article>
            ))}
          </div>
        </>
      )}
      <Modal
        open={!!selected}
        onClose={() => {
          if (!busy) setSelected(null);
        }}
        title={
          selected?.status === "pending"
            ? "Duyệt tài khoản"
            : "Cấu hình tài khoản"
        }
        description={selected?.username}
        wide
      >
        {selected && data && (
          <AccountForm
            key={selected.id}
            user={selected}
            data={data}
            top={top}
            busy={busy}
            error={error}
            onSubmit={act}
          />
        )}
      </Modal>
      <Modal
        open={!!role}
        onClose={() => {
          if (!busy) setRole(null);
        }}
        title="Cấu hình vai trò"
        description="Bật từng quyền và chọn phạm vi; thứ bậc giới hạn quyền quản lý vai trò."
        wide
      >
        {role && (
          <RoleForm
            key={role.id}
            role={role}
            top={top}
            busy={busy}
            error={error}
            onSubmit={act}
          />
        )}
      </Modal>
      <Modal
        open={!!reset}
        onClose={() => {
          if (!busy) setReset(null);
        }}
        title="Đặt lại mật khẩu"
        description={reset?.username}
      >
        <form
          action={(form) => {
            if (reset)
              act({
                id: reset.id,
                action: "reset",
                temporaryPassword: form.get("password"),
              });
          }}
          className="stack"
        >
          <p>
            Tất cả session sẽ bị thu hồi. Nhân viên phải đổi mật khẩu tạm khi
            đăng nhập.
          </p>
          <ErrorNotice error={error} />
          <Field label="Mật khẩu tạm (ít nhất 10 ký tự)">
            <input
              name="password"
              type="password"
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </Field>
          <Action type="submit" busy={busy}>
            Đặt lại mật khẩu
          </Action>
        </form>
      </Modal>
      <Modal
        open={!!confirm}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
        title={
          confirm?.action === "lock" ? "Khóa tài khoản" : "Mở khóa tài khoản"
        }
        description={confirm?.user.username}
      >
        <div className="stack">
          <p>
            {confirm?.action === "lock"
              ? "Các phiên đăng nhập của tài khoản này sẽ bị thu hồi."
              : "Tài khoản sẽ được phép đăng nhập trở lại."}
          </p>
          <ErrorNotice error={error} />
          <Action
            busy={busy}
            onClick={() => {
              if (confirm) act({ id: confirm.user.id, action: confirm.action });
            }}
          >
            Xác nhận
          </Action>
        </div>
      </Modal>
      <Modal
        open={!!represent}
        onClose={() => {
          if (!busy) setRepresent(null);
        }}
        title="Xem và thao tác thay nhân viên"
        description={represent?.name}
      >
        <form
          action={async (form) => {
            if (!represent) return;
            setBusy(true);
            setError("");
            try {
              await api("/api/auth/represent", {
                accountId: represent.id,
                password: form.get("password"),
              });
              setRepresent(null);
              await onRepresent();
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
          className="stack"
        >
          <p>
            Màn hình sẽ dùng quyền và dữ liệu của nhân viên. Nhật ký luôn ghi
            bạn là người thực hiện.
          </p>
          <ErrorNotice error={error} />
          <Field label="Xác nhận mật khẩu admin">
            <input
              name="password"
              type="password"
              maxLength={128}
              autoComplete="current-password"
              required
            />
          </Field>
          <Action type="submit" busy={busy}>
            Bắt đầu đại diện
          </Action>
        </form>
      </Modal>
    </div>
  );
}
function AccountForm({
  user,
  data,
  top,
  busy,
  error,
  onSubmit,
}: {
  user: Account;
  data: AdminData;
  top: number;
  busy: boolean;
  error: string;
  onSubmit: (input: unknown) => Promise<void>;
}) {
  const [roles, setRoles] = useState(user.roles.map((r) => r.id));
  const [lines, setLines] = useState(user.line_ids);
  const linked = data.employees.find((e) => e.id === user.employee_id);
  const [homeLine, setHomeLine] = useState(
    linked?.line_id || user.line_ids[0] || data.lines[0]?.id || 1,
  );
  const [create, setCreate] = useState(!user.employee_id);
  const [employee, setEmployee] = useState(user.employee_id || "");
  return (
    <form
      action={(form) =>
        onSubmit({
          id: user.id,
          action: user.status === "pending" ? "approve" : "update",
          name: form.get("name"),
          roleIds: roles,
          lineIds: lines,
          homeLineId: homeLine,
          ...(user.employee_id
            ? {}
            : { createEmployee: create, employeeId: create ? null : employee }),
        })
      }
      className="stack"
    >
      <ErrorNotice error={error} />
      <Field label="Họ tên">
        <input name="name" defaultValue={user.name} required />
      </Field>
      {user.employee_id ? (
        <div className="account-personal-profile">
          <strong>Hồ sơ cá nhân của tài khoản</strong>
          <p>
            {user.name} · {user.employee_id}
          </p>
          <p className="muted">
            Hồ sơ này đi cùng tài khoản. Đổi chuyền không đổi người hoặc lịch sử
            công việc.
          </p>
        </div>
      ) : (
        <>
          <p className="muted">
            Tạo hồ sơ của chính người đăng ký, hoặc liên kết một lần với hồ sơ
            của họ đã có trong xưởng.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={create}
              onChange={(e) => setCreate(e.target.checked)}
            />
            Tạo hồ sơ nhân viên mới
          </label>
          {!create && (
            <Field label="Hồ sơ của người đăng ký (liên kết một lần)">
              <select
                value={employee}
                onChange={(e) => {
                  setEmployee(e.target.value);
                  const emp = data.employees.find(
                    (x) => x.id === e.target.value,
                  );
                  if (emp) setHomeLine(emp.line_id);
                  if (emp && !lines.includes(emp.line_id))
                    setLines([...lines, emp.line_id]);
                }}
                required
              >
                <option value="">Chọn nhân viên</option>
                {data.employees
                  .filter(
                    (e) =>
                      !data.users.some(
                        (u) => u.employee_id === e.id && u.id !== user.id,
                      ),
                  )
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · Chuyền {e.line_id}
                    </option>
                  ))}
              </select>
            </Field>
          )}
        </>
      )}
      <Field label="Chuyền làm việc của người này">
        <select
          value={homeLine}
          onChange={(event) => {
            const next = Number(event.target.value);
            setHomeLine(next);
            if (lines.length === 1 && lines.includes(homeLine))
              setLines([next]);
            else if (!lines.includes(next)) setLines([...lines, next]);
          }}
        >
          {data.lines.map((line) => (
            <option key={line.id} value={line.id}>
              {line.name}
            </option>
          ))}
        </select>
      </Field>
      <fieldset>
        <legend>Vai trò</legend>
        {data.roles
          .filter((r) => !r.protected && r.position < top)
          .map((r) => (
            <label className="check-label" key={r.id}>
              <input
                type="checkbox"
                checked={roles.includes(r.id)}
                onChange={(e) =>
                  setRoles(
                    e.target.checked
                      ? [...roles, r.id]
                      : roles.filter((x) => x !== r.id),
                  )
                }
              />
              {r.name}
            </label>
          ))}
      </fieldset>
      <fieldset>
        <legend>Chuyền được giao / phụ trách</legend>
        {data.lines.map((l) => (
          <label className="check-label" key={l.id}>
            <input
              type="checkbox"
              checked={lines.includes(l.id)}
              onChange={(e) =>
                setLines(
                  e.target.checked
                    ? [...lines, l.id]
                    : lines.filter((x) => x !== l.id),
                )
              }
            />
            {l.name}
          </label>
        ))}
      </fieldset>
      <p className="muted">
        Vai trò quyết định thao tác; các chuyền được giao quyết định phạm vi.
        Nhân viên được ghi nhận việc tại các chuyền được giao; chuyền làm việc
        là chuyền chính. Khi điều chuyển, chọn chuyền làm việc mới và bỏ chuyền
        cũ nếu không còn phụ trách.
      </p>
      <div className="account-line-roster">
        {data.lines
          .filter((line) => lines.includes(line.id))
          .map((line) => {
            const members = data.employees.filter(
              (person) =>
                person.line_id === line.id && person.id !== user.employee_id,
            );
            return (
              <section key={line.id}>
                <h3>
                  {line.name} · {members.length} nhân viên khác hiện có
                </h3>
                <ul>
                  {members.map((person) => (
                    <li key={person.id}>{person.name}</li>
                  ))}
                </ul>
                {!members.length && (
                  <p className="muted">Chưa có nhân viên khác trong chuyền.</p>
                )}
              </section>
            );
          })}
      </div>
      <Action
        type="submit"
        busy={busy}
        disabled={!roles.length || !lines.length || !lines.includes(homeLine)}
      >
        Lưu và cấp quyền
      </Action>
    </form>
  );
}
function RoleForm({
  role,
  top,
  busy,
  error,
  onSubmit,
}: {
  role: Role;
  top: number;
  busy: boolean;
  error: string;
  onSubmit: (input: unknown) => Promise<void>;
}) {
  const [grants, setGrants] = useState<Grant[]>(role.grants);
  return (
    <form
      action={(form) =>
        onSubmit({
          ...(role.id ? { id: role.id } : {}),
          name: form.get("name"),
          position: Number(form.get("position")),
          grants,
        })
      }
      className="stack"
    >
      <ErrorNotice error={error} />
      <div className="form-grid">
        <Field label="Tên vai trò">
          <input
            name="name"
            defaultValue={role.name}
            required
            maxLength={160}
          />
        </Field>
        <Field label="Thứ bậc">
          <input
            name="position"
            type="number"
            min={1}
            max={Math.min(99, top - 1)}
            defaultValue={role.position}
            required
          />
        </Field>
      </div>
      {permissionGroups.map((group) => (
        <fieldset key={group.prefix}>
          <legend>{group.label}</legend>
          {(Object.entries(PERMISSIONS) as [Grant["permission"], string][])
            .filter(([key]) => key.startsWith(group.prefix))
            .map(([key, label]) => {
              const grant = grants.find((g) => g.permission === key);
              return (
                <div className="grant-row" key={key}>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={!!grant}
                      onChange={(e) =>
                        setGrants(
                          e.target.checked
                            ? [
                                ...grants,
                                {
                                  permission: key,
                                  scope: scopesForPermission(key)[0],
                                },
                              ]
                            : grants.filter((g) => g.permission !== key),
                        )
                      }
                    />
                    {label}
                  </label>
                  <select
                    aria-label={`Phạm vi ${label}`}
                    disabled={!grant}
                    value={grant?.scope || scopesForPermission(key)[0]}
                    onChange={(e) =>
                      setGrants(
                        grants.map((g) =>
                          g.permission === key
                            ? { ...g, scope: e.target.value as Grant["scope"] }
                            : g,
                        ),
                      )
                    }
                  >
                    {scopesForPermission(key).map((value) => (
                      <option key={value} value={value}>
                        {SCOPE_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
        </fieldset>
      ))}
      <Action type="submit" busy={busy}>
        Lưu vai trò
      </Action>
    </form>
  );
}
