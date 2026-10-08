import { authenticate, guardWrite, ok, failure } from "@/lib/server/auth";
import {
  orderFor,
  moveSchema,
  moveOrder,
  prepareSchema,
  prepareOrder,
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
    const raw = await body(request);
    if (raw && typeof raw === "object" && "prepare" in raw) {
      const input = prepareSchema.parse(raw);
      return ok(
        await idempotent(ctx, request, input, () =>
          prepareOrder(ctx, id, input.version),
        ),
      );
    }
    const input = moveSchema.parse(raw);
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
