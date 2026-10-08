import { authenticate, guardWrite, ok, failure } from "@/lib/server/auth";
import {
  shipmentSchema,
  createShipment,
  shipmentsFor,
} from "@/lib/server/shipments";
import { orderFor, idempotent } from "@/lib/server/business";
import { body } from "@/lib/server/validation";
type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await authenticate(request);
    const { id } = await params;
    await orderFor(ctx, id, "orders.view");
    return ok(await shipmentsFor(id));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await authenticate(request);
    guardWrite(request, ctx);
    const { id } = await params;
    const input = shipmentSchema.parse(await body(request));
    return ok(
      await idempotent(ctx, request, input, () =>
        createShipment(ctx, id, input),
      ),
      201,
    );
  } catch (e) {
    return failure(e);
  }
}
