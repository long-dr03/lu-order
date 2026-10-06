import {
  authenticate,
  ok,
  failure,
  requirePermission,
} from "@/lib/server/auth";
import { qcFor } from "@/lib/server/business";
export async function GET(request: Request) {
  try {
    const ctx = authenticate(request);
    requirePermission(ctx, "qc.view");
    return ok(qcFor(ctx));
  } catch (e) {
    return failure(e);
  }
}
