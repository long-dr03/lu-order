"use client";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  BookOpen,
  LayoutDashboard,
  ShoppingBag,
  Factory,
  ChartNoAxesCombined,
  DollarSign,
  ShieldCheck,
  Truck,
  Users,
  Shield,
  ClipboardList,
  DatabaseBackup,
  Menu,
  X,
  Plus,
  RefreshCw,
  LogOut,
  UserRound,
  KeyRound,
  ArrowLeft,
  CheckCircle2,
  Settings2,
} from "lucide-react";
import {
  type SessionInfo,
  hasPermission,
  permits,
  canRecordProduction,
} from "@/lib/permissions";
import {
  type DashboardData,
  type Api,
  apiFor,
  message,
  money,
  day,
} from "@/lib/client";
import { availableOperations } from "@/lib/workflow";
import { LUUTA_STAGES, type Order } from "@/lib/types";
import type { Rate } from "@/lib/server/business";
import { Pagination } from "@/components/Pagination";
import { AuthScreen } from "@/components/AuthScreen";
import {
  Action,
  Logo,
  Modal,
  ErrorNotice,
  Field,
  Empty,
} from "@/components/Primitives";
import { OrderWorkspace, CreateOrderForm } from "@/components/OrderWorkspace";
import {
  ProductionForm,
  OrderDetail,
  RatesPanel,
} from "@/components/ProductionForms";
import {
  RecordsPanel,
  AuditPanel,
  OperationsPanel,
} from "@/components/RecordsPanel";
import { LinesPanel, DashboardInsights } from "@/components/RequirementPanels";
import { BackupPanel } from "@/components/BackupPanel";
import { AdminPanel } from "@/components/AdminPanel";
import { UserGuide } from "@/components/UserGuide";
const navigation = [
  {
    id: "overview",
    label: "Tổng quan",
    icon: LayoutDashboard,
    permission: "orders.view",
  },
  {
    id: "orders",
    label: "Đơn hàng",
    icon: ShoppingBag,
    permission: "orders.view",
  },
  {
    id: "rates",
    label: "Đơn giá",
    icon: Settings2,
    permission: "rates.manage",
  },
  {
    id: "lines",
    label: "Chuyền sản xuất",
    icon: Factory,
    permission: "orders.view",
  },
  {
    id: "production",
    label: "Sản lượng",
    icon: ChartNoAxesCombined,
    permission: "production.view",
  },
  {
    id: "qc",
    label: "Kiểm soát chất lượng",
    icon: ShieldCheck,
    permission: "qc.view",
  },
  {
    id: "delivery",
    label: "Giao hàng",
    icon: Truck,
    permission: "delivery.view",
  },
  {
    id: "payroll",
    label: "Lương sản phẩm",
    icon: DollarSign,
    permission: "payroll.view",
  },
  {
    id: "audit",
    label: "Nhật ký",
    icon: ClipboardList,
    permission: "audit.view",
  },
  { id: "users", label: "Tài khoản", icon: Users, permission: "users.manage" },
  {
    id: "roles",
    label: "Vai trò và quyền",
    icon: Shield,
    permission: "roles.manage",
  },
  {
    id: "backup",
    label: "Sao lưu",
    icon: DatabaseBackup,
    permission: "users.manage",
  },
  { id: "guide", label: "Xem hướng dẫn", icon: BookOpen, permission: null },
] as const;
type Tab = (typeof navigation)[number]["id"];
export default function Page() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [sidebar, setSidebar] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [rates, setRates] = useState<Rate[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [create, setCreate] = useState(false);
  const [production, setProduction] = useState(false);
  const [productionOrder, setProductionOrder] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const unauthorized = useCallback(() => {
    setSession(null);
    setData(null);
    setSelected(null);
    setCreate(false);
    setProduction(false);
    setAccountOpen(false);
  }, []);
  const api = useMemo(
    () => apiFor(session, unauthorized),
    [session, unauthorized],
  );
  const loadSession = useCallback(async () => {
    const value = await apiFor(null, () => {})<SessionInfo>(
      "/api/auth/session",
    );
    setSession(value);
    setTab("overview");
    setData(null);
    setError("");
  }, []);
  useEffect(() => {
    let live = true;
    void apiFor(null, () => {})<SessionInfo>("/api/auth/session")
      .then((value) => {
        if (live) setSession(value);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setChecking(false);
      });
    return () => {
      live = false;
    };
  }, []);
  const currentSession = useRef(session);
  useEffect(() => {
    currentSession.current = session;
  }, [session]);
  const refresh = useCallback(async () => {
    if (!session || session.user.must_change_password) return;
    try {
      const results = await Promise.all([
        hasPermission(session.user, "orders.view")
          ? api<DashboardData>("/api/orders")
          : Promise.resolve(null),
        hasPermission(session.user, "orders.view") &&
        (hasPermission(session.user, "rates.manage") ||
          hasPermission(session.user, "payroll.view"))
          ? api<Rate[]>("/api/rates")
          : Promise.resolve([]),
      ]);
      if (currentSession.current !== session) return;
      setData(results[0]);
      setRates(results[1]);
      setError("");
    } catch (e) {
      if (currentSession.current === session) setError(message(e));
    } finally {
      if (currentSession.current === session) setLoading(false);
    }
  }, [session, api]);
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => {
      if (live) return refresh();
    });
    return () => {
      live = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const [workPage, setWorkPage] = useState(1);
  const [workSearch, setWorkSearch] = useState("");
  const workerOrders = (data?.orders || []).filter(
    (o) =>
      o.status !== "completed" &&
      `${o.id} ${o.product_name} ${o.customer}`
        .toLocaleLowerCase("vi")
        .includes(workSearch.toLocaleLowerCase("vi")),
  );
  const currentWorkPage = Math.min(
    workPage,
    Math.max(1, Math.ceil(workerOrders.length / 12)),
  );
  const isWorker =
    !!session?.user.employee_id &&
    session.user.roles.length > 0 &&
    session.user.roles.some((r) => r.id === "worker") &&
    session.user.roles.every(
      (r) =>
        r.id === "worker" ||
        r.grants.every((g) => g.permission === "delivery.record"),
    );
  const tabs = session
    ? navigation
        .filter(
          (n) =>
            (n.permission === null ||
              hasPermission(session.user, n.permission)) &&
            (!isWorker ||
              ["overview", "production", "payroll", "guide"].includes(n.id)) &&
            (n.id !== "backup" ||
              session.user.roles.some((r) => r.id === "admin")) &&
            (!session.representing ||
              !["users", "roles", "backup"].includes(n.id)),
        )
        .map((n) =>
          isWorker && n.id !== "guide"
            ? {
                ...n,
                label:
                  n.id === "overview"
                    ? "Công việc"
                    : n.id === "production"
                      ? "Lịch sử sản lượng"
                      : "Lương của tôi",
              }
            : n,
        )
    : [];
  const active = tabs.find((n) => n.id === tab) || tabs[0];
  async function openOrder(order: Order) {
    try {
      setSelected(await api<Order>(`/api/orders/${order.id}`));
    } catch (e) {
      setError(message(e));
    }
  }
  async function reloadDetail() {
    await refresh();
    if (selected) {
      try {
        setSelected(await api<Order>(`/api/orders/${selected.id}`));
      } catch (e) {
        setError(message(e));
      }
    }
  }
  async function saved(close: () => void, message = "Đã lưu dữ liệu.") {
    close();
    await refresh();
    setNotice(message);
  }
  async function logout() {
    try {
      await api("/api/auth/logout", {});
      unauthorized();
    } catch (e) {
      setError(message(e));
    }
  }
  if (checking)
    return (
      <div className="loading-page">
        <Logo />
        <p>Đang kiểm tra phiên đăng nhập…</p>
      </div>
    );
  if (!session)
    return (
      <MotionConfig reducedMotion="user">
        <AuthScreen api={api} onLogin={loadSession} />
      </MotionConfig>
    );
  if (session.user.must_change_password)
    return (
      <div className="forced-password">
        <Logo />
        <section className="panel padded">
          <h1>Đổi mật khẩu tạm</h1>
          <p className="muted">
            Bạn cần đặt mật khẩu mới để tiếp tục làm việc.
          </p>
          <PasswordForm
            api={api}
            onChanged={() => {
              unauthorized();
            }}
          />
          <Action tone="secondary" onClick={logout}>
            Đăng xuất
          </Action>
        </section>
      </div>
    );
  const title =
    active?.id === "overview" && isWorker
      ? "Công việc của tôi"
      : active?.label || "Không gian làm việc";
  const orderProps = {
    orders: data?.orders || [],
    lines: data?.lines || [],
    session,
    api,
    onOpen: openOrder,
    onCreate: () => setCreate(true),
    onChanged: refresh,
  };
  const panel =
    active?.id === "guide" ? (
      <UserGuide user={session.user} />
    ) : active?.id === "overview" ? (
      <div className="stack">
        <div className="kpi-grid">
          {[
            {
              label: isWorker ? "Đơn trong chuyền" : "Đang sản xuất",
              value: data?.stats.orders.totalRunning || 0,
              hint: "Đơn hàng chưa hoàn thành",
              tab: "orders",
            },
            {
              label: "Cần chú ý",
              value:
                (data?.stats.orders.atRisk || 0) +
                (data?.stats.orders.delayed || 0),
              hint: `${data?.stats.orders.atRisk || 0} nguy cơ · ${data?.stats.orders.delayed || 0} trễ hạn`,
              tab: "orders",
            },
            {
              label: "Lượt công việc tháng",
              value: data?.stats.production.monthlyQty || 0,
              hint: `Tháng ${day().slice(0, 7)}`,
              tab: "production",
            },
            {
              label: hasPermission(session.user, "payroll.view")
                ? "Tiền công tháng"
                : "Đơn hoàn thành",
              value: hasPermission(session.user, "payroll.view")
                ? money(data?.stats.production.monthlyPay || 0)
                : data?.stats.orders.completed || 0,
              hint: hasPermission(session.user, "payroll.view")
                ? "Trong phạm vi được xem"
                : "Đã xuất xưởng",
              tab: hasPermission(session.user, "payroll.view")
                ? "payroll"
                : "orders",
            },
          ].map((card) => (
            <button
              className={`kpi-card ${typeof card.value === "string" ? "kpi-money" : ""}`}
              key={card.label}
              onClick={() =>
                setTab(
                  (isWorker && card.tab === "orders"
                    ? "overview"
                    : card.tab) as Tab,
                )
              }
            >
              <span>{card.label}</span>
              <strong>
                {typeof card.value === "number"
                  ? card.value.toLocaleString("vi-VN")
                  : card.value}
              </strong>
              <p>{card.hint}</p>
            </button>
          ))}
        </div>
        {!isWorker && hasPermission(session.user, "production.view") && (
          <DashboardInsights
            api={api}
            orders={data?.orders || []}
            lines={data?.lines || []}
            session={session}
          />
        )}
        {isWorker ? (
          <div className="stack">
            <input
              aria-label="Tìm công việc"
              placeholder="Tìm mã đơn, sản phẩm…"
              value={workSearch}
              onChange={(e) => {
                setWorkSearch(e.target.value);
                setWorkPage(1);
              }}
            />
            <Pagination
              page={currentWorkPage}
              total={workerOrders.length}
              pageSize={12}
              onChange={setWorkPage}
            />
            <div className="operations-grid">
              {workerOrders
                .slice((currentWorkPage - 1) * 12, currentWorkPage * 12)
                .map((o) => (
                  <article className="panel padded stack" key={o.id}>
                    <div className="card-top">
                      <strong>{o.id}</strong>
                      <span className="muted">
                        {
                          LUUTA_STAGES.find((s) => s.key === o.current_stage)
                            ?.label
                        }
                      </span>
                    </div>
                    <h2>{o.product_name}</h2>
                    <p className="muted">
                      {o.total_quantity} sản phẩm · Chuyền {o.line_id}
                    </p>
                    {!(data?.employees || []).some((e) =>
                      canRecordProduction(session.user, e, o),
                    ) && (
                      <p className="muted">
                        Chỉ xem tiến độ · Chưa có quyền ghi nhận cho nhân viên
                        tại chuyền này.
                      </p>
                    )}
                    {!!o.work_items?.length && (
                      <ul className="work-progress-list">
                        {o.work_items.map((p) => (
                          <li key={p.id}>
                            <span>
                              {p.stage} · {p.name}
                            </span>
                            <strong>
                              {p.recorded_quantity || 0}/{o.total_quantity}
                            </strong>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="inline-actions">
                      {o.current_stage === "giao_hang" &&
                        availableOperations(session.user, o).some(
                          (a) => a.key === "deliver",
                        ) && (
                          <Action onClick={() => openOrder(o)}>
                            Ghi nhận giao hàng
                          </Action>
                        )}
                      {o.current_stage !== "giao_hang" &&
                        (data?.employees || []).some((e) =>
                          canRecordProduction(session.user, e, o),
                        ) && (
                          <Action
                            onClick={() => {
                              setProductionOrder(o.id);
                              setProduction(true);
                            }}
                          >
                            Ghi nhận công việc
                          </Action>
                        )}
                      <Action tone="secondary" onClick={() => openOrder(o)}>
                        Chi tiết và tiến độ
                      </Action>
                    </div>
                  </article>
                ))}
              {!data?.orders.some((o) => o.status !== "completed") && (
                <Empty>Chưa có công việc trong chuyền của bạn.</Empty>
              )}
            </div>
          </div>
        ) : (
          <OrderWorkspace {...orderProps} />
        )}
      </div>
    ) : active?.id === "orders" ? (
      <OrderWorkspace {...orderProps} />
    ) : active?.id === "lines" ? (
      <LinesPanel
        lines={data?.lines || []}
        orders={data?.orders || []}
        onOpen={openOrder}
      />
    ) : active?.id === "production" || active?.id === "payroll" ? (
      <RecordsPanel
        key={`${active.id}-${session.user.id}`}
        mode={active.id}
        api={api}
        session={session}
        employees={data?.employees || []}
        lines={data?.lines || []}
      />
    ) : active?.id === "qc" || active?.id === "delivery" ? (
      <OperationsPanel
        mode={active.id}
        orders={data?.orders || []}
        session={session}
        onOpen={openOrder}
      />
    ) : active?.id === "rates" ? (
      <RatesPanel
        orders={(data?.orders || []).filter((o) =>
          permits(session.user, "rates.manage", { lineId: o.line_id }),
        )}
        rates={rates}
        api={api}
        onSaved={refresh}
      />
    ) : active?.id === "users" || active?.id === "roles" ? (
      <AdminPanel
        key={active.id}
        mode={active.id}
        api={api}
        session={session}
        onRepresent={loadSession}
      />
    ) : active?.id === "backup" ? (
      <BackupPanel api={api} />
    ) : active?.id === "audit" ? (
      <AuditPanel api={api} />
    ) : (
      <Empty>Chưa có quyền truy cập phân hệ. Liên hệ admin.</Empty>
    );
  function renderNavigation(mobile: boolean) {
    return tabs.map((item) => {
      const Icon = item.icon;
      return (
        <button
          key={item.id}
          aria-current={active?.id === item.id ? "page" : undefined}
          onClick={() => {
            setTab(item.id);
            if (mobile) setSidebar(false);
          }}
        >
          <Icon size={20} />
          {item.label}
          {!mobile && active?.id === item.id && (
            <motion.span
              layoutId="nav-indicator"
              className="nav-indicator"
              transition={{ duration: 0.18 }}
            />
          )}
        </button>
      );
    });
  }
  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <aside className="sidebar">
          <Logo />
          <nav aria-label="Điều hướng chính">{renderNavigation(false)}</nav>
          <div className="sidebar-footer">
            LUUTA Garment<span>Không gian làm việc local</span>
          </div>
        </aside>
        <Modal
          open={sidebar}
          onClose={() => setSidebar(false)}
          title="Điều hướng"
          drawer
        >
          <Logo />
          <nav aria-label="Điều hướng điện thoại">{renderNavigation(true)}</nav>
        </Modal>
        <div className="app-main">
          <header className="app-header">
            <div className="inline-actions">
              <button
                className="icon-button mobile-menu"
                aria-label="Mở điều hướng"
                onClick={() => setSidebar(true)}
              >
                <Menu size={22} />
              </button>
              <span className="header-label">Không gian làm việc</span>
            </div>
            <button
              className="profile-button"
              onClick={() => setAccountOpen(true)}
            >
              <span className="avatar">{session.user.name.charAt(0)}</span>
              <span>
                {session.user.name}
                <small>
                  {session.user.roles.map((r) => r.name).join(", ")}
                </small>
              </span>
              <UserRound size={18} />
            </button>
          </header>
          {session.representing && (
            <div className="represent-banner">
              <span>
                <EyeBadge /> {session.actor.name} đang thao tác thay{" "}
                <strong>{session.user.name}</strong>
              </span>
              <Action
                tone="secondary"
                onClick={async () => {
                  try {
                    await api("/api/auth/stop-represent", {});
                    await loadSession();
                  } catch (e) {
                    setError(message(e));
                  }
                }}
              >
                <ArrowLeft size={18} />
                Thoát đại diện
              </Action>
            </div>
          )}
          <main>
            <div className="page-heading">
              <div>
                <h1>{title}</h1>
                <p>
                  {active?.id === "guide"
                    ? "Hướng dẫn từng bước, từ nhận đơn đến giao hàng và đối chiếu tiền công."
                    : isWorker
                      ? "Theo dõi công việc, sản lượng và tiền công trong phạm vi của bạn."
                      : "Theo dõi và điều phối hoạt động xưởng may."}
                </p>
              </div>
              <div className="inline-actions" hidden={active?.id === "guide"}>
                <Action
                  tone="secondary"
                  aria-label="Làm mới dữ liệu"
                  busy={loading}
                  onClick={() => {
                    setLoading(true);
                    void refresh();
                  }}
                >
                  <RefreshCw size={18} />
                  Làm mới
                </Action>
                {hasPermission(session.user, "production.create") && (
                  <Action
                    onClick={() => {
                      setProductionOrder("");
                      setProduction(true);
                    }}
                  >
                    <Plus size={18} />
                    {isWorker ? "Ghi nhận công việc" : "Nhập sản lượng"}
                  </Action>
                )}
              </div>
            </div>
            <ErrorNotice error={error} />
            <AnimatePresence mode="wait">
              <motion.div
                key={`${active?.id}-${session.user.id}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
              >
                {panel}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
        <AnimatePresence>
          {notice && (
            <motion.div
              className="toast"
              role="status"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
            >
              <CheckCircle2 size={20} />
              {notice}
              <button
                className="icon-button"
                aria-label="Đóng thông báo"
                onClick={() => setNotice("")}
              >
                <X size={18} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <Modal
          open={create}
          onClose={() => setCreate(false)}
          title="Tạo đơn hàng"
          description="Phân bổ sản phẩm theo màu và size."
          wide
        >
          {data && (
            <CreateOrderForm
              api={api}
              session={session}
              employees={data.employees}
              nextCode={data.nextCode}
              lines={data.lines.filter((l) =>
                permits(session.user, "orders.create", { lineId: l.id }),
              )}
              onSaved={() => saved(() => setCreate(false))}
            />
          )}
        </Modal>
        <Modal
          open={production}
          onClose={() => setProduction(false)}
          title={isWorker ? "Ghi nhận công việc" : "Nhập sản lượng"}
          description="Ghi nhận số lượng hoàn thành để tính tiền công."
          wide
        >
          {data ? (
            <ProductionForm
              api={api}
              initialOrderId={productionOrder}
              orders={data.orders}
              employees={data.employees}
              rates={rates}
              session={session}
              onSaved={(notice) => saved(() => setProduction(false), notice)}
            />
          ) : (
            <Empty>Chưa có dữ liệu nhập sản lượng.</Empty>
          )}
        </Modal>
        <Modal
          open={!!selected}
          onClose={() => setSelected(null)}
          title={`Chi tiết đơn ${selected?.id || ""}`}
          description="Số lượng theo từng màu–size và quy trình sản xuất."
          wide
        >
          {selected && (
            <OrderDetail
              key={selected.id}
              order={selected}
              session={session}
              api={api}
              lines={data?.lines || []}
              employees={data?.employees || []}
              onChanged={reloadDetail}
            />
          )}
        </Modal>
        <Modal
          open={accountOpen}
          onClose={() => setAccountOpen(false)}
          title="Tài khoản của tôi"
          description={session.user.username}
        >
          <div className="stack">
            <div>
              <strong>{session.user.name}</strong>
              <p className="muted">
                {session.user.roles.map((r) => r.name).join(", ")}
              </p>
            </div>
            {!session.representing && (
              <PasswordForm
                api={api}
                onChanged={() => {
                  unauthorized();
                }}
              />
            )}
            <Action tone="secondary" onClick={logout}>
              <LogOut size={18} />
              Đăng xuất
            </Action>
          </div>
        </Modal>
      </div>
    </MotionConfig>
  );
}
function EyeBadge() {
  return <UserRound size={20} />;
}
function PasswordForm({ api, onChanged }: { api: Api; onChanged: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/password", {
        currentPassword: form.get("current"),
        newPassword: form.get("new"),
      });
      onChanged();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit(new FormData(event.currentTarget));
      }}
      className="stack"
    >
      <h3>Đổi mật khẩu</h3>
      <ErrorNotice error={error} />
      <Field label="Mật khẩu hiện tại">
        <input
          name="current"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          required
        />
      </Field>
      <Field label="Mật khẩu mới (ít nhất 10 ký tự)">
        <input
          name="new"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={128}
          required
        />
      </Field>
      <Action busy={busy} type="submit">
        <KeyRound size={18} />
        Đổi mật khẩu và đăng nhập lại
      </Action>
    </form>
  );
}
