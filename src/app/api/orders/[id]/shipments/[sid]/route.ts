import { authenticate, guardWrite, ok, failure } from "@/lib/server/auth";
import {
  deleteShipment,
  shipmentSchema,
  updateShipment,
} from "@/lib/server/shipments";
import { body } from "@/lib/server/validation";
import { z } from "zod";
type Params = { params: Promise<{ id: string; sid: string }> };
const deleteSchema = z.object({ version: z.number().int().positive() });
export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await authenticate(request);
    guardWrite(request, ctx);
    const { id, sid } = await params;
    const input = shipmentSchema.parse(await body(request));
    return ok(await updateShipment(ctx, id, sid, input));
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await authenticate(request);
    guardWrite(request, ctx);
    const { id, sid } = await params;
    const { version } = deleteSchema.parse(await body(request));
    return ok(await deleteShipment(ctx, id, sid, version));
  } catch (e) {
    return failure(e);
  }
}
