"use client";

import React, { useState } from "react";
import { X, Check, Calculator, Smartphone, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Order, Employee, Line } from "@/lib/types";

interface FastProductionLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  employees: Employee[];
  lines: Line[];
  onSuccess: () => void;
}

export function FastProductionLogModal({
  isOpen,
  onClose,
  orders,
  employees,
  lines,
  onSuccess,
}: FastProductionLogModalProps) {
  const [formData, setFormData] = useState({
    log_date: new Date().toISOString().split("T")[0],
    employee_id: "NV-01",
    employee_name: "Nguyễn Văn A",
    line_id: 1,
    order_id: orders[0]?.id || "LU-001",
    product_name: orders[0]?.product_name || "Đầm lụa xếp ly A",
    color: "Đen",
    size: "M",
    stage: "May",
    quantity: 15,
    unit_price: 35000,
    updated_by: "Tổ trưởng",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const totalPay = Number(formData.quantity) * Number(formData.unit_price);

  const handleOrderChange = (orderId: string) => {
    const selected = orders.find((o) => o.id === orderId);
    if (selected) {
      setFormData({
        ...formData,
        order_id: selected.id,
        product_name: selected.product_name,
        line_id: selected.line_id,
        color: selected.variants?.[0]?.color || "Đen",
        size: selected.variants?.[0]?.size || "M",
      });
    }
  };

  const handleEmpChange = (empId: string) => {
    const emp = employees.find((e) => e.id === empId);
    if (emp) {
      setFormData({
        ...formData,
        employee_id: emp.id,
        employee_name: emp.name,
        line_id: emp.line_id,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/production/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Lỗi lưu sản lượng");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const activeOrder = orders.find((o) => o.id === formData.order_id);
  const availableColors = activeOrder?.variants
    ? Array.from(new Set(activeOrder.variants.map((v) => v.color)))
    : ["Đen", "Trắng", "Đỏ"];
  const availableSizes = activeOrder?.variants
    ? Array.from(new Set(activeOrder.variants.map((v) => v.size)))
    : ["XS", "S", "M", "L", "XL"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-2 sm:p-4 backdrop-blur-2xs animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-slate-700" />
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Cập Nhật Sản Lượng Nhân Viên
              </h3>
              <p className="text-[10px] text-slate-500">
                Ghi nhận số lượng hoàn thành để tính tiền công
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          {error && (
            <div className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200/80">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Ngày thực hiện
              </label>
              <Input
                type="date"
                required
                value={formData.log_date}
                onChange={(e) => setFormData({ ...formData, log_date: e.target.value })}
                className="text-xs h-8"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Chuyền
              </label>
              <select
                className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                value={formData.line_id}
                onChange={(e) => setFormData({ ...formData, line_id: Number(e.target.value) })}
              >
                {lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    Chuyền {l.id} ({l.leader_name})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Nhân viên thực hiện *
            </label>
            <select
              className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium"
              value={formData.employee_id}
              onChange={(e) => handleEmpChange(e.target.value)}
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.id} – {emp.name} ({emp.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Đơn hàng & Sản phẩm *
            </label>
            <select
              className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium"
              value={formData.order_id}
              onChange={(e) => handleOrderChange(e.target.value)}
            >
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id} – {o.product_name} ({o.customer})
                </option>
              ))}
            </select>
          </div>

          {/* Color & Size selection */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Màu sắc
              </label>
              <select
                className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              >
                {availableColors.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Kích cỡ (Size)
              </label>
              <select
                className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-mono font-bold"
                value={formData.size}
                onChange={(e) => setFormData({ ...formData, size: e.target.value })}
              >
                {availableSizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Công đoạn
              </label>
              <select
                className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                value={formData.stage}
                onChange={(e) => setFormData({ ...formData, stage: e.target.value })}
              >
                <option value="Cắt">Cắt</option>
                <option value="May">May</option>
                <option value="QC">QC</option>
                <option value="Sửa hàng">Sửa hàng</option>
                <option value="Đóng gói">Đóng gói</option>
              </select>
            </div>
          </div>

          {/* Quantity & Unit Price */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                SL hoàn thành (cái) *
              </label>
              <Input
                type="number"
                min="1"
                required
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                className="font-mono text-center text-sm font-bold h-9"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Đơn giá sản phẩm (đ) *
              </label>
              <Input
                type="number"
                min="0"
                step="5000"
                required
                value={formData.unit_price}
                onChange={(e) => setFormData({ ...formData, unit_price: Number(e.target.value) })}
                className="font-mono text-right text-xs h-9"
              />
            </div>
          </div>

          {/* Pay summary card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-slate-500" />
              <span className="text-xs text-slate-600">Thành tiền tạm tính:</span>
            </div>
            <span className="font-mono text-base font-bold text-slate-950">
              {totalPay.toLocaleString()} đ
            </span>
          </div>

          {/* Submit */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
              Đóng
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={loading}
              className="bg-slate-900 text-white hover:bg-slate-800 font-semibold h-9 px-4"
            >
              {loading ? "Đang lưu..." : "✓ Xác Nhận Sản Lượng"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
