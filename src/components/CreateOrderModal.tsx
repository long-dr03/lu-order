"use client";

import React, { useState } from "react";
import { X, Plus, Trash2, PackageCheck } from "lucide-react";
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
  const [orderInfo, setOrderInfo] = useState({
    id: nextId || "LU-005",
    customer: "",
    product_code: "SP-01",
    product_name: "",
    line_id: 1,
    order_date: new Date().toISOString().split("T")[0],
    deadline: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
    priority: "normal",
    assigned_to: "Chuyền 1 (Nguyễn Thị Hoa)",
    notes: "",
  });

  const [colors, setColors] = useState<string[]>(["Đen", "Trắng"]);
  const [newColorInput, setNewColorInput] = useState("");
  const availableSizes = ["XS", "S", "M", "L", "XL", "XXL"];
  const [selectedSizes, setSelectedSizes] = useState<string[]>(["S", "M", "L"]);

  // Matrix quantities: { "Đen-M": 20 }
  const [quantities, setQuantities] = useState<Record<string, number>>({
    "Đen-S": 10,
    "Đen-M": 20,
    "Đen-L": 10,
    "Trắng-S": 5,
    "Trắng-M": 15,
    "Trắng-L": 5,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddColor = () => {
    if (newColorInput.trim() && !colors.includes(newColorInput.trim())) {
      setColors([...colors, newColorInput.trim()]);
      setNewColorInput("");
    }
  };

  const handleRemoveColor = (c: string) => {
    if (colors.length > 1) {
      setColors(colors.filter((item) => item !== c));
    }
  };

  const toggleSize = (s: string) => {
    if (selectedSizes.includes(s)) {
      if (selectedSizes.length > 1) {
        setSelectedSizes(selectedSizes.filter((item) => item !== s));
      }
    } else {
      setSelectedSizes([...selectedSizes, s]);
    }
  };

  const handleQtyChange = (color: string, size: string, val: number) => {
    setQuantities({
      ...quantities,
      [`${color}-${size}`]: Math.max(0, val),
    });
  };

  const totalQuantity = colors.reduce((cAcc, color) => {
    return (
      cAcc +
      selectedSizes.reduce((sAcc, size) => {
        return sAcc + (quantities[`${color}-${size}`] || 0);
      }, 0)
    );
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const variantList: Array<{ color: string; size: string; quantity: number }> = [];

      for (const color of colors) {
        for (const size of selectedSizes) {
          const qty = quantities[`${color}-${size}`] || 0;
          if (qty > 0) {
            variantList.push({ color, size, quantity: qty });
          }
        }
      }

      if (variantList.length === 0) {
        throw new Error("Vui lòng nhập số lượng lớn hơn 0 cho ít nhất một Size x Màu!");
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: {
            ...orderInfo,
            total_quantity: totalQuantity,
          },
          variants: variantList,
        }),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-2 sm:p-4 backdrop-blur-2xs animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden my-auto max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
              <PackageCheck className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Tạo Đơn Hàng Mới (LUUTA)
              </h2>
              <p className="text-xs text-slate-500">
                Nhập thông tin sản phẩm và phân bổ ma trận Màu × Size
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {error && (
            <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200/80">
              {error}
            </div>
          )}

          {/* Basic Order Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã đơn hàng *
              </label>
              <Input
                required
                value={orderInfo.id}
                onChange={(e) => setOrderInfo({ ...orderInfo, id: e.target.value.toUpperCase() })}
                placeholder="LU-005"
                className="font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Khách hàng / Đối tác *
              </label>
              <Input
                required
                value={orderInfo.customer}
                onChange={(e) => setOrderInfo({ ...orderInfo, customer: e.target.value })}
                placeholder="VD: Elise, Hades, Juno..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Chuyền sản xuất
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950"
                value={orderInfo.line_id}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  const names: Record<number, string> = {
                    1: "Chuyền 1 (Nguyễn Thị Hoa)",
                    2: "Chuyền 2 (Trần Văn Bình)",
                    3: "Chuyền 3 (Lê Thu Hà)",
                    4: "Chuyền 4 (Phạm Minh Đạt)",
                    5: "Chuyền 5 (Vũ Thị Mai)",
                  };
                  setOrderInfo({
                    ...orderInfo,
                    line_id: id,
                    assigned_to: names[id] || `Chuyền ${id}`,
                  });
                }}
              >
                <option value={1}>Chuyền 1 (Hoa)</option>
                <option value={2}>Chuyền 2 (Bình)</option>
                <option value={3}>Chuyền 3 (Hà)</option>
                <option value={4}>Chuyền 4 (Đạt)</option>
                <option value={5}>Chuyền 5 (Mai)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã sản phẩm *
              </label>
              <Input
                required
                value={orderInfo.product_code}
                onChange={(e) => setOrderInfo({ ...orderInfo, product_code: e.target.value.toUpperCase() })}
                placeholder="VD: DL-05, AO-12..."
                className="font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên sản phẩm *
              </label>
              <Input
                required
                value={orderInfo.product_name}
                onChange={(e) => setOrderInfo({ ...orderInfo, product_name: e.target.value })}
                placeholder="VD: Đầm lụa cổ V xếp ly, Áo blazer linen..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày nhận đơn
              </label>
              <Input
                type="date"
                required
                value={orderInfo.order_date}
                onChange={(e) => setOrderInfo({ ...orderInfo, order_date: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày cần giao (Deadline) *
              </label>
              <Input
                type="date"
                required
                value={orderInfo.deadline}
                onChange={(e) => setOrderInfo({ ...orderInfo, deadline: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mức độ ưu tiên
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950"
                value={orderInfo.priority}
                onChange={(e) => setOrderInfo({ ...orderInfo, priority: e.target.value as any })}
              >
                <option value="normal">Bình thường</option>
                <option value="high">Ưu tiên cao</option>
                <option value="urgent">Gấp / Hỏa tốc</option>
              </select>
            </div>
          </div>

          {/* COLOR & SIZE MATRIX CONFIGURATION */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-4 bg-slate-50/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <div>
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800">
                  Cấu hình Ma trận Size × Màu (BẮT BUỘC)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Thêm các màu sản xuất và chọn kích cỡ áp dụng
                </p>
              </div>
              <div className="font-mono text-xs font-bold text-slate-900 bg-white px-2.5 py-1 rounded border border-slate-200">
                Tổng đơn: {totalQuantity} cái
              </div>
            </div>

            {/* Colors picker */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                1. Danh sách màu sắc:
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {colors.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs font-medium text-slate-800"
                  >
                    {c}
                    {colors.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveColor(c)}
                        className="text-slate-400 hover:text-rose-600 cursor-pointer ml-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    placeholder="Thêm màu..."
                    value={newColorInput}
                    onChange={(e) => setNewColorInput(e.target.value)}
                    className="h-7 w-24 px-2 text-xs border border-slate-200 rounded-md bg-white"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={handleAddColor}
                  >
                    + Thêm
                  </Button>
                </div>
              </div>
            </div>

            {/* Sizes picker */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                2. Kích cỡ áp dụng (Tùy chọn):
              </label>
              <div className="flex items-center gap-1.5">
                {availableSizes.map((s) => {
                  const isChecked = selectedSizes.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSize(s)}
                      className={`h-7 px-3 rounded-md font-mono text-xs font-bold transition-colors cursor-pointer border ${
                        isChecked
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-500 border-slate-200 hover:text-slate-900"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Matrix Input Table */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                3. Nhập số lượng chi tiết từng ô (Màu × Size):
              </label>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-center text-xs">
                  <thead>
                    <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold">
                      <th className="py-2 px-3 text-left">Màu</th>
                      {selectedSizes.map((s) => (
                        <th key={s} className="py-2 px-2 font-mono">
                          {s}
                        </th>
                      ))}
                      <th className="py-2 px-3 text-right bg-slate-100">Tổng màu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {colors.map((color) => {
                      const colorSum = selectedSizes.reduce(
                        (sum, s) => sum + (quantities[`${color}-${s}`] || 0),
                        0
                      );
                      return (
                        <tr key={color}>
                          <td className="py-2 px-3 text-left font-medium text-slate-800">
                            {color}
                          </td>
                          {selectedSizes.map((size) => (
                            <td key={size} className="py-1 px-1">
                              <input
                                type="number"
                                min="0"
                                className="w-14 h-7 text-center font-mono text-xs border border-slate-200 rounded focus:border-slate-900 focus:outline-hidden"
                                value={quantities[`${color}-${size}`] ?? 0}
                                onChange={(e) =>
                                  handleQtyChange(color, size, Number(e.target.value))
                                }
                              />
                            </td>
                          ))}
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                            {colorSum}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Ghi chú kỹ thuật / Vải
            </label>
            <textarea
              className="flex min-h-[50px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950"
              rows={2}
              placeholder="Yêu cầu vải, phụ liệu, quy cách may..."
              value={orderInfo.notes}
              onChange={(e) => setOrderInfo({ ...orderInfo, notes: e.target.value })}
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
              Hủy
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={loading}
              className="bg-slate-900 text-white hover:bg-slate-800 font-semibold"
            >
              {loading ? "Đang tạo..." : `+ Tạo Đơn Hàng (${totalQuantity} cái)`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
