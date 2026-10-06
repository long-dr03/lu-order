"use client";

import React from "react";
import { Clock, AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { cn } from "@/lib/utils";

interface StatsData {
  inProgress: number;
  nearDeadline: number;
  overdue: number;
  completed: number;
}

interface KpiCardsProps {
  stats: StatsData;
  activeFilter?: string;
  onFilterChange: (status: string) => void;
}

export function KpiCards({
  stats,
  activeFilter = "all",
  onFilterChange,
}: KpiCardsProps) {
  const cards = [
    {
      id: "in_progress",
      label: "ĐANG LÀM",
      value: stats.inProgress,
      filterKey: "normal",
      icon: Clock,
      iconColor: "text-slate-600",
      iconBg: "bg-slate-100",
      badge: "Đang may & cắt",
    },
    {
      id: "near_deadline",
      label: "SẮP TRỄ",
      value: stats.nearDeadline,
      filterKey: "warning",
      icon: AlertCircle,
      iconColor: "text-amber-700",
      iconBg: "bg-amber-50/80",
      badge: "Hạn <= 2 ngày",
    },
    {
      id: "overdue",
      label: "ĐÃ TRỄ",
      value: stats.overdue,
      filterKey: "danger",
      icon: AlertTriangle,
      iconColor: "text-rose-700",
      iconBg: "bg-rose-50/80",
      badge: "Cần xử lý gấp",
    },
    {
      id: "completed",
      label: "HOÀN THÀNH",
      value: stats.completed,
      filterKey: "completed",
      icon: CheckCircle2,
      iconColor: "text-emerald-700",
      iconBg: "bg-emerald-50/80",
      badge: "Đã xuất xưởng",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const isSelected = activeFilter === card.filterKey;

        return (
          <Card
            key={card.id}
            onClick={() => {
              if (isSelected) {
                onFilterChange("all");
              } else {
                onFilterChange(card.filterKey);
              }
            }}
            className={cn(
              "cursor-pointer transition-all duration-150 border bg-white shadow-xs hover:border-slate-300",
              isSelected
                ? "border-slate-900 ring-1 ring-slate-900/10 shadow-sm"
                : "border-slate-200/70"
            )}
          >
            <CardContent className="p-4 md:p-5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  {card.label}
                </span>
                <div className={cn("p-1.5 rounded-md", card.iconBg)}>
                  <Icon className={cn("h-3.5 w-3.5", card.iconColor)} />
                </div>
              </div>

              <div className="mt-2.5 flex items-baseline justify-between">
                <span className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 font-mono">
                  {card.value}
                </span>
                <span className="text-[11px] text-slate-400 font-normal">
                  {card.badge}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
