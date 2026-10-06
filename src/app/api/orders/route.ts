import {
  authenticate,
  guardWrite,
  ok,
  failure,
  requirePermission,
} from "@/lib/server/auth";
import {
  visibleOrders,
  filterOrders,
  queryFilters,
  linesFor,
  employeesFor,
  dashboard,
  createOrderSchema,
  createOrder,
  idempotent,
} from "@/lib/server/business";
import { body } from "@/lib/server/validation";
import { generateNextOrderCode } from "@/lib/db";
import { initializeDatabase } from "@/lib/server/migrate";

export async function GET(request: Request) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    requirePermission(ctx, "orders.view");
    return ok({
      orders: filterOrders(await visibleOrders(ctx), queryFilters(request)),
      stats: await dashboard(ctx),
      lines: await linesFor(ctx),
      employees: await employeesFor(ctx, "orders.view"),
      nextCode: await generateNextOrderCode(),
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
    const input = createOrderSchema.parse(await body(request));
    return ok(
      await idempotent(
        ctx,
        request,
        input,
        async () => await createOrder(ctx, input),
      ),
      201,
    );
  } catch (e) {
    return failure(e);
  }
}
