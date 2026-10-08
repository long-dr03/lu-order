import { db } from "../db";
import { DEPARTMENTS } from "../departments";

export async function migrateDepartments() {
  if (
    await db.prepare("SELECT 1 FROM schema_migrations WHERE version=11").get()
  )
    return;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS departments(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE);
    ALTER TABLE employees ALTER COLUMN line_id DROP NOT NULL;
    ALTER TABLE orders ALTER COLUMN line_id DROP NOT NULL;
    ALTER TABLE orders ALTER COLUMN line_id DROP DEFAULT;
    ALTER TABLE production_logs ALTER COLUMN line_id DROP NOT NULL;
    ALTER TABLE pending_packing_pay ALTER COLUMN line_id DROP NOT NULL;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS active BIGINT NOT NULL DEFAULT 1;
    CREATE TABLE IF NOT EXISTS employee_departments(employee_id TEXT NOT NULL REFERENCES employees(id),department_id TEXT NOT NULL REFERENCES departments(id),PRIMARY KEY(employee_id,department_id));
    CREATE TABLE IF NOT EXISTS work_assignments(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),stage TEXT NOT NULL,work_item_id BIGINT REFERENCES order_work_items(id),employee_id TEXT NOT NULL REFERENCES employees(id),department_id TEXT NOT NULL REFERENCES departments(id),active BIGINT NOT NULL DEFAULT 1,actor_id TEXT NOT NULL REFERENCES accounts(id),created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text));
    CREATE UNIQUE INDEX IF NOT EXISTS active_work_assignment ON work_assignments(order_id,stage,COALESCE(work_item_id,0),employee_id) WHERE active=1;
    CREATE TABLE IF NOT EXISTS shipments(id TEXT PRIMARY KEY,code TEXT UNIQUE NOT NULL,order_id TEXT NOT NULL REFERENCES orders(id),worker_id TEXT NOT NULL REFERENCES employees(id),delivered_at TIMESTAMPTZ NOT NULL,packages BIGINT NOT NULL DEFAULT 0,notes TEXT NOT NULL DEFAULT '',reason TEXT,actor_id TEXT NOT NULL REFERENCES accounts(id),represented_id TEXT REFERENCES accounts(id),created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS shipment_items(id TEXT PRIMARY KEY,shipment_id TEXT NOT NULL REFERENCES shipments(id),color TEXT NOT NULL,size TEXT NOT NULL,quantity BIGINT NOT NULL CHECK(quantity>0),UNIQUE(shipment_id,color,size));
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS reason TEXT;
    ALTER TABLE operation_records ADD COLUMN IF NOT EXISTS reason TEXT;
    ALTER TABLE operation_records ADD COLUMN IF NOT EXISTS operation_time TEXT;
    ALTER TABLE operation_records ADD COLUMN IF NOT EXISTS department_id TEXT REFERENCES departments(id);
    ALTER TABLE operation_records ADD COLUMN IF NOT EXISTS shipment_id TEXT REFERENCES shipments(id);
    ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS department_id TEXT REFERENCES departments(id);
    ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS reason TEXT;
    ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS actor_id TEXT;
    ALTER TABLE production_logs ADD COLUMN IF NOT EXISTS represented_id TEXT;
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS department_id TEXT REFERENCES departments(id);
    ALTER TABLE pending_packing_pay ADD COLUMN IF NOT EXISTS department_id TEXT REFERENCES departments(id);
    ALTER TABLE role_grants DROP CONSTRAINT IF EXISTS role_grants_scope_check;
    ALTER TABLE role_grants ADD CONSTRAINT role_grants_scope_check CHECK(scope IN ('self','lines','departments','all'));
    UPDATE role_grants SET scope='departments' WHERE scope='lines';
    DELETE FROM sessions;
    UPDATE accounts SET status='locked' WHERE EXISTS(SELECT 1 FROM account_roles ar WHERE ar.account_id=accounts.id AND ar.role_id='worker') AND NOT EXISTS(SELECT 1 FROM account_roles ar WHERE ar.account_id=accounts.id AND ar.role_id!='worker');
  `);
  for (const d of DEPARTMENTS)
    await db
      .prepare("INSERT INTO departments VALUES (?,?) ON CONFLICT DO NOTHING")
      .run(d.id, d.name);
  // No old line number is interpreted as a department. Admin classifies existing people.
  const managerCreated = await db
    .prepare(
      "INSERT INTO roles(id,name,position,protected) VALUES ('manager','Trưởng phòng',70,0) ON CONFLICT DO NOTHING",
    )
    .run();
  const operational = [
    "orders.view",
    "orders.create",
    "orders.edit",
    "orders.move",
    "production.view",
    "production.create",
    "production.assign",
    "employees.manage",
    "qc.view",
    "qc.manage",
    "delivery.view",
    "delivery.manage",
    "export.data",
  ];
  // Add newly introduced capabilities only. Never recreate an existing grant removed by Admin.
  for (const role of [
    "admin",
    "director",
    "manager",
    "assistant",
    "leader",
    "qc",
  ]) {
    if (!(await db.prepare("SELECT 1 FROM roles WHERE id=?").get(role)))
      continue;
    const freshDefaults = managerCreated.changes && role === "manager";
    const permissions = freshDefaults
      ? operational
      : ["production.assign", "employees.manage"];
    for (const permission of permissions) {
      if (
        !freshDefaults &&
        role !== "admin" &&
        !(await db
          .prepare(
            "SELECT 1 FROM role_grants WHERE role_id=? AND permission IN ('production.create','qc.manage','orders.move')",
          )
          .get(role))
      )
        continue;
      await db
        .prepare(
          "INSERT INTO role_grants(role_id,permission,scope) VALUES (?,?,?) ON CONFLICT DO NOTHING",
        )
        .run(
          role,
          permission,
          ["leader", "qc"].includes(role) ? "departments" : "all",
        );
    }
  }
  await db.exec(
    `DO $$ DECLARE r record; BEGIN FOR r IN SELECT conrelid::regclass AS tbl,conname FROM pg_constraint WHERE contype='f' AND connamespace=current_schema()::regnamespace LOOP EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY IMMEDIATE',r.tbl,r.conname); END LOOP; END $$;`,
  );
  await db.prepare("INSERT INTO schema_migrations(version) VALUES (11)").run();
}
