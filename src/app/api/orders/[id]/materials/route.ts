import { authenticate, guardWrite, ok, failure } from "@/lib/server/auth";
import { materialSchema, saveMaterial } from "@/lib/server/materials";
import { orderFor, idempotent } from "@/lib/server/business";
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
    await orderFor(ctx, id, "orders.view");
    const input = materialSchema.parse(await body(request));
    return ok(
      await idempotent(ctx, request, input, () => saveMaterial(ctx, id, input)),
      201,
    );
  } catch (e) {
    return failure(e);
  }
}
