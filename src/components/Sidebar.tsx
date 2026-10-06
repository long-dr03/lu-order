"use client";

import React from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  Scissors,
  CheckCircle2,
  Package,
  Truck,
  BarChart3,
  Layers,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItemKey =
  | "tong_quan"
  | "don_hang"
  | "san_xuat"
  | "qc"
  | "dong_goi"
  | "giao_hang"
  | "bao_cao";

interface SidebarProps {
  activeTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const navItems = [
  {
    key: "tong_quan" as NavItemKey,
    label: "TỔNG QUAN",
    icon: LayoutDashboard,
    description: "Bảng tin & trạng thái chung",
  },
  {
    key: "don_hang" as NavItemKey,
    label: "ĐƠN HÀNG",
    icon: ShoppingBag,
    description: "Danh sách & tạo đơn",
  },
  {
    key: "san_xuat" as NavItemKey,
    label: "SẢN XUẤT",
    icon: Scissors,
    description: "Tiến độ Cắt - May",
  },
  {
    key: "qc" as NavItemKey,
    label: "QC",
    icon: CheckCircle2,
    description: "Kiểm tra chất lượng",
  },
  {
    key: "dong_goi" as NavItemKey,
    label: "ĐÓNG GÓI",
    icon: Package,
    description: "Kiểm đếm & đóng thùng",
  },
  {
    key: "giao_hang" as NavItemKey,
    label: "GIAO HÀNG",
    icon: Truck,
    description: "Vận chuyển & giao nhận",
  },
  {
    key: "bao_cao" as NavItemKey,
    label: "BÁO CÁO",
    icon: BarChart3,
    description: "Năng suất & doanh số",
  },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  isOpenMobile,
  onCloseMobile,
}: SidebarProps) {
  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={cn(
          "fixed top-16 bottom-0 left-0 z-40 flex w-60 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-in-out md:static md:translate-x-0",
          isOpenMobile ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex flex-1 flex-col justify-between overflow-y-auto px-3 py-4">
          <nav className="space-y-1">
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Phân hệ quản lý
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.key;

              return (
                <button
                  key={item.key}
                  onClick={() => {
                    onSelectTab(item.key);
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold tracking-wide transition-all cursor-pointer text-left",
                    isActive
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive ? "text-white" : "text-slate-500"
                    )}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Bottom Card / System Status */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 mt-4">
            <div className="flex items-center gap-2 text-slate-900">
              <Layers className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-bold">Xưởng May L u</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 leading-tight">
              Hệ thống quản lý tiến độ thời gian thực
            </p>
            <div className="mt-2.5 flex items-center justify-between border-t border-slate-200/60 pt-2 text-[10px] text-slate-400">
              <span>DB: SQLite + Supabase</span>
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Online
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
