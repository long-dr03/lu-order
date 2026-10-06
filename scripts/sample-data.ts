import { db } from "../src/lib/db";
import { LUUTA_STAGES } from "../src/lib/types";
// Explicit, idempotent sample seed; never run during application startup.
export async function seedSampleData() {
  const countLines = (await db
    .prepare("SELECT COUNT(*) as count FROM lines")
    .get()) as {
    count: number;
  };

  if (countLines.count === 0) {
    await db.transaction(async () => {
      // 1. Seed 5 Chuyền sản xuất
      const insertLine = db.prepare(`
    INSERT INTO lines (id, name, leader_name, workers_count, capacity_per_day)
    VALUES (?, ?, ?, ?, ?)
  `);

      await insertLine.run(1, "Chuyền 1", "Nguyễn Thị Hoa", 8, 35);
      await insertLine.run(2, "Chuyền 2", "Trần Văn Bình", 10, 45);
      await insertLine.run(3, "Chuyền 3", "Lê Thu Hà", 7, 30);
      await insertLine.run(4, "Chuyền 4", "Phạm Minh Đạt", 9, 40);
      await insertLine.run(5, "Chuyền 5", "Vũ Thị Mai", 8, 35);

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
        await insertEmp.run(...emp);
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
      await insertOrder.run({
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
        {
          color: "Đen",
          size: "XS",
          q: 5,
          cut: 5,
          sew: 4,
          qc: 4,
          pack: 4,
          del: 0,
        },
        {
          color: "Đen",
          size: "S",
          q: 10,
          cut: 10,
          sew: 8,
          qc: 8,
          pack: 6,
          del: 0,
        },
        {
          color: "Đen",
          size: "M",
          q: 20,
          cut: 20,
          sew: 15,
          qc: 13,
          pack: 10,
          del: 10,
        },
        {
          color: "Đen",
          size: "L",
          q: 10,
          cut: 10,
          sew: 8,
          qc: 8,
          pack: 8,
          del: 8,
        },
        {
          color: "Đen",
          size: "XL",
          q: 5,
          cut: 5,
          sew: 3,
          qc: 3,
          pack: 2,
          del: 0,
        },
        // Trắng: XS=3, S=8, M=15, L=8, XL=2 (Tổng 36)
        {
          color: "Trắng",
          size: "XS",
          q: 3,
          cut: 3,
          sew: 3,
          qc: 3,
          pack: 0,
          del: 0,
        },
        {
          color: "Trắng",
          size: "S",
          q: 8,
          cut: 8,
          sew: 6,
          qc: 5,
          pack: 0,
          del: 0,
        },
        {
          color: "Trắng",
          size: "M",
          q: 15,
          cut: 15,
          sew: 12,
          qc: 10,
          pack: 0,
          del: 0,
        },
        {
          color: "Trắng",
          size: "L",
          q: 8,
          cut: 8,
          sew: 6,
          qc: 5,
          pack: 0,
          del: 0,
        },
        {
          color: "Trắng",
          size: "XL",
          q: 2,
          cut: 2,
          sew: 1,
          qc: 1,
          pack: 0,
          del: 0,
        },
        // Đỏ: XS=2, S=5, M=10, L=5, XL=3 (Tổng 25)
        {
          color: "Đỏ",
          size: "XS",
          q: 2,
          cut: 2,
          sew: 1,
          qc: 0,
          pack: 0,
          del: 0,
        },
        {
          color: "Đỏ",
          size: "S",
          q: 5,
          cut: 5,
          sew: 3,
          qc: 2,
          pack: 0,
          del: 0,
        },
        {
          color: "Đỏ",
          size: "M",
          q: 10,
          cut: 10,
          sew: 6,
          qc: 4,
          pack: 0,
          del: 0,
        },
        {
          color: "Đỏ",
          size: "L",
          q: 5,
          cut: 5,
          sew: 3,
          qc: 2,
          pack: 0,
          del: 0,
        },
        {
          color: "Đỏ",
          size: "XL",
          q: 3,
          cut: 3,
          sew: 2,
          qc: 1,
          pack: 0,
          del: 0,
        },
      ];

      for (const item of v001) {
        await insertVariant.run({
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
      await insertOrder.run({
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
        {
          color: "Đen",
          size: "M",
          q: 25,
          cut: 25,
          sew: 10,
          qc: 0,
          pack: 0,
          del: 0,
        },
        {
          color: "Đen",
          size: "L",
          q: 20,
          cut: 20,
          sew: 5,
          qc: 0,
          pack: 0,
          del: 0,
        },
        {
          color: "Kem",
          size: "S",
          q: 15,
          cut: 15,
          sew: 0,
          qc: 0,
          pack: 0,
          del: 0,
        },
        {
          color: "Kem",
          size: "M",
          q: 20,
          cut: 10,
          sew: 0,
          qc: 0,
          pack: 0,
          del: 0,
        },
      ];
      for (const item of v002) {
        await insertVariant.run({
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
      await insertOrder.run({
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
        {
          color: "Be",
          size: "S",
          q: 15,
          cut: 15,
          sew: 15,
          qc: 10,
          pack: 0,
          del: 0,
        },
        {
          color: "Be",
          size: "M",
          q: 25,
          cut: 25,
          sew: 25,
          qc: 18,
          pack: 0,
          del: 0,
        },
        {
          color: "Trắng",
          size: "M",
          q: 10,
          cut: 10,
          sew: 10,
          qc: 6,
          pack: 0,
          del: 0,
        },
      ];
      for (const item of v003) {
        await insertVariant.run({
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
      await insertOrder.run({
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
        {
          color: "Trắng",
          size: "M",
          q: 20,
          cut: 20,
          sew: 20,
          qc: 20,
          pack: 20,
          del: 20,
        },
        {
          color: "Trắng",
          size: "L",
          q: 15,
          cut: 15,
          sew: 15,
          qc: 15,
          pack: 15,
          del: 13,
        }, // thiếu 2 cái L
        {
          color: "Xanh",
          size: "M",
          q: 10,
          cut: 10,
          sew: 10,
          qc: 10,
          pack: 10,
          del: 10,
        },
      ];
      for (const item of v004) {
        await insertVariant.run({
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
          let status: "pending" | "in_progress" | "completed" | "has_issue" =
            "pending";
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

          await insertStage.run({
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
        await insertLog.run(log);
      }

      // 6. Seed Audit Logs
      const insertAudit = db.prepare(`
    INSERT INTO audit_logs (user_name, action, details, created_at)
    VALUES (?, ?, ?, ?)
  `);

      await insertAudit.run(
        "Nguyễn B",
        "Cập nhật sản lượng",
        "LU-001 – Đầm A – May – Đen/M – +6 sản phẩm",
        "2026-10-05 17:32:00",
      );
      await insertAudit.run(
        "Trợ lý sản xuất",
        "Sửa Deadline",
        "Sửa Deadline LU-001 từ 08/10 → 10/10",
        "2026-10-05 18:10:00",
      );
      await insertAudit.run(
        "Tổ trưởng Hoa",
        "Cập nhật chuyền 1",
        "Nhận đơn LU-001 vào chuyền may",
        "2026-10-01 09:00:00",
      );

      // 7. Seed QC Records
      const insertQc = db.prepare(`
    INSERT INTO qc_records (order_id, color, size, inspected_qty, passed_qty, defect_qty, defect_type, rework_qty, reinspected_qty, repassed_qty, inspector)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

      await insertQc.run(
        "LU-003",
        "Be",
        "M",
        25,
        17,
        8,
        "Nhảy mũi chỉ lai váy và lệch ve cổ",
        8,
        5,
        5,
        "Vũ Thị F",
      );
    })();
  }
}
