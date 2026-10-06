"use client";

import React from "react";
import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import { Order } from "@/lib/db";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { formatDate } from "@/lib/utils";

interface QcViewProps {
  orders: Order[];
  onSelectOrder: (order: Order) => void;
  onApproveQc: (orderId: string) => void;
  onRejectQc: (orderId: string, reason: string) => void;
}

export function QcView({
  orders,
  onSelectOrder,
  onApproveQc,
  onRejectQc,
}: QcViewProps) {
  const qcOrders = orders.filter((o) => o.stage === "qc" || o.issue?.toLowerCase().includes("qc"));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-slate-700" />
            PHÂN HỆ KIỂM ĐỊNH CHẤT LƯỢNG (QC)
          </h2>
          <p className="text-xs text-slate-500">
            Duyệt sản phẩm đạt tiêu chuẩn xuất xưởng hoặc trả về tổ may xử lý lại
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Đơn hàng cần nghiệm thu QC ({qcOrders.length})
          </span>
          <span className="text-xs text-slate-400">Tiêu chuẩn: Đường may, kích thước, độ sạch vải</span>
        </div>

        <div className="divide-y divide-slate-100">
          {qcOrders.length > 0 ? (
            qcOrders.map((order) => {
              const hasQcIssue = order.issue?.toLowerCase().includes("qc");

              return (
                <div
                  key={order.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                        {order.id}
                      </span>
                      <span className="font-medium text-slate-800 text-xs">
                        {order.customer}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-xs text-slate-600">
                        {order.item_name}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>Số lượng: <strong className="text-slate-700">{order.quantity} cái</strong></span>
                      <span>Hạn giao: <strong>{formatDate(order.deadline)}</strong></span>
                      {hasQcIssue && (
                        <span className="text-rose-600 font-medium flex items-center gap-1">
                          • {order.issue}
                        </span>
                      )}
                    </div>

                    {order.notes && (
                      <p className="text-[11px] text-slate-400">
                        Lưu ý: {order.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-slate-600 border-slate-200 hover:bg-slate-100 text-xs gap-1"
                      onClick={() => {
                        const reason = prompt("Nhập lý do QC không đạt (ví dụ: lỗi đường may, bẩn vải):", "QC chưa đạt");
                        if (reason) onRejectQc(order.id, reason);
                      }}
                    >
                      <XCircle className="h-3.5 w-3.5 text-slate-400" />
                      Trả về sửa
                    </Button>

                    <Button
                      size="sm"
                      className="bg-slate-900 hover:bg-slate-800 text-white text-xs gap-1"
                      onClick={() => onApproveQc(order.id)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      QC Đạt (Đóng gói)
                    </Button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              Hiện tại không có đơn nào đang chờ duyệt QC.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
