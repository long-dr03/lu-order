import { authenticate, guardWrite, ok, failure } from "@/lib/server/auth";
import {
  orderFor,
  idempotent,
  updateVariants,
  variantsSchema,
} from "@/lib/server/business";
import { body } from "@/lib/server/validation";
import { initializeDatabase } from "@/lib/server/migrate";

/** Replaces an order's colour–size quantities (within what has already been worked on). */
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
    const input = variantsSchema.parse(await body(request));
    return ok(
      await idempotent(ctx, request, input, () =>
        updateVariants(ctx, id, input),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
