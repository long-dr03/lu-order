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
import { RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LuutaAppPage() {
  const [activeTab, setActiveTab] = useState<NavItemKey>("tong_quan");
  const [currentRole, setCurrentRole] = useState<UserRole>("giam_doc");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState({
    orders: {
      totalRunning: 0,
      atRisk: 0,
      delayed: 0,
      completed: 0,
      waitingQc: 0,
      waitingDelivery: 0,
    },
    production: {
      monthlyQty: 0,
      monthlyPay: 0,
      lineStats: [],
    },
    employeesCount: 0,
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

      const allRes = await fetch("/api/orders");
      const allJson = await allRes.json();
      if (allJson.success) setAllOrders(allJson.data.orders);

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
    <div className="min-h-screen bg-zinc-50 flex flex-col font-sans text-zinc-900">
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

        <div className="min-w-0 flex-1">
      {/* Top Header */}
      <Header
        currentRole={currentRole}
        onRoleChange={(role) => {
          setCurrentRole(role);
          if (role === "nhan_vien" && activeTab === "luong_san_luong") setActiveTab("tong_quan");
        }}
        onToggleSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        atRiskCount={atRiskCount}
      />
        {/* Main Content View */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 space-y-5 mx-auto w-full overflow-x-hidden">
          {/* Top Title Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                  {activeTab === "tong_quan" && "Tổng quan"}
                  {activeTab === "don_hang" && "Đơn hàng"}
                  {activeTab === "chuyen_may" && "Chuyền may"}
                  {activeTab === "luong_san_luong" && "Lương sản phẩm"}
                  {activeTab === "qc" && "Kiểm soát chất lượng"}
                  {activeTab === "giao_hang" && "Giao hàng"}
                </h1>

              </div>

            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs border-zinc-200 text-zinc-700 hover:bg-zinc-100 gap-1"
                onClick={() => fetchData()}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Làm mới</span>
              </Button>

              <Button
                size="sm"
                className="h-8 text-xs bg-zinc-900 text-white hover:bg-zinc-800 gap-1 font-semibold"
                onClick={() => setIsFastLogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Nhập sản lượng</span>
              </Button>
            </div>
          </div>

          {/* TAB: TỔNG QUAN (Dashboard Giám Đốc) */}
          {activeTab === "tong_quan" && (
            <div className="space-y-5">
              {/* 6 KPI Cards & Monthly Snapshot */}
              <KpiCards
                stats={stats}
                showPayroll={canViewPayroll}
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
              orders={allOrders}
              onSelectOrder={handleOpenOrderDetail}
              onOpenLogModal={(lineId) => setIsFastLogOpen(true)}
            />
          )}

          {/* TAB: LƯƠNG & SẢN LƯỢNG */}
          {activeTab === "luong_san_luong" && canViewPayroll && (
            <PayrollView currentRole={currentRole} />
          )}

          {/* TAB: PHÂN HỆ QC */}
          {activeTab === "qc" && (
            <QcView
              orders={allOrders}
              onSelectOrder={handleOpenOrderDetail}
              onUpdateStage={handleUpdateStage}
            />
          )}

          {/* TAB: GIAO HÀNG */}
          {activeTab === "giao_hang" && (
            <DeliveryView
              orders={allOrders}
              onSelectOrder={handleOpenOrderDetail}
              onRefresh={fetchData}
            />
          )}
        </main>
        </div>
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
        orders={allOrders}
        employees={employees}
        lines={lines}
        onSuccess={fetchData}
      />
    </div>
  );
}
