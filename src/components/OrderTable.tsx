"use client";

import React from "react";
import { Search, Plus, Filter, Eye, AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Order, LUUTA_STAGES } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface OrderTableProps {
  orders: Order[];
  searchTerm: string;
  onSearchChange: (val: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  onCreateNew: () => void;
  onSelectOrder: (order: Order) => void;
}

export function OrderTable({
  orders,
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onCreateNew,
  onSelectOrder,
}: OrderTableProps) {
  const getStatusBadge = (status: string, stage: string) => {
    if (stage === "hoan_thanh") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
          Đã hoàn thành
        </span>
      );
    }

    switch (status) {
      case "on_track":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/60">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
            🟢 Đúng tiến độ
          </span>
        );
      case "at_risk":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200/60">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
            🟡 Nguy cơ trễ
          </span>
        );
      case "delayed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-rose-50 text-rose-800 border border-rose-200/60">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
            🔴 Đã trễ hạn
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const getStageLabel = (stageKey: string) => {
    return LUUTA_STAGES.find((s) => s.key === stageKey)?.label || stageKey;
  };

  // Convert progress into wireframe ASCII block representation
  const getAsciiBlocks = (progress: number) => {
    const total = 8;
    const filled = Math.round((progress / 100) * total);
    return "█".repeat(filled) + "░".repeat(Math.max(0, total - filled));
  };

  const filterTabs = [
    { key: "all", label: "Tất cả" },
    { key: "on_track", label: "🟢 Đang sản xuất" },
    { key: "at_risk", label: "🟡 Nguy cơ trễ" },
    { key: "delayed", label: "🔴 Đã trễ" },
    { key: "cho_qc", label: "Chờ QC" },
    { key: "cho_dong_goi", label: "Chờ đóng gói" },
    { key: "cho_giao", label: "Chờ giao" },
    { key: "da_giao_du", label: "Hoàn thành" },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden text-xs">
      {/* Control Bar */}
      <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="🔍 Tìm mã đơn, khách, sản phẩm, màu, size..."
            className="pl-9 bg-slate-50/50 border-slate-200 focus:bg-white text-xs h-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={onCreateNew}
            size="sm"
            className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs gap-1.5 h-9 px-3.5 shadow-2xs"
          >
            <Plus className="h-4 w-4" />
            + TẠO ĐƠN MỚI
          </Button>
        </div>
      </div>

      {/* Filter Tabs Chips */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-100 bg-slate-50/60 overflow-x-auto text-xs">
        {filterTabs.map((f) => (
          <button
            key={f.key}
            onClick={() => onStatusFilterChange(f.key)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border ${
              statusFilter === f.key
                ? "bg-slate-900 text-white border-slate-900 font-semibold"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Orders Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="py-2.5 px-3">MÃ ĐƠN</th>
              <th className="py-2.5 px-3">KHÁCH</th>
              <th className="py-2.5 px-3">SẢN PHẨM (MÀU × SIZE)</th>
              <th className="py-2.5 px-3 text-right">SL</th>
              <th className="py-2.5 px-3">DEADLINE</th>
              <th className="py-2.5 px-3 min-w-[140px]">TIẾN ĐỘ</th>
              <th className="py-2.5 px-3">TRẠNG THÁI</th>
              <th className="py-2.5 px-3 text-center">CHI TIẾT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-sans">
            {orders.length > 0 ? (
              orders.map((order) => {
                const asciiBlocks = getAsciiBlocks(order.progress);
                const variants = order.variants || [];
                const colorSummary = Array.from(new Set(variants.map((v) => v.color))).join(", ");
                const sizeSummary = Array.from(new Set(variants.map((v) => v.size))).join(", ");

                return (
                  <tr
                    key={order.id}
                    onClick={() => onSelectOrder(order)}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                  >
                    {/* Mã đơn */}
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                        {order.id}
                      </span>
                    </td>

                    {/* Khách hàng */}
                    <td className="py-2.5 px-3 font-semibold text-slate-800 max-w-[130px] truncate">
                      {order.customer}
                    </td>

                    {/* Sản phẩm & biến thể */}
                    <td className="py-2.5 px-3 max-w-[240px]">
                      <div>
                        <div className="font-medium text-slate-900 truncate">
                          {order.product_name} <span className="font-mono text-slate-400 text-[10px]">({order.product_code})</span>
                        </div>
                        <div className="text-[10px] text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                          <span>Màu: <strong>{colorSummary || "Đủ màu"}</strong></span>
                          <span>•</span>
                          <span>Size: <strong className="font-mono">{sizeSummary || "Đủ size"}</strong></span>
                          <span>•</span>
                          <span className="bg-slate-100 px-1 py-0.2 rounded text-slate-700 font-medium">
                            {getStageLabel(order.current_stage)}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Số lượng */}
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {order.total_quantity}
                    </td>

                    {/* Deadline */}
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-700 font-mono font-medium">
                      {formatDate(order.deadline)}
                    </td>

                    {/* Tiến độ (Kèm khối ASCII như wireframe) */}
                    <td className="py-2.5 px-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-mono tracking-widest text-slate-600">
                            {asciiBlocks}
                          </span>
                          <span className="font-mono font-bold text-slate-700">
                            {order.progress}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1">
                          <div
                            className="bg-slate-800 h-1 rounded-full transition-all"
                            style={{ width: `${order.progress}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Trạng thái */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {getStatusBadge(order.status, order.current_stage)}
                    </td>

                    {/* Chi tiết */}
                    <td className="py-2.5 px-3 text-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px] text-slate-500 hover:text-slate-900 hover:bg-slate-100 gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectOrder(order);
                        }}
                      >
                        <Eye className="h-3 w-3" />
                        Xem
                      </Button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  Không tìm thấy đơn hàng nào phù hợp với bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-[11px] text-slate-500">
        <span>
          Tổng số <strong>{orders.length}</strong> đơn hàng
        </span>
        <span className="text-slate-400">
          * Bấm vào dòng bất kỳ để xem Ma trận Màu × Size và Timeline 11 công đoạn
        </span>
      </div>
    </div>
  );
}
