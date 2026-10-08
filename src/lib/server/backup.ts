import { db } from "../db";
import { captureSnapshot, writeSnapshot } from "./snapshot";
import { mkdir, readdir, writeFile, stat, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { gzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { z } from "zod";
export const backupSchema = z
  .object({
    enabled: z.boolean(),
    intervalHours: z.number().int().min(1).max(8760),
    windowDays: z.number().int().min(1).max(3650),
  })
  .strict();
export type BackupConfig = z.infer<typeof backupSchema> & {
  nextAt: number;
  lastAt: number | null;
  lastError: string | null;
};
const folder = () =>
  resolve(/*turbopackIgnore: true*/ process.env.BACKUP_DIR || "backups");
export async function backupConfig(): Promise<BackupConfig> {
  const row = (await db
    .prepare("SELECT value FROM app_settings WHERE key='backup'")
    .get()) as { value: string } | undefined;
  return row
    ? JSON.parse(row.value)
    : {
        enabled: false,
        intervalHours: 24,
        windowDays: 30,
        nextAt: 0,
        lastAt: null,
        lastError: null,
      };
}
async function persist(config: BackupConfig) {
  await db
    .prepare(
      "INSERT INTO app_settings VALUES ('backup',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(JSON.stringify(config));
}
export async function configureBackup(input: z.infer<typeof backupSchema>) {
  const old = await backupConfig();
  const config = {
    ...old,
    ...input,
    nextAt: input.enabled ? Date.now() + input.intervalHours * 3600000 : 0,
  };
  await persist(config);
  return config;
}
export async function backupFiles() {
  await mkdir(folder(), { recursive: true, mode: 0o700 });
  const files = await readdir(folder());
  return (
    await Promise.all(
      files
        .filter((f) => /^LUUTA-[\w.-]+\.(pg.json.gz|json.gz)$/.test(f))
        .map(async (name) => ({
          name,
          bytes: (await stat(join(folder(), name))).size,
        })),
    )
  ).sort((a, b) => b.name.localeCompare(a.name));
}
export async function readBackup(name: string) {
  if (!/^LUUTA-[\w.-]+\.(pg.json.gz|json.gz)$/.test(name)) return null;
  try {
    return await readFile(join(folder(), name));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
let running = false;
export async function runBackup(now = Date.now()) {
  if (running) throw new Error("Backup đang chạy.");
  running = true;
  const config = await backupConfig();
  // Persist a lease so multiple Next.js processes do not run the same schedule.
  const claimed = await db.transaction(async () => {
    const lease = (await db
      .prepare("SELECT value FROM app_settings WHERE key='backup-lease'")
      .get()) as { value: string } | undefined;
    if (lease && Number(lease.value) > now) return false;
    await db
      .prepare(
        "INSERT INTO app_settings VALUES ('backup-lease',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(String(now + 3600000));
    return true;
  })();
  if (!claimed) {
    running = false;
    throw new Error("Backup đang chạy.");
  }
  const stamp = new Date(now).toISOString().replaceAll(":", "-");
  const base = `LUUTA-${stamp}-${randomUUID().slice(0, 8)}`;
  const snapshot = join(folder(), base + ".pg.json.gz");
  try {
    await mkdir(folder(), { recursive: true, mode: 0o700 });
    const dump = await captureSnapshot();
    await writeSnapshot(snapshot, dump);
    const rows = (name: string) => dump.tables[name] || [];
    const until = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(now));
    const from = new Date(
      Date.parse(until + "T12:00:00Z") - (config.windowDays - 1) * 86400000,
    )
      .toISOString()
      .slice(0, 10);
    const within = (value: unknown) =>
      typeof value === "string" &&
      value.slice(0, 10) >= from &&
      value.slice(0, 10) <= until;
    const production = rows("production_logs").filter((r) =>
      within(r.log_date),
    );
    const qc = rows("qc_records").filter((r) => within(r.created_at));
    const operations = rows("operation_records").filter((r) =>
      within(r.operation_date),
    );
    const pending = rows("pending_packing_pay").filter((r) =>
      within(r.work_date),
    );
    const ids = new Set(
      [...production, ...qc, ...operations, ...pending].map((r) => r.order_id),
    );
    const orders = rows("orders").filter(
      (r) => within(r.order_date) || ids.has(r.id),
    );
    for (const order of orders) ids.add(order.id);
    const related = (table: string) =>
      rows(table).filter((r) => ids.has(r.order_id));
    const photoIds = new Set(
      [...orders, ...related("operation_records")].map((r) => r.image_url),
    );
    const photos = rows("product_images")
      .filter((r) => photoIds.has(`/api/product-images/${r.id}`))
      .map((r) => ({
        id: r.id,
        mime: "image/jpeg",
        base64: (r.data as Buffer).toString("base64"),
      }));
    const productionIds = new Set(production.map((r) => r.id));
    const archive = {
      format: "LUUTA-business-v1",
      createdAt: new Date(now).toISOString(),
      from,
      until,
      orders,
      variants: related("order_variants"),
      stages: related("order_stages"),
      rates: related("order_rates"),
      departments: rows("departments"),
      employeeDepartments: rows("employee_departments"),
      assignments: related("work_assignments"),
      shipments: related("shipments"),
      shipmentItems: rows("shipment_items").filter((r) =>
        related("shipments").some((s) => s.id === r.shipment_id),
      ),
      workItems: related("order_work_items"),
      pendingPackingPay: related("pending_packing_pay"),
      production,
      qc,
      deliveryAsOfSnapshot: related("order_variants"),
      operations: related("operation_records"),
      stageEvents: related("stage_events"),
      adjustments: rows("production_adjustments").filter((r) =>
        productionIds.has(r.log_id),
      ),
      payrollLocks: rows("payroll_locks").filter(
        (r) =>
          String(r.month) >= from.slice(0, 7) &&
          String(r.month) <= until.slice(0, 7),
      ),
      employees: rows("employees"),
      lines: rows("lines"),
      audit: rows("audit_logs").filter((r) => within(r.created_at)),
      photos,
    };
    await writeFile(
      join(folder(), base + ".json.gz"),
      gzipSync(JSON.stringify(archive)),
      { mode: 0o600 },
    );
    const latest = await backupConfig();
    await persist({
      ...latest,
      lastAt: now,
      lastError: null,
      nextAt: latest.enabled ? now + latest.intervalHours * 3600000 : 0,
    });
    return { snapshot: base + ".pg.json.gz", archive: base + ".json.gz" };
  } catch (e) {
    await persist({
      ...config,
      lastError:
        "Không thể sao lưu. Kiểm tra dung lượng và quyền ghi thư mục backups.",
      nextAt: config.enabled ? now + 300000 : 0,
    });
    throw e;
  } finally {
    await db.prepare("DELETE FROM app_settings WHERE key='backup-lease'").run();
    running = false;
  }
}
export async function checkBackupDue(now = Date.now()) {
  const config = await backupConfig();
  if (config.enabled && config.nextAt <= now) return await runBackup(now);
}
export function startBackupScheduler() {
  const globalState = globalThis as typeof globalThis & {
    luutaBackupTimer?: ReturnType<typeof setInterval>;
  };
  if (globalState.luutaBackupTimer) return;
  const tick = () => {
    void checkBackupDue().catch(() => {});
  };
  globalState.luutaBackupTimer = setInterval(tick, 60000);
  globalState.luutaBackupTimer.unref();
  tick();
}
