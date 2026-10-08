import { isOperator } from "../departments";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "../db";
import { initializeDatabase } from "./migrate";
import {
  type Account,
  type Role,
  type Grant,
  type Permission,
  grantsFor,
  hasPermission,
  permits,
} from "../permissions";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function ensure(
  condition: unknown,
  status: number,
  message: string,
): asserts condition {
  if (!condition) throw new AppError(status, message);
}
export const hashToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function hashPassword(value: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(value, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex")}`;
}
export function verifyPassword(value: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key || key.length !== 128) return false;
  const computed = scryptSync(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(computed, Buffer.from(key, "hex"));
}
export async function getRoles(): Promise<Role[]> {
  const roles = (await db
    .prepare("SELECT * FROM roles ORDER BY position DESC,name")
    .all()) as Omit<Role, "grants">[];
  const grants = (await db
    .prepare("SELECT role_id,permission,scope FROM role_grants")
    .all()) as (Grant & { role_id: string })[];
  return roles.map((role) => ({
    ...role,
    grants: grants
      .filter((g) => g.role_id === role.id)
      .map(({ permission, scope }) => ({ permission, scope })),
  }));
}
export async function account(id: string): Promise<Account | null> {
  const row = (await db
    .prepare(
      "SELECT id,username,name,status,employee_id,line_ids,must_change_password FROM accounts WHERE id=?",
    )
    .get(id)) as
    (Omit<Account, "roles" | "line_ids"> & { line_ids: string }) | undefined;
  if (!row) return null;
  const ids = (await db
    .prepare("SELECT role_id FROM account_roles WHERE account_id=?")
    .all(id)) as { role_id: string }[];
  return {
    ...row,
    line_ids: undefined,
    department_ids: row.employee_id
      ? (
          (await db
            .prepare(
              "SELECT department_id FROM employee_departments WHERE employee_id=? ORDER BY department_id",
            )
            .all(row.employee_id)) as {
            department_id: import("../departments").DepartmentId;
          }[]
        ).map((d) => d.department_id)
      : [],
    roles: (await getRoles()).filter((r) =>
      ids.some((i) => i.role_id === r.id),
    ),
  };
}
export interface Context {
  actor: Account;
  user: Account;
  tokenHash: string;
  csrf: string;
  representing: boolean;
}
function token(request: Request) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("luuta_session="))
      ?.slice(14) || ""
  );
}
export async function authenticate(
  request: Request,
  allowPasswordChange = false,
): Promise<Context> {
  await initializeDatabase();
  const tokenHash = hashToken(token(request));
  const session = (await db
    .prepare("SELECT * FROM sessions WHERE token_hash=? AND expires_at>?")
    .get(tokenHash, Date.now())) as
    | { account_id: string; represented_id: string | null; csrf: string }
    | undefined;
  ensure(session, 401, "Vui lòng đăng nhập.");
  const actor = await account(session.account_id);
  ensure(actor?.status === "active", 401, "Tài khoản không còn hoạt động.");
  ensure(
    allowPasswordChange || !actor.must_change_password,
    403,
    "Bạn cần đổi mật khẩu trước khi tiếp tục.",
  );
  const representing = !!session.represented_id;
  if (representing)
    ensure(
      hasPermission(actor, "users.represent") &&
        actor.roles.some((r) => r.id === "admin"),
      403,
      "Không còn quyền đại diện.",
    );
  const user = representing ? await account(session.represented_id!) : actor;
  ensure(
    user?.status === "active",
    403,
    "Nhân viên được đại diện không còn hoạt động.",
  );
  ensure(
    !representing || !user.must_change_password,
    403,
    "Nhân viên cần đổi mật khẩu trước khi được đại diện.",
  );
  ensure(
    user.roles.some((r) => r.id !== "worker"),
    403,
    "Thợ chỉ có hồ sơ; người quản lý ghi nhận công việc thay thợ.",
  );
  if (user.employee_id)
    ensure(
      (
        (await db
          .prepare("SELECT active FROM employees WHERE id=?")
          .get(user.employee_id)) as { active: number } | undefined
      )?.active === 1,
      403,
      "Hồ sơ đã ngừng hoạt động.",
    );
  return { actor, user, tokenHash, csrf: session.csrf, representing };
}
export function requirePermission(
  ctx: Context,
  permission: Permission,
  resource?: {
    employeeId?: string | null;
    lineId?: number | null;
    departmentId?: string | null;
    stage?: string;
  },
) {
  ensure(
    isOperator(ctx.user),
    403,
    "Tài khoản chưa được Admin phân loại bộ phận. Vui lòng liên hệ Admin.",
  );
  ensure(
    resource
      ? permits(ctx.user, permission, resource)
      : hasPermission(ctx.user, permission),
    403,
    "Bạn không có quyền thực hiện thao tác này.",
  );
}
export function requireAdmin(ctx: Context, permission: Permission) {
  ensure(
    !ctx.representing,
    403,
    "Thoát chế độ đại diện để quản trị tài khoản.",
  );
  requirePermission(ctx, permission, {});
}
export function guardWrite(
  request: Request,
  ctx?: Context,
  options = { contentType: "application/json", maxBytes: 100_000 },
) {
  const origin = request.headers.get("origin");
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (request.url.startsWith("https") ? "https" : "http");
  const hostOrigin = host ? `${proto}://${host}` : new URL(request.url).origin;
  const expected = process.env.APP_ORIGIN || hostOrigin;
  const isAllowedOrigin = origin === expected;
  ensure(isAllowedOrigin, 403, "Nguồn yêu cầu không hợp lệ.");
  ensure(
    request.headers.get("content-type")?.startsWith(options.contentType),
    415,
    "Định dạng yêu cầu không hợp lệ.",
  );
  ensure(
    Number(request.headers.get("content-length") || 0) <= options.maxBytes,
    413,
    "Dữ liệu quá lớn.",
  );
  if (ctx)
    ensure(
      request.headers.get("x-csrf-token") === ctx.csrf,
      403,
      "Phiên thao tác không hợp lệ. Hãy tải lại trang.",
    );
}
export async function audit(
  ctx: Context,
  action: string,
  details: string,
  lineId?: number | null,
  departmentId?: string,
) {
  await db
    .prepare(
      "INSERT INTO audit_logs(user_name,action,details,actor_id,represented_id,line_id,department_id) VALUES (?,?,?,?,?,?,?)",
    )
    .run(
      ctx.actor.name,
      action,
      details,
      ctx.actor.id,
      ctx.representing ? ctx.user.id : null,
      lineId ?? null,
      departmentId ||
        (ctx.user.department_ids?.length === 1
          ? ctx.user.department_ids[0]
          : null),
    );
}
export function actorLabel(ctx: Context) {
  return ctx.representing
    ? `${ctx.actor.name} → ${ctx.user.name}`
    : ctx.actor.name;
}
export async function createSession(id: string, response: NextResponse) {
  const value = randomBytes(32).toString("hex");
  await db
    .prepare(
      "INSERT INTO sessions(token_hash,account_id,csrf,expires_at) VALUES (?,?,?,?)",
    )
    .run(
      hashToken(value),
      id,
      randomBytes(32).toString("hex"),
      Date.now() + 86400000,
    );
  response.cookies.set("luuta_session", value, {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.SESSION_COOKIE_SECURE === "true" ||
      process.env.APP_ORIGIN?.startsWith("https://") === true,
    path: "/",
    maxAge: 86400,
  });
}
export async function limit(key: string, maximum: number, windowMs = 900000) {
  return db.transaction(async () => {
    const now = Date.now();
    const row = (await db
      .prepare("SELECT count,reset_at FROM auth_attempts WHERE key=?")
      .get(key)) as { count: number; reset_at: number } | undefined;
    if (!row || row.reset_at <= now)
      await db
        .prepare(
          "INSERT INTO auth_attempts VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,reset_at=excluded.reset_at",
        )
        .run(key, 1, now + windowMs);
    else {
      ensure(
        row.count < maximum,
        429,
        "Quá nhiều lần thử. Vui lòng thử lại sau 15 phút.",
      );
      await db
        .prepare("UPDATE auth_attempts SET count=count+1 WHERE key=?")
        .run(key);
    }
  })();
}
export function ok<T>(data: T, status = 200) {
  return NextResponse.json(
    { success: true, data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export function failure(error: unknown) {
  if (error instanceof AppError)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  if (error instanceof Error && error.name === "ZodError")
    return NextResponse.json(
      {
        success: false,
        error: "Dữ liệu không hợp lệ. Kiểm tra các trường đã nhập.",
      },
      { status: 422 },
    );
  console.error(
    "LUUTA request failed",
    error instanceof Error ? error.name : "Unknown error",
  );
  return NextResponse.json(
    { success: false, error: "Không thể xử lý yêu cầu. Vui lòng thử lại." },
    { status: 500 },
  );
}
export function sessionData(ctx: Context) {
  return {
    user: ctx.user,
    actor: { id: ctx.actor.id, name: ctx.actor.name },
    representing: ctx.representing,
    permissions: grantsFor(ctx.user),
    csrf: ctx.csrf,
  };
}
export async function revoke(id: string) {
  await db
    .prepare("DELETE FROM sessions WHERE account_id=? OR represented_id=?")
    .run(id, id);
}
export { randomUUID };
