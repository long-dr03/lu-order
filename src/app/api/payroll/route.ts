import { z } from "zod";
import { db } from "@/lib/db";
import {
  authenticate,
  guardWrite,
  ok,
  failure,
  requirePermission,
  ensure,
  audit,
  actorLabel,
} from "@/lib/server/auth";
import { payrollFor, idempotent, queryFilters } from "@/lib/server/business";
import { body, month } from "@/lib/server/validation";
export async function GET(request: Request) {
  try {
    return ok(payrollFor(authenticate(request), queryFilters(request)));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const ctx = authenticate(request);
    guardWrite(request, ctx);
    requirePermission(ctx, "payroll.lock", {});
    const input = z
      .object({ month })
      .strict()
      .parse(await body(request));
    return ok(
      idempotent(ctx, request, input, () => {
        ensure(
          !db
            .prepare("SELECT 1 FROM payroll_locks WHERE month=?")
            .get(input.month),
          409,
          "Tháng lương đã được chốt.",
        );
        db.prepare(
          "INSERT INTO payroll_locks(month,locked_by) VALUES (?,?)",
        ).run(input.month, actorLabel(ctx));
        db.prepare("UPDATE production_logs SET is_locked=1 WHERE month=?").run(
          input.month,
        );
        audit(ctx, "Chốt lương", input.month);
        return { month: input.month, isLocked: true };
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
