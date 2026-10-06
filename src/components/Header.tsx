"use client";

import React, { useState } from "react";
import { Menu, Shield, ChevronDown } from "lucide-react";
import { Button } from "./ui/button";

export type UserRole = "giam_doc" | "tro_ly" | "to_truong" | "qc" | "nhan_vien";

interface HeaderProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  onToggleSidebar?: () => void;
  atRiskCount?: number;
}

const ROLES: { key: UserRole; label: string; desc: string }[] = [
  { key: "giam_doc", label: "Giám Đốc", desc: "Toàn quyền quản trị & chốt lương" },
  { key: "tro_ly", label: "Trợ Lý Sản Xuất", desc: "Tạo đơn, phân chuyền, điều phối" },
  { key: "to_truong", label: "Tổ Trưởng (Chuyền)", desc: "Nhận đơn, nhập sản lượng chuyền" },
  { key: "qc", label: "Bộ Phận QC", desc: "Kiểm tra chất lượng & sửa hàng" },
  { key: "nhan_vien", label: "Nhân Viên May", desc: "Cập nhật sản lượng cá nhân" },
];

export function Header({
  currentRole,
  onRoleChange,
  onToggleSidebar,
  atRiskCount = 0,
}: HeaderProps) {
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const activeRoleObj = ROLES.find((r) => r.key === currentRole) || ROLES[0];

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-zinc-200 bg-white px-3 md:px-6 shadow-2xs">
      {/* Brand & Mobile Hamburger */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-8 w-8"
          aria-label="Mở điều hướng"
          onClick={onToggleSidebar}
        >
          <Menu className="h-4 w-4" />
        </Button>

        <span className="text-sm font-medium text-zinc-700">Không gian làm việc</span>
      </div>

      {/* Right Controls: Role Switcher & User */}
      <div className="flex items-center gap-2 relative">
        {/* Role Switcher */}
        <div className="relative">
          <button
            aria-expanded={showRoleMenu}
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <Shield className="h-3.5 w-3.5 text-zinc-600" />
            <span className="hidden sm:inline text-zinc-500 font-normal">Vai trò:</span>
            <strong>{activeRoleObj.label}</strong>
            <ChevronDown className="h-3 w-3 text-zinc-400" />
          </button>

          {showRoleMenu && (
            <div className="absolute right-0 mt-1.5 w-64 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg z-50 animate-in fade-in">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-100 mb-1">
                Chuyển đổi phân quyền thử nghiệm
              </div>
              {ROLES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => {
                    onRoleChange(r.key);
                    setShowRoleMenu(false);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors flex flex-col cursor-pointer ${
                    currentRole === r.key
                      ? "bg-zinc-900 text-white font-semibold"
                      : "text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  <span>{r.label}</span>
                  <span className={`text-[10px] ${currentRole === r.key ? "text-zinc-300" : "text-zinc-400"}`}>
                    {r.desc}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Warning Badge */}
        {atRiskCount > 0 && (
          <div
            title={`${atRiskCount} đơn có nguy cơ hoặc đã trễ`}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-50 text-zinc-600 border border-zinc-200 text-[11px] font-medium"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400"></span>
            <span>{atRiskCount} trễ/nguy cơ</span>
          </div>
        )}

        {/* User avatar */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-200">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-white text-xs font-semibold">
            L
          </div>
          <span className="text-xs font-semibold text-zinc-800 hidden md:inline">
            LUUTA
          </span>
        </div>
      </div>
    </header>
  );
}
