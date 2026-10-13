import sharp from "sharp";
import { db } from "@/lib/db";
import { authenticate, ensure, failure } from "@/lib/server/auth";
import { permits } from "@/lib/permissions";
import { initializeDatabase } from "@/lib/server/migrate";

// Lists show a postage stamp, not the 1400 px original: a small copy is made once and kept.
const WIDTHS = [160, 480];
const thumbs = new Map<string, Buffer>();
const KEEP = 400;
async function sized(id: string, data: Buffer, width: number) {
  const key = `${id}:${width}`;
  const hit = thumbs.get(key);
  if (hit) return hit;
  const small = await sharp(data)
    .resize({
      width,
      height: width * 2,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 78 })
    .toBuffer();
  if (thumbs.size >= KEEP) thumbs.delete(thumbs.keys().next().value!);
  thumbs.set(key, small);
  return small;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    const { id } = await params;
    ensure(/^[0-9a-f-]{36}$/.test(id), 404, "Không tìm thấy ảnh.");
    const image = (await db
      .prepare("SELECT owner_id,data FROM product_images WHERE id=?")
      .get(id)) as { owner_id: string; data: Buffer } | undefined;
    ensure(image, 404, "Không tìm thấy ảnh.");
    const orders = (await db
      .prepare(
        "SELECT line_id FROM orders WHERE image_url=? UNION SELECT o.line_id FROM order_photos p JOIN orders o ON o.id=p.order_id WHERE p.image_url=? UNION SELECT o.line_id FROM operation_records r JOIN orders o ON o.id=r.order_id WHERE r.image_url=? UNION SELECT o.line_id FROM preparation_checks c JOIN orders o ON o.id=c.order_id WHERE c.photos LIKE ?",
      )
      .all(
        `/api/product-images/${id}`,
        `/api/product-images/${id}`,
        `/api/product-images/${id}`,
        `%/api/product-images/${id}%`,
      )) as {
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
    const width = Number(new URL(request.url).searchParams.get("w"));
    const body = WIDTHS.includes(width)
      ? await sized(id, image.data, width).catch(() => image.data)
      : image.data;
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "image/jpeg",
        // A picture never changes under its id, so the browser may keep it for the day
        // instead of downloading it again each time a list or a dialog shows it.
        "Cache-Control": "private, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline; filename=product.jpg",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
