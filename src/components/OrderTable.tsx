"use client";

import React from "react";
import { Search, Plus, Edit3 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Progress } from "./ui/progress";
import { Order } from "@/lib/db";
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
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "normal":
        return (
          <span
            title="Bình thường / Đúng tiến độ"
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-50 text-slate-700 border border-slate-200/80"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
            Bình thường
          </span>
        );
      case "warning":
        return (
          <span
            title="Sắp đến hạn giao"
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50/60 text-amber-800 border border-amber-200/60"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
            Sắp trễ
          </span>
        );
      case "danger":
        return (
          <span
            title="Đã trễ hoặc có sự cố"
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-rose-50/60 text-rose-800 border border-rose-200/60"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
            Trễ hạn
          </span>
        );
      case "completed":
        return (
          <span
            title="Đã hoàn thành"
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-50 text-slate-500 border border-slate-200/60"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
            Hoàn thành
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const getStageBadge = (stage: string) => {
    const map: Record<string, string> = {
      cat: "Cắt",
      may: "May",
      qc: "QC",
      dong_goi: "Đóng gói",
      giao_hang: "Giao hàng",
      hoan_thanh: "Xong",
    };
    const label = map[stage] || stage;
    return (
      <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-slate-100 text-slate-600 border border-slate-200/60">
        {label}
      </span>
    );
  };

  // Convert progress number into wireframe block characters
  const getAsciiBlocks = (progress: number) => {
    const total = 8;
    const filled = Math.round((progress / 100) * total);
    return "█".repeat(filled) + "░".repeat(Math.max(0, total - filled));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      {/* Control Bar: Search & Create */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 border-b border-slate-100 bg-white">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="🔍 Tìm mã đơn / khách hàng / mẫu..."
            className="pl-9 bg-slate-50/50 border-slate-200/80 focus:bg-white text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Quick status filter pills */}
          <div className="hidden lg:flex items-center rounded-lg border border-slate-200/80 bg-slate-50/50 p-0.5 text-xs">
            {[
              { key: "all", label: "Tất cả" },
              { key: "normal", label: "Bình thường" },
              { key: "warning", label: "Sắp trễ" },
              { key: "danger", label: "Trễ/Sự cố" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => onStatusFilterChange(f.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  statusFilter === f.key
                    ? "bg-white text-slate-900 shadow-xs border border-slate-200/80 font-semibold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <Button
            onClick={onCreateNew}
            size="sm"
            className="bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs gap-1.5 shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            + TẠO ĐƠN MỚI
          </Button>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
              <th className="py-2.5 px-4 font-medium">MÃ ĐƠN</th>
              <th className="py-2.5 px-4 font-medium">KHÁCH</th>
              <th className="py-2.5 px-4 font-medium">MẪU</th>
              <th className="py-2.5 px-4 text-right font-medium">SL</th>
              <th className="py-2.5 px-4 font-medium">HẠN GIAO</th>
              <th className="py-2.5 px-4 min-w-[150px] font-medium">TIẾN ĐỘ</th>
              <th className="py-2.5 px-4 font-medium">TT</th>
              <th className="py-2.5 px-4 text-center font-medium">THAO TÁC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-sans">
            {orders.length > 0 ? (
              orders.map((order) => {
                const asciiBlocks = getAsciiBlocks(order.progress);

                return (
                  <tr
                    key={order.id}
                    className="hover:bg-slate-50/60 transition-colors cursor-pointer group"
                    onClick={() => onSelectOrder(order)}
                  >
                    {/* Mã Đơn */}
                    <td className="py-2.5 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 group-hover:bg-slate-900 group-hover:text-white transition-colors text-[11px]">
                        {order.id}
                      </span>
                    </td>

                    {/* Khách Hàng */}
                    <td className="py-2.5 px-4 font-medium text-slate-700 max-w-[150px] truncate">
                      {order.customer}
                    </td>

                    {/* Mẫu */}
                    <td className="py-2.5 px-4 max-w-[200px]">
                      <div className="flex items-center gap-1.5">
                        {getStageBadge(order.stage)}
                        <span className="text-slate-600 truncate" title={order.item_name}>
                          {order.item_name}
                        </span>
                      </div>
                      {order.issue && (
                        <div className="text-[10px] text-rose-600 truncate mt-0.5">
                          • {order.issue}
                        </div>
                      )}
                    </td>

                    {/* Số lượng */}
                    <td className="py-2.5 px-4 text-right font-mono text-slate-700">
                      {order.quantity}
                    </td>

                    {/* Hạn giao */}
                    <td className="py-2.5 px-4 whitespace-nowrap text-slate-600">
                      {formatDate(order.deadline)}
                    </td>

                    {/* Tiến độ (Kèm khối ASCII như wireframe) */}
                    <td className="py-2.5 px-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-mono text-xs tracking-wider text-slate-500">
                            {asciiBlocks}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {order.progress}%
                          </span>
                        </div>
                        <Progress value={order.progress} className="h-1" />
                      </div>
                    </td>

                    {/* Trạng thái đèn TT */}
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {getStatusBadge(order.status)}
                    </td>

                    {/* Thao tác */}
                    <td className="py-2.5 px-4 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectOrder(order);
                        }}
                      >
                        <Edit3 className="h-3 w-3 mr-1" />
                        Sửa
                      </Button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                  Không tìm thấy đơn hàng nào phù hợp với bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer info */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50/30 text-[11px] text-slate-400">
        <span>
          Tổng số <strong>{orders.length}</strong> đơn hàng
        </span>
        <span>
          Nhấp dòng để xem chi tiết hoặc sửa
        </span>
      </div>
    </div>
  );
}
