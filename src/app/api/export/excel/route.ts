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

export async function GET(request: Request) {
  try {
    const ctx = authenticate(request);
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
    const exportableOrders = (
      permission: "orders.view" | "qc.view" | "delivery.view",
    ) =>
      filterOrders(
        visibleOrders(ctx, permission).filter((o) =>
          permits(ctx.user, "export.data", { lineId: o.line_id }),
        ),
        f,
      );
    if (dataset === "orders" || dataset === "delivery") {
      const permission = dataset === "orders" ? "orders.view" : "delivery.view";
      requirePermission(ctx, permission);
      const orders = exportableOrders(permission);
      sheet(
        "Đơn hàng",
        [
          "Mã đơn",
          "Khách hàng",
          "Sản phẩm",
          "Chuyền",
          "Ngày nhận",
          "Hạn giao",
          "Công đoạn",
          "Số lượng",
        ],
        orders.map((o) => [
          o.id,
          o.customer,
          o.product_name,
          o.line_id,
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
        db
          .prepare(
            "SELECT r.*,COALESCE(e.name,a.name) worker_name FROM operation_records r LEFT JOIN employees e ON e.id=r.worker_id LEFT JOIN accounts a ON a.id=COALESCE(r.represented_id,r.actor_id) ORDER BY r.operation_date,r.id",
          )
          .all() as {
          order_id: string;
          operation_date: string;
          action: string;
          color: string;
          size: string;
          quantity: number;
          packages: number;
          worker_name: string;
          notes: string;
        }[]
      ).filter(
        (r) =>
          orders.some((o) => o.id === r.order_id) &&
          (!f.from || r.operation_date >= f.from) &&
          (!f.to || r.operation_date <= f.to) &&
          (!f.color || r.color === f.color) &&
          (!f.size || r.size === f.size),
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
          ]),
      );
    } else if (dataset === "qc") {
      requirePermission(ctx, "qc.view");
      const orders = exportableOrders("qc.view");
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
        qcFor(ctx)
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
      const logs = filterLogs(logsFor(ctx, permission), {
        ...f,
        month: f.month || (f.from || f.to ? undefined : today().slice(0, 7)),
      }).filter((l) =>
        permits(ctx.user, "export.data", {
          employeeId: l.employee_id,
          lineId: l.line_id,
        }),
      );
      sheet(
        "Chi tiết sản lượng",
        [
          "Ngày",
          "Mã NV",
          "Nhân viên",
          "Chuyền",
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
        ],
        logs.map((l) => [
          l.log_date,
          l.employee_id,
          l.employee_name,
          l.line_id,
          l.order_id,
          l.product_name,
          l.color,
          l.size,
          l.stage,
          l.quantity,
          permits(ctx.user, "payroll.view", {
            employeeId: l.employee_id,
            lineId: l.line_id,
          })
            ? l.unit_price
            : "",
          permits(ctx.user, "payroll.view", {
            employeeId: l.employee_id,
            lineId: l.line_id,
          })
            ? l.total_pay
            : "",
          l.work_item_name || "Toàn công đoạn",
          l.completed_quantity ?? l.quantity,
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
                  lineId: r.line_id,
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
        db
          .prepare("SELECT * FROM production_adjustments ORDER BY id")
          .all() as {
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
                lineId: l.line_id,
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
        const p = payrollFor(ctx, f);
        sheet(
          "Tổng hợp lương",
          [
            "Mã NV",
            "Nhân viên",
            "Chuyền",
            "Sản lượng",
            "Tiền lương",
            "Trạng thái",
          ],
          p.summary
            .filter((s) => ids.has(s.employee_id))
            .map((s) => [
              s.employee_id,
              s.employee_name,
              s.line_id,
              s.total_qty,
              s.total_salary,
              p.isLocked ? "Đã chốt" : "Đang tính",
            ]),
        );
      }
    }
    const buffer = await workbook.xlsx.writeBuffer();
    audit(ctx, "Xuất Excel", `${dataset}, ${f.month || today().slice(0, 7)}`);
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
