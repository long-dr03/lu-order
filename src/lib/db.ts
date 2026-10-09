import { assessOrders } from "./progress";
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
  OrderPhoto,
  PreparationCheck,
  PatternSheet,
} from "./types";

export * from "./types";

export { db } from "./server/database";
import { db } from "./server/database";

// ----------------- QUERY & MUTATION FUNCTIONS -----------------

export async function getAllOrders(filter?: {
  search?: string;
  status?: string;
  line_id?: number;
}): Promise<Order[]> {
  let sql = "SELECT * FROM orders WHERE 1=1";
  const params: (string | number)[] = [];

  if (filter?.search && filter.search.trim() !== "") {
    const term = `%${filter.search.trim()}%`;
    sql += ` AND (
      id ILIKE ? OR customer ILIKE ? OR product_code ILIKE ? OR product_name ILIKE ?
      OR id IN (SELECT order_id FROM order_variants WHERE color ILIKE ? OR size ILIKE ?)
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

  const orders = (await db.prepare(sql).all(...params)) as Order[];

  const ids = orders.map((o) => o.id);
  const variants = (await db
    .prepare(
      "SELECT * FROM order_variants WHERE order_id=ANY(?::text[]) ORDER BY id",
    )
    .all(ids)) as OrderVariant[];
  const workItems = (await db
    .prepare(
      "SELECT w.id,w.order_id,w.stage,w.name,COALESCE(SUM(p.quantity),0) recorded_quantity FROM order_work_items w LEFT JOIN production_logs p ON p.work_item_id=w.id WHERE w.order_id=ANY(?::text[]) GROUP BY w.id ORDER BY w.id",
    )
    .all(ids)) as WorkItem[];
  const photos = (await db
    .prepare(
      "SELECT id,order_id,image_url,color,position FROM order_photos WHERE order_id=ANY(?::text[]) ORDER BY position,id",
    )
    .all(ids)) as (OrderPhoto & { order_id: string })[];
  const byId = new Map(orders.map((o) => [o.id, o]));
  for (const order of orders) {
    order.variants = [];
    order.work_items = [];
    order.photos = [];
  }
  for (const variant of variants)
    byId.get(variant.order_id)?.variants?.push(decodeColors(variant));
  for (const item of workItems) byId.get(item.order_id)?.work_items?.push(item);
  for (const { order_id, ...photo } of photos)
    byId.get(order_id)?.photos?.push(photo);

  return assessOrders(orders, await getLines(), await throughput());
}

/** Rebuilds the POM chart (rows × sizes) from the flat spec rows. Null when nothing is declared. */
export async function patternSheetFor(
  orderId: string,
): Promise<PatternSheet | null> {
  const sheet = (await db
    .prepare("SELECT unit,sizes,base_size FROM pattern_sheets WHERE order_id=?")
    .get(orderId)) as
    | { unit: PatternSheet["unit"]; sizes: string; base_size: string }
    | undefined;
  const rows = (await db
    .prepare(
      "SELECT code,point,size,spec,tolerance FROM pattern_specs WHERE order_id=? ORDER BY position,id",
    )
    .all(orderId)) as {
    code: string;
    point: string;
    size: string;
    spec: number;
    tolerance: number;
  }[];
  if (!sheet && !rows.length) return null;
  const poms: PatternSheet["poms"] = [];
  for (const row of rows) {
    let pom = poms.find((p) => p.point === row.point);
    if (!pom) {
      pom = {
        code: row.code,
        point: row.point,
        tolerance: Number(row.tolerance),
        values: {},
      };
      poms.push(pom);
    }
    pom.values[row.size] = Number(row.spec);
  }
  const sizes: string[] = sheet
    ? JSON.parse(sheet.sizes || "[]")
    : [...new Set(rows.map((r) => r.size))];
  return {
    // Sheets declared before migration 18 were in centimetres.
    unit: sheet?.unit || "cm",
    sizes,
    base_size: sheet?.base_size || "",
    poms,
  };
}
export async function getOrderById(id: string): Promise<Order | null> {
  const order = (await db
    .prepare("SELECT * FROM orders WHERE id = ?")
    .get(id)) as Order | undefined;
  if (!order) return null;

  order.variants = (await db
    .prepare("SELECT * FROM order_variants WHERE order_id = ?")
    .all(id)) as OrderVariant[];
  order.variants = order.variants.map(decodeColors);
  order.stages = (await db
    .prepare("SELECT * FROM order_stages WHERE order_id = ? ORDER BY id ASC")
    .all(id)) as OrderStage[];

  const counts: Record<string, [string, string]> = {
    cat: ["quantity", "cut_qty"],
    may: ["cut_qty", "sewn_qty"],
    qc: ["sewn_qty", "qc_inspected_qty"],
    sua_hang: ["defect_qty", "reworked_qty"],
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
        ? sum("defect_qty") + sum("reinspected_qty") - sum("repassed_qty")
        : sum(columns[0]);
    stage.completed_qty = sum(columns[1]);
    stage.remaining_qty = Math.max(0, stage.received_qty - stage.completed_qty);
  }

  const checks = (await db
    .prepare(
      "SELECT c.*,e.name checked_by_name,a.name approved_by_name FROM preparation_checks c LEFT JOIN employees e ON e.id=c.checked_by LEFT JOIN employees a ON a.id=c.approved_by WHERE c.order_id=? ORDER BY c.id",
    )
    .all(id)) as PreparationCheck[];
  for (const check of checks) {
    check.measurements = JSON.parse(
      (check.measurements as unknown as string) || "[]",
    );
    check.photos = JSON.parse((check.photos as unknown as string) || "[]");
    check.files = JSON.parse((check.files as unknown as string) || "[]");
  }
  const pattern_sheet = await patternSheetFor(id);
  const all = await getAllOrders();
  const assessed = all.find((o) => o.id === id);
  return {
    ...order,
    ...assessed,
    stages: order.stages,
    checks,
    pattern_sheet,
  };
}

export async function createOrderWithVariants(
  data: {
    order: Omit<Order, "created_at" | "progress" | "status" | "version">;
    variants: Array<{ color: string; size: string; quantity: number }>;
    photos?: Array<{ image_url: string; color: string }>;
  },
  actor = "Hệ thống",
): Promise<Order> {
  const insertOrder = db.prepare(`
    INSERT INTO orders (id, customer, product_code, product_name, image_url, total_quantity, line_id, order_date, deadline, priority, assigned_to, current_stage, progress, status, notes, reason)
    VALUES (@id, @customer, @product_code, @product_name, @image_url, @total_quantity, @line_id, @order_date, @deadline, @priority, @assigned_to, @current_stage, 0, 'on_track', @notes, @reason)
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

  const tx = db.transaction(async () => {
    await insertOrder.run({
      ...data.order,
      reason: data.order.reason || null,
      total_quantity: totalQty,
    });

    for (const v of data.variants) {
      if (v.quantity > 0) {
        await insertVariant.run({
          order_id: data.order.id,
          color: v.color,
          size: v.size,
          quantity: Number(v.quantity),
        });
      }
    }

    for (const [position, photo] of (data.photos || []).entries()) {
      await db
        .prepare(
          "INSERT INTO order_photos(order_id,image_url,color,position) VALUES (?,?,?,?)",
        )
        .run(data.order.id, photo.image_url, photo.color, position);
    }

    // Initialize all 11 stages
    for (let i = 0; i < LUUTA_STAGES.length; i++) {
      const s = LUUTA_STAGES[i];
      await insertStage.run({
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
    await logAudit(
      actor,
      "Tạo đơn hàng mới",
      `Tạo mã ${data.order.id} - ${data.order.product_name} (SL: ${totalQty})`,
    );
  });

  await tx();
  return (await getOrderById(data.order.id))!;
}

export async function updateOrderStage(
  orderId: string,
  newStage: StageKey,
  userName: string = "Quản lý",
) {
  const order = await getOrderById(orderId);
  if (!order) return null;

  const stageIndex = LUUTA_STAGES.findIndex((s) => s.key === newStage);
  const totalStages = LUUTA_STAGES.length;
  const progress = Math.min(
    100,
    Math.round(((stageIndex + 1) / totalStages) * 100),
  );

  const isCompleted = newStage === "hoan_thanh";

  const tx = db.transaction(async () => {
    await db
      .prepare(
        `
      UPDATE orders
      SET current_stage = ?, progress = ?, status = ?
      WHERE id = ?
    `,
      )
      .run(
        newStage,
        progress,
        isCompleted ? "completed" : order.status,
        orderId,
      );

    await db
      .prepare(
        `
      UPDATE order_stages
      SET status = 'completed', completed_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS')
      WHERE order_id = ? AND id < (SELECT id FROM order_stages WHERE order_id = ? AND stage_key = ?)
    `,
      )
      .run(orderId, orderId, newStage);

    await db
      .prepare(
        `
      UPDATE order_stages
      SET status = 'in_progress', started_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS')
      WHERE order_id = ? AND stage_key = ?
    `,
      )
      .run(orderId, newStage);

    await logAudit(
      userName,
      "Chuyển công đoạn",
      `${orderId} chuyển sang: ${LUUTA_STAGES[stageIndex]?.label || newStage}`,
    );
  });

  await tx();
  return await getOrderById(orderId);
}

export async function getLines(): Promise<Line[]> {
  return (await db
    .prepare("SELECT * FROM lines ORDER BY id ASC")
    .all()) as Line[];
}

export async function getEmployees(lineId?: number): Promise<Employee[]> {
  const employees = (await db
    .prepare("SELECT * FROM employees ORDER BY name ASC")
    .all()) as Employee[];
  const memberships = (await db
    .prepare("SELECT employee_id,department_id FROM employee_departments")
    .all()) as {
    employee_id: string;
    department_id: import("./departments").DepartmentId;
  }[];
  const linked = (await db
    .prepare("SELECT employee_id FROM accounts WHERE employee_id IS NOT NULL")
    .all()) as { employee_id: string }[];
  return employees
    .map((e) => ({
      ...e,
      assigned_line_ids: [],
      department_ids: memberships
        .filter((d) => d.employee_id === e.id)
        .map((d) => d.department_id),
      has_account: linked.some((a) => a.employee_id === e.id),
    }))
    .filter((e) => !lineId || e.line_id === lineId);
}

// ----------------- SẢN LƯỢNG & TÍNH LƯƠNG SẢN PHẨM -----------------

export async function addProductionLog(
  data: Omit<ProductionLog, "id" | "created_at" | "is_locked">,
): Promise<ProductionLog> {
  // Check if month is locked
  const lock = await db
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

  const res = await stmt.run({ ...data, total_pay: totalPay });

  // Update variant stage quantity if applicable
  if (data.stage === "Cắt") {
    await db
      .prepare(
        `
      UPDATE order_variants
      SET cut_qty = cut_qty + ?
      WHERE order_id = ? AND color = ? AND size = ?
    `,
      )
      .run(data.quantity, data.order_id, data.color, data.size);
  } else if (data.stage === "May") {
    await db
      .prepare(
        `
      UPDATE order_variants
      SET sewn_qty = sewn_qty + ?
      WHERE order_id = ? AND color = ? AND size = ?
    `,
      )
      .run(data.quantity, data.order_id, data.color, data.size);
  }

  // Log audit
  await logAudit(
    data.updated_by,
    "Cập nhật sản lượng",
    `${data.employee_name} • ${data.order_id} - ${data.product_name} • ${data.color}/${data.size} • ${data.stage} • +${data.quantity} sp (${totalPay.toLocaleString()}đ)`,
  );

  return (await db
    .prepare("SELECT * FROM production_logs WHERE id = ?")
    .get(res.lastInsertRowid)) as ProductionLog;
}

export async function getProductionLogs(filter?: {
  month?: string;
  employee_id?: string;
  line_id?: number;
  stage?: string;
}): Promise<ProductionLog[]> {
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
  return (await db.prepare(sql).all(...params)) as ProductionLog[];
}

export async function getPayrollSummary(month: string, employeeId?: string) {
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

  const rows = await db.prepare(sql).all(...params);
  const isLocked = !!(await db
    .prepare("SELECT * FROM payroll_locks WHERE month = ?")
    .get(month));

  return {
    month,
    isLocked,
    summary: rows,
  };
}

export async function lockPayroll(month: string, lockedBy: string) {
  const existing = await db
    .prepare("SELECT * FROM payroll_locks WHERE month = ?")
    .get(month);
  if (existing) {
    throw new Error(`Tháng ${month} đã được chốt trước đó!`);
  }

  const tx = db.transaction(async () => {
    await db
      .prepare(
        `
      INSERT INTO payroll_locks (month, locked_by, locked_at)
      VALUES (?, ?, to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS'))
    `,
      )
      .run(month, lockedBy);

    await db
      .prepare(
        `
      UPDATE production_logs
      SET is_locked = 1
      WHERE month = ?
    `,
      )
      .run(month);

    await logAudit(
      lockedBy,
      "CHỐT LƯƠNG THÁNG",
      `Đã khóa toàn bộ dữ liệu sản lượng và bảng lương tháng ${month}`,
    );
  });

  await tx();
  return { success: true, month };
}

// ----------------- AUDIT & LOGGING -----------------

export async function logAudit(
  userName: string,
  action: string,
  details: string,
) {
  await db
    .prepare(
      `
    INSERT INTO audit_logs (user_name, action, details)
    VALUES (?, ?, ?)
  `,
    )
    .run(userName, action, details);
}

export async function getAuditLogs(limit: number = 50): Promise<AuditLog[]> {
  return (await db
    .prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?")
    .all(limit)) as AuditLog[];
}

// ----------------- DASHBOARD METRICS -----------------

export async function getDirectorDashboardStats() {
  const orders = (await db.prepare("SELECT * FROM orders").all()) as Order[];
  const logsThisMonth = (await db
    .prepare(
      `
    SELECT
      SUM(quantity) as total_qty,
      SUM(total_pay) as total_pay
    FROM production_logs
    WHERE month = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM')
  `,
    )
    .get()) as { total_qty: number; total_pay: number };

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

  const lines = await getLines();
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
    (await db.prepare("SELECT COUNT(*) as count FROM employees").get()) as {
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

export async function generateNextOrderCode(): Promise<string> {
  const ids = (await db.prepare("SELECT id FROM orders").all()) as {
    id: string;
  }[];
  const largest = ids.reduce(
    (n, row) =>
      /^LU-\d+$/.test(row.id) ? Math.max(n, Number(row.id.slice(3))) : n,
    0,
  );
  return `LU-${String(largest + 1).padStart(3, "0")}`;
}

export async function throughput() {
  return (await db
    .prepare(
      "SELECT line_id,SUM(COALESCE(completed_quantity,quantity))*1.0/14 daily FROM production_logs WHERE stage='May' AND log_date BETWEEN to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '13 days','YYYY-MM-DD') AND to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD') GROUP BY line_id",
    )
    .all()) as { line_id: number; daily: number }[];
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
