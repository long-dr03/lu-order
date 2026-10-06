"use client";

import React from "react";
import { Package, Truck, Check } from "lucide-react";
import { Order } from "@/lib/db";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

interface PackagingDeliveryViewProps {
  orders: Order[];
  onSelectOrder: (order: Order) => void;
  onCompleteDelivery: (orderId: string) => void;
}

export function PackagingDeliveryView({
  orders,
  onSelectOrder,
  onCompleteDelivery,
}: PackagingDeliveryViewProps) {
  const deliveryOrders = orders.filter(
    (o) => o.stage === "dong_goi" || o.stage === "giao_hang" || o.stage === "hoan_thanh"
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Truck className="h-4 w-4 text-slate-700" />
            ĐÓNG GÓI & GIAO HÀNG
          </h2>
          <p className="text-xs text-slate-500">
            Kiểm đếm kiện hàng xuất xưởng và xác nhận bàn giao cho khách
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Đóng gói */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2 font-semibold text-xs text-slate-800">
              <Package className="h-3.5 w-3.5 text-slate-500" />
              ĐANG ĐÓNG GÓI
            </div>
            <span className="text-xs text-slate-500 font-mono">
              {deliveryOrders.filter((o) => o.stage === "dong_goi").length} đơn
            </span>
          </div>

          <div className="space-y-2">
            {deliveryOrders
              .filter((o) => o.stage === "dong_goi")
              .map((order) => (
                <div
                  key={order.id}
                  onClick={() => onSelectOrder(order)}
                  className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-100/60 cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-1.5 font-mono text-xs font-medium text-slate-900">
                      <span>{order.id}</span>
                      <span className="font-sans text-slate-700">• {order.customer}</span>
                    </div>
                    <p className="text-xs text-slate-500">{order.item_name} (SL: {order.quantity})</p>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-slate-900 hover:bg-slate-800 text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCompleteDelivery(order.id);
                    }}
                  >
                    Bàn giao xe
                  </Button>
                </div>
              ))}
          </div>
        </div>

        {/* Đã giao / Hoàn thành */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2 font-semibold text-xs text-slate-800">
              <Check className="h-3.5 w-3.5 text-slate-500" />
              ĐÃ XUẤT XƯỞNG / HOÀN THÀNH
            </div>
            <span className="text-xs text-slate-500 font-mono">
              {deliveryOrders.filter((o) => o.stage === "hoan_thanh").length} đơn
            </span>
          </div>

          <div className="space-y-2">
            {deliveryOrders
              .filter((o) => o.stage === "hoan_thanh")
              .slice(0, 5)
              .map((order) => (
                <div
                  key={order.id}
                  onClick={() => onSelectOrder(order)}
                  className="p-3 rounded-lg border border-slate-100 bg-slate-50/40 flex items-center justify-between cursor-pointer"
                >
                  <div>
                    <div className="flex items-center gap-1.5 font-mono text-xs font-medium text-slate-900">
                      <span>{order.id}</span>
                      <span className="font-sans text-slate-700">• {order.customer}</span>
                    </div>
                    <p className="text-xs text-slate-500">{order.item_name} (SL: {order.quantity})</p>
                  </div>
                  <span className="text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60 font-medium">
                    Đã nhận hàng
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
