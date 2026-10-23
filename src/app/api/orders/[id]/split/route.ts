import { authenticate, guardWrite, ok, failure } from "@/lib/server/auth";
import {
  orderFor,
  idempotent,
  splitOrder,
  splitOrderSchema,
} from "@/lib/server/business";
import { body } from "@/lib/server/validation";
import { initializeDatabase } from "@/lib/server/migrate";

/** Moves the not-yet-started part of an order to a new batch order. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await initializeDatabase();
    const { id } = await params;
    const ctx = await authenticate(request);
    guardWrite(request, ctx);
    await orderFor(ctx, id, "orders.view");
    const input = splitOrderSchema.parse(await body(request));
    return ok(
      await idempotent(ctx, request, input, () => splitOrder(ctx, id, input)),
      201,
    );
  } catch (e) {
    return failure(e);
  }
}
