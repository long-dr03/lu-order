import { authenticate, guardWrite, ok, failure } from "@/lib/server/auth";
import { body } from "@/lib/server/validation";
import { idempotent } from "@/lib/server/business";
import { stageInfoSchema, updateStageInfo } from "@/lib/server/requirements";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = authenticate(request);
    guardWrite(request, ctx);
    const { id } = await params;
    const input = stageInfoSchema.parse(await body(request));
    return ok(
      idempotent(ctx, request, input, () => updateStageInfo(ctx, id, input)),
    );
  } catch (e) {
    return failure(e);
  }
}
