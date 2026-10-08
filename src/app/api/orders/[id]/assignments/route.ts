import { authenticate, guardWrite, ok, failure } from "@/lib/server/auth";
import {
  assignmentSchema,
  saveAssignments,
  quickAssignSchema,
  quickAssign,
  assignmentsFor,
} from "@/lib/server/departments";
import { body } from "@/lib/server/validation";
import { orderFor, idempotent } from "@/lib/server/business";
type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await authenticate(request);
    const { id } = await params;
    await orderFor(ctx, id, "orders.view");
    return ok(await assignmentsFor(id));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await authenticate(request);
    guardWrite(request, ctx);
    const { id } = await params;
    const raw = await body(request);
    if (raw && typeof raw === "object" && "quick" in raw) {
      const input = quickAssignSchema.parse(raw);
      return ok(
        await idempotent(ctx, request, input, () =>
          quickAssign(ctx, id, input.version),
        ),
      );
    }
    const input = assignmentSchema.parse(raw);
    return ok(
      await idempotent(ctx, request, input, () =>
        saveAssignments(ctx, id, input),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
