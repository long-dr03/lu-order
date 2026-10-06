import { NextResponse } from "next/server";
import { getAllOrders, getStats, createOrder, generateNextOrderId } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;

    const orders = getAllOrders(search, status);
    const stats = getStats();
    const nextId = generateNextOrderId();

    return NextResponse.json({
      success: true,
      data: {
        orders,
        stats,
        nextId,
      },
    });
  } catch (error: any) {
    console.error("API GET /orders error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch orders" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customer, item_name, quantity, deadline, stage, issue, notes } = body;

    if (!customer || !item_name || !quantity || !deadline) {
      return NextResponse.json(
        { success: false, error: "Vui lòng điền đầy đủ các thông tin bắt buộc" },
        { status: 400 }
      );
    }

    const id = body.id || generateNextOrderId();
    const stageVal = stage || "may";
    const progressVal = Number(body.progress) || 10;
    const statusVal = body.status || "normal";

    const newOrder = createOrder({
      id,
      customer,
      item_name,
      quantity: Number(quantity),
      deadline,
      stage: stageVal,
      progress: progressVal,
      status: statusVal,
      issue: issue || null,
      notes: notes || null,
    });

    return NextResponse.json({
      success: true,
      data: newOrder,
    });
  } catch (error: any) {
    console.error("API POST /orders error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create order" },
      { status: 500 }
    );
  }
}
