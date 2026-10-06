"use client";

import React, { useState, useEffect } from "react";
import { DollarSign, Download, Lock, Unlock, History, Check, Filter } from "lucide-react";
import { Button } from "../ui/button";
import { ProductionLog, AuditLog, Employee, Line } from "@/lib/types";

interface PayrollViewProps {
  currentRole: string;
}

export function PayrollView({ currentRole }: PayrollViewProps) {
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [selectedEmp, setSelectedEmp] = useState("all");
  const [selectedStage, setSelectedStage] = useState("all");

  const [logs, setLogs] = useState<ProductionLog[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [payrollSummary, setPayrollSummary] = useState<any[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<"payroll" | "audit">("payroll");
  const [loading, setLoading] = useState(false);

  const fetchPayroll = async () => {
    setLoading(true);
    try {
      // 1. Fetch production logs
      const params = new URLSearchParams();
      if (selectedMonth) params.append("month", selectedMonth);
      if (selectedEmp !== "all") params.append("employee_id", selectedEmp);
      if (selectedStage !== "all") params.append("stage", selectedStage);

      const resLogs = await fetch(`/api/production/log?${params.toString()}`);
      const jsonLogs = await resLogs.json();
      if (jsonLogs.success) {
        setLogs(jsonLogs.data.logs);
        setEmployees(jsonLogs.data.employees || []);
        setLines(jsonLogs.data.lines || []);
      }

      // 2. Fetch summary & lock status
      const resSummary = await fetch(`/api/payroll?month=${selectedMonth}`);
      const jsonSummary = await resSummary.json();
      if (jsonSummary.success) {
        setPayrollSummary(jsonSummary.data.summary || []);
        setIsLocked(jsonSummary.data.isLocked);
      }

      // 3. Fetch audit logs
      const resAudit = await fetch("/api/audit");
      const jsonAudit = await resAudit.json();
      if (jsonAudit.success) {
        setAuditLogs(jsonAudit.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayroll();
  }, [selectedMonth, selectedEmp, selectedStage]);

  // Lock payroll handler
  const handleLockPayroll = async () => {
    if (!confirm(`Bạn có chắc muốn CHỐT LƯƠNG tháng ${selectedMonth}? Dữ liệu sẽ được khóa để tránh sửa đổi!`)) return;

    try {
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: selectedMonth, user_name: "Giám Đốc" }),
      });
      const json = await res.json();
      if (json.success) {
        alert(`Đã chốt lương thành công tháng ${selectedMonth}!`);
        fetchPayroll();
      } else {
        alert(json.error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Export excel handler
  const handleExportExcel = () => {
    const url = `/api/export/excel?month=${selectedMonth}${selectedEmp !== "all" ? `&employee_id=${selectedEmp}` : ""}`;
    window.open(url, "_blank");
  };

  // Summary aggregates
  const totalQuantity = logs.reduce((sum, l) => sum + l.quantity, 0);
  const totalPay = logs.reduce((sum, l) => sum + l.total_pay, 0);

  return (
    <div className="space-y-5 text-xs">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 pb-3">
        <div>
          <h2 className="text-base font-bold text-zinc-900 uppercase tracking-wide flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-zinc-800" />
            Quản Lý Sản Lượng & Tính Lương Sản Phẩm LUUTA
          </h2>
          <p className="text-[11px] text-zinc-500">
            Theo dõi chi tiết số lượng hoàn thành và tính tiền công theo đơn giá sản phẩm
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Lock / Unlock button (Giám đốc only) */}
          {currentRole === "giam_doc" && (
            <Button
              size="sm"
              variant={isLocked ? "outline" : "default"}
              onClick={handleLockPayroll}
              disabled={isLocked}
              className={`h-8 text-xs font-semibold gap-1.5 ${
                isLocked ? "border-zinc-300 text-zinc-500 bg-zinc-50" : "bg-zinc-900 text-white hover:bg-zinc-800"
              }`}
            >
              <Lock className="h-3.5 w-3.5" />
              {isLocked ? "ĐÃ CHỐT LƯƠNG" : "CHỐT LƯƠNG THÁNG"}
            </Button>
          )}

          {/* Export Excel button */}
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-zinc-200 text-zinc-700 hover:bg-zinc-100 gap-1.5 font-medium"
            onClick={handleExportExcel}
          >
            <Download className="h-3.5 w-3.5 text-zinc-500" />
            Xuất Excel (.xlsx)
          </Button>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-100 pb-1">
        <button
          onClick={() => setActiveSubTab("payroll")}
          className={`py-1.5 px-3 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
            activeSubTab === "payroll"
              ? "bg-zinc-900 text-white"
              : "text-zinc-500 hover:bg-zinc-100"
          }`}
        >
          Bảng Tính Lương Chi Tiết
        </button>
        <button
          onClick={() => setActiveSubTab("audit")}
          className={`py-1.5 px-3 rounded-md text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 ${
            activeSubTab === "audit"
              ? "bg-zinc-900 text-white"
              : "text-zinc-500 hover:bg-zinc-100"
          }`}
        >
          <History className="h-3.5 w-3.5" />
          Nhật Ký Thao Tác Hệ Thống ({auditLogs.length})
        </button>
      </div>

      {activeSubTab === "payroll" && (
        <div className="space-y-4">
          {/* Filters Bar: Tháng -> Nhân viên -> Công đoạn */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3.5 rounded-xl border border-zinc-200 bg-zinc-50/70">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                1. Chọn Tháng
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-8 w-full px-2.5 text-xs font-sans border border-zinc-200 rounded-md bg-white focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                2. Lọc Nhân viên
              </label>
              <select
                value={selectedEmp}
                onChange={(e) => setSelectedEmp(e.target.value)}
                className="h-8 w-full px-2 text-xs border border-zinc-200 rounded-md bg-white"
              >
                <option value="all">Tất cả nhân viên</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                3. Lọc Công đoạn
              </label>
              <select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                className="h-8 w-full px-2 text-xs border border-zinc-200 rounded-md bg-white"
              >
                <option value="all">Tất cả công đoạn</option>
                <option value="Cắt">Cắt</option>
                <option value="May">May</option>
                <option value="QC">QC</option>
                <option value="Sửa hàng">Sửa hàng</option>
                <option value="Đóng gói">Đóng gói</option>
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <div className="h-8 flex items-center justify-between px-3 rounded-md bg-white border border-zinc-200 text-[11px]">
                <span className="text-zinc-500">Trạng thái:</span>
                {isLocked ? (
                  <span className="font-bold text-zinc-800 flex items-center gap-1">
                    <Lock className="h-3 w-3 text-zinc-700" /> Đã Khóa
                  </span>
                ) : (
                  <span className="font-bold text-emerald-700 flex items-center gap-1">
                    <Unlock className="h-3 w-3 text-emerald-600" /> Đang cập nhật
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Aggregate KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl border border-zinc-200 bg-white shadow-2xs">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                Tổng Sản Lượng Hoàn Thành
              </span>
              <div className="mt-1 font-sans text-2xl font-black text-zinc-900">
                {totalQuantity.toLocaleString()} <span className="text-xs font-normal text-zinc-500">sản phẩm</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-zinc-200 bg-white shadow-2xs">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                Tổng Tiền Công Sản Phẩm
              </span>
              <div className="mt-1 font-sans text-2xl font-black text-zinc-900">
                {totalPay.toLocaleString()} <span className="text-xs font-normal text-zinc-500">VNĐ</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-zinc-200 bg-white shadow-2xs col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                Số Lần Nhập Sản Lượng
              </span>
              <div className="mt-1 font-sans text-2xl font-black text-zinc-900">
                {logs.length} <span className="text-xs font-normal text-zinc-500">lần ghi nhận</span>
              </div>
            </div>
          </div>

          {/* Details Table */}
          <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-2xs">
            <div className="p-3 border-b border-zinc-100 bg-zinc-50/70 flex items-center justify-between">
              <span className="font-bold text-xs uppercase text-zinc-700">
                Bảng chi tiết tiền công ({logs.length} dòng)
              </span>
              <span className="text-[11px] text-zinc-400">
                Tự động tính: Thành tiền = SL × Đơn giá
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-100/60 text-[11px] font-semibold text-zinc-600">
                    <th className="py-2.5 px-3">Ngày</th>
                    <th className="py-2.5 px-3">Nhân Viên</th>
                    <th className="py-2.5 px-3">Mã Đơn / SP</th>
                    <th className="py-2.5 px-3">Màu</th>
                    <th className="py-2.5 px-3 font-sans">Size</th>
                    <th className="py-2.5 px-3">Công Đoạn</th>
                    <th className="py-2.5 px-3 text-right font-sans">SL</th>
                    <th className="py-2.5 px-3 text-right font-sans">Đơn Giá</th>
                    <th className="py-2.5 px-3 text-right font-sans font-bold">Thành Tiền</th>
                    <th className="py-2.5 px-3 text-center">Người Duyệt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 font-sans">
                  {logs.length > 0 ? (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-50/60 transition-colors">
                        <td className="py-2.5 px-3 font-sans text-zinc-600">
                          {log.log_date}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-zinc-900">
                          {log.employee_name} <span className="text-zinc-400 font-sans text-[10px]">({log.employee_id})</span>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-800">
                          <strong className="font-sans text-zinc-900">{log.order_id}</strong> • {log.product_name}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-600">{log.color}</td>
                        <td className="py-2.5 px-3 font-sans font-bold text-zinc-800">{log.size}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 text-[10px] font-medium border border-zinc-200/60">
                            {log.stage}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-sans font-bold text-zinc-900">
                          {log.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-right font-sans text-zinc-600">
                          {log.unit_price.toLocaleString()}đ
                        </td>
                        <td className="py-2.5 px-3 text-right font-sans font-bold text-zinc-950">
                          {log.total_pay.toLocaleString()}đ
                        </td>
                        <td className="py-2.5 px-3 text-center text-zinc-400 text-[11px]">
                          {log.updated_by}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-zinc-400">
                        Chưa có dữ liệu sản lượng nào cho tiêu chí đã chọn.
                      </td>
                    </tr>
                  )}
                </tbody>
                {logs.length > 0 && (
                  <tfoot>
                    <tr className="bg-zinc-100 font-bold border-t-2 border-zinc-200 text-zinc-950">
                      <td colSpan={6} className="py-3 px-3 uppercase text-right">
                        TỔNG CỘNG ({selectedMonth}):
                      </td>
                      <td className="py-3 px-3 text-right font-sans text-sm">
                        {totalQuantity.toLocaleString()}
                      </td>
                      <td></td>
                      <td className="py-3 px-3 text-right font-sans text-sm text-zinc-950">
                        {totalPay.toLocaleString()}đ
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log Sub Tab */}
      {activeSubTab === "audit" && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-800">
                Nhật Ký Hệ Thống (Không Thể Xóa Lịch Sử)
              </h3>
              <p className="text-[11px] text-zinc-500">
                Lưu vết chính xác: Ai làm – Làm gì – Lúc nào để kiểm tra đối soát khi có sai sót
              </p>
            </div>
          </div>

          <div className="divide-y divide-zinc-100">
            {auditLogs.map((log) => (
              <div key={log.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-900">{log.user_name}</span>
                    <span className="px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-700 text-[10px] font-medium">
                      {log.action}
                    </span>
                  </div>
                  <p className="text-zinc-600 mt-0.5 text-[11px]">{log.details}</p>
                </div>
                <span className="font-sans text-[10px] text-zinc-400 shrink-0">
                  {log.created_at}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
