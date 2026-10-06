import { authenticate, guardWrite, ok, failure } from "@/lib/server/auth";
import {
  operationSchema,
  recordOperation,
  idempotent,
} from "@/lib/server/business";
import { body } from "@/lib/server/validation";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = authenticate(request);
    guardWrite(request, ctx);
    const input = operationSchema.parse(await body(request));
    return ok(
      idempotent(ctx, request, input, () => recordOperation(ctx, id, input)),
    );
  } catch (e) {
    return failure(e);
  }
}
