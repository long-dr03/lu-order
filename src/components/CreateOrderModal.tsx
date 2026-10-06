"use client";

import React, { useState } from "react";
import { X, Plus, PackageCheck } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  nextId: string;
  onSuccess: () => void;
}

export function CreateOrderModal({
  isOpen,
  onClose,
  nextId,
  onSuccess,
}: CreateOrderModalProps) {
  const [formData, setFormData] = useState({
    id: nextId || "LU-035",
    customer: "",
    item_name: "",
    quantity: 50,
    deadline: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
    stage: "may",
    progress: 10,
    status: "normal",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Không thể tạo đơn hàng");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
              <PackageCheck className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">TẠO ĐƠN HÀNG MỚI</h3>
              <p className="text-xs text-slate-500">
                Nhập thông tin đơn hàng gia công xưởng
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-xs text-red-600 border border-red-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã đơn hàng *
              </label>
              <Input
                required
                value={formData.id}
                onChange={(e) =>
                  setFormData({ ...formData, id: e.target.value.toUpperCase() })
                }
                placeholder="LU-035"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Số lượng (cái/bộ) *
              </label>
              <Input
                type="number"
                min="1"
                required
                value={formData.quantity}
                onChange={(e) =>
                  setFormData({ ...formData, quantity: Number(e.target.value) })
                }
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tên khách hàng / Đối tác *
            </label>
            <Input
              required
              value={formData.customer}
              onChange={(e) =>
                setFormData({ ...formData, customer: e.target.value })
              }
              placeholder="Ví dụ: Thời Trang Juno, Local Brand ABC..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mẫu sản phẩm / Kiểu dáng *
            </label>
            <Input
              required
              value={formData.item_name}
              onChange={(e) =>
                setFormData({ ...formData, item_name: e.target.value })
              }
              placeholder="Ví dụ: Áo thun cổ tròn Cotton 250gsm, Đầm suông linen..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Hạn giao hàng *
              </label>
              <Input
                type="date"
                required
                value={formData.deadline}
                onChange={(e) =>
                  setFormData({ ...formData, deadline: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Công đoạn khởi đầu
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950"
                value={formData.stage}
                onChange={(e) =>
                  setFormData({ ...formData, stage: e.target.value as any })
                }
              >
                <option value="cat">1. Cắt vải</option>
                <option value="may">2. May ráp</option>
                <option value="qc">3. Kiểm hàng QC</option>
                <option value="dong_goi">4. Đóng gói</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Ghi chú kỹ thuật / Vải
            </label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950"
              rows={2}
              placeholder="Loại vải, phụ liệu cúc, chỉ, yêu cầu ủi..."
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
            />
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={loading}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={loading}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              {loading ? "Đang tạo..." : "+ Tạo Đơn Hàng"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
