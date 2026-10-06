import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "../db";
import "./migrate";
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
export function getRoles(): Role[] {
  return (
    db.prepare("SELECT * FROM roles ORDER BY position DESC,name").all() as Omit<
      Role,
      "grants"
    >[]
  ).map((role) => ({
    ...role,
    grants: db
      .prepare("SELECT permission,scope FROM role_grants WHERE role_id=?")
      .all(role.id) as Grant[],
  }));
}
export function account(id: string): Account | null {
  const row = db
    .prepare(
      "SELECT id,username,name,status,employee_id,line_ids,must_change_password FROM accounts WHERE id=?",
    )
    .get(id) as
    (Omit<Account, "roles" | "line_ids"> & { line_ids: string }) | undefined;
  if (!row) return null;
  const ids = db
    .prepare("SELECT role_id FROM account_roles WHERE account_id=?")
    .all(id) as { role_id: string }[];
  return {
    ...row,
    line_ids: JSON.parse(row.line_ids),
    roles: getRoles().filter((r) => ids.some((i) => i.role_id === r.id)),
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
export function authenticate(
  request: Request,
  allowPasswordChange = false,
): Context {
  const tokenHash = hashToken(token(request));
  const session = db
    .prepare("SELECT * FROM sessions WHERE token_hash=? AND expires_at>?")
    .get(tokenHash, Date.now()) as
    | { account_id: string; represented_id: string | null; csrf: string }
    | undefined;
  ensure(session, 401, "Vui lòng đăng nhập.");
  const actor = account(session.account_id);
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
  const user = representing ? account(session.represented_id!) : actor;
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
  return { actor, user, tokenHash, csrf: session.csrf, representing };
}
export function requirePermission(
  ctx: Context,
  permission: Permission,
  resource?: { employeeId?: string | null; lineId?: number },
) {
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
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  ensure(origin === expected, 403, "Nguồn yêu cầu không hợp lệ.");
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
export function audit(
  ctx: Context,
  action: string,
  details: string,
  lineId?: number,
) {
  db.prepare(
    "INSERT INTO audit_logs(user_name,action,details,actor_id,represented_id,line_id) VALUES (?,?,?,?,?,?)",
  ).run(
    ctx.actor.name,
    action,
    details,
    ctx.actor.id,
    ctx.representing ? ctx.user.id : null,
    lineId ?? null,
  );
}
export function actorLabel(ctx: Context) {
  return ctx.representing
    ? `${ctx.actor.name} → ${ctx.user.name}`
    : ctx.actor.name;
}
export function createSession(id: string, response: NextResponse) {
  const value = randomBytes(32).toString("hex");
  db.prepare(
    "INSERT INTO sessions(token_hash,account_id,csrf,expires_at) VALUES (?,?,?,?)",
  ).run(
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
export function limit(key: string, maximum: number, windowMs = 900000) {
  const now = Date.now();
  const row = db
    .prepare("SELECT count,reset_at FROM auth_attempts WHERE key=?")
    .get(key) as { count: number; reset_at: number } | undefined;
  if (!row || row.reset_at <= now)
    db.prepare("INSERT OR REPLACE INTO auth_attempts VALUES (?,?,?)").run(
      key,
      1,
      now + windowMs,
    );
  else {
    ensure(
      row.count < maximum,
      429,
      "Quá nhiều lần thử. Vui lòng thử lại sau 15 phút.",
    );
    db.prepare("UPDATE auth_attempts SET count=count+1 WHERE key=?").run(key);
  }
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
export function revoke(id: string) {
  db.prepare("DELETE FROM sessions WHERE account_id=? OR represented_id=?").run(
    id,
    id,
  );
}
export { randomUUID };
