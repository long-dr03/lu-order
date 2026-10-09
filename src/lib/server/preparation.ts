import { z } from "zod";
import { db, getEmployees, getOrderById, patternSheetFor } from "../db";
import { departmentFor } from "../departments";
import type {
  PatternMeasurement,
  PreparationCheck,
  PreparationFile,
} from "../types";
import { type Context, ensure, requirePermission, audit } from "./auth";
import { permits } from "../permissions";
import { text } from "./validation";

export const PREPARATION_LABELS = {
  kiem_npl: "Kiểm NPL/Vải",
  kiem_rap: "Kiểm rập",
} as const;
/** Pattern check tolerance is the usual ±0.5 cm unless the tech pack says otherwise. */
export const DEFAULT_TOLERANCE_CM = 0.5;
const measurementSchema = z
  .object({
    code: z.string().trim().max(10).optional(),
    point: z.string().trim().min(1).max(80),
    size: z.string().trim().max(20).default(""),
    spec: z.number().min(0).max(1000),
    actual: z.number().min(0).max(1000),
    tolerance: z.number().min(0).max(5).default(DEFAULT_TOLERANCE_CM),
  })
  .strict();
export const preparationSchema = z
  .object({
    stage: z.enum(["Kiểm NPL/Vải", "Kiểm rập"]),
    result: z.enum(["dat", "dat_co_ghi_chu", "khong_dat"]),
    defect_qty: z.number().int().min(0).max(1_000_000).default(0),
    notes: z.string().trim().max(2000).default(""),
    pattern_version: z.string().trim().max(40).default(""),
    sizes_checked: z.string().trim().max(200).default(""),
    pieces_expected: z.number().int().min(0).max(500).nullable().optional(),
    pieces_received: z.number().int().min(0).max(500).nullable().optional(),
    measurements: z.array(measurementSchema).max(300).default([]),
    unit: z.enum(["inch", "cm"]).default("cm"),
    mode: z.enum(["measure", "text", "photo", "file"]).default("measure"),
    files: z
      .array(
        z
          .object({
            url: z.string().regex(/^\/api\/preparation-files\/[0-9a-f-]{36}$/),
            name: z.string().trim().min(1).max(120),
            size: z.number().int().min(0).max(20_000_000),
          })
          .strict(),
      )
      .max(3)
      .default([]),
    phase: z.enum(["", "rap_thu", "fit", "pps", "bulk"]).default(""),
    photos: z
      .array(z.string().regex(/^\/api\/product-images\/[0-9a-f-]{36}$/))
      .max(6)
      .default([]),
    checked_by: text.nullable().optional(),
    approved_by: text.nullable().optional(),
    checked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
const sizeName = z.string().trim().min(1).max(20);
export const patternSheetSchema = z
  .object({
    unit: z.enum(["inch", "cm"]),
    sizes: z
      .array(sizeName)
      .min(1)
      .max(12)
      .refine((v) => new Set(v).size === v.length, "Size không được trùng."),
    base_size: z.string().trim().max(20).default(""),
    poms: z
      .array(
        z
          .object({
            code: z.string().trim().max(10).default(""),
            point: z.string().trim().min(1).max(80),
            tolerance: z.number().min(0).max(5),
            values: z.record(sizeName, z.number().min(0).max(2000)),
          })
          .strict(),
      )
      .max(60)
      .refine(
        (rows) =>
          new Set(rows.map((r) => r.point.toLocaleLowerCase("vi"))).size ===
          rows.length,
        "Điểm đo không được trùng.",
      ),
  })
  .strict()
  .refine((v) => !v.base_size || v.sizes.includes(v.base_size), {
    message: "Size gốc phải nằm trong danh sách size.",
  })
  .refine(
    (v) =>
      v.poms.every((p) =>
        Object.keys(p.values).every((s) => v.sizes.includes(s)),
      ),
    { message: "Có số đo cho size không nằm trong danh sách size." },
  );
/** The POM chart is written once per order (from the tech pack) so checkers only type measured values. */
export async function savePatternSheet(
  ctx: Context,
  orderId: string,
  input: z.infer<typeof patternSheetSchema>,
) {
  ensure(
    permits(ctx.user, "orders.edit", { stage: "nhan_don" }) ||
      permits(ctx.user, "production.create", { stage: "Kiểm rập" }),
    403,
    "Bạn không có quyền khai báo bảng thông số rập.",
  );
  const o = await getOrderById(orderId);
  ensure(o, 404, "Không tìm thấy đơn.");
  ensure(o.status !== "completed", 422, "Đơn đã hoàn thành.");
  await db.transaction(async () => {
    await db
      .prepare(
        "INSERT INTO pattern_sheets(order_id,unit,sizes,base_size) VALUES (?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET unit=excluded.unit,sizes=excluded.sizes,base_size=excluded.base_size",
      )
      .run(orderId, input.unit, JSON.stringify(input.sizes), input.base_size);
    await db.prepare("DELETE FROM pattern_specs WHERE order_id=?").run(orderId);
    let position = 0;
    for (const pom of input.poms)
      for (const size of input.sizes) {
        const value = pom.values[size];
        if (value === undefined) continue;
        await db
          .prepare(
            "INSERT INTO pattern_specs(order_id,position,code,point,size,spec,tolerance) VALUES (?,?,?,?,?,?,?)",
          )
          .run(
            orderId,
            position++,
            pom.code,
            pom.point,
            size,
            value,
            pom.tolerance,
          );
      }
    await audit(
      ctx,
      "Khai báo bảng thông số rập",
      `${orderId}: ${input.poms.length} điểm đo × ${input.sizes.length} size (${input.unit})`,
      undefined,
      "cutting",
    );
  })();
  return patternSheetFor(orderId);
}
/** Out-of-tolerance points are counted from the measurements, not typed by hand. */
export const outOfTolerance = (rows: PatternMeasurement[]) =>
  rows.filter((r) => Math.abs(r.actual - r.spec) > r.tolerance + 1e-9).length;
export async function preparationChecksFor(orderId: string) {
  const rows = (await db
    .prepare(
      "SELECT c.*,e.name checked_by_name,a.name approved_by_name FROM preparation_checks c LEFT JOIN employees e ON e.id=c.checked_by LEFT JOIN employees a ON a.id=c.approved_by WHERE c.order_id=? ORDER BY c.id",
    )
    .all(orderId)) as (Omit<
    PreparationCheck,
    "measurements" | "photos" | "files"
  > & {
    measurements: string;
    photos: string;
    files: string;
  })[];
  return rows.map((r) => ({
    ...r,
    measurements: JSON.parse(r.measurements || "[]") as PatternMeasurement[],
    photos: JSON.parse(r.photos || "[]") as string[],
    files: JSON.parse(r.files || "[]") as PreparationFile[],
  })) as PreparationCheck[];
}
export async function savePreparationCheck(
  ctx: Context,
  orderId: string,
  input: z.infer<typeof preparationSchema>,
) {
  const key = input.stage === "Kiểm rập" ? "kiem_rap" : "kiem_npl";
  const department = departmentFor(input.stage);
  requirePermission(ctx, "production.create", { stage: input.stage });
  const o = await getOrderById(orderId);
  ensure(o, 404, "Không tìm thấy đơn.");
  ensure(o.status !== "completed", 422, "Đơn đã hoàn thành.");
  const people = await getEmployees();
  if (input.checked_by)
    ensure(
      people.some(
        (e) =>
          e.id === input.checked_by &&
          e.active !== 0 &&
          e.department_ids?.includes(department),
      ),
      422,
      "Người kiểm phải đang hoạt động và thuộc bộ phận của công đoạn.",
    );
  if (input.approved_by)
    ensure(
      people.some(
        (e) =>
          e.id === input.approved_by &&
          e.active !== 0 &&
          e.department_ids?.includes("management"),
      ),
      422,
      "Người duyệt phải thuộc bộ phận Quản lý.",
    );
  for (const url of new Set(input.photos)) {
    const image = (await db
      .prepare("SELECT owner_id FROM product_images WHERE id=?")
      .get(url.split("/").pop())) as { owner_id: string } | undefined;
    ensure(
      image && image.owner_id === ctx.user.id,
      422,
      "Ảnh chưa được tải lên bằng tài khoản của bạn.",
    );
  }
  const checkNames = new Map<string, string>();
  for (const file of input.files) {
    const stored = (await db
      .prepare("SELECT owner_id,name,size FROM preparation_files WHERE id=?")
      .get(file.url.split("/").pop())) as
      { owner_id: string; name: string; size: number } | undefined;
    ensure(
      stored && stored.owner_id === ctx.user.id,
      422,
      "File chưa được tải lên bằng tài khoản của bạn.",
    );
    // The name and size shown in the history come from the stored file, never from the request.
    checkNames.set(file.url, stored.name);
  }
  if (input.mode === "photo")
    ensure(
      input.photos.length > 0,
      422,
      "Chọn hoặc chụp ít nhất một ảnh bảng đo đã điền.",
    );
  if (input.mode === "file")
    ensure(input.files.length > 0, 422, "Chọn ít nhất một file để đính kèm.");
  if (input.mode === "photo" || input.mode === "file")
    ensure(
      !input.measurements.length,
      422,
      "Lượt xác nhận bằng ảnh hoặc file không kèm số đo.",
    );
  if (input.mode !== "file")
    ensure(
      !input.files.length,
      422,
      "Chỉ lượt xác nhận bằng file mới đính kèm file.",
    );
  if (input.mode === "text") {
    ensure(
      input.notes.trim().length > 0,
      422,
      "Nhập nội dung đánh giá cho lượt kiểm bằng chữ.",
    );
    ensure(
      !input.measurements.length,
      422,
      "Lượt đánh giá bằng chữ không kèm số đo.",
    );
  }
  const defects =
    key === "kiem_rap" ? outOfTolerance(input.measurements) : input.defect_qty;
  await db
    .prepare(
      "INSERT INTO preparation_checks(order_id,stage,result,defect_qty,notes,pattern_version,sizes_checked,pieces_expected,pieces_received,measurements,unit,mode,phase,photos,files,checked_by,approved_by,checked_on,actor_id,represented_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      orderId,
      key,
      input.result,
      defects,
      input.notes,
      input.pattern_version,
      input.sizes_checked,
      input.pieces_expected ?? null,
      input.pieces_received ?? null,
      JSON.stringify(input.measurements),
      input.unit,
      input.mode,
      key === "kiem_rap" ? input.phase : "",
      JSON.stringify([...new Set(input.photos)]),
      JSON.stringify(
        input.files.map((f) => ({
          url: f.url,
          name: checkNames.get(f.url) ?? f.name,
          size: f.size,
        })),
      ),
      input.checked_by || null,
      input.approved_by || null,
      input.checked_on,
      ctx.actor.id,
      ctx.representing ? ctx.user.id : null,
    );
  await audit(
    ctx,
    `Ghi kết quả ${input.stage}`,
    `${orderId} ${input.stage}: ${input.result}, lỗi ${defects}`,
    undefined,
    department,
  );
  return preparationChecksFor(orderId);
}
