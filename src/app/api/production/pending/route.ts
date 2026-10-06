import { authenticate, guardWrite, ok, failure } from "@/lib/server/auth";
import { idempotent } from "@/lib/server/business";
import {
  pendingPackingFor,
  settlementSchema,
  settlePacking,
} from "@/lib/server/pending-packing";
import { body } from "@/lib/server/validation";
export async function GET(request: Request) {
  try {
    return ok(pendingPackingFor(authenticate(request)));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const ctx = authenticate(request);
    guardWrite(request, ctx);
    const input = settlementSchema.parse(await body(request));
    return ok(idempotent(ctx, request, input, () => settlePacking(ctx, input)));
  } catch (e) {
    return failure(e);
  }
}
