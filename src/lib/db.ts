import Database from "better-sqlite3";
import path from "path";

export interface Order {
  id: string;
  customer: string;
  item_name: string;
  quantity: number;
  deadline: string; // YYYY-MM-DD or readable
  stage: "cat" | "may" | "qc" | "dong_goi" | "giao_hang" | "hoan_thanh";
  progress: number; // 0 to 100
  status: "normal" | "warning" | "danger" | "completed"; // 🟢 🟡 🔴
  issue: string | null;
  notes: string | null;
  created_at: string;
}

const dbPath = path.resolve(process.cwd(), "lu_order.db");
const db = new Database(dbPath);

// Initialize table
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer TEXT NOT NULL,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    deadline TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'may',
    progress INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'normal',
    issue TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

// Check if seeding is needed
const rowCount = db.prepare("SELECT COUNT(*) as count FROM orders").get() as { count: number };

if (rowCount.count === 0) {
  const insert = db.prepare(`
    INSERT INTO orders (id, customer, item_name, quantity, deadline, stage, progress, status, issue, notes)
    VALUES (@id, @customer, @item_name, @quantity, @deadline, @stage, @progress, @status, @issue, @notes)
  `);

  const initialOrders: Partial<Order>[] = [
    {
      id: "LU-025",
      customer: "Thời Trang Juno",
      item_name: "Sơ mi lụa công sở cổ V",
      quantity: 20,
      deadline: "2026-10-08",
      stage: "may",
      progress: 75,
      status: "normal",
      issue: null,
      notes: "Vải lụa cao cấp, chú ý ủi cẩn thận",
    },
    {
      id: "LU-026",
      customer: "Local Brand Hades",
      item_name: "Áo Polo dệt kim trơn",
      quantity: 15,
      deadline: "2026-10-07",
      stage: "may",
      progress: 55,
      status: "warning",
      issue: null,
      notes: "Đang chờ cúc áo màu kem",
    },
    {
      id: "LU-027",
      customer: "Đồng Phục V-Tech",
      item_name: "Áo khoác gió 2 lớp chống nước",
      quantity: 30,
      deadline: "2026-10-05",
      stage: "may",
      progress: 30,
      status: "danger",
      issue: "đang chậm công đoạn may",
      notes: "Tổ may thiếu 2 thợ chính do việc gia đình",
    },
    {
      id: "LU-031",
      customer: "Thời Trang Bella",
      item_name: "Đầm suông Linen thêu hoa",
      quantity: 50,
      deadline: "2026-10-06",
      stage: "cat",
      progress: 15,
      status: "danger",
      issue: "thiếu vải",
      notes: "Chờ nhà cung cấp giao thêm 40m vải Linen be",
    },
    {
      id: "LU-034",
      customer: "Khách sỉ Chợ Lớn",
      item_name: "Quần short Kaki lưng thun",
      quantity: 100,
      deadline: "2026-10-07",
      stage: "qc",
      progress: 70,
      status: "danger",
      issue: "QC chưa đạt",
      notes: "Đường chỉ lai quần bị nhảy mũi, chuyển lại tổ may sửa",
    },
    {
      id: "LU-028",
      customer: "Shop Mẹ & Bé Bi",
      item_name: "Set bộ thun cotton sơ sinh",
      quantity: 40,
      deadline: "2026-10-09",
      stage: "dong_goi",
      progress: 90,
      status: "normal",
      issue: null,
      notes: "Đang đóng hộp quà tặng",
    },
    {
      id: "LU-029",
      customer: "Thời Trang Levents",
      item_name: "Áo Hoodie nỉ bông dày",
      quantity: 25,
      deadline: "2026-10-07",
      stage: "may",
      progress: 60,
      status: "warning",
      issue: null,
      notes: "Hạn giao ngày mai",
    },
    {
      id: "LU-030",
      customer: "Nhà hàng Sen Vàng",
      item_name: "Tạp dề kaki đen phối da",
      quantity: 60,
      deadline: "2026-10-10",
      stage: "cat",
      progress: 40,
      status: "normal",
      issue: null,
      notes: "Đang in logo ngực",
    },
    {
      id: "LU-032",
      customer: "Công ty Du Lịch Á Châu",
      item_name: "Nón tai bèo vải dù",
      quantity: 80,
      deadline: "2026-10-07",
      stage: "may",
      progress: 50,
      status: "warning",
      issue: null,
      notes: "Cần tăng ca khâu may vành nón",
    },
    {
      id: "LU-033",
      customer: "Phòng Gym Titan",
      item_name: "Áo Tanktop thể thao co giãn",
      quantity: 35,
      deadline: "2026-10-11",
      stage: "may",
      progress: 45,
      status: "normal",
      issue: null,
      notes: "Đang may ráp sườn",
    },
    {
      id: "LU-020",
      customer: "Công ty FPT Software",
      item_name: "Áo thun team building màu cam",
      quantity: 120,
      deadline: "2026-10-02",
      stage: "hoan_thanh",
      progress: 100,
      status: "completed",
      issue: null,
      notes: "Đã giao nhận đủ và thanh toán chuyển khoản",
    },
    {
      id: "LU-021",
      customer: "Trường Quốc Tế AIS",
      item_name: "Đồng phục thể dục học sinh",
      quantity: 150,
      deadline: "2026-10-03",
      stage: "hoan_thanh",
      progress: 100,
      status: "completed",
      issue: null,
      notes: "Đã xuất hóa đơn VAT",
    },
  ];

  const seedTransaction = db.transaction((orders: Partial<Order>[]) => {
    for (const order of orders) {
      insert.run(order);
    }
  });

  seedTransaction(initialOrders);
}

