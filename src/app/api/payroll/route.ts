import { NextResponse } from "next/server";
import { getPayrollSummary, lockPayroll } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") || new Date().toISOString().slice(0, 7);
    const employee_id = searchParams.get("employee_id") || undefined;

    const summary = getPayrollSummary(month, employee_id);

    return NextResponse.json({
      success: true,
      data: summary,
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
    const { month, user_name } = body;

    if (!month) {
      return NextResponse.json(
        { success: false, error: "Vui lòng chỉ định tháng cần chốt" },
        { status: 400 }
      );
    }

    const res = lockPayroll(month, user_name || "Giám đốc");

    return NextResponse.json({
      success: true,
      data: res,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
