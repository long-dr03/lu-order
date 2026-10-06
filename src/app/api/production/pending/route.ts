import { authenticate, guardWrite, ok, failure } from "@/lib/server/auth";
import { idempotent } from "@/lib/server/business";
import {
  pendingPackingFor,
  settlementSchema,
  settlePacking,
} from "@/lib/server/pending-packing";
import { body } from "@/lib/server/validation";
import { initializeDatabase } from "@/lib/server/migrate";

export async function GET(request: Request) {
  try {
    await initializeDatabase();
    return ok(await pendingPackingFor(await authenticate(request)));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    guardWrite(request, ctx);
    const input = settlementSchema.parse(await body(request));
    return ok(
      await idempotent(
        ctx,
        request,
        input,
        async () => await settlePacking(ctx, input),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
