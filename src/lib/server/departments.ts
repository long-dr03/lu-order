import { z } from "zod";
import { db, getEmployees, getOrderById } from "../db";
import {
  DEPARTMENTS,
  departmentFor,
  departmentAccess,
  isAdmin,
  isManagement,
  type DepartmentId,
} from "../departments";
import { permits } from "../permissions";
import {
  type Context,
  ensure,
  requirePermission,
  audit,
  randomUUID,
  revoke,
} from "./auth";
import { text } from "./validation";

export const departmentIdSchema = z.enum(
  DEPARTMENTS.map((d) => d.id) as [DepartmentId, ...DepartmentId[]],
);
export async function departmentStaff(ctx: Context) {
  requirePermission(ctx, "orders.view");
  return (await getEmployees())
    .filter(
      (e) =>
        isManagement(ctx.user) ||
        e.department_ids?.some((d) => departmentAccess(ctx.user, d)),
    )
    .map((e) => ({
      ...e,
      phone: permits(ctx.user, "employees.manage") ? e.phone : "",
    }));
}
export const staffSchema = z
  .object({
    action: z.enum(["create", "update", "delete"]),
    id: text.optional(),
    name: text.optional(),
    department_ids: z.array(departmentIdSchema).min(1).max(6).optional(),
    role: z.string().max(100).optional(),
    phone: z.string().max(40).optional(),
    active: z.number().int().min(0).max(1).optional(),
  })
  .strict();
export async function saveStaff(
  ctx: Context,
  input: z.infer<typeof staffSchema>,
) {
  ensure(!ctx.representing, 403, "Thoát chế độ đại diện để quản lý hồ sơ.");
  requirePermission(ctx, "employees.manage");
  return db.transaction(async () => {
    const old = (await getEmployees()).find((e) => e.id === input.id);
    if (input.action !== "create") ensure(old, 404, "Không tìm thấy hồ sơ.");
    const departments = input.department_ids || old?.department_ids || [];
    const linked =
      old &&
      ((await db
        .prepare("SELECT id FROM accounts WHERE employee_id=?")
        .get(old.id)) as { id: string } | undefined);
    ensure(
      isAdmin(ctx.user) || !linked,
      403,
      "Chỉ Admin được sửa hồ sơ có tài khoản đăng nhập.",
    );
    ensure(
      isAdmin(ctx.user) || !departments.includes("management"),
      403,
      "Chỉ Admin được khai báo bộ phận Quản lý.",
    );
    ensure(
      isManagement(ctx.user) ||
        [...departments, ...(old?.department_ids || [])].every((d) =>
          departmentAccess(ctx.user, d),
        ),
      403,
      "Hồ sơ ngoài bộ phận được giao.",
    );
    if (linked && input.active === 0)
      ensure(
        !(await db
          .prepare(
            "SELECT 1 FROM account_roles WHERE account_id=? AND role_id='admin'",
          )
          .get(linked.id)),
        403,
        "Không ngừng hoạt động hồ sơ Admin qua danh sách thợ.",
      );
    if (input.action === "delete") {
      ensure(
        !linked,
        422,
        "Hồ sơ có tài khoản: hãy ngừng hoạt động thay vì xóa.",
      );
      ensure(
        !(await db
          .prepare(
            "SELECT 1 FROM production_logs WHERE employee_id=? UNION ALL SELECT 1 FROM operation_records WHERE worker_id=? UNION ALL SELECT 1 FROM work_assignments WHERE employee_id=? LIMIT 1",
          )
          .get(old!.id, old!.id, old!.id)),
        422,
        "Hồ sơ đã có lịch sử: hãy ngừng hoạt động thay vì xóa.",
      );
      await db
        .prepare("DELETE FROM employee_departments WHERE employee_id=?")
        .run(old!.id);
      await db.prepare("DELETE FROM employees WHERE id=?").run(old!.id);
    } else {
      ensure(
        input.name && departments.length,
        422,
        "Nhập họ tên và chọn ít nhất một bộ phận.",
      );
      const id = old?.id || `NV-${randomUUID().slice(0, 8).toUpperCase()}`;
      if (old)
        await db
          .prepare(
            "UPDATE employees SET name=?,role=?,phone=?,active=? WHERE id=?",
          )
          .run(
            input.name,
            input.role ?? old.role,
            input.phone ?? old.phone,
            input.active ?? old.active ?? 1,
            id,
          );
      else
        await db
          .prepare(
            "INSERT INTO employees(id,name,line_id,role,phone,active) VALUES (?,?,NULL,?,?,1)",
          )
          .run(id, input.name, input.role || "Thợ gia công", input.phone || "");
      await db
        .prepare("DELETE FROM employee_departments WHERE employee_id=?")
        .run(id);
      for (const d of new Set(departments))
        await db
          .prepare("INSERT INTO employee_departments VALUES (?,?)")
          .run(id, d);
      await db
        .prepare(
          "UPDATE work_assignments SET active=0 WHERE employee_id=? AND NOT (department_id=ANY(?::text[]))",
        )
        .run(id, departments);
      if (linked) {
        await db
          .prepare("UPDATE accounts SET name=? WHERE id=?")
          .run(input.name, linked.id);
        await revoke(linked.id);
      }
      if (input.active === 0)
        await db
          .prepare("UPDATE work_assignments SET active=0 WHERE employee_id=?")
          .run(id);
    }
    await audit(
      ctx,
      "Quản lý hồ sơ thợ",
      JSON.stringify({ before: old, after: input }),
    );
    return { success: true };
  })();
}
export const assignmentSchema = z
  .object({
    version: z.number().int().positive(),
    stage: z.enum([
      "Kiểm NPL/Vải",
      "Kiểm rập",
      "Cắt",
      "May",
      "Sửa hàng",
      "Đóng gói",
      "Giao hàng",
    ]),
    work_item_id: z.number().int().positive().optional(),
    employee_ids: z.array(text).max(200),
  })
  .strict();
