import { db } from "../db";
import { PERMISSIONS, type Grant } from "../permissions";

async function createMigrationTable() {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version BIGINT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS')))",
  );
}
async function migrateBase() {
  if (
    await db.prepare("SELECT 1 FROM schema_migrations WHERE version = 1").get()
  )
    return;
  await db
    .transaction(async () => {
      if (
        await db
          .prepare("SELECT 1 FROM schema_migrations WHERE version=1")
          .get()
      )
        return;
      await db.exec(`
      ALTER TABLE orders ADD COLUMN version BIGINT NOT NULL DEFAULT 1;
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
        password_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','active','locked')),
        employee_id TEXT UNIQUE REFERENCES employees(id), line_ids TEXT NOT NULL DEFAULT '[]',
        must_change_password BIGINT NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS'))
      );
      CREATE TABLE roles (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, position BIGINT NOT NULL, protected BIGINT NOT NULL DEFAULT 0);
      CREATE TABLE role_grants (role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE, permission TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('self','lines','all')), PRIMARY KEY(role_id, permission));
      CREATE TABLE account_roles (account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE, role_id TEXT REFERENCES roles(id) ON DELETE CASCADE, PRIMARY KEY(account_id, role_id));
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires_at BIGINT NOT NULL, represented_id TEXT REFERENCES accounts(id));
      CREATE TABLE auth_attempts (key TEXT PRIMARY KEY, count BIGINT NOT NULL, reset_at BIGINT NOT NULL);
      CREATE TABLE order_rates (order_id TEXT REFERENCES orders(id), stage TEXT NOT NULL, unit_price BIGINT NOT NULL CHECK(unit_price >= 0), PRIMARY KEY(order_id, stage));
      CREATE TABLE idempotency (actor_id TEXT NOT NULL, request_key TEXT NOT NULL, payload_hash TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(actor_id, request_key));
      ALTER TABLE audit_logs ADD COLUMN actor_id TEXT;
      ALTER TABLE audit_logs ADD COLUMN represented_id TEXT;
      ALTER TABLE audit_logs ADD COLUMN line_id BIGINT;
      ALTER TABLE order_variants ADD COLUMN qc_inspected_qty BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE order_variants ADD COLUMN defect_qty BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE order_variants ADD COLUMN reworked_qty BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE order_variants ADD COLUMN reinspected_qty BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE order_variants ADD COLUMN repassed_qty BIGINT NOT NULL DEFAULT 0;
      CREATE INDEX sessions_account ON sessions(account_id);
      CREATE INDEX production_employee_month ON production_logs(employee_id, month);
    `);
      // Preserve legacy quantities and initialize the QC counters without rewriting wages.
      await db.exec(`UPDATE order_variants SET qc_inspected_qty = qc_passed_qty;
      UPDATE order_variants SET defect_qty = COALESCE((SELECT SUM(defect_qty) FROM qc_records q WHERE q.order_id=order_variants.order_id AND q.color=order_variants.color AND q.size=order_variants.size),0),
      reworked_qty = COALESCE((SELECT SUM(rework_qty) FROM qc_records q WHERE q.order_id=order_variants.order_id AND q.color=order_variants.color AND q.size=order_variants.size),0),
      reinspected_qty = COALESCE((SELECT SUM(reinspected_qty) FROM qc_records q WHERE q.order_id=order_variants.order_id AND q.color=order_variants.color AND q.size=order_variants.size),0),
      repassed_qty = COALESCE((SELECT SUM(repassed_qty) FROM qc_records q WHERE q.order_id=order_variants.order_id AND q.color=order_variants.color AND q.size=order_variants.size),0);
      UPDATE order_variants SET qc_inspected_qty = LEAST(sewn_qty, qc_passed_qty + defect_qty);
      INSERT INTO order_rates SELECT p.order_id,p.stage,CAST(p.unit_price AS BIGINT) FROM production_logs p WHERE p.id=(SELECT MAX(p2.id) FROM production_logs p2 WHERE p2.order_id=p.order_id AND p2.stage=p.stage);
    `);
      const all: Grant[] = Object.keys(PERMISSIONS).map((permission) => ({
        permission: permission as Grant["permission"],
        scope: "all",
      }));
      const business = all.filter(
        (g) =>
          !g.permission.startsWith("users.") &&
          !g.permission.startsWith("roles.") &&
          g.permission !== "orders.override" &&
          g.permission !== "payroll.adjust",
      );
      const defs = [
        {
          id: "admin",
          name: "Admin",
          position: 100,
          grants: all,
          protected: 1,
        },
        {
          id: "director",
          name: "Giám đốc",
          position: 80,
          grants: [
            ...business,
            { permission: "orders.override" as const, scope: "all" as const },
          ],
          protected: 0,
        },
        {
          id: "manager",
          name: "Trưởng phòng",
          position: 70,
          grants: [
            ...business.filter(
              (g) =>
                !g.permission.startsWith("payroll.") &&
                g.permission !== "rates.manage",
            ),
            { permission: "orders.override" as const, scope: "all" as const },
          ],
          protected: 0,
        },
        {
          id: "assistant",
          name: "Trợ lý sản xuất",
          position: 60,
          grants: business.filter(
            (g) => !["payroll.lock", "audit.view"].includes(g.permission),
          ),
          protected: 0,
        },
        {
          id: "leader",
          name: "Tổ trưởng",
          position: 40,
          grants: business
            .filter((g) =>
              [
                "orders.view",
                "orders.move",
                "production.view",
                "production.create",
                "qc.view",
                "qc.manage",
                "delivery.view",
                "delivery.manage",
                "export.data",
              ].includes(g.permission),
            )
            .map((g) => ({ ...g, scope: "lines" as const })),
          protected: 0,
        },
        {
          id: "qc",
          name: "QC",
          position: 30,
          grants: business.filter((g) =>
            [
              "orders.view",
              "orders.move",
              "qc.view",
              "qc.manage",
              "production.view",
              "production.create",
              "export.data",
            ].includes(g.permission),
          ),
          protected: 0,
        },
        {
          id: "worker",
          name: "Nhân viên",
          position: 10,
          grants: [
            { permission: "orders.view", scope: "lines" },
            ...[
              "production.view",
              "production.create",
              "payroll.view",
              "export.data",
            ].map((permission) => ({ permission, scope: "self" })),
          ] as Grant[],
          protected: 0,
        },
      ];
      for (const role of defs) {
        await db
          .prepare("INSERT INTO roles VALUES (?,?,?,?)")
          .run(role.id, role.name, role.position, role.protected);
        for (const g of role.grants)
          await db
            .prepare("INSERT INTO role_grants VALUES (?,?,?)")
            .run(role.id, g.permission, g.scope);
      }
      await db
        .prepare("INSERT INTO schema_migrations(version) VALUES (1)")
        .run();
    })
    .immediate();
}
// Product photos are included in the same SQLite backups as orders.
async function migrateImages() {
  if (
    !(await db.prepare("SELECT 1 FROM schema_migrations WHERE version=2").get())
  ) {
    await db
      .transaction(async () => {
        if (
          await db
            .prepare("SELECT 1 FROM schema_migrations WHERE version=2")
            .get()
        )
          return;
        await db.exec(`CREATE TABLE product_images (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES accounts(id), data BYTEA NOT NULL, created_at BIGINT NOT NULL);
      CREATE INDEX product_images_owner ON product_images(owner_id);`);
        await db
          .prepare("INSERT INTO schema_migrations(version) VALUES (2)")
          .run();
      })
      .immediate();
  }
}
export async function migrate() {
  await createMigrationTable();
  await migrateBase();
  await migrateImages();
  if (
    !(await db.prepare("SELECT 1 FROM schema_migrations WHERE version=3").get())
  ) {
    await db
      .transaction(async () => {
        if (
          await db
            .prepare("SELECT 1 FROM schema_migrations WHERE version=3")
            .get()
        )
          return;
        await db.exec(`ALTER TABLE order_variants ADD COLUMN color_hex TEXT;
        CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
        await db
          .prepare("INSERT INTO schema_migrations(version) VALUES (3)")
          .run();
      })
      .immediate();
  }
  if (
    !(await db.prepare("SELECT 1 FROM schema_migrations WHERE version=4").get())
  ) {
    await db
      .transaction(async () => {
        if (
          await db
            .prepare("SELECT 1 FROM schema_migrations WHERE version=4")
            .get()
        )
          return;
        await db
          .prepare(
            "INSERT INTO role_grants(role_id,permission,scope) SELECT id,'orders.override','all' FROM roles WHERE id IN ('admin','director') ON CONFLICT DO NOTHING",
          )
          .run();
        await db
          .prepare("INSERT INTO schema_migrations(version) VALUES (4)")
          .run();
      })
      .immediate();
  }
  if (
    !(await db.prepare("SELECT 1 FROM schema_migrations WHERE version=5").get())
  ) {
    await db
      .transaction(async () => {
        if (
          await db
            .prepare("SELECT 1 FROM schema_migrations WHERE version=5")
            .get()
        )
          return;
        await db.exec(`
        ALTER TABLE orders ADD COLUMN responsible_id TEXT REFERENCES employees(id);
        ALTER TABLE production_logs ADD COLUMN version BIGINT NOT NULL DEFAULT 1;
        ALTER TABLE order_stages ADD COLUMN received_at TEXT;
        CREATE TABLE operation_records (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),action TEXT NOT NULL,color TEXT NOT NULL,size TEXT NOT NULL,quantity BIGINT NOT NULL,passed BIGINT,packages BIGINT NOT NULL DEFAULT 0,operation_date TEXT NOT NULL,worker_id TEXT REFERENCES employees(id),notes TEXT NOT NULL DEFAULT '',image_url TEXT,actor_id TEXT NOT NULL,represented_id TEXT,created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS')));
        CREATE TABLE production_adjustments (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,log_id BIGINT NOT NULL REFERENCES production_logs(id),before_json TEXT NOT NULL,after_json TEXT NOT NULL,reason TEXT NOT NULL,actor_id TEXT NOT NULL,represented_id TEXT,created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS')));
        CREATE TABLE stage_events (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),stage_key TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,actor_id TEXT NOT NULL,represented_id TEXT,created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS')));
        CREATE INDEX operation_order ON operation_records(order_id,operation_date);
        CREATE INDEX adjustment_log ON production_adjustments(log_id);
      `);
        await db
          .prepare(
            "INSERT INTO role_grants SELECT id,'payroll.adjust','all' FROM roles WHERE id IN ('admin','director') ON CONFLICT DO NOTHING",
          )
          .run();
        await db
          .prepare("INSERT INTO schema_migrations(version) VALUES (5)")
          .run();
      })
      .immediate();
  }
  if (
    !(await db.prepare("SELECT 1 FROM schema_migrations WHERE version=6").get())
  ) {
    await db
      .transaction(async () => {
        if (
          await db
            .prepare("SELECT 1 FROM schema_migrations WHERE version=6")
            .get()
        )
          return;
        await db.exec(
          "ALTER TABLE order_variants ADD COLUMN colors_json TEXT;",
        );
        await db
          .prepare("INSERT INTO schema_migrations(version) VALUES (6)")
          .run();
      })
      .immediate();
  }
  if (
    !(await db.prepare("SELECT 1 FROM schema_migrations WHERE version=7").get())
  ) {
    await db
      .transaction(async () => {
        if (
          await db
            .prepare("SELECT 1 FROM schema_migrations WHERE version=7")
            .get()
        )
          return;
        await db.exec(`CREATE TABLE order_work_items (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), stage TEXT NOT NULL CHECK(stage IN ('Cắt','May')), name TEXT NOT NULL, unit_price BIGINT NOT NULL CHECK(unit_price>=0), UNIQUE(order_id,stage,name));
        ALTER TABLE production_logs ADD COLUMN work_item_id BIGINT REFERENCES order_work_items(id);
        ALTER TABLE production_logs ADD COLUMN work_item_name TEXT;
        ALTER TABLE production_logs ADD COLUMN completed_quantity BIGINT;
        CREATE INDEX production_work_item ON production_logs(work_item_id,color,size);`);
        await db
          .prepare("INSERT INTO schema_migrations(version) VALUES (7)")
          .run();
      })
      .immediate();
  }
  if (
    !(await db.prepare("SELECT 1 FROM schema_migrations WHERE version=8").get())
  ) {
    await db
      .transaction(async () => {
        await db
          .prepare(
            "INSERT INTO role_grants SELECT id,'delivery.record','all' FROM roles WHERE id='admin' ON CONFLICT DO NOTHING",
          )
          .run();
        await db
          .prepare("INSERT INTO schema_migrations(version) VALUES (8)")
          .run();
      })
      .immediate();
  }
  if (
    !(await db.prepare("SELECT 1 FROM schema_migrations WHERE version=9").get())
  ) {
    await db
      .transaction(async () => {
        if (
          await db
            .prepare("SELECT 1 FROM schema_migrations WHERE version=9")
            .get()
        )
          return;
        await db.exec(`CREATE TABLE pending_packing_pay (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, operation_id BIGINT NOT NULL UNIQUE REFERENCES operation_records(id),
        order_id TEXT NOT NULL REFERENCES orders(id), employee_id TEXT NOT NULL REFERENCES employees(id),
        employee_name TEXT NOT NULL, product_name TEXT NOT NULL, line_id BIGINT NOT NULL,
        color TEXT NOT NULL, size TEXT NOT NULL, work_date TEXT NOT NULL,
        quantity BIGINT NOT NULL CHECK(quantity>0), unit_price BIGINT NOT NULL CHECK(unit_price>=0),
        total_pay BIGINT NOT NULL CHECK(total_pay>=0), settled_log_id BIGINT UNIQUE REFERENCES production_logs(id),
        settlement_reason TEXT, settled_at TEXT, created_at TEXT NOT NULL DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS')));
        CREATE INDEX pending_packing_scope ON pending_packing_pay(employee_id,line_id,settled_log_id);`);
        await db
          .prepare("INSERT INTO schema_migrations(version) VALUES (9)")
          .run();
      })
      .immediate();
  }
}

let initialization: Promise<void> | undefined;
export function initializeDatabase() {
  return (initialization ??= db
    .transaction(async () => {
      const { baseSchema } = await import("./schema");
      await db.exec(baseSchema);
      await migrate();
      if (
        !(await db
          .prepare("SELECT 1 FROM schema_migrations WHERE version=10")
          .get())
      ) {
        await db.exec(`CREATE UNIQUE INDEX accounts_username_casefold ON accounts(lower(username));
        CREATE TABLE IF NOT EXISTS local_setup (key TEXT PRIMARY KEY);
        DO $$ DECLARE r record; BEGIN
          FOR r IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint WHERE contype='f' AND connamespace=current_schema()::regnamespace LOOP
            EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY IMMEDIATE',r.tbl,r.conname);
          END LOOP;
        END $$;`);
        await db
          .prepare("INSERT INTO schema_migrations(version) VALUES (10)")
          .run();
      }
      await (await import("./department-migration")).migrateDepartments();
      await (await import("./workshop-migration")).migrateWorkshopExtras();
      await (await import("./photo-migration")).migrateOrderPhotos();
      const preparation = await import("./preparation-migration");
      await preparation.migratePreparationChecks();
      await preparation.migratePatternCheckDetails();
      await preparation.migratePatternSpecs();
      await preparation.migratePreparationPhotos();
      await preparation.migratePomSheet();
      await preparation.migrateCheckMode();
      await preparation.migrateCheckPhase();
      await preparation.migrateCheckAttachments();
      await preparation.migrateCheckPointCounts();
    })()
    .catch((error) => {
      initialization = undefined;
      throw error;
    }));
}
