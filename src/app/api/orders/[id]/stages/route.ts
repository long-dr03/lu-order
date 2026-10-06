import { authenticate, guardWrite, ok, failure } from "@/lib/server/auth";
import { body } from "@/lib/server/validation";
import { idempotent } from "@/lib/server/business";
import { stageInfoSchema, updateStageInfo } from "@/lib/server/requirements";
import { initializeDatabase } from "@/lib/server/migrate";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    guardWrite(request, ctx);
    const { id } = await params;
    const input = stageInfoSchema.parse(await body(request));
    return ok(
      await idempotent(
        ctx,
        request,
        input,
        async () => await updateStageInfo(ctx, id, input),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
