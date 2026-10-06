import { authenticate, guardWrite, ok, failure } from "@/lib/server/auth";
import {
  orderFor,
  moveSchema,
  moveOrder,
  idempotent,
} from "@/lib/server/business";
import { body } from "@/lib/server/validation";
import { initializeDatabase } from "@/lib/server/migrate";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await initializeDatabase();
    return ok(
      await orderFor(
        await authenticate(request),
        (await params).id,
        "orders.view",
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await initializeDatabase();
    const { id } = await params;
    const ctx = await authenticate(request);
    guardWrite(request, ctx);
    const input = moveSchema.parse(await body(request));
    return ok(
      await idempotent(
        ctx,
        request,
        input,
        async () => await moveOrder(ctx, id, input),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
