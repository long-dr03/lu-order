import { NextResponse } from "next/server";
import {
  getAllOrders,
  getDirectorDashboardStats,
  createOrderWithVariants,
  generateNextOrderCode,
  getLines,
} from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;
    const line_id = searchParams.get("line_id") ? Number(searchParams.get("line_id")) : undefined;

    const orders = getAllOrders({ search, status, line_id });
    const stats = getDirectorDashboardStats();
    const lines = getLines();
    const nextCode = generateNextOrderCode();

    return NextResponse.json({
      success: true,
      data: {
        orders,
        stats,
        lines,
        nextCode,
      },
    });
  } catch (error: any) {
    console.error("GET /api/orders error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch orders" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { order, variants } = body;

    if (!order?.customer || !order?.product_name || !variants || variants.length === 0) {
      return NextResponse.json(
        { success: false, error: "Vui lòng nhập đầy đủ thông tin đơn và ma trận Màu x Size" },
        { status: 400 }
      );
    }

    const orderId = order.id || generateNextOrderCode();

    const created = createOrderWithVariants({
      order: {
        ...order,
        id: orderId,
        priority: order.priority || "normal",
        assigned_to: order.assigned_to || "Chuyền 1",
        current_stage: "nhan_don",
        line_id: Number(order.line_id || 1),
      },
      variants,
    });

    return NextResponse.json({
      success: true,
      data: created,
    });
  } catch (error: any) {
    console.error("POST /api/orders error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create order" },
      { status: 500 }
    );
  }
}
