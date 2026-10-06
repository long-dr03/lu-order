import { authenticate, ok, failure } from "@/lib/server/auth";
import { auditFor } from "@/lib/server/business";
import { initializeDatabase } from "@/lib/server/migrate";

export async function GET(request: Request) {
  try {
    await initializeDatabase();
    return ok(await auditFor(await authenticate(request)));
  } catch (e) {
    return failure(e);
  }
}
