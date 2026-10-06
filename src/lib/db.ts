import { assessOrders } from "./progress";
import Database from "better-sqlite3";
import path from "path";
import {
  LUUTA_STAGES,
  StageKey,
  OrderVariant,
  OrderStage,
  Order,
  WorkItem,
  Line,
  Employee,
  ProductionLog,
  AuditLog,
} from "./types";

export * from "./types";

import fs from "fs";

const rawDbPath = process.env.DATABASE_PATH || "lu_order.db";
const dbPath = path.isAbsolute(rawDbPath)
  ? rawDbPath
  : path.resolve(/*turbopackIgnore: true*/ process.cwd(), rawDbPath);

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

// Enable WAL mode for high performance
db.pragma("journal_mode = WAL");

// Database initialization
db.exec(`
  CREATE TABLE IF NOT EXISTS lines (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    leader_name TEXT NOT NULL,
    workers_count INTEGER NOT NULL,
    capacity_per_day INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    line_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    phone TEXT
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer TEXT NOT NULL,
    product_code TEXT NOT NULL,
    product_name TEXT NOT NULL,
    image_url TEXT,
    total_quantity INTEGER NOT NULL DEFAULT 0,
    line_id INTEGER NOT NULL DEFAULT 1,
    order_date TEXT NOT NULL,
    deadline TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal',
    assigned_to TEXT NOT NULL,
    current_stage TEXT NOT NULL DEFAULT 'nhan_don',
    progress INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'on_track',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS order_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    color TEXT NOT NULL,
    size TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    cut_qty INTEGER NOT NULL DEFAULT 0,
    sewn_qty INTEGER NOT NULL DEFAULT 0,
    qc_passed_qty INTEGER NOT NULL DEFAULT 0,
    packed_qty INTEGER NOT NULL DEFAULT 0,
    delivered_qty INTEGER NOT NULL DEFAULT 0,
    UNIQUE(order_id, color, size)
  );

  CREATE TABLE IF NOT EXISTS order_stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    stage_key TEXT NOT NULL,
    stage_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    assignee TEXT,
    received_qty INTEGER NOT NULL DEFAULT 0,
    completed_qty INTEGER NOT NULL DEFAULT 0,
    remaining_qty INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    completed_at TEXT,
    notes TEXT,
    UNIQUE(order_id, stage_key)
  );

  CREATE TABLE IF NOT EXISTS production_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    line_id INTEGER NOT NULL,
    order_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    color TEXT NOT NULL,
    size TEXT NOT NULL,
    stage TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    total_pay REAL NOT NULL,
    updated_by TEXT NOT NULL,
    month TEXT NOT NULL,
    is_locked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS payroll_locks (
    month TEXT PRIMARY KEY,
    locked_by TEXT NOT NULL,
    locked_at TEXT DEFAULT (datetime('now', 'localtime')),
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS qc_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    color TEXT NOT NULL,
    size TEXT NOT NULL,
    inspected_qty INTEGER NOT NULL,
    passed_qty INTEGER NOT NULL,
    defect_qty INTEGER NOT NULL,
    defect_type TEXT,
    rework_qty INTEGER NOT NULL DEFAULT 0,
    reinspected_qty INTEGER NOT NULL DEFAULT 0,
    repassed_qty INTEGER NOT NULL DEFAULT 0,
    inspector TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

// ----------------- QUERY & MUTATION FUNCTIONS -----------------

export function getAllOrders(filter?: {
  search?: string;
  status?: string;
  line_id?: number;
}): Order[] {
  let sql = "SELECT * FROM orders WHERE 1=1";
  const params: (string | number)[] = [];

  if (filter?.search && filter.search.trim() !== "") {
    const term = `%${filter.search.trim()}%`;
    sql += ` AND (
      id LIKE ? OR customer LIKE ? OR product_code LIKE ? OR product_name LIKE ?
      OR id IN (SELECT order_id FROM order_variants WHERE color LIKE ? OR size LIKE ?)
    )`;
    params.push(term, term, term, term, term, term);
  }

  if (filter?.status && filter.status !== "all") {
    if (filter.status === "running") {
      sql += " AND status != 'completed'";
    } else if (filter.status === "needs_attention") {
      sql += " AND status IN ('at_risk', 'delayed')";
    } else if (filter.status === "waiting_delivery") {
      sql += " AND current_stage IN ('dong_goi', 'giao_hang')";
    } else if (filter.status === "cho_qc") {
      sql += " AND current_stage IN ('may', 'qc')";
    } else if (filter.status === "cho_dong_goi") {
      sql += " AND current_stage = 'dong_goi'";
    } else if (filter.status === "cho_giao") {
      sql += " AND current_stage = 'giao_hang'";
    } else if (filter.status === "da_giao_du") {
      sql += " AND current_stage = 'hoan_thanh'";
    } else {
      sql += " AND status = ?";
      params.push(filter.status);
    }
  }

  if (filter?.line_id) {
    sql += " AND line_id = ?";
    params.push(filter.line_id);
  }

  sql +=
    " ORDER BY CASE status WHEN 'delayed' THEN 1 WHEN 'at_risk' THEN 2 WHEN 'on_track' THEN 3 ELSE 4 END, deadline ASC";

  const orders = db.prepare(sql).all(...params) as Order[];

  // Attach variants to each order
  const variantStmt = db.prepare(
    "SELECT * FROM order_variants WHERE order_id = ?",
  );
  for (const o of orders) {
    o.variants = (variantStmt.all(o.id) as OrderVariant[]).map(decodeColors);
    o.work_items = db
      .prepare(
        "SELECT w.id,w.order_id,w.stage,w.name,COALESCE(SUM(p.quantity),0) recorded_quantity FROM order_work_items w LEFT JOIN production_logs p ON p.work_item_id=w.id WHERE w.order_id=? GROUP BY w.id ORDER BY w.id",
      )
      .all(o.id) as WorkItem[];
  }

  return assessOrders(orders, getLines(), throughput());
}

export function getOrderById(id: string): Order | null {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as
    Order | undefined;
  if (!order) return null;

  order.variants = db
    .prepare("SELECT * FROM order_variants WHERE order_id = ?")
    .all(id) as OrderVariant[];
  order.variants = order.variants.map(decodeColors);
  order.stages = db
    .prepare("SELECT * FROM order_stages WHERE order_id = ? ORDER BY id ASC")
    .all(id) as OrderStage[];

  const counts: Record<string, [string, string]> = {
    cat: ["quantity", "cut_qty"],
    may: ["cut_qty", "sewn_qty"],
    qc: ["sewn_qty", "qc_inspected_qty"],
    sua_hang: ["qc_defect_qty", "reworked_qty"],
    qc_lai: ["reworked_qty", "reinspected_qty"],
    dong_goi: ["qc_passed_qty", "packed_qty"],
    giao_hang: ["packed_qty", "delivered_qty"],
  };
  for (const stage of order.stages) {
    const columns = counts[stage.stage_key];
    if (!columns) continue;
    const sum = (key: string) =>
      (order.variants || []).reduce(
        (n, v) =>
          n + Number((v as unknown as Record<string, number>)[key] || 0),
        0,
      );
    stage.received_qty =
      stage.stage_key === "sua_hang"
        ? sum("qc_defect_qty") + sum("reinspected_qty") - sum("repassed_qty")
        : sum(columns[0]);
    stage.completed_qty = sum(columns[1]);
    stage.remaining_qty = Math.max(0, stage.received_qty - stage.completed_qty);
  }

  const all = getAllOrders();
  const assessed = all.find((o) => o.id === id);
  return { ...order, ...assessed, stages: order.stages };
}

export function createOrderWithVariants(
  data: {
    order: Omit<Order, "created_at" | "progress" | "status" | "version">;
    variants: Array<{ color: string; size: string; quantity: number }>;
  },
  actor = "Hệ thống",
): Order {
  const insertOrder = db.prepare(`
    INSERT INTO orders (id, customer, product_code, product_name, image_url, total_quantity, line_id, order_date, deadline, priority, assigned_to, current_stage, progress, status, notes)
    VALUES (@id, @customer, @product_code, @product_name, @image_url, @total_quantity, @line_id, @order_date, @deadline, @priority, @assigned_to, @current_stage, 0, 'on_track', @notes)
  `);

  const insertVariant = db.prepare(`
    INSERT INTO order_variants (order_id, color, size, quantity, cut_qty, sewn_qty, qc_passed_qty, packed_qty, delivered_qty)
    VALUES (@order_id, @color, @size, @quantity, 0, 0, 0, 0, 0)
  `);

  const insertStage = db.prepare(`
    INSERT INTO order_stages (order_id, stage_key, stage_name, status, assignee, received_qty, completed_qty, remaining_qty)
    VALUES (@order_id, @stage_key, @stage_name, @status, @assignee, @received_qty, 0, @remaining_qty)
  `);

  const totalQty = data.variants.reduce(
    (acc, v) => acc + Number(v.quantity || 0),
    0,
  );

  const tx = db.transaction(() => {
    insertOrder.run({
      ...data.order,
      total_quantity: totalQty,
    });

    for (const v of data.variants) {
      if (v.quantity > 0) {
        insertVariant.run({
          order_id: data.order.id,
          color: v.color,
          size: v.size,
          quantity: Number(v.quantity),
        });
      }
    }

    // Initialize all 11 stages
    for (let i = 0; i < LUUTA_STAGES.length; i++) {
      const s = LUUTA_STAGES[i];
      insertStage.run({
        order_id: data.order.id,
        stage_key: s.key,
        stage_name: s.label,
        status: i === 0 ? "in_progress" : "pending",
        assignee: data.order.assigned_to,
        received_qty: totalQty,
        remaining_qty: totalQty,
      });
    }

    // Log audit
    logAudit(
      actor,
      "Tạo đơn hàng mới",
      `Tạo mã ${data.order.id} - ${data.order.product_name} (SL: ${totalQty})`,
    );
  });

  tx();
  return getOrderById(data.order.id)!;
}

export function updateOrderStage(
  orderId: string,
  newStage: StageKey,
  userName: string = "Quản lý",
) {
  const order = getOrderById(orderId);
  if (!order) return null;

  const stageIndex = LUUTA_STAGES.findIndex((s) => s.key === newStage);
  const totalStages = LUUTA_STAGES.length;
  const progress = Math.min(
    100,
    Math.round(((stageIndex + 1) / totalStages) * 100),
  );

  const isCompleted = newStage === "hoan_thanh";

  const tx = db.transaction(() => {
    db.prepare(
      `
      UPDATE orders
      SET current_stage = ?, progress = ?, status = ?
      WHERE id = ?
    `,
    ).run(
      newStage,
      progress,
      isCompleted ? "completed" : order.status,
      orderId,
    );

    db.prepare(
      `
      UPDATE order_stages
      SET status = 'completed', completed_at = datetime('now', 'localtime')
      WHERE order_id = ? AND id < (SELECT id FROM order_stages WHERE order_id = ? AND stage_key = ?)
    `,
    ).run(orderId, orderId, newStage);

    db.prepare(
      `
      UPDATE order_stages
      SET status = 'in_progress', started_at = datetime('now', 'localtime')
      WHERE order_id = ? AND stage_key = ?
    `,
    ).run(orderId, newStage);

    logAudit(
      userName,
      "Chuyển công đoạn",
      `${orderId} chuyển sang: ${LUUTA_STAGES[stageIndex]?.label || newStage}`,
    );
  });

  tx();
  return getOrderById(orderId);
}

export function getLines(): Line[] {
  return db.prepare("SELECT * FROM lines ORDER BY id ASC").all() as Line[];
}

export function getEmployees(lineId?: number): Employee[] {
  const employees = db
    .prepare("SELECT * FROM employees ORDER BY name ASC")
    .all() as Employee[];
  const accounts = db
    .prepare(
      "SELECT employee_id,line_ids FROM accounts WHERE status='active' AND employee_id IS NOT NULL",
    )
    .all() as { employee_id: string; line_ids: string }[];
  const assignments = new Map(
    accounts.map((a) => [a.employee_id, JSON.parse(a.line_ids) as number[]]),
  );
  return employees
    .map((e) => ({ ...e, assigned_line_ids: assignments.get(e.id) || [] }))
    .filter(
      (e) =>
        !lineId || e.line_id === lineId || e.assigned_line_ids.includes(lineId),
    );
}

// ----------------- SẢN LƯỢNG & TÍNH LƯƠNG SẢN PHẨM -----------------

export function addProductionLog(
  data: Omit<ProductionLog, "id" | "created_at" | "is_locked">,
): ProductionLog {
  // Check if month is locked
  const lock = db
    .prepare("SELECT * FROM payroll_locks WHERE month = ?")
    .get(data.month);
  if (lock) {
    throw new Error(
      `Bảng lương tháng ${data.month} đã được CHỐT. Không thể thêm sản lượng mới!`,
    );
  }

  const totalPay = data.quantity * data.unit_price;

  const stmt = db.prepare(`
    INSERT INTO production_logs (log_date, employee_id, employee_name, line_id, order_id, product_name, color, size, stage, quantity, unit_price, total_pay, updated_by, month, is_locked)
    VALUES (@log_date, @employee_id, @employee_name, @line_id, @order_id, @product_name, @color, @size, @stage, @quantity, @unit_price, @total_pay, @updated_by, @month, 0)
  `);

  const res = stmt.run({ ...data, total_pay: totalPay });

  // Update variant stage quantity if applicable
  if (data.stage === "Cắt") {
    db.prepare(
      `
      UPDATE order_variants
      SET cut_qty = cut_qty + ?
      WHERE order_id = ? AND color = ? AND size = ?
    `,
    ).run(data.quantity, data.order_id, data.color, data.size);
  } else if (data.stage === "May") {
    db.prepare(
      `
      UPDATE order_variants
      SET sewn_qty = sewn_qty + ?
      WHERE order_id = ? AND color = ? AND size = ?
    `,
    ).run(data.quantity, data.order_id, data.color, data.size);
  }

  // Log audit
  logAudit(
    data.updated_by,
    "Cập nhật sản lượng",
    `${data.employee_name} • ${data.order_id} - ${data.product_name} • ${data.color}/${data.size} • ${data.stage} • +${data.quantity} sp (${totalPay.toLocaleString()}đ)`,
  );

  return db
    .prepare("SELECT * FROM production_logs WHERE id = ?")
    .get(res.lastInsertRowid) as ProductionLog;
}

export function getProductionLogs(filter?: {
  month?: string;
  employee_id?: string;
  line_id?: number;
  stage?: string;
}): ProductionLog[] {
  let sql = "SELECT * FROM production_logs WHERE 1=1";
  const params: (string | number)[] = [];

  if (filter?.month) {
    sql += " AND month = ?";
    params.push(filter.month);
  }
  if (filter?.employee_id) {
    sql += " AND employee_id = ?";
    params.push(filter.employee_id);
  }
  if (filter?.line_id) {
    sql += " AND line_id = ?";
    params.push(filter.line_id);
  }
  if (filter?.stage) {
    sql += " AND stage = ?";
    params.push(filter.stage);
  }

  sql += " ORDER BY id DESC";
  return db.prepare(sql).all(...params) as ProductionLog[];
}

export function getPayrollSummary(month: string, employeeId?: string) {
  let sql = `
    SELECT
      employee_id,
      employee_name,
      line_id,
      SUM(quantity) as total_qty,
      SUM(total_pay) as total_salary,
      COUNT(id) as total_entries
    FROM production_logs
    WHERE month = ?
  `;
  const params: (string | number)[] = [month];

  if (employeeId) {
    sql += " AND employee_id = ?";
    params.push(employeeId);
  }

  sql +=
    " GROUP BY employee_id, employee_name, line_id ORDER BY total_salary DESC";

  const rows = db.prepare(sql).all(...params);
  const isLocked = !!db
    .prepare("SELECT * FROM payroll_locks WHERE month = ?")
    .get(month);

  return {
    month,
    isLocked,
    summary: rows,
  };
}

export function lockPayroll(month: string, lockedBy: string) {
  const existing = db
    .prepare("SELECT * FROM payroll_locks WHERE month = ?")
    .get(month);
  if (existing) {
    throw new Error(`Tháng ${month} đã được chốt trước đó!`);
  }

  const tx = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO payroll_locks (month, locked_by, locked_at)
      VALUES (?, ?, datetime('now', 'localtime'))
    `,
    ).run(month, lockedBy);

    db.prepare(
      `
      UPDATE production_logs
      SET is_locked = 1
      WHERE month = ?
    `,
    ).run(month);

    logAudit(
      lockedBy,
      "CHỐT LƯƠNG THÁNG",
      `Đã khóa toàn bộ dữ liệu sản lượng và bảng lương tháng ${month}`,
    );
  });

  tx();
  return { success: true, month };
}

