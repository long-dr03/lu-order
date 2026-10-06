export const PERMISSIONS = {
  "orders.view": "Xem đơn hàng",
  "orders.create": "Tạo đơn hàng",
  "orders.edit": "Sửa đơn hàng",
  "orders.override": "Chuyển bước ngoại lệ (quay lại / nhảy bước)",
  "orders.move": "Chuyển công đoạn",
  "orders.assign": "Phân chuyền",
  "production.view": "Xem sản lượng",
  "production.create": "Nhập sản lượng",
  "rates.manage": "Cấu hình đơn giá",
  "qc.view": "Xem QC",
  "qc.manage": "Ghi nhận QC và sửa hàng",
  "delivery.view": "Xem giao hàng",
  "delivery.record": "Nhân viên ghi nhận giao hàng của mình",
  "delivery.manage": "Đóng gói và giao hàng",
  "payroll.view": "Xem lương",
  "payroll.adjust": "Điều chỉnh sản lượng/tiền công có lịch sử",
  "payroll.lock": "Chốt lương",
  "export.data": "Xuất Excel",
  "audit.view": "Xem nhật ký",
  "users.manage": "Quản lý tài khoản",
  "roles.manage": "Quản lý vai trò",
  "users.represent": "Thao tác thay nhân viên",
} as const;
export type Permission = keyof typeof PERMISSIONS;
export type Scope = "self" | "lines" | "all";
export const SCOPE_LABELS: Record<Scope, string> = {
  self: "Cá nhân",
  lines: "Chuyền được giao",
  all: "Toàn xưởng",
};
export function scopesForPermission(permission: Permission): Scope[] {
  if (
    permission.startsWith("users.") ||
    permission === "roles.manage" ||
    permission === "payroll.lock"
  )
    return ["all"];
  if (
    permission.startsWith("orders.") ||
    permission.startsWith("qc.") ||
    permission.startsWith("delivery.") ||
    permission === "rates.manage" ||
    permission === "payroll.adjust"
  )
    return ["lines", "all"];
  return ["self", "lines", "all"];
}
export interface Grant {
  permission: Permission;
  scope: Scope;
}
export interface Role {
  id: string;
  name: string;
  position: number;
  grants: Grant[];
  protected: number;
}
export interface Account {
  id: string;
  username: string;
  name: string;
  status: "pending" | "active" | "locked";
  employee_id: string | null;
  line_ids: number[];
  must_change_password: number;
  roles: Role[];
}
export interface SessionInfo {
  user: Account;
  actor: { id: string; name: string };
  representing: boolean;
  permissions: Grant[];
  csrf: string;
}
export function grantsFor(user: Account): Grant[] {
  return user.roles.flatMap((role) => role.grants);
}
export function hasPermission(user: Account, permission: Permission) {
  return grantsFor(user).some((g) => g.permission === permission);
}
export function permits(
  user: Account,
  permission: Permission,
  resource: { employeeId?: string | null; lineId?: number } = {},
) {
  return grantsFor(user).some(
    (g) =>
      g.permission === permission &&
      (g.scope === "all" ||
        (g.scope === "self" &&
          !!user.employee_id &&
          resource.employeeId === user.employee_id) ||
        (g.scope === "lines" &&
          resource.lineId !== undefined &&
          user.line_ids.includes(resource.lineId))),
  );
}
export const permissionGroups = [
  { label: "Đơn hàng", prefix: "orders." },
  { label: "Sản xuất", prefix: "production." },
  { label: "Đơn giá", prefix: "rates." },
  { label: "Chất lượng", prefix: "qc." },
  { label: "Giao hàng", prefix: "delivery." },
  { label: "Lương", prefix: "payroll." },
  { label: "Xuất dữ liệu", prefix: "export." },
  { label: "Nhật ký", prefix: "audit." },
  { label: "Quản trị", prefix: "users." },
  { label: "Vai trò", prefix: "roles." },
];

export function canRecordProduction(
  user: Account,
  employee: { id: string; line_id: number; assigned_line_ids?: number[] },
  order: { line_id: number },
) {
  return (
    (employee.line_id === order.line_id ||
      employee.assigned_line_ids?.includes(order.line_id) ||
      (employee.id === user.employee_id &&
        user.line_ids.includes(order.line_id))) &&
    permits(user, "production.create", {
      employeeId: employee.id,
      lineId: order.line_id,
    }) &&
    (grantsFor(user).some(
      (g) => g.permission === "production.create" && g.scope === "all",
    ) ||
      user.line_ids.includes(order.line_id))
  );
}
