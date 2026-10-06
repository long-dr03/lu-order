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
  linesFor,
  logSchema,
  recordProduction,
  idempotent,
} from "@/lib/server/business";
import { permits } from "@/lib/permissions";
import { body } from "@/lib/server/validation";
export async function GET(request: Request) {
  try {
    const ctx = authenticate(request);
    requirePermission(ctx, "production.view");
    return ok({
      logs: filterLogs(logsFor(ctx), queryFilters(request)).map((l) =>
        permits(ctx.user, "payroll.view", {
          employeeId: l.employee_id,
          lineId: l.line_id,
        })
          ? l
          : { ...l, unit_price: null, total_pay: null },
      ),
      employees: employeesFor(ctx),
      lines: linesFor(ctx),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const ctx = authenticate(request);
    guardWrite(request, ctx);
    const input = logSchema.parse(await body(request));
    return ok(
      idempotent(ctx, request, input, () => recordProduction(ctx, input)),
      201,
    );
  } catch (e) {
    return failure(e);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = authenticate(request);
    guardWrite(request, ctx);
    const input = adjustmentSchema.parse(await body(request));
    return ok(
      idempotent(ctx, request, input, () => adjustProduction(ctx, input)),
    );
  } catch (e) {
    return failure(e);
  }
}
