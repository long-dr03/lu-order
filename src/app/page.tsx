"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Header, UserRole } from "@/components/Header";
import { Sidebar, NavItemKey } from "@/components/Sidebar";
import { KpiCards } from "@/components/KpiCards";
import { OrderTable } from "@/components/OrderTable";
import { OrderDetailModal } from "@/components/OrderDetailModal";
import { CreateOrderModal } from "@/components/CreateOrderModal";
import { FastProductionLogModal } from "@/components/FastProductionLogModal";
import { LinesView } from "@/components/views/LinesView";
import { PayrollView } from "@/components/views/PayrollView";
import { QcView } from "@/components/views/QcView";
import { DeliveryView } from "@/components/views/DeliveryView";
import { Order, Line, Employee, StageKey } from "@/lib/types";
import { RefreshCw, Plus, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LuutaAppPage() {
  const [activeTab, setActiveTab] = useState<NavItemKey>("tong_quan");
  const [currentRole, setCurrentRole] = useState<UserRole>("giam_doc");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState({
    orders: {
      totalRunning: 4,
      atRisk: 1,
      delayed: 1,
      completed: 0,
      waitingQc: 2,
      waitingDelivery: 1,
    },
    production: {
      monthlyQty: 0,
      monthlyPay: 0,
      lineStats: [],
    },
    employeesCount: 10,
  });
  const [nextCode, setNextCode] = useState("LU-005");

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modals
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isFastLogOpen, setIsFastLogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch orders and system state
  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      if (statusFilter !== "all") params.append("status", statusFilter);

      const res = await fetch(`/api/orders?${params.toString()}`);
      const json = await res.json();

      if (json.success) {
        setOrders(json.data.orders);
        setStats(json.data.stats);
        setLines(json.data.lines);
        setNextCode(json.data.nextCode);
      }

      // Also fetch employees for quick production log
      const resLogs = await fetch("/api/production/log");
      const jsonLogs = await resLogs.json();
      if (jsonLogs.success) {
        setEmployees(jsonLogs.data.employees || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Stage transition
  const handleUpdateStage = async (orderId: string, stage: StageKey) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, user_name: currentRole }),
      });
      const json = await res.json();
      if (json.success) {
        fetchData();
        // Update selected order if opened
        if (selectedOrder && selectedOrder.id === orderId) {
          const resDetail = await fetch(`/api/orders/${orderId}`);
          const jsonDetail = await resDetail.json();
          if (jsonDetail.success) setSelectedOrder(jsonDetail.data);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenOrderDetail = async (order: Order) => {
    try {
      const res = await fetch(`/api/orders/${order.id}`);
      const json = await res.json();
      if (json.success) {
        setSelectedOrder(json.data);
      } else {
        setSelectedOrder(order);
      }
      setIsDetailOpen(true);
    } catch (err) {
      setSelectedOrder(order);
      setIsDetailOpen(true);
    }
  };

  const atRiskCount = stats.orders.atRisk + stats.orders.delayed;
  const canViewPayroll = currentRole !== "nhan_vien";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Top Header */}
      <Header
        currentRole={currentRole}
        onRoleChange={setCurrentRole}
        onToggleSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        atRiskCount={atRiskCount}
      />

      <div className="flex flex-1">
        {/* Left Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            if (tab === "nhap_san_luong") {
              setIsFastLogOpen(true);
            } else {
              setActiveTab(tab);
            }
          }}
          isOpenMobile={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          canViewPayroll={canViewPayroll}
        />

        {/* Main Content View */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto w-full overflow-x-hidden">
          {/* Top Title Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg md:text-xl font-black tracking-tight text-slate-900 uppercase font-serif">
                  {activeTab === "tong_quan" && "TỔNG QUAN XƯỞNG MAY LUUTA"}
                  {activeTab === "don_hang" && "QUẢN LÝ ĐƠN HÀNG (MÀU × SIZE)"}
                  {activeTab === "chuyen_may" && "QUẢN LÝ 5 CHUYỀN SẢN XUẤT"}
                  {activeTab === "luong_san_luong" && "SẢN LƯỢNG & TÍNH LƯƠNG SẢN PHẨM"}
                  {activeTab === "qc" && "PHÂN HỆ KIỂM ĐỊNH CHẤT LƯỢNG (QC)"}
                  {activeTab === "giao_hang" && "GIAO HÀNG & KIỂM ĐỦ SIZE / MÀU"}
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  v1.0 LUUTA
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Theo dõi toàn diện: Nhận đơn → Kiểm NPL → Rập → Cắt → May → QC → Sửa → QC lại → Đóng gói → Giao hàng
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs border-slate-200 text-slate-700 hover:bg-slate-100 gap-1"
                onClick={() => fetchData()}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Làm mới</span>
              </Button>

              <Button
                size="sm"
                className="h-8 text-xs bg-slate-900 text-white hover:bg-slate-800 gap-1 font-semibold"
                onClick={() => setIsFastLogOpen(true)}
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span>+ Nhập Sản Lượng</span>
              </Button>
            </div>
          </div>

          {/* TAB: TỔNG QUAN (Dashboard Giám Đốc) */}
          {activeTab === "tong_quan" && (
            <div className="space-y-5">
              {/* 6 KPI Cards & Monthly Snapshot */}
              <KpiCards
                stats={stats}
                activeFilter={statusFilter}
                onFilterChange={setStatusFilter}
              />

              {/* Order List Table */}
              <OrderTable
                orders={orders}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                onCreateNew={() => setIsCreateOpen(true)}
                onSelectOrder={handleOpenOrderDetail}
              />
            </div>
          )}

          {/* TAB: ĐƠN HÀNG */}
          {activeTab === "don_hang" && (
            <div className="space-y-4">
              <OrderTable
                orders={orders}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                onCreateNew={() => setIsCreateOpen(true)}
                onSelectOrder={handleOpenOrderDetail}
              />
            </div>
          )}

          {/* TAB: 5 CHUYỀN MAY */}
          {activeTab === "chuyen_may" && (
            <LinesView
              lines={lines}
              orders={orders}
              onSelectOrder={handleOpenOrderDetail}
              onOpenLogModal={(lineId) => setIsFastLogOpen(true)}
            />
          )}

          {/* TAB: LƯƠNG & SẢN LƯỢNG */}
          {activeTab === "luong_san_luong" && (
            <PayrollView currentRole={currentRole} />
          )}

          {/* TAB: PHÂN HỆ QC */}
          {activeTab === "qc" && (
            <QcView
              orders={orders}
              onSelectOrder={handleOpenOrderDetail}
              onUpdateStage={handleUpdateStage}
            />
          )}

          {/* TAB: GIAO HÀNG */}
          {activeTab === "giao_hang" && (
            <DeliveryView
              orders={orders}
              onSelectOrder={handleOpenOrderDetail}
              onRefresh={fetchData}
            />
          )}
        </main>
      </div>

      {/* MODAL 1: CHI TIẾT ĐƠN HÀNG (Ma trận Màu x Size + Timeline 11 bước) */}
      <OrderDetailModal
        order={selectedOrder}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedOrder(null);
        }}
        onUpdateStage={handleUpdateStage}
      />

      {/* MODAL 2: TẠO ĐƠN HÀNG MỚI */}
      <CreateOrderModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        nextId={nextCode}
        onSuccess={fetchData}
      />

      {/* MODAL 3: CẬP NHẬT NHANH SẢN LƯỢNG (Mobile fast-entry) */}
      <FastProductionLogModal
        isOpen={isFastLogOpen}
        onClose={() => setIsFastLogOpen(false)}
        orders={orders}
        employees={employees}
        lines={lines}
        onSuccess={fetchData}
      />
    </div>
  );
}