export async function assignmentsFor(orderId: string) {
  return db
    .prepare(
      "SELECT w.*,e.name employee_name FROM work_assignments w JOIN employees e ON e.id=w.employee_id WHERE w.order_id=? ORDER BY w.created_at,w.id",
    )
    .all(orderId);
}
export async function saveAssignments(
  ctx: Context,
  orderId: string,
  input: z.infer<typeof assignmentSchema>,
) {
  requirePermission(ctx, "production.assign", { stage: input.stage });
  return db.transaction(async () => {
    const o = await getOrderById(orderId);
    ensure(o, 404, "Không tìm thấy đơn.");
    ensure(
      o.version === input.version,
      409,
      "Đơn đã thay đổi. Tải lại trước khi phân công.",
    );
    ensure(o.status !== "completed", 422, "Đơn đã hoàn thành.");
    const parts = (await db
      .prepare("SELECT id FROM order_work_items WHERE order_id=? AND stage=?")
      .all(orderId, input.stage)) as { id: number }[];
    ensure(
      parts.length
        ? parts.some((p) => p.id === input.work_item_id)
        : !input.work_item_id,
      422,
      "Chọn đúng phần việc của công đoạn.",
    );
    const department = departmentFor(input.stage);
    const people = await getEmployees();
    ensure(
      new Set(input.employee_ids).size === input.employee_ids.length,
      422,
      "Thợ bị chọn trùng.",
    );
    for (const id of input.employee_ids)
      ensure(
        people.some(
          (e) =>
            e.id === id &&
            e.active !== 0 &&
            e.department_ids?.includes(department),
        ),
        422,
        "Thợ phải đang hoạt động và thuộc bộ phận của công đoạn.",
      );
    await db
      .prepare(
        "UPDATE work_assignments SET active=0 WHERE order_id=? AND stage=? AND COALESCE(work_item_id,0)=?",
      )
      .run(orderId, input.stage, input.work_item_id || 0);
    for (const employee of input.employee_ids)
      await db
        .prepare(
          "INSERT INTO work_assignments(id,order_id,stage,work_item_id,employee_id,department_id,actor_id) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          randomUUID(),
          orderId,
          input.stage,
          input.work_item_id || null,
          employee,
          department,
          ctx.actor.id,
        );
    await db
      .prepare("UPDATE orders SET version=version+1 WHERE id=?")
      .run(orderId);
    await audit(
      ctx,
      "Phân công thợ",
      `${orderId} ${input.stage}: ${input.employee_ids.join(", ")}`,
      undefined,
      department,
    );
    return assignmentsFor(orderId);
  })();
}
export const quickAssignSchema = z
  .object({ version: z.number().int().positive(), quick: z.literal(true) })
  .strict();
