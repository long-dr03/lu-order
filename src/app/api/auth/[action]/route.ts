import { z } from "zod";
import { db } from "@/lib/db";
import {
  account,
  authenticate,
  guardWrite,
  ok,
  failure,
  ensure,
  limit,
  hashPassword,
  verifyPassword,
  createSession,
  sessionData,
  revoke,
  randomUUID,
  audit,
  requireAdmin,
} from "@/lib/server/auth";
import { body, password, username, text } from "@/lib/server/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    ensure((await params).action === "session", 404, "Không tìm thấy.");
    return ok(sessionData(authenticate(request, true)));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await params;
    guardWrite(request);
    if (action === "register") {
      limit("register:local", 10);
      const input = z
        .object({ username, name: text, password })
        .strict()
        .parse(await body(request));
      ensure(
        !db
          .prepare("SELECT 1 FROM accounts WHERE username=?")
          .get(input.username),
        422,
        "Tên đăng nhập đã được sử dụng.",
      );
      db.prepare(
        "INSERT INTO accounts(id,username,name,password_hash,status) VALUES (?,?,?,?,'pending')",
      ).run(
        randomUUID(),
        input.username,
        input.name,
        hashPassword(input.password),
      );
      return ok(
        { message: "Đăng ký thành công. Vui lòng chờ admin duyệt tài khoản." },
        201,
      );
    }
    if (action === "login") {
      const input = z
        .object({ username, password: z.string().min(1).max(128) })
        .strict()
        .parse(await body(request));
      limit("login:local", 100);
      limit(`login:${input.username}`, 5);
      const row = db
        .prepare(
          "SELECT id,password_hash,status FROM accounts WHERE username=?",
        )
        .get(input.username) as
        { id: string; password_hash: string; status: string } | undefined;
      // Equalize expensive password work for unknown usernames.
      const valid = verifyPassword(
        input.password,
        row?.password_hash || `${"0".repeat(32)}:${"0".repeat(128)}`,
      );
      ensure(row && valid, 401, "Tên đăng nhập hoặc mật khẩu không đúng.");
      ensure(
        row.status === "active",
        403,
        row.status === "pending"
          ? "Tài khoản đang chờ admin duyệt."
          : "Tài khoản đã bị khóa.",
      );
      db.prepare("DELETE FROM auth_attempts WHERE key=?").run(
        `login:${input.username}`,
      );
      const response = ok({ user: account(row.id) });
      createSession(row.id, response);
      return response;
    }
    if (action === "stop-represent") {
      const token =
        request.headers
          .get("cookie")
          ?.split(";")
          .map((v) => v.trim())
          .find((v) => v.startsWith("luuta_session="))
          ?.slice(14) || "";
      const { hashToken } = await import("@/lib/server/auth");
      const row = db
        .prepare(
          "SELECT account_id,csrf,represented_id FROM sessions WHERE token_hash=? AND expires_at>?",
        )
        .get(hashToken(token), Date.now()) as
        | { account_id: string; csrf: string; represented_id: string | null }
        | undefined;
      ensure(
        row && account(row.account_id)?.status === "active",
        401,
        "Vui lòng đăng nhập.",
      );
      ensure(
        request.headers.get("x-csrf-token") === row.csrf,
        403,
        "Phiên thao tác không hợp lệ.",
      );
      const actor = account(row.account_id)!;
      db.prepare(
        "UPDATE sessions SET represented_id=NULL WHERE token_hash=?",
      ).run(hashToken(token));
      audit(
        {
          actor,
          user: actor,
          tokenHash: hashToken(token),
          csrf: row.csrf,
          representing: false,
        },
        "Kết thúc đại diện",
        "Trở lại tài khoản quản trị.",
      );
      return ok({ message: "Đã thoát đại diện." });
    }
    const ctx = authenticate(request, true);
    guardWrite(request, ctx);
    if (action === "logout") {
      db.prepare("DELETE FROM sessions WHERE token_hash=?").run(ctx.tokenHash);
      const response = ok({ message: "Đã đăng xuất." });
      response.cookies.delete("luuta_session");
      return response;
    }
    if (action === "password") {
      ensure(
        !ctx.representing,
        403,
        "Thoát chế độ đại diện trước khi đổi mật khẩu.",
      );
      const input = z
        .object({ currentPassword: z.string().max(128), newPassword: password })
        .strict()
        .parse(await body(request));
      limit(`password:${ctx.actor.id}`, 5);
      const row = db
        .prepare("SELECT password_hash FROM accounts WHERE id=?")
        .get(ctx.actor.id) as { password_hash: string };
      ensure(
        verifyPassword(input.currentPassword, row.password_hash),
        422,
        "Mật khẩu hiện tại không đúng.",
      );
      ensure(
        input.currentPassword !== input.newPassword,
        422,
        "Mật khẩu mới phải khác mật khẩu hiện tại.",
      );
      db.transaction(() => {
        db.prepare(
          "UPDATE accounts SET password_hash=?,must_change_password=0 WHERE id=?",
        ).run(hashPassword(input.newPassword), ctx.actor.id);
        revoke(ctx.actor.id);
        audit(ctx, "Đổi mật khẩu", "Đã thu hồi các phiên đăng nhập.");
      })();
      const response = ok({
        message: "Đã đổi mật khẩu. Vui lòng đăng nhập lại.",
      });
      response.cookies.delete("luuta_session");
      return response;
    }
    ensure(
      !ctx.actor.must_change_password,
      403,
      "Vui lòng đổi mật khẩu trước.",
    );
    if (action === "represent") {
      requireAdmin(ctx, "users.represent");
      ensure(
        ctx.actor.roles.some((r) => r.id === "admin"),
        403,
        "Chỉ admin có thể đại diện.",
      );
      const input = z
        .object({ accountId: text, password: z.string().max(128) })
        .strict()
        .parse(await body(request));
      limit(`represent:${ctx.actor.id}`, 5);
      const row = db
        .prepare("SELECT password_hash FROM accounts WHERE id=?")
        .get(ctx.actor.id) as { password_hash: string };
      ensure(
        verifyPassword(input.password, row.password_hash),
        422,
        "Mật khẩu xác nhận không đúng.",
      );
      const target = account(input.accountId);
      ensure(
        target?.status === "active" &&
          target.employee_id &&
          !target.must_change_password &&
          !target.roles.some((r) => r.id === "admin"),
        422,
        "Chọn nhân viên đang hoạt động và đã đổi mật khẩu tạm.",
      );
      db.prepare("UPDATE sessions SET represented_id=? WHERE token_hash=?").run(
        target.id,
        ctx.tokenHash,
      );
      audit(
        { ...ctx, user: target, representing: true },
        "Bắt đầu đại diện",
        `Đại diện nhân viên ${target.name}`,
      );
      return ok({ message: "Đã chuyển sang góc nhìn nhân viên." });
    }
    ensure(false, 404, "Không tìm thấy.");
  } catch (e) {
    return failure(e);
  }
}
