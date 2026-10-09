import { db } from "@/lib/db";
import { authenticate, ensure, failure } from "@/lib/server/auth";
import { permits } from "@/lib/permissions";
import { initializeDatabase } from "@/lib/server/migrate";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    const { id } = await params;
    ensure(/^[0-9a-f-]{36}$/.test(id), 404, "Không tìm thấy file.");
    const file = (await db
      .prepare(
        "SELECT owner_id,name,mime,data FROM preparation_files WHERE id=?",
      )
      .get(id)) as
      | { owner_id: string; name: string; mime: string; data: Buffer }
      | undefined;
    ensure(file, 404, "Không tìm thấy file.");
    const orders = (await db
      .prepare(
        "SELECT o.line_id FROM preparation_checks c JOIN orders o ON o.id=c.order_id WHERE c.files LIKE ?",
      )
      .all(`%/api/preparation-files/${id}%`)) as { line_id: number }[];
    ensure(
      orders.length
        ? orders.some((o) =>
            permits(ctx.user, "orders.view", { lineId: o.line_id }),
          )
        : file.owner_id === ctx.user.id,
      403,
      "Bạn không có quyền xem file này.",
    );
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `attachment; filename="file"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      },
    });
  } catch (e) {
    return failure(e);
  }
}
