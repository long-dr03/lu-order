"use client";

import React, { useState } from "react";
import { X, Clock, ArrowRight, AlertTriangle, CheckCircle2, ChevronRight, Package, Truck } from "lucide-react";
import { Button } from "./ui/button";
import { Order, OrderVariant, LUUTA_STAGES, StageKey } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface OrderDetailModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStage: (orderId: string, stage: StageKey) => void;
}

export function OrderDetailModal({
  order,
  isOpen,
  onClose,
  onUpdateStage,
}: OrderDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"matrix" | "stage_progress" | "timeline">("matrix");

  if (!isOpen || !order) return null;

  const variants = order.variants || [];
  const uniqueColors = Array.from(new Set(variants.map((v) => v.color)));
  const allSizes = ["XS", "S", "M", "L", "XL", "XXL"];
  const activeSizes = allSizes.filter((s) => variants.some((v) => v.size === s));

  // Compute Color x Size Matrix
  const getQty = (color: string, size: string) => {
    return variants.find((v) => v.color === color && v.size === size)?.quantity || 0;
  };

  const getColorTotal = (color: string) => {
    return variants.filter((v) => v.color === color).reduce((sum, v) => sum + v.quantity, 0);
  };

  const getSizeTotal = (size: string) => {
    return variants.filter((v) => v.size === size).reduce((sum, v) => sum + v.quantity, 0);
  };

  const grandTotal = variants.reduce((sum, v) => sum + v.quantity, 0);

  // Current stage index in LUUTA 11 stages
  const currentStageIndex = LUUTA_STAGES.findIndex((s) => s.key === order.current_stage);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-2 sm:p-4 backdrop-blur-2xs animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-4xl rounded-2xl border border-zinc-200 bg-white shadow-xl overflow-hidden my-auto max-h-[95vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5 bg-zinc-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-sans text-base font-bold bg-zinc-900 text-white px-2.5 py-1 rounded">
              {order.id}
            </span>
            <div>
              <h2 className="text-sm font-bold text-zinc-900">
                {order.product_name} <span className="font-normal text-zinc-500">({order.product_code})</span>
              </h2>
              <p className="text-xs text-zinc-500">
                Khách: <strong className="text-zinc-700">{order.customer}</strong> • Tổng SL: <strong>{order.total_quantity} cái</strong> • Deadline: <strong>{formatDate(order.deadline)}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-800 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 border-b border-zinc-200 px-5 bg-white shrink-0 text-xs font-medium">
          <button
            onClick={() => setActiveTab("matrix")}
            className={`py-3 px-3 border-b-2 cursor-pointer transition-colors ${
              activeTab === "matrix"
                ? "border-zinc-900 text-zinc-900 font-bold"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            1. Ma Trận Size × Màu
          </button>
          <button
            onClick={() => setActiveTab("stage_progress")}
            className={`py-3 px-3 border-b-2 cursor-pointer transition-colors ${
              activeTab === "stage_progress"
                ? "border-zinc-900 text-zinc-900 font-bold"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            2. Tiến Độ Theo Từng Size/Màu
          </button>
          <button
            onClick={() => setActiveTab("timeline")}
            className={`py-3 px-3 border-b-2 cursor-pointer transition-colors ${
              activeTab === "timeline"
                ? "border-zinc-900 text-zinc-900 font-bold"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            3. Timeline 11 Công Đoạn LUUTA
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* TAB 1: MA TRẬN SIZE X MÀU */}
          {activeTab === "matrix" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                    Bảng phân bổ chính xác: Sản phẩm → Màu → Size → Số lượng
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Bắt buộc kiểm soát đúng chi tiết theo từng biến thể kích cỡ và màu sắc
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-zinc-200">
                <table className="w-full text-center text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-100/80 border-b border-zinc-200 text-zinc-600 font-semibold">
                      <th className="py-2.5 px-4 text-left font-bold">Màu</th>
                      {activeSizes.map((s) => (
                        <th key={s} className="py-2.5 px-3 font-bold font-sans">
                          {s}
                        </th>
                      ))}
                      <th className="py-2.5 px-4 text-right font-bold bg-zinc-200/50">Tổng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {uniqueColors.map((color) => {
                      const colorTotal = getColorTotal(color);
                      return (
                        <tr key={color} className="hover:bg-zinc-50/70">
                          <td className="py-2.5 px-4 text-left font-medium text-zinc-800">
                            {color}
                          </td>
                          {activeSizes.map((s) => {
                            const q = getQty(color, s);
                            return (
                              <td key={s} className="py-2.5 px-3 font-sans text-zinc-700">
                                {q > 0 ? (
                                  <span className="font-semibold text-zinc-900">{q}</span>
                                ) : (
                                  <span className="text-zinc-300">-</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-4 text-right font-sans font-bold text-zinc-900 bg-zinc-50/50">
                            {colorTotal}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-zinc-100 font-bold border-t-2 border-zinc-200 text-zinc-900">
                      <td className="py-2.5 px-4 text-left uppercase">Tổng</td>
                      {activeSizes.map((s) => (
                        <td key={s} className="py-2.5 px-3 font-sans">
                          {getSizeTotal(s)}
                        </td>
                      ))}
                      <td className="py-2.5 px-4 text-right font-sans text-sm bg-zinc-200 text-zinc-950 font-black">
                        {grandTotal}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {order.notes && (
                <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200 text-zinc-600 text-xs">
                  <strong>Ghi chú đơn hàng:</strong> {order.notes}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TIẾN ĐỘ THEO TỪNG SIZE/MÀU */}
          {activeTab === "stage_progress" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                  Theo dõi số lượng qua từng công đoạn (Màu × Size)
                </h3>
                <p className="text-[11px] text-zinc-500">
                  Nhìn thấy chính xác đang thiếu ở Size nào – Màu nào – Công đoạn nào
                </p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-zinc-200">
                <table className="w-full text-center text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-100/80 border-b border-zinc-200 text-zinc-600 font-semibold">
                      <th className="py-2.5 px-3 text-left">Màu / Size</th>
                      <th className="py-2.5 px-2">Yêu Cầu</th>
                      <th className="py-2.5 px-2">Cắt</th>
                      <th className="py-2.5 px-2">May</th>
                      <th className="py-2.5 px-2">QC Đạt</th>
                      <th className="py-2.5 px-2">Đóng Gói</th>
                      <th className="py-2.5 px-2">Đã Giao</th>
                      <th className="py-2.5 px-3 text-right">Còn Thiếu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {variants.map((v) => {
                      const remaining = v.quantity - v.delivered_qty;
                      const hasBottleneck = v.cut_qty < v.quantity || v.sewn_qty < v.cut_qty;

                      return (
                        <tr key={`${v.color}-${v.size}`} className="hover:bg-zinc-50/70">
                          <td className="py-2 px-3 text-left font-medium text-zinc-900">
                            {v.color} – <span className="font-sans font-bold">{v.size}</span>
                          </td>
                          <td className="py-2 px-2 font-sans font-semibold text-zinc-900">
                            {v.quantity}
                          </td>
                          <td className="py-2 px-2 font-sans text-zinc-700">
                            {v.cut_qty}
                          </td>
                          <td className="py-2 px-2 font-sans text-zinc-700">
                            {v.sewn_qty}
                          </td>
                          <td className="py-2 px-2 font-sans text-zinc-700">
                            {v.qc_passed_qty}
                          </td>
                          <td className="py-2 px-2 font-sans text-zinc-700">
                            {v.packed_qty}
                          </td>
                          <td className="py-2 px-2 font-sans text-zinc-700">
                            {v.delivered_qty}
                          </td>
                          <td className="py-2 px-3 text-right font-sans font-bold">
                            {remaining > 0 ? (
                              <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60">
                                Thiếu {remaining}
                              </span>
                            ) : (
                              <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                                Đủ
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: TIMELINE 11 CÔNG ĐOẠN CỦA LUUTA */}
          {activeTab === "timeline" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                  Quy trình sản xuất chuẩn LUUTA (11 bước)
                </h3>
                <p className="text-[11px] text-zinc-500">
                  Nhận đơn → Kiểm NPL → Kiểm rập → Cắt → May → QC → Sửa → QC lại → Đóng gói → Giao hàng → Hoàn thành
                </p>
              </div>

              <div className="space-y-2">
                {LUUTA_STAGES.map((s, idx) => {
                  const isCurrent = s.key === order.current_stage;
                  const isDone = idx < currentStageIndex;
                  const isFuture = idx > currentStageIndex;

                  return (
                    <div
                      key={s.key}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        isCurrent
                          ? "border-zinc-900 bg-zinc-50 shadow-xs ring-1 ring-zinc-900/10"
                          : isDone
                          ? "border-zinc-200 bg-white opacity-85"
                          : "border-zinc-100 bg-zinc-50/50 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-sans font-bold ${
                            isDone
                              ? "bg-emerald-600 text-white"
                              : isCurrent
                              ? "bg-zinc-900 text-white"
                              : "bg-zinc-200 text-zinc-600"
                          }`}
                        >
                          {isDone ? <CheckCircle2 className="h-4 w-4" /> : s.step}
                        </span>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-zinc-900">
                              {s.label}
                            </span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.2 rounded bg-zinc-900 text-white text-[9px] font-bold uppercase">
                                Đang thực hiện
                              </span>
                            )}
                            {isDone && (
                              <span className="text-[10px] text-emerald-700 font-medium">
                                Đã hoàn thành
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-400">
                            Phụ trách: {order.assigned_to}
                          </span>
                        </div>
                      </div>

                      {/* Quick Move Button */}
                      {!isDone && (
                        <Button
                          size="sm"
                          variant={isCurrent ? "default" : "outline"}
                          className="h-7 text-xs gap-1"
                          onClick={() => onUpdateStage(order.id, s.key)}
                        >
                          Chuyển bước này
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-3 bg-zinc-50/50 shrink-0">
          <span className="text-[11px] text-zinc-400">
            Chuyền phụ trách: <strong>{order.assigned_to}</strong>
          </span>
          <Button size="sm" variant="outline" onClick={onClose} className="h-8">
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
}
