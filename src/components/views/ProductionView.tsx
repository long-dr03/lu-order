"use client";

import React from "react";
import { Scissors, Shirt, CheckCircle, AlertTriangle, ArrowRight } from "lucide-react";
import { Order } from "@/lib/db";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { formatDate } from "@/lib/utils";

interface ProductionViewProps {
  orders: Order[];
  onSelectOrder: (order: Order) => void;
  onUpdateStage: (orderId: string, nextStage: string, progress: number) => void;
}

export function ProductionView({
  orders,
  onSelectOrder,
  onUpdateStage,
}: ProductionViewProps) {
  const columns = [
    {
      stage: "cat",
      title: "1. TỔ CẮT",
      icon: Scissors,
      color: "bg-slate-100 text-slate-700 border-slate-200/80",
      nextStage: "may",
      nextLabel: "Chuyển May",
      nextProgress: 40,
    },
    {
      stage: "may",
      title: "2. TỔ MAY",
      icon: Shirt,
      color: "bg-slate-100 text-slate-700 border-slate-200/80",
      nextStage: "qc",
      nextLabel: "Chuyển QC",
      nextProgress: 75,
    },
    {
      stage: "qc",
      title: "3. TỔ QC",
      icon: CheckCircle,
      color: "bg-slate-100 text-slate-700 border-slate-200/80",
      nextStage: "dong_goi",
      nextLabel: "Duyệt Đóng Gói",
      nextProgress: 90,
    },
    {
      stage: "dong_goi",
      title: "4. ĐÓNG GÓI & GIAO",
      icon: CheckCircle,
      color: "bg-slate-100 text-slate-700 border-slate-200/80",
      nextStage: "hoan_thanh",
      nextLabel: "Hoàn Thành",
      nextProgress: 100,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">TIẾN ĐỘ SẢN XUẤT XƯỞNG</h2>
          <p className="text-xs text-slate-500">
            Theo dõi và luân chuyển đơn hàng qua các tổ sản xuất
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map((col) => {
          const colOrders = orders.filter((o) => o.stage === col.stage && o.status !== "completed");
          const Icon = col.icon;

          return (
            <div
              key={col.stage}
              className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 flex flex-col min-h-[500px]"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className={`p-1.5 rounded-lg border ${col.color}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-xs font-bold text-slate-800">{col.title}</span>
                </div>
                <Badge variant="secondary" className="font-mono text-xs font-bold">
                  {colOrders.length}
                </Badge>
              </div>

              {/* Order Cards in Column */}
              <div className="mt-3 space-y-2.5 flex-1 overflow-y-auto">
                {colOrders.map((order) => (
                  <div
                    key={order.id}
                    onClick={() => onSelectOrder(order)}
                    className="p-3 bg-white rounded-lg border border-slate-200/80 shadow-xs hover:shadow-md transition-all cursor-pointer space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-900">
                        {order.id}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        Hạn: {formatDate(order.deadline)}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-slate-800 truncate">
                        {order.item_name}
                      </h4>
                      <p className="text-[11px] text-slate-500 truncate">
                        {order.customer} • <strong>{order.quantity} cái</strong>
                      </p>
                    </div>

                    {order.issue && (
                      <div className="rounded bg-red-50 p-1.5 border border-red-200 text-[10px] text-red-700 flex items-center gap-1 font-semibold">
                        <AlertTriangle className="h-3 w-3 text-red-600 shrink-0" />
                        <span className="truncate">{order.issue}</span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-500 font-semibold">
                        {order.progress}%
                      </span>

                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2 text-slate-700 hover:bg-slate-100 gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateStage(order.id, col.nextStage, col.nextProgress);
                        }}
                      >
                        {col.nextLabel}
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}

                {colOrders.length === 0 && (
                  <div className="h-32 flex items-center justify-center text-xs text-slate-400 italic">
                    Không có đơn nào ở khâu này
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
