import { permits, type Account } from "./permissions";
import type { Order, OrderVariant } from "./types";
interface Variant extends OrderVariant {
  qc_inspected_qty: number;
  defect_qty: number;
  reworked_qty: number;
  reinspected_qty: number;
  repassed_qty: number;
}
const nextStages: Record<Order["current_stage"], Order["current_stage"][]> = {
  nhan_don: ["kiem_npl"],
  kiem_npl: ["kiem_rap"],
  kiem_rap: ["cat"],
  cat: ["may"],
  may: ["qc"],
  qc: ["sua_hang", "dong_goi"],
  sua_hang: ["qc_lai"],
  qc_lai: ["sua_hang", "dong_goi"],
  dong_goi: ["giao_hang"],
  giao_hang: ["hoan_thanh"],
  hoan_thanh: [],
};
export function transitionProblem(
  order: Order,
  target: Order["current_stage"],
): string | null {
  if (!nextStages[order.current_stage].includes(target))
    return "Chỉ được chuyển sang công đoạn kế tiếp trong quy trình.";
  const variants = order.variants as Variant[];
  if (target === "may" && variants.some((v) => v.cut_qty < v.quantity))
    return "Cần cắt đủ từng màu–size trước khi chuyển may.";
  if (target === "qc" && variants.some((v) => v.sewn_qty < v.quantity))
    return "Cần may đủ từng màu–size trước khi chuyển QC.";
  if (
    target === "sua_hang" &&
    !variants.some((v) => v.qc_inspected_qty - v.qc_passed_qty > 0)
  )
    return variants.every((v) => v.qc_passed_qty >= v.quantity)
      ? "QC đã đạt đủ, không có sản phẩm lỗi cần sửa. Hãy chuyển thẳng sang Đóng gói."
      : "Không có sản phẩm lỗi cần sửa. Hãy kiểm QC đủ số lượng trước khi chuyển sang Đóng gói.";
  if (
    target === "qc_lai" &&
    variants.some(
      (v) => v.reworked_qty < v.defect_qty + v.reinspected_qty - v.repassed_qty,
    )
  )
    return "Cần sửa hết sản phẩm lỗi trước khi QC lại.";
  if (
    target === "dong_goi" &&
    variants.some((v) => v.qc_passed_qty < v.quantity)
  )
    return "QC chưa đạt đủ từng màu–size.";
  if (target === "giao_hang" && variants.some((v) => v.packed_qty < v.quantity))
    return "Cần đóng gói đủ trước khi giao hàng.";
  if (
    target === "hoan_thanh" &&
    variants.some((v) => v.delivered_qty < v.quantity)
  )
    return "Chưa giao đủ từng màu–size.";
  return null;
}

export function exceptionalTransitionProblem(
  order: Order,
  target: Order["current_stage"],
): string | null {
  if (target === order.current_stage) return "Đơn đã ở bước này.";
  if (
    target === "dong_goi" &&
    (order.variants || []).some((v) => v.qc_passed_qty < v.quantity)
  )
    return "QC chưa đạt đủ từng màu–size; không thể chuyển đóng gói.";
  if (
    target === "giao_hang" &&
    (order.variants || []).some((v) => v.packed_qty < v.quantity)
  )
    return "Cần đóng gói đủ trước khi giao hàng.";
  if (
    target === "hoan_thanh" &&
    (order.variants || []).some((v) => v.delivered_qty < v.quantity)
  )
    return "Chưa giao đủ từng màu–size; không thể đánh dấu hoàn thành.";
  return null;
}

export function transitionPermissionProblem(
  user: Account,
  order: Order,
): string | null {
  const scope = { lineId: order.line_id };
  if (!permits(user, "orders.move", scope))
    return "Bạn không có quyền chuyển công đoạn.";
  if (["qc", "sua_hang", "qc_lai"].includes(order.current_stage))
    return permits(user, "qc.manage", scope)
      ? null
      : "Cần quyền QC để chuyển công đoạn này.";
  if (["dong_goi", "giao_hang"].includes(order.current_stage))
    return permits(user, "delivery.manage", scope)
      ? null
      : "Cần quyền giao hàng để chuyển công đoạn này.";
  return permits(user, "production.create", scope) ||
    permits(user, "orders.edit", scope)
    ? null
    : "Cần quyền quản lý sản xuất để chuyển công đoạn này.";
}

export const OPERATION_ACTIONS = [
  { key: "qc", label: "Kiểm QC", stage: "qc", permission: "qc.manage" },
  {
    key: "rework",
    label: "Sửa hàng",
    stage: "sua_hang",
    permission: "qc.manage",
  },
  {
    key: "reinspect",
    label: "QC lại",
    stage: "qc_lai",
    permission: "qc.manage",
  },
  {
    key: "pack",
    label: "Đóng gói",
    stage: "dong_goi",
    permission: "delivery.manage",
  },
  {
    key: "deliver",
    label: "Giao hàng",
    stage: "giao_hang",
    permission: "delivery.manage",
  },
] as const;
export function availableOperations(user: Account, order: Order) {
  return OPERATION_ACTIONS.filter(
    (a) =>
      a.stage === order.current_stage &&
      (permits(user, a.permission, { lineId: order.line_id }) ||
        (a.key === "deliver" &&
          !!user.employee_id &&
          user.line_ids.includes(order.line_id) &&
          permits(user, "delivery.record", { lineId: order.line_id }))),
  );
}
export function remainingOperation(
  v: OrderVariant | undefined,
  action: string | undefined,
) {
  if (!v) return 0;
  const n = v as Variant;
  return Math.max(
    0,
    action === "qc"
      ? n.sewn_qty - (n.qc_inspected_qty || 0)
      : action === "reinspect"
        ? (n.reworked_qty || 0) - (n.reinspected_qty || 0)
        : action === "rework"
          ? (n.defect_qty || 0) +
            (n.reinspected_qty || 0) -
            (n.repassed_qty || 0) -
            (n.reworked_qty || 0)
          : action === "pack"
            ? n.qc_passed_qty - n.packed_qty
            : action === "deliver"
              ? n.packed_qty - n.delivered_qty
              : 0,
  );
}
