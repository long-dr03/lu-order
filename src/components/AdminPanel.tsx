"use client";
import { StaffPanel } from "./DepartmentWorkspace";
import { DEPARTMENTS, departmentName } from "@/lib/departments";
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
import type { Employee } from "@/lib/types";
import { type Api, message } from "@/lib/client";
import { Action, Modal, Field, ErrorNotice, Empty } from "./Primitives";
import { Pagination } from "./Pagination";
interface AdminData {
  users: Account[];
  roles: Role[];
  employees: Employee[];
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
  mode: "users" | "roles" | "employees";
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
                      {u.department_ids?.map(departmentName).join(", ") ||
                        "Chưa phân loại bộ phận"}
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
                        <Action tone="secondary" onClick={() => setReset(u)}>
                          <KeyRound size={16} />
                          Đổi mật khẩu
                        </Action>
                        <Action
                          tone="secondary"
                          onClick={() =>
                            setConfirm({
                              user: u,
                              action: u.status === "locked" ? "unlock" : "lock",
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
      ) : mode === "roles" ? (
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
      ) : (
        <StaffPanel
          api={api}
          session={session}
          onSaved={async () => {
            setRevision((r) => r + 1);
          }}
        />
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
  const [roles, setRoles] = useState(
    user.roles.filter((r) => r.id !== "worker").map((r) => r.id),
  );
  const [departments, setDepartments] = useState(user.department_ids || []);
  const [create, setCreate] = useState(!user.employee_id);
  const [employee, setEmployee] = useState(user.employee_id || "");
  return (
    <form
      className="stack"
      action={(form) =>
        onSubmit({
          id: user.id,
          action: user.status === "pending" ? "approve" : "update",
          name: form.get("name"),
          roleIds: roles,
          departmentIds: departments,
          ...(user.employee_id
            ? {}
            : { createEmployee: create, employeeId: create ? null : employee }),
        })
      }
    >
      <ErrorNotice error={error} />
      <Field label="Họ tên người quản lý / người ghi nhận">
        <input name="name" required defaultValue={user.name} />
      </Field>
      <p className="muted">
        Tài khoản dành cho người quản lý nhập thay thợ. Thợ chỉ cần hồ sơ tại
        Danh sách thợ.
      </p>
      {!user.employee_id && (
        <>
          <label className="check-label">
            <input
              type="checkbox"
              checked={create}
              onChange={(e) => setCreate(e.target.checked)}
            />
            Tạo hồ sơ người quản lý mới
          </label>
          {!create && (
            <Field label="Liên kết hồ sơ của chính người đăng ký">
              <select
                value={employee}
                required
                onChange={(e) => setEmployee(e.target.value)}
              >
                <option value="">Chọn hồ sơ</option>
                {data.employees
                  .filter((e) => !e.has_account)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
        </>
      )}
      <fieldset>
        <legend>Vai trò</legend>
        {data.roles
          .filter((r) => r.id !== "worker" && !r.protected && r.position < top)
          .map((r) => (
            <label className="check-label" key={r.id}>
              <input
                type="checkbox"
                checked={roles.includes(r.id)}
                onChange={(e) =>
                  setRoles(
                    e.target.checked
                      ? [...roles, r.id]
                      : roles.filter((id) => id !== r.id),
                  )
                }
              />
              {r.name}
            </label>
          ))}
      </fieldset>
      <fieldset>
        <legend>Bộ phận được phụ trách (có thể kiêm nhiệm)</legend>
        {DEPARTMENTS.map((d) => (
          <label className="check-label" key={d.id}>
            <input
              type="checkbox"
              checked={departments.includes(d.id)}
              onChange={(e) =>
                setDepartments(
                  e.target.checked
                    ? [...departments, d.id]
                    : departments.filter((id) => id !== d.id),
                )
              }
            />
            {d.name}
          </label>
        ))}
      </fieldset>
      <p className="muted">
        Vai trò quyết định thao tác; bộ phận giới hạn công đoạn. Quản lý ghi
        nghiệp vụ toàn quy trình, quyền xem lương và quản trị được cấp riêng.
      </p>
      <Action
        type="submit"
        busy={busy}
        disabled={!roles.length || !departments.length}
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
            .filter(
              ([key]) =>
                key !== "delivery.record" && key.startsWith(group.prefix),
            )
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
