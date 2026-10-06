"use client";

import React from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  Layers,
  Edit3,
  DollarSign,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItemKey =
  | "tong_quan"
  | "don_hang"
  | "chuyen_may"
  | "nhap_san_luong"
  | "luong_san_luong"
  | "qc"
  | "giao_hang";

interface SidebarProps {
  activeTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  canViewPayroll?: boolean;
}

export const navItems = [
  {
    key: "tong_quan" as NavItemKey,
    label: "TỔNG QUAN",
    icon: LayoutDashboard,
    badge: "Dashboard",
  },
  {
    key: "don_hang" as NavItemKey,
    label: "ĐƠN HÀNG",
    icon: ShoppingBag,
    badge: "Màu x Size",
  },
  {
    key: "chuyen_may" as NavItemKey,
    label: "5 CHUYỀN MAY",
    icon: Layers,
    badge: "Chuyền 1-5",
  },
  {
    key: "nhap_san_luong" as NavItemKey,
    label: "NHẬP SẢN LƯỢNG",
    icon: Edit3,
    badge: "Điện thoại",
  },
  {
    key: "luong_san_luong" as NavItemKey,
    label: "LƯƠNG & SẢN LƯỢNG",
    icon: DollarSign,
    badge: "Chốt lương",
  },
  {
    key: "qc" as NavItemKey,
    label: "PHÂN HỆ QC",
    icon: ShieldCheck,
    badge: "May - Sửa",
  },
  {
    key: "giao_hang" as NavItemKey,
    label: "GIAO HÀNG",
    icon: Truck,
    badge: "Đã giao đủ",
  },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  isOpenMobile,
  onCloseMobile,
  canViewPayroll = true,
}: SidebarProps) {
  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-xs md:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={cn(
          "fixed top-14 bottom-0 left-0 z-40 flex w-56 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-in-out md:static md:translate-x-0",
          isOpenMobile ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex flex-1 flex-col justify-between overflow-y-auto px-2.5 py-4">
          <nav className="space-y-1">
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Quy trình LUUTA
            </div>

            {navItems.map((item) => {
              // Hide payroll from regular workers
              if (item.key === "luong_san_luong" && !canViewPayroll) {
                return null;
              }

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
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium tracking-wide transition-colors cursor-pointer text-left",
                    isActive
                      ? "bg-slate-900 text-white font-semibold shadow-xs"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isActive ? "text-white" : "text-slate-400"
                      )}
                    />
                    <span>{item.label}</span>
                  </div>
                  <span
                    className={cn(
                      "text-[9px] px-1 py-0.2 rounded font-mono",
                      isActive ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {item.badge}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Bottom Card / System Status */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 mt-4">
            <div className="text-xs font-bold text-slate-900 font-serif">
              LUUTA GARMENT
            </div>
            <p className="mt-1 text-[11px] text-slate-500 leading-tight">
              11 công đoạn chuẩn xưởng
            </p>
            <div className="mt-2 pt-2 border-t border-slate-200 text-[10px] text-slate-400 flex items-center justify-between">
              <span>5 Chuyền may</span>
              <span className="text-emerald-700 font-medium">● Đang chạy</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
