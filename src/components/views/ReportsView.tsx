"use client";

import React from "react";
import { BarChart3, TrendingUp } from "lucide-react";
import { Order } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Progress } from "../ui/progress";

interface ReportsViewProps {
  orders: Order[];
  stats: {
    inProgress: number;
    nearDeadline: number;
    overdue: number;
    completed: number;
  };
}

export function ReportsView({ orders, stats }: ReportsViewProps) {
  const totalOrders = stats.inProgress + stats.completed;
  const onTimeRate = Math.round(
    ((totalOrders - stats.overdue) / Math.max(totalOrders, 1)) * 100
  );

  const stagesCount = {
    cat: orders.filter((o) => o.stage === "cat").length,
    may: orders.filter((o) => o.stage === "may").length,
    qc: orders.filter((o) => o.stage === "qc").length,
    dong_goi: orders.filter((o) => o.stage === "dong_goi").length,
  };

  const totalQuantity = orders.reduce((acc, o) => acc + (o.quantity || 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-slate-700" />
          BÁO CÁO NĂNG SUẤT & HIỆU QUẢ XƯỞNG
        </h2>
        <p className="text-xs text-slate-500">
          Chỉ số vận hành xưởng may L u theo thời gian thực
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-slate-200/80 shadow-xs">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Tỷ lệ giao đúng hẹn
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl md:text-3xl font-bold text-slate-900 font-mono">
                {onTimeRate}%
              </span>
              <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-slate-500" /> Chuẩn KPI
              </span>
            </div>
            <Progress value={onTimeRate} className="h-1.5 mt-3" indicatorClassName="bg-slate-700" />
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-xs">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Tổng sản lượng đang sản xuất
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl md:text-3xl font-bold text-slate-900 font-mono">
                {totalQuantity.toLocaleString()}
              </span>
              <span className="text-xs font-normal text-slate-400">sản phẩm</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-3">
              Phân bổ trên {orders.length} đơn hàng thực tế
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-xs">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Sự cố cần tháo gỡ
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl md:text-3xl font-bold text-slate-900 font-mono">
                {stats.overdue} đơn
              </span>
              <span className="text-xs text-rose-700 font-medium">Cần xử lý</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-3">
              Chậm may, thiếu vải và lỗi QC
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Stage distribution */}
      <Card className="border-slate-200/80 shadow-xs">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Phân bố đơn hàng theo các tổ sản xuất
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-600">Tổ Cắt</span>
              <span className="font-mono text-slate-800">{stagesCount.cat} đơn</span>
            </div>
            <Progress value={(stagesCount.cat / Math.max(orders.length, 1)) * 100} indicatorClassName="bg-slate-600" />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-600">Tổ May (Khâu chính)</span>
              <span className="font-mono text-slate-800">{stagesCount.may} đơn</span>
            </div>
            <Progress value={(stagesCount.may / Math.max(orders.length, 1)) * 100} indicatorClassName="bg-slate-800" />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-600">Tổ QC Kiểm Tra</span>
              <span className="font-mono text-slate-800">{stagesCount.qc} đơn</span>
            </div>
            <Progress value={(stagesCount.qc / Math.max(orders.length, 1)) * 100} indicatorClassName="bg-slate-500" />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-600">Đóng Gói & Xuất Hàng</span>
              <span className="font-mono text-slate-800">{stagesCount.dong_goi} đơn</span>
            </div>
            <Progress value={(stagesCount.dong_goi / Math.max(orders.length, 1)) * 100} indicatorClassName="bg-slate-400" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
