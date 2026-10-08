import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { DEPARTMENTS } from "../src/lib/departments";
import { LUUTA_STAGES } from "../src/lib/types";
// Explicit seed for an empty database only. No classification of existing people.
export async function seedSampleData() {
  return db.transaction(async () => {
    if (
      await db
        .prepare(
          "SELECT 1 FROM orders UNION ALL SELECT 1 FROM employees LIMIT 1",
        )
        .get()
    )
      return false;
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const deadline = new Date(Date.now() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    for (const d of DEPARTMENTS) {
      await db
        .prepare("INSERT INTO departments VALUES (?,?) ON CONFLICT DO NOTHING")
        .run(d.id, d.name);
      for (let i = 1; i <= 2; i++) {
        const id = `NV-DEMO-${d.id.toUpperCase()}-${i}`;
        await db
          .prepare(
            "INSERT INTO employees(id,name,line_id,role,active) VALUES (?,?,NULL,?,1)",
          )
          .run(id, `Thợ mẫu ${d.name} ${i}`, d.name);
        await db
          .prepare("INSERT INTO employee_departments VALUES (?,?)")
          .run(id, d.id);
      }
    }
    for (const [index, product] of ["Áo sơ mi mẫu", "Quần âu mẫu"].entries()) {
      const id = `DEMO-${index + 1}`;
      await db
        .prepare(
          "INSERT INTO orders(id,customer,product_code,product_name,total_quantity,line_id,order_date,deadline,assigned_to,current_stage) VALUES (?,?,?,?,100,NULL,?,?,?,'cat')",
        )
        .run(
          id,
          "Khách hàng mẫu",
          `SP-DEMO-${index + 1}`,
          product,
          date,
          deadline,
          "Bộ phận Quản lý",
        );
      for (const [color, size, quantity] of [
        ["Trắng", "M", 50],
        ["Đen", "L", 50],
      ])
        await db
          .prepare(
            "INSERT INTO order_variants(order_id,color,size,quantity) VALUES (?,?,?,?)",
          )
          .run(id, color, size, quantity);
      for (const s of LUUTA_STAGES)
        await db
          .prepare(
            "INSERT INTO order_stages(order_id,stage_key,stage_name,status,assignee,received_qty,completed_qty,remaining_qty) VALUES (?,?,?,?,?,100,?,?)",
          )
          .run(
            id,
            s.key,
            s.label,
            s.key === "cat"
              ? "in_progress"
              : ["nhan_don", "kiem_npl", "kiem_rap"].includes(s.key)
                ? "completed"
                : "pending",
            "",
            ["nhan_don", "kiem_npl", "kiem_rap"].includes(s.key) ? 100 : 0,
            ["nhan_don", "kiem_npl", "kiem_rap"].includes(s.key) ? 0 : 100,
          );
      for (const s of ["Cắt", "May", "QC", "Sửa hàng", "Đóng gói"])
        await db
          .prepare("INSERT INTO order_rates VALUES (?,?,?)")
          .run(id, s, s === "May" ? 15000 : 5000);
      const admin = (await db
        .prepare(
          "SELECT a.id FROM accounts a JOIN account_roles r ON r.account_id=a.id WHERE r.role_id='admin' AND a.status='active' LIMIT 1",
        )
        .get()) as { id: string } | undefined;
      if (admin)
        for (const d of DEPARTMENTS.filter(
          (d) => d.id !== "management" && d.id !== "quality",
        ))
          for (const i of [1, 2])
            await db
              .prepare(
                "INSERT INTO work_assignments(id,order_id,stage,employee_id,department_id,actor_id) VALUES (?,?,?,?,?,?)",
              )
              .run(
                randomUUID(),
                id,
                d.name,
                `NV-DEMO-${d.id.toUpperCase()}-${i}`,
                d.id,
                admin.id,
              );
    }
    return true;
  })();
}
