import { authenticate, ok, failure } from "@/lib/server/auth";
import { auditFor } from "@/lib/server/business";
export async function GET(request: Request) {
  try {
    return ok(auditFor(authenticate(request)));
  } catch (e) {
    return failure(e);
  }
}
