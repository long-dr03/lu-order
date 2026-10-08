import { authenticate, guardWrite, ok, failure } from "@/lib/server/auth";
import {
  departmentStaff,
  staffSchema,
  saveStaff,
} from "@/lib/server/departments";
import { DEPARTMENTS } from "@/lib/departments";
import { idempotent } from "@/lib/server/business";
import { body } from "@/lib/server/validation";
export async function GET(request: Request) {
  try {
    const ctx = await authenticate(request);
    return ok({
      departments: DEPARTMENTS,
      employees: await departmentStaff(ctx),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const ctx = await authenticate(request);
    guardWrite(request, ctx);
    const input = staffSchema.parse(await body(request));
    return ok(
      await idempotent(ctx, request, input, () => saveStaff(ctx, input)),
    );
  } catch (e) {
    return failure(e);
  }
}
