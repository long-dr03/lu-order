import Database from "better-sqlite3";
import path from "path";
import {
  LUUTA_STAGES,
  StageKey,
  OrderVariant,
  OrderStage,
  Order,
  Line,
  Employee,
  ProductionLog,
  AuditLog,
  QcRecord,
} from "./types";

export * from "./types";

const dbPath = path.resolve(process.cwd(), "lu_order.db");
const db = new Database(dbPath);

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

// Seed data if empty
const countLines = db.prepare("SELECT COUNT(*) as count FROM lines").get() as { count: number };

if (countLines.count === 0) {
  // 1. Seed 5 Chuyền sản xuất
  const insertLine = db.prepare(`
    INSERT INTO lines (id, name, leader_name, workers_count, capacity_per_day)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertLine.run(1, "Chuyền 1", "Nguyễn Thị Hoa", 8, 35);
  insertLine.run(2, "Chuyền 2", "Trần Văn Bình", 10, 45);
  insertLine.run(3, "Chuyền 3", "Lê Thu Hà", 7, 30);
  insertLine.run(4, "Chuyền 4", "Phạm Minh Đạt", 9, 40);
  insertLine.run(5, "Chuyền 5", "Vũ Thị Mai", 8, 35);

  // 2. Seed Nhân viên
  const insertEmp = db.prepare(`
    INSERT INTO employees (id, name, line_id, role, phone)
    VALUES (?, ?, ?, ?, ?)
  `);

  const initialEmployees = [
    ["NV-01", "Nguyễn Văn A", 1, "May", "0901234567"],
    ["NV-02", "Trần Thị B", 1, "May", "0902345678"],
    ["NV-03", "Lê Văn C", 2, "Cắt", "0903456789"],
    ["NV-04", "Hoàng Thị D", 2, "May", "0904567890"],
    ["NV-05", "Phạm Văn E", 3, "May", "0905678901"],
    ["NV-06", "Vũ Thị F", 3, "QC", "0906789012"],
    ["NV-07", "Đỗ Văn G", 4, "May", "0907890123"],
    ["NV-08", "Ngô Thị H", 4, "Sửa hàng", "0908901234"],
    ["NV-09", "Bùi Văn K", 5, "Đóng gói", "0909012345"],
    ["NV-10", "Dương Thị M", 5, "May", "0909123456"],
  ];

  for (const emp of initialEmployees) {
    insertEmp.run(...emp);
  }

  // 3. Seed Đơn hàng mẫu của LUUTA
  const insertOrder = db.prepare(`
    INSERT INTO orders (id, customer, product_code, product_name, image_url, total_quantity, line_id, order_date, deadline, priority, assigned_to, current_stage, progress, status, notes)
    VALUES (@id, @customer, @product_code, @product_name, @image_url, @total_quantity, @line_id, @order_date, @deadline, @priority, @assigned_to, @current_stage, @progress, @status, @notes)
  `);

  const insertVariant = db.prepare(`
    INSERT INTO order_variants (order_id, color, size, quantity, cut_qty, sewn_qty, qc_passed_qty, packed_qty, delivered_qty)
    VALUES (@order_id, @color, @size, @quantity, @cut_qty, @sewn_qty, @qc_passed_qty, @packed_qty, @delivered_qty)
  `);

  const insertStage = db.prepare(`
    INSERT INTO order_stages (order_id, stage_key, stage_name, status, assignee, received_qty, completed_qty, remaining_qty, started_at, completed_at, notes)
    VALUES (@order_id, @stage_key, @stage_name, @status, @assignee, @received_qty, @completed_qty, @remaining_qty, @started_at, @completed_at, @notes)
  `);

  // LU-001: Đầm lụa xếp ly A (111 sản phẩm theo đúng bảng ví dụ size x màu của LUUTA)
  insertOrder.run({
    id: "LU-001",
    customer: "Thời Trang Elise",
    product_code: "DL-01",
    product_name: "Đầm lụa xếp ly A",
    image_url: null,
    total_quantity: 111,
    line_id: 1,
    order_date: "2026-10-01",
    deadline: "2026-10-12",
    priority: "high",
    assigned_to: "Chuyền 1 (Nguyễn Thị Hoa)",
    current_stage: "may",
    progress: 55,
    status: "on_track",
    notes: "Vải lụa cao cấp, đường may tỉ mỉ, ủi định hình",
  });

  // Variants for LU-001
  const v001 = [
    // Đen: XS=5, S=10, M=20, L=10, XL=5 (Tổng 50)
    { color: "Đen", size: "XS", q: 5, cut: 5, sew: 4, qc: 4, pack: 4, del: 0 },
    { color: "Đen", size: "S", q: 10, cut: 10, sew: 8, qc: 8, pack: 6, del: 0 },
    { color: "Đen", size: "M", q: 20, cut: 20, sew: 15, qc: 13, pack: 10, del: 10 },
    { color: "Đen", size: "L", q: 10, cut: 10, sew: 8, qc: 8, pack: 8, del: 8 },
    { color: "Đen", size: "XL", q: 5, cut: 5, sew: 3, qc: 3, pack: 2, del: 0 },
    // Trắng: XS=3, S=8, M=15, L=8, XL=2 (Tổng 36)
    { color: "Trắng", size: "XS", q: 3, cut: 3, sew: 3, qc: 3, pack: 0, del: 0 },
    { color: "Trắng", size: "S", q: 8, cut: 8, sew: 6, qc: 5, pack: 0, del: 0 },
    { color: "Trắng", size: "M", q: 15, cut: 15, sew: 12, qc: 10, pack: 0, del: 0 },
    { color: "Trắng", size: "L", q: 8, cut: 8, sew: 6, qc: 5, pack: 0, del: 0 },
    { color: "Trắng", size: "XL", q: 2, cut: 2, sew: 1, qc: 1, pack: 0, del: 0 },
    // Đỏ: XS=2, S=5, M=10, L=5, XL=3 (Tổng 25)
    { color: "Đỏ", size: "XS", q: 2, cut: 2, sew: 1, qc: 0, pack: 0, del: 0 },
    { color: "Đỏ", size: "S", q: 5, cut: 5, sew: 3, qc: 2, pack: 0, del: 0 },
    { color: "Đỏ", size: "M", q: 10, cut: 10, sew: 6, qc: 4, pack: 0, del: 0 },
    { color: "Đỏ", size: "L", q: 5, cut: 5, sew: 3, qc: 2, pack: 0, del: 0 },
    { color: "Đỏ", size: "XL", q: 3, cut: 3, sew: 2, qc: 1, pack: 0, del: 0 },
  ];

  for (const item of v001) {
    insertVariant.run({
      order_id: "LU-001",
      color: item.color,
      size: item.size,
      quantity: item.q,
      cut_qty: item.cut,
      sewn_qty: item.sew,
      qc_passed_qty: item.qc,
      packed_qty: item.pack,
      delivered_qty: item.del,
    });
  }

  // LU-002: Áo Blazer Form Rộng (80 cái) - Đang ở khâu Cắt
  insertOrder.run({
    id: "LU-002",
    customer: "Local Brand Hades",
    product_code: "BZ-02",
    product_name: "Áo Blazer Form Rộng",
    image_url: null,
    total_quantity: 80,
    line_id: 2,
    order_date: "2026-10-02",
    deadline: "2026-10-08",
    priority: "urgent",
    assigned_to: "Chuyền 2 (Trần Văn Bình)",
    current_stage: "cat",
    progress: 30,
    status: "at_risk",
    notes: "Cần giao gấp ngày 08/10. Chuyền 2 đang dồn lực cắt may.",
  });

  const v002 = [
    { color: "Đen", size: "M", q: 25, cut: 25, sew: 10, qc: 0, pack: 0, del: 0 },
    { color: "Đen", size: "L", q: 20, cut: 20, sew: 5, qc: 0, pack: 0, del: 0 },
    { color: "Kem", size: "S", q: 15, cut: 15, sew: 0, qc: 0, pack: 0, del: 0 },
    { color: "Kem", size: "M", q: 20, cut: 10, sew: 0, qc: 0, pack: 0, del: 0 },
  ];
  for (const item of v002) {
    insertVariant.run({
      order_id: "LU-002",
      color: item.color,
      size: item.size,
      quantity: item.q,
      cut_qty: item.cut,
      sewn_qty: item.sew,
      qc_passed_qty: item.qc,
      packed_qty: item.pack,
      delivered_qty: item.del,
    });
  }

  // LU-003: Đầm suông Linen (50 cái) - Đang trễ ở khâu sửa hàng
  insertOrder.run({
    id: "LU-003",
    customer: "Thời Trang Bella",
    product_code: "DL-03",
    product_name: "Đầm suông Linen thêu",
    image_url: null,
    total_quantity: 50,
    line_id: 3,
    order_date: "2026-09-28",
    deadline: "2026-10-05",
    priority: "urgent",
    assigned_to: "Chuyền 3 (Lê Thu Hà)",
    current_stage: "sua_hang",
    progress: 65,
    status: "delayed",
    notes: "Hạn giao 05/10 đã trễ. Đang sửa hàng 8 cái lỗi đường may.",
  });

  const v003 = [
    { color: "Be", size: "S", q: 15, cut: 15, sew: 15, qc: 10, pack: 0, del: 0 },
    { color: "Be", size: "M", q: 25, cut: 25, sew: 25, qc: 18, pack: 0, del: 0 },
    { color: "Trắng", size: "M", q: 10, cut: 10, sew: 10, qc: 6, pack: 0, del: 0 },
  ];
  for (const item of v003) {
    insertVariant.run({
      order_id: "LU-003",
      color: item.color,
      size: item.size,
      quantity: item.q,
      cut_qty: item.cut,
      sewn_qty: item.sew,
      qc_passed_qty: item.qc,
      packed_qty: item.pack,
      delivered_qty: item.del,
    });
  }

  // LU-004: Áo sơ mi lụa công sở (45 cái) - Đang chờ giao
  insertOrder.run({
    id: "LU-004",
    customer: "Đồng Phục V-Tech",
    product_code: "SM-04",
    product_name: "Áo sơ mi lụa công sở",
    image_url: null,
    total_quantity: 45,
    line_id: 4,
    order_date: "2026-09-25",
    deadline: "2026-10-07",
    priority: "normal",
    assigned_to: "Chuyền 4 (Phạm Minh Đạt)",
    current_stage: "giao_hang",
    progress: 95,
    status: "on_track",
    notes: "Đã đóng gói đủ 45 cái. Đang chờ xe vận chuyển lấy hàng.",
  });

  const v004 = [
    { color: "Trắng", size: "M", q: 20, cut: 20, sew: 20, qc: 20, pack: 20, del: 20 },
    { color: "Trắng", size: "L", q: 15, cut: 15, sew: 15, qc: 15, pack: 15, del: 13 }, // thiếu 2 cái L
    { color: "Xanh", size: "M", q: 10, cut: 10, sew: 10, qc: 10, pack: 10, del: 10 },
  ];
  for (const item of v004) {
    insertVariant.run({
      order_id: "LU-004",
      color: item.color,
      size: item.size,
      quantity: item.q,
      cut_qty: item.cut,
      sewn_qty: item.sew,
      qc_passed_qty: item.qc,
      packed_qty: item.pack,
      delivered_qty: item.del,
    });
  }

  // 4. Seed Stages cho từng đơn
  const allOrders = [
    { id: "LU-001", cur: "may", total: 111 },
    { id: "LU-002", cur: "cat", total: 80 },
    { id: "LU-003", cur: "sua_hang", total: 50 },
    { id: "LU-004", cur: "giao_hang", total: 45 },
  ];

  for (const ord of allOrders) {
    const curIndex = LUUTA_STAGES.findIndex((s) => s.key === ord.cur);

    for (let i = 0; i < LUUTA_STAGES.length; i++) {
      const s = LUUTA_STAGES[i];
      let status: "pending" | "in_progress" | "completed" | "has_issue" = "pending";
      let comp = 0;
      let started: string | null = null;
      let completed: string | null = null;

      if (i < curIndex) {
        status = "completed";
        comp = ord.total;
        started = "2026-10-02 08:00";
        completed = "2026-10-03 17:00";
      } else if (i === curIndex) {
        status = ord.cur === "sua_hang" ? "has_issue" : "in_progress";
        comp = Math.round(ord.total * 0.5);
        started = "2026-10-04 08:00";
      }

      insertStage.run({
        order_id: ord.id,
        stage_key: s.key,
        stage_name: s.label,
        status,
        assignee: "Tổ phụ trách",
        received_qty: ord.total,
        completed_qty: comp,
        remaining_qty: ord.total - comp,
        started_at: started,
        completed_at: completed,
        notes: status === "has_issue" ? "Có 8 sản phẩm lỗi đang sửa" : null,
      });
    }
  }

  // 5. Seed Production Logs (Cập nhật sản lượng tính lương)
  const insertLog = db.prepare(`
    INSERT INTO production_logs (log_date, employee_id, employee_name, line_id, order_id, product_name, color, size, stage, quantity, unit_price, total_pay, updated_by, month, is_locked)
    VALUES (@log_date, @employee_id, @employee_name, @line_id, @order_id, @product_name, @color, @size, @stage, @quantity, @unit_price, @total_pay, @updated_by, @month, @is_locked)
  `);

  const initialLogs = [
    {
      log_date: "2026-10-05",
      employee_id: "NV-01",
      employee_name: "Nguyễn Văn A",
      line_id: 1,
      order_id: "LU-001",
      product_name: "Đầm lụa xếp ly A",
      color: "Đen",
      size: "M",
      stage: "May",
      quantity: 15,
      unit_price: 35000,
      total_pay: 525000,
      updated_by: "Tổ trưởng Hoa",
      month: "2026-10",
      is_locked: 0,
    },
    {
      log_date: "2026-10-04",
      employee_id: "NV-01",
      employee_name: "Nguyễn Văn A",
      line_id: 1,
      order_id: "LU-001",
      product_name: "Đầm lụa xếp ly A",
      color: "Đen",
      size: "M",
      stage: "May",
      quantity: 105,
      unit_price: 35000,
      total_pay: 3675000,
      updated_by: "Tổ trưởng Hoa",
      month: "2026-10",
      is_locked: 0,
    },
    {
      log_date: "2026-10-03",
      employee_id: "NV-01",
      employee_name: "Nguyễn Văn A",
      line_id: 1,
      order_id: "LU-001",
      product_name: "Đầm lụa xếp ly A",
      color: "Trắng",
      size: "S",
      stage: "May",
      quantity: 80,
      unit_price: 40000,
      total_pay: 3200000,
      updated_by: "Tổ trưởng Hoa",
      month: "2026-10",
      is_locked: 0,
    },
    {
      log_date: "2026-10-02",
      employee_id: "NV-01",
      employee_name: "Nguyễn Văn A",
      line_id: 1,
      order_id: "LU-001",
      product_name: "Đầm lụa xếp ly A",
      color: "Đỏ",
      size: "M",
      stage: "May",
      quantity: 50,
      unit_price: 20000,
      total_pay: 1000000,
      updated_by: "Tổ trưởng Hoa",
      month: "2026-10",
      is_locked: 0,
    },
    {
      log_date: "2026-10-05",
      employee_id: "NV-02",
      employee_name: "Trần Thị B",
      line_id: 1,
      order_id: "LU-001",
      product_name: "Đầm lụa xếp ly A",
      color: "Đen",
      size: "L",
      stage: "May",
      quantity: 20,
      unit_price: 35000,
      total_pay: 700000,
      updated_by: "Tổ trưởng Hoa",
      month: "2026-10",
      is_locked: 0,
    },
    {
      log_date: "2026-10-05",
      employee_id: "NV-03",
      employee_name: "Lê Văn C",
      line_id: 2,
      order_id: "LU-002",
      product_name: "Áo Blazer Form Rộng",
      color: "Đen",
      size: "M",
      stage: "Cắt",
      quantity: 45,
      unit_price: 15000,
      total_pay: 675000,
      updated_by: "Tổ trưởng Bình",
      month: "2026-10",
      is_locked: 0,
    },
  ];

  for (const log of initialLogs) {
    insertLog.run(log);
  }

  // 6. Seed Audit Logs
  const insertAudit = db.prepare(`
    INSERT INTO audit_logs (user_name, action, details, created_at)
    VALUES (?, ?, ?, ?)
  `);

  insertAudit.run("Nguyễn B", "Cập nhật sản lượng", "LU-027 – Đầm A – May – Đen/M – +6 sản phẩm", "2026-10-05 17:32:00");
  insertAudit.run("Trợ lý sản xuất", "Sửa Deadline", "Sửa Deadline LU-027 từ 08/10 → 10/10", "2026-10-05 18:10:00");
  insertAudit.run("Tổ trưởng Hoa", "Cập nhật chuyền 1", "Nhận đơn LU-001 vào chuyền may", "2026-10-01 09:00:00");

  // 7. Seed QC Records
  const insertQc = db.prepare(`
    INSERT INTO qc_records (order_id, color, size, inspected_qty, passed_qty, defect_qty, defect_type, rework_qty, reinspected_qty, repassed_qty, inspector)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertQc.run("LU-003", "Be", "M", 25, 17, 8, "Nhảy mũi chỉ lai váy và lệch ve cổ", 8, 5, 5, "Vũ Thị F");
}

// ----------------- QUERY & MUTATION FUNCTIONS -----------------

export function getAllOrders(filter?: {
  search?: string;
  status?: string;
  line_id?: number;
}): Order[] {
  let sql = "SELECT * FROM orders WHERE 1=1";
  const params: any[] = [];

  if (filter?.search && filter.search.trim() !== "") {
    const term = `%${filter.search.trim()}%`;
    sql += ` AND (
      id LIKE ? OR customer LIKE ? OR product_code LIKE ? OR product_name LIKE ?
      OR id IN (SELECT order_id FROM order_variants WHERE color LIKE ? OR size LIKE ?)
    )`;
    params.push(term, term, term, term, term, term);
  }

  if (filter?.status && filter.status !== "all") {
    if (filter.status === "cho_qc") {
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

  sql += " ORDER BY CASE status WHEN 'delayed' THEN 1 WHEN 'at_risk' THEN 2 WHEN 'on_track' THEN 3 ELSE 4 END, deadline ASC";

  const orders = db.prepare(sql).all(...params) as Order[];

  // Attach variants to each order
  const variantStmt = db.prepare("SELECT * FROM order_variants WHERE order_id = ?");
  for (const o of orders) {
    o.variants = variantStmt.all(o.id) as OrderVariant[];
  }

  return orders;
}

export function getOrderById(id: string): Order | null {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as Order | undefined;
  if (!order) return null;

  order.variants = db.prepare("SELECT * FROM order_variants WHERE order_id = ?").all(id) as OrderVariant[];
  order.stages = db.prepare("SELECT * FROM order_stages WHERE order_id = ? ORDER BY id ASC").all(id) as OrderStage[];

  return order;
}

export function createOrderWithVariants(data: {
  order: Omit<Order, "created_at" | "progress" | "status">;
  variants: Array<{ color: string; size: string; quantity: number }>;
}): Order {
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

  const totalQty = data.variants.reduce((acc, v) => acc + Number(v.quantity || 0), 0);

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
    logAudit("Trợ lý sản xuất", "Tạo đơn hàng mới", `Tạo mã ${data.order.id} - ${data.order.product_name} (SL: ${totalQty})`);
  });

  tx();
  return getOrderById(data.order.id)!;
}

export function updateOrderStage(
  orderId: string,
  newStage: StageKey,
  userName: string = "Quản lý"
) {
  const order = getOrderById(orderId);
  if (!order) return null;

  const stageIndex = LUUTA_STAGES.findIndex((s) => s.key === newStage);
  const totalStages = LUUTA_STAGES.length;
  const progress = Math.min(100, Math.round(((stageIndex + 1) / totalStages) * 100));

  const isCompleted = newStage === "hoan_thanh";

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE orders
      SET current_stage = ?, progress = ?, status = ?
      WHERE id = ?
    `).run(newStage, progress, isCompleted ? "completed" : order.status, orderId);

    db.prepare(`
      UPDATE order_stages
      SET status = 'completed', completed_at = datetime('now', 'localtime')
      WHERE order_id = ? AND id < (SELECT id FROM order_stages WHERE order_id = ? AND stage_key = ?)
    `).run(orderId, orderId, newStage);

    db.prepare(`
      UPDATE order_stages
      SET status = 'in_progress', started_at = datetime('now', 'localtime')
      WHERE order_id = ? AND stage_key = ?
    `).run(orderId, newStage);

    logAudit(userName, "Chuyển công đoạn", `${orderId} chuyển sang: ${LUUTA_STAGES[stageIndex]?.label || newStage}`);
  });

  tx();
  return getOrderById(orderId);
}

export function getLines(): Line[] {
  return db.prepare("SELECT * FROM lines ORDER BY id ASC").all() as Line[];
}

export function getEmployees(lineId?: number): Employee[] {
  if (lineId) {
    return db.prepare("SELECT * FROM employees WHERE line_id = ? ORDER BY name ASC").all(lineId) as Employee[];
  }
  return db.prepare("SELECT * FROM employees ORDER BY name ASC").all() as Employee[];
}

// ----------------- SẢN LƯỢNG & TÍNH LƯƠNG SẢN PHẨM -----------------

export function addProductionLog(data: Omit<ProductionLog, "id" | "created_at" | "is_locked">): ProductionLog {
  // Check if month is locked
  const lock = db.prepare("SELECT * FROM payroll_locks WHERE month = ?").get(data.month);
  if (lock) {
    throw new Error(`Bảng lương tháng ${data.month} đã được CHỐT. Không thể thêm sản lượng mới!`);
  }

  const totalPay = data.quantity * data.unit_price;

  const stmt = db.prepare(`
    INSERT INTO production_logs (log_date, employee_id, employee_name, line_id, order_id, product_name, color, size, stage, quantity, unit_price, total_pay, updated_by, month, is_locked)
    VALUES (@log_date, @employee_id, @employee_name, @line_id, @order_id, @product_name, @color, @size, @stage, @quantity, @unit_price, @total_pay, @updated_by, @month, 0)
  `);

  const res = stmt.run({ ...data, total_pay: totalPay });

  // Update variant stage quantity if applicable
  if (data.stage === "Cắt") {
    db.prepare(`
      UPDATE order_variants
      SET cut_qty = cut_qty + ?
      WHERE order_id = ? AND color = ? AND size = ?
    `).run(data.quantity, data.order_id, data.color, data.size);
  } else if (data.stage === "May") {
    db.prepare(`
      UPDATE order_variants
      SET sewn_qty = sewn_qty + ?
      WHERE order_id = ? AND color = ? AND size = ?
    `).run(data.quantity, data.order_id, data.color, data.size);
  }

  // Log audit
  logAudit(
    data.updated_by,
    "Cập nhật sản lượng",
    `${data.employee_name} • ${data.order_id} - ${data.product_name} • ${data.color}/${data.size} • ${data.stage} • +${data.quantity} sp (${totalPay.toLocaleString()}đ)`
  );

  return db.prepare("SELECT * FROM production_logs WHERE id = ?").get(res.lastInsertRowid) as ProductionLog;
}

export function getProductionLogs(filter?: {
  month?: string;
  employee_id?: string;
  line_id?: number;
  stage?: string;
}): ProductionLog[] {
  let sql = "SELECT * FROM production_logs WHERE 1=1";
  const params: any[] = [];

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
  const params: any[] = [month];

  if (employeeId) {
    sql += " AND employee_id = ?";
    params.push(employeeId);
  }

  sql += " GROUP BY employee_id, employee_name, line_id ORDER BY total_salary DESC";

  const rows = db.prepare(sql).all(...params);
  const isLocked = !!db.prepare("SELECT * FROM payroll_locks WHERE month = ?").get(month);

  return {
    month,
    isLocked,
    summary: rows,
  };
}

export function lockPayroll(month: string, lockedBy: string) {
  const existing = db.prepare("SELECT * FROM payroll_locks WHERE month = ?").get(month);
  if (existing) {
    throw new Error(`Tháng ${month} đã được chốt trước đó!`);
  }

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO payroll_locks (month, locked_by, locked_at)
      VALUES (?, ?, datetime('now', 'localtime'))
    `).run(month, lockedBy);

    db.prepare(`
      UPDATE production_logs
      SET is_locked = 1
      WHERE month = ?
    `).run(month);

    logAudit(lockedBy, "CHỐT LƯƠNG THÁNG", `Đã khóa toàn bộ dữ liệu sản lượng và bảng lương tháng ${month}`);
  });

  tx();
  return { success: true, month };
}

