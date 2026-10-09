import sharp from "sharp";
import { db } from "@/lib/db";
import {
  authenticate,
  guardWrite,
  ensure,
  failure,
  ok,
  randomUUID,
  limit,
  audit,
  AppError,
} from "@/lib/server/auth";
import { permits } from "@/lib/permissions";
import { initializeDatabase } from "@/lib/server/migrate";

const maximum = 5 * 1024 * 1024;
export async function POST(request: Request) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    guardWrite(request, ctx, {
      contentType: "multipart/form-data",
      maxBytes: maximum + 65536,
    });
    ensure(
      ctx.user.roles.some((r) =>
        r.grants.some(
          (g) =>
            g.permission === "orders.create" ||
            g.permission === "orders.edit" ||
            g.permission === "qc.manage" ||
            g.permission === "production.create",
        ),
      ),
      403,
      "Bạn không có quyền thêm ảnh sản phẩm.",
    );
    await limit(`images:${ctx.actor.id}`, 30);
    const reader = request.body?.getReader();
    ensure(reader, 422, "Chưa chọn ảnh sản phẩm.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum + 65536) {
        await reader.cancel();
        throw new AppError(413, "Ảnh tối đa 5 MB.");
      }
      chunks.push(value);
    }
    let form: FormData;
    try {
      form = await new Response(Buffer.concat(chunks), {
        headers: { "content-type": request.headers.get("content-type")! },
      }).formData();
    } catch {
      throw new AppError(422, "Dữ liệu tải ảnh không hợp lệ.");
    }
    ensure(
      permits(ctx.user, "orders.create", { stage: "nhan_don" }) ||
        permits(ctx.user, "orders.edit", { stage: "nhan_don" }) ||
        permits(ctx.user, "qc.manage", { stage: "QC" }) ||
        // Pattern and fabric checkers photograph the problems they find.
        permits(ctx.user, "production.create", { stage: "Kiểm rập" }) ||
        permits(ctx.user, "production.create", { stage: "Kiểm NPL/Vải" }),
      403,
      "Bạn không được thêm ảnh cho nghiệp vụ này.",
    );
    const file = form.get("file");
    ensure(
      file instanceof File && file.size > 0,
      422,
      "Chưa chọn ảnh sản phẩm.",
    );
    ensure(file.size <= maximum, 413, "Ảnh tối đa 5 MB.");
    ensure(
      ["image/jpeg", "image/png", "image/webp"].includes(file.type),
      422,
      "Chọn ảnh JPG, PNG hoặc WebP.",
    );
    let data: Buffer;
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const signature = bytes.subarray(0, 12);
      ensure(
        signature
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
          (signature[0] === 255 &&
            signature[1] === 216 &&
            signature[2] === 255) ||
          (signature.toString("ascii", 0, 4) === "RIFF" &&
            signature.toString("ascii", 8, 12) === "WEBP"),
        422,
        "Nội dung file không phải ảnh hợp lệ.",
      );
      const source = sharp(bytes, {
        limitInputPixels: 20_000_000,
      });
      const meta = await source.metadata();
      ensure(
        ["jpeg", "png", "webp"].includes(meta.format || "") &&
          (meta.pages || 1) === 1,
        422,
        "Ảnh phải là JPG, PNG hoặc WebP tĩnh.",
      );
      data = await source
        .rotate()
        .resize({
          width: 1400,
          height: 1400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      throw new AppError(
        422,
        "Ảnh không đọc được hoặc vượt giới hạn 20 triệu điểm ảnh.",
      );
    }
    const id = randomUUID();
    const url = `/api/product-images/${id}`;
    await db.transaction(async () => {
      await db
        .prepare(
          "DELETE FROM product_images WHERE created_at<? AND NOT EXISTS (SELECT 1 FROM orders WHERE image_url='/api/product-images/' || product_images.id) AND NOT EXISTS (SELECT 1 FROM order_photos WHERE image_url='/api/product-images/' || product_images.id) AND NOT EXISTS (SELECT 1 FROM preparation_checks WHERE photos LIKE '%/api/product-images/' || product_images.id || '%') AND NOT EXISTS (SELECT 1 FROM operation_records WHERE image_url='/api/product-images/' || product_images.id)",
        )
        .run(Date.now() - 86400000);
      await db
        .prepare("INSERT INTO product_images VALUES (?,?,?,?)")
        .run(id, ctx.user.id, data, Date.now());
      await audit(ctx, "Tải ảnh sản phẩm", "Ảnh mẫu sản phẩm");
    })();
    return ok({ url }, 201);
  } catch (e) {
    return failure(e);
  }
}
