import { departmentFor, departmentName } from "@/lib/departments";
import { db } from "@/lib/db";
import ExcelJS from "exceljs";
import {
  authenticate,
  failure,
  requirePermission,
  ensure,
  audit,
} from "@/lib/server/auth";
import {
  visibleOrders,
  queryFilters,
  filterOrders,
  logsFor,
  filterLogs,
  payrollFor,
  qcFor,
  type Filters,
} from "@/lib/server/business";
import { permits } from "@/lib/permissions";
import { today } from "@/lib/server/validation";
import type { OrderVariant } from "@/lib/types";
import { initializeDatabase } from "@/lib/server/migrate";

export async function GET(request: Request) {
  try {
    await initializeDatabase();
    const ctx = await authenticate(request);
    requirePermission(ctx, "export.data");
    const f: Filters = queryFilters(request);
    const dataset =
      new URL(request.url).searchParams.get("dataset") || "payroll";
    ensure(
      ["orders", "production", "payroll", "qc", "delivery"].includes(dataset),
      422,
      "Loại báo cáo không hợp lệ.",
    );
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "LUUTA";
    const sheet = (
      name: string,
      headers: string[],
      rows: (string | number)[][],
    ) => {
      const ws = workbook.addWorksheet(name);
      ws.columns = headers.map((header, index) => ({
        header,
        key: String(index),
        width: index === 0 ? 18 : 24,
      }));
      for (const row of rows) ws.addRow(row);
      ws.views = [{ state: "frozen", ySplit: 1 }];
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, ws.rowCount), column: headers.length },
      };
      ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      ws.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF3F3F46" },
      };
      ws.eachRow((row, n) => {
        row.height = n === 1 ? 30 : 24;
        row.eachCell((cell, i) => {
          if (
            !/giờ/i.test(headers[i - 1]) &&
            n > 1 &&
            /ngày|hạn giao/i.test(headers[i - 1]) &&
            typeof cell.value === "string" &&
            /^\d{4}-\d{2}-\d{2}/.test(cell.value)
          ) {
            cell.value = new Date(`${cell.value.slice(0, 10)}T00:00:00Z`);
            cell.numFmt = "dd/mm/yyyy";
          }
          if (n > 1 && typeof cell.value === "number")
            cell.numFmt = /tiền|lương|giá/i.test(headers[i - 1])
              ? '#,##0 "₫"'
              : "#,##0";
        });
      });
      return ws;
    };
    const operationMatchesStage = (action: string) =>
      !f.stage ||
      ({
        qc: "QC",
        reinspect: "QC",
        rework: "Sửa hàng",
        pack: "Đóng gói",
        deliver: "Giao hàng",
      }[action] || action) === f.stage;
    const exportableOrders = async (
      permission: "orders.view" | "qc.view" | "delivery.view",
    ) =>
      filterOrders(
        (await visibleOrders(ctx, permission)).filter((o) =>
          permits(ctx.user, "export.data", { lineId: o.line_id }),
        ),
        f,
      );
    // Keep current progress visible; business history and financial data retain department filtering.
    if (dataset === "orders" || dataset === "delivery" || dataset === "qc") {
      const permission =
        dataset === "qc"
          ? "qc.view"
          : dataset === "delivery"
            ? "delivery.view"
            : "orders.view";
      requirePermission(ctx, permission);
      const orders = await exportableOrders(permission);
      const ids = new Set(orders.map((o) => o.id));
      const inWindow = (date: string) =>
        (!f.from || date.slice(0, 10) >= f.from) &&
        (!f.to || date.slice(0, 10) <= f.to) &&
        (!f.month || date.slice(0, 7) === f.month);
      const accounts = (await db
        .prepare("SELECT id,name FROM accounts")
        .all()) as { id: string; name: string }[];
      const actorName = (id: string) =>
        accounts.find((a) => a.id === id)?.name || "Không có danh tính lịch sử";
      const assignments = (await db
        .prepare(
          "SELECT w.*,e.name worker_name,p.name part_name FROM work_assignments w JOIN employees e ON e.id=w.employee_id LEFT JOIN order_work_items p ON p.id=w.work_item_id ORDER BY w.created_at",
        )
        .all()) as {
        order_id: string;
        stage: string;
        part_name: string;
        worker_name: string;
        employee_id: string;
        department_id: string;
        active: number;
        actor_id: string;
        created_at: string;
      }[];
      sheet(
        "Phân công",
        [
          "Mã đơn",
          "Công đoạn",
          "Phần việc",
          "Thợ",
          "Bộ phận khi phân công",
          "Trạng thái",
          "Người phân công",
          "Thời gian",
        ],
        assignments
          .filter(
            (r) =>
              ids.has(r.order_id) &&
              permits(ctx.user, "export.data", {
                departmentId: r.department_id,
              }) &&
              (!f.department_id || f.department_id === r.department_id) &&
              (!f.employee_id || f.employee_id === r.employee_id) &&
              (!f.stage || f.stage === r.stage) &&
              inWindow(r.created_at),
          )
          .map((r) => [
            r.order_id,
            r.stage,
            r.part_name || "Toàn công đoạn",
            r.worker_name,
            departmentName(r.department_id),
            r.active ? "Đang giao" : "Đã ngừng",
            actorName(r.actor_id),
            r.created_at,
          ]),
      );
      const operations = (await db
        .prepare(
          "SELECT r.*,COALESCE(e.name,a.name) worker_name,a.name actor_name FROM operation_records r LEFT JOIN employees e ON e.id=r.worker_id LEFT JOIN accounts a ON a.id=r.actor_id ORDER BY r.operation_date,r.id",
        )
        .all()) as {
        order_id: string;
        action: string;
        color: string;
        size: string;
        quantity: number;
        passed: number | null;
        operation_date: string;
        operation_time: string;
        department_id: string;
        worker_name: string;
        worker_id: string;
        actor_name: string;
        notes: string;
        reason: string;
      }[];
      sheet(
        "Nhật ký nghiệp vụ",
        [
          "Ngày thực tế",
          "Giờ thực tế",
          "Mã đơn",
          "Bộ phận khi thực hiện",
          "Thao tác",
          "Màu",
          "Size",
          "Số lượng",
          "Số đạt",
          "Thợ / người kiểm",
          "Người ghi nhận",
          "Nguyên nhân",
          "Ghi chú",
        ],
        operations
          .filter(
            (r) =>
              ids.has(r.order_id) &&
              inWindow(r.operation_date) &&
              permits(ctx.user, "export.data", {
                departmentId: r.department_id || departmentFor(r.action),
              }) &&
              (!f.department_id ||
                f.department_id ===
                  (r.department_id || departmentFor(r.action))) &&
              (!f.color || r.color === f.color) &&
              (!f.size || r.size === f.size) &&
              (!f.employee_id || r.worker_id === f.employee_id) &&
              operationMatchesStage(r.action),
          )
          .map((r) => [
            r.operation_date,
            r.operation_time || "Chưa có giờ lịch sử",
            r.order_id,
            departmentName(r.department_id),
            r.action === "shortage" ? "Giải trình thiếu" : r.action,
            r.color,
            r.size,
            r.quantity,
            r.passed ?? "",
            r.worker_name || "",
            r.actor_name || "",
            r.reason || "",
            r.notes || "",
          ]),
      );
      const deliveries = (await db
        .prepare(
          "SELECT s.*,e.name worker_name,a.name actor_name FROM shipments s JOIN employees e ON e.id=s.worker_id JOIN accounts a ON a.id=s.actor_id ORDER BY s.delivered_at",
        )
        .all()) as {
        id: string;
        code: string;
        order_id: string;
        worker_name: string;
        worker_id: string;
        actor_name: string;
        delivered_at: Date;
        packages: number;
        reason: string;
        notes: string;
      }[];
      const items = (await db
        .prepare("SELECT * FROM shipment_items ORDER BY shipment_id,color,size")
        .all()) as {
        shipment_id: string;
        color: string;
        size: string;
        quantity: number;
      }[];
      const eligible = deliveries.filter(
        (r) =>
          ids.has(r.order_id) &&
          permits(ctx.user, "export.data", { departmentId: "delivery" }) &&
          (!f.department_id || f.department_id === "delivery") &&
          (!f.employee_id || r.worker_id === f.employee_id) &&
          (!f.stage || departmentFor(f.stage) === "delivery") &&
          items.some(
            (item) =>
              item.shipment_id === r.id &&
              (!f.color || item.color === f.color) &&
              (!f.size || item.size === f.size),
          ) &&
          inWindow(
            new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Ho_Chi_Minh",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(r.delivered_at),
          ),
      );
      const deliveryTime = (d: Date) =>
        new Intl.DateTimeFormat("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
          dateStyle: "short",
          timeStyle: "medium",
        }).format(d);
      sheet(
        "Đợt giao",
        [
          "Mã đợt",
          "Mã đơn",
          "Ngày giờ giao (Việt Nam)",
          "Người giao",
          "Người ghi nhận",
          "Bộ phận",
          "Số kiện",
          "Nguyên nhân",
          "Ghi chú",
        ],
        eligible.map((r) => [
          r.code,
          r.order_id,
          deliveryTime(r.delivered_at),
          r.worker_name,
          r.actor_name,
          "Giao hàng",
          r.packages,
          r.reason || "",
          r.notes,
        ]),
      );
      sheet(
        "Chi tiết đợt giao",
        ["Mã đợt", "Mã đơn", "Màu", "Size", "Số lượng"],
        items
          .filter(
            (r) =>
              eligible.some((s) => s.id === r.shipment_id) &&
              (!f.color || r.color === f.color) &&
              (!f.size || r.size === f.size),
          )
          .map((r) => {
            const parent = eligible.find((s) => s.id === r.shipment_id)!;
            return [parent.code, parent.order_id, r.color, r.size, r.quantity];
          }),
      );
    }
    if (dataset === "orders" || dataset === "delivery") {
      const permission = dataset === "orders" ? "orders.view" : "delivery.view";
      requirePermission(ctx, permission);
      const orders = await exportableOrders(permission);
      sheet(
        "Đơn hàng",
        [
          "Mã đơn",
          "Khách hàng",
          "Sản phẩm",
          "Bộ phận",
          "Ngày nhận",
          "Hạn giao",
          "Công đoạn",
          "Số lượng",
        ],
        orders.map((o) => [
          o.id,
          o.customer,
          o.product_name,
          departmentName(departmentFor(o.current_stage)),
          o.order_date,
          o.deadline,
          o.current_stage,
          o.total_quantity,
        ]),
      );
      sheet(
        "Màu - Size",
        [
          "Mã đơn",
          "Màu",
          "Size",
          "Yêu cầu",
          "Đã cắt",
          "Đã may",
          "QC đạt",
          "Đóng gói",
          "Đã giao",
          "Còn thiếu",
          "Các màu phối",
        ],
        orders.flatMap((o) =>
          (o.variants || []).map((v: OrderVariant) => [
            o.id,
            v.color,
            v.size,
            v.quantity,
            v.cut_qty,
            v.sewn_qty,
            v.qc_passed_qty,
            v.packed_qty,
            v.delivered_qty,
            v.quantity - v.delivered_qty,
            (v.colors || [])
              .map(
                (c) =>
                  `${c.name} (${c.hex})${c.alpha === undefined ? "" : ` · A ${c.alpha}%`}`,
              )
              .join(" / "),
          ]),
        ),
      );
      const records = (
        (await db
          .prepare(
            "SELECT r.*,COALESCE(e.name,a.name) worker_name FROM operation_records r LEFT JOIN employees e ON e.id=r.worker_id LEFT JOIN accounts a ON a.id=COALESCE(r.represented_id,r.actor_id) ORDER BY r.operation_date,r.id",
          )
          .all()) as {
          order_id: string;
          operation_date: string;
          action: string;
          color: string;
          size: string;
          quantity: number;
          packages: number;
          worker_name: string;
          worker_id: string;
          notes: string;
          reason: string;
          operation_time: string;
          department_id: string;
          actor_id: string;
        }[]
      ).filter(
        (r) =>
          orders.some((o) => o.id === r.order_id) &&
          permits(ctx.user, "export.data", {
            departmentId: r.department_id || departmentFor(r.action),
          }) &&
          (!f.department_id ||
            f.department_id === (r.department_id || departmentFor(r.action))) &&
          (!f.from || r.operation_date >= f.from) &&
          (!f.to || r.operation_date <= f.to) &&
          (!f.color || r.color === f.color) &&
          (!f.size || r.size === f.size) &&
          (!f.month || r.operation_date.slice(0, 7) === f.month) &&
          (!f.employee_id || r.worker_id === f.employee_id) &&
          operationMatchesStage(r.action),
      );
      sheet(
        "Lịch sử đóng và giao",
        [
          "Ngày",
          "Mã đơn",
          "Thao tác",
          "Màu",
          "Size",
          "Số lượng",
          "Số kiện",
          "Người thực hiện",
          "Ghi chú",
          "Giờ thực tế",
          "Bộ phận khi thực hiện",
          "Nguyên nhân",
          "Mã người ghi nhận",
        ],
        records
          .filter((r) => ["pack", "deliver"].includes(r.action))
          .map((r) => [
            r.operation_date,
            r.order_id,
            r.action === "pack" ? "Đóng gói" : "Giao hàng",
            r.color,
            r.size,
            r.quantity,
            r.packages,
            r.worker_name,
            r.notes,
            r.operation_time || "Chưa có giờ lịch sử",
            departmentName(r.department_id),
            r.reason || "",
            r.actor_id || "",
          ]),
      );
    } else if (dataset === "qc") {
      requirePermission(ctx, "qc.view");
      const orders = await exportableOrders("qc.view");
      sheet(
        "QC",
        [
          "Mã đơn",
          "Màu",
          "Size",
          "Số kiểm",
          "Đạt",
          "Lỗi",
          "Mô tả lỗi",
          "Đã sửa",
          "Kiểm lại",
          "Đạt lại",
          "Người kiểm",
        ],
        (await qcFor(ctx))
          .filter(
            (q) =>
              orders.some((o) => o.id === q.order_id) &&
              (!f.from || q.created_at.slice(0, 10) >= f.from) &&
              (!f.to || q.created_at.slice(0, 10) <= f.to) &&
              (!f.color || q.color === f.color) &&
              (!f.size || q.size === f.size),
          )
          .map((q) => [
            q.order_id,
            q.color,
            q.size,
            q.inspected_qty,
            q.passed_qty,
            q.defect_qty,
            q.defect_type || "",
            q.rework_qty,
            q.reinspected_qty,
            q.repassed_qty,
            q.inspector,
          ]),
      );
    } else {
      const permission =
        dataset === "payroll" ? "payroll.view" : "production.view";
      requirePermission(ctx, permission);
      const logs = (
        await filterLogs(await logsFor(ctx, permission), {
          ...f,
          month: f.month || (f.from || f.to ? undefined : today().slice(0, 7)),
        })
      ).filter((l) =>
        permits(ctx.user, "export.data", {
          employeeId: l.employee_id,
          stage: l.stage,
        }),
      );
      sheet(
        "Chi tiết sản lượng",
        [
          "Ngày",
          "Mã NV",
          "Nhân viên",
          "Bộ phận",
          "Mã đơn",
          "Sản phẩm",
          "Màu",
          "Size",
          "Công đoạn",
          "Số lượng",
          "Đơn giá",
          "Thành tiền",
          "Phần việc",
          "SP hoàn thành công đoạn",
          "Nguyên nhân",
          "Mã người ghi nhận",
          "Chuyền lịch sử",
        ],
        logs.map((l) => [
          l.log_date,
          l.employee_id,
          l.employee_name,
          departmentName(l.department_id || departmentFor(l.stage)),
          l.order_id,
          l.product_name,
          l.color,
          l.size,
          l.stage,
          l.quantity,
          permits(ctx.user, "payroll.view", {
            employeeId: l.employee_id,
            stage: l.stage,
          })
            ? l.unit_price
            : "",
          permits(ctx.user, "payroll.view", {
            employeeId: l.employee_id,
            stage: l.stage,
          })
            ? l.total_pay
            : "",
          l.work_item_name || "Toàn công đoạn",
          l.completed_quantity ?? l.quantity,
          l.reason || "",
          l.actor_id || "",
          l.line_id ?? "",
        ]),
      );
      for (const [title, groupBy] of [
        ["Theo đơn", (l: (typeof logs)[number]) => l.order_id],
        [
          "Theo mã hàng",
          (l: (typeof logs)[number]) => l.product_code || l.product_name,
        ],
        ["Theo công đoạn", (l: (typeof logs)[number]) => l.stage],
        ["Theo màu", (l: (typeof logs)[number]) => l.color],
        ["Theo size", (l: (typeof logs)[number]) => l.size],
        ["Theo ngày", (l: (typeof logs)[number]) => l.log_date],
      ] as const) {
        const groups = [...new Set(logs.map(groupBy))];
        sheet(
          title,
          ["Nhóm", "Sản lượng", "Tiền công"],
          groups.map((group) => {
            const rows = logs.filter((l) => groupBy(l) === group);
            return [
              group,
              rows.reduce((n, r) => n + r.quantity, 0),
              rows.every((r) =>
                permits(ctx.user, "payroll.view", {
                  employeeId: r.employee_id,
                  stage: r.stage,
                }),
              )
                ? rows.reduce((n, r) => n + r.total_pay, 0)
                : "",
            ];
          }),
        );
      }
      const permittedIds = new Set(logs.map((l) => l.id));
      const corrections = (
        (await db
          .prepare("SELECT * FROM production_adjustments ORDER BY id")
          .all()) as {
          log_id: number;
          before_json: string;
          after_json: string;
          reason: string;
          created_at: string;
        }[]
      ).filter(
        (r) =>
          permittedIds.has(r.log_id) &&
          logs.some(
            (l) =>
              l.id === r.log_id &&
              permits(ctx.user, "payroll.view", {
                employeeId: l.employee_id,
                stage: l.stage,
              }),
          ),
      );
      sheet(
        "Lịch sử điều chỉnh",
        [
          "Mã dòng",
          "Thời gian",
          "Số cũ",
          "Số mới",
          "Đơn giá cũ",
          "Đơn giá mới",
          "Tiền cũ",
          "Tiền mới",
          "Lý do",
        ],
        corrections.map((r) => {
          const before = JSON.parse(r.before_json),
            after = JSON.parse(r.after_json);
          return [
            r.log_id,
            r.created_at,
            before.quantity,
            after.quantity,
            before.unit_price,
            after.unit_price,
            before.total_pay,
            after.total_pay,
            r.reason,
          ];
        }),
      );
      if (dataset === "payroll") {
        const ids = new Set(logs.map((l) => l.employee_id));
        const p = await payrollFor(ctx, f);
        sheet(
          "Tổng hợp lương",
          [
            "Mã NV",
            "Nhân viên",
            "Bộ phận",
            "Sản lượng",
            "Tiền lương",
            "Trạng thái",
          ],
          p.summary
            .filter((s) => ids.has(s.employee_id))
            .map((s) => [
              s.employee_id,
              s.employee_name,
              departmentName(s.department_id),
              s.total_qty,
              s.total_salary,
              p.isLocked ? "Đã chốt" : "Đang tính",
            ]),
        );
      }
    }
    const buffer = await workbook.xlsx.writeBuffer();
    await audit(
      ctx,
      "Xuất Excel",
      `${dataset}, ${f.month || today().slice(0, 7)}`,
    );
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="LUUTA_${dataset}_${f.month || today().slice(0, 7)}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
