"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { Sidebar, NavItemKey } from "@/components/Sidebar";
import { KpiCards } from "@/components/KpiCards";
import { BlockersSection } from "@/components/BlockersSection";
import { OrderTable } from "@/components/OrderTable";
import { CreateOrderModal } from "@/components/CreateOrderModal";
import { UpdateOrderModal } from "@/components/UpdateOrderModal";
import { ProductionView } from "@/components/views/ProductionView";
import { QcView } from "@/components/views/QcView";
import { PackagingDeliveryView } from "@/components/views/PackagingDeliveryView";
import { ReportsView } from "@/components/views/ReportsView";
import { Order } from "@/lib/db";
import { RefreshCw } from "lucide-react";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<NavItemKey>("tong_quan");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState({
    inProgress: 32,
    nearDeadline: 6,
    overdue: 3,
    completed: 45,
  });
  const [issues, setIssues] = useState<Order[]>([]);
  const [nextId, setNextId] = useState("LU-035");

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch orders from API
  const fetchOrders = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      if (statusFilter !== "all") params.append("status", statusFilter);

      const res = await fetch(`/api/orders?${params.toString()}`);
      const json = await res.json();

      if (json.success) {
        setOrders(json.data.orders);
        setStats(json.data.stats);
        setIssues(json.data.stats.issues || []);
        setNextId(json.data.nextId);
      }
    } catch (err) {
      console.error("Error loading orders:", err);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Quick action: resolve issue
  const handleResolveIssue = async (orderId: string) => {
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue: null, status: "normal" }),
      });
      fetchOrders();
    } catch (err) {
      console.error("Failed to resolve issue:", err);
    }
  };

  // Quick action: update stage
  const handleUpdateStage = async (orderId: string, nextStage: string, progress: number) => {
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: nextStage,
          progress: progress,
          status: progress === 100 ? "completed" : "normal",
        }),
      });
      fetchOrders();
    } catch (err) {
      console.error("Failed to update stage:", err);
    }
  };

  // QC approval
  const handleApproveQc = async (orderId: string) => {
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "dong_goi",
          progress: 85,
          issue: null,
          status: "normal",
        }),
      });
      fetchOrders();
    } catch (err) {
      console.error(err);
    }
  };

  // QC reject
  const handleRejectQc = async (orderId: string, reason: string) => {
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "may",
          progress: 40,
          issue: `QC lỗi: ${reason}`,
          status: "danger",
        }),
      });
      fetchOrders();
    } catch (err) {
      console.error(err);
    }
  };

  const openOrderDetails = (order: Order) => {
    setSelectedOrder(order);
    setIsUpdateOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Top Header */}
      <Header
        onToggleSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        issuesCount={issues.length}
        issues={issues}
      />

      <div className="flex flex-1">
        {/* Left Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isOpenMobile={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        {/* Main Content Area */}
        <main className="flex-1 p-4 md:p-8 space-y-6 max-w-7xl mx-auto w-full overflow-x-hidden">
          {/* Main Title Section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/80">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">
                  {activeTab === "tong_quan" && "TỔNG QUAN ĐƠN HÀNG"}
                  {activeTab === "don_hang" && "QUẢN LÝ TẤT CẢ ĐƠN HÀNG"}
                  {activeTab === "san_xuat" && "THEO DÕI TIẾN ĐỘ SẢN XUẤT"}
                  {activeTab === "qc" && "KIỂM ĐỊNH CHẤT LƯỢNG (QC)"}
                  {activeTab === "dong_goi" && "ĐÓNG GÓI & XUẤT XƯỞNG"}
                  {activeTab === "giao_hang" && "VẬN CHUYỂN & GIAO HÀNG"}
                  {activeTab === "bao_cao" && "BÁO CÁO NĂNG SUẤT XƯỞNG"}
                </h1>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60">
                  Live DB
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Xưởng May L u • Hệ thống số hóa quản lý đơn hàng thay thế Sheet
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchOrders()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-xs"
                title="Làm mới dữ liệu"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                <span>Làm mới</span>
              </button>
            </div>
          </div>

          {/* VIEW: TỔNG QUAN hoặc ĐƠN HÀNG */}
          {(activeTab === "tong_quan" || activeTab === "don_hang") && (
            <div className="space-y-6">
              {/* 4 Stat Cards */}
              <KpiCards
                stats={stats}
                activeFilter={statusFilter}
                onFilterChange={setStatusFilter}
              />

              {/* Blockers: ĐƠN CẦN XỬ LÝ (hiển thị khi có sự cố) */}
              <BlockersSection
                issues={issues}
                onResolveIssue={handleResolveIssue}
                onSelectOrder={openOrderDetails}
              />

              {/* Order Data Table */}
              <OrderTable
                orders={orders}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                onCreateNew={() => setIsCreateOpen(true)}
                onSelectOrder={openOrderDetails}
              />
            </div>
          )}

          {/* VIEW: SẢN XUẤT */}
          {activeTab === "san_xuat" && (
            <ProductionView
              orders={orders}
              onSelectOrder={openOrderDetails}
              onUpdateStage={handleUpdateStage}
            />
          )}

          {/* VIEW: QC */}
          {activeTab === "qc" && (
            <QcView
              orders={orders}
              onSelectOrder={openOrderDetails}
              onApproveQc={handleApproveQc}
              onRejectQc={handleRejectQc}
            />
          )}

          {/* VIEW: ĐÓNG GÓI & GIAO HÀNG */}
          {(activeTab === "dong_goi" || activeTab === "giao_hang") && (
            <PackagingDeliveryView
              orders={orders}
              onSelectOrder={openOrderDetails}
              onCompleteDelivery={(orderId) =>
                handleUpdateStage(orderId, "hoan_thanh", 100)
              }
            />
          )}

          {/* VIEW: BÁO CÁO */}
          {activeTab === "bao_cao" && (
            <ReportsView orders={orders} stats={stats} />
          )}
        </main>
      </div>

      {/* Modal Tạo Đơn Mới */}
      <CreateOrderModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        nextId={nextId}
        onSuccess={fetchOrders}
      />

      {/* Modal Chi Tiết & Cập Nhật */}
      <UpdateOrderModal
        isOpen={isUpdateOpen}
        order={selectedOrder}
        onClose={() => {
          setIsUpdateOpen(false);
          setSelectedOrder(null);
        }}
        onSuccess={fetchOrders}
      />
    </div>
  );
}
