"use client";

import { cn } from "@/lib/utils";

interface StatsProps {
  stats: {
    orders: { totalRunning: number; atRisk: number; delayed: number; completed: number; waitingQc: number; waitingDelivery: number };
    production: { monthlyQty: number; monthlyPay: number };
    employeesCount: number;
  };
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  showPayroll?: boolean;
}

export function KpiCards({ stats, activeFilter, onFilterChange, showPayroll = true }: StatsProps) {
  const cards = [
    { label: "Đang sản xuất", value: stats.orders.totalRunning, filter: "running", description: "Đơn hàng chưa hoàn thành" },
    { label: "Cần chú ý", value: stats.orders.atRisk + stats.orders.delayed, filter: "needs_attention", description: `${stats.orders.atRisk} nguy cơ trễ · ${stats.orders.delayed} đã trễ hạn` },
    { label: "Chờ kiểm tra QC", value: stats.orders.waitingQc, filter: "cho_qc", description: "Đơn đang may hoặc kiểm tra" },
    { label: "Chờ giao hàng", value: stats.orders.waitingDelivery, filter: "waiting_delivery", description: "Đơn đang đóng gói hoặc giao" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => (
          <button key={card.filter} type="button" aria-pressed={activeFilter === card.filter}
            onClick={() => onFilterChange(activeFilter === card.filter ? "all" : card.filter)}
            className={cn("rounded-xl border bg-white p-5 text-left transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500", activeFilter === card.filter ? "border-zinc-500" : "border-zinc-200")}>
            <div className="text-sm text-zinc-500">{card.label}</div>
            <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-zinc-900">{card.value}</div>
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">{card.description}</p>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-500">
        <span>Sản lượng tháng: <strong className="font-medium text-zinc-800">{stats.production.monthlyQty.toLocaleString("vi-VN")} sản phẩm</strong></span>
        {showPayroll && <span>Tiền công: <strong className="font-medium text-zinc-800">{stats.production.monthlyPay.toLocaleString("vi-VN")} đ</strong></span>}
        <button className="ml-auto underline-offset-4 hover:underline" onClick={() => onFilterChange("completed")}>Hoàn thành: {stats.orders.completed}</button>
      </div>
    </div>
  );
}