/** Assigns every active worker of each department to the stages/parts that have no assignment yet. */
export async function quickAssign(
  ctx: Context,
  orderId: string,
  version: number,
) {
  requirePermission(ctx, "production.assign");
  return db.transaction(async () => {
    const o = await getOrderById(orderId);
    ensure(o, 404, "Không tìm thấy đơn.");
    ensure(o.status !== "completed", 422, "Đơn đã hoàn thành.");
    ensure(
      o.version === version,
      409,
      "Đơn đã thay đổi. Tải lại trước khi phân công.",
    );
    const people = await getEmployees();
    const current = (await assignmentsFor(orderId)) as {
      stage: string;
      work_item_id: number | null;
      active: number;
    }[];
    const done: { stage: string; work_item_id?: number; count: number }[] = [];
    for (const stage of assignmentSchema.shape.stage.options) {
      const department = departmentFor(stage);
      if (
        !permits(ctx.user, "production.assign", { stage }) ||
        !departmentAccess(ctx.user, department)
      )
        continue;
      const ids = people
        .filter((e) => e.active !== 0 && e.department_ids?.includes(department))
        .map((e) => e.id);
      if (!ids.length) continue;
      const parts = (await db
        .prepare(
          "SELECT id FROM order_work_items WHERE order_id=? AND stage=? ORDER BY id",
        )
        .all(orderId, stage)) as { id: number }[];
      for (const part of parts.length ? parts.map((p) => p.id) : [undefined]) {
        if (
          current.some(
            (a) =>
              a.active === 1 &&
              a.stage === stage &&
              (a.work_item_id || 0) === (part || 0),
          )
        )
          continue;
        const fresh = (await getOrderById(orderId))!;
        await saveAssignments(ctx, orderId, {
          version: fresh.version,
          stage,
          ...(part ? { work_item_id: part } : {}),
          employee_ids: ids,
        });
        done.push({
          stage,
          ...(part ? { work_item_id: part } : {}),
          count: ids.length,
        });
      }
    }
    return { assigned: done, assignments: await assignmentsFor(orderId) };
  })();
}
export async function requireAssignment(
  ctx: Context,
  orderId: string,
  stage: string,
  employeeId: string,
  workItemId?: number,
) {
  const people = await getEmployees();
  const e = people.find((e) => e.id === employeeId);
  ensure(
    e?.active !== 0 && e?.department_ids?.includes(departmentFor(stage)),
    422,
    "Thợ không thuộc bộ phận của công đoạn hoặc đã ngừng làm.",
  );
  ensure(
    await db
      .prepare(
        "SELECT 1 FROM work_assignments WHERE order_id=? AND stage=? AND employee_id=? AND COALESCE(work_item_id,0)=? AND active=1",
      )
      .get(orderId, stage, employeeId, workItemId || 0),
    422,
    "Thợ chưa được phân công cho đơn/công đoạn/phần việc này. Mở đơn → Phân công.",
  );
  return e;
}
export function requireDepartment(ctx: Context, stage: string) {
  ensure(
    departmentAccess(ctx.user, departmentFor(stage)),
    403,
    "Bạn chỉ được ghi nhận nghiệp vụ của bộ phận được giao.",
  );
}
