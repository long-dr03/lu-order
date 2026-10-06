import { authenticate, guardWrite, ok, failure } from "@/lib/server/auth";
import {
  orderFor,
  moveSchema,
  moveOrder,
  idempotent,
} from "@/lib/server/business";
import { body } from "@/lib/server/validation";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return ok(
      orderFor(authenticate(request), (await params).id, "orders.view"),
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
    const { id } = await params;
    const ctx = authenticate(request);
    guardWrite(request, ctx);
    const input = moveSchema.parse(await body(request));
    return ok(idempotent(ctx, request, input, () => moveOrder(ctx, id, input)));
  } catch (e) {
    return failure(e);
  }
}
