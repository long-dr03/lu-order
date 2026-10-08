import { DEPARTMENTS } from "@/lib/departments";
import { adjustmentSchema, adjustProduction } from "@/lib/server/requirements";
import {
  authenticate,
  guardWrite,
  ok,
  failure,
  requirePermission,
} from "@/lib/server/auth";
import {
  logsFor,
  filterLogs,
  queryFilters,
  employeesFor,
  productionInputSchema,
  recordProduction,
  idempotent,
} from "@/lib/server/business";
import { permits } from "@/lib/permissions";
import { body } from "@/lib/server/validation";
import { initializeDatabase } from "@/lib/server/migrate";

export async function GET(request: Request) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    requirePermission(ctx, "production.view");
    return ok({
      logs: (await filterLogs(await logsFor(ctx), queryFilters(request))).map(
        (l) =>
          permits(ctx.user, "payroll.view", {
            employeeId: l.employee_id,
            departmentId: l.department_id,
            stage: l.stage,
          })
            ? l
            : { ...l, unit_price: null, total_pay: null },
      ),
      employees: await employeesFor(ctx),
      departments: DEPARTMENTS,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    guardWrite(request, ctx);
    const input = productionInputSchema.parse(await body(request));
    const result = await idempotent(ctx, request, input, () =>
      recordProduction(ctx, input),
    );
    const sanitize = (log: unknown) => {
      if (!log || typeof log !== "object") return log;
      const l = log as Record<string, unknown>;
      return permits(ctx.user, "payroll.view", {
        employeeId:
          typeof l.employee_id === "string"
            ? l.employee_id
            : "employee_id" in input
              ? input.employee_id
              : undefined,
        stage: input.stage,
      })
        ? l
        : { ...l, unit_price: null, total_pay: null };
    };
    return ok(
      result && typeof result === "object" && "logs" in result
        ? { ...result, logs: result.logs.map(sanitize) }
        : sanitize(result),
      201,
    );
  } catch (e) {
    return failure(e);
  }
}

export async function PATCH(request: Request) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    guardWrite(request, ctx);
    const input = adjustmentSchema.parse(await body(request));
    return ok(
      await idempotent(
        ctx,
        request,
        input,
        async () => await adjustProduction(ctx, input),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
