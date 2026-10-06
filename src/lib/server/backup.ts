import { db } from "../db";
import "./migrate";
import {
  mkdir,
  readdir,
  writeFile,
  stat,
  chmod,
  readFile,
} from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
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
  join(
    dirname(
      resolve(
        /*turbopackIgnore: true*/ process.env.DATABASE_PATH || "lu_order.db",
      ),
    ),
    "backups",
  );
export function backupConfig(): BackupConfig {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key='backup'")
    .get() as { value: string } | undefined;
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
function persist(config: BackupConfig) {
  db.prepare(
    "INSERT INTO app_settings VALUES ('backup',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run(JSON.stringify(config));
}
export function configureBackup(input: z.infer<typeof backupSchema>) {
  const old = backupConfig();
  const config = {
    ...old,
    ...input,
    nextAt: input.enabled ? Date.now() + input.intervalHours * 3600000 : 0,
  };
  persist(config);
  return config;
}
export async function backupFiles() {
  await mkdir(folder(), { recursive: true, mode: 0o700 });
  const files = await readdir(folder());
  return (
    await Promise.all(
      files
        .filter((f) => /^LUUTA-[\w.-]+\.(db|json.gz)$/.test(f))
        .map(async (name) => ({
          name,
          bytes: (await stat(join(folder(), name))).size,
        })),
    )
  ).sort((a, b) => b.name.localeCompare(a.name));
}
export async function readBackup(name: string) {
  if (!/^LUUTA-[\w.-]+\.(db|json.gz)$/.test(name)) return null;
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
  const config = backupConfig();
  // Persist a lease so multiple Next.js processes do not run the same schedule.
  const claimed = db.transaction(() => {
    const lease = db
      .prepare("SELECT value FROM app_settings WHERE key='backup-lease'")
      .get() as { value: string } | undefined;
    if (lease && Number(lease.value) > now) return false;
    db.prepare(
      "INSERT INTO app_settings VALUES ('backup-lease',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).run(String(now + 3600000));
    return true;
  })();
  if (!claimed) {
    running = false;
    throw new Error("Backup đang chạy.");
  }
  const stamp = new Date(now).toISOString().replaceAll(":", "-");
  const base = `LUUTA-${stamp}-${randomUUID().slice(0, 8)}`;
  const snapshot = join(folder(), base + ".db");
  try {
    await mkdir(folder(), { recursive: true, mode: 0o700 });
    await db.backup(snapshot);
    await chmod(snapshot, 0o600);
    // Read from the snapshot to keep all rows and photos from the same point in time.
    const Database = (await import("better-sqlite3")).default;
    const source = new Database(snapshot, { readonly: true });
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
    try {
      const orders = source
        .prepare(
          `SELECT * FROM orders WHERE order_date BETWEEN ? AND ? OR id IN (SELECT order_id FROM production_logs WHERE log_date BETWEEN ? AND ? UNION SELECT order_id FROM qc_records WHERE substr(created_at,1,10) BETWEEN ? AND ? UNION SELECT order_id FROM operation_records WHERE operation_date BETWEEN ? AND ?)`,
        )
        .all(from, until, from, until, from, until, from, until) as {
        id: string;
        image_url: string | null;
      }[];
      const ids = new Set(orders.map((o) => o.id));
      const related = (table: string) =>
        (
          source.prepare(`SELECT * FROM ${table}`).all() as {
            order_id: string;
          }[]
        ).filter((r) => ids.has(r.order_id));
      const photos = (
        source.prepare("SELECT id,data FROM product_images").all() as {
          id: string;
          data: Buffer;
        }[]
      )
        .filter(
          (p) =>
            orders.some((o) => o.image_url === `/api/product-images/${p.id}`) ||
            (
              source
                .prepare(
                  "SELECT order_id FROM operation_records WHERE image_url=?",
                )
                .all(`/api/product-images/${p.id}`) as { order_id: string }[]
            ).some((r) => ids.has(r.order_id)),
        )
        .map((p) => ({
          id: p.id,
          mime: "image/jpeg",
          base64: p.data.toString("base64"),
        }));
      const archive = {
        format: "LUUTA-business-v1",
        createdAt: new Date(now).toISOString(),
        from,
        until,
        orders,
        variants: related("order_variants"),
        stages: related("order_stages"),
        rates: related("order_rates"),
        workItems: related("order_work_items"),
        pendingPackingPay: related("pending_packing_pay"),
        production: source
          .prepare(
            "SELECT * FROM production_logs WHERE log_date BETWEEN ? AND ?",
          )
          .all(from, until),
        qc: source
          .prepare(
            "SELECT * FROM qc_records WHERE substr(created_at,1,10) BETWEEN ? AND ?",
          )
          .all(from, until),
        deliveryAsOfSnapshot: related("order_variants").map((v) => v),
        operations: related("operation_records"),
        stageEvents: related("stage_events"),
        adjustments: source
          .prepare(
            "SELECT a.* FROM production_adjustments a JOIN production_logs p ON p.id=a.log_id WHERE p.log_date BETWEEN ? AND ?",
          )
          .all(from, until),
        payrollLocks: source
          .prepare("SELECT * FROM payroll_locks WHERE month BETWEEN ? AND ?")
          .all(from.slice(0, 7), until.slice(0, 7)),
        employees: source.prepare("SELECT * FROM employees").all(),
        lines: source.prepare("SELECT * FROM lines").all(),
        audit: source
          .prepare(
            "SELECT * FROM audit_logs WHERE substr(created_at,1,10) BETWEEN ? AND ?",
          )
          .all(from, until),
        photos,
      };
      await writeFile(
        join(folder(), base + ".json.gz"),
        gzipSync(JSON.stringify(archive)),
        { mode: 0o600 },
      );
    } finally {
      source.close();
    }
    const latest = backupConfig();
    persist({
      ...latest,
      lastAt: now,
      lastError: null,
      nextAt: latest.enabled ? now + latest.intervalHours * 3600000 : 0,
    });
    return { snapshot: base + ".db", archive: base + ".json.gz" };
  } catch (e) {
    persist({
      ...config,
      lastError:
        "Không thể sao lưu. Kiểm tra dung lượng và quyền ghi thư mục backups.",
      nextAt: config.enabled ? now + 300000 : 0,
    });
    throw e;
  } finally {
    db.prepare("DELETE FROM app_settings WHERE key='backup-lease'").run();
    running = false;
  }
}
export async function checkBackupDue(now = Date.now()) {
  const config = backupConfig();
  if (config.enabled && config.nextAt <= now) return runBackup(now);
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
