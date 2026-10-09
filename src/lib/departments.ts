import type { Account } from "./permissions";

export const DEPARTMENTS = [
  { id: "management", name: "Quản lý" },
  { id: "cutting", name: "Cắt" },
  { id: "sewing", name: "May" },
  { id: "quality", name: "QC" },
  { id: "packing", name: "Đóng gói" },
  { id: "delivery", name: "Giao hàng" },
] as const;
export type DepartmentId = (typeof DEPARTMENTS)[number]["id"];
export const departmentName = (id?: string | null) =>
  DEPARTMENTS.find((d) => d.id === id)?.name || "Chưa phân loại";
export function departmentFor(stage: string): DepartmentId {
  if (["cat", "Cắt"].includes(stage)) return "cutting";
  // Repairs are done by sewers; QC only inspects and re-inspects.
  if (["may", "May", "sua_hang", "Sửa hàng", "rework"].includes(stage))
    return "sewing";
  if (["qc", "qc_lai", "QC", "reinspect"].includes(stage)) return "quality";
  if (["dong_goi", "Đóng gói", "pack"].includes(stage)) return "packing";
  if (["giao_hang", "Giao hàng", "deliver"].includes(stage)) return "delivery";
  // Material and pattern checks happen before cutting: QC checks fabric, cutters check patterns.
  if (["kiem_npl", "Kiểm NPL/Vải"].includes(stage)) return "quality";
  if (["kiem_rap", "Kiểm rập"].includes(stage)) return "cutting";
  return "management";
}
export const isAdmin = (user: Account) =>
  user.roles.some((r) => r.id === "admin");
export const isManagement = (user: Account) =>
  isAdmin(user) || !!user.department_ids?.includes("management");
export function departmentAccess(user: Account, department: string) {
  return (
    isManagement(user) ||
    !!user.department_ids?.includes(department as DepartmentId)
  );
}
export const isOperator = (user: Account) =>
  isAdmin(user) ||
  (user.roles.some((r) => r.id !== "worker") && !!user.department_ids?.length);