// ----------------- AUDIT & LOGGING -----------------

export function logAudit(userName: string, action: string, details: string) {
  db.prepare(
    `
    INSERT INTO audit_logs (user_name, action, details)
    VALUES (?, ?, ?)
  `,
  ).run(userName, action, details);
}

export function getAuditLogs(limit: number = 50): AuditLog[] {
  return db
    .prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?")
    .all(limit) as AuditLog[];
}

// ----------------- DASHBOARD METRICS -----------------

export function getDirectorDashboardStats() {
  const orders = db.prepare("SELECT * FROM orders").all() as Order[];
  const logsThisMonth = db
    .prepare(
      `
    SELECT
      SUM(quantity) as total_qty,
      SUM(total_pay) as total_pay
    FROM production_logs
    WHERE month = strftime('%Y-%m', 'now', 'localtime')
  `,
    )
    .get() as { total_qty: number; total_pay: number };

  const totalRunning = orders.filter((o) => o.status !== "completed").length;
  const atRisk = orders.filter((o) => o.status === "at_risk").length;
  const delayed = orders.filter((o) => o.status === "delayed").length;
  const completed = orders.filter((o) => o.status === "completed").length;
  const waitingQc = orders.filter(
    (o) => o.current_stage === "may" || o.current_stage === "qc",
  ).length;
  const waitingDelivery = orders.filter(
    (o) => o.current_stage === "dong_goi" || o.current_stage === "giao_hang",
  ).length;

  const lines = getLines();
  const lineStats = lines.map((l) => {
    const lineOrders = orders.filter(
      (o) => o.line_id === l.id && o.status !== "completed",
    );
    const totalRemainingQty = lineOrders.reduce(
      (sum, o) => sum + Math.round(o.total_quantity * (1 - o.progress / 100)),
      0,
    );
    const daysNeeded =
      l.capacity_per_day > 0
        ? Math.ceil(totalRemainingQty / l.capacity_per_day)
        : 0;

    return {
      ...l,
      activeOrders: lineOrders.length,
      totalRemainingQty,
      daysNeeded,
      isOverloaded: daysNeeded > 10,
    };
  });

  const employeesCount = (
    db.prepare("SELECT COUNT(*) as count FROM employees").get() as {
      count: number;
    }
  ).count;

  return {
    orders: {
      totalRunning,
      atRisk,
      delayed,
      completed,
      waitingQc,
      waitingDelivery,
    },
    production: {
      monthlyQty: logsThisMonth?.total_qty || 0,
      monthlyPay: logsThisMonth?.total_pay || 0,
      lineStats,
    },
    employeesCount,
  };
}

export function generateNextOrderCode(): string {
  const ids = db.prepare("SELECT id FROM orders").all() as { id: string }[];
  const largest = ids.reduce(
    (n, row) =>
      /^LU-\d+$/.test(row.id) ? Math.max(n, Number(row.id.slice(3))) : n,
    0,
  );
  return `LU-${String(largest + 1).padStart(3, "0")}`;
}

export function throughput() {
  return db
    .prepare(
      "SELECT line_id,SUM(COALESCE(completed_quantity,quantity))*1.0/14 daily FROM production_logs WHERE stage='May' AND log_date BETWEEN date('now','+7 hours','-13 days') AND date('now','+7 hours') GROUP BY line_id",
    )
    .all() as { line_id: number; daily: number }[];
}

function decodeColors(v: OrderVariant) {
  const raw = (v as OrderVariant & { colors_json?: string }).colors_json;
  return {
    ...v,
    colors: raw
      ? JSON.parse(raw)
      : v.color_hex
        ? [{ name: v.color, hex: v.color_hex }]
        : [],
  };
}
