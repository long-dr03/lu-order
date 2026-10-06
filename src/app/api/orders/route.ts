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
export async function GET(request: Request) {
  try {
    const ctx = authenticate(request);
    requirePermission(ctx, "orders.view");
    return ok({
      orders: filterOrders(visibleOrders(ctx), queryFilters(request)),
      stats: dashboard(ctx),
      lines: linesFor(ctx),
      employees: employeesFor(ctx, "orders.view"),
      nextCode: generateNextOrderCode(),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const ctx = authenticate(request);
    guardWrite(request, ctx);
    const input = createOrderSchema.parse(await body(request));
    return ok(
      idempotent(ctx, request, input, () => createOrder(ctx, input)),
      201,
    );
  } catch (e) {
    return failure(e);
  }
}
