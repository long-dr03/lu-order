import { db } from "@/lib/db";
import { authenticate, ensure, failure } from "@/lib/server/auth";
import { permits } from "@/lib/permissions";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = authenticate(request);
    const { id } = await params;
    ensure(/^[0-9a-f-]{36}$/.test(id), 404, "Không tìm thấy ảnh.");
    const image = db
      .prepare("SELECT owner_id,data FROM product_images WHERE id=?")
      .get(id) as { owner_id: string; data: Buffer } | undefined;
    ensure(image, 404, "Không tìm thấy ảnh.");
    const orders = db
      .prepare(
        "SELECT line_id FROM orders WHERE image_url=? UNION SELECT o.line_id FROM operation_records r JOIN orders o ON o.id=r.order_id WHERE r.image_url=?",
      )
      .all(`/api/product-images/${id}`, `/api/product-images/${id}`) as {
      line_id: number;
    }[];
    ensure(
      orders.length
        ? orders.some((o) =>
            ["orders.view", "qc.view", "delivery.view"].some((permission) =>
              permits(ctx.user, permission as "orders.view", {
                lineId: o.line_id,
              }),
            ),
          )
        : image.owner_id === ctx.user.id,
      403,
      "Bạn không có quyền xem ảnh sản phẩm này.",
    );
    return new Response(new Uint8Array(image.data), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline; filename=product.jpg",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
