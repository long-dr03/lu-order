import { gzipSync, gunzipSync } from "node:zlib";
import { readFile, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { db } from "./database";

export const TABLES = [
  "departments",
  "lines",
  "employees",
  "employee_departments",
  "orders",
  "order_variants",
  "order_photos",
  "preparation_checks",
  "pattern_specs",
  "pattern_sheets",
  "order_stages",
  "production_logs",
  "payroll_locks",
  "audit_logs",
  "qc_records",
  "accounts",
  "roles",
  "role_grants",
  "account_roles",
  "sessions",
  "auth_attempts",
  "order_rates",
  "idempotency",
  "product_images",
  "preparation_files",
  "app_settings",
  "operation_records",
  "production_adjustments",
  "stage_events",
  "order_work_items",
  "work_assignments",
  "shipments",
  "shipment_items",
  "pending_packing_pay",
  "order_materials",
  "material_movements",
  "defect_attributions",
  "local_setup",
  "schema_migrations",
] as const;
export type Snapshot = {
  format: "LUUTA-postgres-v1";
  createdAt: string;
  tables: Record<string, Record<string, unknown>[]>;
};
export async function captureSnapshot(): Promise<Snapshot> {
  return await db.transaction(
    async () => {
      const tables: Snapshot["tables"] = {};
      for (const name of TABLES) {
        if (
          !(
            (await db.prepare("SELECT to_regclass(?) AS name").get(name)) as {
              name: string | null;
            }
          ).name
        )
          continue;
        tables[name] = (await db
          .prepare(`SELECT * FROM "${name}"`)
          .all()) as Record<string, unknown>[];
      }
      return {
        format: "LUUTA-postgres-v1" as const,
        createdAt: new Date().toISOString(),
        tables,
      };
    },
    { readOnly: true },
  )();
}
export async function writeSnapshot(file: string, snapshot: Snapshot) {
  const temp = file + "." + randomUUID() + ".tmp";
  await writeFile(temp, gzipSync(JSON.stringify(snapshot)), { mode: 0o600 });
  await rename(temp, file);
}
export async function readSnapshot(file: string): Promise<Snapshot> {
  const snapshot = JSON.parse(gunzipSync(await readFile(file)).toString());
  if (snapshot.format !== "LUUTA-postgres-v1" || !snapshot.tables)
    throw new Error("Unsupported backup format");
  for (const name of Object.keys(snapshot.tables))
    if (!(TABLES as readonly string[]).includes(name))
      throw new Error("Unknown backup table");
  return snapshot;
}
// Restore only into an empty application database. Never merge or overwrite live data.
export async function restoreSnapshot(snapshot: Snapshot) {
  await db.transaction(async () => {
    for (const table of [
      "accounts",
      "orders",
      "employees",
      "production_logs",
      "product_images",
      "operation_records",
      "work_assignments",
      "shipments",
      "pending_packing_pay",
    ]) {
      if (await db.prepare(`SELECT 1 FROM "${table}" LIMIT 1`).get())
        throw new Error("Restore requires an empty database");
    }
    // Existing migration defaults are replaced atomically, with all FK checks deferred.
    await db.exec("SET CONSTRAINTS ALL DEFERRED");
    for (const table of [...TABLES].reverse()) {
      if (table === "schema_migrations" && !snapshot.tables.schema_migrations)
        continue;
      if (
        (
          (await db.prepare("SELECT to_regclass(?) AS name").get(table)) as {
            name: string | null;
          }
        ).name
      )
        await db.exec(`DELETE FROM "${table}"`);
    }
    for (const table of TABLES) {
      if (table === "schema_migrations" && !snapshot.tables.schema_migrations)
        continue;
      for (const row of snapshot.tables[table] ?? []) {
        const names = Object.keys(row);
        if (names.some((n) => !/^[a-z_]+$/.test(n)))
          throw new Error("Invalid backup column");
        const values = names.map((n) => {
          const v = row[n];
          return v &&
            typeof v === "object" &&
            "type" in v &&
            v.type === "Buffer" &&
            "data" in v
            ? Buffer.from(v.data as number[])
            : v;
        });
        await db
          .prepare(
            `INSERT INTO "${table}" (${names.map((n) => `"${n}"`).join(",")}) VALUES (${names.map(() => "?").join(",")})`,
          )
          .run(...values);
      }
    }
    // Resolve deferred FK events before migration DDL touches restored tables.
    await db.exec("SET CONSTRAINTS ALL IMMEDIATE");
    await (await import("./department-migration")).migrateDepartments();
    await (await import("./workshop-migration")).migrateWorkshopExtras();
    for (const table of TABLES) {
      const seq = (await db
        .prepare(
          "SELECT pg_get_serial_sequence(?, 'id') AS seq FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=? AND column_name='id'",
        )
        .get(table, table)) as { seq: string | null } | undefined;
      if (seq?.seq)
        await db
          .prepare(
            `SELECT setval(?::regclass, GREATEST(COALESCE(MAX(id),0),1), COUNT(*)>0) FROM "${table}"`,
          )
          .get(seq.seq);
    }
  })();
}
