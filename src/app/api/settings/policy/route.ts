import {
  authenticate,
  guardWrite,
  ok,
  failure,
  requirePermission,
} from "@/lib/server/auth";
import { getPolicy, savePolicy } from "@/lib/server/policy";
import { policySchema } from "@/lib/policy";
import { idempotent } from "@/lib/server/business";
import { body } from "@/lib/server/validation";
import { initializeDatabase } from "@/lib/server/migrate";

export async function GET(request: Request) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    requirePermission(ctx, "orders.view");
    return ok(await getPolicy());
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(request: Request) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    guardWrite(request, ctx);
    requirePermission(ctx, "rates.manage");
    const input = policySchema.parse(await body(request));
    return ok(
      await idempotent(ctx, request, input, () => savePolicy(ctx, input)),
    );
  } catch (e) {
    return failure(e);
  }
}
