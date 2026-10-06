import { z } from "zod";
import { db, getEmployees, getLines } from "@/lib/db";
import {
  PERMISSIONS,
  scopesForPermission,
  type Grant,
} from "@/lib/permissions";
import {
  authenticate,
  guardWrite,
  ok,
  failure,
  ensure,
  requireAdmin,
  getRoles,
  account,
  hashPassword,
  revoke,
  audit,
  randomUUID,
} from "@/lib/server/auth";
import { body, text, line, password } from "@/lib/server/validation";
import { initializeDatabase } from "@/lib/server/migrate";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ section: string }> },
) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    const { section } = await params;
    requireAdmin(ctx, section === "roles" ? "roles.manage" : "users.manage");
    ensure(["roles", "users"].includes(section), 404, "Không tìm thấy.");
    return ok({
      roles: await getRoles(),
      users:
        section === "users"
          ? await Promise.all(
              (
                (await db
                  .prepare("SELECT id FROM accounts ORDER BY created_at DESC")
                  .all()) as { id: string }[]
              ).map(async (r) => await account(r.id)),
            )
          : [],
      employees: await getEmployees(),
      lines: await getLines(),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ section: string }> },
) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    guardWrite(request, ctx);
    const { section } = await params;
    requireAdmin(ctx, section === "roles" ? "roles.manage" : "users.manage");
    const top = Math.max(...ctx.actor.roles.map((r) => r.position), 0);
    if (section === "roles") {
      const input = z
        .object({
          id: z.string().optional(),
          name: text,
          position: z.number().int().min(1).max(99),
          grants: z
            .array(
              z.object({
                permission: z.enum(
                  Object.keys(PERMISSIONS) as [
                    Grant["permission"],
                    ...Grant["permission"][],
                  ],
                ),
                scope: z.enum(["self", "lines", "all"]),
              }),
            )
            .max(30),
        })
        .strict()
        .parse(await body(request));
      const existing = input.id
        ? (await getRoles()).find((r) => r.id === input.id)
        : null;
      ensure(!input.id || existing, 404, "Không tìm thấy vai trò.");
      ensure(
        !existing?.protected &&
          (!existing || existing.position < top) &&
          input.position < top,
        403,
        "Chỉ được sửa vai trò thấp hơn vai trò của bạn.",
      );
      ensure(
        input.grants.every((g) =>
          scopesForPermission(g.permission).includes(g.scope),
        ),
        422,
        "Phạm vi không phù hợp với thao tác được cấp.",
      );
      ensure(
        !input.grants.some(
          (g) =>
            !ctx.actor.roles
              .flatMap((r) => r.grants)
              .some(
                (owned) =>
                  owned.permission === g.permission &&
                  (owned.scope === "all" || owned.scope === g.scope),
              ),
        ),
        403,
        "Không thể cấp quyền hoặc phạm vi vượt quyền của bạn.",
      );
      ensure(
        new Set(input.grants.map((g) => g.permission)).size ===
          input.grants.length,
        422,
        "Mỗi quyền chỉ được cấu hình một lần.",
      );
      const duplicate = (await db
        .prepare("SELECT id FROM roles WHERE name=?")
        .get(input.name)) as { id: string } | undefined;
      ensure(
        !duplicate || duplicate.id === input.id,
        422,
        "Tên vai trò đã tồn tại.",
      );
      const id = input.id || randomUUID();
      await db.transaction(async () => {
        await db
          .prepare(
            "INSERT INTO roles(id,name,position) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,position=excluded.position",
          )
          .run(id, input.name, input.position);
        await db.prepare("DELETE FROM role_grants WHERE role_id=?").run(id);
        for (const g of input.grants)
          await db
            .prepare("INSERT INTO role_grants VALUES (?,?,?)")
            .run(id, g.permission, g.scope);
        await audit(ctx, "Cấu hình vai trò", input.name);
      })();
      return ok({ id });
    }
    ensure(section === "users", 404, "Không tìm thấy.");
    const input = z
      .object({
        id: text,
        action: z.enum(["approve", "update", "lock", "unlock", "reset"]),
        name: text.optional(),
        employeeId: z.string().nullable().optional(),
        createEmployee: z.boolean().optional(),
        lineIds: z.array(line).max(5).optional(),
        homeLineId: line.optional(),
        roleIds: z.array(z.string()).min(1).max(20).optional(),
        temporaryPassword: password.optional(),
      })
      .strict()
      .parse(await body(request));
    const target = await account(input.id);
    ensure(target, 404, "Không tìm thấy tài khoản.");
    ensure(
      target.id !== ctx.actor.id,
      403,
      "Không được tự sửa vai trò hoặc khóa tài khoản của mình.",
    );
    ensure(
      target.roles.every((r) => r.position < top),
      403,
      "Không được sửa tài khoản có vai trò bằng hoặc cao hơn bạn.",
    );
    // The admin role is protected; all subsequent administrators are assigned via offline setup.
    if (input.roleIds)
      ensure(
        (
          await Promise.all(
            input.roleIds.map(async (id) =>
              (await getRoles()).some(
                (r) => r.id === id && r.position < top && !r.protected,
              ),
            ),
          )
        ).every(Boolean),
        403,
        "Không được cấp vai trò bằng hoặc cao hơn bạn.",
      );
    if (input.roleIds)
      ensure(
        (
          await Promise.all(
            input.roleIds.map(async (id) =>
              (await getRoles())
                .find((r) => r.id === id)
                ?.grants.every((g) =>
                  ctx.actor.roles
                    .flatMap((r) => r.grants)
                    .some(
                      (owned) =>
                        owned.permission === g.permission &&
                        (owned.scope === "all" || owned.scope === g.scope),
                    ),
                ),
            ),
          )
        ).every(Boolean),
        403,
        "Không thể gán vai trò có quyền vượt quyền của bạn.",
      );
    await db.transaction(async () => {
      if (input.action === "reset") {
        ensure(input.temporaryPassword, 422, "Cần nhập mật khẩu tạm.");
        await db
          .prepare(
            "UPDATE accounts SET password_hash=?,must_change_password=1 WHERE id=?",
          )
          .run(hashPassword(input.temporaryPassword), target.id);
      } else if (input.action === "lock" || input.action === "unlock") {
        ensure(
          input.action === "lock" || target.status === "locked",
          422,
          "Tài khoản chưa bị khóa.",
        );
        await db
          .prepare("UPDATE accounts SET status=? WHERE id=?")
          .run(input.action === "lock" ? "locked" : "active", target.id);
      } else {
        ensure(
          input.roleIds?.length && input.lineIds?.length,
          422,
          "Chọn vai trò và ít nhất một chuyền.",
        );
        ensure(
          !target.employee_id ||
            (!input.createEmployee &&
              (input.employeeId === undefined ||
                input.employeeId === target.employee_id)),
          422,
          "Hồ sơ cá nhân đã gắn với tài khoản; không được đổi sang người khác.",
        );
        let employeeId =
          input.employeeId === undefined
            ? target.employee_id
            : input.employeeId;
        if (input.createEmployee) {
          employeeId = `NV-${randomUUID().slice(0, 8)}`;
          await db
            .prepare(
              "INSERT INTO employees(id,name,line_id,role,phone) VALUES (?,?,?,?,?)",
            )
            .run(
              employeeId,
              input.name || target.name,
              input.homeLineId || input.lineIds[0],
              "Nhân viên",
              "",
            );
        }
        ensure(
          employeeId &&
            (await db
              .prepare("SELECT 1 FROM employees WHERE id=?")
              .get(employeeId)),
          422,
          "Liên kết tài khoản với nhân viên.",
        );
        const used = await db
          .prepare("SELECT id FROM accounts WHERE employee_id=? AND id!=?")
          .get(employeeId, target.id);
        ensure(!used, 422, "Nhân viên đã liên kết tài khoản khác.");
        const emp = (await db
          .prepare("SELECT line_id FROM employees WHERE id=?")
          .get(employeeId)) as { line_id: number };
        const homeLineId =
          input.homeLineId ||
          (input.lineIds.includes(emp.line_id)
            ? emp.line_id
            : input.lineIds[0]);
        ensure(
          input.lineIds.includes(homeLineId),
          422,
          "Chuyền làm việc phải nằm trong các chuyền được giao.",
        );
        ensure(
          (await db
            .prepare("SELECT 1 FROM lines WHERE id=?")
            .get(homeLineId)) &&
            (
              await Promise.all(
                input.lineIds.map(
                  async (id) =>
                    await db.prepare("SELECT 1 FROM lines WHERE id=?").get(id),
                ),
              )
            ).every(Boolean),
          422,
          "Chuyền không tồn tại.",
        );
        const before = {
          name: target.name,
          employeeId: target.employee_id,
          homeLineId: emp.line_id,
          lineIds: target.line_ids,
          roleIds: target.roles.map((r) => r.id),
        };
        await db
          .prepare("UPDATE employees SET name=?,line_id=? WHERE id=?")
          .run(input.name || target.name, homeLineId, employeeId);
        await audit(
          ctx,
          "Điều chỉnh hồ sơ và chuyền",
          `${target.username}: Trước ${JSON.stringify(before)}; Sau ${JSON.stringify({ name: input.name || target.name, employeeId, homeLineId, lineIds: input.lineIds, roleIds: input.roleIds })}`,
          homeLineId,
        );
        await db
          .prepare(
            "UPDATE accounts SET status='active',name=?,employee_id=?,line_ids=? WHERE id=?",
          )
          .run(
            input.name || target.name,
            employeeId,
            JSON.stringify([...new Set(input.lineIds)]),
            target.id,
          );
        await db
          .prepare("DELETE FROM account_roles WHERE account_id=?")
          .run(target.id);
        for (const id of new Set(input.roleIds))
          await db
            .prepare("INSERT INTO account_roles VALUES (?,?)")
            .run(target.id, id);
      }
      await revoke(target.id);
      await audit(
        ctx,
        "Quản lý tài khoản",
        `${input.action}: ${target.username}`,
      );
    })();
    return ok({ user: await account(target.id) });
  } catch (e) {
    return failure(e);
  }
}
