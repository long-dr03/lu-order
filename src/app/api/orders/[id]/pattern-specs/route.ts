import { authenticate, guardWrite, ok, failure } from "@/lib/server/auth";
import { patternSheetSchema, savePatternSheet } from "@/lib/server/preparation";
import { body } from "@/lib/server/validation";
import { idempotent } from "@/lib/server/business";
type Params = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await authenticate(request);
    guardWrite(request, ctx);
    const { id } = await params;
    const input = patternSheetSchema.parse(await body(request));
    return ok(
      await idempotent(ctx, request, input, () =>
        savePatternSheet(ctx, id, input),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