// ----------------- AUDIT & LOGGING -----------------

export function logAudit(userName: string, action: string, details: string) {
  db.prepare(`
    INSERT INTO audit_logs (user_name, action, details)
    VALUES (?, ?, ?)
  `).run(userName, action, details);
}

export function getAuditLogs(limit: number = 50): AuditLog[] {
  return db.prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?").all(limit) as AuditLog[];
}

// ----------------- DASHBOARD METRICS -----------------

export function getDirectorDashboardStats() {
  const orders = db.prepare("SELECT * FROM orders").all() as Order[];
  const logsThisMonth = db.prepare(`
    SELECT
      SUM(quantity) as total_qty,
      SUM(total_pay) as total_pay
    FROM production_logs
    WHERE month = strftime('%Y-%m', 'now', 'localtime')
  `).get() as { total_qty: number; total_pay: number };

  const totalRunning = orders.filter((o) => o.status !== "completed").length;
  const atRisk = orders.filter((o) => o.status === "at_risk").length;
  const delayed = orders.filter((o) => o.status === "delayed").length;
  const completed = orders.filter((o) => o.status === "completed").length;
  const waitingQc = orders.filter((o) => o.current_stage === "may" || o.current_stage === "qc").length;
  const waitingDelivery = orders.filter((o) => o.current_stage === "dong_goi" || o.current_stage === "giao_hang").length;

  const lines = getLines();
  const lineStats = lines.map((l) => {
    const lineOrders = orders.filter((o) => o.line_id === l.id && o.status !== "completed");
    const totalRemainingQty = lineOrders.reduce((sum, o) => sum + Math.round(o.total_quantity * (1 - o.progress / 100)), 0);
    const daysNeeded = l.capacity_per_day > 0 ? Math.ceil(totalRemainingQty / l.capacity_per_day) : 0;

    return {
      ...l,
      activeOrders: lineOrders.length,
      totalRemainingQty,
      daysNeeded,
      isOverloaded: daysNeeded > 10,
    };
  });

  const employeesCount = (db.prepare("SELECT COUNT(*) as count FROM employees").get() as { count: number }).count;

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
  const last = db.prepare("SELECT id FROM orders WHERE id LIKE 'LU-%' ORDER BY id DESC LIMIT 1").get() as { id: string } | undefined;
  if (!last) return "LU-005";
  const num = parseInt(last.id.replace("LU-", ""), 10);
  if (isNaN(num)) return "LU-005";
  return `LU-${String(num + 1).padStart(3, "0")}`;
}
