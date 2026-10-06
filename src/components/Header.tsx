"use client";

import React, { useState } from "react";
import { Bell, User, Menu, X, AlertTriangle, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

interface HeaderProps {
  onToggleSidebar?: () => void;
  issuesCount?: number;
  issues?: Array<{ id: string; issue?: string | null; customer?: string }>;
}

export function Header({
  onToggleSidebar,
  issuesCount = 3,
  issues = [],
}: HeaderProps) {
  const [showNotificationMenu, setShowNotificationMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 md:px-8 backdrop-blur">
      {/* Brand & Mobile Hamburger */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onToggleSidebar}
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex items-baseline gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-2xl font-black tracking-tighter text-slate-900 font-serif">
              L u
            </span>
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-900 text-white uppercase tracking-wider">
              Garment
            </span>
          </div>
          <span className="hidden sm:inline-block text-xs text-slate-400 font-medium">
            Quản lý Đơn hàng & Tiến độ Xưởng
          </span>
        </div>
      </div>

      {/* Right: Notifications & Profile */}
      <div className="flex items-center gap-3 relative">
        {/* Notification Bell */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="relative flex items-center gap-1.5 border-slate-200/80 hover:bg-slate-100 text-slate-700 h-8 px-2.5"
            onClick={() => setShowNotificationMenu(!showNotificationMenu)}
          >
            <Bell className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded">
              {issuesCount}
            </span>
          </Button>

          {/* Notifications Dropdown */}
          {showNotificationMenu && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-lg z-50 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Thông báo cần xử lý ({issuesCount})
                </span>
                <span className="text-[10px] text-slate-400">Tự động</span>
              </div>
              <div className="space-y-1.5">
                {issues.length > 0 ? (
                  issues.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-2 rounded-lg p-2 bg-slate-50 border border-slate-100 text-xs text-slate-700"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0 mt-1.5" />
                      <div>
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5 text-xs">
                          <span>{item.id}</span>
                          <span className="text-[10px] font-normal text-slate-400">
                            • {item.customer || "Khách"}
                          </span>
                        </div>
                        <p className="text-slate-500 text-[11px] mt-0.5">{item.issue}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-center text-xs text-slate-400">
                    Không có sự cố nào
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 px-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-semibold">
            <User className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-semibold text-slate-800">thy</span>
          <span className="text-[10px] text-slate-400 hidden sm:inline">(Quản lý)</span>
        </div>
      </div>
    </header>
  );
}
