"use client";

import React from "react";
import { AlertCircle, Check, ShieldAlert } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Order } from "@/lib/db";

interface BlockersSectionProps {
  issues: Order[];
  onResolveIssue: (orderId: string) => void;
  onSelectOrder: (order: Order) => void;
}

export function BlockersSection({
  issues,
  onResolveIssue,
  onSelectOrder,
}: BlockersSectionProps) {
  if (!issues || issues.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5 shadow-xs">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-700">
            <AlertCircle className="h-4 w-4 text-slate-600" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              ĐƠN CẦN XỬ LÝ
              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200/60">
                {issues.length} sự cố
              </span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Các đơn hàng cần tháo gỡ tắc nghẽn công đoạn sản xuất
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 divide-y divide-slate-100">
        {issues.map((order) => {
          let stageLabel = "Sản xuất";
          if (order.issue?.includes("may")) stageLabel = "Tổ May";
          else if (order.issue?.includes("vải")) stageLabel = "Vật tư";
          else if (order.issue?.includes("QC")) stageLabel = "Khâu QC";

          return (
            <div
              key={order.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between py-2.5 gap-2 text-xs transition-colors hover:bg-slate-50/80 rounded-lg px-2 -mx-2"
            >
              <div className="flex items-start sm:items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0 mt-1.5 sm:mt-0" />
                <button
                  onClick={() => onSelectOrder(order)}
                  className="font-bold text-slate-900 underline-offset-2 hover:underline cursor-pointer font-mono text-xs"
                >
                  {order.id}
                </button>
                <span className="text-slate-300">•</span>
                <span className="font-medium text-slate-700">{order.customer}:</span>
                <span className="text-slate-600 font-normal">{order.issue}</span>
                <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60 hidden md:inline-flex">
                  {stageLabel}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  onClick={() => onSelectOrder(order)}
                >
                  Chi tiết
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-slate-200 hover:bg-slate-100 text-slate-700 gap-1"
                  onClick={() => onResolveIssue(order.id)}
                >
                  <Check className="h-3 w-3 text-slate-500" />
                  Đã giải quyết
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
