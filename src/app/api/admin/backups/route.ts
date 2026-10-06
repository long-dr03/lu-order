import {
  authenticate,
  guardWrite,
  ensure,
  ok,
  failure,
  audit,
  type Context,
} from "@/lib/server/auth";
import { body } from "@/lib/server/validation";
import {
  backupSchema,
  backupConfig,
  backupFiles,
  configureBackup,
  runBackup,
  readBackup,
} from "@/lib/server/backup";
import { initializeDatabase } from "@/lib/server/migrate";

function admin(ctx: Context) {
  ensure(
    !ctx.representing && ctx.user.roles.some((r) => r.id === "admin"),
    403,
    "Chỉ admin được quản lý bản sao lưu.",
  );
}
export async function GET(request: Request) {
  try {
    await initializeDatabase();
    admin(await authenticate(request));
    const name = new URL(request.url).searchParams.get("file");
    if (name) {
      const bytes = await readBackup(name);
      ensure(bytes, 404, "Không tìm thấy bản sao lưu.");
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${name}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return ok({ config: await backupConfig(), files: await backupFiles() });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    admin(ctx);
    guardWrite(request, ctx);
    const input = await body(request);
    if (
      input &&
      typeof input === "object" &&
      "action" in input &&
      input.action === "run"
    ) {
      const files = await runBackup();
      await audit(
        ctx,
        "Sao lưu dữ liệu",
        "Tạo snapshot PostgreSQL và lưu trữ nghiệp vụ",
      );
      return ok(files);
    }
    const config = await configureBackup(backupSchema.parse(input));
    await audit(
      ctx,
      "Cấu hình sao lưu",
      `Chu kỳ ${config.intervalHours} giờ, dữ liệu ${config.windowDays} ngày`,
    );
    return ok(config);
  } catch (e) {
    return failure(e);
  }
}
