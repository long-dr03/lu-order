"use client";

import React from "react";
import { Layers, Clock, AlertTriangle, CheckCircle, ChevronRight, Plus } from "lucide-react";
import { Order, Line } from "@/lib/types";
import { Button } from "../ui/button";
import { formatDate } from "@/lib/utils";

interface LinesViewProps {
  lines: Line[];
  orders: Order[];
  onSelectOrder: (order: Order) => void;
  onOpenLogModal: (lineId?: number) => void;
}

export function LinesView({
  lines,
  orders,
  onSelectOrder,
  onOpenLogModal,
}: LinesViewProps) {
  return (
    <div className="space-y-5 text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <Layers className="h-4 w-4 text-slate-700" />
            Quản Lý 5 Chuyền Sản Xuất LUUTA
          </h2>
          <p className="text-[11px] text-slate-500">
            Theo dõi tiến độ, đơn hàng đang chạy và công suất thực tế từng chuyền
          </p>
        </div>

        <Button
          size="sm"
          className="bg-slate-900 text-white hover:bg-slate-800 gap-1.5 h-8 font-semibold"
          onClick={() => onOpenLogModal()}
        >
          <Plus className="h-3.5 w-3.5" />
          + Nhập Sản Lượng Chuyền
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {lines.map((line) => {
          const lineOrders = orders.filter((o) => o.line_id === line.id && o.status !== "completed");
          const totalRemaining = lineOrders.reduce(
            (sum, o) => sum + Math.round(o.total_quantity * (1 - o.progress / 100)),
            0
          );
          const daysNeeded = line.capacity_per_day > 0 ? Math.ceil(totalRemaining / line.capacity_per_day) : 0;
          const isOverloaded = daysNeeded > 8;

          return (
            <div
              key={line.id}
              className="rounded-xl border border-slate-200 bg-white shadow-xs p-4 flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors"
            >
              {/* Line Header */}
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 font-mono">
                      {line.name}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Tổ trưởng: <strong className="text-slate-700">{line.leader_name}</strong>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-xs font-semibold text-slate-800">
                      {line.workers_count} thợ
                    </span>
                    <p className="text-[10px] text-slate-400">
                      ~{line.capacity_per_day} cái/ngày
                    </p>
                  </div>
                </div>

                {/* Overload / Capacity Alert */}
                <div className="mt-2.5 flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[11px] text-slate-600">
                    Tồn đọng: <strong>{totalRemaining} cái</strong> ({daysNeeded} ngày làm)
                  </span>
                  {isOverloaded ? (
                    <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200/60">
                      ⚠️ Quá tải
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/60">
                      Ổn định
                    </span>
                  )}
                </div>

                {/* Active Orders List */}
                <div className="mt-3 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Đơn hàng đang sản xuất ({lineOrders.length})
                  </span>

                  {lineOrders.length > 0 ? (
                    lineOrders.map((ord) => {
                      const variants = ord.variants || [];
                      const colorSummary = Array.from(new Set(variants.map((v) => v.color))).join(", ");

                      return (
                        <div
                          key={ord.id}
                          onClick={() => onSelectOrder(ord)}
                          className="p-2.5 rounded-lg border border-slate-100 bg-white hover:bg-slate-50/80 cursor-pointer transition-colors space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-xs text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded">
                              {ord.id}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              Hạn: {formatDate(ord.deadline)}
                            </span>
                          </div>

                          <div className="font-medium text-slate-800 truncate">
                            {ord.product_name}
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>Màu: {colorSummary || "Đủ màu"}</span>
                            <span>SL: <strong>{ord.total_quantity}</strong></span>
                          </div>

                          {/* Progress bar */}
                          <div className="w-full bg-slate-100 rounded-full h-1 mt-1">
                            <div
                              className="bg-slate-800 h-1 rounded-full transition-all"
                              style={{ width: `${ord.progress}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-6 text-center text-slate-400 italic text-xs">
                      Chuyền chưa có đơn hàng mới
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Action Button */}
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs border-slate-200 text-slate-700 hover:bg-slate-100 gap-1"
                onClick={() => onOpenLogModal(line.id)}
              >
                Nhập sản lượng cho {line.name}
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
