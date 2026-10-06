"use client";

import React, { useState } from "react";
import { Truck, Check, AlertCircle, PackageCheck, AlertTriangle } from "lucide-react";
import { Order, OrderVariant } from "@/lib/types";
import { Button } from "../ui/button";
import { formatDate } from "@/lib/utils";

interface DeliveryViewProps {
  orders: Order[];
  onSelectOrder: (order: Order) => void;
  onRefresh: () => void;
}

export function DeliveryView({ orders, onSelectOrder, onRefresh }: DeliveryViewProps) {
  const deliveryOrders = orders.filter(
    (o) => o.current_stage === "dong_goi" || o.current_stage === "giao_hang" || o.current_stage === "hoan_thanh"
  );

  return (
    <div className="space-y-5 text-xs">
      <div>
        <h2 className="text-base font-bold text-zinc-900 uppercase tracking-wide flex items-center gap-2">
          <Truck className="h-4 w-4 text-zinc-700" />
          Phân Hệ Giao Hàng & Kiểm Đếm Size / Màu
        </h2>
        <p className="text-[11px] text-zinc-500">
          Chỉ khi tất cả Size và Màu được giao đủ 100% số lượng mới chuyển sang trạng thái ĐÃ GIAO ĐỦ
        </p>
      </div>

      <div className="space-y-4">
        {deliveryOrders.map((ord) => {
          const variants = ord.variants || [];
          const missingVariants = variants.filter((v) => v.delivered_qty < v.quantity);
          const isFullyDelivered = variants.length > 0 && missingVariants.length === 0;

          return (
            <div
              key={ord.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs space-y-3"
            >
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="font-sans font-bold text-xs px-2 py-0.5 rounded bg-zinc-900 text-white">
                    {ord.id}
                  </span>
                  <div>
                    <span className="font-bold text-zinc-900 text-xs">
                      {ord.product_name}
                    </span>
                    <span className="text-zinc-400 mx-1.5">•</span>
                    <span className="text-zinc-600 font-medium">Khách: {ord.customer}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-500 font-sans">
                    Hạn giao: {formatDate(ord.deadline)}
                  </span>
                  {isFullyDelivered ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-bold text-[10px] flex items-center gap-1">
                      <Check className="h-3 w-3 text-emerald-600" />
                      ĐÃ GIAO ĐỦ
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 font-bold text-[10px] flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 text-amber-600" />
                      CÒN THIẾU ({missingVariants.length} loại)
                    </span>
                  )}
                </div>
              </div>

              {/* Breakdown table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 text-zinc-500 text-[10px] font-semibold uppercase">
                      <th className="py-1.5 px-3">Màu</th>
                      <th className="py-1.5 px-3 font-sans">Size</th>
                      <th className="py-1.5 px-3 text-right">Yêu Cầu</th>
                      <th className="py-1.5 px-3 text-right">Đã Giao</th>
                      <th className="py-1.5 px-3 text-right">Tình Trạng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {variants.map((v) => {
                      const isComplete = v.delivered_qty >= v.quantity;
                      const missingCount = v.quantity - v.delivered_qty;

                      return (
                        <tr key={`${v.color}-${v.size}`}>
                          <td className="py-2 px-3 font-medium text-zinc-800">{v.color}</td>
                          <td className="py-2 px-3 font-sans font-bold text-zinc-800">{v.size}</td>
                          <td className="py-2 px-3 text-right font-sans text-zinc-700">{v.quantity}</td>
                          <td className="py-2 px-3 text-right font-sans font-bold text-zinc-900">{v.delivered_qty}</td>
                          <td className="py-2 px-3 text-right">
                            {isComplete ? (
                              <span className="text-emerald-700 font-semibold text-[11px]">
                                Đủ
                              </span>
                            ) : (
                              <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 font-bold text-[10px]">
                                CÒN THIẾU: {missingCount} cái
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Missing Alert Notice if not full */}
              {!isFullyDelivered && (
                <div className="rounded-lg bg-amber-50/60 border border-amber-200/60 p-2 text-[11px] text-amber-900 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                    <span>
                      Chưa thể chuyển &ldquo;ĐÃ GIAO ĐỦ&rdquo; cho đơn {ord.id} vì vẫn còn thiếu sản phẩm.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] bg-white border-amber-200 text-amber-900"
                    onClick={() => onSelectOrder(ord)}
                  >
                    Xem chi tiết đơn
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
