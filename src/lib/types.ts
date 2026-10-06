export const LUUTA_STAGES = [
  { key: "nhan_don", label: "Nhận đơn", step: 1 },
  { key: "kiem_npl", label: "Kiểm NPL/Vải", step: 2 },
  { key: "kiem_rap", label: "Kiểm rập", step: 3 },
  { key: "cat", label: "Cắt", step: 4 },
  { key: "may", label: "May", step: 5 },
  { key: "qc", label: "QC", step: 6 },
  { key: "sua_hang", label: "Sửa hàng", step: 7 },
  { key: "qc_lai", label: "QC lại", step: 8 },
  { key: "dong_goi", label: "Đóng gói", step: 9 },
  { key: "giao_hang", label: "Giao hàng", step: 10 },
  { key: "hoan_thanh", label: "Hoàn thành", step: 11 },
] as const;

export type StageKey = (typeof LUUTA_STAGES)[number]["key"];

export interface OrderVariant {
  id?: number;
  order_id: string;
  color: string;
  size: string; // XS, S, M, L, XL, XXL
  quantity: number;
  cut_qty: number;
  sewn_qty: number;
  qc_passed_qty: number;
  packed_qty: number;
  delivered_qty: number;
}

export interface OrderStage {
  id?: number;
  order_id: string;
  stage_key: StageKey;
  stage_name: string;
  status: "pending" | "in_progress" | "completed" | "has_issue";
  assignee: string | null;
  received_qty: number;
  completed_qty: number;
  remaining_qty: number;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
}

export interface Order {
  id: string;
  customer: string;
  product_code: string;
  product_name: string;
  image_url: string | null;
  total_quantity: number;
  line_id: number; // 1 to 5
  order_date: string;
  deadline: string;
  priority: "normal" | "high" | "urgent";
  assigned_to: string;
  current_stage: StageKey;
  progress: number; // 0 - 100
  status: "on_track" | "at_risk" | "delayed" | "completed";
  notes: string | null;
  created_at: string;
  variants?: OrderVariant[];
  stages?: OrderStage[];
}

export interface Line {
  id: number;
  name: string;
  leader_name: string;
  workers_count: number;
  capacity_per_day: number;
  activeOrders?: number;
  totalRemainingQty?: number;
  daysNeeded?: number;
  isOverloaded?: boolean;
}

export interface Employee {
  id: string;
  name: string;
  line_id: number;
  role: string;
  phone: string;
}

export interface ProductionLog {
  id?: number;
  log_date: string; // YYYY-MM-DD
  employee_id: string;
  employee_name: string;
  line_id: number;
  order_id: string;
  product_name: string;
  color: string;
  size: string;
  stage: string;
  quantity: number;
  unit_price: number;
  total_pay: number;
  updated_by: string;
  month: string; // YYYY-MM
  is_locked: number;
  created_at?: string;
}

export interface AuditLog {
  id?: number;
  user_name: string;
  action: string;
  details: string;
  created_at?: string;
}

export interface QcRecord {
  id?: number;
  order_id: string;
  color: string;
  size: string;
  inspected_qty: number;
  passed_qty: number;
  defect_qty: number;
  defect_type: string | null;
  rework_qty: number;
  reinspected_qty: number;
  repassed_qty: number;
  inspector: string;
  created_at?: string;
}
