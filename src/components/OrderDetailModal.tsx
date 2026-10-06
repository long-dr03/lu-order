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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-2 sm:p-4 backdrop-blur-2xs animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden my-auto max-h-[95vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-base font-bold bg-slate-900 text-white px-2.5 py-1 rounded">
              {order.id}
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {order.product_name} <span className="font-normal text-slate-500">({order.product_code})</span>
              </h2>
              <p className="text-xs text-slate-500">
                Khách: <strong className="text-slate-700">{order.customer}</strong> • Tổng SL: <strong>{order.total_quantity} cái</strong> • Deadline: <strong>{formatDate(order.deadline)}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 border-b border-slate-200 px-5 bg-white shrink-0 text-xs font-medium">
          <button
            onClick={() => setActiveTab("matrix")}
            className={`py-3 px-3 border-b-2 cursor-pointer transition-colors ${
              activeTab === "matrix"
                ? "border-slate-900 text-slate-900 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            1. Ma Trận Size × Màu
          </button>
          <button
            onClick={() => setActiveTab("stage_progress")}
            className={`py-3 px-3 border-b-2 cursor-pointer transition-colors ${
              activeTab === "stage_progress"
                ? "border-slate-900 text-slate-900 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            2. Tiến Độ Theo Từng Size/Màu
          </button>
          <button
            onClick={() => setActiveTab("timeline")}
            className={`py-3 px-3 border-b-2 cursor-pointer transition-colors ${
              activeTab === "timeline"
                ? "border-slate-900 text-slate-900 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-800"
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
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Bảng phân bổ chính xác: Sản phẩm → Màu → Size → Số lượng
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Bắt buộc kiểm soát đúng chi tiết theo từng biến thể kích cỡ và màu sắc
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-center text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-2.5 px-4 text-left font-bold">Màu</th>
                      {activeSizes.map((s) => (
                        <th key={s} className="py-2.5 px-3 font-bold font-mono">
                          {s}
                        </th>
                      ))}
                      <th className="py-2.5 px-4 text-right font-bold bg-slate-200/50">Tổng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {uniqueColors.map((color) => {
                      const colorTotal = getColorTotal(color);
                      return (
                        <tr key={color} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4 text-left font-medium text-slate-800">
                            {color}
                          </td>
                          {activeSizes.map((s) => {
                            const q = getQty(color, s);
                            return (
                              <td key={s} className="py-2.5 px-3 font-mono text-slate-700">
                                {q > 0 ? (
                                  <span className="font-semibold text-slate-900">{q}</span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                            {colorTotal}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-200 text-slate-900">
                      <td className="py-2.5 px-4 text-left uppercase">Tổng</td>
                      {activeSizes.map((s) => (
                        <td key={s} className="py-2.5 px-3 font-mono">
                          {getSizeTotal(s)}
                        </td>
                      ))}
                      <td className="py-2.5 px-4 text-right font-mono text-sm bg-slate-200 text-slate-950 font-black">
                        {grandTotal}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {order.notes && (
                <div className="rounded-lg bg-slate-50 p-3 border border-slate-200 text-slate-600 text-xs">
                  <strong>Ghi chú đơn hàng:</strong> {order.notes}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TIẾN ĐỘ THEO TỪNG SIZE/MÀU */}
          {activeTab === "stage_progress" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Theo dõi số lượng qua từng công đoạn (Màu × Size)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Nhìn thấy chính xác đang thiếu ở Size nào – Màu nào – Công đoạn nào
                </p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-center text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-semibold">
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
                  <tbody className="divide-y divide-slate-100">
                    {variants.map((v) => {
                      const remaining = v.quantity - v.delivered_qty;
                      const hasBottleneck = v.cut_qty < v.quantity || v.sewn_qty < v.cut_qty;

                      return (
                        <tr key={`${v.color}-${v.size}`} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3 text-left font-medium text-slate-900">
                            {v.color} – <span className="font-mono font-bold">{v.size}</span>
                          </td>
                          <td className="py-2 px-2 font-mono font-semibold text-slate-900">
                            {v.quantity}
                          </td>
                          <td className="py-2 px-2 font-mono text-slate-700">
                            {v.cut_qty}
                          </td>
                          <td className="py-2 px-2 font-mono text-slate-700">
                            {v.sewn_qty}
                          </td>
                          <td className="py-2 px-2 font-mono text-slate-700">
                            {v.qc_passed_qty}
                          </td>
                          <td className="py-2 px-2 font-mono text-slate-700">
                            {v.packed_qty}
                          </td>
                          <td className="py-2 px-2 font-mono text-slate-700">
                            {v.delivered_qty}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold">
                            {remaining > 0 ? (
                              <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60">
                                Thiếu {remaining}
                              </span>
                            ) : (
                              <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                                Đủ ✅
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
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Quy trình sản xuất chuẩn LUUTA (11 bước)
                </h3>
                <p className="text-[11px] text-slate-500">
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
                          ? "border-slate-900 bg-slate-50 shadow-xs ring-1 ring-slate-900/10"
                          : isDone
                          ? "border-slate-200 bg-white opacity-85"
                          : "border-slate-100 bg-slate-50/50 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-mono font-bold ${
                            isDone
                              ? "bg-emerald-600 text-white"
                              : isCurrent
                              ? "bg-slate-900 text-white"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {isDone ? "✓" : s.step}
                        </span>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900">
                              {s.label}
                            </span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-900 text-white text-[9px] font-bold uppercase">
                                Đang thực hiện
                              </span>
                            )}
                            {isDone && (
                              <span className="text-[10px] text-emerald-700 font-medium">
                                Đã hoàn thành
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">
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
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 bg-slate-50/50 shrink-0">
          <span className="text-[11px] text-slate-400">
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
