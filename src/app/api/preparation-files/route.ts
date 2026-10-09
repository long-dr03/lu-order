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

const maximum = 10 * 1024 * 1024;
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
/** Only office documents and PDFs; the content must match the extension, never just the declared type. */
const KINDS: Record<string, { mime: string; signature: number[] }> = {
  pdf: { mime: "application/pdf", signature: PDF },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    signature: ZIP,
  },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    signature: ZIP,
  },
  xls: { mime: "application/vnd.ms-excel", signature: OLE },
  doc: { mime: "application/msword", signature: OLE },
};
const startsWith = (bytes: Buffer, signature: number[]) =>
  signature.every((byte, i) => bytes[i] === byte);

export async function POST(request: Request) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    guardWrite(request, ctx, {
      contentType: "multipart/form-data",
      maxBytes: maximum + 65536,
    });
    ensure(
      permits(ctx.user, "production.create", { stage: "Kiểm rập" }) ||
        permits(ctx.user, "production.create", { stage: "Kiểm NPL/Vải" }) ||
        permits(ctx.user, "orders.edit", { stage: "nhan_don" }),
      403,
      "Bạn không có quyền đính kèm file kiểm.",
    );
    await limit(`check-files:${ctx.actor.id}`, 30);
    const reader = request.body?.getReader();
    ensure(reader, 422, "Chưa chọn file.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum + 65536) {
        await reader.cancel();
        throw new AppError(413, "File tối đa 10 MB.");
      }
      chunks.push(value);
    }
    let form: FormData;
    try {
      form = await new Response(Buffer.concat(chunks), {
        headers: { "content-type": request.headers.get("content-type")! },
      }).formData();
    } catch {
      throw new AppError(422, "Dữ liệu tải file không hợp lệ.");
    }
    const file = form.get("file");
    ensure(file instanceof File && file.size > 0, 422, "Chưa chọn file.");
    ensure(file.size <= maximum, 413, "File tối đa 10 MB.");
    const extension = (file.name.split(".").pop() || "").toLowerCase();
    const kind = KINDS[extension];
    ensure(
      kind,
      422,
      "Chỉ nhận file PDF, Excel (xlsx, xls) hoặc Word (docx, doc).",
    );
    const bytes = Buffer.from(await file.arrayBuffer());
    ensure(
      startsWith(bytes, kind.signature),
      422,
      "Nội dung file không đúng với loại file.",
    );
    const name =
      (file.name.split(/[\\/]/).pop() || `file.${extension}`)
        .replace(/[\u0000-\u001f"<>|:*?]/g, "")
        .slice(0, 120) || `file.${extension}`;
    const id = randomUUID();
    await db.transaction(async () => {
      await db
        .prepare(
          "DELETE FROM preparation_files WHERE created_at<? AND NOT EXISTS (SELECT 1 FROM preparation_checks WHERE files LIKE '%/api/preparation-files/' || preparation_files.id || '%')",
        )
        .run(Date.now() - 86400000);
      await db
        .prepare("INSERT INTO preparation_files VALUES (?,?,?,?,?,?,?)")
        .run(id, ctx.user.id, name, kind.mime, bytes.length, bytes, Date.now());
      await audit(ctx, "Tải file kiểm", name);
    })();
    return ok(
      { url: `/api/preparation-files/${id}`, name, size: bytes.length },
      201,
    );
  } catch (e) {
    return failure(e);
  }
}
