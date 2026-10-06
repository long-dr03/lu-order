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
    label: "Tổng quan",
    icon: LayoutDashboard,
    badge: "Dashboard",
  },
  {
    key: "don_hang" as NavItemKey,
    label: "Đơn hàng",
    icon: ShoppingBag,
    badge: "Màu x Size",
  },
  {
    key: "chuyen_may" as NavItemKey,
    label: "Chuyền may",
    icon: Layers,
    badge: "Chuyền 1-5",
  },
  {
    key: "nhap_san_luong" as NavItemKey,
    label: "Nhập sản lượng",
    icon: Edit3,
    badge: "Điện thoại",
  },
  {
    key: "luong_san_luong" as NavItemKey,
    label: "Lương sản phẩm",
    icon: DollarSign,
    badge: "Chốt lương",
  },
  {
    key: "qc" as NavItemKey,
    label: "Kiểm soát chất lượng",
    icon: ShieldCheck,
    badge: "May - Sửa",
  },
  {
    key: "giao_hang" as NavItemKey,
    label: "Giao hàng",
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
          className="fixed inset-0 z-40 bg-zinc-900/30 backdrop-blur-xs md:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={cn(
          "fixed top-0 bottom-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 transition-transform duration-200 ease-in-out md:sticky md:top-0 md:h-screen md:translate-x-0",
          isOpenMobile ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex flex-1 flex-col justify-between overflow-y-auto px-2.5 py-4">
          <nav className="space-y-1" aria-label="Điều hướng chính">
            <div className="mb-8 px-3 pt-2 text-xl font-semibold tracking-tight text-zinc-900">LUUTA<span className="mt-1 block text-xs font-normal tracking-normal text-zinc-500">Quản lý sản xuất</span></div>
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Xưởng may
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
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => {
                    onSelectTab(item.key);
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer text-left",
                    isActive
                      ? "bg-zinc-200/60 text-zinc-900 font-semibold"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isActive ? "text-zinc-900" : "text-zinc-400"
                      )}
                    />
                    <span>{item.label}</span>
                  </div>

                </button>
              );
            })}
          </nav>

          <div className="border-t border-zinc-200 px-3 pt-4 text-xs text-zinc-500">LUUTA Garment</div>
        </div>
      </aside>
    </>
  );
}
