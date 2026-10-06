import { z } from "zod";
import { AppError } from "./auth";
export const text = z.string().trim().min(1).max(160);
export const password = z.string().min(10).max(128);
export const username = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^[a-zA-Z0-9_.-]+$/)
  .transform((v) => v.toLowerCase());
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v,
  );
export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const quantity = z.number().int().positive().max(1000000);
export const line = z.number().int().min(1).max(5);
export async function body(request: Request) {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 100000)
    throw new AppError(413, "Dữ liệu quá lớn.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError(422, "Dữ liệu JSON không hợp lệ.");
  }
}
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
