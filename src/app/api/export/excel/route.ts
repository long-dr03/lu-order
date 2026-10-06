import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getProductionLogs, getPayrollSummary } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") || new Date().toISOString().slice(0, 7);
    const employee_id = searchParams.get("employee_id") || undefined;

    const logs = getProductionLogs({ month, employee_id });
    const payroll = getPayrollSummary(month, employee_id);

    // Sheet 1: Chi tiết sản lượng
    const detailsData = logs.map((l, idx) => ({
      "STT": idx + 1,
      "Ngày": l.log_date,
      "Mã NV": l.employee_id,
      "Tên nhân viên": l.employee_name,
      "Chuyền": `Chuyền ${l.line_id}`,
      "Mã đơn": l.order_id,
      "Sản phẩm": l.product_name,
      "Màu": l.color,
      "Size": l.size,
      "Công đoạn": l.stage,
      "Số lượng (cái)": l.quantity,
      "Đơn giá (đ)": l.unit_price,
      "Thành tiền (đ)": l.total_pay,
      "Người duyệt": l.updated_by,
    }));

    // Sheet 2: Tổng hợp lương tháng
    const summaryData = payroll.summary.map((s: any, idx: number) => ({
      "STT": idx + 1,
      "Mã NV": s.employee_id,
      "Tên nhân viên": s.employee_name,
      "Chuyền": `Chuyền ${s.line_id}`,
      "Tổng sản lượng (cái)": s.total_qty,
      "Tổng tiền lương (đ)": s.total_salary,
      "Số lần nhập": s.total_entries,
      "Trạng thái": payroll.isLocked ? "ĐÃ CHỐT LƯƠNG" : "Đang tính",
    }));

    const workbook = XLSX.utils.book_new();
    const wsDetails = XLSX.utils.json_to_sheet(detailsData);
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);

    XLSX.utils.book_append_sheet(workbook, wsSummary, "Tong_Hop_Luong");
    XLSX.utils.book_append_sheet(workbook, wsDetails, "Chi_Tiet_San_Luong");

    const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new Response(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Bang_Luong_LUUTA_${month}.xlsx"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
