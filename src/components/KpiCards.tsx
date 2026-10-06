"use client";

import React from "react";
import { Clock, AlertCircle, AlertTriangle, CheckCircle2, ShieldCheck, Truck } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { cn } from "@/lib/utils";

interface StatsProps {
  stats: {
    orders: {
      totalRunning: number;
      atRisk: number;
      delayed: number;
      completed: number;
      waitingQc: number;
      waitingDelivery: number;
    };
    production: {
      monthlyQty: number;
      monthlyPay: number;
    };
    employeesCount: number;
  };
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

export function KpiCards({ stats, activeFilter, onFilterChange }: StatsProps) {
  const cards = [
    {
      id: "running",
      label: "ĐANG SẢN XUẤT",
      value: stats.orders.totalRunning,
      filterKey: "on_track",
      icon: Clock,
      color: "text-slate-700",
      bg: "bg-slate-100",
      desc: "5 chuyền đang chạy",
    },
    {
      id: "at_risk",
      label: "NGUY CƠ TRỄ",
      value: stats.orders.atRisk,
      filterKey: "at_risk",
      icon: AlertCircle,
      color: "text-amber-800",
      bg: "bg-amber-50",
      desc: "SL còn lại > Năng suất",
    },
    {
      id: "delayed",
      label: "ĐÃ TRỄ HẠN",
      value: stats.orders.delayed,
      filterKey: "delayed",
      icon: AlertTriangle,
      color: "text-rose-800",
      bg: "bg-rose-50",
      desc: "Cần ưu tiên xử lý",
    },
    {
      id: "waiting_qc",
      label: "CHỜ QC KIỂM",
      value: stats.orders.waitingQc,
      filterKey: "cho_qc",
      icon: ShieldCheck,
      color: "text-slate-700",
      bg: "bg-slate-100",
      desc: "Đang may & kiểm",
    },
    {
      id: "waiting_delivery",
      label: "CHỜ GIAO HÀNG",
      value: stats.orders.waitingDelivery,
      filterKey: "cho_giao",
      icon: Truck,
      color: "text-slate-700",
      bg: "bg-slate-100",
      desc: "Đang đóng gói/xe lấy",
    },
    {
      id: "completed",
      label: "HOÀN THÀNH",
      value: stats.orders.completed,
      filterKey: "completed",
      icon: CheckCircle2,
      color: "text-slate-700",
      bg: "bg-slate-100",
      desc: "Đã xuất xưởng",
    },
  ];

  return (
    <div className="space-y-3">
      {/* 6 Quick Status Filter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {cards.map((c) => {
          const Icon = c.icon;
          const isSelected = activeFilter === c.filterKey;

          return (
            <Card
              key={c.id}
              onClick={() => {
                if (isSelected) {
                  onFilterChange("all");
                } else {
                  onFilterChange(c.filterKey);
                }
              }}
              className={cn(
                "cursor-pointer transition-all border p-3 bg-white shadow-2xs hover:border-slate-300",
                isSelected
                  ? "border-slate-900 ring-1 ring-slate-900/10 shadow-sm"
                  : "border-slate-200/80"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {c.label}
                </span>
                <div className={cn("p-1 rounded", c.bg)}>
                  <Icon className={cn("h-3 w-3", c.color)} />
                </div>
              </div>

              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="font-mono text-xl font-bold tracking-tight text-slate-900">
                  {c.value}
                </span>
                <span className="text-[9px] text-slate-400 font-mono">
                  {c.desc}
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Production & Payroll monthly flash stat bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl border border-slate-200/80 bg-slate-50/70 text-xs">
        <div className="flex items-center justify-between px-2">
          <span className="text-slate-600 font-medium">
            Sản lượng tháng này ({new Date().toISOString().slice(0, 7)}):
          </span>
          <span className="font-mono font-bold text-slate-900">
            {stats.production.monthlyQty.toLocaleString()} sản phẩm
          </span>
        </div>
        <div className="flex items-center justify-between px-2 sm:border-l border-slate-200">
          <span className="text-slate-600 font-medium">
            Tiền công sản phẩm lũy kế ({stats.employeesCount} nhân viên):
          </span>
          <span className="font-mono font-bold text-slate-950">
            {stats.production.monthlyPay.toLocaleString()} đ
          </span>
        </div>
      </div>
    </div>
  );
}
