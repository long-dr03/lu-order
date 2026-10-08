import { authenticate, guardWrite, ok, failure } from "@/lib/server/auth";
import {
  operationInputSchema,
  recordOperations,
  idempotent,
} from "@/lib/server/business";
import { body } from "@/lib/server/validation";
import { initializeDatabase } from "@/lib/server/migrate";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await initializeDatabase();
    const { id } = await params;
    const ctx = await authenticate(request);
    guardWrite(request, ctx);
    const input = operationInputSchema.parse(await body(request));
    return ok(
      await idempotent(
        ctx,
        request,
        input,
        async () => await recordOperations(ctx, id, input),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
