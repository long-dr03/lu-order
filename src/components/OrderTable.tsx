"use client";

import React from "react";
import { Search, Plus, Eye } from "lucide-react";
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
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-50 text-zinc-600 border border-zinc-200">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400"></span>
          Đã hoàn thành
        </span>
      );
    }

    switch (status) {
      case "on_track":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-white text-zinc-600 border border-zinc-200">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400"></span>
            Đúng tiến độ
          </span>
        );
      case "at_risk":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200/60">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
            Nguy cơ trễ
          </span>
        );
      case "delayed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-rose-50 text-rose-800 border border-rose-200/60">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
            Đã trễ hạn
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const getStageLabel = (stageKey: string) => {
    return LUUTA_STAGES.find((s) => s.key === stageKey)?.label || stageKey;
  };

  const filterTabs = [
    { key: "all", label: "Tất cả" },
    { key: "running", label: "Đang sản xuất" },
    { key: "on_track", label: "Đúng tiến độ" },
    { key: "needs_attention", label: "Cần chú ý" },
    { key: "waiting_delivery", label: "Đóng gói / giao" },
    { key: "at_risk", label: "Nguy cơ trễ" },
    { key: "delayed", label: "Đã trễ" },
    { key: "cho_qc", label: "Chờ QC" },
    { key: "cho_dong_goi", label: "Chờ đóng gói" },
    { key: "cho_giao", label: "Chờ giao" },
    { key: "completed", label: "Hoàn thành" },
  ];

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-2xs overflow-hidden text-xs">
      {/* Control Bar */}
      <div className="p-4 border-b border-zinc-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <Input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Tìm đơn hàng"
            placeholder="Tìm đơn hàng, khách hàng…"
            className="pl-9 bg-zinc-50/50 border-zinc-200 focus:bg-white text-xs h-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={onCreateNew}
            size="sm"
            className="bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs gap-1.5 h-9 px-3.5 shadow-2xs"
          >
            <Plus className="h-4 w-4" />
            Tạo đơn hàng
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-zinc-200">
        <h2 className="text-sm font-semibold text-zinc-900">Danh sách đơn hàng</h2>
        <select aria-label="Lọc trạng thái đơn hàng" value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value)}
          className="h-9 max-w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-600">
          {filterTabs.map((filter) => <option key={filter.key} value={filter.key}>{filter.label}</option>)}
        </select>
      </div>

      {/* Orders Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-medium text-zinc-500">
              <th className="py-4 px-4">Mã đơn</th>
              <th className="py-4 px-4">Khách hàng</th>
              <th className="py-4 px-4">Sản phẩm</th>
              <th className="py-4 px-4 text-right">SL</th>
              <th className="py-4 px-4">Hạn giao</th>
              <th className="py-4 px-4 min-w-[140px]">Tiến độ</th>
              <th className="py-4 px-4">Trạng thái</th>
              <th className="py-4 px-4 text-center">Chi tiết</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 font-sans">
            {orders.length > 0 ? (
              orders.map((order) => {
                const variants = order.variants || [];
                const colorSummary = Array.from(new Set(variants.map((v) => v.color))).join(", ");
                const sizeSummary = Array.from(new Set(variants.map((v) => v.size))).join(", ");

                return (
                  <tr
                    key={order.id}
                    onClick={() => onSelectOrder(order)}
                    className="hover:bg-zinc-50/70 transition-colors cursor-pointer group"
                  >
                    {/* Mã đơn */}
                    <td className="py-4 px-4 font-sans font-bold text-zinc-900 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-100 group-hover:bg-zinc-200 transition-colors">
                        {order.id}
                      </span>
                    </td>

                    {/* Khách hàng */}
                    <td className="py-4 px-4 font-semibold text-zinc-800 max-w-[130px] truncate">
                      {order.customer}
                    </td>

                    {/* Sản phẩm & biến thể */}
                    <td className="py-4 px-4 max-w-[240px]">
                      <div>
                        <div className="font-medium text-zinc-900 truncate">
                          {order.product_name} <span className="font-sans text-zinc-400 text-[10px]">({order.product_code})</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate flex items-center gap-1.5 mt-0.5">
                          <span>Màu: <strong>{colorSummary || "Đủ màu"}</strong></span>
                          <span>•</span>
                          <span>Size: <strong className="font-sans">{sizeSummary || "Đủ size"}</strong></span>

                        </div>
                      </div>
                    </td>

                    {/* Số lượng */}
                    <td className="py-4 px-4 text-right font-sans font-bold text-zinc-900">
                      {order.total_quantity}
                    </td>

                    {/* Deadline */}
                    <td className="py-4 px-4 whitespace-nowrap text-zinc-700 font-sans font-medium">
                      {formatDate(order.deadline)}
                    </td>

                    {/* Tiến độ (Kèm khối ASCII như wireframe) */}
                    <td className="py-4 px-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-500">{getStageLabel(order.current_stage)}</span>
                          <span className="font-sans font-bold text-zinc-700">
                            {order.progress}%
                          </span>
                        </div>
                        <div className="w-full bg-zinc-100 rounded-full h-1">
                          <div
                            className="bg-zinc-800 h-1 rounded-full transition-all"
                            style={{ width: `${order.progress}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Trạng thái */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      {getStatusBadge(order.status, order.current_stage)}
                    </td>

                    {/* Chi tiết */}
                    <td className="py-4 px-4 text-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px] text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 gap-1"
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
                <td colSpan={8} className="py-8 text-center text-zinc-400">
                  Không tìm thấy đơn hàng nào phù hợp với bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-between text-[11px] text-zinc-500">
        <span>
          Tổng số <strong>{orders.length}</strong> đơn hàng
        </span>

      </div>
    </div>
  );
}