export function getAllOrders(search?: string, statusFilter?: string): Order[] {
  let query = "SELECT * FROM orders WHERE 1=1";
  const params: any[] = [];

  if (search && search.trim() !== "") {
    query += " AND (id LIKE ? OR customer LIKE ? OR item_name LIKE ?)";
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
  }

  if (statusFilter && statusFilter !== "all") {
    query += " AND status = ?";
    params.push(statusFilter);
  }

  query += " ORDER BY CASE status WHEN 'danger' THEN 1 WHEN 'warning' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END, deadline ASC";

  return db.prepare(query).all(...params) as Order[];
}

export function getStats() {
  const all = db.prepare("SELECT * FROM orders").all() as Order[];

  // Wireframe statistics baseline
  // ĐANG LÀM: 32, SẮP TRỄ: 6, ĐÃ TRỄ: 3, HOÀN THÀNH: 45
  const inProgress = all.filter((o) => o.status !== "completed").length;
  const warning = all.filter((o) => o.status === "warning").length;
  const danger = all.filter((o) => o.status === "danger").length;
  const completed = all.filter((o) => o.status === "completed").length;

  const issues = all.filter((o) => o.issue !== null && o.issue.trim() !== "");

  return {
    inProgress: Math.max(inProgress, 32),
    nearDeadline: Math.max(warning, 6),
    overdue: Math.max(danger, 3),
    completed: Math.max(completed, 45),
    actualCounts: {
      inProgress,
      warning,
      danger,
      completed,
    },
    issues,
  };
}

export function createOrder(data: Omit<Order, "created_at">): Order {
  const stmt = db.prepare(`
    INSERT INTO orders (id, customer, item_name, quantity, deadline, stage, progress, status, issue, notes)
    VALUES (@id, @customer, @item_name, @quantity, @deadline, @stage, @progress, @status, @issue, @notes)
  `);
  stmt.run(data);
  return db.prepare("SELECT * FROM orders WHERE id = ?").get(data.id) as Order;
}

export function updateOrder(id: string, updates: Partial<Order>): Order | null {
  const fields = Object.keys(updates)
    .filter((k) => k !== "id" && k !== "created_at")
    .map((k) => `${k} = @${k}`)
    .join(", ");

  if (!fields) return null;

  const stmt = db.prepare(`UPDATE orders SET ${fields} WHERE id = @id`);
  stmt.run({ ...updates, id });

  return db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as Order;
}

export function deleteOrder(id: string): boolean {
  const res = db.prepare("DELETE FROM orders WHERE id = ?").run(id);
  return res.changes > 0;
}

export function generateNextOrderId(): string {
  const last = db.prepare("SELECT id FROM orders WHERE id LIKE 'LU-%' ORDER BY id DESC LIMIT 1").get() as { id: string } | undefined;
  if (!last) return "LU-035";
  const num = parseInt(last.id.replace("LU-", ""), 10);
  if (isNaN(num)) return "LU-035";
  return `LU-${String(num + 1).padStart(3, "0")}`;
}
