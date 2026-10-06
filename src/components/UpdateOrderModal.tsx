"use client";

import React, { useState, useEffect } from "react";
import { X, Check, Trash2, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Order } from "@/lib/db";

interface UpdateOrderModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function UpdateOrderModal({
  order,
  isOpen,
  onClose,
  onSuccess,
}: UpdateOrderModalProps) {
  const [formData, setFormData] = useState({
    stage: "may",
    progress: 50,
    status: "normal",
    issue: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (order) {
      setFormData({
        stage: order.stage || "may",
        progress: order.progress || 0,
        status: order.status || "normal",
        issue: order.issue || "",
        notes: order.notes || "",
      });
    }
  }, [order]);

  if (!isOpen || !order) return null;

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: formData.stage,
          progress: Number(formData.progress),
          status: formData.status,
          issue: formData.issue.trim() !== "" ? formData.issue : null,
          notes: formData.notes,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Không thể cập nhật");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Bạn có chắc muốn xóa đơn hàng ${order.id}?`)) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        onSuccess();
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold text-slate-950">
                {order.id}
              </span>
              <span className="text-slate-400">•</span>
              <span className="font-semibold text-sm text-slate-700">
                {order.customer}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{order.item_name} (SL: {order.quantity})</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleUpdate} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-xs text-red-600 border border-red-200">
              {error}
            </div>
          )}

          {/* Progress Slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Tiến độ hoàn thiện:
              </label>
              <span className="font-bold text-sm text-slate-900 font-mono">
                {formData.progress}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
              value={formData.progress}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  progress: Number(e.target.value),
                  status: Number(e.target.value) === 100 ? "completed" : formData.status,
                })
              }
            />
          </div>

          {/* Stage & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Công đoạn hiện tại
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950"
                value={formData.stage}
                onChange={(e) =>
                  setFormData({ ...formData, stage: e.target.value })
                }
              >
                <option value="cat">✂️ Cắt</option>
                <option value="may">🧵 May</option>
                <option value="qc">🔍 QC Kiểm hàng</option>
                <option value="dong_goi">📦 Đóng gói</option>
                <option value="giao_hang">🚚 Giao hàng</option>
                <option value="hoan_thanh">✅ Hoàn thành</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Đèn trạng thái
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950"
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
              >
                <option value="normal">🟢 Bình thường</option>
                <option value="warning">🟡 Sắp trễ / Cảnh báo</option>
                <option value="danger">🔴 Đã trễ / Có sự cố</option>
                <option value="completed">⚪ Đã hoàn thành</option>
              </select>
            </div>
          </div>

          {/* Report Issue / Blocker */}
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-3">
            <label className="block text-xs font-bold text-amber-900 mb-1 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              Báo sự cố tắc nghẽn (nếu có)
            </label>
            <Input
              value={formData.issue}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  issue: e.target.value,
                  status: e.target.value.trim() !== "" ? "danger" : formData.status,
                })
              }
              placeholder="VD: thiếu vải, đang chậm công đoạn may, QC chưa đạt..."
              className="bg-white text-xs"
            />
            <p className="text-[11px] text-amber-700/80 mt-1">
              * Khi nhập sự cố, đơn sẽ tự động xuất hiện trong mục cảnh báo "⚠️ ĐƠN CẦN XỬ LÝ".
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Ghi chú xưởng
            </label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950"
              rows={2}
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              placeholder="Ghi chú thêm..."
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-600 hover:bg-red-50 hover:text-red-700 text-xs gap-1"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Xóa đơn
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={loading}
              >
                Đóng
              </Button>
              <Button
                type="submit"
                variant="default"
                size="sm"
                disabled={loading}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                {loading ? "Đang lưu..." : "Lưu Thay Đổi"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
