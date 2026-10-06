import { NextResponse } from "next/server";
import { addProductionLog, getProductionLogs, getEmployees, getLines } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") || undefined;
    const employee_id = searchParams.get("employee_id") || undefined;
    const line_id = searchParams.get("line_id") ? Number(searchParams.get("line_id")) : undefined;
    const stage = searchParams.get("stage") || undefined;

    const logs = getProductionLogs({ month, employee_id, line_id, stage });
    const employees = getEmployees(line_id);
    const lines = getLines();

    return NextResponse.json({
      success: true,
      data: {
        logs,
        employees,
        lines,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      log_date,
      employee_id,
      employee_name,
      line_id,
      order_id,
      product_name,
      color,
      size,
      stage,
      quantity,
      unit_price,
      updated_by,
      month,
    } = body;

    if (!employee_id || !order_id || !quantity || !unit_price) {
      return NextResponse.json(
        { success: false, error: "Vui lòng nhập đủ thông tin sản lượng và đơn giá" },
        { status: 400 }
      );
    }

    const calculatedMonth = month || log_date.slice(0, 7);

    const newLog = addProductionLog({
      log_date,
      employee_id,
      employee_name,
      line_id: Number(line_id || 1),
      order_id,
      product_name,
      color: color || "Chung",
      size: size || "M",
      stage: stage || "May",
      quantity: Number(quantity),
      unit_price: Number(unit_price),
      total_pay: Number(quantity) * Number(unit_price),
      updated_by: updated_by || "Tổ trưởng",
      month: calculatedMonth,
    });

    return NextResponse.json({
      success: true,
      data: newLog,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
