import type { DepartmentId } from "./departments";
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
  color_hex?: string | null;
  colors?: { name: string; hex: string; alpha?: number }[];
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
  received_at?: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
}

export interface WorkItem {
  recorded_quantity?: number;
  id: number;
  order_id: string;
  stage: string;
  name: string;
}

export interface PreparationFile {
  url: string;
  name: string;
  size: number;
}
export interface PreparationCheck {
  id: number;
  order_id: string;
  stage: "kiem_npl" | "kiem_rap";
  result: "dat" | "dat_co_ghi_chu" | "khong_dat";
  defect_qty: number;
  notes: string;
  pattern_version: string;
  sizes_checked: string;
  pieces_expected: number | null;
  pieces_received: number | null;
  measurements: PatternMeasurement[];
  /** "text": written assessment; "photo": photo of the filled sheet; "file": attached PDF/Excel/Word. */
  mode: "measure" | "text" | "photo" | "file";
  files: PreparationFile[];
  /** Sample stage the measurements belong to; "" when not recorded. */
  phase: "" | "rap_thu" | "fit" | "pps" | "bulk";
  unit: "inch" | "cm";
  photos: string[];
  checked_by: string | null;
  checked_by_name?: string | null;
  approved_by: string | null;
  approved_by_name?: string | null;
  checked_on: string;
  created_at: string;
}
/** One row of a POM chart: a point of measure with its tolerance and the standard value per size. */
export interface PatternPom {
  code: string;
  point: string;
  tolerance: number;
  values: Record<string, number>;
}
export interface PatternSheet {
  unit: "inch" | "cm";
  sizes: string[];
  base_size: string;
  poms: PatternPom[];
}
export interface PatternMeasurement {
  code?: string;
  point: string;
  size: string;
  spec: number;
  actual: number;
  tolerance: number;
}
export interface OrderPhoto {
  id: number;
  image_url: string;
  color: string;
  position: number;
}
export interface Order {
  photos?: OrderPhoto[];
  checks?: PreparationCheck[];
  pattern_sheet?: PatternSheet | null;
  work_items?: WorkItem[];
  risk_reason?: string;
  delivered_complete?: boolean;
  version: number;
  id: string;
  customer: string;
  product_code: string;
  product_name: string;
  image_url: string | null;
  total_quantity: number;
  line_id: number | null; // 1 to 5
  order_date: string;
  deadline: string;
  priority: "normal" | "high" | "urgent";
  responsible_id?: string | null;
  assigned_to: string;
  current_stage: StageKey;
  progress: number; // 0 - 100
  status: "on_track" | "at_risk" | "delayed" | "completed";
  notes: string | null;
  reason?: string | null;
  created_at: string;
  variants?: OrderVariant[];
  stages?: OrderStage[];
  operations?: {
    id: number;
    action: string;
    color: string;
    size: string;
    quantity: number;
    packages: number;
    operation_date: string;
    operation_time?: string | null;
    image_url?: string | null;
    worker_name: string;
    notes: string;
    reason?: string | null;
    created_at?: string;
  }[];
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
  department_ids?: DepartmentId[];
  active?: number;
  has_account?: boolean;
  assigned_line_ids?: number[];
  id: string;
  name: string;
  line_id: number | null;
  role: string;
  phone: string;
}

export interface ProductionLog {
  department_id?: DepartmentId | null;
  reason?: string | null;
  actor_id?: string | null;
  work_item_id?: number | null;
  work_item_name?: string | null;
  completed_quantity?: number | null;
  product_code?: string;
  id?: number;
  log_date: string; // YYYY-MM-DD
  employee_id: string;
  employee_name: string;
  line_id: number | null;
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
  version?: number;
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
