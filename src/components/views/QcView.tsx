"use client";

import React, { useState } from "react";
import { ShieldCheck, CheckCircle2, XCircle, Wrench, RefreshCw, AlertTriangle } from "lucide-react";
import { Order, StageKey } from "@/lib/types";
import { Button } from "../ui/button";
import { formatDate } from "@/lib/utils";

interface QcViewProps {
  orders: Order[];
  onSelectOrder: (order: Order) => void;
  onUpdateStage: (orderId: string, stage: StageKey) => void;
}

export function QcView({ orders, onSelectOrder, onUpdateStage }: QcViewProps) {
  // Orders in May, QC, Sua hang, QC lai
  const qcOrders = orders.filter(
    (o) =>
      o.current_stage === "may" ||
      o.current_stage === "qc" ||
      o.current_stage === "sua_hang" ||
      o.current_stage === "qc_lai"
  );

  return (
    <div className="space-y-5 text-xs">
      <div>
        <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-slate-800" />
          Khu Vực Kiểm Định Chất Lượng (QC) LUUTA
        </h2>
        <p className="text-[11px] text-slate-500">
          Quy trình bắt buộc: May → QC → Sửa hàng → QC lại → Chỉ khi đạt mới chuyển Đóng gói
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Khâu 1: Chờ QC / Đang QC */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="font-bold text-xs uppercase text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-slate-600" />
              1. Đơn Đang Kiểm QC
            </h3>
            <span className="font-mono text-xs text-slate-500">
              {qcOrders.filter((o) => o.current_stage === "qc" || o.current_stage === "may").length} đơn
            </span>
          </div>

          <div className="space-y-2">
            {qcOrders
              .filter((o) => o.current_stage === "qc" || o.current_stage === "may")
              .map((ord) => (
                <div
                  key={ord.id}
                  onClick={() => onSelectOrder(ord)}
                  className="p-3 rounded-lg border border-slate-100 bg-slate-50/60 hover:bg-slate-100/70 cursor-pointer space-y-2 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs bg-slate-900 text-white px-2 py-0.5 rounded">
                      {ord.id}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Hạn: {formatDate(ord.deadline)}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-semibold text-slate-900">{ord.product_name}</h4>
                    <p className="text-[11px] text-slate-500">
                      Khách: {ord.customer} • Tổng SL: <strong>{ord.total_quantity} cái</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] border-slate-200 text-slate-700 hover:bg-slate-200 gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateStage(ord.id, "sua_hang");
                      }}
                    >
                      <XCircle className="h-3 w-3 text-rose-500" />
                      Lỗi (Chuyển Sửa)
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-[11px] bg-slate-900 text-white hover:bg-slate-800 gap-1 ml-auto"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateStage(ord.id, "dong_goi");
                      }}
                    >
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      QC Đạt (Đóng Gói)
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Khâu 2: Sửa hàng & QC lại */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="font-bold text-xs uppercase text-slate-800 flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5 text-amber-600" />
              2. Đang Sửa Hàng & QC Lại
            </h3>
            <span className="font-mono text-xs text-slate-500">
              {qcOrders.filter((o) => o.current_stage === "sua_hang" || o.current_stage === "qc_lai").length} đơn
            </span>
          </div>

          <div className="space-y-2">
            {qcOrders
              .filter((o) => o.current_stage === "sua_hang" || o.current_stage === "qc_lai")
              .map((ord) => (
                <div
                  key={ord.id}
                  onClick={() => onSelectOrder(ord)}
                  className="p-3 rounded-lg border border-amber-200/60 bg-amber-50/30 hover:bg-amber-50/60 cursor-pointer space-y-2 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs bg-amber-900 text-white px-2 py-0.5 rounded">
                      {ord.id}
                    </span>
                    <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded">
                      {ord.current_stage === "sua_hang" ? "Đang sửa hàng" : "Đang QC lại"}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-semibold text-slate-900">{ord.product_name}</h4>
                    <p className="text-[11px] text-slate-500">
                      Khách: {ord.customer} • Lỗi: Nhảy mũi chỉ & lệch ve áo
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-amber-200/40">
                    {ord.current_stage === "sua_hang" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] border-amber-300 text-amber-900 hover:bg-amber-100 gap-1 w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateStage(ord.id, "qc_lai");
                        }}
                      >
                        <RefreshCw className="h-3 w-3" />
                        Đã sửa xong → Chuyển QC lại
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-7 text-[11px] bg-slate-900 text-white hover:bg-slate-800 gap-1 w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateStage(ord.id, "dong_goi");
                        }}
                      >
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        QC Lại Đạt → Chuyển Đóng Gói
                      </Button>
                    )}
                  </div>
                </div>
              ))}

            {qcOrders.filter((o) => o.current_stage === "sua_hang" || o.current_stage === "qc_lai").length === 0 && (
              <div className="py-8 text-center text-slate-400 italic">
                Không có đơn hàng nào bị lỗi cần sửa
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
