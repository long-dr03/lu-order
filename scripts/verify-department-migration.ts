import assert from "node:assert/strict";
async function main() {
  const { db } = await import("../src/lib/server/database");
  try {
    const { readSnapshot, restoreSnapshot, captureSnapshot } =
      await import("../src/lib/server/snapshot");
    const before = await readSnapshot(process.argv[2]);
    await (await import("../src/lib/server/migrate")).initializeDatabase();
    await restoreSnapshot(before);
    const after = await captureSnapshot();
    for (const table of [
      "orders",
      "order_variants",
      "employees",
      "production_logs",
      "qc_records",
      "operation_records",
      "order_work_items",
      "order_rates",
    ]) {
      const old = before.tables[table] || [];
      const fresh = after.tables[table] || [];
      assert.equal(fresh.length, old.length, `${table}: row count`);
      for (const row of old) {
        const restored = fresh.find((r) =>
          row.id !== undefined
            ? r.id === row.id
            : table === "order_rates"
              ? r.order_id === row.order_id && r.stage === row.stage
              : false,
        );
        assert(restored, `${table}: missing record`);
        for (const [key, value] of Object.entries(row))
          assert.deepEqual(
            JSON.parse(JSON.stringify(restored[key])),
            JSON.parse(JSON.stringify(value)),
            `${table}.${key}: history changed`,
          );
      }
    }
    for (const a of before.tables.accounts || []) {
      const restored = after.tables.accounts.find((r) => r.id === a.id)!;
      assert.equal(restored.password_hash, a.password_hash, "password changed");
      assert.equal(restored.employee_id, a.employee_id, "identity changed");
    }
    const wasDepartmentModel = before.tables.schema_migrations?.some(
      (r) => Number(r.version) === 11,
    );
    if (!wasDepartmentModel) {
      assert.equal(
        after.tables.employee_departments.length,
        0,
        "memberships were guessed",
      );
      assert.equal(
        after.tables.shipments.length,
        0,
        "legacy deliveries were fabricated",
      );
      assert.equal(
        after.tables.sessions.length,
        0,
        "old sessions were retained",
      );
    }
    console.log(
      JSON.stringify({
        verified: true,
        orders: after.tables.orders.length,
        people: after.tables.employees.length,
        logs: after.tables.production_logs.length,
        wages: after.tables.production_logs.reduce(
          (n, r) => n + Number(r.total_pay),
          0,
        ),
        migration: 11,
        unclassified: after.tables.employees.filter(
          (e) =>
            !after.tables.employee_departments.some(
              (d) => d.employee_id === e.id,
            ),
        ).length,
      }),
    );
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Migration verification failed",
  );
  process.exitCode = 1;
});
